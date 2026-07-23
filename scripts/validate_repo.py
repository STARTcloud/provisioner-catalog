#!/usr/bin/env python3
"""Deep-validate provisioner repositories against the catalog artifact contract.

Used three ways, all running the exact same checks:

  - by action.yml, the reusable validation action authors run in their own CI:
        python3 -m scripts.validate_repo --repo owner/name
  - by checks.yml against the ONE repository an admission PR adds (the
    candidate extracted by scripts.changed.repo);
  - imported by scripts.build_catalog and the scripts.check.* admission
    checks for the shared release/asset/manifest helpers.

Checks per repository:

  - at least one published (non-draft, non-prerelease) release carrying a
    versioned ``<name>-<version>.tar.gz`` asset
  - for each family's LATEST version: the archive is registry-shaped
    (everything under ``<name>/<version>/``), contains a parseable
    provisioner.yml whose name/version match the directory and the asset
    filename, ships the required templates/Hosts.template.yml, and passes an
    archive-content safety scan (no absolute paths, no ``..`` traversal, no
    links escaping the package root, member/size caps)
  - the ``<asset>.sha256`` sidecar matches the asset. A WRONG sidecar is an
    ERROR; a MISSING sidecar is a WARNING — sidecars are required for new
    admissions, but the first admitted repository predates the requirement.

Exit code 0 = valid (warnings allowed); 1 = errors found.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import os
import posixpath
import re
import sys
import tarfile
import urllib.error
import urllib.request

import yaml

API_ROOT = "https://api.github.com"
USER_AGENT = "STARTcloud-provisioner-catalog"

# <name>-<version>.tar.gz — the immutable versioned asset. The mutable
# version-less "latest" alias (<name>.tar.gz) never matches.
ASSET_RE = re.compile(
    r"^(?P<name>[A-Za-z0-9._-]+?)-(?P<version>[0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.+-]*)\.tar\.gz$"
)
SEMVER_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.+-]*$")
REPO_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/[A-Za-z0-9._-]+$")

MAX_ARCHIVE_BYTES = 2 * 1024**3   # compressed download cap per asset
MAX_EXTRACT_BYTES = 8 * 1024**3   # decompressed total cap (bomb guard)
MAX_MEMBERS = 200_000             # member-count cap (bomb guard)
MAX_SIDECAR_BYTES = 64 * 1024


class Reporter:
    """Collects findings and mirrors them as GitHub annotations in CI."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self._ci = os.environ.get("GITHUB_ACTIONS") == "true"

    def error(self, msg: str) -> None:
        self.errors.append(msg)
        print(f"::error::{msg}" if self._ci else f"ERROR: {msg}", flush=True)

    def warning(self, msg: str) -> None:
        self.warnings.append(msg)
        print(f"::warning::{msg}" if self._ci else f"WARNING: {msg}", flush=True)

    def info(self, msg: str) -> None:
        print(msg, flush=True)


def _open_url(url: str, token: str | None = None, accept: str | None = None):
    headers = {"User-Agent": USER_AGENT}
    if accept:
        headers["Accept"] = accept
    if token and url.startswith(API_ROOT):
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    return urllib.request.urlopen(request, timeout=60)


def gh_api_json(url: str, token: str | None):
    """GET one GitHub API URL, returning (parsed JSON, next-page URL or None)."""
    import json as _json

    with _open_url(url, token, accept="application/vnd.github+json") as response:
        payload = _json.loads(response.read().decode("utf-8"))
        next_url = None
        for part in (response.headers.get("Link") or "").split(","):
            if 'rel="next"' in part:
                next_url = part.split(";")[0].strip().strip("<>")
        return payload, next_url


def list_releases(repo: str, token: str | None) -> list[dict]:
    """All published (non-draft, non-prerelease) releases, newest first."""
    releases: list[dict] = []
    url = f"{API_ROOT}/repos/{repo}/releases?per_page=100"
    while url:
        page, url = gh_api_json(url, token)
        releases.extend(page)
    return [r for r in releases if not r.get("draft") and not r.get("prerelease")]


def _read_capped(response, cap: int, url: str) -> bytes:
    buffer = io.BytesIO()
    while True:
        chunk = response.read(1024 * 1024)
        if not chunk:
            break
        buffer.write(chunk)
        if buffer.tell() > cap:
            raise RuntimeError(f"download exceeds {cap} bytes: {url}")
    return buffer.getvalue()


def download_bytes(url: str, cap: int = MAX_ARCHIVE_BYTES) -> bytes:
    """Download a release asset fully into memory, enforcing the size cap."""
    with _open_url(url) as response:
        return _read_capped(response, cap, url)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802
        return None


def download_release_asset(asset: dict, token: str | None, cap: int = MAX_ARCHIVE_BYTES) -> bytes:
    """Download a release asset, private-repo aware.

    Anonymous, the browser_download_url works. With a token, go through the
    API asset endpoint instead — GitHub 302s that to a signed CDN URL which
    REJECTS an Authorization header, so the redirect is caught manually and
    followed bare. This is what lets private provisioner repos run the
    validation action with their own workflow token.
    """
    if not token:
        return download_bytes(asset["browser_download_url"], cap=cap)
    request = urllib.request.Request(
        asset["url"],
        headers={
            "User-Agent": USER_AGENT,
            "Authorization": f"Bearer {token}",
            "Accept": "application/octet-stream",
        },
    )
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=60) as response:
            return _read_capped(response, cap, asset["url"])
    except urllib.error.HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            location = exc.headers.get("Location")
            if not location:
                raise RuntimeError(f"redirect without Location from {asset['url']}") from exc
            return download_bytes(location, cap=cap)
        raise


def stream_sha256(url: str, cap: int = MAX_ARCHIVE_BYTES) -> str:
    """sha256 an asset without retaining its bytes (for non-latest versions)."""
    digest = hashlib.sha256()
    total = 0
    with _open_url(url) as response:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > cap:
                raise RuntimeError(f"download exceeds {cap} bytes: {url}")
            digest.update(chunk)
    return digest.hexdigest()


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_sidecar(text: str) -> str | None:
    """Extract the sha256 from a sidecar (sha256sum format: 'HEX  filename')."""
    for line in text.splitlines():
        token = line.strip().split()[0].lower() if line.strip() else ""
        if re.fullmatch(r"[a-f0-9]{64}", token):
            return token
    return None


def semver_key(version: str):
    """Sort key: release > prerelease of the same triple, then lexical suffix."""
    match = re.match(r"^([0-9]+)\.([0-9]+)\.([0-9]+)(.*)$", version)
    if not match:
        return (0, 0, 0, 0, version)
    major, minor, patch, suffix = match.groups()
    return (int(major), int(minor), int(patch), 0 if suffix else 1, suffix)


def collect_assets(releases: list[dict]) -> dict[str, dict[str, dict]]:
    """Group versioned assets by family: {name: {version: entry}}.

    Entry = {"asset": <asset dict>, "sidecar": <asset dict or None>,
    "tag": <release tag>}. Releases arrive newest-first; the first occurrence
    of a (family, version) pair wins.
    """
    families: dict[str, dict[str, dict]] = {}
    for release in releases:
        assets_by_name = {a["name"]: a for a in release.get("assets", [])}
        for asset_name, asset in assets_by_name.items():
            match = ASSET_RE.match(asset_name)
            if not match:
                continue
            family = match.group("name")
            version = match.group("version")
            families.setdefault(family, {}).setdefault(
                version,
                {
                    "asset": asset,
                    "sidecar": assets_by_name.get(f"{asset_name}.sha256"),
                    "tag": release.get("tag_name", ""),
                },
            )
    return families


def scan_archive(data: bytes, family: str, version: str, rep: Reporter, ctx: str) -> dict | None:
    """Safety-scan a registry-shaped archive and return its parsed manifest.

    Enforces: every member lives under <family>/<version>/, no absolute or
    ``..`` paths, no links escaping the package root, member/size caps, the
    manifest and the required Hosts.template.yml both present, manifest
    name/version matching the archive layout. Returns None when any ERROR was
    reported.
    """
    root = f"{family}/{version}"
    manifest_bytes = None
    has_template = False
    failed = False
    member_count = 0
    total_size = 0

    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            for member in archive:
                member_count += 1
                if member_count > MAX_MEMBERS:
                    rep.error(f"{ctx}: archive exceeds {MAX_MEMBERS} members")
                    return None
                name = member.name
                parts = name.split("/")
                if name.startswith("/") or re.match(r"^[A-Za-z]:", name) or ".." in parts:
                    rep.error(f"{ctx}: unsafe member path '{name}'")
                    return None
                stripped = name.rstrip("/")
                if stripped not in (family, root) and not stripped.startswith(root + "/"):
                    rep.error(
                        f"{ctx}: not registry-shaped — member '{name}' lives outside '{root}/'"
                    )
                    return None
                if member.issym() or member.islnk():
                    target = member.linkname
                    resolved = posixpath.normpath(
                        posixpath.join(posixpath.dirname(stripped), target)
                    )
                    if target.startswith("/") or not resolved.startswith(root + "/"):
                        rep.error(f"{ctx}: link '{name}' escapes the package root -> '{target}'")
                        return None
                    rep.warning(f"{ctx}: link member '{name}' (agents do not materialize links)")
                if member.isreg():
                    total_size += member.size
                    if total_size > MAX_EXTRACT_BYTES:
                        rep.error(f"{ctx}: decompressed size exceeds {MAX_EXTRACT_BYTES} bytes")
                        return None
                    if stripped == f"{root}/provisioner.yml":
                        extracted = archive.extractfile(member)
                        manifest_bytes = extracted.read() if extracted else None
                    elif stripped == f"{root}/templates/Hosts.template.yml":
                        has_template = True
    except (tarfile.TarError, EOFError, OSError) as exc:
        rep.error(f"{ctx}: not a readable tar.gz archive ({exc})")
        return None

    if manifest_bytes is None:
        rep.error(f"{ctx}: provisioner.yml missing at '{root}/provisioner.yml'")
        return None
    if not has_template:
        rep.error(f"{ctx}: required template missing at '{root}/templates/Hosts.template.yml'")
        failed = True

    try:
        manifest = yaml.safe_load(manifest_bytes)
    except yaml.YAMLError as exc:
        rep.error(f"{ctx}: provisioner.yml is not parseable YAML ({exc})")
        return None
    if not isinstance(manifest, dict):
        rep.error(f"{ctx}: provisioner.yml is not a mapping")
        return None

    manifest_name = str(manifest.get("name", ""))
    manifest_version = str(manifest.get("version", ""))
    if manifest_name != family:
        rep.error(f"{ctx}: manifest name '{manifest_name}' does not match archive family '{family}'")
        failed = True
    if manifest_version != version:
        rep.error(
            f"{ctx}: manifest version '{manifest_version}' does not match archive version '{version}'"
        )
        failed = True
    if not SEMVER_RE.match(version):
        rep.error(f"{ctx}: version '{version}' is not semver-shaped")
        failed = True
    if not str(manifest.get("description") or "").strip():
        rep.warning(f"{ctx}: manifest has no description (the catalog will show an empty one)")
    if not str(manifest.get("label") or "").strip():
        rep.warning(f"{ctx}: manifest has no label")

    return None if failed else manifest


def verify_sidecar(entry: dict, digest: str, rep: Reporter, ctx: str, token: str | None) -> None:
    """ERROR on a wrong sidecar, WARNING on a missing one (see module docstring)."""
    asset_name = entry["asset"]["name"]
    sidecar = entry["sidecar"]
    if sidecar is None:
        rep.warning(
            f"{ctx}: no '{asset_name}.sha256' sidecar asset — sidecars are required for new admissions"
        )
        return
    try:
        text = download_release_asset(sidecar, token, cap=MAX_SIDECAR_BYTES).decode(
            "utf-8", errors="replace"
        )
    except (urllib.error.URLError, RuntimeError, OSError) as exc:
        rep.error(f"{ctx}: sidecar download failed ({exc})")
        return
    expected = parse_sidecar(text)
    if expected is None:
        rep.error(f"{ctx}: sidecar '{asset_name}.sha256' contains no sha256")
    elif expected != digest:
        rep.error(f"{ctx}: sidecar sha256 mismatch (sidecar {expected}, asset {digest})")


def validate_repository(repo: str, token: str | None, rep: Reporter) -> None:
    if not REPO_RE.match(repo):
        rep.error(f"'{repo}' is not a valid owner/name repository reference")
        return

    try:
        releases = list_releases(repo, token)
    except urllib.error.HTTPError as exc:
        rep.error(f"{repo}: GitHub API error listing releases ({exc.code} {exc.reason})")
        return
    except (urllib.error.URLError, OSError) as exc:
        rep.error(f"{repo}: could not reach the GitHub API ({exc})")
        return

    if not releases:
        rep.error(f"{repo}: no published releases (drafts and prereleases do not count)")
        return

    families = collect_assets(releases)
    if not families:
        rep.error(f"{repo}: no versioned '<name>-<version>.tar.gz' release assets found")
        return

    # Lazy import: scripts.quality imports helpers from this module.
    from scripts import quality

    workflows_text = quality.fetch_workflows_text(repo, token)

    for family in sorted(families):
        versions = families[family]
        latest = max(versions, key=semver_key)
        entry = versions[latest]
        ctx = f"{repo} {family}-{latest}"
        rep.info(f"{repo}: family '{family}' has {len(versions)} version(s); deep-validating {latest}")
        try:
            data = download_release_asset(entry["asset"], token)
        except (urllib.error.URLError, RuntimeError, OSError) as exc:
            rep.error(f"{ctx}: asset download failed ({exc})")
            continue
        digest = sha256_hex(data)
        verify_sidecar(entry, digest, rep, ctx, token)
        manifest = scan_archive(data, family, latest, rep, ctx)

        # Informational: the measured quality tier this family would show in
        # the catalog. Grading never gates admission — the checks above do.
        rules = quality.evaluate_rules(
            family,
            manifest,
            quality.archive_member_names(data),
            list(versions),
            releases,
            workflows_text,
            latest,
        )
        tier = quality.measured_tier(rules)
        failed = quality.failed_rules(rules)
        rep.info(f"{ctx}: measured quality tier: {tier}")
        if failed:
            rep.info(f"{ctx}: unmet quality rules: {', '.join(failed)}")


def validate_tree(path: str, rep: Reporter) -> None:
    """Validate a WORKING TREE against the manifest side of the contract.

    The hassfest-style pre-release check: catches a malformed manifest in the
    PR, before a bad release ever exists. Archive shape, sidecars and
    checksums can only be checked against published releases (--repo).
    """
    from scripts import quality

    manifest_path = os.path.join(path, "provisioner.yml")
    if not os.path.isfile(manifest_path):
        rep.error(f"{manifest_path}: not found — --tree expects the package root")
        return
    try:
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = yaml.safe_load(handle)
    except (OSError, yaml.YAMLError) as exc:
        rep.error(f"{manifest_path}: not parseable YAML ({exc})")
        return
    if not isinstance(manifest, dict):
        rep.error(f"{manifest_path}: not a mapping")
        return

    name = str(manifest.get("name", ""))
    version = str(manifest.get("version", ""))
    if not re.match(r"^[A-Za-z0-9._-]+$", name):
        rep.error(
            f"{manifest_path}: name '{name}' is not a family slug — the display "
            "string belongs in 'label:', the slug in 'name:'"
        )
    if not SEMVER_RE.match(version):
        rep.error(f"{manifest_path}: version '{version}' is not semver-shaped")
    if not str(manifest.get("description") or "").strip():
        rep.warning(f"{manifest_path}: no description (bronze rule)")
    if not str(manifest.get("label") or "").strip():
        rep.warning(f"{manifest_path}: no label (bronze rule)")
    if not os.path.isfile(os.path.join(path, "templates", "Hosts.template.yml")):
        rep.error(f"{path}: required template missing at templates/Hosts.template.yml")

    fields = quality.collect_config_fields(manifest)
    undocumented = [
        str(f.get("name"))
        for f in fields
        if not (str(f.get("label") or "").strip() and str(f.get("tooltip") or "").strip())
    ]
    roles = [r for r in (manifest.get("roles") or []) if isinstance(r, dict)]
    undocumented_roles = [
        str(r.get("name"))
        for r in roles
        if not (str(r.get("label") or "").strip() and str(r.get("description") or "").strip())
    ]
    rep.info(f"{path}: {len(fields)} config field(s), {len(undocumented)} missing label/tooltip (gold rule)")
    rep.info(f"{path}: {len(roles)} role(s), {len(undocumented_roles)} missing label/description (gold rule)")
    if undocumented:
        rep.info(f"{path}: undocumented fields: {', '.join(undocumented)}")
    if undocumented_roles:
        rep.info(f"{path}: undocumented roles: {', '.join(undocumented_roles)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="", help="repository to validate (owner/name)")
    parser.add_argument(
        "--tree",
        default="",
        help="working-tree package root to validate instead of (or as well as) releases",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("GITHUB_TOKEN", ""),
        help="GitHub API token (defaults to $GITHUB_TOKEN)",
    )
    args = parser.parse_args()
    if not args.repo and not args.tree:
        parser.error("provide --repo, --tree, or both")

    rep = Reporter()
    if args.tree:
        validate_tree(args.tree, rep)
    if args.repo:
        validate_repository(args.repo, args.token or None, rep)

    rep.info(
        f"Validation finished: {len(rep.errors)} error(s), "
        f"{len(rep.warnings)} warning(s)"
    )
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())

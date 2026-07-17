#!/usr/bin/env python3
"""Build catalog.json — the published wire data agents consume.

Run by the data job (generate-catalog-data.yml, cron every 2h + manual
dispatch). catalog.json is a BUILD ARTIFACT: it is deployed to GitHub Pages
and never committed to the repository.

For every repository in sources.yml (minus removed.yml):

  - list its published GitHub releases and find the versioned
    ``<name>-<version>.tar.gz`` assets (the mutable ``<name>.tar.gz`` latest
    alias is never recorded)
  - sha256 every versioned asset; when an ``<asset>.sha256`` sidecar exists it
    must match (mismatch fails the build — poisoned data is never published)
  - parse name/description from the provisioner.yml INSIDE the latest
    release's artifact — never from the GitHub repo metadata

The result is schema-validated, then compared against the CURRENTLY PUBLISHED
catalog.json:

  - IMMUTABILITY TRIPWIRE: an already-published version whose asset now hashes
    differently fails the build loudly (exit 2). Versions may disappear (a
    deleted release or a removed repo) and new versions may appear; published
    bytes may never change.
  - Change detection: ``changed=true|false`` is written to $GITHUB_OUTPUT so
    the workflow deploys only when the data actually differs.

Exit codes: 0 = built (see ``changed`` output), 1 = build/validation error,
2 = immutability tripwire.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys
import urllib.error
from datetime import datetime, timezone

import yaml

from scripts.validate_repo import (
    Reporter,
    _open_url,
    collect_assets,
    download_bytes,
    list_releases,
    parse_sidecar,
    semver_key,
    sha256_hex,
    stream_sha256,
    MAX_SIDECAR_BYTES,
)

CATALOG_NAME = "STARTcloud Provisioner Catalog"
FORMAT_VERSION = 1


def load_yaml(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def active_repos(sources_path: str, removed_path: str, rep: Reporter) -> list[str]:
    sources = load_yaml(sources_path)
    removed = load_yaml(removed_path)
    removed_repos = {entry["repo"].lower() for entry in (removed.get("removed") or [])}
    repos = []
    for entry in sources.get("sources") or []:
        repo = entry.get("repo", "")
        if repo.lower() in removed_repos:
            rep.info(f"{repo}: listed in removed.yml — excluded from catalog data")
            continue
        repos.append(repo)
    return repos


def fetch_published(url: str, rep: Reporter) -> dict | None:
    """The currently published catalog.json, or None when none is live yet.

    A 404 is the normal first-publish case. Any other failure is reported
    loudly but still treated as an empty baseline: assets live on GitHub
    releases over HTTPS, and the tripwire is defense-in-depth on top of that.
    """
    try:
        with _open_url(url) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            rep.info(f"No published catalog at {url} yet (404) — first publish")
            return None
        rep.warning(
            f"LOUD: could not fetch the published catalog ({exc.code} {exc.reason}) — "
            "tripwire baseline unavailable, treating this run as a first publish"
        )
        return None
    except (urllib.error.URLError, OSError, ValueError) as exc:
        rep.warning(
            f"LOUD: could not fetch or parse the published catalog ({exc}) — "
            "tripwire baseline unavailable, treating this run as a first publish"
        )
        return None


def extract_manifest_lenient(data: bytes, family: str, version: str) -> dict | None:
    """Best-effort provisioner.yml parse for catalog metadata (data job only).

    Shape enforcement happens at admission time via validate_repo.py; here a
    broken archive costs the family its description, not the whole build.
    """
    import io
    import tarfile

    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            member = archive.getmember(f"{family}/{version}/provisioner.yml")
            extracted = archive.extractfile(member)
            manifest = yaml.safe_load(extracted.read()) if extracted else None
            return manifest if isinstance(manifest, dict) else None
    except (KeyError, tarfile.TarError, EOFError, OSError, yaml.YAMLError):
        return None


def build_provisioners(repos: list[str], token: str | None, rep: Reporter) -> list[dict]:
    provisioners: list[dict] = []
    seen_families: dict[str, str] = {}

    for repo in repos:
        try:
            releases = list_releases(repo, token)
        except (urllib.error.URLError, OSError) as exc:
            rep.error(f"{repo}: could not list releases ({exc})")
            continue
        families = collect_assets(releases)
        if not families:
            rep.warning(f"{repo}: no versioned release assets — omitted from catalog data")
            continue

        for family in sorted(families):
            if family in seen_families:
                rep.error(
                    f"family '{family}' is published by both {seen_families[family]} and "
                    f"{repo} — ambiguous, refusing to build"
                )
                continue
            seen_families[family] = repo

            versions = families[family]
            latest = max(versions, key=semver_key)
            description = ""
            version_entries: list[dict] = []

            for version in sorted(versions, key=semver_key, reverse=True):
                entry = versions[version]
                asset = entry["asset"]
                url = asset["browser_download_url"]
                ctx = f"{repo} {family}-{version}"
                try:
                    if version == latest:
                        data = download_bytes(url)
                        digest = sha256_hex(data)
                        manifest = extract_manifest_lenient(data, family, version)
                        if manifest is None:
                            rep.warning(f"{ctx}: provisioner.yml not readable — empty description")
                        else:
                            description = str(manifest.get("description") or "").strip()
                    else:
                        digest = stream_sha256(url)
                except (urllib.error.URLError, RuntimeError, OSError) as exc:
                    rep.error(f"{ctx}: asset download failed ({exc})")
                    continue

                sidecar = entry["sidecar"]
                if sidecar is None:
                    rep.warning(f"{ctx}: no .sha256 sidecar asset")
                else:
                    try:
                        text = download_bytes(
                            sidecar["browser_download_url"], cap=MAX_SIDECAR_BYTES
                        ).decode("utf-8", errors="replace")
                        expected = parse_sidecar(text)
                        if expected is None:
                            rep.error(f"{ctx}: sidecar contains no sha256")
                            continue
                        if expected != digest:
                            rep.error(
                                f"{ctx}: sidecar sha256 mismatch (sidecar {expected}, "
                                f"asset {digest}) — refusing to record this artifact"
                            )
                            continue
                    except (urllib.error.URLError, RuntimeError, OSError) as exc:
                        rep.error(f"{ctx}: sidecar download failed ({exc})")
                        continue

                version_entries.append(
                    {
                        "version": version,
                        "artifacts": [
                            {"url": url, "checksum_type": "sha256", "checksum": digest}
                        ],
                    }
                )

            if version_entries:
                provisioners.append(
                    {
                        "name": family,
                        "repo": repo,
                        "description": description,
                        "versions": version_entries,
                    }
                )
            else:
                rep.warning(f"{repo} {family}: no recordable versions — family omitted")

    provisioners.sort(key=lambda p: p["name"])
    return provisioners


def run_tripwire(published: dict | None, new: dict, rep: Reporter) -> int:
    """Compare published checksums against the freshly computed ones."""
    if not published:
        return 0
    new_map = {
        (prov["name"], ver["version"]): {a["url"]: a["checksum"] for a in ver["artifacts"]}
        for prov in new.get("provisioners", [])
        for ver in prov.get("versions", [])
    }
    violations = 0
    for prov in published.get("provisioners", []):
        for ver in prov.get("versions", []):
            key = (prov.get("name"), ver.get("version"))
            current = new_map.get(key)
            if current is None:
                rep.info(
                    f"published {key[0]}-{key[1]} no longer exists upstream "
                    "(deleted release or removed repo) — dropping is allowed"
                )
                continue
            for artifact in ver.get("artifacts", []):
                url = artifact.get("url")
                checksum = artifact.get("checksum")
                if url not in current:
                    rep.error(
                        f"IMMUTABILITY TRIPWIRE: published {key[0]}-{key[1]} artifact URL "
                        f"disappeared while the version still exists: {url}"
                    )
                    violations += 1
                elif current[url] != checksum:
                    rep.error(
                        f"IMMUTABILITY TRIPWIRE: {key[0]}-{key[1]} asset now hashes "
                        f"{current[url]} but was published as {checksum} ({url}). "
                        "Published versions are immutable — a changed artifact is never "
                        "accepted. Rebuilds must ship as a NEW version."
                    )
                    violations += 1
    return violations


def normalized(catalog: dict | None) -> dict:
    if not catalog:
        return {}
    clone = copy.deepcopy(catalog)
    clone.pop("updated", None)
    return clone


def validate_against_schema(catalog: dict, schema_path: str, rep: Reporter) -> bool:
    import jsonschema

    with open(schema_path, "r", encoding="utf-8") as handle:
        schema = json.load(handle)
    validator = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
    ok = True
    for error in sorted(validator.iter_errors(catalog), key=lambda e: list(e.absolute_path)):
        path = "/".join(str(p) for p in error.absolute_path) or "<root>"
        rep.error(f"catalog.json schema violation at {path}: {error.message}")
        ok = False
    return ok


def write_github_output(changed: bool) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as handle:
            handle.write(f"changed={'true' if changed else 'false'}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, help="where to write catalog.json")
    parser.add_argument(
        "--published-url",
        required=True,
        help="URL of the currently published catalog.json (tripwire + change detection)",
    )
    parser.add_argument("--sources", default="sources.yml")
    parser.add_argument("--removed", default="removed.yml")
    parser.add_argument("--schema", default="schema/catalog.schema.json")
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN", ""))
    args = parser.parse_args()

    rep = Reporter()
    repos = active_repos(args.sources, args.removed, rep)
    provisioners = build_provisioners(repos, args.token or None, rep)

    catalog = {
        "name": CATALOG_NAME,
        "format_version": FORMAT_VERSION,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "provisioners": provisioners,
    }

    if not validate_against_schema(catalog, args.schema, rep):
        return 1
    if rep.errors:
        rep.info("Build finished with errors — nothing will be published")
        return 1

    published = fetch_published(args.published_url, rep)
    if run_tripwire(published, catalog, rep):
        rep.info("IMMUTABILITY TRIPWIRE tripped — failing loudly, nothing will be published")
        return 2

    changed = normalized(published) != normalized(catalog)
    write_github_output(changed)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(catalog, handle, indent=2)
        handle.write("\n")

    total_versions = sum(len(p["versions"]) for p in provisioners)
    rep.info(
        f"Built {args.out}: {len(provisioners)} famil{'y' if len(provisioners) == 1 else 'ies'}, "
        f"{total_versions} version(s), changed={str(changed).lower()}, "
        f"{len(rep.warnings)} warning(s)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

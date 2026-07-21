#!/usr/bin/env python3
"""Build the per-organization private catalogs — orgs/{org-uuid}/catalog.json.

Run by the data job next to scripts.build_catalog. Reads sources-orgs.yml from
the private store checkout (STARTcloud/provisioner-catalogs-private), builds
one catalog.json per org uuid into that same checkout, and the workflow
commits the result back. The Cloudflare Worker serves these files to org
members; nothing here ever lands on GitHub Pages.

Differences from the public builder, and nothing else:

  - source repos are private: releases are listed and assets downloaded with
    a GitHub App installation token minted per repo owner (the App only needs
    Contents: read and must be installed on the owning org)
  - private release assets can't use browser_download_url anonymously — they
    are fetched through the API asset endpoint. GitHub redirects that to a
    signed CDN URL which REJECTS an Authorization header, so redirects are
    caught manually and followed bare
  - the published baseline for change detection and the immutability tripwire
    is the file already sitting in the store checkout

Exit codes: 0 = built (see ``changed`` output), 1 = build/validation error,
2 = immutability tripwire.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import jwt
import yaml

from scripts.build_catalog import (
    extract_manifest_lenient,
    normalized,
    run_tripwire,
    validate_against_schema,
    write_github_output,
)
from scripts.validate_repo import (
    API_ROOT,
    MAX_ARCHIVE_BYTES,
    MAX_SIDECAR_BYTES,
    REPO_RE,
    Reporter,
    USER_AGENT,
    collect_assets,
    list_releases,
    parse_sidecar,
    semver_key,
    sha256_hex,
)

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802
        return None


def _read_capped(response, cap: int) -> bytes:
    import io

    buffer = io.BytesIO()
    while True:
        chunk = response.read(1024 * 1024)
        if not chunk:
            break
        buffer.write(chunk)
        if buffer.tell() > cap:
            raise RuntimeError(f"download exceeds {cap} bytes")
    return buffer.getvalue()


def download_private_asset(api_url: str, token: str, cap: int = MAX_ARCHIVE_BYTES) -> bytes:
    """Download a private release asset via the API asset endpoint.

    The authenticated request 302s to a signed CDN URL that rejects an
    Authorization header — so the redirect is caught and followed bare.
    """
    request = urllib.request.Request(
        api_url,
        headers={
            "User-Agent": USER_AGENT,
            "Authorization": f"Bearer {token}",
            "Accept": "application/octet-stream",
        },
    )
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=60) as response:
            return _read_capped(response, cap)
    except urllib.error.HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            location = exc.headers.get("Location")
            if not location:
                raise RuntimeError(f"redirect without Location from {api_url}") from exc
            bare = urllib.request.Request(location, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(bare, timeout=60) as response:
                return _read_capped(response, cap)
        raise


def app_installation_tokens(app_id: str, private_key: str, rep: Reporter) -> dict[str, str]:
    """One short-lived installation token per GitHub account the App is
    installed on, keyed by lowercased account login."""
    now = int(time.time())
    app_jwt = jwt.encode(
        {"iat": now - 60, "exp": now + 540, "iss": app_id},
        private_key,
        algorithm="RS256",
    )

    def api(url: str, method: str = "GET"):
        request = urllib.request.Request(
            url,
            method=method,
            headers={
                "User-Agent": USER_AGENT,
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))

    tokens: dict[str, str] = {}
    try:
        installations = api(f"{API_ROOT}/app/installations?per_page=100")
    except (urllib.error.URLError, OSError) as exc:
        rep.error(f"could not list App installations ({exc})")
        return tokens
    for installation in installations:
        login = str(installation.get("account", {}).get("login", "")).lower()
        if not login:
            continue
        try:
            grant = api(installation["access_tokens_url"], method="POST")
            tokens[login] = grant["token"]
        except (urllib.error.URLError, OSError, KeyError) as exc:
            rep.warning(f"could not mint installation token for '{login}' ({exc})")
    return tokens


def load_org_config(path: str, rep: Reporter) -> list[dict]:
    with open(path, "r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    orgs = data.get("orgs") or []
    seen_uuids: set[str] = set()
    valid: list[dict] = []
    for entry in orgs:
        uuid = str(entry.get("uuid", "")).lower()
        name = str(entry.get("name", "")).strip()
        sources = entry.get("sources") or []
        if not UUID_RE.match(uuid):
            rep.error(f"sources-orgs.yml: '{entry.get('uuid')}' is not a valid org uuid")
            continue
        if uuid in seen_uuids:
            rep.error(f"sources-orgs.yml: duplicate org uuid {uuid}")
            continue
        seen_uuids.add(uuid)
        if not name:
            rep.error(f"sources-orgs.yml: org {uuid} has no name")
            continue
        repos = []
        for source in sources:
            repo = str(source.get("repo", ""))
            if not REPO_RE.match(repo):
                rep.error(f"sources-orgs.yml: org {uuid} repo '{repo}' is not owner/name")
                continue
            repos.append(repo)
        valid.append({"uuid": uuid, "name": name, "repos": repos})
    return valid


def build_org_provisioners(
    repos: list[str], tokens: dict[str, str], rep: Reporter
) -> list[dict]:
    provisioners: list[dict] = []
    seen_families: dict[str, str] = {}

    for repo in repos:
        owner = repo.split("/")[0].lower()
        token = tokens.get(owner)
        if token is None:
            rep.error(
                f"{repo}: no App installation for '{owner}' — install the "
                "STARTcloud Provisioner Catalog App on that org and select this repo"
            )
            continue
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
                    f"{repo} — ambiguous within this org, refusing to build"
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
                ctx = f"{repo} {family}-{version}"
                try:
                    data = download_private_asset(asset["url"], token)
                except (urllib.error.URLError, RuntimeError, OSError) as exc:
                    rep.error(f"{ctx}: asset download failed ({exc})")
                    continue
                digest = sha256_hex(data)
                if version == latest:
                    manifest = extract_manifest_lenient(data, family, version)
                    if manifest is None:
                        rep.warning(f"{ctx}: provisioner.yml not readable — empty description")
                    else:
                        description = str(manifest.get("description") or "").strip()

                sidecar = entry["sidecar"]
                if sidecar is None:
                    rep.warning(f"{ctx}: no .sha256 sidecar asset")
                else:
                    try:
                        text = download_private_asset(
                            sidecar["url"], token, cap=MAX_SIDECAR_BYTES
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
                            {
                                "url": asset["browser_download_url"],
                                "checksum_type": "sha256",
                                "checksum": digest,
                            }
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


def read_existing(path: str, rep: Reporter) -> dict | None:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        rep.warning(f"LOUD: existing {path} unreadable ({exc}) — treating as first publish")
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="path to sources-orgs.yml")
    parser.add_argument(
        "--store", required=True, help="checkout of the private store repo (output root)"
    )
    parser.add_argument("--schema", default="schema/catalog.schema.json")
    parser.add_argument("--app-id", default=os.environ.get("CATALOG_APP_ID", ""))
    parser.add_argument(
        "--private-key",
        default=os.environ.get("CATALOG_APP_PRIVATE_KEY", ""),
        help="GitHub App private key PEM (defaults to $CATALOG_APP_PRIVATE_KEY)",
    )
    args = parser.parse_args()

    rep = Reporter()
    if not args.app_id or not args.private_key:
        rep.error("CATALOG_APP_ID / CATALOG_APP_PRIVATE_KEY are required")
        return 1

    orgs = load_org_config(args.config, rep)
    tokens = app_installation_tokens(args.app_id, args.private_key, rep)

    any_changed = False
    tripwired = False

    for org in orgs:
        rep.info(f"— org {org['name']} ({org['uuid']}): {len(org['repos'])} repo(s)")
        provisioners = build_org_provisioners(org["repos"], tokens, rep)
        catalog = {
            "name": f"{org['name']} Private Provisioner Catalog",
            "format_version": 1,
            "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "provisioners": provisioners,
        }
        if not validate_against_schema(catalog, args.schema, rep):
            continue

        out_path = os.path.join(args.store, "orgs", org["uuid"], "catalog.json")
        existing = read_existing(out_path, rep)
        if run_tripwire(existing, catalog, rep):
            tripwired = True
            continue

        if normalized(existing) == normalized(catalog):
            rep.info(f"{org['uuid']}: unchanged")
            continue

        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(catalog, handle, indent=2)
            handle.write("\n")
        any_changed = True
        total = sum(len(p["versions"]) for p in provisioners)
        rep.info(
            f"{org['uuid']}: wrote {len(provisioners)} famil"
            f"{'y' if len(provisioners) == 1 else 'ies'}, {total} version(s)"
        )

    write_github_output(any_changed)

    if tripwired:
        rep.info("IMMUTABILITY TRIPWIRE tripped — failing loudly, nothing will be committed")
        return 2
    if rep.errors:
        rep.info("Build finished with errors — nothing will be committed")
        return 1
    rep.info(
        f"Org catalog build done: {len(orgs)} org(s), changed={str(any_changed).lower()}, "
        f"{len(rep.warnings)} warning(s)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

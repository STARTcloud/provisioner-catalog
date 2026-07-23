#!/usr/bin/env python3
"""Build the per-organization private catalogs — orgs/{org-uuid}/catalog.json.

Run by the data job next to scripts.build_catalog. Reads sources-orgs.yml from
the private store checkout (STARTcloud/provisioner-catalogs-private), builds
one catalog.json per org uuid into that same checkout — plus a companion
health.json with measured quality tiers (scripts/quality.py) — and the
workflow commits the result back. The
Cloudflare Worker serves these files to org members; nothing here ever lands
on GitHub Pages.

Differences from the public builder, and nothing else:

  - source repos are private: releases are listed and assets downloaded with
    a GitHub App installation token minted per repo owner (the App only needs
    Contents: read and must be installed on the owning org)
  - private release assets are fetched through the API asset endpoint
    (validate_repo.download_release_asset handles the signed-CDN redirect)
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

from scripts import quality
from scripts.build_catalog import (
    extract_manifest_lenient,
    normalized,
    run_tripwire,
    validate_against_schema,
    write_github_output,
)
from scripts.validate_repo import (
    API_ROOT,
    MAX_SIDECAR_BYTES,
    REPO_RE,
    Reporter,
    USER_AGENT,
    collect_assets,
    download_release_asset,
    list_releases,
    parse_sidecar,
    semver_key,
    sha256_hex,
)

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


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
    repos: list[str],
    tokens: dict[str, str],
    rep: Reporter,
) -> tuple[list[dict], dict[str, dict]]:
    provisioners: list[dict] = []
    health_map: dict[str, dict] = {}
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
        workflows_text = quality.fetch_workflows_text(repo, token)

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
            manifest = None
            members: list[str] = []
            artifacts_ok = True
            sidecars_ok = True

            for version in sorted(versions, key=semver_key, reverse=True):
                entry = versions[version]
                asset = entry["asset"]
                ctx = f"{repo} {family}-{version}"
                try:
                    data = download_release_asset(asset, token)
                except (urllib.error.URLError, RuntimeError, OSError) as exc:
                    rep.error(f"{ctx}: asset download failed ({exc})")
                    artifacts_ok = False
                    continue
                digest = sha256_hex(data)
                if version == latest:
                    members = quality.archive_member_names(data)
                    manifest = extract_manifest_lenient(data, family, version)
                    if manifest is None:
                        rep.warning(f"{ctx}: provisioner.yml not readable — empty description")
                    else:
                        description = str(manifest.get("description") or "").strip()

                sidecar = entry["sidecar"]
                if sidecar is None:
                    rep.warning(f"{ctx}: no .sha256 sidecar asset")
                    sidecars_ok = False
                else:
                    try:
                        text = download_release_asset(
                            sidecar, token, cap=MAX_SIDECAR_BYTES
                        ).decode("utf-8", errors="replace")
                        expected = parse_sidecar(text)
                        if expected is None:
                            rep.error(f"{ctx}: sidecar contains no sha256")
                            sidecars_ok = False
                            continue
                        if expected != digest:
                            rep.error(
                                f"{ctx}: sidecar sha256 mismatch (sidecar {expected}, "
                                f"asset {digest}) — refusing to record this artifact"
                            )
                            sidecars_ok = False
                            continue
                    except (urllib.error.URLError, RuntimeError, OSError) as exc:
                        rep.error(f"{ctx}: sidecar download failed ({exc})")
                        sidecars_ok = False
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
                rules = quality.evaluate_rules(
                    family, manifest, members, list(versions), releases, workflows_text, latest
                )
                health_map[family] = quality.health_entry(
                    repo, rules, manifest, latest, releases, artifacts_ok, sidecars_ok
                )
            else:
                rep.warning(f"{repo} {family}: no recordable versions — family omitted")

    provisioners.sort(key=lambda p: p["name"])
    return provisioners, health_map


def read_existing(path: str, rep: Reporter) -> dict | None:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        rep.warning(f"LOUD: existing {path} unreadable ({exc}) — treating as first publish")
        return None


def write_json(path: str, document: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(document, handle, indent=2)
        handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="path to sources-orgs.yml")
    parser.add_argument(
        "--store", required=True, help="checkout of the private store repo (output root)"
    )
    parser.add_argument("--schema", default="schema/catalog.schema.json")
    parser.add_argument("--health-schema", default="schema/health.schema.json")
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
        provisioners, health_map = build_org_provisioners(org["repos"], tokens, rep)
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        doc_name = f"{org['name']} Private Provisioner Catalog"
        catalog = {
            "name": doc_name,
            "format_version": 1,
            "updated": now,
            "provisioners": provisioners,
        }
        health = {
            "name": doc_name,
            "format_version": 1,
            "updated": now,
            "provisioners": health_map,
        }
        if not validate_against_schema(catalog, args.schema, rep):
            continue
        if not validate_against_schema(health, args.health_schema, rep):
            continue

        org_dir = os.path.join(args.store, "orgs", org["uuid"])
        catalog_path = os.path.join(org_dir, "catalog.json")
        health_path = os.path.join(org_dir, "health.json")
        existing_catalog = read_existing(catalog_path, rep)
        existing_health = read_existing(health_path, rep)
        if run_tripwire(existing_catalog, catalog, rep):
            tripwired = True
            continue

        catalog_changed = normalized(existing_catalog) != normalized(catalog)
        health_changed = normalized(existing_health) != normalized(health)
        if not catalog_changed and not health_changed:
            rep.info(f"{org['uuid']}: unchanged")
            continue

        if catalog_changed:
            write_json(catalog_path, catalog)
        if health_changed:
            write_json(health_path, health)
        any_changed = True
        total = sum(len(p["versions"]) for p in provisioners)
        tiers = ", ".join(f"{n}={e['tier']}" for n, e in sorted(health_map.items()))
        rep.info(
            f"{org['uuid']}: wrote {len(provisioners)} famil"
            f"{'y' if len(provisioners) == 1 else 'ies'}, {total} version(s)"
            f"{f'; tiers: {tiers}' if tiers else ''}"
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

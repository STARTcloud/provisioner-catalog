#!/usr/bin/env python3
"""Computed quality tiers and live health for catalog provisioners.

The grading model (deliberately NOT Home Assistant's author-declared scale):
every rule is machine-measured from artifacts the data job already downloads —
the archive members, the packaged provisioner.yml, the repository's releases,
and its workflow files. Authors never declare anything; the only path to a
better grade is a better package.

Tier ladder: unrated < bronze < silver < gold < platinum. A family's measured
tier is the highest tier whose rules — and all rules below it — pass. Failing
even bronze shows as "unrated".

Security is NOT graded here. The safety scan, sidecar verification, manifest
name/version matching and the immutability tripwire are hard admission/build
gates in validate_repo.py and the builders; a package that violates them never
appears in the data at all. Ejecting a bad actor entirely is removed.yml's
job — there is deliberately no human knob on the grades themselves.
"""
from __future__ import annotations

import io
import math
import tarfile
import urllib.error
from datetime import datetime, timedelta, timezone

from scripts.validate_repo import ASSET_RE, SEMVER_RE, gh_api_json, _open_url, API_ROOT

TIERS = ["bronze", "silver", "gold", "platinum"]

MAX_WORKFLOW_FILES = 20
MAX_WORKFLOW_BYTES = 256 * 1024
MAX_MEMBER_SCAN = 200_000

# Provider values that count for platinum.multi_provider — arbitrary strings
# in a VAGRANT_PROVIDER dropdown must not.
KNOWN_PROVIDERS = {
    "virtualbox",
    "utm",
    "kvm",
    "qemu",
    "libvirt",
    "bhyve",
    "zones",
    "vmware",
    "vmware_fusion",
    "vmware_desktop",
    "hyperv",
    "proxmox",
    "aws",
}

# At least half the declared roles must carry a substantive molecule scenario.
TESTED_ROLES_RATIO = 0.5


def archive_member_names(data: bytes) -> list[str]:
    """Member paths of an already-safety-scanned archive (names only)."""
    names: list[str] = []
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            for member in archive:
                names.append(member.name.rstrip("/"))
                if len(names) > MAX_MEMBER_SCAN:
                    break
    except (tarfile.TarError, EOFError, OSError):
        return []
    return names


def fetch_workflows_text(repo: str, token: str | None) -> str:
    """Concatenated text of the repo's workflow files, '' when unreadable.

    Used for the lint-CI rule only — a missing/unreadable .github/workflows
    simply fails that rule, it never fails the build.
    """
    try:
        listing, _ = gh_api_json(
            f"{API_ROOT}/repos/{repo}/contents/.github/workflows", token
        )
    except (urllib.error.URLError, OSError, ValueError):
        return ""
    if not isinstance(listing, list):
        return ""
    chunks: list[str] = []
    for entry in listing[:MAX_WORKFLOW_FILES]:
        name = str(entry.get("name", ""))
        if not name.endswith((".yml", ".yaml")):
            continue
        try:
            with _open_url(
                f"{API_ROOT}/repos/{repo}/contents/.github/workflows/{name}",
                token,
                accept="application/vnd.github.raw+json",
            ) as response:
                chunks.append(response.read(MAX_WORKFLOW_BYTES).decode("utf-8", "replace"))
        except (urllib.error.URLError, OSError):
            continue
    return "\n".join(chunks)


def collect_config_fields(manifest: dict) -> list[dict]:
    """Every config-field-shaped mapping in the manifest, wherever it nests.

    Provisioner manifests in the wild carry fields under configuration.
    basicFields/advancedFields or metadata.configuration.groups — rather than
    chase shapes, anything that looks like a field (a mapping with both
    ``name`` and ``type``) inside a configuration subtree counts.
    """
    fields: list[dict] = []

    def walk(node, in_configuration: bool) -> None:
        if isinstance(node, dict):
            if in_configuration and "name" in node and "type" in node:
                fields.append(node)
            for key, value in node.items():
                walk(value, in_configuration or key == "configuration")
        elif isinstance(node, list):
            for item in node:
                walk(item, in_configuration)

    walk(manifest, False)
    return fields


def _filled(value) -> bool:
    return bool(str(value or "").strip())


def collect_roles(manifest: dict) -> list[dict]:
    """Declared roles, wherever the manifest puts them.

    Real manifests (startcloud_generic_provisioner and descendants) declare
    roles under ``metadata.roles``; the top-level ``roles:`` shape also exists.
    Top level wins when both are present.
    """
    raw = manifest.get("roles")
    if not raw:
        raw = (manifest.get("metadata") or {}).get("roles")
    return [r for r in (raw or []) if isinstance(r, dict)]


def tested_declared_roles(members: list[str], roles: list[dict]) -> int:
    """Declared roles carrying a SUBSTANTIVE molecule scenario in the archive.

    Anchored on the manifest's own role list, so vendored upstream
    collections' test trees count for nothing: a role only scores when a
    member path `…/roles/<name>/molecule/…` holds a molecule.yml AND a
    converge.yml or verify.yml. An empty `tests/.keep` scores zero.
    """
    tested = 0
    for role in roles:
        name = str(role.get("name", "")).strip()
        if not name:
            continue
        marker = f"/roles/{name}/molecule/"
        scenario = [m for m in members if marker in f"/{m}"]
        has_config = any(m.endswith("/molecule.yml") for m in scenario)
        has_plays = any(m.endswith(("/converge.yml", "/verify.yml")) for m in scenario)
        if has_config and has_plays:
            tested += 1
    return tested


def known_provider_values(fields: list[dict]) -> set[str]:
    """Distinct KNOWN provider values offered by VAGRANT_PROVIDER dropdowns —
    two bogus option strings no longer pass multi_provider."""
    values: set[str] = set()
    for field in fields:
        if str(field.get("name", "")).upper() != "VAGRANT_PROVIDER":
            continue
        for option in field.get("options") or []:
            if isinstance(option, dict):
                values.add(str(option.get("value", "")).strip().lower())
    return values & KNOWN_PROVIDERS


def spaced_releases_within_year(release_times: list, year_ago) -> bool:
    """≥2 releases in the last year, spanning ≥30 days — two same-day
    trivial releases no longer pass release_cadence."""
    recent = sorted(t for t in release_times if t >= year_ago)
    if len(recent) < 2:
        return False
    return (recent[-1] - recent[0]) >= timedelta(days=30)


def _parse_time(value: str):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def evaluate_rules(
    family: str,
    manifest: dict | None,
    members: list[str],
    versions: list[str],
    releases: list[dict],
    workflows_text: str,
    latest_version: str,
) -> dict[str, dict[str, bool]]:
    """All tier rules, measured. Every value is a plain bool."""
    manifest = manifest if isinstance(manifest, dict) else {}
    root = f"{family}/{latest_version}"
    member_set = set(members)
    now = datetime.now(timezone.utc)

    release_times = [t for t in (_parse_time(r.get("published_at")) for r in releases) if t]
    latest_release_at = max(release_times) if release_times else None
    year_ago = now - timedelta(days=365)

    release_asset_names = {
        a.get("name", "") for r in releases for a in r.get("assets", [])
    }

    fields = collect_config_fields(manifest)
    roles = collect_roles(manifest)

    tested_roles = tested_declared_roles(members, roles)
    tests_required = max(1, math.ceil(len(roles) * TESTED_ROLES_RATIO)) if roles else 0

    return {
        "bronze": {
            "description": _filled(manifest.get("description")),
            "label": _filled(manifest.get("label")),
            "semver_versions": bool(versions)
            and all(SEMVER_RE.match(v) for v in versions),
            "latest_alias": f"{family}.tar.gz" in release_asset_names,
        },
        "silver": {
            "changelog": f"{root}/CHANGELOG.md" in member_set,
            "readme": f"{root}/README.md" in member_set,
            "release_within_12_months": bool(
                latest_release_at and latest_release_at >= year_ago
            ),
            "lint_ci": "ansible-lint" in workflows_text,
        },
        "gold": {
            "config_fields_documented": bool(fields)
            and all(_filled(f.get("label")) and _filled(f.get("tooltip")) for f in fields),
            "roles_documented": bool(roles)
            and all(_filled(r.get("label")) and _filled(r.get("description")) for r in roles),
            "example_hosts": f"{root}/Hosts.example.yml" in member_set
            or f"{root}/examples/Hosts.yml" in member_set,
        },
        "platinum": {
            # Coverage of the manifest's OWN roles + CI evidence the tests
            # run — vendored collections' test trees and empty tests/ dirs
            # count for nothing.
            "automated_tests": bool(roles)
            and tested_roles >= tests_required
            and "molecule" in workflows_text,
            "multi_provider": len(known_provider_values(fields)) >= 2,
            "release_cadence": spaced_releases_within_year(release_times, year_ago),
        },
    }


def measured_tier(rules: dict[str, dict[str, bool]]) -> str:
    """Highest tier whose rules AND all lower tiers' rules pass."""
    tier = "unrated"
    for candidate in TIERS:
        if all(rules.get(candidate, {}).values()) and rules.get(candidate):
            tier = candidate
        else:
            break
    return tier


def failed_rules(rules: dict[str, dict[str, bool]]) -> list[str]:
    return [
        f"{tier}.{rule}"
        for tier in TIERS
        for rule, passed in rules.get(tier, {}).items()
        if not passed
    ]


def family_downloads(family: str, releases: list[dict]) -> int:
    """Total GitHub download count of the family's versioned assets."""
    total = 0
    for release in releases:
        for asset in release.get("assets", []):
            match = ASSET_RE.match(asset.get("name", ""))
            if match and match.group("name") == family:
                total += asset.get("download_count") or 0
    return total


def health_entry(
    family: str,
    repo: str,
    rules: dict[str, dict[str, bool]],
    manifest: dict | None,
    latest_version: str,
    releases: list[dict],
    artifacts_ok: bool,
    sidecars_ok: bool,
) -> dict:
    release_times = [t for t in (_parse_time(r.get("published_at")) for r in releases) if t]
    latest_release_at = max(release_times) if release_times else None
    manifest = manifest if isinstance(manifest, dict) else {}
    return {
        "repo": repo,
        "tier": measured_tier(rules),
        "presentation": {
            "label": str(manifest.get("label") or "").strip(),
            "icon": str(manifest.get("icon") or "").strip(),
            "homepage": str(manifest.get("homepage") or "").strip(),
        },
        "rules": rules,
        "failed_rules": failed_rules(rules),
        "health": {
            "latest_version": latest_version,
            "latest_release_at": latest_release_at.strftime("%Y-%m-%dT%H:%M:%SZ")
            if latest_release_at
            else None,
            "artifacts_ok": artifacts_ok,
            "sidecars_ok": sidecars_ok,
            "providers": sorted(known_provider_values(collect_config_fields(manifest))),
            "downloads": family_downloads(family, releases),
        },
    }

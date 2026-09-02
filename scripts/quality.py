#!/usr/bin/env python3
"""Computed quality tiers and live health for catalog provisioners.

The grading model (deliberately NOT Home Assistant's author-declared scale):
every rule is machine-measured from artifacts the data job already downloads —
the archive members, the packaged provisioner.yml, the repository's releases,
its workflow files, and the check runs GitHub recorded for the commits its
pins name. Authors never declare anything; the only path to a better grade is
a better package.

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
import re
import tarfile
import urllib.error
from datetime import datetime, timedelta, timezone

from scripts.validate_repo import ASSET_RE, REPO_RE, SEMVER_RE, gh_api_json, _open_url, API_ROOT

TIERS = ["bronze", "silver", "gold", "platinum"]

MAX_WORKFLOW_FILES = 20
MAX_WORKFLOW_BYTES = 256 * 1024
MAX_MEMBER_SCAN = 200_000
MAX_PIN_BYTES = 4096
MAX_MOLECULE_PARENT_WALK = 10

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

LINT_STEP_RE = re.compile(r"^\s*-?\s*uses:\s*['\"]?ansible/ansible-lint", re.MULTILINE)
COLLECTION_PIN_RE = re.compile(r"^collections/(?P<namespace>[^/.]+)\.(?P<name>[^/]+)\.version$")
STAGED_COLLECTION_RE = re.compile(
    r"/provisioners/ansible_collections/(?P<namespace>[^/]+)/(?P<name>[^/]+)/roles/"
)
MOLECULE_CHECK_RE = re.compile(r"^molecule\b", re.IGNORECASE)


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


def archive_collection_pins(data: bytes, family: str, version: str) -> dict[str, tuple[str, str]]:
    """Collections the archive stages, keyed "<namespace>/<name>" -> (repo, tag).

    Read from the package's own pin files, `<family>/<version>/collections/
    <namespace>.<name>.version`, each a single line "<owner>/<repo> <tag>".
    Malformed or unreadable pins are simply absent.
    """
    root = f"{family}/{version}/"
    pins: dict[str, tuple[str, str]] = {}
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            for member in archive:
                name = member.name.rstrip("/")
                if not member.isreg() or not name.startswith(root):
                    continue
                match = COLLECTION_PIN_RE.match(name[len(root):])
                if not match:
                    continue
                extracted = archive.extractfile(member)
                line = (
                    extracted.read(MAX_PIN_BYTES).decode("utf-8", "replace").strip()
                    if extracted
                    else ""
                )
                parts = line.split()
                if len(parts) == 2 and REPO_RE.match(parts[0]):
                    pins[f"{match.group('namespace')}/{match.group('name')}"] = (parts[0], parts[1])
    except (tarfile.TarError, EOFError, OSError):
        return {}
    return pins


def molecule_run_verified(repo: str, ref: str, token: str | None) -> bool:
    """True when the ref's history carries a green molecule run.

    GitHub's check runs are the receipt: every "Molecule (…)" leg recorded on
    the commit must have concluded success. Release commits change only
    version and changelog and the collection workflows skip molecule there, so
    a commit whose molecule legs were all skipped is stepped over to its first
    parent, up to MAX_MOLECULE_PARENT_WALK commits. A failed leg, a missing
    run within that walk, or an unreadable repository verifies nothing.
    """
    sha = ref
    for _ in range(MAX_MOLECULE_PARENT_WALK):
        try:
            commit, _ = gh_api_json(f"{API_ROOT}/repos/{repo}/commits/{sha}", token)
            runs, _ = gh_api_json(
                f"{API_ROOT}/repos/{repo}/commits/{commit['sha']}/check-runs?per_page=100",
                token,
            )
        except (urllib.error.URLError, OSError, ValueError, KeyError, TypeError):
            return False
        legs = [
            run
            for run in runs.get("check_runs", [])
            if MOLECULE_CHECK_RE.match(str(run.get("name", "")))
            and not str(run.get("name", "")).strip().lower().endswith("molecule ok")
        ]
        conclusions = {str(run.get("conclusion") or "") for run in legs}
        if legs and conclusions != {"skipped"}:
            return conclusions == {"success"}
        parents = commit.get("parents") or []
        sha = str(parents[0].get("sha", "")) if parents else ""
        if not sha:
            return False
    return False


def molecule_evidence(
    data: bytes, family: str, version: str, repo: str, tag: str, token: str | None
) -> dict[str, bool]:
    """Verified molecule runs, keyed by where a scenario can live in the archive.

    "." is the package's own tree at its release tag; "<namespace>/<name>" is a
    staged collection at the tag its pin file names. A key is True only when
    molecule_run_verified found a green run for that repository and ref, so a
    pinned collection release is credited with exactly the tests its own CI
    ran before it was cut — verified from GitHub, never trusted.
    """
    evidence = {".": molecule_run_verified(repo, tag, token) if tag else False}
    for key, (pin_repo, pin_tag) in archive_collection_pins(data, family, version).items():
        evidence[key] = molecule_run_verified(pin_repo, pin_tag, token)
    return evidence


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


def tested_declared_roles(members: list[str], roles: list[dict], evidence: dict[str, bool]) -> int:
    """Declared roles proven by a shipped molecule scenario AND a green run.

    Anchored on the manifest's own role list. A role scores when some member
    path `…/roles/<name>/molecule/…` holds a molecule.yml AND a converge.yml
    or verify.yml, and the repository that scenario came from — the staged
    collection under provisioners/ansible_collections/<namespace>/<name>/ at
    its pinned release, or the package's own tree at its release tag — carries
    a verified molecule run (see molecule_evidence). Scenarios shipped but
    never run, and an empty `tests/.keep`, score zero.
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
        if not (has_config and has_plays):
            continue
        sources: set[str] = set()
        for member in scenario:
            match = STAGED_COLLECTION_RE.search(f"/{member}")
            sources.add(f"{match.group('namespace')}/{match.group('name')}" if match else ".")
        if any(evidence.get(source) for source in sources):
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
    molecule_evidence: dict[str, bool] | None = None,
) -> dict[str, dict[str, bool]]:
    """All tier rules, measured. Every value is a plain bool.

    ``molecule_evidence`` is the map molecule_evidence() builds for the latest
    archive; without it no declared role can count as tested.
    """
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

    tested_roles = tested_declared_roles(members, roles, molecule_evidence or {})
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
            "lint_ci": bool(LINT_STEP_RE.search(workflows_text)),
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
            "automated_tests": bool(roles) and tested_roles >= tests_required,
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

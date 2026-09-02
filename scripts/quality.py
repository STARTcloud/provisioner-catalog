#!/usr/bin/env python3
"""Computed quality tiers and live health for catalog provisioners.

The grading model (deliberately NOT Home Assistant's author-declared scale):
every rule is machine-measured from artifacts the data job already downloads —
the archive members, the packaged provisioner.yml, the repository's releases,
its workflow files, the check runs GitHub recorded for the commits its pins
name, and the Vagrant box catalogs its rendered Hosts.yml points at. Authors
never declare anything; the only path to a better grade is a better package.

Tier ladder: unrated < bronze < silver < gold < platinum < diamond. A family's
measured tier is the highest tier whose rules — and all rules below it — pass.
Failing even bronze shows as "unrated".

Three kinds of answer exist for a network-backed rule: measured true, measured
false, and "could not measure" (an API or catalog that did not answer). The
third never moves a badge: evaluate_rules resolves it to the value the
previously published health.json carried, and to false only when there is no
previous value at all.

Security is NOT graded here. The safety scan, sidecar verification, manifest
name/version matching and the immutability tripwire are hard admission/build
gates in validate_repo.py and the builders; a package that violates them never
appears in the data at all. Ejecting a bad actor entirely is removed.yml's
job — there is deliberately no human knob on the grades themselves.
"""
from __future__ import annotations

import io
import json
import math
import re
import tarfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import yaml
from jinja2 import Environment, TemplateError, Undefined

from scripts.validate_repo import (
    API_ROOT,
    ASSET_RE,
    REPO_RE,
    SEMVER_RE,
    USER_AGENT,
    _open_url,
    gh_api_json,
)

TIERS = ["bronze", "silver", "gold", "platinum", "diamond"]

MAX_WORKFLOW_FILES = 20
MAX_WORKFLOW_BYTES = 256 * 1024
MAX_MEMBER_SCAN = 200_000
MAX_PIN_BYTES = 4096
MAX_TEMPLATE_BYTES = 512 * 1024
MAX_BOX_METADATA_BYTES = 4 * 1024 * 1024
MAX_MOLECULE_PARENT_WALK = 10
MAX_BOOT_PARENT_WALK = 3
BOX_LOOKUP_TIMEOUT = 15

TESTED_ROLES_RATIO = 0.5

LINT_STEP_RE = re.compile(r"^\s*-?\s*uses:\s*['\"]?ansible/ansible-lint", re.MULTILINE)
COLLECTION_PIN_RE = re.compile(r"^collections/(?P<namespace>[^/.]+)\.(?P<name>[^/]+)\.version$")
STAGED_COLLECTION_RE = re.compile(
    r"/provisioners/ansible_collections/(?P<namespace>[^/]+)/(?P<name>[^/]+)/roles/"
)
MOLECULE_CHECK_RE = re.compile(r"^molecule\b", re.IGNORECASE)
BOOT_CHECK_RE = re.compile(r"^boot\s*\((?P<provider>[^()]+)\)\s*$", re.IGNORECASE)

RENDER_SETTINGS = {
    "hostname": "catalog",
    "domain": "example.invalid",
    "server_id": "1",
    "vcpus": 2,
    "memory": 4096,
}


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


def archive_text_member(data: bytes, path: str, cap: int) -> str | None:
    """Text of one regular archive member, None when absent or unreadable."""
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            member = archive.getmember(path)
            if not member.isreg():
                return None
            extracted = archive.extractfile(member)
            return extracted.read(cap).decode("utf-8", "replace") if extracted else None
    except (KeyError, tarfile.TarError, EOFError, OSError):
        return None


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


def _check_runs_at(repo: str, sha: str, token: str | None) -> tuple[dict, list[dict]] | None:
    """The commit object and its check runs, None when GitHub did not answer."""
    try:
        commit, _ = gh_api_json(f"{API_ROOT}/repos/{repo}/commits/{sha}", token)
        runs, _ = gh_api_json(
            f"{API_ROOT}/repos/{repo}/commits/{commit['sha']}/check-runs?per_page=100",
            token,
        )
    except (urllib.error.URLError, OSError, ValueError, KeyError, TypeError):
        return None
    return commit, list(runs.get("check_runs", []))


def molecule_run_verified(repo: str, ref: str, token: str | None) -> bool | None:
    """True when the ref's history carries a green molecule run.

    GitHub's check runs are the receipt: every "Molecule (…)" leg recorded on
    the commit must have concluded success. Release commits change only
    version and changelog and the collection workflows skip molecule there, so
    a commit whose molecule legs were all skipped is stepped over to its first
    parent, up to MAX_MOLECULE_PARENT_WALK commits. A failed leg or no molecule
    run within that walk is False; a repository GitHub would not answer for is
    None — could not measure.
    """
    sha = ref
    for _ in range(MAX_MOLECULE_PARENT_WALK):
        answer = _check_runs_at(repo, sha, token)
        if answer is None:
            return None
        commit, runs = answer
        legs = [
            run
            for run in runs
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
) -> dict[str, bool | None]:
    """Verified molecule runs, keyed by where a scenario can live in the archive.

    "." is the package's own tree at its release tag; "<namespace>/<name>" is a
    staged collection at the tag its pin file names. A key is True only when
    molecule_run_verified found a green run for that repository and ref, so a
    pinned collection release is credited with exactly the tests its own CI
    ran before it was cut — verified from GitHub, never trusted. None marks a
    repository that could not be read this run.
    """
    evidence: dict[str, bool | None] = {
        ".": molecule_run_verified(repo, tag, token) if tag else False
    }
    for key, (pin_repo, pin_tag) in archive_collection_pins(data, family, version).items():
        evidence[key] = molecule_run_verified(pin_repo, pin_tag, token)
    return evidence


def booted_providers(repo: str, tag: str, token: str | None) -> dict[str, bool] | None:
    """Providers with a green "Boot (<provider>)" check run at the release tag.

    The boot proof is recorded by the provisioner's own CI as one check run per
    provider named exactly `Boot (<provider>)`; a run that concluded anything
    but success is False for that provider. Walks up to MAX_BOOT_PARENT_WALK
    parents so a release commit that carries no boot legs of its own still
    finds the run on the commit that produced the release. None when GitHub
    did not answer.
    """
    sha = tag
    for _ in range(MAX_BOOT_PARENT_WALK):
        if not sha:
            return {}
        answer = _check_runs_at(repo, sha, token)
        if answer is None:
            return None
        commit, runs = answer
        booted: dict[str, bool] = {}
        for run in runs:
            match = BOOT_CHECK_RE.match(str(run.get("name", "")))
            if not match:
                continue
            provider = match.group("provider").lower()
            booted[provider] = booted.get(provider, True) and run.get("conclusion") == "success"
        if booted:
            return booted
        parents = commit.get("parents") or []
        sha = str(parents[0].get("sha", "")) if parents else ""
    return {}


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


def tested_declared_roles(
    members: list[str], roles: list[dict], evidence: dict[str, bool | None]
) -> tuple[int, int]:
    """(proven, unmeasurable) counts over the declared roles.

    Anchored on the manifest's own role list. A role is proven when some
    member path `…/roles/<name>/molecule/…` holds a molecule.yml AND a
    converge.yml or verify.yml, and the repository that scenario came from —
    the staged collection under provisioners/ansible_collections/<namespace>/
    <name>/ at its pinned release, or the package's own tree at its release
    tag — carries a verified molecule run (see molecule_evidence). A role whose
    scenario exists but whose source could not be read this run counts as
    unmeasurable. Scenarios shipped but never run, and an empty `tests/.keep`,
    score zero.
    """
    proven = 0
    unmeasurable = 0
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
        answers = [evidence.get(source) for source in sources]
        if any(answer is True for answer in answers):
            proven += 1
        elif any(answer is None for answer in answers):
            unmeasurable += 1
    return proven, unmeasurable


def listed_providers(fields: list[dict]) -> set[str]:
    """Distinct provider values offered by VAGRANT_PROVIDER dropdowns — the
    author's list, before any of it is verified. A provider is any name a box
    catalog can serve an image under; nothing here decides which names exist."""
    values: set[str] = set()
    for field in fields:
        if str(field.get("name", "")).upper() != "VAGRANT_PROVIDER":
            continue
        for option in field.get("options") or []:
            if isinstance(option, dict):
                value = str(option.get("value", "")).strip().lower()
                if value:
                    values.add(value)
    return values


def render_context(fields: list[dict], provider: str) -> dict:
    """The catalog's fixed render context for Hosts.template.yml.

    The agents render the same template with the platform's live settings,
    networks, disks and role picks plus the manifest field answers. The
    catalog stands in for that with the smallest context that lets the
    template's own defaults apply: RENDER_SETTINGS as ``settings``, no
    networks, no disks (the package default branch renders), no picked roles,
    every configuration field's declared ``default`` as its answer, and the
    provider under test as ``VAGRANT_PROVIDER``.
    """
    context: dict = {
        "settings": dict(RENDER_SETTINGS),
        "networks": [],
        "roles": [],
    }
    for field in fields:
        name = str(field.get("name", "")).strip()
        if name and "default" in field:
            context[name] = field.get("default")
    context["VAGRANT_PROVIDER"] = provider
    return context


def render_hosts(template_text: str, fields: list[dict], provider: str) -> dict | None:
    """Render Hosts.template.yml for one provider and parse it; None when it
    fails to render or does not parse to a mapping."""
    try:
        environment = Environment(undefined=Undefined, autoescape=False)
        rendered = environment.from_string(template_text).render(render_context(fields, provider))
        parsed = yaml.safe_load(rendered)
    except (TemplateError, yaml.YAMLError, TypeError, ValueError, RecursionError):
        return None
    return parsed if isinstance(parsed, dict) else None


def rendered_box(hosts: dict) -> dict | None:
    """The first host's box coordinates, None when the render carries none."""
    entries = hosts.get("hosts")
    if not isinstance(entries, list) or not entries:
        return None
    settings = (entries[0] or {}).get("settings") if isinstance(entries[0], dict) else None
    if not isinstance(settings, dict):
        return None
    box = str(settings.get("box") or "").strip()
    box_url = str(settings.get("box_url") or "").strip().rstrip("/")
    if not box or not box_url.startswith("https://"):
        return None
    return {
        "box": box,
        "box_url": box_url,
        "box_version": str(settings.get("box_version") or "").strip().lstrip("v"),
        "box_arch": str(settings.get("box_arch") or "").strip().lower(),
        "provider_type": str(settings.get("provider_type") or "").strip().lower(),
    }


def fetch_box_metadata(box_url: str, box: str, cache: dict) -> dict | None | bool:
    """Vagrant box metadata from a box catalog such as BoxVault.

    GET {box_url}/{box} with a Vagrant user agent answers the box's versions
    and, per version, its providers with their architectures. Returns the
    parsed document, False when the catalog answered that the box is not
    there (404), or None when it did not answer usefully (network failure,
    5xx, 401/403 — a box the catalog cannot see is unmeasurable, not absent).
    """
    key = (box_url, box)
    if key in cache:
        return cache[key]
    request = urllib.request.Request(
        f"{box_url}/{urllib.parse.quote(box, safe='/')}",
        headers={"User-Agent": f"Vagrant/2.4.0 ({USER_AGENT})", "Accept": "application/json"},
    )
    result: dict | None | bool
    try:
        with urllib.request.urlopen(request, timeout=BOX_LOOKUP_TIMEOUT) as response:
            payload = json.loads(response.read(MAX_BOX_METADATA_BYTES).decode("utf-8", "replace"))
            result = payload if isinstance(payload, dict) else None
    except urllib.error.HTTPError as exc:
        result = False if exc.code == 404 else None
    except (urllib.error.URLError, OSError, ValueError):
        result = None
    cache[key] = result
    return result


def box_has_provider(metadata: dict, box_version: str, provider: str, box_arch: str) -> bool:
    """True when the box lists the provider for that version and architecture."""
    for version in metadata.get("versions") or []:
        if not isinstance(version, dict):
            continue
        if str(version.get("version") or "").lstrip("v") != box_version:
            continue
        for entry in version.get("providers") or []:
            if not isinstance(entry, dict):
                continue
            if str(entry.get("name") or "").lower() != provider:
                continue
            arch = str(entry.get("architecture") or "").lower()
            if not box_arch or not arch or arch == box_arch:
                return True
    return False


def verify_providers(
    data: bytes, family: str, version: str, fields: list[dict], cache: dict
) -> dict[str, bool | None]:
    """Per listed provider: True when the rendered Hosts.yml names a box the
    box catalog serves for that provider and architecture at that version,
    False when it does not render for the provider or the catalog has no such
    image, None when the catalog could not be asked."""
    template = archive_text_member(
        data, f"{family}/{version}/templates/Hosts.template.yml", MAX_TEMPLATE_BYTES
    )
    verified: dict[str, bool | None] = {}
    for provider in sorted(listed_providers(fields)):
        if template is None:
            verified[provider] = False
            continue
        hosts = render_hosts(template, fields, provider)
        box = rendered_box(hosts) if hosts else None
        if box is None or (box["provider_type"] and box["provider_type"] != provider):
            verified[provider] = False
            continue
        metadata = fetch_box_metadata(box["box_url"], box["box"], cache)
        if metadata is None:
            verified[provider] = None
        elif metadata is False:
            verified[provider] = False
        else:
            verified[provider] = box_has_provider(
                metadata, box["box_version"], provider, box["box_arch"]
            )
    return verified


def version_providers(
    verified: dict[str, bool | None], previous: dict | None
) -> tuple[list[str], bool]:
    """(verified provider list, complete) for one version.

    A provider the catalog could not ask about this run keeps the answer the
    previously published health.json holds for that version; with no previous
    answer it is left out and the result is marked incomplete so the next run
    measures it again instead of carrying a hole forward as truth.
    """
    previous_list = set((previous or {}).get("providers") or [])
    complete = True
    providers: list[str] = []
    for provider, answer in verified.items():
        if answer is True:
            providers.append(provider)
        elif answer is None:
            if provider in previous_list:
                providers.append(provider)
            else:
                complete = False
    return sorted(providers), complete


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


def _resolve(value: bool | None, previous: dict | None, tier: str, rule: str) -> bool:
    """A measured answer as is; an unmeasurable one as the previously
    published answer, false when there is none."""
    if value is not None:
        return bool(value)
    return bool(((previous or {}).get("rules") or {}).get(tier, {}).get(rule, False))


def evaluate_rules(
    family: str,
    manifest: dict | None,
    members: list[str],
    versions: list[str],
    releases: list[dict],
    workflows_text: str,
    latest_version: str,
    molecule_evidence: dict[str, bool | None] | None = None,
    latest_providers: list[str] | None = None,
    providers_complete: bool = True,
    boot_results: dict[str, bool] | None = None,
    previous: dict | None = None,
) -> dict[str, dict[str, bool]]:
    """All tier rules, measured. Every value is a plain bool.

    ``molecule_evidence`` is the map molecule_evidence() builds for the latest
    archive; ``latest_providers`` and ``providers_complete`` come from
    version_providers() for the latest version; ``boot_results`` from
    booted_providers() (None when GitHub did not answer); ``previous`` is this
    family's entry in the previously published health.json, consulted only
    for answers that could not be measured this run.
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

    proven, unmeasurable = tested_declared_roles(members, roles, molecule_evidence or {})
    tests_required = max(1, math.ceil(len(roles) * TESTED_ROLES_RATIO)) if roles else 0
    automated_tests: bool | None
    if not roles:
        automated_tests = False
    elif proven >= tests_required:
        automated_tests = True
    elif proven + unmeasurable >= tests_required:
        automated_tests = None
    else:
        automated_tests = False

    verified = list(latest_providers or [])
    multi_provider: bool | None
    if len(verified) >= 2:
        multi_provider = True
    elif not providers_complete:
        multi_provider = None
    else:
        multi_provider = False

    booted: bool | None
    if boot_results is None:
        booted = None
    elif not verified:
        booted = False
    else:
        booted = all(boot_results.get(provider) is True for provider in verified)

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
            "automated_tests": _resolve(automated_tests, previous, "platinum", "automated_tests"),
            "multi_provider": _resolve(multi_provider, previous, "platinum", "multi_provider"),
            "release_cadence": spaced_releases_within_year(release_times, year_ago),
        },
        "diamond": {
            "booted_providers": _resolve(booted, previous, "diamond", "booted_providers"),
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


def merged_versions(
    versions: list[str],
    latest_version: str,
    latest_providers: list[str],
    previous: dict | None,
) -> dict[str, dict]:
    """Per-version provider data for health.json.

    Only the latest version is measured on a run; every other recorded version
    keeps the entry the previously published health.json holds for it, because
    published bytes never change and neither does what they render. A version
    with no entry yet carries no providers until the run that first measured it
    as latest — or until a later run re-measures history, which this one does
    not do.
    """
    carried = ((previous or {}).get("versions") or {}) if isinstance(previous, dict) else {}
    merged: dict[str, dict] = {}
    for version in versions:
        if version == latest_version:
            merged[version] = {"providers": sorted(latest_providers)}
        elif isinstance(carried.get(version), dict):
            merged[version] = {"providers": sorted(carried[version].get("providers") or [])}
    return merged


def health_entry(
    family: str,
    repo: str,
    rules: dict[str, dict[str, bool]],
    manifest: dict | None,
    latest_version: str,
    releases: list[dict],
    artifacts_ok: bool,
    sidecars_ok: bool,
    version_data: dict[str, dict] | None = None,
) -> dict:
    release_times = [t for t in (_parse_time(r.get("published_at")) for r in releases) if t]
    latest_release_at = max(release_times) if release_times else None
    manifest = manifest if isinstance(manifest, dict) else {}
    version_data = version_data or {}
    latest_providers = list((version_data.get(latest_version) or {}).get("providers") or [])
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
            "providers": sorted(latest_providers),
            "versions": version_data,
            "downloads": family_downloads(family, releases),
        },
    }

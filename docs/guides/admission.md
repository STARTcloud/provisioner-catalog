---
title: Admission
layout: default
nav_order: 4
parent: Guides
permalink: /guides/admission/
---

# Admission

{: .no_toc }

How a repository gets into the catalog, what the pull-request checks enforce, when the published data catches up, and how a repository leaves again. Humans admit repositories through one reviewed pull request; the data job publishes version data on its own schedule; authors own their releases.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## The admission list

`sources.yml` at the repository root is the only way into the catalog. It is a hand-edited YAML document with a single `sources` array, one entry per provisioner repository, each entry carrying exactly one key:

```yaml
sources:
  - repo: STARTcloud/hcl_domino_additional_provisioner
  - repo: STARTcloud/startcloud_generic_provisioner
```

Each entry in the real file is preceded by an owner-attribution comment naming the author and what the provisioner family does. The PR template requires that attribution for new entries.

| Rule | Where it is enforced |
| --- | --- |
| `repo` is `owner/name`, matching `^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/[A-Za-z0-9._-]+$` | `schema/sources.schema.json` |
| No other keys on an entry, no other top-level keys | `schema/sources.schema.json` (`additionalProperties: false`) |
| No duplicate entries, including case-insensitive duplicates | schema `uniqueItems` plus `scripts/validate_schemas.py` |
| Entries sorted alphabetically by `repo`, case-folded | `scripts/is_sorted.py` |
| Exactly one repository added per pull request | `scripts/changed/repo.py` (see Preflight below) |

### One repository per pull request

The admission gate extracts the single repository a PR adds. A PR that adds two or more repositories fails preflight outright, and every candidate-scoped check is built around that one repository. A PR that adds none (a tooling or documentation change) simply skips the candidate-scoped checks.

### The PR template checklist

Section A of `.github/PULL_REQUEST_TEMPLATE.md` is the admission checklist. Every item is required:

- The publishing docs (README and CONTRIBUTING) have been read.
- The validation action (`uses: STARTcloud/provisioner-catalog@main`) is added to the submitted repository's CI.
- All actions in the submitted repository pass, with no disabled or skipped checks.
- Links to green validation runs are pasted in.
- A release was created after validation passed, carrying the versioned `<name>-<version>.tar.gz` asset and its `.sha256` sidecar.
- The `sources.yml` entry is one line, alphabetized, with an owner-attribution comment.
- The PR adds exactly one repository and changes nothing else.

The template also names the repository being added and acknowledges that admission review is a moderation gate: a maintainer may ask questions before merging. Listing is not an endorsement; packages execute with real privileges on consumers' machines.

## The checks

`.github/workflows/checks.yml` runs on every pull request against `main` (opened, synchronized, reopened) with an empty permissions block and per-ref concurrency that cancels superseded runs. Each job checks out the catalog, installs the pinned Python and `requirements.txt`, and runs one module under `scripts/`.

| Job | Script | Scoped to the candidate |
| --- | --- | --- |
| Preflight | `scripts.changed.repo` | produces it |
| Editable PR | `scripts.check.edits` | no, runs on every PR |
| Owner | `scripts.check.owner` | yes |
| Releases | `scripts.check.releases` | yes |
| Removed repository | `scripts.check.removed` | yes |
| Existing repository | `scripts.check.existing` | yes |
| Catalog action | `action.yml` → `scripts.validate_repo` | yes |
| Action checks completed | shell gate over all of the above | always runs |

### Preflight

Clones `origin` (`STARTcloud/provisioner-catalog`, depth 1) into `/tmp/repositories/default` and runs `scripts.changed.repo`. The script loads the `repo` values from both the origin copy of `sources.yml` and the PR's copy, subtracts every repository already on `main`, and:

- exits 1 with `Bad data [...]` when more than one new repository remains;
- outputs the single new repository as the job output `repository`;
- outputs an empty string when nothing was added, which makes every candidate-scoped job skip via `if: needs.preflight.outputs.repository != ''`.

### Editable PR

`scripts.check.edits` reads the workflow event payload. The PR must have `maintainer_can_modify` set, unless its head branch already lives in `STARTcloud/provisioner-catalog`. Otherwise it fails with `The PR is not editable by catalog maintainers`. This job has no dependency on preflight and runs for every PR.

### Owner

`scripts.check.owner` compares the candidate repository's owner (the part before the slash, lowercased) against the PR author's login, in this order:

1. If the owner matches a login in `REMOVED_PUBLISHERS` (`scripts/remove_publishers.py`), the check fails: that publisher may not publish catalog repositories.
2. If the owner equals the PR author's login, the check passes.
3. Otherwise it fetches `/repos/<repo>/contributors` through the GitHub API with the workflow token. The author must appear in that list, and their contribution count must be at least one third of the top contributor's count, to pass as a major contributor. Anything less fails.

### Releases

`scripts.check.releases` calls `/repos/<repo>/releases` and passes when the response is a non-empty list. This check does not inspect the releases; the Catalog action does.

### Removed repository

`scripts.check.removed` loads `removed.yml` and fails when the candidate (lowercased) appears among the `removed` entries. A removed repository cannot be readmitted while it is listed there.

### Existing repository

`scripts.check.existing` fetches the live `https://provisioner-catalog.startcloud.com/catalog.json` and fails when the candidate already appears as the `repo` of any published provisioner. When the published catalog cannot be fetched at all, the check logs that nothing is published yet and passes.

### Catalog action

Runs the repository's own `action.yml` (`uses: ./`) against the candidate, which executes `python3 -m scripts.validate_repo --repo <candidate>`. This is the same validation submitters run in their own CI, and it enforces the artifact contract against published releases:

| Check | Outcome on failure |
| --- | --- |
| Repository reference is `owner/name` | error |
| At least one published release (drafts and prereleases are ignored) | error |
| At least one versioned `<name>-<version>.tar.gz` asset across those releases | error |
| For each family's latest version: the asset downloads within the 2 GiB cap | error |
| `<asset>.sha256` sidecar downloads, contains a sha256, and matches the asset | error |
| Sidecar asset is absent | warning |
| Every archive member lives under `<name>/<version>/` | error |
| No absolute paths, drive-letter paths, or `..` segments | error |
| No symlink or hardlink escaping the package root | error (links inside the root are a warning) |
| At most 200,000 members and at most 8 GiB decompressed | error |
| `<name>/<version>/provisioner.yml` present and parseable as a mapping | error |
| `<name>/<version>/templates/Hosts.template.yml` present | error |
| Manifest `name` equals the archive family, manifest `version` equals the archive version | error |
| Version is semver-shaped | error |
| Manifest has a non-empty `description` and `label` | warning |

Only the latest version of each family is downloaded and scanned. After the checks the action also reports the family's measured quality tier and any unmet rules; the tier is informational and never gates admission. The job exits 1 when any error was reported; warnings alone pass.

### Action checks completed

The final job depends on every other job, runs with `if: always()`, and fails when any dependency's result is `failure` or `cancelled`. Skipped candidate-scoped jobs (tooling PRs) count as passing, so this single job is the one to require in branch protection.

### Review and merge

A maintainer reviews the PR and merges it with a conventional commit. Schema validation and sortedness (below) run on the same PR through `ci.yml`.

## Timing

Merging an admission PR admits the repository and nothing more. Publishing is the data job's work, `.github/workflows/generate-catalog-data.yml`, which reads `sources.yml` and `removed.yml` from `main` and can never admit anything itself.

| Trigger | When | Deploys when |
| --- | --- | --- |
| `schedule` | cron `0 */2 * * *`, every two hours | the generated data differs from what is live |
| `workflow_call` from `release-please.yml` | after a push to `main` whose release-please step created a release | always on the push chain, so a UI pin bump ships too |
| `workflow_dispatch` | manual run, or the admin rebuild button in the web UI | data changed, or `forceRepositoryUpdate` is set |

The push-to-main chain in `release-please.yml` is CI → release-please → data job, and the data job step runs only when `release_created` is true. A merge that does not mint a release relies on the two-hour cron, which is why the documented expectation is that a newly admitted repository appears within about two hours.

Manual dispatch takes two inputs: `forceRepositoryUpdate` (publish even when unchanged) and `requested_by` (a user UUID to notify when the run finishes). The web UI exposes this as **Rebuild catalog data** in the user menu for signed-in users whose token carries `ROLE_ADMIN`; the Cloudflare Worker's `POST /admin/rebuild` verifies that role and dispatches the workflow on `main` with `forceRepositoryUpdate` set and `requested_by` filled from the token. The UI then polls `GET /admin/rebuild/status` every ten seconds, and the workflow's `notify-requester` job sends a hub notification and a push event to that user when the build and deploy conclude.

Each run of the build:

1. Lists every admitted repository's published releases and collects the versioned assets.
2. Hashes every asset, verifies sidecars, and parses `name` and `description` from the manifest inside the latest release's archive.
3. Validates `catalog.json` and `health.json` against their schemas.
4. Fetches the currently published `catalog.json` and runs the immutability tripwire: an already-published version whose asset now hashes differently fails the run with exit 2 and publishes nothing.
5. Writes `changed=true|false` so the deploy job only ships when the data differs.

After admission, new versions need no further catalog interaction: publish a release in the admitted repository and the next data run records it. Deleting a release drops that version on the next run.

## Removal

`removed.yml` is the post-admission blacklist. It holds a single `removed` array whose entries carry `repo` (same `owner/name` pattern as `sources.yml`) and a non-empty `reason`, both required by `schema/removed.schema.json`:

```yaml
removed:
  - repo: owner/name
    reason: "Why this repository was removed"
```

Removal is a maintainer action made through a pull request like any other change, reserved for repositories found malicious, persistently broken, or abandoned. Appeals are made by opening an issue.

### What removal does

- `scripts/build_catalog.py` reads `removed.yml` alongside `sources.yml` and skips every listed repository (case-insensitively), logging that it is excluded. The repository does not need to be deleted from `sources.yml` for the exclusion to apply.
- On the next data run the repository's families and every published version of them vanish from `catalog.json` and `health.json`. The tripwire treats a version that no longer exists upstream as an allowed drop, so removal never trips it.
- Change detection sees the difference and deploys.
- `scripts.check.removed` blocks any new admission PR for the repository while it stays listed.

The catalog serves metadata, never bytes. Removal deletes nothing from the author's GitHub releases, and machines already provisioned from a removed version keep their working copies.

### Publisher-level bans

`scripts/remove_publishers.py` holds `REMOVED_PUBLISHERS`, a Python list of `{"publisher": "<github login>", "link": "<issue url>"}` entries. The Owner check refuses any admission whose repository owner matches a listed publisher. The list is empty.

## Schema validation and sortedness

`.github/workflows/ci.yml` runs on every PR to `main` and is called by `release-please.yml` on every push to `main`. Two of its jobs guard the hand-edited lists:

| Job | Command | What it enforces |
| --- | --- | --- |
| JSON schema | `python3 -m scripts.validate_schemas` | `sources.yml` against `schema/sources.schema.json` and `removed.yml` against `schema/removed.schema.json` (JSON Schema draft 2020-12 with format checking), plus case-insensitive duplicate detection across `sources` entries |
| Sorted | `python3 -m scripts.is_sorted` | `sources.yml` entries are in case-folded alphabetical order; on failure it prints the expected and actual order |

Both schemas set `additionalProperties: false` at every level and `uniqueItems: true` on the array, so a stray key, a second key on an entry, or an exact duplicate fails validation. `is_sorted.py` checks `sources.yml` only. `validate_schemas.py` also accepts `--catalog` to validate a generated `catalog.json` against `schema/catalog.schema.json`, which the data job does on every build.

The same workflow runs actionlint over the workflows, lints the Markdown and formatting, builds the docs, and chains CodeQL.

## Ambiguity rule

A provisioner family is identified by the `<name>` prefix of its versioned asset filename, not by the repository. While building, `scripts/build_catalog.py` remembers which repository first published each family, in `sources.yml` order. When a second repository publishes an asset with the same family name, the builder reports:

```text
family '<name>' is published by both <first repo> and <second repo> — ambiguous, refusing to build
```

That is an error, and a build with any error publishes nothing: the run exits 1 before the tripwire and deploy steps, so the entire public catalog stays at its last published state until the collision is resolved. The private per-organization builder applies the same rule within each organization.

The admission checks compare repositories, not family names, so a name collision is not caught at PR time. Pick a family name that no admitted repository already publishes.

## Next Steps

1. **[Publishing a Provisioner](../publishing-a-provisioner/)** — the artifact contract, the validation action, and the release workflow
2. **[Quality Tiers](../quality-tiers/)** — the machine-measured ladder reported by the validation action and rendered on the web UI

---

Need help? See [SUPPORT.md](https://github.com/STARTcloud/provisioner-catalog/blob/main/SUPPORT.md) or the [GitHub repository](https://github.com/STARTcloud/provisioner-catalog).

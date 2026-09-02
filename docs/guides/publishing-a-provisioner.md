---
title: Publishing a Provisioner
layout: default
nav_order: 2
parent: Guides
permalink: /guides/publishing-a-provisioner/
---

# Publishing a Provisioner

{: .no_toc }

The provisioner author's contract: what your repository's releases must carry for the catalog to record them, what the validation action checks, and what the catalog shows once you are admitted. Everything on this page is enforced by `scripts/validate_repo.py` and `scripts/build_catalog.py` in the [catalog repository](https://github.com/STARTcloud/provisioner-catalog); the reference implementation is [STARTcloud/startcloud_generic_provisioner](https://github.com/STARTcloud/startcloud_generic_provisioner).

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## The artifact contract

The catalog reads your repository's **GitHub releases** and nothing else. It never reads tags, branches, or repository metadata. Your repository needs zero secrets from the catalog and grants it nothing; the data job only reads your public release assets.

### Asset naming

Each release carries one immutable versioned archive per provisioner family:

```text
<name>-<version>.tar.gz
```

The asset filename is matched with a fixed pattern: a **name** made of letters, digits, dots, underscores and hyphens, then a single hyphen, then a **version** of three dot-separated numbers optionally followed by a suffix of letters, digits, dots, plus signs and hyphens, then the literal `.tar.gz`. Every archive in a release whose name matches this pattern is a catalog artifact; everything else is ignored.

The version-less `<name>.tar.gz` "latest" alias that every release also carries never matches the pattern and is **never recorded** in the catalog. It exists as a convenience for direct consumers only. Ship it anyway: its presence is a Bronze quality rule.

### Semver

The version in the filename must be semver-shaped: `MAJOR.MINOR.PATCH` with an optional suffix. A version that fails this shape is an error. When one family has several versions, the latest is chosen by numeric major/minor/patch, with a release ranking above a suffixed prerelease of the same triple.

### Registry-shaped archives

The tar.gz is **registry-shaped**: every member lives under `<name>/<version>/`. Package files are never placed at the top level of the archive. The bare `<name>` and `<name>/<version>` directory entries are permitted; any other member outside `<name>/<version>/` fails validation as "not registry-shaped".

```text
<name>/<version>/
  provisioner.yml
  templates/
    Hosts.template.yml
  provisioners/
    ansible_collections/…
```

### provisioner.yml must match the archive

The archive must contain `<name>/<version>/provisioner.yml`, and it must be parseable YAML whose top level is a mapping. Its `name:` must equal the archive family and its `version:` must equal the archive version. The version in the filename, the directory path, and the manifest all agree, or validation fails. The manifest is the version source of truth; the example build workflow refuses to run when the requested version does not match it.

### Required template

`<name>/<version>/templates/Hosts.template.yml` must exist in the archive. A missing template is an error.

### Provider verification

The catalog does not take a provider's word for it. For every value the manifest offers on its `VAGRANT_PROVIDER` field it renders the shipped `Hosts.template.yml` with a fixed context and asks the box catalog the render points at whether an image exists. The result feeds `health.providers`, the per-version `health.versions`, the provider chips on the card, and the `platinum.multi_provider` rule; see [Quality Tiers](../quality-tiers/).

The render context stands in for what the agents supply at machine-create time, and is deliberately the smallest thing that lets the template's own `default(...)` filters apply:

| Variable | Value |
| --- | --- |
| `settings` | `{ hostname: "catalog", domain: "example.invalid", server_id: "1", vcpus: 2, memory: 4096 }` — every other `settings.*` key is undefined, so the template's defaults (box, box_url, box_version, box_arch, provider_type, os_type, …) are what get rendered |
| `networks` | `[]` |
| `disks` | undefined — the template's package-default branch renders |
| `roles` | `[]` |
| every configuration field | its declared `default`, under the field's `name`; a field without a `default` is undefined and renders empty |
| `VAGRANT_PROVIDER` | the provider under test |

Provider names are not a catalog list: a provider is any name a box catalog serves an image under, spelled the way its Vagrant plugin registers it (`zone`, not `zones`; `digital_ocean`; `docker`), and the manifest's option values must use that exact spelling or nothing ever verifies. Undefined variables render as empty strings rather than failing, matching Jinja's default behaviour. The rendered text must parse as YAML to a mapping whose `hosts[0].settings` carries `box` (`<org>/<name>`), an `https://` `box_url`, `box_version` and `box_arch`; `provider_type`, when present, must equal the provider under test. The catalog then requests `<box_url>/<box>` with a `Vagrant/` user agent — the Vagrant box metadata document BoxVault and every Vagrant-compatible catalog serve — and requires an entry under the matching `version` whose provider `name` is the provider under test and whose `architecture` is `box_arch`.

| Outcome | Meaning |
| --- | --- |
| verified image | the render worked and the box catalog lists the image — the provider counts |
| no image found | the template does not render for that provider, names no box, or the box catalog has no such version/provider/architecture — the provider does not count |
| box catalog did not answer | network failure, `5xx`, `401` or `403` — could not measure; the previously published answer for that version is kept |

Run it before you release:

```bash
python3 -m scripts.validate_repo --tree /path/to/package/root
```

prints one line per listed provider with the outcome and the box it resolved.

### The `.sha256` sidecar

Every archive asset carries a companion asset named `<asset>.sha256` in `sha256sum` format:

```text
<64 hex characters>  <asset filename>
```

The catalog takes the first line containing a 64-character hex token as the expected digest and compares it with the sha256 it computes from the downloaded asset.

| Sidecar state | Validation action | Data job |
| --- | --- | --- |
| Present and matching | Pass | Version recorded |
| Present but wrong | **Error** | Version refused; the build fails and nothing is published |
| Present with no sha256 in it | **Error** | Version refused |
| Missing | **Warning** | Version recorded with a warning; the family's health shows `checksum sidecars incomplete` |

Sidecars are required for new admissions. The missing-sidecar case is a warning rather than an error only because the first admitted repository predates the requirement.

### Archive safety scan

The latest version of each family is downloaded in full and scanned before its manifest is read. Any of the following is an error and the archive is rejected:

| Check | Limit |
| --- | --- |
| Member count | at most 200,000 members |
| Compressed download size | at most 2 GiB per asset |
| Decompressed total size | at most 8 GiB across regular files |
| Sidecar download size | at most 64 KiB |
| Absolute member paths | none: no leading `/`, no drive-letter prefix |
| Path traversal | no `..` component anywhere in a member path |
| Symbolic and hard links | the target must resolve inside `<name>/<version>/`; absolute targets are rejected |
| Unreadable archive | not a valid gzip tar |

A link member that stays inside the package root passes with a warning, because agents do not materialize links.

Only the latest version is deep-scanned. Older versions are checksummed by streaming, without retaining bytes, so the same download caps apply.

## provisioner.yml fields the catalog reads

| Field | Required | Where it appears |
| --- | --- | --- |
| `name` | yes | Family slug; must match the archive filename prefix and directory. Letters, digits, dots, underscores and hyphens only. This is the `name` in `catalog.json` |
| `version` | yes | Must match the archive version; semver-shaped |
| `description` | recommended | The `description` in `catalog.json` and on the web UI card. Empty raises a warning and shows as "No description provided." |
| `label` | recommended | Display title on the web UI card; the slug is shown beneath it. Empty raises a warning |
| `icon` | optional | URL rendered as the card icon; a cube placeholder is used when absent or unreachable |
| `homepage` | optional | URL rendered as a home link on the card |

`label`, `icon` and `homepage` travel in `health.json`, the UI-facing companion to `catalog.json`; agents never see them. `description` and `label` being filled are Bronze quality rules. The quality rules additionally read configuration fields (any mapping with `name` and `type` under a `configuration` subtree, with `label` and `tooltip`) and declared roles (`roles:` or `metadata.roles`, with `label` and `description`); see [Quality Tiers](../quality-tiers/).

All of these are parsed from the manifest **inside the latest release's artifact**, never from the GitHub repository's description, topics, or homepage settings.

## Releases

Only **published** releases count. Drafts and prereleases are ignored entirely: a repository whose only releases are drafts or prereleases validates as having no releases. Releases are read newest first, and the first occurrence of a `(family, version)` pair wins. The release's publish time becomes that version's `released_at` in the catalog.

The release tag form is not part of the contract. The catalog matches the `<name>-<version>.tar.gz` asset filename and never reads the tag.

One repository may publish several families, each with its own versioned archives. A family name may be published by only one admitted repository; a second repository shipping the same family name fails the catalog build as ambiguous.

## The validation GitHub Action

The catalog repository is itself a composite GitHub Action. It validates a repository's published releases through the GitHub API, exactly as the data job sees them, and runs the same checks the admission gate runs against your pull request.

### Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `repository` | the repository running the workflow | `owner/name` to validate |
| `github-token` | the workflow token | Token for release listing and asset download |

With a token, assets are fetched through the API asset endpoint, so a **private** provisioner repository can run the action with its own workflow token.

### Adding it to your CI

`validate.yml` is one of the nine files in the family CI set ([Provisioner CI/CD](../provisioner-ci/)); copied from the reference repository it runs after every build and on a daily cron. Its standalone form, for a repository not yet on the family set:

```yaml
name: Validate

on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * *'
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  catalog:
    name: Provisioner Catalog Validation
    runs-on: ubuntu-latest
    steps:
      - name: Run provisioner-catalog validation
        uses: STARTcloud/provisioner-catalog@main
```

No checkout is needed: the action validates your published releases, not your working tree. Green runs of this workflow are part of the admission checklist.

### What it checks per family

1. At least one published release carrying a versioned `<name>-<version>.tar.gz` asset
2. The latest version's archive downloads within the size cap
3. The sidecar matches the computed sha256 (error when wrong, warning when missing)
4. The archive passes the safety scan, is registry-shaped, contains a parseable `provisioner.yml` with matching name and version, and ships `templates/Hosts.template.yml`
5. Informational: the measured quality tier and the list of unmet rules

Grading never gates validation; only the checks above do.

### `--repo` and `--tree` modes

The action runs `python3 -m scripts.validate_repo --repo <owner/name>`. The script also has a `--tree` mode for a working tree:

```bash
pip install -r requirements.txt
python3 -m scripts.validate_repo --repo owner/name
python3 -m scripts.validate_repo --tree /path/to/package/root
```

| Mode | What it validates | When |
| --- | --- | --- |
| `--repo` | Published releases: assets, sidecars, archive shape, safety scan, manifest match | After a release exists |
| `--tree` | The working-tree manifest: `provisioner.yml` present at the package root, `name` is a slug, `version` is semver-shaped, `description` and `label` filled (warnings), `templates/Hosts.template.yml` present; reports undocumented configuration fields and roles; renders the template per listed provider and checks the box catalog for each | Before a release exists, in a pull request |

Archive shape, sidecars and checksums can only be checked against published releases, so `--tree` catches a malformed manifest early and `--repo` remains the gate. Both flags may be given together. The token defaults to `$GITHUB_TOKEN`.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Valid; warnings are allowed |
| `1` | Errors found |

In GitHub Actions the findings are also emitted as `::error::` and `::warning::` annotations.

## Release workflow

The build that produces conforming assets is `build-provisioner.yml` plus the `stage-seed` action, two of the nine files in the family CI set — copied as is from [startcloud_generic_provisioner's `.github/`](https://github.com/STARTcloud/startcloud_generic_provisioner/tree/main/.github) and never edited per repository. [Provisioner CI/CD](../provisioner-ci/) lists all nine and why they are shaped that way. In outline:

1. `release-please.yml` calls the build when a release is created, passing the version and tag.
2. `stage-seed` reads `name:` and `version:` from `provisioner.yml`, downloads the pinned core driver and collection releases named in `driver.version` and `collections/*.version` (sha256-verified), and stages the registry-shaped `<name>/<version>/` tree. The build refuses when the manifest version differs from the release version, so the filename, the directory and the manifest can never disagree.
3. Four assets are built and uploaded: `<name>-<version>.tar.gz`, the `<name>.tar.gz` latest alias, and one `sha256sum` sidecar for each.
4. `validate.yml` runs against the release the moment the assets exist.

The upload replaces same-named assets on the release. Never re-run the build against a version the catalog has already published; see [Immutability](#immutability).

Any process that produces conforming release assets is acceptable.

## What the catalog shows

Once admitted, the data job rebuilds `catalog.json` and `health.json` every ~2 hours and the web UI renders both.

- **Description** comes from the `provisioner.yml` inside the latest release's artifact, never from the repository's GitHub description. A broken archive costs the family its description, not the whole build.
- **Label** is the card title; the `name` slug is shown under it. **Icon** is rendered from the manifest URL, with a placeholder when absent. **Homepage** adds a home link beside the GitHub and report-an-issue links.
- **Per-version release dates**: each version carries `released_at`, the publish time of the GitHub release that shipped it, rendered as a localized date in the version list. The list shows the newest ten versions with a control to show all.
- **Checksums and download links**: every version lists its versioned asset URL and `sha256:` digest.
- **Health**: days since the latest release, total GitHub download count of the family's versioned assets, a stale chip when the last release is older than 365 days, and chips for artifact errors or incomplete sidecars from the current run.
- **Providers**: one chip per provider with a verified image in any recorded version, coloured by how many versions verify it; each version row lists the providers verified for that exact version. See [Provider verification](#provider-verification).
- **Quality**: the measured tier badge and the list of unmet rules; see [Quality Tiers](../quality-tiers/).
- **Search** matches name, description, repository and label.

Agents read `catalog.json` alone and verify the recorded sha256 after downloading an artifact.

## Immutability

Published bytes never change. Every data run compares the freshly computed checksums against the currently published `catalog.json`:

- An already-published version whose asset now hashes differently, or whose artifact URL disappeared while the version still exists, trips the **immutability tripwire**: the build fails loudly with exit code `2` and nothing is published.
- Versions may disappear: deleting a release removes that version from the catalog on the next run, and machines already built from it are unaffected.
- New versions may appear: publishing a release adds them on the next run.

Need to rebuild a version? Ship it as a **new version**. Never replace the assets of a release the catalog has recorded. There is no deprecate or yank machinery and no central per-version state; you manage your releases as you see fit.

---

Next: [Admission](../admission/) to open the one-line `sources.yml` pull request, and [Quality Tiers](../quality-tiers/) for the rules behind the badge.

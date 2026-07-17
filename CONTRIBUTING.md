# Contributing to the STARTcloud Provisioner Catalog

This document is the **submitter onboarding guide**: how to get your
provisioner repository listed in the catalog. (Tooling and documentation
contributions are covered at the [end](#contributing-to-the-catalog-tooling).)

## The model in one paragraph

Humans admit repositories; a scheduled data job publishes version data;
authors own their releases. You PR **one line** into
[sources.yml](sources.yml). After merge, the data job picks up your GitHub
releases automatically — every ~2 hours, forever. No catalog PRs for new
versions, no secrets, no tokens, no dispatch. Your repository stays entirely
yours.

## What your repository must have

The artifact contract, inherited from
[STARTcloud/startcloud_generic_provisioner](https://github.com/STARTcloud/startcloud_generic_provisioner)
(the reference implementation):

1. **A provisioner package** — a directory tree with, at minimum:

   ```text
   <name>/<version>/
     provisioner.yml                # REQUIRED — manifest: name, version, label, description, author
     templates/
       Hosts.template.yml           # REQUIRED — Jinja2 template rendering the provisioning document
     provisioners/
       ansible_collections/…        # vendored collections (as your roles need)
   ```

2. **Registry-shaped release archives**: the tar.gz contains
   `<name>/<version>/…` — never package files at top level. `name` and
   `version` come from `provisioner.yml`.

3. **The version source of truth is `provisioner.yml` `version:`** — the
   reference repo manages it with release-please, and its build refuses to run
   on a mismatch. However you manage it, the version in the filename, the
   directory, and the manifest must agree.

4. **Release assets** (per release):
   - `<name>-<version>.tar.gz` — immutable; the only artifact the catalog
     records
   - `<name>.tar.gz` — the mutable "latest" alias (convenience for direct
     consumers; the catalog never records it)
   - a `<asset>.sha256` sidecar for each archive

5. **Published releases only** — drafts and prereleases are ignored.

The [examples/](examples/) publisher kit contains a copy-paste
`build-provisioner.yml` that produces all of this.

**Immutability**: once a version is published in the catalog, its asset bytes
must never change — the data job's tripwire hard-fails on a mutated artifact.
Need to rebuild? Ship a new version.

## Step 1 — validate your releases in your own CI

Add the catalog's validation action to your repository (copy
[examples/validate.yml](examples/validate.yml) to
`.github/workflows/validate.yml`):

```yaml
- uses: STARTcloud/provisioner-catalog@main
```

It validates your **published releases** through the GitHub API: versioned
tar.gz present, registry shape, parseable `provisioner.yml` with matching
name/version, required template present, correct `.sha256` sidecars, and an
archive-content safety scan (no path traversal, no escaping links, size caps).

Get it green. Create a release **after** validation passes.

## Step 2 — open the admission PR

Add **one line** to [sources.yml](sources.yml):

```yaml
sources:
  # Your Name — what your provisioner family does
  - repo: your-org/your_provisioner
```

Keep the list alphabetized and include the attribution comment. Complete the
checklist in the PR template:

- publishing docs read (this file + the README)
- the validation action added to your repository's CI
- your repository's actions pass with no disabled checks
- links to the green validation runs
- a release created after validation passed

## Step 3 — review and merge

Required PR checks extract YOUR repository from the sources.yml diff (one
admission per PR) and target it alone — HACS-style: PR editability, the
submitter owns the repo (or is a major contributor), releases exist, not
previously removed, not already listed, and the full validation action run
against your releases. Schema and sortedness checks cover the edited lists.
A maintainer reviews — this review is the catalog's moderation gate — and
merges with a conventional commit.

**Your packages appear in the published catalog within ~2 hours** (the next
data-job run). No catalog release needed.

## After admission

- **New versions**: just publish releases in your repository. The data job
  records them automatically.
- **Deleting a release** removes that version from the catalog on the next
  run. Machines already built from it keep their working copies.
- **There is no deprecate/yank machinery** — no central per-version state
  exists. Manage your releases as you see fit.
- **Removal**: repositories found malicious or persistently broken are added
  to [removed.yml](removed.yml) with a reason and vanish from the generated
  data. Appeal by opening an issue.

## Running your own catalog instead

Prefer not to be listed here? Fork this repository as a template and run your
own catalog with your own admission list — agents accept multiple catalog
URLs. See the README's "door two" section.

## Contributing to the catalog tooling

Bug fixes and improvements to the scripts, schemas, workflows, and docs are
welcome:

- **Conventional commits** are required — release-please builds this repo's
  version and CHANGELOG from them.
- CI runs schema validation, sortedness, actionlint, and CodeQL on every PR;
  admission PRs additionally run the candidate-scoped checks (checks.yml).
- Run the tooling locally with the pinned Python (see `.python-version`),
  from the repo root:

  ```bash
  pip install -r requirements.txt
  python3 -m scripts.validate_schemas
  python3 -m scripts.is_sorted
  python3 -m scripts.validate_repo --repo STARTcloud/startcloud_generic_provisioner
  python3 -m scripts.build_catalog --out /tmp/catalog.json \
    --published-url https://provisioner-catalog.startcloud.com/catalog.json
  ```

- Keep it static: no server code, no site generators, no runtime dependencies
  beyond the workflows. Everything stays hand-editable.

## Code of Conduct and license

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By
contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE.md).

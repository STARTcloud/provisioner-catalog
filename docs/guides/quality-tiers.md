---
title: Quality Tiers
layout: default
nav_order: 5
parent: Guides
permalink: /guides/quality-tiers/
---

# Quality Tiers

{: .no_toc }

Every provisioner family in the catalog carries a measured quality tier. Tiers are **machine-measured, never author-declared, never manually adjusted**: on every data run the builder re-checks each rule against the released archive, the packaged `provisioner.yml`, the repository's published releases, and its workflow files. There is no field to fill in and no maintainer knob — the only way to a better badge is a better package.

Grading never gates admission. The hard gates (registry shape, manifest name/version match, the required template, `.sha256` sidecars, the archive safety scan, the immutability tripwire) live in the validation action and the builders; a package that violates them never appears in the data at all. A package that passes them is listed whatever its tier, including `unrated`.

Security is never graded. Ejecting a bad actor is `removed.yml`'s job.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## The ladder

```text
unrated < bronze < silver < gold < platinum
```

A family's tier is the **highest tier whose rules pass together with every rule of every lower tier**. Evaluation walks the ladder from bronze upward and stops at the first tier with any failing rule; the tier below that is the grade. Failing even one bronze rule shows as `unrated`.

| Tier       | What it says about the package                                                            |
| ---------- | ----------------------------------------------------------------------------------------- |
| `unrated`  | At least one bronze rule fails                                                            |
| `bronze`   | Manifest identity filled in, versions are semver, the latest alias is published           |
| `silver`   | Documented in the archive, released within the last year, lints in CI                     |
| `gold`     | Every configuration field and every role is documented, an example Hosts file ships       |
| `platinum` | Roles have molecule tests that run in CI, multiple providers, regular release cadence     |

Every rule is a plain boolean. Rules are always evaluated for all four tiers, so `health.json` lists what a `bronze` family is missing for `platinum` even though only bronze counts toward its badge.

All measurements are taken from the family's **latest version** (highest semver among the versioned `<name>-<version>.tar.gz` assets) except where a rule explicitly looks across releases.

---

## Bronze rules

| Rule                     | Measured condition                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bronze.description`     | The packaged `provisioner.yml` has a `description:` that is non-empty after trimming whitespace                                                                                            |
| `bronze.label`           | The packaged `provisioner.yml` has a `label:` that is non-empty after trimming whitespace                                                                                                  |
| `bronze.semver_versions` | The family has at least one versioned asset, and every version matches `^[0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.+-]*$`                                                                          |
| `bronze.latest_alias`    | An asset named exactly `<family>.tar.gz` (the mutable "latest" alias) exists on any of the repository's published releases                                                                 |

---

## Silver rules

| Rule                               | Measured condition                                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `silver.changelog`                 | The latest archive contains the member `<family>/<version>/CHANGELOG.md`                                                                                                                                           |
| `silver.readme`                    | The latest archive contains the member `<family>/<version>/README.md`                                                                                                                                              |
| `silver.release_within_12_months`  | The newest `published_at` across the repository's published (non-draft, non-prerelease) releases is within the last 365 days                                                                                       |
| `silver.lint_ci`                   | A step line `uses: ansible/ansible-lint@…` appears in the repository's `.github/workflows/*.yml` and `*.yaml` files (first 20 files, first 256 KiB of each) — matched on the `uses:` line itself, so a comment mentioning ansible-lint does not count. An unreadable or missing workflows directory fails this rule |

---

## Gold rules

| Rule                             | Measured condition                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gold.config_fields_documented`  | The manifest declares at least one configuration field, and every field has a non-empty `label` and a non-empty `tooltip`. A field is any mapping with both `name` and `type` found anywhere beneath a `configuration` key (`configuration.basicFields`, `configuration.advancedFields`, `metadata.configuration.groups`, or any other nesting) |
| `gold.roles_documented`          | The manifest declares at least one role, and every role has a non-empty `label` and a non-empty `description`. Roles are read from top-level `roles:`, falling back to `metadata.roles`; top level wins when both exist                                                     |
| `gold.example_hosts`             | The latest archive contains `<family>/<version>/Hosts.example.yml` or `<family>/<version>/examples/Hosts.yml`                                                                                                                                                             |

---

## Platinum rules

| Rule                        | Measured condition                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platinum.automated_tests`  | The manifest declares roles and at least `max(1, ceil(roles × 0.5))` of them are **proven tested**. A declared role is proven when (1) some archive member path contains `/roles/<name>/molecule/` and that scenario holds a `molecule.yml` **and** a `converge.yml` or `verify.yml`, and (2) the repository that scenario came from carries a verified green molecule run. Scenarios under `provisioners/ansible_collections/<namespace>/<name>/` belong to the collection the package pins in `collections/<namespace>.<name>.version` (`<owner>/<repo> <tag>`); any other scenario belongs to the package's own repository at its release tag. Verification reads GitHub's check runs for that commit: every check run named `Molecule (…)` must have concluded `success`; a commit whose molecule legs were all skipped (release-please's release commit) is stepped over to its first parent, up to 10 commits. A failed leg, no molecule run within that walk, or a repository the data job cannot read means not proven. Scenarios shipped but never run, collections the manifest does not declare roles from, and an empty `tests/.keep` score zero |
| `platinum.multi_provider`   | The manifest's `VAGRANT_PROVIDER` configuration field(s) (name compared case-insensitively) offer at least two distinct **known** provider values among their `options[].value` entries (compared lowercased). Known providers: `virtualbox`, `utm`, `kvm`, `qemu`, `libvirt`, `bhyve`, `zones`, `vmware`, `vmware_fusion`, `vmware_desktop`, `hyperv`, `proxmox`, `aws`. Arbitrary option strings never count |
| `platinum.release_cadence`  | At least two published releases fall within the last 365 days, and the newest and oldest of those are at least 30 days apart. Two same-day releases do not pass                                                                                                                                                                                                                          |

---

## What health.json carries

Beside every `catalog.json` — public and per-organization private — the data job writes a `health.json` validated against `schema/health.schema.json`. Agents never read it; `catalog.json` stays the only wire contract. The web UI reads it to decorate the cards.

`provisioners` is an object keyed by family name. Each entry:

| Field                       | Content                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `repo`                      | `owner/name` of the source repository                                                                                     |
| `tier`                      | `unrated`, `bronze`, `silver`, `gold`, or `platinum` — recomputed every run                                                |
| `presentation.label`        | `label:` from the packaged manifest, `""` when absent                                                                     |
| `presentation.icon`         | `icon:` URL from the packaged manifest, `""` when absent                                                                  |
| `presentation.homepage`     | `homepage:` URL from the packaged manifest, `""` when absent                                                              |
| `rules`                     | `{bronze, silver, gold, platinum}`, each a map of rule name to boolean                                                     |
| `failed_rules`              | Every failing rule as `tier.rule`, in ladder order (for example `silver.lint_ci`)                                          |
| `health.latest_version`     | The version the rules were measured against                                                                               |
| `health.latest_release_at`  | Newest release publish time as `YYYY-MM-DDTHH:MM:SSZ`, or `null` when GitHub reports none                                 |
| `health.artifacts_ok`       | `false` when any versioned asset of the family failed to download during this run                                         |
| `health.sidecars_ok`        | `false` when any version lacks a `.sha256` sidecar, its sidecar could not be downloaded, holds no sha256, or does not match the asset |
| `health.providers`          | Sorted list of the known providers offered by the manifest's `VAGRANT_PROVIDER` dropdowns                                 |
| `health.downloads`          | Total GitHub download count of the family's versioned assets across all published releases                                |

A change in `health.json` alone (a tier moving, a download count ticking up) is enough for the data job to redeploy, exactly as a `catalog.json` change is.

### How the web UI renders it

| Surface                      | Behavior                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tier badge                   | Top-right of the card, colored per tier (bronze `#cd7f32`, silver `#c0c0c0`, gold `#d4af37`, platinum `#e5e4e2`, unrated in the neutral secondary background). Tooltip: "Measured quality tier — recomputed every data run"        |
| Card title and icon          | `presentation.label` replaces the family slug as the title (the slug drops to a code line beneath when it differs from the repo name); `presentation.icon` renders as the card icon, falling back to a cube glyph on error or absence |
| Homepage link                | A home icon beside the GitHub and issue links when `presentation.homepage` is set                                                                                                                                                   |
| Meta line                    | "released Nd ago" from `latest_release_at` and "N downloads" from `downloads`                                                                                                                                                       |
| Stale chip                   | Yellow "stale — last release Nd ago" when `latest_release_at` is more than 365 days old                                                                                                                                             |
| Artifact-errors chip         | Red "artifact errors this run" when `artifacts_ok` is `false`                                                                                                                                                                       |
| Sidecar-gaps chip            | Yellow "checksum sidecars incomplete" when `sidecars_ok` is `false`                                                                                                                                                                 |
| Provider chips               | One grey chip per entry in `health.providers`, above the accordions                                                                                                                                                                 |
| Quality breakdown accordion  | Header "Quality: <Tier>"; body is "All quality rules pass." or "Unmet rules:" followed by every `failed_rules` code                                                                                                                  |

Cards without a matching `health.json` entry render with no badge, chips, or breakdown.

---

## How to raise a grade

Every rule maps to one concrete change in your repository or package. Ship it in a **new version** — published artifacts are immutable, and the next data run re-measures.

| Failing rule                     | Do this                                                                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bronze.description`             | Add a non-empty `description:` to `provisioner.yml`                                                                                                                                                            |
| `bronze.label`                   | Add a non-empty `label:` (the display name) to `provisioner.yml`; `name:` stays the slug                                                                                                                       |
| `bronze.semver_versions`         | Name every versioned asset `<name>-<major>.<minor>.<patch>[suffix].tar.gz`; delete or rename releases whose asset version is not semver-shaped                                                                 |
| `bronze.latest_alias`            | Upload `<name>.tar.gz` alongside the versioned archive on each release (the publisher kit's `build-provisioner.yml` does this)                                                                                  |
| `silver.changelog`               | Ship `CHANGELOG.md` at the package root so it lands at `<name>/<version>/CHANGELOG.md` in the archive (release-please generates one)                                                                             |
| `silver.readme`                  | Ship `README.md` at the package root so it lands at `<name>/<version>/README.md`                                                                                                                               |
| `silver.release_within_12_months`| Publish a release                                                                                                                                                                                              |
| `silver.lint_ci`                 | Add a `uses: ansible/ansible-lint@…` step to a workflow under `.github/workflows/` (the reference repository's `ci.yml` does)                                                                                   |
| `gold.config_fields_documented`  | Give every configuration field (each mapping with `name` and `type` under `configuration`) both a `label` and a `tooltip`; declare at least one field                                                           |
| `gold.roles_documented`          | Give every entry in `roles:` (or `metadata.roles`) both a `label` and a `description`; declare at least one role                                                                                               |
| `gold.example_hosts`             | Ship `Hosts.example.yml` at the package root, or `examples/Hosts.yml`                                                                                                                                          |
| `platinum.automated_tests`       | For at least half of the roles the manifest declares (minimum one): ship a `molecule.yml` plus a `converge.yml` or `verify.yml` under that role's `molecule/` directory in the archive, and make sure the repository those scenarios come from runs them green in CI as jobs named `Molecule (…)` before it cuts the release you pin — for staged collections that is the collection repository at the tag in `collections/<namespace>.<name>.version`; for the package's own roles it is this repository at the release tag |
| `platinum.multi_provider`        | Offer at least two of the known providers as `options[].value` on the `VAGRANT_PROVIDER` field                                                                                                                 |
| `platinum.release_cadence`       | Publish at least two releases in a rolling year, at least 30 days apart                                                                                                                                        |

Because the ladder is cumulative, fix the lowest failing tier first: a `gold` family with one failing bronze rule is `unrated` until that bronze rule passes.

---

## Where to see your grade before admission

The validation action (`uses: STARTcloud/provisioner-catalog@main`, which runs `python3 -m scripts.validate_repo --repo owner/name`) measures the tier on every run and prints it as informational lines per family, after the hard checks:

```text
owner/name my_provisioner-1.2.3: measured quality tier: silver
owner/name my_provisioner-1.2.3: unmet quality rules: gold.example_hosts, platinum.automated_tests, platinum.multi_provider
```

These lines never fail the action — only the hard checks set the exit code.

Before a release exists, `--tree <package-root>` checks the manifest side of the rules against a working tree: it warns on a missing `description` or `label` (bronze), and reports how many configuration fields lack a `label`/`tooltip` and how many roles lack a `label`/`description` (gold), naming each undocumented field and role. Archive-member rules (changelog, readme, example hosts, molecule scenarios) and release-based rules can only be measured against published releases with `--repo`.

```bash
pip install -r requirements.txt
python3 -m scripts.validate_repo --tree /path/to/your/package
python3 -m scripts.validate_repo --repo owner/name
```

Run from a checkout of the catalog repository. `--repo` reads `$GITHUB_TOKEN` when set, which is what lets a private repository validate its own releases.

The data job prints the same measurement in its build summary (`tiers: family=tier, …`) on every run, and the published badge updates within the next ~2-hour cycle after a release changes the result.

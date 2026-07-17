# Publisher kit — workflows for provisioner repositories

Copy-paste snippets for repositories that publish provisioner packages. Your
repo needs **no secrets and no dispatch into any other repo** — just GitHub
releases carrying the right assets.

| File | Copy to (in your repo) | What it does |
| --- | --- | --- |
| [build-provisioner.yml](build-provisioner.yml) | `.github/workflows/build-provisioner.yml` | Stages the registry-shaped tree (`<name>/<version>/…`), refuses on a provisioner.yml version mismatch, builds the versioned tar.gz + the "latest" alias, writes a `.sha256` sidecar for each, and attaches all four to the release. |
| [validate.yml](validate.yml) | `.github/workflows/validate.yml` | Runs the catalog's reusable validation action against your published releases (daily + on push/PR). Green runs here are part of the admission checklist. |

## The artifact contract

Inherited from [STARTcloud/startcloud_generic_provisioner](https://github.com/STARTcloud/startcloud_generic_provisioner),
the reference implementation:

- **Version source of truth** = your package's `provisioner.yml` `version:`.
  The reference repo manages it with release-please; the build refuses on a
  tag/version mismatch either way.
- **Registry-shaped archives**: the tar contains `<name>/<version>/…` — never
  package files at top level. `provisioner.yml` and
  `templates/Hosts.template.yml` are required package members.
- **Two archives per release**: `<name>-<version>.tar.gz` (immutable — the only
  thing the catalog records) and `<name>.tar.gz` (a mutable "latest" alias the
  catalog never records).
- **`.sha256` sidecars** on every asset (this catalog's addition to the
  contract). `startcloud_generic_provisioner` itself predates the sidecar
  requirement and is being updated by its maintainer; new repositories must
  ship sidecars from the start.

## Release orchestration

The reference repo wires it together with release-please: a `release-please.yml`
workflow on push to main runs CI, cuts releases, and calls
`build-provisioner.yml` (via `workflow_call`) when a release is created. Copy
that orchestration from
[startcloud_generic_provisioner's workflows](https://github.com/STARTcloud/startcloud_generic_provisioner/tree/main/.github/workflows)
if you want the same flow; any process that produces conforming release assets
is acceptable.

## Getting listed

Once your releases validate green, follow [CONTRIBUTING.md](../CONTRIBUTING.md):
one PR line into [sources.yml](../sources.yml) and your repo appears in the
published catalog within ~2 hours of merge.

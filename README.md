# STARTcloud Provisioner Catalog

The public catalog of **provisioner packages** — versioned directories
(`<name>/<version>/` with a `provisioner.yml` manifest, a
`templates/Hosts.template.yml` Jinja2 template, and vendored
`provisioners/ansible_collections/` content) consumed by
[hyperweaver-agent](https://github.com/Makr91/hyperweaver-agent) (Go) and
zoneweaver-agent (Node) to provision VMs and zones.

The public catalog is static JSON + GitHub Actions — no server in that path,
ever. The same domain also serves a browser UI, and an edge Worker gates
per-organization **private catalogs** (see below); neither touches the public
contract.

## The catalog URL

Agents fetch exactly one document:

```text
https://provisioner-catalog.startcloud.com/catalog.json
```

It regenerates every ~2 hours from the admitted repositories' GitHub releases.
Package archives themselves are downloaded from each repository's own release
assets — this catalog serves metadata, never bytes.

The same URL's root serves the catalog **web UI** ([web/](web/), React + Vite,
built into the Pages payload by the data job) — a human view of the same
public data, plus OIDC sign-in for private catalogs.

## How it works (the HACS model, adapted)

**Humans admit repositories; a scheduled job publishes data; authors own their
releases.**

- [sources.yml](sources.yml) is the admission list. Getting listed = one
  reviewed pull request adding your repo (see
  [CONTRIBUTING.md](CONTRIBUTING.md)).
- The **data job**
  ([generate-catalog-data.yml](.github/workflows/generate-catalog-data.yml),
  cron every 2 hours + manual dispatch with a force-update input) rebuilds
  `catalog.json` from the admitted repos' releases and deploys it to GitHub
  Pages **only when the data changed**. `catalog.json` is a build artifact —
  it is never committed to this repository.
- New releases in an admitted repo appear automatically on the next data run.
  No catalog PR, no catalog release — authors manage their own repositories
  like any GitHub project.
- [removed.yml](removed.yml) is the post-admission blacklist: repositories
  ejected for being malicious or broken vanish from the generated data.
- There is **no central per-version state** — no deprecate/yank machinery. A
  release you delete simply disappears from the catalog on the next run.
  Machines already built from it are unaffected.

## The consumer contract (`catalog.json`)

Schema: [schema/catalog.schema.json](schema/catalog.schema.json)
(JSON Schema draft 2020-12).

```json
{
  "name": "STARTcloud Provisioner Catalog",
  "format_version": 1,
  "updated": "2026-07-16T00:00:00Z",
  "provisioners": [
    {
      "name": "startcloud_generic_provisioner",
      "repo": "STARTcloud/startcloud_generic_provisioner",
      "description": "Generic provisioner for STARTcloud servers",
      "versions": [
        {
          "version": "0.1.26",
          "artifacts": [
            {
              "url": "https://github.com/STARTcloud/startcloud_generic_provisioner/releases/download/startcloud_generic_provisioner-v0.1.26/startcloud_generic_provisioner-0.1.26.tar.gz",
              "checksum_type": "sha256",
              "checksum": "…64 hex chars…"
            }
          ]
        }
      ]
    }
  ]
}
```

- `name`/`description` are parsed from the `provisioner.yml` **inside the
  latest release's artifact** — never from GitHub repo metadata.
- Artifact URLs are always the **immutable versioned assets**
  (`<name>-<version>.tar.gz`). The mutable `<name>.tar.gz` "latest" alias every
  release also carries is never recorded.
- Consumers verify the `sha256` checksum after download.
- `format_version` is the wire contract agents parse. It is separate from this
  repository's own release version and bumps only on breaking changes to this
  shape.
- Agents support **multiple catalog URLs** — this one is just the official
  default.

## Immutability

Published versions never change. The data job keeps the currently published
checksums and **fails loudly (the immutability tripwire)** if an
already-published version's asset ever hashes differently — a mutated artifact
is never silently accepted. Rebuilt artifacts must ship as a **new version**.

## Private per-organization catalogs

Organizations on the STARTcloud IdP can share **private provisioners** with
their members through the same page. Same contract, same builder pattern —
different visibility:

- The org→repos mapping (`sources-orgs.yml`) lives in a **private store
  repository** (`STARTcloud/provisioner-catalogs-private`), keyed by the IdP
  organization uuid — private repo names never appear in this public repo.
- The data job's `build-private` job reads each org's source repositories with
  a **GitHub App installation token** (the *STARTcloud Provisioner Catalog*
  App, Contents: read-only, installed by the owning org on just the selected
  repos), builds `orgs/<org-uuid>/catalog.json` with
  [scripts/build_org_catalogs.py](scripts/build_org_catalogs.py) — including
  the same sidecar verification and immutability tripwire — and commits the
  results back to the store.
- A **Cloudflare Worker** routed on `/private/*` serves those catalogs: it
  verifies the caller's Bearer JWT against the IdP's JWKS (issuer, audience,
  expiry) and requires the requested org uuid in the token's `organizations`
  claim. Membership = read access; everyone else gets 403. The Worker holds
  one read-only token scoped to the store repo, in Cloudflare secrets.
- The web UI signs users in with authorization-code + PKCE (public client, no
  secret), then fetches `/private/<org-uuid>/catalog.json` for each org in the
  token and renders them alongside the public catalog. Multi-org users see all
  their orgs — that is the cross-sharing mechanism.

Artifact URLs in private catalogs point at private release assets; consumers
need their own GitHub access to download them, exactly as they need it to
clone the repos.

## Quality tiers + health (health.json)

Beside every catalog.json the data job publishes a **health.json**
([schema](schema/health.schema.json)) the web UI renders as badges. Agents
never read it — the wire contract stays catalog.json alone.

- **Tiers are machine-measured, never author-declared** (deliberately unlike
  Home Assistant's scale): every rule is checked against the released
  artifact, the packaged provisioner.yml, the repository's releases and its
  workflow files on every data run. The only way to a better badge is a
  better package. Rules live in [scripts/quality.py](scripts/quality.py).
- Ladder: **Unrated** → **Bronze** (filled description/label, semver, latest
  alias) → **Silver** (CHANGELOG + README in the archive, release in the last
  12 months, ansible-lint in CI) → **Gold** (every config field labeled +
  tooltipped, every role documented, example Hosts) → **Platinum** (automated
  tests, multi-provider, release cadence).
- **Security is never graded** — the safety scan, sidecar verification and
  the immutability tripwire are hard gates; a package that violates them
  never appears in the data at all. Ejecting a bad actor entirely is
  [removed.yml](removed.yml)'s job — there is deliberately no human knob on
  the grades themselves.
- Live health rides along: last-release age, artifact/sidecar status from the
  current run.
- Presentation extras ride too: optional `label:`, `icon:` (URL) and
  `homepage:` (URL) in provisioner.yml surface on the web UI's cards — parsed
  from the packaged manifest like everything else, never from repo metadata.

The validation action reports the measured tier on every run, and its new
`--tree` mode checks a working tree's manifest before a release ever exists.

## Publishing your provisioner (door one)

Full walkthrough: [CONTRIBUTING.md](CONTRIBUTING.md). Short version:

1. Make your repo's releases conform to the artifact contract — the
   [examples/](examples/) publisher kit has copy-paste workflows
   (registry-shaped versioned tar.gz + `.sha256` sidecars, version sourced
   from `provisioner.yml`).
2. Add this repo's **validation action** to your CI and get it green:

   ```yaml
   - uses: STARTcloud/provisioner-catalog@main
   ```

3. Open a PR adding **one line** to [sources.yml](sources.yml), with the PR
   template's checklist completed.
4. A maintainer reviews and merges. Your packages appear in the published
   catalog within **~2 hours** (the next data run).

Your repository needs **zero secrets** and grants this catalog **nothing** —
the data job only reads your public releases.

## Running your own catalog (door two)

Fork this repository as a template: replace [sources.yml](sources.yml) with
your own admission list, point the two workflow URLs and the Pages custom
domain at your host, and you have an independent catalog with the same
contract. Agents accept multiple catalog URLs, so yours can sit alongside the
official one.

## Removal policy

Maintainers eject malicious or broken repositories by adding them to
[removed.yml](removed.yml) with a reason (a PR like any other change). Removed
repos disappear from the generated data on the next run. To appeal, open an
issue.

## Repository layout

| Path | What it is |
| --- | --- |
| [sources.yml](sources.yml) | Hand-edited admission list (the only way in) |
| [removed.yml](removed.yml) | Hand-edited post-admission blacklist |
| [action.yml](action.yml) | Reusable validation action for authors' CI |
| [schema/](schema/) | JSON Schemas for catalog.json, sources.yml, removed.yml |
| [scripts/](scripts/) | The validator and the catalog builders — public + per-org (Python) |
| [web/](web/) | The catalog web UI (React + Vite), built into the Pages payload |
| [.github/workflows/](.github/workflows/) | checks (admission gate), ci, codeql, release-please, generate-catalog-data |
| [examples/](examples/) | Copy-paste publisher kit for new provisioner repos |

The Cloudflare Worker gating `/private/*` is deliberately **not tracked
here** — it is deployed by hand with wrangler and its one secret lives only
in Cloudflare.

## This repository's own releases

Maintained by release-please with conventional commits, like every STARTcloud
repository. Releases version the catalog's tooling and documentation only —
published catalog **data** never waits for a release.

## License

[Apache License 2.0](LICENSE.md).

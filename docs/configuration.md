---
title: Configuration
layout: default
nav_order: 4
permalink: /configuration/
---

# Configuration Reference

{: .no_toc }

Operator reference for the STARTcloud Provisioner Catalog: the hand-edited repository lists, every GitHub Actions workflow and the secrets it reads, the Cloudflare Worker's vars and bindings, how the STARTcloud UI is pinned and shipped, the Python toolchain, and how the repository is versioned.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Repository lists

Two YAML files at the repository root are the only hand-edited inputs to the published data. Both are validated against draft 2020-12 JSON Schemas under `schema/` by `python3 -m scripts.validate_schemas`, which also rejects case-insensitive duplicate repositories that the schemas cannot express.

### sources.yml

The admission list. One entry per provisioner repository; adding a line here is the only way into the catalog.

```yaml
sources:
  - repo: owner/name
```

| Rule | Enforced by |
| --- | --- |
| Top-level key `sources`, an array of objects with exactly one key `repo` | `schema/sources.schema.json` (`additionalProperties: false`) |
| `repo` matches `^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/[A-Za-z0-9._-]+$` | `schema/sources.schema.json` |
| No duplicate repositories, compared case-insensitively | `scripts/validate_schemas.py` |
| Entries sorted by `repo`, case-folded | `python3 -m scripts.is_sorted` |
| One new repository per pull request | `scripts/changed/repo.py` diffs the PR's file against a clone of `main` and exits 1 when more than one repository was added |

Each entry carries an owner-attribution comment above it, per the contributing guide.

### removed.yml

The post-admission blacklist. A repository listed here is excluded from generated data even while it remains in `sources.yml`, and `scripts.check.removed` fails any admission PR that tries to re-add it.

```yaml
removed:
  - repo: owner/name
    reason: 'Why this repository was removed'
```

| Rule | Enforced by |
| --- | --- |
| Top-level key `removed`, an array of objects with exactly `repo` and `reason` | `schema/removed.schema.json` |
| `reason` is a non-empty string | `schema/removed.schema.json` |
| Empty list is `removed: []` | current file content |

`scripts/build_catalog.py` reads both files (`--sources`, `--removed`, defaulting to the root files) and logs each excluded repository.

### Publisher bans

`scripts/remove_publishers.py` holds `REMOVED_PUBLISHERS`, a Python list of `{"publisher": "<github login>", "link": "<issue url>"}` entries. `scripts.check.owner` refuses admission PRs whose repository owner appears in it. The list is currently empty.

---

## Workflows

All workflows live in `.github/workflows/`. Admission is human (PRs); data is scheduled; releases version tooling only.

| File | Trigger | What it does | What it publishes |
| --- | --- | --- | --- |
| `release-please.yml` | `push` to `main` | Runs `ci.yml` as a reusable workflow, then release-please with a GitHub App token minted from `BOT_APP_ID` / `BOT_PRIVATE_KEY`. When `release_created` is `true`, calls `generate-catalog-data.yml` with `secrets: inherit`. | Release PRs, GitHub releases, `CHANGELOG.md`, `version.txt`; catalog data on release |
| `ci.yml` | `workflow_call`; `pull_request` to `main` | Jobs `jsonschema` (`scripts.validate_schemas`), `sorted` (`scripts.is_sorted`), `actionlint` (`rhysd/actionlint:1.7.7`), `lint-and-format` (markdownlint, `prettier --check`), `docs` (Jekyll build, html-proofer), then `codeql-analysis` via `codeql.yml`. | Nothing |
| `checks.yml` | `pull_request` (`opened`, `synchronize`, `reopened`) to `main` | The admission gate. `preflight` clones `main` to `/tmp/repositories/default` and extracts the one added repository; `editable` runs `scripts.check.edits`; `owner`, `releases`, `removed`, `existing`, `catalog` (the local `action.yml` against the candidate) run only when a repository was added; `completed` fails if any dependency failed or was cancelled. Concurrency group `checks-<ref>`, cancel-in-progress. | Nothing; merging is admission only |
| `generate-catalog-data.yml` | `schedule` (`0 */2 * * *`); `workflow_call`; `workflow_dispatch` | See below. | `catalog.json`, `health.json`, `version.txt` and the STARTcloud UI to GitHub Pages; `orgs/<uuid>/catalog.json` and `health.json` committed to the private store |
| `deploy-worker.yml` | `push` to `main` touching `worker/**`; `workflow_dispatch` | `cloudflare/wrangler-action@v4` with `workingDirectory: worker` and `CLOUDFLARE_API_TOKEN`. | The Cloudflare Worker |
| `dependency-bump.yml` | `repository_dispatch` (`dependency-update`, sent by the STARTcloud UI's release workflow with `repo`, `tag` and `sha`); `workflow_dispatch` with a required `tag` | Rewrites `startcloudUiVersion` in `package.json` to the tag, commits `fix: bump startcloud-ui to <tag>` on `bump/startcloud-ui` as `startcloud-bot[bot]`, opens the pull request and enables squash auto-merge, all with a GitHub App token minted from `BOT_APP_ID` / `BOT_PRIVATE_KEY`; when `main` already pins the tag it closes any open bump PR instead. | One bump PR per UI release, merged when `ci.yml` is green |
| `codeql.yml` | `schedule` (`17 5 * * 4`); `workflow_call` | CodeQL matrix over `actions` and `python`, build mode `none`. | Code-scanning alerts |

### The release gate

Catalog data does not wait for a release of this repository, but the push-to-main chain publishes only when release-please actually creates one: `generate-catalog-data` in `release-please.yml` is guarded by `needs.release-please.outputs.release_created == 'true'`. Merges that produce no release rely on the two-hour cron or a manual dispatch.

### The data job

`generate-catalog-data.yml` has four jobs under concurrency group `catalog-pages` with `cancel-in-progress: false`, and workflow permissions `contents: read`, `pages: write`, `id-token: write`.

| Job | Runs when | Steps |
| --- | --- | --- |
| `build` | Always | `scripts.build_catalog --out dist/catalog.json --published-url https://provisioner-catalog.startcloud.com/catalog.json`, then the STARTcloud UI release named by `startcloudUiVersion` fetched into `ui/` and copied over `dist/` together with `version.txt`, the Jekyll docs copied to `dist/docs`, and `actions/upload-pages-artifact@v5` behind the deploy condition |
| `deploy` | Deploy condition true | `actions/deploy-pages@v5` to the `github-pages` environment |
| `notify-requester` | `always()` and event is `workflow_dispatch` with a non-empty `requested_by` | `scripts.notify_done` with `REQUESTED_BY`, `BUILD_RESULT`, `DEPLOY_RESULT` |
| `build-private` | Always; the build step only when `store/sources-orgs.yml` exists | Checks out `STARTcloud/provisioner-catalogs-private` into `store/` with `PRIVATE_CATALOG_PAT`, runs `scripts.build_org_catalogs --config store/sources-orgs.yml --store store`, and commits `orgs/` back as `github-actions[bot]` when `changed` is `true` |

Change detection: `scripts/build_catalog.py` compares the freshly built `catalog.json` and `health.json` (minus `updated`) against the currently published copies and writes `changed=true|false` to `$GITHUB_OUTPUT`. The Pages upload and deploy run when any of these hold:

- `steps.build.outputs.changed == 'true'`
- `github.event_name == 'push'` (the chain from `release-please.yml`, so a UI pin bump ships with a release)
- `github.event_name == 'workflow_dispatch'` and `inputs.forceRepositoryUpdate` is true

Exit codes from the builders: `0` built, `1` build or schema error (nothing published), `2` immutability tripwire (a published version's asset now hashes differently; nothing published).

`workflow_dispatch` inputs:

| Input | Type | Default | Effect |
| --- | --- | --- | --- |
| `forceRepositoryUpdate` | boolean | `false` | Deploy to Pages even when the generated data is unchanged |
| `requested_by` | string | `''` | User UUID to notify when the run finishes; enables the `notify-requester` job |

The Worker's `/admin/rebuild` endpoint dispatches this workflow with `forceRepositoryUpdate: 'true'` and `requested_by` set to the caller's UUID.

---

## Data job environment

Every environment variable and secret name read by the Python scripts and workflows. Values are never documented here.

| Name | Read by | Set in | Unlocks | When absent |
| --- | --- | --- | --- | --- |
| `GITHUB_TOKEN` | `scripts.validate_repo` (`--token` default), `scripts.build_catalog` (`--token` default), `scripts.check.owner`, `scripts.check.releases`, `action.yml` | `checks.yml`, `generate-catalog-data.yml`, `action.yml` (`github-token` input or `github.token`) | Authenticated GitHub API calls and private-repo asset downloads through the API asset endpoint | Anonymous API calls with the unauthenticated rate limit; asset downloads use `browser_download_url` |
| `TARGET_REPOSITORY` | `action.yml` | `repository` input or `github.repository` | Which repository the validation action validates | Defaults to the repository running the action |
| `REPOSITORY` | `scripts.check.owner`, `releases`, `removed`, `existing` | `checks.yml` from the `preflight` output | The candidate repository the admission checks target | Those jobs are skipped when the output is empty |
| `GITHUB_EVENT_PATH` | `scripts.helpers.event` | GitHub Actions runtime | The pull request payload for `scripts.check.edits` and `scripts.check.owner` | Not applicable outside Actions |
| `GITHUB_OUTPUT` | `scripts.build_catalog`, `scripts.build_org_catalogs` | GitHub Actions runtime | The `changed` step output | Output is not written; nothing else changes |
| `GITHUB_ACTIONS` | `scripts.validate_repo.Reporter` | GitHub Actions runtime | `::error::` / `::warning::` annotations when `true` | Plain `ERROR:` / `WARNING:` prefixes |
| `GITHUB_RUN_ID` | `scripts.notify_done` | GitHub Actions runtime | The idempotency key `catalog:rebuild:<run id>` | Falls back to `0` |
| `REQUESTED_BY` | `scripts.notify_done` | `generate-catalog-data.yml` from `inputs.requested_by` | The user UUID that receives the rebuild-finished notification | Script exits 0 without sending anything |
| `BUILD_RESULT`, `DEPLOY_RESULT` | `scripts.notify_done` | `generate-catalog-data.yml` from `needs.build.result`, `needs.deploy.result` | The notification's title and body | Rendered as `unknown` |
| `CATALOG_APP_ID` | `scripts.build_org_catalogs` (`--app-id` default) | `generate-catalog-data.yml` secret | Minting the GitHub App JWT that lists installations and mints per-owner installation tokens for private source repositories | `build_org_catalogs` errors `CATALOG_APP_ID / CATALOG_APP_PRIVATE_KEY are required` and exits 1 |
| `CATALOG_APP_PRIVATE_KEY` | `scripts.build_org_catalogs` (`--private-key` default) | `generate-catalog-data.yml` secret | The RS256 key (PEM) signing that App JWT | Same exit 1 |
| `PRIVATE_CATALOG_PAT` | `actions/checkout` in `build-private` | `generate-catalog-data.yml` secret | Checking out and pushing to `STARTcloud/provisioner-catalogs-private` | The store checkout fails and the job fails; the public `build` and `deploy` jobs are unaffected |
| `CATALOG_HUB_ISSUER` | `scripts.notify.send_hub_notification` | Not set by any workflow | The OIDC issuer whose token endpoint and `/api/notify` receive hub notifications | Defaults to `https://dev-auth.startcloud.com` |
| `CATALOG_HUB_CLIENT_ID` | `scripts.notify.send_hub_notification` | `generate-catalog-data.yml` secret (`notify-requester`, `build-private`) | Client-credentials grant with scope `notifications:write` | Logged as `hub notification skipped (no credentials)`; no error |
| `CATALOG_HUB_CLIENT_SECRET` | `scripts.notify.send_hub_notification` | Same | Same | Same |
| `CATALOG_PUSH_DISPATCH_URL` | `scripts.notify.send_push_dispatch` | Not set by any workflow | Where Web Push events are posted | Defaults to `https://provisioner-catalog.startcloud.com/push/dispatch` |
| `CATALOG_PUSH_DISPATCH_KEY` | `scripts.notify.send_push_dispatch` | `generate-catalog-data.yml` secret (`build`, `notify-requester`, `build-private`) | The `X-Dispatch-Key` header the Worker's `/push/dispatch` requires | Logged as `push dispatch skipped (no key)`; no error |
| `BOT_APP_ID` | `actions/create-github-app-token@v3` | `release-please.yml` and `dependency-bump.yml` secret (organization secret) | The App token release-please and the dependency bump use so their PRs and releases trigger workflows | The mint step fails and the job does not run |
| `BOT_PRIVATE_KEY` | `actions/create-github-app-token@v3` | Same | Same | Same |
| `CLOUDFLARE_API_TOKEN` | `cloudflare/wrangler-action@v4` | `deploy-worker.yml` secret | `wrangler deploy` of the Worker | The deploy job fails |

Hub notifications are sent from `build_org_catalogs` for every new `(family, version)` pair in a private catalog, addressed to `{"org_uuid": ...}`, and from `notify_done` addressed to `{"user_uuid": ...}`. Push dispatch events carry a `scope` of `public` (from `build_catalog`, only when a published baseline existed), `org` (from `build_org_catalogs`), or `user` (from `notify_done`). Both sends log and continue on failure; neither can fail a build.

---

## Worker configuration

`worker/wrangler.toml` configures the Cloudflare Worker `provisioner-catalog-gate` (`main = "src/index.js"`). It is deployed by `deploy-worker.yml` and by a manual `wrangler deploy` from `worker/`.

### Routes

One route on zone `startcloud.com`, `provisioner-catalog.startcloud.com/*`; the `provisioner-catalog` DNS record must be proxied for it to intercept traffic. The Worker answers the prefixes and paths below itself and proxies every other request to GitHub Pages, answering a Pages `404` for a page request (`GET`, `text/html`, no file extension) with `index.html` so the web UI's deep links load.

| Prefix | Purpose |
| --- | --- |
| `/private/*` | Per-organization catalogs |
| `/push/*` | Web Push subscriptions and dispatch |
| `/admin/*` | Admin rebuild trigger and status |
| `/watches` | The caller's watched provisioners |
| `/api/status` | The app identity the STARTcloud UI probes before it renders |
| `/health`, `/config` | The Worker's health document and the estate settings |

### KV binding

| Binding | Contents |
| --- | --- |
| `SUBS` | Web Push subscriptions keyed `sub:<base64url sha256 of endpoint>`; each record holds `endpoint`, `p256dh`, `auth`, the subscriber's `uuid`, and the lowercased `orgs` from their token |

### Vars

Plain-text values under `[vars]`; edit and redeploy to change.

| Var | Meaning |
| --- | --- |
| `ISSUER` | OIDC issuer, matched exactly against the token's `iss` claim and used for discovery (`/.well-known/openid-configuration`) and the JWKS |
| `AUDIENCE` | Required member of the token's `aud` claim; the registered client id `provisioner-catalog` |
| `STORE_REPO` | The private store repository (`STARTcloud/provisioner-catalogs-private`) whose `orgs/<uuid>/<file>.json` is proxied through the GitHub contents API |
| `ALLOWED_ORIGINS` | Comma-separated origins granted CORS (`GET, POST, DELETE, OPTIONS`; headers `Authorization, Content-Type`); the production host and `http://localhost:8080` |
| `VAPID_PUBLIC_KEY` | The application server key returned by `/push/vapid-key` and sent in the `vapid` authorization header |
| `VAPID_SUBJECT` | The `mailto:` subject claim of the VAPID JWT |
| `DISPATCH_REPO` | Repository whose workflow `/admin/rebuild` dispatches (`STARTcloud/provisioner-catalog`) |
| `DISPATCH_WORKFLOW` | The workflow file dispatched (`generate-catalog-data.yml`) |

### Secrets

Set with `wrangler secret put <NAME>` from `worker/`; they live only in Cloudflare and never in the repository. Rotation needs no redeploy.

| Secret | Used by |
| --- | --- |
| `GITHUB_PAT` | Fine-grained, read-only, single-repository token scoped to `STORE_REPO` (Contents: Read-only) for `/private/*` reads |
| `DISPATCH_PAT` | Token with permission to dispatch workflows and list runs on `DISPATCH_REPO`, for `/admin/*` |
| `DISPATCH_KEY` | Shared secret the data job sends as `X-Dispatch-Key`; must equal the job's `CATALOG_PUSH_DISPATCH_KEY` |
| `VAPID_PRIVATE_KEY` | The P-256 private scalar paired with `VAPID_PUBLIC_KEY`, for signing push requests |
| `HUB_CLIENT_ID`, `HUB_CLIENT_SECRET` | The catalog's machine client on the auth server (the same credentials the data job holds as `CATALOG_HUB_CLIENT_ID` / `CATALOG_HUB_CLIENT_SECRET`), for `/push/test-channel` |

### Endpoints

Bearer verification, where required, means: RS256 signature against the issuer's JWKS (cached per isolate for an hour, refetched on an unknown `kid`), `iss === ISSUER`, `aud` contains `AUDIENCE`, `exp` and `nbf` with 60 seconds of leeway.

| Method and path | Auth | Needs | Responses |
| --- | --- | --- | --- |
| `GET /private/<uuid>/catalog.json`, `GET /private/<uuid>/health.json` | Bearer; `uuid` must appear in the token's `organizations[]` | `ISSUER`, `AUDIENCE`, `STORE_REPO`, `GITHUB_PAT` | `200` file, `401` missing or invalid token, `403` not a member, `404` nothing published for that org, `502` store fetch failed, `405` non-GET |
| `POST /admin/rebuild` | Bearer with `ROLE_ADMIN` in `authorities` | `DISPATCH_PAT`, `DISPATCH_REPO`, `DISPATCH_WORKFLOW` | `202 {"status":"queued"}`, `403` no admin role, `503` when `DISPATCH_PAT` is unset, `502` when GitHub does not return 204 |
| `GET /admin/rebuild/status` | Same | Same | `200 {"status","conclusion"}` of the latest run of `DISPATCH_WORKFLOW`; `503` and `502` as above |
| `GET /push/vapid-key` | None | `VAPID_PUBLIC_KEY` | `200 {"publicKey"}`, `503` when unset |
| `POST /push/subscriptions` | Bearer | `SUBS` | `204`; `400` when the body lacks an `https://` endpoint of at most 512 characters plus `keys.p256dh` and `keys.auth` |
| `DELETE /push/subscriptions?endpoint=` | Bearer | `SUBS` | `204`; `400` without `endpoint` |
| `POST /push/dispatch` | `X-Dispatch-Key` equal to `DISPATCH_KEY` | `DISPATCH_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUBS` | `200 {"delivered"}`; `401` bad key; `503` when either VAPID key is unset; `400` invalid body. Subscriptions answering `403`, `404` or `410` are deleted |
| `POST /push/test-toast` | Bearer | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUBS` | `200 {"delivered"}` to the caller's own subscriptions; `503` when either VAPID key is unset |
| `POST /push/test-channel` | Bearer | `ISSUER`, `HUB_CLIENT_ID`, `HUB_CLIENT_SECRET` | `200 {"delivered":1}` after one hub write addressed to the caller; `503` without the hub credentials; `502` when discovery, the token grant or the write fails |
| `GET /api/status` | None | The published `version.txt` on this host | `200 {"role":"catalog","version"}`, the version cached for 60 seconds and empty when `version.txt` cannot be read |
| `OPTIONS *` | None | `ALLOWED_ORIGINS` | `204` with CORS headers |

Any other path under those prefixes returns `404`; paths outside them are proxied to GitHub Pages. Worker responses carry `Cache-Control: private, no-store`.

---

## The STARTcloud UI

The web UI is not built here. It is the [STARTcloud UI](https://github.com/STARTcloud/startcloud-ui), one build shared with BoxVault and the rest of the estate, fetched as a release artifact and merged into the Pages payload by the data job. Which app it renders is decided at runtime: the page asks its own origin `GET /api/status`, the Worker answers `role: catalog`, and the catalog app boots.

### The pin

| Item | Value |
| --- | --- |
| `startcloudUiVersion` in `package.json` | The STARTcloud UI release the data job fetches |
| Artifact | `https://github.com/STARTcloud/startcloud-ui/releases/download/v<version>/startcloud-ui-<version>.tar.gz`, the contents of the UI's `dist/` |
| Fetched into | `ui/` (gitignored), then copied over `dist/` beside `catalog.json`, `health.json`, `version.txt` and `docs/` |
| Kept current by | `dependency-bump.yml`, which answers the UI's `dependency-update` dispatch with an auto-merging `fix:` PR; merging it mints a release whose data run ships the new UI |

### What the UI reads from this host

| Path | Purpose |
| --- | --- |
| `/api/status` | `role` and `version`, before anything renders; the version is the footer's and the About page's |
| `/catalog.json`, `/health.json` | The public catalog and its health companion |
| `/private/<uuid>/catalog.json`, `/private/<uuid>/health.json` | The private catalogs of the signed-in user's organizations |
| `/health`, `/config` | The footer's health heart and the Hyperweaver origin behind the Deploy controls |
| `/push/*`, `/watches`, `/admin/*` | Toasts, watches and the admin rebuild |

The catalog's own constants (issuer `https://dev-auth.startcloud.com`, public client `provisioner-catalog`, scopes `openid profile email organizations notifications entitlements`, the `/callback` redirect, the `catalog.` storage keys) live in the UI repository under `src/apps/catalog/`. Registered redirect URIs stay exact-match: `https://provisioner-catalog.startcloud.com/callback` and `http://localhost:8080/callback`, the latter for the UI repository's dev server pointed at this host.

---

## Python environment

| Item | Value |
| --- | --- |
| `.python-version` | `3.14`; every workflow uses `actions/setup-python` with `python-version-file: ".python-version"` and a pip cache keyed on `requirements.txt` |
| `requirements.txt` | `PyYAML==6.0.3`, `jsonschema==4.26.0`, `PyJWT==2.13.0`, `cryptography==50.0.0` |
| `scripts/setup` | `python3 -m pip install -r requirements.txt`; every workflow job runs `bash scripts/setup` after checkout |
| `action.yml` | Installs the same `requirements.txt` from `github.action_path` before running `scripts.validate_repo` |

`PyJWT` and `cryptography` exist for the GitHub App JWT in `build_org_catalogs`; the public builder and the validator need only `PyYAML` and `jsonschema`.

Scripts are run as modules from the repository root:

```bash
pip install -r requirements.txt
python3 -m scripts.validate_schemas
python3 -m scripts.is_sorted
python3 -m scripts.validate_repo --repo owner/name
python3 -m scripts.validate_repo --tree path/to/package/root
python3 -m scripts.build_catalog --out /tmp/catalog.json --published-url https://provisioner-catalog.startcloud.com/catalog.json
```

`validate_repo` accepts `--repo`, `--tree`, or both; `--token` defaults to `GITHUB_TOKEN`. `build_catalog` also accepts `--sources`, `--removed`, `--schema`, `--health-schema` and `--token`. `build_org_catalogs` requires `--config` and `--store`, and takes `--app-id` and `--private-key` with the environment defaults listed above.

---

## Versioning

Two independent version numbers exist.

### Repository version

Maintained by release-please from conventional commits; `release-please.yml` runs it on every push to `main`.

| Setting (`release-please-config.json`) | Value |
| --- | --- |
| `release-type` | `simple` |
| `package-name`, `component` | `provisioner-catalog` |
| `changelog-path` | `CHANGELOG.md` |
| `bump-minor-pre-major`, `bump-patch-for-minor-pre-major` | `true` |
| `draft`, `prerelease` | `false` |
| `default-branch` | `main` |

`version.txt` at the repository root holds the current version; the data job copies it into the Pages payload, and the Worker's `/api/status` reads it back so the UI footer shows it. Releases are tagged `provisioner-catalog-v<version>`. They version the tooling, workflows, UI pin and documentation only; published catalog data never waits for one.

### Format version

`format_version` inside `catalog.json` and `health.json` is the wire contract agents parse. It is the constant `FORMAT_VERSION = 1` in `scripts/build_catalog.py` (and literal `1` in `scripts/build_org_catalogs.py`), pinned as `"const": 1` in `schema/catalog.schema.json` and `schema/health.schema.json`. It changes only on a breaking change to the document shape and is unrelated to the repository version.

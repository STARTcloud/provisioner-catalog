---
title: Private Catalogs
layout: default
nav_order: 5
parent: Guides
permalink: /guides/private-catalogs/
---

# Private Catalogs

{: .no_toc }

Per-organization provisioner catalogs, visible only to members of the organization on the STARTcloud IdP — same wire contract as the public `catalog.json`, different visibility.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## How it works

The public catalog is static JSON on GitHub Pages. Private catalogs reuse the same builder pattern but never touch Pages:

- **The org → repos mapping** lives in `sources-orgs.yml` inside a private store repository, `STARTcloud/provisioner-catalogs-private`. Private repository names never appear in the public catalog repository.
- **The data job** (`generate-catalog-data.yml`, cron every 2 hours, manual dispatch, or chained after a release) runs a `build-private` job beside the public build. It checks out the store, runs [`scripts/build_org_catalogs.py`](https://github.com/STARTcloud/provisioner-catalog/blob/main/scripts/build_org_catalogs.py), and writes one `catalog.json` plus one `health.json` per organization under `orgs/<org-uuid>/` in that checkout.
- **Results are committed back** to the store (`chore: regenerate org catalogs`) only when the generated data changed. The file already in the store is the baseline for change detection and for the immutability tripwire.
- **A Cloudflare Worker** routed on `/private/*` serves those files to organization members. Nothing private ever lands on GitHub Pages.
- **Independence**: `build-private` is its own job; a failure there never blocks the public publish, and the build step is skipped entirely when the store has no `sources-orgs.yml`.

Each org document is named `<org name> Private Provisioner Catalog` and is validated against the same `catalog.schema.json` and `health.schema.json` as the public data. The same rules apply inside an org: sidecar sha256 mismatches are refused, a family published by two repositories in one org is refused as ambiguous, and an already-published version whose asset now hashes differently trips the tripwire (exit code 2, nothing committed). Any build error (exit code 1) also commits nothing.

Artifact URLs in a private catalog point at private release assets. Consumers need their own GitHub access to download them, exactly as they need it to clone the repositories.

## Onboarding an organization

### The `sources-orgs.yml` entry

```yaml
orgs:
  - uuid: 00000000-0000-0000-0000-000000000000
    name: Example Org
    sources:
      - repo: example-org/example_provisioner
```

| Field | Requirement |
| --- | --- |
| `uuid` | The organization's IdP uuid. Must be a lowercase-normalizable UUID; duplicates are rejected. |
| `name` | Required, non-empty. Becomes part of the document name and the notification text. |
| `sources[].repo` | `owner/name`. Entries that do not match that shape are skipped with an error. |

An entry that fails any of these checks is reported as an error and the whole run commits nothing.

### The GitHub App installation

Source repositories are private, so the builder reads them with a **GitHub App installation token**, not a PAT:

1. The owning organization installs the **STARTcloud Provisioner Catalog** GitHub App.
2. The App needs only **Contents: read**.
3. Select the provisioner repositories the catalog should read.

The builder mints one installation token per account the App is installed on and matches it to each repository by its `owner` segment. A repository whose owner has no installation fails with:

```text
<owner>/<repo>: no App installation for '<owner>' — install the STARTcloud Provisioner Catalog App on that org and select this repo
```

### The artifact contract

Private repositories follow the same contract as public ones: published (non-draft, non-prerelease) releases carrying a registry-shaped `<name>-<version>.tar.gz`, a `.sha256` sidecar, and a `provisioner.yml` inside the archive. The catalog records only versioned assets, never the mutable `<name>.tar.gz` alias. A repository with no versioned release assets is omitted with a warning.

## How private assets are fetched

The only differences from the public builder are in how bytes are read:

- **Installation tokens per owner.** The job signs a short-lived App JWT (RS256, from `CATALOG_APP_ID` and `CATALOG_APP_PRIVATE_KEY`), lists the App's installations, and requests an access token for each. Tokens are keyed by the installation account's login.
- **Releases and workflow files** are listed through the GitHub API with that token. Workflow text feeds only the `lint_ci` quality rule.
- **Assets go through the API asset endpoint**, not the browser download URL. GitHub answers the API endpoint with a redirect to a signed CDN URL that rejects an `Authorization` header, so the builder disables automatic redirects, catches the `301`/`302`/`303`/`307`/`308`, and follows the `Location` bare. A redirect without a `Location` header is an error.
- **Size caps** are unchanged: 2 GiB per archive download, 64 KiB per sidecar.

The same download path is what lets a private repository run the validation action with its own workflow token.

## Membership and the gate

The Cloudflare Worker `provisioner-catalog-gate` is routed on `provisioner-catalog.startcloud.com/private/*` (plus `/push/*` and `/admin/*`). Every other path on the domain passes straight through to GitHub Pages, so the public `catalog.json` is never touched. The DNS record must be **proxied** in Cloudflare, or the route never fires.

### Route

```text
GET /private/<org-uuid>/catalog.json
GET /private/<org-uuid>/health.json
```

The uuid is matched case-insensitively and lowercased. Any other path under the Worker's routes answers `404`; any method other than `GET` on a matching path answers `405`; `OPTIONS` answers `204` with CORS headers for origins listed in `ALLOWED_ORIGINS`.

### Token verification

The request must carry `Authorization: Bearer <access token>`. The Worker verifies it with nothing but the token:

1. The token has three segments and `alg` is `RS256`.
2. The key with the token's `kid` is found in the IdP's JWKS, discovered from `ISSUER/.well-known/openid-configuration`. The JWKS is cached per isolate for one hour and refetched once on an unknown `kid`, which covers key rotation.
3. The signature verifies (RSASSA-PKCS1-v1_5, SHA-256).
4. `iss` equals `ISSUER` exactly.
5. `aud` contains `AUDIENCE`.
6. `exp` and `nbf` hold, with 60 seconds of leeway.

### Membership

The token's `organizations` claim is an array of objects with a `uuid`. The requested org uuid must appear there. **Membership is read access; nothing else grants it.** The Worker never redirects — an unauthenticated or non-member request gets a JSON error, not a login page.

### Responses

| Status | Body | Extra headers | Meaning |
| --- | --- | --- | --- |
| `200` | the org's `catalog.json` or `health.json` | `Cache-Control: private, no-store` | member, file published |
| `401` | `{"error":"missing bearer token"}` | `WWW-Authenticate: Bearer` | no `Bearer` authorization header |
| `401` | `{"error":"invalid token: <reason>"}` | `WWW-Authenticate: Bearer error="invalid_token"` | one of: `malformed token`, `unsupported alg '<alg>'`, `no matching JWKS key`, `bad signature`, `wrong issuer`, `wrong audience`, `token expired`, `token not yet valid` |
| `403` | `{"error":"not a member of this organization"}` | | valid token, org uuid not in `organizations` |
| `404` | `{"error":"no catalog published for this organization"}` (or `no health …`) | | the store has no `orgs/<uuid>/<file>.json` |
| `404` | `{"error":"not found"}` | | path does not match the route shape |
| `405` | `{"error":"method not allowed"}` | | non-`GET` on a catalog path |
| `502` | `{"error":"store fetch failed (<status>)"}` | | the store read returned something other than `200`/`404` |

Every JSON response is `Cache-Control: private, no-store`.

### The store token

On success the Worker proxies the file from the store through the GitHub contents API using the `GITHUB_PAT` secret — a fine-grained token scoped to the single store repository with **Contents: Read-only**. It exists only in Cloudflare; the web UI never sees it.

## What members see

The catalog web UI at the domain root renders private catalogs beside the public one.

### Sign-in

- **OIDC authorization-code + PKCE (S256)** against the STARTcloud IdP, as a public client (`client_id` `provisioner-catalog`, no secret).
- **Scopes requested**: `openid profile email organizations notifications`.
- **Redirect URI**: `<origin>/callback`, registered exact-match for `https://provisioner-catalog.startcloud.com/callback` and `http://localhost:8080/callback`.
- The PKCE state and verifier are kept in `localStorage` rather than `sessionStorage`, so a magic-link sign-in that completes in a new tab still finds them.
- The callback page exchanges the code, applies the account's theme and language preferences, and returns to `/`.
- Access tokens refresh through the `refresh_token` grant when within a minute of expiry; a failed refresh signs the user out locally.

### Loading private catalogs

After sign-in the UI decodes the access token, reads its `organizations` claim, and for **every** organization in it fetches `/private/<uuid>/catalog.json` and `/private/<uuid>/health.json` with the Bearer token. A failed `health.json` is tolerated; a failed `catalog.json` is mapped:

| Gate status | Shown as |
| --- | --- |
| `404` | the organization is hidden from the private tab; the org switcher lists it as "No catalog published yet" |
| `401` / `403` | "Access denied by the catalog gate." in that organization's section |
| anything else | the raw request error |

A multi-org user sees every org they belong to. That is the cross-sharing mechanism: an organization shares a provisioner by adding the repository to its own entry, and members of that org see it wherever else they belong.

### The private tab

- With no visible organizations, the page shows only the **Public Catalog** section.
- With at least one, the page switches to two tabs, **Public Catalog** and **Private Catalog**. The private tab holds one section per organization: the org's logo (or a building icon), its name, the subtitle "Private catalog — visible to `<org>` members only.", and the same provisioner cards as the public catalog, including tier badges and health chips from the org's `health.json`.
- An organization whose catalog exists but lists no provisioners shows "This organization has no published provisioners yet."
- The search box filters public and private cards together.

### The org switcher

The user menu gains an **Organizations** entry when the token carries organizations. It opens a modal listing each org with logo, name, description, a "Primary" marker, and role badges. Choosing one scrolls to that organization's section; organizations without a published catalog are listed but disabled.

## Notifications for private catalogs

Each data run compares the new org catalog with the one already in the store. For every `(family, version)` pair that is new — and only when a previous catalog existed — the builder sends two things:

**A hub notification**, addressed to the organization (`recipient: {"org_uuid": …}`):

| Field | Value |
| --- | --- |
| title | `<family> <version> released` |
| body | `New provisioner version in the <org name> private catalog.` |
| navigate | `https://provisioner-catalog.startcloud.com/` |
| tag | `catalog-<family>` |
| type / severity | `SYSTEM` / `INFO` |
| delivery | ttl 86400, urgency normal |
| idempotencyKey | `catalog:<org-uuid>:<family>:<version>` |

It is posted to `<CATALOG_HUB_ISSUER>/api/notify` with a client-credentials token (scope `notifications:write`) obtained from `CATALOG_HUB_CLIENT_ID` and `CATALOG_HUB_CLIENT_SECRET` at the IdP's discovered token endpoint. Without those credentials the notification is skipped and logged. Members read it from the bell in the web UI, which appears when the token's scope includes `notifications`.

**A push event** with `scope: org` and the org uuid, batched and posted once per run to `CATALOG_PUSH_DISPATCH_URL` (default `https://provisioner-catalog.startcloud.com/push/dispatch`) with the `X-Dispatch-Key` header set from `CATALOG_PUSH_DISPATCH_KEY`. The Worker's `/push/dispatch` route checks that key against its `DISPATCH_KEY` secret, delivers web push (VAPID, `aes128gcm`) to every subscription whose recorded organizations include that uuid, and prunes subscriptions that answer `403`, `404`, or `410`.

A member enables push from the user menu ("Enable notifications"): the browser permission prompt, the service worker, `GET /push/vapid-key`, then `POST /push/subscriptions` with the Bearer token. The subscription record stores the user's uuid and the organizations in their token at that moment, and is re-posted on every page load while push stays enabled.

The public builder sends only push events (scope `public`); the org-addressed hub notification is specific to private catalogs.

## Operations

### Worker deployment

`deploy-worker.yml` deploys on every push to `main` that touches `worker/**`, and on manual dispatch, using `cloudflare/wrangler-action@v3` with `CLOUDFLARE_API_TOKEN`. A manual `wrangler deploy` from `worker/` does the same.

Configuration lives in `worker/wrangler.toml`:

| Var | Purpose |
| --- | --- |
| `ISSUER` | Must equal the `iss` claim in tokens exactly. Change it and redeploy when the production IdP replaces the current one. |
| `AUDIENCE` | The registered audience of the `provisioner-catalog` client. |
| `STORE_REPO` | The single private store repository the read-only PAT is scoped to. |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed cross-origin (production is same-origin; the dev server is listed). |
| `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | Web push application server identity. |
| `DISPATCH_REPO`, `DISPATCH_WORKFLOW` | Where the admin rebuild button dispatches (`generate-catalog-data.yml`). |

The KV namespace bound as `SUBS` holds push subscriptions.

### Secrets

Cloudflare (`wrangler secret put <NAME>`):

| Secret | Used for |
| --- | --- |
| `GITHUB_PAT` | Reading `orgs/<uuid>/*.json` from the store |
| `VAPID_PRIVATE_KEY` | Signing web push requests |
| `DISPATCH_KEY` | Authenticating `/push/dispatch` calls from the data job |
| `DISPATCH_PAT` | Dispatching the data job from `/admin/rebuild` |

GitHub Actions (the data job):

| Secret | Used for |
| --- | --- |
| `PRIVATE_CATALOG_PAT` | Checking out and pushing the store |
| `CATALOG_APP_ID`, `CATALOG_APP_PRIVATE_KEY` | Minting App installation tokens |
| `CATALOG_HUB_CLIENT_ID`, `CATALOG_HUB_CLIENT_SECRET` | Hub notifications |
| `CATALOG_PUSH_DISPATCH_KEY` | Push dispatch |

### Rotating the store PAT

Generate a new fine-grained token with the same scope, run `wrangler secret put GITHUB_PAT` from `worker/`, then revoke the old token. No redeploy is needed.

### Verifying the gate

```bash
curl https://provisioner-catalog.startcloud.com/private/00000000-0000-0000-0000-000000000000/catalog.json
```

`401 {"error":"missing bearer token"}` means the route and Worker are live. The same URL with a member's Bearer token returns that org's catalog. `https://provisioner-catalog.startcloud.com/catalog.json` must still return the public catalog straight from Pages.

### Forcing a rebuild

Signed-in users whose token carries `ROLE_ADMIN` in `authorities` get a **Rebuild catalog data** entry in the user menu. It calls `POST /admin/rebuild`, which dispatches the data job on `main` with `forceRepositoryUpdate` set and `requested_by` set to the caller's uuid; the caller is notified when the run finishes. `GET /admin/rebuild/status` reports the latest run's status. Both answer `403` without the admin role and `503` when `DISPATCH_PAT` is not configured.

## Troubleshooting

| Symptom | Meaning | Check |
| --- | --- | --- |
| `401 missing bearer token` | No `Authorization: Bearer` header reached the Worker | The client is signed in and sending the access token |
| `401 invalid token: wrong issuer` / `wrong audience` | Token minted by a different IdP host or for a different client | `ISSUER` and `AUDIENCE` in `wrangler.toml` against the token's `iss` and `aud` |
| `401 invalid token: token expired` | Access token older than its `exp` plus 60 s | The UI refreshes automatically; other clients must refresh or sign in again |
| `401 invalid token: no matching JWKS key` | The token's `kid` is not in the IdP's JWKS even after a refetch | The IdP's key set and the `ISSUER` discovery URL |
| `403 not a member of this organization` | The uuid in the path is not in the token's `organizations` claim | Org membership on the IdP; a fresh token after membership changes |
| `404 no catalog published for this organization` | Member, but the store has no `orgs/<uuid>/catalog.json` | The org is in `sources-orgs.yml`; the last `build-private` run succeeded and committed |
| `404 not found` (JSON) | Path does not match `/private/<uuid>/(catalog\|health).json` | The uuid shape and file name |
| `404` from GitHub Pages (HTML) | The Worker route never fired | The DNS record is proxied in Cloudflare |
| `502 store fetch failed (…)` | GitHub refused the store read | `GITHUB_PAT` validity and scope; rotate it |
| `503 push not configured` / `dispatch not configured` | A Worker secret is missing | `VAPID_PRIVATE_KEY`, `DISPATCH_KEY`, or `DISPATCH_PAT` |
| Org hidden from the private tab | The gate answered `404` for that org | Same as the `404` row above |
| "Access denied by the catalog gate." in an org section | The gate answered `401` or `403` | The `401`/`403` rows above |
| `no App installation for '<owner>'` in the data job | The App is not installed on the repository's owner, or the repo is not selected | The App installation on that organization |
| Data job exit code 2 | Immutability tripwire — a published version's asset changed | Ship the rebuilt artifact as a new version |
| Data job exit code 1, nothing committed | A validation or build error in some org | The run log; every error is reported before the run ends |

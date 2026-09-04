---
title: API Reference
layout: default
nav_order: 2
has_children: false
permalink: /api/
---

# API Reference

{: .no_toc }

The STARTcloud Provisioner Catalog exposes two static JSON documents on `https://provisioner-catalog.startcloud.com` — `catalog.json`, the wire contract agents parse, and `health.json`, the UI-only companion — plus a Cloudflare Worker that gates per-organization private catalogs, serves the push-notification and admin routes and answers a health document. Everything below is the exact shape each endpoint speaks.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Public catalog endpoints

The public path is static: GitHub Actions rebuilds the documents from the admitted repositories' GitHub releases every ~2 hours (plus manual dispatch and the push-to-main release chain) and deploys them to GitHub Pages only when the data changed. No server sits in that path. Archives themselves are never served here — every artifact URL points at the repository's own immutable release asset.

| Endpoint | Method | Reader | Purpose |
| --- | --- | --- | --- |
| `https://provisioner-catalog.startcloud.com/catalog.json` | GET | hyperweaver-agent, zoneweaver-agent, the web UI | The wire contract — families, versions, versioned artifact URLs and sha256 checksums |
| `https://provisioner-catalog.startcloud.com/health.json` | GET | The web UI only | Measured quality tiers, rule results and live health rendered as badges. Agents never read it |

Both documents carry `format_version`, a constant `1`. It is the contract agents gate on and is separate from this repository's own release version; it bumps only on a breaking change to the document shape.

Published JSON Schemas (draft 2020-12):

- [catalog.schema.json](/docs/schema/catalog.schema.json)
- [health.schema.json](/docs/schema/health.schema.json)

### catalog.json

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
          "released_at": "2026-07-15T18:04:11Z",
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

Every object in the document forbids additional properties.

#### Document

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string (min length 1) | yes | Catalog display name. The public catalog is `STARTcloud Provisioner Catalog`; a private one is `<Org name> Private Provisioner Catalog` |
| `format_version` | const `1` | yes | The wire contract version agents check before parsing anything else |
| `updated` | string, date-time | yes | ISO 8601 timestamp of the data-job run that generated the document |
| `provisioners` | array of provisioner | yes | One entry per family, sorted by `name` |

#### Provisioner

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string, `^[A-Za-z0-9._-]+$` | yes | Family slug — the `name:` from the package's `provisioner.yml`, also the archive filename prefix. A family is unique across the whole document; two repositories publishing the same family fail the build |
| `repo` | string, `owner/name` | yes | GitHub repository the family's releases come from |
| `description` | string | yes | Parsed from the `provisioner.yml` inside the latest release's artifact — never from GitHub repository metadata. Empty when the manifest omits it or the archive is unreadable |
| `versions` | array of version (min 1) | yes | Newest first, ordered by semantic version |

#### Version

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `version` | string, `^[0-9]+\.[0-9]+\.[0-9]+[0-9A-Za-z.+-]*$` | yes | Semantic version, sourced from the versioned asset filename and verified against the packaged `provisioner.yml` |
| `released_at` | string, date-time | no | Publish time of the GitHub release carrying this version. Omitted when GitHub reports none |
| `artifacts` | array of artifact (min 1) | yes | The versioned release asset(s) for this version |

#### Artifact

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `url` | string, `^https://` | yes | The immutable versioned release asset `<name>-<version>.tar.gz`. The mutable `<name>.tar.gz` latest alias is never recorded |
| `checksum_type` | const `sha256` | yes | Digest algorithm |
| `checksum` | string, `^[a-f0-9]{64}$` | yes | sha256 of the tar.gz, computed by the data job from the downloaded bytes and checked against the release's `.sha256` sidecar. Consumers verify it after download |

Only published, non-draft, non-prerelease releases are recorded. A version whose sidecar is missing is still recorded (with a build warning); a version whose sidecar disagrees with the asset, or whose asset cannot be downloaded, is refused and left out.

### health.json

```json
{
  "name": "STARTcloud Provisioner Catalog",
  "format_version": 1,
  "updated": "2026-07-16T00:00:00Z",
  "provisioners": {
    "startcloud_generic_provisioner": {
      "repo": "STARTcloud/startcloud_generic_provisioner",
      "tier": "silver",
      "presentation": {
        "label": "STARTcloud Generic Provisioner",
        "icon": "https://example.invalid/icon.svg",
        "homepage": "https://example.invalid/"
      },
      "rules": {
        "bronze": { "description": true, "label": true, "semver_versions": true, "latest_alias": true },
        "silver": { "changelog": true, "readme": true, "release_within_12_months": true, "lint_ci": true },
        "gold": { "config_fields_documented": false, "roles_documented": true, "example_hosts": false },
        "platinum": { "automated_tests": false, "multi_provider": true, "release_cadence": true },
        "diamond": { "booted_providers": false }
      },
      "failed_rules": ["gold.config_fields_documented", "gold.example_hosts", "platinum.automated_tests", "diamond.booted_providers"],
      "health": {
        "latest_version": "0.1.26",
        "latest_release_at": "2026-07-15T18:04:11Z",
        "artifacts_ok": true,
        "sidecars_ok": true,
        "providers": ["virtualbox", "zones"],
        "versions": {
          "0.1.26": { "providers": ["virtualbox", "zones"] },
          "0.1.25": { "providers": ["virtualbox"] }
        },
        "downloads": 42
      }
    }
  }
}
```

#### Health document

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string (min length 1) | yes | Same name as the companion `catalog.json` |
| `format_version` | const `1` | yes | Same contract version as `catalog.json` |
| `updated` | string, date-time | yes | Timestamp of the generating run |
| `provisioners` | object keyed by family slug | yes | One entry per family present in the companion `catalog.json` |

#### Family entry

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `repo` | string, `owner/name` | yes | Source repository |
| `tier` | enum `unrated`, `bronze`, `silver`, `gold`, `platinum`, `diamond` | yes | Measured tier — the highest tier whose rules and every lower tier's rules all pass. Recomputed every data run, never author-declared |
| `presentation` | object | yes | UI extras parsed from the packaged `provisioner.yml`; empty strings when omitted |
| `presentation.label` | string | yes | Display label |
| `presentation.icon` | string | yes | Icon URL |
| `presentation.homepage` | string | yes | Homepage URL |
| `rules` | object | yes | Per-tier rule results, every value a boolean |
| `rules.bronze` | object | yes | `description`, `label`, `semver_versions`, `latest_alias` |
| `rules.silver` | object | yes | `changelog`, `readme`, `release_within_12_months`, `lint_ci` |
| `rules.gold` | object | yes | `config_fields_documented`, `roles_documented`, `example_hosts` |
| `rules.platinum` | object | yes | `automated_tests`, `multi_provider`, `release_cadence` |
| `rules.diamond` | object | yes | `booted_providers` |
| `failed_rules` | array of string, `^(bronze\|silver\|gold\|platinum\|diamond)\.[a-z0-9_]+$` | yes | Every failing rule as `tier.rule` |
| `health.latest_version` | string | yes | Highest semantic version recorded |
| `health.latest_release_at` | string (date-time) or null | yes | Publish time of the newest release, null when unknown |
| `health.artifacts_ok` | boolean | yes | False when any versioned asset failed to download during the run |
| `health.sidecars_ok` | boolean | yes | False when any version lacked a sidecar or its sidecar failed |
| `health.providers` | array of string | yes | Providers with a verified image for the latest version — the rendered `Hosts.yml` names a box the box catalog serves for that provider and architecture at that version |
| `health.versions` | object keyed by version | yes | Per recorded version, `{ "providers": [...] }` — the providers verified for that version, measured once from its archive and carried forward |
| `health.downloads` | integer ≥ 0 | yes | Total GitHub download count of the family's versioned assets |

Security is never graded here. The archive safety scan, sidecar verification and the immutability tripwire are hard gates — a package that violates them never appears in either document.

---

## Consumer contract

zoneweaver-agent's catalog client (`lib/ProvisionerCatalog.js`) is the reference consumer. Its behaviour is the contract every consumer follows.

### Catalog sources

Sources live under the agent's `provisioning.catalog_sources` config, mirroring its template-sources pattern. When the list is empty or absent the built-in default is used, so the STARTcloud catalog works with zero configuration:

```json
{
  "name": "startcloud",
  "url": "https://provisioner-catalog.startcloud.com/catalog.json",
  "enabled": true,
  "default": true
}
```

| Key | Meaning |
| --- | --- |
| `enabled` (top level) | `false` disables catalog resolution entirely |
| `sources[].name` | Lookup name; an explicit name wins, else the `default`-flagged source, else the first |
| `sources[].url` | The `catalog.json` URL. Entries without a string `url` or with `enabled: false` are dropped |
| `sources[].default` | Marks the source used when no name is given |
| `sources[].ca_file` | PEM appended to the system root store for a self-hosted (forked) catalog. TLS verification is never disabled |

### Fetch and format gate

The agent GETs the source URL with a 30 second timeout and a `Zoneweaver/1.0.0` User-Agent. Anything that is not an object with `format_version === 1` is refused outright:

```text
catalog at <url> is not format_version 1
```

### Artifact resolution

A request names a family and an exact version. The agent finds `provisioners[].name === name`, then `versions[].version === version`, and takes the first entry of that version's `artifacts`. The result is:

```json
{
  "url": "https://github.com/…/startcloud_generic_provisioner-0.1.26.tar.gz",
  "checksum": "…64 hex chars…",
  "checksum_type": "sha256"
}
```

Artifact URLs are opaque — release tags carry slashes, so consumers never parse or construct them. The descriptor is handed to the agent's `provisioner_import` task, which downloads the archive, verifies the sha256 and imports the package. A missing family, missing version or artifact without a string `url` resolves to nothing and the install is refused.

Agents accept multiple catalog URLs; the official catalog is only the default. A forked catalog with the same contract sits alongside it as another source.

---

## Immutability

Published versions never change. On every run the data job fetches the currently published `catalog.json` as its baseline and compares each already-published `(name, version)` against the freshly computed data:

| Condition | Result |
| --- | --- |
| The version no longer exists upstream (deleted release, removed repository) | Allowed — the version drops out of the next publish. Machines already built from it are unaffected |
| The version still exists but a published artifact URL disappeared | Tripwire — build exits 2, nothing is published |
| The version still exists and its asset now hashes differently from the published checksum | Tripwire — build exits 2, nothing is published |

This is what a consumer can rely on: a `(name, version, url)` triple seen in the catalog will either keep the same checksum forever or vanish. A checksum never silently changes underneath it. Rebuilt packages ship as a new version. Private catalogs run the identical tripwire with the file already in the private store as the baseline.

---

## Private catalogs

Organizations on the STARTcloud IdP can share private provisioners with their members through the same host. The documents have the exact `catalog.json` and `health.json` shapes above; only visibility differs. A Cloudflare Worker routed on `/private/*` proxies them from the private store repository. See the [private catalogs guide](../guides/private-catalogs/) for setup.

| Endpoint | Method | Auth |
| --- | --- | --- |
| `/private/{org-uuid}/catalog.json` | GET | Bearer JWT, member of `{org-uuid}` |
| `/private/{org-uuid}/health.json` | GET | Bearer JWT, member of `{org-uuid}` |

`{org-uuid}` must be a UUID (`8-4-4-4-12` hex, matched case-insensitively). Any other path under `/private/`, `/push/`, `/admin/` or `/watches/` returns `404`; `/health` answers the Worker's health document, `/config` the estate settings and `/api/status` the app identity; other paths outside those are proxied to GitHub Pages, and a page request Pages answers with `404` gets `index.html` so the web UI's deep links load; a matching path with any method other than `GET` returns `405`.

### Bearer token requirements

The Worker authorizes with nothing but the caller's `Authorization: Bearer <jwt>` header:

| Check | Requirement |
| --- | --- |
| Header | Must be the `Bearer` scheme followed by a space and the token |
| Structure | Compact JWS with exactly three segments |
| `alg` | `RS256` only |
| Signature | Verified against the key whose `kid` matches in the IdP's JWKS, discovered from `<ISSUER>/.well-known/openid-configuration` → `jwks_uri`. The JWKS is cached per isolate for one hour and refetched once on an unknown `kid` (key rotation) |
| `iss` | Exactly the configured `ISSUER` (`https://dev-auth.startcloud.com`) |
| `aud` | String or array; must contain the configured `AUDIENCE` (`provisioner-catalog`) |
| `exp` | Required number; expired when `exp + 60s < now` |
| `nbf` | Optional; not yet valid when `nbf - 60s > now` |
| `organizations` | Array of `{ "uuid": "…" }` objects; the requested org uuid must appear (case-insensitive). Membership is read access; nothing else grants it |

Tokens for the web UI come from the IdP's authorization-code + PKCE flow (public client `provisioner-catalog`, scopes `openid profile email organizations notifications`). Any client holding a token that satisfies the table above can call the endpoints.

### Responses

| Status | Body | When |
| --- | --- | --- |
| `200` | The org's `catalog.json` / `health.json` verbatim | Member of the org and the file exists in the store |
| `401` | `{ "error": "missing bearer token" }` + `WWW-Authenticate: Bearer` | No `Authorization: Bearer` header |
| `401` | `{ "error": "invalid token: <reason>" }` + `WWW-Authenticate: Bearer error="invalid_token"` | Verification failed. Reasons: `malformed token`, `unsupported alg '<alg>'`, `no matching JWKS key`, `bad signature`, `wrong issuer`, `wrong audience`, `token expired`, `token not yet valid` |
| `403` | `{ "error": "not a member of this organization" }` | Valid token, org uuid absent from `organizations` |
| `404` | `{ "error": "no catalog published for this organization" }` / `{ "error": "no health published for this organization" }` | Member, but the store has no file for the org yet |
| `404` | `{ "error": "not found" }` | Path does not match a Worker route |
| `405` | `{ "error": "method not allowed" }` | `/private/…` path with a non-GET method |
| `502` | `{ "error": "store fetch failed (<status>)" }` | The private store returned a non-2xx, non-404 status |

Every response carries `Content-Type: application/json; charset=utf-8` and `Cache-Control: private, no-store`. Errors never redirect.

Artifact URLs inside a private catalog point at private release assets. Consumers need their own GitHub access to download them, exactly as they need it to clone the repositories.

### CORS

The Worker always sets `Vary: Origin`. When the request `Origin` is in `ALLOWED_ORIGINS` (`https://provisioner-catalog.startcloud.com`, `http://localhost:8080`) it also sets:

| Header | Value |
| --- | --- |
| `Access-Control-Allow-Origin` | The request origin, echoed |
| `Access-Control-Allow-Methods` | `GET, POST, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Authorization, Content-Type` |
| `Access-Control-Max-Age` | `86400` |

`OPTIONS` on any Worker route returns `204` with those headers and no body. Production is same-origin and needs none of this; the entries exist for the local dev server.

---

## Push and admin endpoints

The same Worker is routed on `/push/*`, `/watches` and `/admin/*`. Web-push subscriptions are stored in a Cloudflare KV namespace keyed by a sha256 of the subscription endpoint, watches in the same namespace keyed by the user's uuid; the data job delivers events through `/push/dispatch` and resolves watchers through `/watches/watchers`.

### GET /push/vapid-key

No auth.

| Status | Body |
| --- | --- |
| `200` | `{ "publicKey": "<VAPID public key, base64url>" }` |
| `503` | `{ "error": "push not configured" }` — the Worker has no `VAPID_PUBLIC_KEY` |

### POST /push/subscriptions

Bearer JWT (same verification as private catalogs; no org membership needed). The body is the browser's `PushSubscription.toJSON()`:

```json
{
  "endpoint": "https://push.example/…",
  "keys": { "p256dh": "…", "auth": "…" }
}
```

`endpoint` must be a string starting with `https://` and at most 512 characters; `keys.p256dh` and `keys.auth` must be strings. The stored record binds the subscription to the caller's `UUID` (falling back to `sub`) and to the lowercase uuids of every org in the token's `organizations` claim. Re-posting the same endpoint overwrites the record, which is how the UI resyncs on every page load.

| Status | Body |
| --- | --- |
| `204` | empty — stored |
| `400` | `{ "error": "invalid subscription" }` — body is not JSON or fails the shape check |
| `401` | `{ "error": "missing bearer token" }` / `{ "error": "invalid token: <reason>" }` |

### DELETE /push/subscriptions?endpoint=…

Bearer JWT. Deletes the record for the given endpoint.

| Status | Body |
| --- | --- |
| `204` | empty — deleted (or never existed) |
| `400` | `{ "error": "endpoint required" }` |
| `401` | `{ "error": "missing bearer token" }` / `{ "error": "invalid token: <reason>" }` |

### POST /push/dispatch

Authenticated by the `X-Dispatch-Key` header, which must equal the Worker's `DISPATCH_KEY` secret. This is the data job's entry point, not a browser one.

```json
{
  "events": [
    {
      "scope": "public",
      "title": "startcloud_generic_provisioner 0.1.26 released",
      "body": "New provisioner version in the public catalog",
      "navigate": "https://provisioner-catalog.startcloud.com/",
      "tag": "catalog-startcloud_generic_provisioner"
    },
    {
      "scope": "org",
      "org_uuid": "00000000-0000-0000-0000-000000000000",
      "title": "…",
      "body": "…",
      "navigate": "https://provisioner-catalog.startcloud.com/",
      "tag": "catalog-…"
    },
    {
      "scope": "user",
      "uuid": "<user uuid>",
      "title": "…",
      "body": "…",
      "navigate": "https://provisioner-catalog.startcloud.com/",
      "tag": "catalog-rebuild"
    }
  ]
}
```

| Event field | Meaning |
| --- | --- |
| `scope` | `org` targets subscriptions whose org list contains `org_uuid`; `user` targets subscriptions whose stored uuid equals `uuid`; any other value (the data job sends `public`) targets every subscription |
| `org_uuid` | Required for `scope: org`, compared lowercase |
| `uuid` | Required for `scope: user` |
| `title`, `body` | Notification text; missing values become empty strings |
| `tag` | Notification tag; defaults to `catalog-update` |
| `navigate` | URL the service worker opens on click; delivered as `data.navigate` |

Each target receives an `aes128gcm`-encrypted payload `{ "title", "body", "tag", "data": { "navigate" } }` with a VAPID `ES256` authorization, `TTL: 86400` and `Urgency: normal`. A push service answering `403`, `404` or `410` causes that subscription to be deleted; `2xx` counts as delivered; any other outcome is skipped silently.

| Status | Body |
| --- | --- |
| `200` | `{ "delivered": <count> }` — `0` when `events` is empty or absent |
| `400` | `{ "error": "invalid body" }` — body is not JSON |
| `401` | `{ "error": "bad dispatch key" }` — header missing, wrong, or the Worker has no `DISPATCH_KEY` |
| `503` | `{ "error": "push not configured" }` — VAPID key pair missing |

### POST /push/test-toast

Bearer JWT. Sends one toast, `Provisioner Catalog test`, to every subscription stored under the caller's `UUID` (falling back to `sub`), the same delivery as `/push/dispatch` with `scope: user`; the web UI's "Send a test toast" button calls it.

| Status | Body |
| --- | --- |
| `200` | `{ "delivered": <count> }` — `0` when the caller has no live subscription |
| `401` | `{ "error": "missing bearer token" }` / `{ "error": "invalid token: <reason>" }` |
| `503` | `{ "error": "push not configured" }` — VAPID key pair missing |

### POST /push/test-channel

Bearer JWT. Writes one Notification Channel Notification addressed to the caller's uuid through the hub's `POST /api/notify`, with a `client_credentials` token minted from the Worker's `HUB_CLIENT_ID` / `HUB_CLIENT_SECRET` secrets (scope `notifications:write`); the web UI's "Send a test Notification Channel Notification" button calls it.

| Status | Body |
| --- | --- |
| `200` | `{ "delivered": 1 }` |
| `401` | `{ "error": "missing bearer token" }` / `{ "error": "invalid token: <reason>" }` |
| `502` | `{ "error": "OIDC discovery failed (<status>)" }` / `{ "error": "hub token failed (<status>)" }` / `{ "error": "hub write failed (<status>)" }` |
| `503` | `{ "error": "hub not configured" }` — the Worker has no hub client credentials |

### GET /watches

Bearer JWT (same verification as private catalogs). The caller's watched provisioners, stored in the same KV namespace under `watch:<UUID>` (falling back to `sub`); an item id is `<organization>/<name>`, the organization being the repository owner for public provisioners and the IdP organization name for private ones.

| Status | Body |
| --- | --- |
| `200` | `{ "items": ["STARTcloud/startcloud_generic_provisioner", …] }` |
| `401` | `{ "error": "missing bearer token" }` / `{ "error": "invalid token: <reason>" }` |

### POST /watches

Bearer JWT. Body `{ "id": "<organization>/<name>" }`; the id must match `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`. Adding an id already watched is a no-op.

| Status | Body |
| --- | --- |
| `204` | empty — watched |
| `400` | `{ "error": "invalid watch" }` |
| `401` | `{ "error": "missing bearer token" }` / `{ "error": "invalid token: <reason>" }` |

### DELETE /watches?id=…

Bearer JWT. Removes the id from the caller's watches; the record disappears with its last id.

| Status | Body |
| --- | --- |
| `204` | empty — unwatched (or never watched) |
| `400` | `{ "error": "id required" }` |
| `401` | `{ "error": "missing bearer token" }` / `{ "error": "invalid token: <reason>" }` |

### GET /watches/watchers?item=…

Authenticated by the `X-Dispatch-Key` header like `/push/dispatch`; the data job's lookup of who watches an item before it notifies them.

| Status | Body |
| --- | --- |
| `200` | `{ "uuids": ["<user uuid>", …] }` |
| `400` | `{ "error": "item required" }` — missing or malformed item id |
| `401` | `{ "error": "bad dispatch key" }` |

### POST /admin/rebuild

Bearer JWT whose `authorities` claim contains `ROLE_ADMIN`. Fires a `workflow_dispatch` of `generate-catalog-data.yml` on `STARTcloud/provisioner-catalog` at `ref: main` with inputs `requested_by` (the caller's `UUID`, falling back to `sub`) and `forceRepositoryUpdate: "true"`, so the run publishes even when the data is unchanged and notifies the requester when it finishes.

| Status | Body |
| --- | --- |
| `202` | `{ "status": "queued" }` — GitHub accepted the dispatch |
| `401` | `{ "error": "missing bearer token" }` / `{ "error": "invalid token: <reason>" }` |
| `403` | `{ "error": "admin role required" }` |
| `502` | `{ "error": "dispatch failed (<status>)" }` — GitHub answered anything but `204` |
| `503` | `{ "error": "dispatch not configured" }` — the Worker has no `DISPATCH_PAT` |

### GET /admin/rebuild/status

Same auth as `/admin/rebuild`. Reads the single most recent run of the same workflow.

| Status | Body |
| --- | --- |
| `200` | `{ "status": "<run status>", "conclusion": "<run conclusion>" }` — `status` is GitHub's run status (`queued`, `in_progress`, `completed`, …) or `unknown` when no run exists; `conclusion` is GitHub's (`success`, `failure`, …) or `null` while the run is not complete |
| `401` | `{ "error": "missing bearer token" }` / `{ "error": "invalid token: <reason>" }` |
| `403` | `{ "error": "admin role required" }` |
| `502` | `{ "error": "status fetch failed (<status>)" }` |
| `503` | `{ "error": "dispatch not configured" }` |

The web UI polls this every 10 seconds (at most 90 times) after a rebuild, reporting success once it has seen `queued`/`in_progress` followed by `completed`.

### GET /health

No auth. The Worker's own health document, in the shape BoxVault's `/api/health` speaks so the shared footer renders both: every `services` value is a coarse status word, `ok`, `warning (<status>)` or `error (<reason>)`, and `status` is `error` when any service is, else `warning` when any is, else `ok`. The Worker caches the document for 60 seconds; the web UI's footer polls it every 60 seconds and shows the overall state as the heart, the per-service words on hover.

| Service | Probe |
| --- | --- |
| `worker` | always `ok` — the Worker answered |
| `idp` | `GET {ISSUER}/.well-known/openid-configuration` |
| `pages` | `GET /catalog.json` on this host |
| `store` | `GET https://api.github.com/repos/{STORE_REPO}` with the read-only PAT; `error (not configured)` without one |

```json
{
  "status": "ok",
  "timestamp": "2026-09-02T21:05:09.000Z",
  "services": { "worker": "ok", "idp": "ok", "pages": "ok", "store": "ok" }
}
```

### GET /config

No auth. The estate settings the web UI needs at runtime, the same role BoxVault's `/api/config/hyperweaver` plays: `hyperweaver.url` is the Hyperweaver origin from the Worker's `HYPERWEAVER_URL` var, an empty string when none is configured, in which case the UI draws no Deploy control.

```json
{ "hyperweaver": { "url": "https://hyperweaver.example.com" } }
```

The UI's Deploy controls, for a signed-in viewer whose token carries a Hyperweaver entry in the `entitlements` claim, open `{hyperweaver.url}/?create=machine&provisioner={owner/name}&provisioner_version={version}&provisioner_url={artifact URL}`, the provisioner deep link Hyperweaver's machine wizard reads beside its `box*` parameters.

### GET /api/status

No auth. The app identity every host of the STARTcloud UI answers before the UI renders anything: `role` names the app the UI boots (`catalog` here, `boxvault` on BoxVault) and `version` is this repository's released version, read from the `version.txt` the data job publishes beside `catalog.json` and cached for 60 seconds. An unreadable `version.txt` yields an empty string, never an error.

```json
{ "role": "catalog", "version": "0.0.62" }
```

---

## Notification hub production

Beyond web push, the data job produces inbox notifications on the STARTcloud IdP's notification hub. The web UI's bell reads that inbox from the IdP (`/api/notifications`, `/api/notifications/unread-count`, read/read-all), not from this catalog.

### Authentication

The job obtains a hub token with the OAuth `client_credentials` grant at the issuer's token endpoint (discovered from `<issuer>/.well-known/openid-configuration`), scope `notifications:write`, HTTP Basic client authentication with `CATALOG_HUB_CLIENT_ID` / `CATALOG_HUB_CLIENT_SECRET`. The issuer defaults to `https://dev-auth.startcloud.com` (`CATALOG_HUB_ISSUER`). When either credential is absent the notification is skipped and logged; a failed send is a warning, never a build failure.

### Request

`POST <issuer>/api/notify` with `Authorization: Bearer <hub token>`:

```json
{
  "recipient": { "org_uuid": "00000000-0000-0000-0000-000000000000" },
  "notification": {
    "title": "startcloud_generic_provisioner 0.1.26 released",
    "body": "New provisioner version in the Example Org private catalog.",
    "navigate": "https://provisioner-catalog.startcloud.com/",
    "tag": "catalog-startcloud_generic_provisioner"
  },
  "type": "SYSTEM",
  "severity": "INFO",
  "delivery": { "ttl": 86400, "urgency": "normal" },
  "idempotencyKey": "catalog:00000000-0000-0000-0000-000000000000:startcloud_generic_provisioner:0.1.26"
}
```

| Field | Value |
| --- | --- |
| `recipient` | `{ "org_uuid": "…" }` for org-wide delivery, `{ "user_uuid": "…" }` for a single user |
| `notification.title` | Truncated to 255 characters |
| `notification.body` | Truncated to 1000 characters |
| `notification.navigate` | Always `https://provisioner-catalog.startcloud.com/` |
| `notification.tag` | `catalog-<family>` or `catalog-rebuild` |
| `type` | Always `SYSTEM` |
| `severity` | Always `INFO` |
| `delivery` | Always `{ "ttl": 86400, "urgency": "normal" }` |
| `idempotencyKey` | Truncated to 128 characters; see the table below |

### What is sent when

| Trigger | Hub notification | Push dispatch event |
| --- | --- | --- |
| New `(family, version)` appears in the public catalog (baseline present) | none | `scope: public`, title `<family> <version> released`, body `New provisioner version in the public catalog`, tag `catalog-<family>` |
| New `(family, version)` appears in an org's private catalog (baseline present) | recipient `{ "org_uuid" }`, title `<family> <version> released`, body `New provisioner version in the <Org name> private catalog.`, key `catalog:<org_uuid>:<family>:<version>` | `scope: org`, `org_uuid`, same title, body `New version in the <Org name> private catalog`, tag `catalog-<family>` |
| A `workflow_dispatch` run with `requested_by` finishes | recipient `{ "user_uuid": <requested_by> }`, title `Catalog rebuild finished: <build result>`, body `Build <build result>, deploy <deploy result>.`, key `catalog:rebuild:<run id>` | `scope: user`, `uuid`, same title and body, tag `catalog-rebuild` |
| A new `(family, version)` appears on a provisioner someone watches, public or private (baseline present) | one per watcher from `GET /watches/watchers`: recipient `{ "user_uuid" }`, title `<family> <version> released`, body `New version of <organization>/<family>, a provisioner you watch.`, navigate the item page, key `catalog:watch:<uuid>:<organization>/<family>:<version>` | `scope: user`, `uuid`, same title, body and navigate, tag `catalog-<family>` |

A first publish (no baseline document yet) sends nothing. Push dispatch goes to `https://provisioner-catalog.startcloud.com/push/dispatch` (`CATALOG_PUSH_DISPATCH_URL`) with `X-Dispatch-Key: <CATALOG_PUSH_DISPATCH_KEY>` and is skipped when the key is absent.

---

## Error handling

The static documents are plain GitHub Pages files — a missing document is a Pages `404`. Every Worker error is a JSON object with a single `error` string, `Content-Type: application/json; charset=utf-8` and `Cache-Control: private, no-store`:

```json
{
  "error": "not a member of this organization"
}
```

| Status | Meaning |
| --- | --- |
| `200` | Success with a JSON body |
| `202` | Rebuild dispatch accepted |
| `204` | Success with no body (`OPTIONS`, subscription stored or deleted) |
| `400` | Malformed body or missing query parameter |
| `401` | Missing or invalid Bearer JWT, or a bad `X-Dispatch-Key` |
| `403` | Valid token without the required org membership or `ROLE_ADMIN` |
| `404` | Unknown route, or no catalog/health file published for the org |
| `405` | Non-GET method on a `/private/…` path |
| `502` | The private store or GitHub Actions API answered with an unexpected status |
| `503` | The Worker lacks the secret the route needs (VAPID keys, `DISPATCH_PAT`) |

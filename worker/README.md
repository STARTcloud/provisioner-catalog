# provisioner-catalog-gate — deploy notes

Cloudflare Worker gating `/private/{org-uuid}/catalog.json` on
`provisioner-catalog.startcloud.com`. Code is committed; CI deploys it on any
push to main touching `worker/**` (deploy-worker.yml). Every secret lives only
in Cloudflare; `.wrangler/` stays gitignored.

## One-time setup

1. Install wrangler and log in (run from this `worker/` folder):

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Make sure the DNS record for `provisioner-catalog.startcloud.com` is
   **Proxied (orange cloud)** in the Cloudflare dashboard — a grey-cloud
   record bypasses Workers entirely and `/private/*` would hit Pages (404).
   The CNAME to GitHub Pages itself stays exactly as it is.

3. Deploy the Worker and its route:

   ```bash
   wrangler deploy
   ```

4. Store the read-only store PAT (the fine-grained token named `Worker read`,
   scoped to STARTcloud/provisioner-catalogs-private, Contents: Read-only).
   Prompts for a paste:

   ```bash
   wrangler secret put GITHUB_PAT
   ```

## Verifying

- `curl https://provisioner-catalog.startcloud.com/private/00000000-0000-0000-0000-000000000000/catalog.json`
  → `401 {"type":"https://auth.startcloud.com/probs/authentication","title":"The request was not authenticated.","status":401,"detail":"missing bearer token"}` means the route + Worker are live.
- Same URL with a valid Bearer token for a member org → that org's catalog.json.
- `curl https://provisioner-catalog.startcloud.com/catalog.json` must still
  return the public catalog straight from Pages (Worker untouched).
- `curl https://provisioner-catalog.startcloud.com/api/status` → the app identity and capabilities the STARTcloud UI probes before it renders (`idp` comes from `ISSUER` and `AUDIENCE`; `features` gates the UI: `private-catalogs` the per-org `/api/private/<uuid>/...` fetches and the access-denied banner, `watches` the watch stars and Watched filter, `deploy` the Deploy button, `rebuild` the Rebuild catalog data row, `notifications` the Notifications row, `footer` the footer, `health` the heart in it):

  ```json
  {
    "role": "catalog",
    "version": "…",
    "brand": {
      "name": "Provisioner Catalog",
      "logoUrl": "/startcloud.svg",
      "repo": "https://github.com/STARTcloud/provisioner-catalog"
    },
    "auth": ["idp"],
    "idp": {
      "issuer": "https://dev-auth.startcloud.com",
      "clientId": "provisioner-catalog",
      "scopes": "openid profile email organizations notifications entitlements",
      "storagePrefix": "catalog"
    },
    "collections": ["provisioners"],
    "features": [
      "private-catalogs",
      "watches",
      "deploy",
      "rebuild",
      "notifications",
      "health",
      "footer"
    ],
    "links": { "docs": "/docs/", "contact": "https://startcloud.com/#contact" },
    "ticket": {
      "baseUrl": "https://xd.prominic.net/app/apprequest.nsf/router?openagent",
      "reqType": "sso",
      "fallbackCustomerId": "A55DF1"
    }
  }
  ```

- `curl https://provisioner-catalog.startcloud.com/health` → `{"status":"ok",…}`
- `curl https://provisioner-catalog.startcloud.com/config` → `{"hyperweaver":{"url":"…"}}`, the `HYPERWEAVER_URL` var
- `curl https://provisioner-catalog.startcloud.com/watches` → the same `401` `authentication` problem (the route answers; the UI calls it with the user's token)
  with `worker`, `idp`, `pages` and `store` all `ok`; the footer heart reads it.
- Every Worker route also answers under `/api/`, the paths the STARTcloud UI calls on every host; the old paths keep answering unchanged:
  - `curl https://provisioner-catalog.startcloud.com/api/catalog` → the public `catalog.json`, proxied from Pages with the Worker's JSON headers; `/api/catalog/health` the same for `health.json`
  - `curl https://provisioner-catalog.startcloud.com/api/private/00000000-0000-0000-0000-000000000000/catalog` → the same `401` `authentication` problem, the same gate as `/private/<uuid>/catalog.json`; `/api/private/<uuid>/health` likewise
  - `curl https://provisioner-catalog.startcloud.com/api/health` → the same document as `/health`; `/api/config` the same as `/config`
  - `curl https://provisioner-catalog.startcloud.com/api/watches` → the same `401` `authentication` problem; `/api/push/vapid-key`, `/api/push/subscriptions`, `/api/push/test-toast`, `/api/push/test-channel`, `/api/admin/rebuild` and `/api/admin/rebuild/status` answer as their unprefixed routes do
  - `curl https://provisioner-catalog.startcloud.com/api/anything-else` → `404 {"type":"https://auth.startcloud.com/probs/not-found","title":"The resource was not found.","status":404,"detail":"not found"}` from the Worker, never the Pages `index.html` fallback
- Every `400`, `401`, `403`, `404` and `422` answers `application/problem+json` (RFC 9457, the Universal Validation Contract) with a `type` under `https://auth.startcloud.com/probs/`, the body the STARTcloud UI reads as `ApiError.problem` and `ApiError.fieldErrors`; the `detail` is for logs and never drawn:
  - `400 {"type":"https://auth.startcloud.com/probs/bad-request","title":"The request could not be read.","status":400,"detail":"body is not JSON"}` when the request could not be read: a `POST` body that is not JSON, a `DELETE /watches` without `id`, a `DELETE /push/subscriptions` without `endpoint`, a `GET /watches/watchers` whose `item` does not match `watchId`
  - `401` `authentication` on a missing or invalid token and on a bad `X-Dispatch-Key`; `403` `forbidden` on a non-member or a caller without `ROLE_ADMIN`; `404` `not-found` on an unknown route or an unpublished document
  - `422 {"type":"https://auth.startcloud.com/probs/validation","title":"The request did not pass validation.","status":422,"errors":[{"pointer":"/id","rule":"pattern","params":{"pattern":"watchId"},"detail":"id must match watchId"}]}` when a value breaks a rule, one `errors[]` entry per failing member: `POST /watches` checks `/id` (`required`, `type`, `pattern` `nonBlank`, `pattern` `watchId`); `POST /push/subscriptions` checks `/endpoint` (`required`, `type`, `pattern` `nonBlank`, `format` `uri`, `maxLength` 512), `/keys/p256dh` and `/keys/auth` (`required`, `type`, `pattern` `nonBlank`); `required` means present, a blank string is `nonBlank`, every `params.pattern` is a contract `$defs` name
  - `405`, `502` and `503`, statuses the problem registry names no type for, stay `{"error":"…"}`; the 204s are unchanged

## Config changes

Vars (`ISSUER`, `AUDIENCE`, `STORE_REPO`, `ALLOWED_ORIGINS`, `VAPID_PUBLIC_KEY`,
`VAPID_SUBJECT`, `DISPATCH_REPO`, `DISPATCH_WORKFLOW`, `HYPERWEAVER_URL`) live in
`wrangler.toml` — edit and `wrangler deploy` again. When the prod IdP host
replaces dev-auth, change `ISSUER` here (it must match the `iss` claim in
tokens exactly) and redeploy.

## Rotating the PAT

Generate a new fine-grained token (same scope), then:

```bash
wrangler secret put GITHUB_PAT
```

and revoke the old token on GitHub. No redeploy needed.

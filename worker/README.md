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
  → `401 {"error":"missing bearer token"}` means the route + Worker are live.
- Same URL with a valid Bearer token for a member org → that org's catalog.json.
- `curl https://provisioner-catalog.startcloud.com/catalog.json` must still
  return the public catalog straight from Pages (Worker untouched).
- `curl https://provisioner-catalog.startcloud.com/api/status` → the app identity and capabilities the STARTcloud UI probes before it renders (`idp` comes from `ISSUER` and `AUDIENCE`; `features` gates the UI: `private-catalogs` the per-org `/api/private/<uuid>/...` fetches and the access-denied banner, `watches` the watch stars and Watched filter, `deploy` the Deploy button, `rebuild` the Rebuild catalog data row, `notifications` the Notifications row, `health` the footer heart):

  ```json
  {
    "role": "catalog",
    "version": "…",
    "brand": { "name": "Provisioner Catalog", "logoUrl": "/startcloud.svg", "repo": "https://github.com/STARTcloud/provisioner-catalog" },
    "auth": ["idp"],
    "idp": { "issuer": "https://dev-auth.startcloud.com", "clientId": "provisioner-catalog", "scopes": "openid profile email organizations notifications entitlements", "storagePrefix": "catalog" },
    "collections": ["provisioners"],
    "features": ["private-catalogs", "watches", "deploy", "rebuild", "notifications", "health"],
    "links": { "docs": "/docs/", "contact": "https://startcloud.com/#contact" },
    "ticket": { "baseUrl": "https://xd.prominic.net/app/apprequest.nsf/router?openagent", "reqType": "sso", "fallbackCustomerId": "A55DF1" }
  }
  ```

- `curl https://provisioner-catalog.startcloud.com/health` → `{"status":"ok",…}`
- `curl https://provisioner-catalog.startcloud.com/config` → `{"hyperweaver":{"url":"…"}}` (empty until `HYPERWEAVER_URL` is set)
- `curl https://provisioner-catalog.startcloud.com/watches` → `{"error":"missing bearer token"}` (the route answers; the UI calls it with the user's token)
  with `worker`, `idp`, `pages` and `store` all `ok`; the footer heart reads it.

## Config changes

Vars (`ISSUER`, `AUDIENCE`, `STORE_REPO`, `ALLOWED_ORIGINS`) live in
`wrangler.toml` — edit and `wrangler deploy` again. When the prod IdP host
replaces dev-auth, change `ISSUER` here (it must match the `iss` claim in
tokens exactly) and redeploy.

## Rotating the PAT

Generate a new fine-grained token (same scope), then:

```bash
wrangler secret put GITHUB_PAT
```

and revoke the old token on GitHub. No redeploy needed.

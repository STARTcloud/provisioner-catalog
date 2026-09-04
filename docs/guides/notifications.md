---
title: Notifications
layout: default
nav_order: 7
parent: Guides
permalink: /guides/notifications/
---

# Notifications

{: .no_toc }

How the catalog tells people about new provisioner versions and finished rebuilds: Notification Channel Notifications, the feed shared across the STARTcloud estate and shown in the notifications modal, and toasts, the OS notifications delivered by the catalog's own Web Push stack. In-app notices (the banners and cards the page itself raises) are a third thing and belong to the navbar contract, not to this guide.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Two channels

The catalog produces into two independent channels. The Notification Channel Notification is the source of truth; a toast is best-effort delivery on top of it.

| Channel | Who runs it | What the user sees | How the catalog writes to it |
| --- | --- | --- | --- |
| **Notification Channel Notifications** | The STARTcloud auth server (the OIDC issuer), the notification hub | The Notifications row of the user menu in the catalog UI and in every other estate app, opening the modal; the full inbox at `<issuer>/notifications` | `POST /api/notify` on the issuer, S2S, with a `client_credentials` token carrying the `notifications:write` scope (`scripts/notify.py`) |
| **Toasts** | The catalog itself: its own VAPID key pair, its own service worker, the Cloudflare Worker on `/push/*` | An OS notification from `provisioner-catalog.startcloud.com` | `POST /push/dispatch` on the Worker, authenticated with a shared dispatch key; the Worker encrypts and sends to every matching subscription |

The split follows the hub's contract: the hub never toasts a producer's events, so an app that wants toasts for its own events runs its own push stack on its own origin. The Notification Channel carries everything regardless of whether a toast was delivered.

Hub notifications are always written as `type: SYSTEM`, `severity: INFO`, with push-tier delivery hints `ttl: 86400` and `urgency: normal`, and carry a producer-chosen `idempotencyKey` so a re-run never duplicates a row. Push events carry `title`, `body`, `navigate` (the catalog root), and a `tag` so repeated toasts for the same family collapse in the OS.

## What triggers a notification

| Event | Where it fires | Notification Channel Notification | Toast |
| --- | --- | --- | --- |
| New version in the **public** catalog | `scripts/build_catalog.py`, after the immutability tripwire passes | none | scope `public`: every subscription |
| New version in a **private** org catalog | `scripts/build_org_catalogs.py`, per org | recipient `{org_uuid}`: every member of that organization | scope `org`: subscriptions whose token listed that org |
| **Admin rebuild** finished | `scripts/notify_done.py`, run by the `notify-requester` job of `generate-catalog-data.yml` | recipient `{user_uuid}`: the requester | scope `user`: the requester's subscriptions |

Details per trigger:

- **New version detection** is a set difference: the `(family, version)` pairs in the freshly built document minus the pairs in the currently published one. One event per new pair, titled `<family> <version> released`, tagged `catalog-<family>`, pointing at the catalog root.
- **Public releases get no hub notification.** The hub addresses exactly one user or one organization per write; there is no recipient that means "everyone", so public releases reach subscribers only as toasts.
- **Private releases** additionally write a hub row addressed to the organization (the hub resolves fan-out to members itself), with idempotency key `catalog:<org-uuid>:<family>:<version>`. Push events for all orgs are collected and dispatched once at the end of the run.
- **First publish sends nothing.** When no catalog is published yet (public: the published URL returns 404; private: no `orgs/<uuid>/catalog.json` in the store), there is no baseline to diff against, so no events are generated.
- **Rebuild completion** fires only for runs started through `workflow_dispatch` with a non-empty `requested_by` input, which is what the admin button provides. The job runs with `always()`, so a failed build still notifies. Title: `Catalog rebuild finished: <build result>`; body: `Build <result>, deploy <result>.`; tag `catalog-rebuild`; idempotency key `catalog:rebuild:<run id>`.
- **Notifications never fail the build.** Missing credentials log `hub notification skipped (no credentials)` or `push dispatch skipped (no key)`; a delivery error logs a warning and the run continues.

## The Notifications row and modal

The user menu's Notifications row (`web/src/chrome/NotificationsItem.jsx`) and the modal it opens (`web/src/chrome/NotificationsModal.jsx`, titled "Notification Channel Notifications") are the catalog's view of the hub inbox, shared byte for byte with BoxVault.

- **Requires the `notifications` scope on the access token.** The SPA requests `openid profile email organizations notifications entitlements` at sign-in; the row renders only when the signed-in user's token scope contains `notifications`. A user token without it is refused by the hub's read API, so the row hides rather than erroring.
- **Polling:** the unread count (`GET /api/notifications/unread-count`) is fetched on sign-in and every 60 seconds; the badge shows the count when it is above zero.
- **Opening the modal** loads the first page of 20 entries (`GET /api/notifications?page=0&size=20`). Each entry shows an icon by type (shield for `SECURITY` and `OAUTH`, envelope for `ACCOUNT`, cog for `ADMIN` and `SYSTEM`, warning triangle for `ALERT`), colored by severity, plus title, body, and relative time; unread entries are bold with a dot, and hovering a row shows mark-read and dismiss.
- **Clicking an entry** marks it read (`POST /api/notifications/<id>/read`) and, when the entry carries an `https://` `navigate` URL, opens it in the current tab.
- **Mark all read** calls `POST /api/notifications/read-all`.
- **View all** links to the hub's own inbox page at `<issuer>/notifications` in a new tab.
- **The paper-plane glyph, "Send a test Notification Channel Notification"**, posts `POST /push/test-channel` on the Worker with the user's token; the Worker writes one hub notification addressed to the caller's uuid and the row appears in the modal on its next load.

In production the modal calls the issuer directly through the shared API client; the Vite dev server proxies `/api/notifications` to `auth_target` from `web/config.yaml`.

## Enabling toasts

Toasts are opt-in per browser through the modal's footer switch (`web/src/chrome/NotificationsModal.jsx`, `web/src/chrome/push.js`, `web/public/notification-sw.js`).

**The switch.** "Toasts (OS notifications) on this device". Switching it on:

1. Checks support: `serviceWorker`, `PushManager`, and `Notification` must all exist. Otherwise the modal shows "This browser does not support toasts."
2. Calls `Notification.requestPermission()`. The browser prompts only while the permission is undecided; anything but `granted` shows "The browser denied notification permission."
3. Registers `/notification-sw.js`, fetches the catalog's VAPID public key from `GET /push/vapid-key`, subscribes with `userVisibleOnly: true`, and uploads `PushSubscription.toJSON()` to `POST /push/subscriptions` with the user's token.
4. Records `catalog.push_enabled` in `localStorage`; the switch stays on and the screen glyph **Send a test toast** appears on the footer's right, which posts `POST /push/test-toast` so the Worker pushes one toast to the caller's own subscriptions.

**Why a click is required.** Browsers only show the notification permission prompt in response to a user gesture, so the subscription can never be created silently on page load; it has to start from the switch.

**Per-browser subscription.** A push subscription belongs to one browser profile on one device. The Worker stores each one in its `SUBS` KV namespace keyed by a hash of the push endpoint, together with the user's uuid and the organization uuids from the token at upload time. Enabling on a second browser is a second subscription.

**Resync on page load.** On every load the SPA re-uploads the current subscription when `catalog.push_enabled` is set and push is supported. This refreshes the stored uuid and organization list from the current token and covers browsers that rotate subscriptions without firing `pushsubscriptionchange`. If the browser no longer has a subscription, the flag is cleared and the switch shows off again. Resync failures are silent.

**Disable.** Switching off calls `DELETE /push/subscriptions?endpoint=<endpoint>` with the user's token, then unsubscribes in the browser and clears the flag. Signing out does not unsubscribe; switch off first if the browser should stop receiving toasts.

**Service worker behaviour.**

- `push`: decodes the JSON payload and calls `showNotification` with the title (falling back to `Provisioner Catalog`), body, icon, tag, data, and actions.
- `notificationclick`: closes the notification and opens `data.navigate`, or `/` when absent.
- `pushsubscriptionchange`: re-subscribes with the previous `applicationServerKey`; the next page load uploads the new subscription to the Worker.

**Worker delivery.** `POST /push/dispatch` is accepted only with the correct `X-Dispatch-Key` header and only when both VAPID keys are configured. For each event the Worker selects targets by scope (`public`: all; `org`: records listing that `org_uuid`; `user`: records with that `uuid`), encrypts the payload with `aes128gcm`, signs a VAPID `ES256` header for the push service origin, and sends with `TTL: 86400` and `Urgency: normal`. A push-service response of 403, 404, or 410 deletes the dead subscription. The response reports `delivered`, the count of accepted sends.

## The admin rebuild button

Users whose token `authorities` include `ROLE_ADMIN` see **Rebuild catalog data** in the user menu.

1. The SPA posts to `/admin/rebuild` with the Bearer token. The Worker verifies the JWT, requires `ROLE_ADMIN`, and dispatches `generate-catalog-data.yml` on `main` in the catalog repository with inputs `requested_by` (the caller's uuid) and `forceRepositoryUpdate: true`, then answers `202 {"status":"queued"}`.
2. The menu shows "Rebuild running…" and the item's icon becomes a spinner. The SPA polls `GET /admin/rebuild/status` every 10 seconds, up to 90 times. The Worker returns the status and conclusion of the workflow's most recent run.
3. Polling waits until it has seen `queued` or `in_progress` once, then stops on `completed`, showing "Rebuild finished." or "Rebuild failed: `<conclusion>`". A polling error or the 90-poll cap stops the spinner silently.
4. When the run finishes, the `notify-requester` job sends the completion hub notification and a user-scoped push to the requester, whether or not the SPA is still polling.

Because the data workflow runs in the `catalog-pages` concurrency group without cancel-in-progress, a rebuild dispatched while a scheduled run is active queues behind it. `forceRepositoryUpdate` makes the rebuild deploy to Pages even when the generated data is unchanged.

## Configuration by name

Values are never documented here; only the names and where each lives.

### GitHub Actions secrets (catalog repository)

| Name | Used by | Purpose |
| --- | --- | --- |
| `CATALOG_HUB_CLIENT_ID` | `build-private`, `notify-requester` | Machine client id for the hub's `client_credentials` grant |
| `CATALOG_HUB_CLIENT_SECRET` | `build-private`, `notify-requester` | Its secret; sent as HTTP Basic to the token endpoint |
| `CATALOG_PUSH_DISPATCH_KEY` | `build`, `build-private`, `notify-requester` | Value of the `X-Dispatch-Key` header for `/push/dispatch`; must equal the Worker's `DISPATCH_KEY` |
| `CLOUDFLARE_API_TOKEN` | `deploy-worker.yml` | Deploys the Worker with wrangler on pushes touching `worker/**` |

**Environment variables read by `scripts/notify.py`** (not set in the workflows; defaults apply)

| Name | Default |
| --- | --- |
| `CATALOG_HUB_ISSUER` | `https://dev-auth.startcloud.com` |
| `CATALOG_PUSH_DISPATCH_URL` | `https://provisioner-catalog.startcloud.com/push/dispatch` |

**Cloudflare Worker (`worker/wrangler.toml` vars, committed)**

| Name | Purpose |
| --- | --- |
| `ISSUER` | Must equal the `iss` claim of user tokens; JWKS is discovered from it |
| `AUDIENCE` | Registered audience of the `provisioner-catalog` client |
| `ALLOWED_ORIGINS` | Origins granted CORS on `/push/*` and `/admin/*` |
| `VAPID_PUBLIC_KEY` | Served by `GET /push/vapid-key`; the `k=` part of the VAPID header |
| `VAPID_SUBJECT` | The `sub` claim of the VAPID JWT (a `mailto:` address) |
| `DISPATCH_REPO` | Repository whose workflow the rebuild button dispatches |
| `DISPATCH_WORKFLOW` | The workflow file dispatched and polled (`generate-catalog-data.yml`) |
| `SUBS` | KV namespace binding holding push subscriptions |

**Cloudflare Worker secrets (`wrangler secret put`)**

| Name | Purpose |
| --- | --- |
| `VAPID_PRIVATE_KEY` | Signs VAPID headers; push stays inert until both VAPID values are set |
| `DISPATCH_KEY` | Shared key checked on `/push/dispatch` |
| `HUB_CLIENT_ID`, `HUB_CLIENT_SECRET` | The catalog's machine client for the hub, the same one the data job uses as `CATALOG_HUB_*`; `/push/test-channel` answers 503 without them |
| `DISPATCH_PAT` | GitHub token the Worker uses to dispatch the data workflow and read its runs; `/admin/*` answers 503 without it |
| `GITHUB_PAT` | Read-only token for the private store (private catalogs, not notifications) |

### Auth server

| Item | Requirement |
| --- | --- |
| User client `provisioner-catalog` | Granted the `notifications` scope so the bell can read the inbox |
| Machine client for the catalog | Granted the `notifications:write` scope; its credentials are the two `CATALOG_HUB_*` secrets. One machine client per producer service |

## Troubleshooting

**The Notifications row is missing.** Either nobody is signed in or the access token lacks the `notifications` scope. After the scope is granted on the client, sign out and back in to get a token that carries it.

**"Failed to load notifications."** The hub read API refused or was unreachable. Check that the token still carries `notifications` and that the issuer is up.

**"This browser does not support toasts."** The page could not find `serviceWorker`, `PushManager`, or `Notification`. Push needs a secure context; on Safari it requires the platform's Web Push support (on iOS, a Home Screen web app).

**No permission prompt appeared.** The browser prompts only while the permission is undecided; when it is already allowed the switch just subscribes, and when it is blocked the switch shows "The browser denied notification permission", so reset the site's notification permission in the browser and switch on again.

**"Failed to enable toasts."** The subscribe flow failed after permission. `GET /push/vapid-key` answers 503 `push not configured` when `VAPID_PUBLIC_KEY` is unset; `POST /push/subscriptions` answers 401 on a missing or expired token and 400 on a malformed subscription.

**"Test failed: …" on the test toast.** `POST /push/test-toast` answered 503 `push not configured` (no VAPID keys on the Worker) or 401; `delivered: 0` with the switch on means the push service rejected every send, so switch off and on again to re-subscribe.

**"Test failed: …" on the test Notification Channel Notification.** `POST /push/test-channel` answered 503 `hub not configured` (no `HUB_CLIENT_ID` / `HUB_CLIENT_SECRET` on the Worker), 502 `hub token failed` (the client is not granted `notifications:write`) or 502 `hub write failed` (the hub refused the write).

**Toasts stopped arriving.** Browsers rotate subscriptions; reload the catalog so the page-load resync uploads the current one. If the browser dropped the subscription entirely, the switch shows off again and it must be switched on. A push service answering 403, 404, or 410 causes the Worker to delete that subscription.

**No toasts for a private catalog.** Organization membership is captured from the token when the subscription is uploaded. After joining an organization, sign in again and reload so the resync stores the new organization list.

**No hub notification for a release.** Public releases never write to the hub by design. For private releases and rebuilds, look in the workflow log for `hub notification skipped (no credentials)` (the `CATALOG_HUB_*` secrets are unset) or `hub notification failed (...)` (token or write request error; the run continues).

**No push for a release.** `push dispatch skipped (no key)` means `CATALOG_PUSH_DISPATCH_KEY` is unset. A 401 `bad dispatch key` from the Worker means it differs from `DISPATCH_KEY`. A 503 `push not configured` means the Worker lacks a VAPID key. `delivered=0` with subscribers present means every send was rejected by the push services.

**Nothing on the first publish.** Expected: with no published baseline there are no new pairs to announce.

**The rebuild button is missing.** The token's `authorities` do not include `ROLE_ADMIN`.

**Rebuild answers 503 `dispatch not configured`.** `DISPATCH_PAT` is not set on the Worker. A 502 `dispatch failed (<status>)` is GitHub refusing the dispatch with that token.

**The spinner stops with no message.** Polling stopped on a request error or after 90 polls (15 minutes). The status endpoint reports only the workflow's most recent run, so a scheduled run that started in the meantime is what it observes. The completion notification still arrives through the bell and as a toast when the run ends.

---

Next: [Configuration](../../configuration/) — workflow secrets, Worker vars, and the web UI dev server

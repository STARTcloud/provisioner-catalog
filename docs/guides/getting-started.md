---
title: Getting Started
layout: default
nav_order: 1
parent: Guides
permalink: /guides/getting-started/
---

# Getting Started

{: .no_toc }

This guide walks you through the STARTcloud Provisioner Catalog from three sides: browsing it in the web UI, consuming it from an agent, and publishing your first provisioner package.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Prerequisites

- **A browser** — the catalog UI at `https://provisioner-catalog.startcloud.com` needs nothing else for the public catalog
- **A STARTcloud IdP account** (optional) — sign-in unlocks private per-organization catalogs, the notification inbox, and push notifications; the private tab shows the organizations in your access token
- **A Zoneweaver Agent** (optional) — to install provisioners from the catalog; the STARTcloud catalog is its built-in default source
- **A GitHub repository with published releases** (optional) — to publish a provisioner; drafts and prereleases are ignored

## Browse the catalog

Open `https://provisioner-catalog.startcloud.com`. The page loads `catalog.json` and `health.json` from the same origin and renders one card per provisioner family.

### Cards

Each card shows the family's label (or its `name` slug), the owning GitHub account, the latest version, a measured quality tier badge, and links to the repository, its homepage when the manifest declares one, and a "Report an issue" link into the repository's issue tracker. Expanding **versions** lists every recorded version with its release date, a download link to the immutable versioned artifact, and its `sha256` checksum. Expanding **Quality** lists the unmet tier rules, or confirms that every rule passes.

Health chips appear when the data run found something worth flagging: a stale family (last release more than 365 days ago), artifact download errors, or incomplete checksum sidecars.

### Search

The search box filters cards by family name, description, repository, or label. While a query is active, each section heading shows a matched/total count.

### Theme and language

The header's theme button cycles **Auto → Light → Dark**. The user menu's first entry opens the language picker; the available languages are the locale folders shipped with the UI. Both choices persist in the browser, and when you are signed in they are saved to your IdP account preferences and restored on your next sign-in.

### Sign in

The user menu's **Sign in** entry starts an OIDC authorization-code + PKCE flow against the STARTcloud IdP. The catalog is a public client with no secret. After the IdP redirects back to `/callback`, the page exchanges the code, syncs your account preferences, and returns you to the catalog. Sign-in state is stored in the browser, and access tokens are refreshed automatically shortly before they expire.

### Public and private tabs

Signed out, or signed in with no organization that has a published private catalog, the page shows only the **Public Catalog** section.

Signed in as a member of at least one organization with a private catalog, the page switches to two tabs:

| Tab | Content |
| --- | --- |
| **Public Catalog** | The same public data everyone sees; hovering the tab title shows when it was last regenerated |
| **Private Catalog** | One section per organization in your token, each fetched from `/private/<org-uuid>/catalog.json` with your bearer token |

Organizations with no private catalog published are hidden from the private tab. Organizations the gate refuses show an "Access denied by the catalog gate" notice in place of their cards.

### Organization switcher

When your token carries organizations, the user menu gains an **Organizations** entry. It opens a modal listing every organization with its logo, description, roles, and primary flag; selecting one scrolls to its section. Organizations without a published catalog are listed but disabled, marked "No catalog published yet".

### Notifications bell

Signed in with the `notifications` scope, a bell appears in the header. It polls the IdP for your unread count once a minute and shows it as a badge. Opening the bell lists your latest notifications; selecting one marks it read and, when it carries a link, navigates to it. **Mark all read** and **View all** (which opens the IdP's notification page) sit at the top and bottom of the list.

### Push toggle

The user menu's **Enable notifications** entry registers the browser's service worker, asks for notification permission, subscribes with the catalog's VAPID key, and stores the subscription with the catalog gate. The entry flips to **Disable notifications** once enabled, which removes the subscription. Browsers without service worker or push support show "Notifications are not supported in this browser."

Push messages are sent when a new provisioner version appears in the public catalog, when a new version appears in one of your organizations' private catalogs, and when a catalog rebuild you requested finishes.

### Rebuild catalog data

Users whose token carries the `ROLE_ADMIN` authority see a **Rebuild catalog data** entry. It dispatches the data job with a forced publish and polls its status until the run completes, reporting the outcome in the menu.

## Consume the catalog from an agent

Agents fetch one document:

```text
https://provisioner-catalog.startcloud.com/catalog.json
```

The Zoneweaver Agent reads its catalog sources from `provisioning.catalog_sources`. When the list is empty or absent, the built-in STARTcloud default is used:

```yaml
provisioning:
  catalog_sources:
    enabled: true
    sources:
      - name: startcloud
        url: https://provisioner-catalog.startcloud.com/catalog.json
        enabled: true
        default: true
```

Each source entry accepts:

| Key | Purpose |
| --- | --- |
| `name` | The name used to select this source explicitly |
| `url` | The `catalog.json` URL |
| `enabled` | `false` drops the source; omitted means enabled |
| `default` | The source used when no name is given; otherwise the first enabled source wins |
| `ca_file` | A PEM file added to the system trust roots for a self-hosted catalog; TLS verification is never disabled |

Setting `provisioning.catalog_sources.enabled: false` disables catalog installs entirely.

### How a family/version resolves

1. The agent fetches the source's `catalog.json` and refuses any document whose `format_version` is not `1`.
2. It finds the `provisioners[]` entry whose `name` matches the requested family, then the `versions[]` entry with the exact requested version.
3. It takes that version's first artifact — always the immutable `<name>-<version>.tar.gz` release asset — as an opaque `url` plus its `checksum` and `checksum_type` (`sha256`).
4. The provisioner import task downloads the archive, verifies the `sha256` checksum against the catalog's recorded value, and imports the package.

A family or version missing from the catalog resolves to nothing; the agent never guesses at a URL or constructs one from a release tag.

Agents accept multiple catalog URLs, so a self-hosted fork of this repository can sit alongside the official source.

## Publish your first provisioner

The short version; the full walkthrough is [Publishing a Provisioner](../publishing-a-provisioner/).

### 1. Run the validation action

Add the catalog's reusable validation action to your repository's CI (the `examples/validate.yml` publisher kit is a copy-paste workflow):

```yaml
- uses: STARTcloud/provisioner-catalog@main
```

It validates your published releases through the GitHub API: versioned tar.gz present, registry shape (`<name>/<version>/…`), a parseable `provisioner.yml` whose name and version match, the required `templates/Hosts.template.yml`, matching `.sha256` sidecars, and an archive-content safety scan. It also reports the measured quality tier the family would show in the catalog. Get it green before cutting the release you will submit.

### 2. Cut a release

Publish a GitHub release carrying, at minimum:

- `<name>-<version>.tar.gz` — the immutable versioned archive, the only artifact the catalog records
- `<name>-<version>.tar.gz.sha256` — its sidecar in `sha256sum` format

The reference build also attaches the mutable `<name>.tar.gz` latest alias and its sidecar. `name` and `version` come from `provisioner.yml`; the filename, the directory inside the archive, and the manifest must agree.

### 3. Open the admission PR

Add one line to `sources.yml`, alphabetized, with an owner-attribution comment, and complete the PR template checklist. The PR checks target your repository alone: PR editability, that you own the repository or are a major contributor, that releases exist, that the repository is not in `removed.yml` or already listed, and the full validation action run. After a maintainer merges, your packages appear in the published catalog on the next data run, within about two hours. Details in [Admission](../admission/).

## Troubleshooting

**Private tab is missing after sign-in** — your token carries no organization with a published private catalog. The gate answers `404 no catalog published for this organization` for such organizations and the page hides them; the organization switcher lists them as "No catalog published yet".

**"Access denied by the catalog gate"** — the gate returned `403 not a member of this organization` (the organization uuid is not in your token's `organizations` claim) or `401`. Membership is the only thing that grants read access; there is no other route in.

**Signed out unexpectedly** — access tokens are refreshed a minute before expiry using the stored refresh token. When that refresh fails, the stored tokens are cleared and the page returns to the signed-out state; sign in again. A stale `/callback` reports "state mismatch — stale or forged callback"; return to the catalog and start the sign-in over.

**Validation action fails** — the run's annotations name the cause. The common ones:

| Message | Cause |
| --- | --- |
| `no published releases (drafts and prereleases do not count)` | Only published releases are considered |
| `no versioned '<name>-<version>.tar.gz' release assets found` | The release carries no asset matching the versioned filename pattern |
| `not registry-shaped — member '…' lives outside '<name>/<version>/'` | Package files sit at the top level of the archive |
| `manifest name '…' does not match archive family '…'` / `manifest version '…' does not match archive version '…'` | `provisioner.yml` disagrees with the asset filename |
| `required template missing at '<name>/<version>/templates/Hosts.template.yml'` | The package lacks the required template |
| `sidecar sha256 mismatch` | The `.sha256` sidecar does not match the asset; a missing sidecar is only a warning |
| `unsafe member path` / `link '…' escapes the package root` | The archive failed the safety scan |

**New version not in the catalog yet** — the data job runs every two hours; data newer than that is not yet published. Deleting a release removes its version on the next run; a release whose asset bytes changed after publication trips the immutability tripwire and the run fails rather than publish it, so rebuilt artifacts must ship as a new version.

## Next Steps

1. **[Publishing a Provisioner](../publishing-a-provisioner/)** — the artifact contract and the release build in full
2. **[Admission](../admission/)** — the PR checks and the review gate
3. **[Quality Tiers](../quality-tiers/)** — the Bronze through Platinum rules and how they are measured
4. **[Private Catalogs](../private-catalogs/)** — per-organization catalogs, the GitHub App, and the gate
5. **[Notifications](../notifications/)** — the inbox, push subscriptions, and what triggers them

---

Need help? See the [Support](../../support/) page or the [GitHub repository](https://github.com/STARTcloud/provisioner-catalog).

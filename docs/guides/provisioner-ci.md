---
title: Provisioner CI/CD
layout: default
nav_order: 3
parent: Guides
permalink: /guides/provisioner-ci/
---

# Provisioner CI/CD — the family contract

{: .no_toc }

For anyone publishing a provisioner package to this catalog: what CI a provisioner repository carries, and why it is shaped that way.

Every `*_provisioner` repository runs one set of nine CI files, byte-identical, copied from the reference and never edited per repository. Anything that must differ between provisioners is decided inside those files from data the repository already carries. The reference is [STARTcloud/startcloud_generic_provisioner](https://github.com/STARTcloud/startcloud_generic_provisioner) — copy its [`.github/`](https://github.com/STARTcloud/startcloud_generic_provisioner/tree/main/.github) as is.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## The nine files

| Path | Role |
| --- | --- |
| `.github/actions/stage-seed/action.yml` | Downloads the pinned core driver and collection release tarballs (sha256-verified) and stages the registry-shaped `<name>/<version>/` tree; builds the seed archive and sidecars |
| `.github/workflows/ci.yml` | Ansible Lint against the staged collections ∥ repository-visibility preflight → CodeQL (public repos only) → `CI OK`, the single required check |
| `.github/workflows/codeql.yml` | Pure `workflow_call` CodeQL matrix (actions, python) |
| `.github/workflows/codeql-schedule.yml` | Weekly cron with its own visibility preflight, calling `codeql.yml` |
| `.github/workflows/release-please.yml` | Push to main: CI → release-please → build → validate, with `secrets: inherit` on the reusable jobs |
| `.github/workflows/build-provisioner.yml` | Checks out the release tag, stages, uploads `<name>-<version>.tar.gz`, `<name>.tar.gz` and both `.sha256` sidecars |
| `.github/workflows/dev-release.yml` | One replaceable prerelease per `bump/*` PR (`v<base>-dev.pr<N>`), deleted when the PR closes |
| `.github/workflows/dependency-bump.yml` | `repository_dispatch` from producers plus a daily reconcile; opens `fix: bump …` PRs, closes superseded ones |
| `.github/workflows/validate.yml` | The catalog's validation action, called after every build and on a daily cron |

## What a repository must hold

| Item | Content | Used by |
| --- | --- | --- |
| `driver.version` | pinned `core_provisioner` tag | stage-seed |
| `collections/<namespace>.<name>.version` | one line `<owner>/<repo> <tag>` per collection | stage-seed, dependency-bump |
| `provisioner.yml` | `name:` and `version:` | archive naming, version lockstep |
| secrets `BOT_APP_ID`, `BOT_PRIVATE_KEY` | the startcloud-bot GitHub App, in the Actions store and the Dependabot store | every token mint |

No repository variables. No per-repository edits to any of the nine files. Collections are never vendored or submoduled: they are fetched from their pinned releases at lint time and at build time, so lint checks the same bytes the release ships.

## Credential

One credential family-wide: the startcloud-bot App. Every mint that reads collections uses `owner: ${{ github.repository_owner }}`; an installation token reads every public repository plus the private repositories of its own org, so a provisioner lives in the same org as any private collection it pins. No personal access tokens.

## The one data-driven difference

CodeQL needs GitHub Advanced Security, which private repositories on this plan do not have. A preflight job reads `gh api repos/${{ github.repository }} --jq .private` (works on every trigger, any token) and the CodeQL job runs only when it is `false`.

## Releases

release-please manages the version from Conventional Commits and stamps `provisioner.yml`; a release triggers the build, and validate runs the moment the assets exist. Tags are bare `vX.Y.Z`.

## Why

**Pinned release tarballs, not Galaxy or submodules.** `ansible-galaxy install` of a git source clones a branch tip, so lint would check bytes that no release ever ships. A submodule pins a commit but vendors the collection into the provisioner's tree and needs a token-bearing checkout to read it. `stage-seed` downloads the exact release asset named in `collections/*.version`, verifies it against the `.sha256` sidecar the collection's release carries, and puts it on `ANSIBLE_COLLECTIONS_PATH`; the build stages the same download into the archive. Lint and release see one set of bytes. Third-party collections are not needed by lint: the linted playbooks use `ansible.builtin` only and `.ansible-lint` excludes the collection tree.

**One GitHub App, no personal access tokens.** A fine-grained PAT belongs to a user, expires, and has to be stored per repository in both the Actions and Dependabot stores. The startcloud-bot App is installed once per organization and every run mints a short-lived installation token from `BOT_APP_ID`/`BOT_PRIVATE_KEY`. Pull requests and pushes made with an App token trigger workflows; those made with `GITHUB_TOKEN` do not (GitHub's recursion guard), which is why release-please and dependency-bump mint the App token to open their PRs.

**`owner: ${{ github.repository_owner }}` on every mint that downloads collections.** Without `owner`, `actions/create-github-app-token` scopes the token to the current repository only; the first switchboard run fetched the public repositories and got "release not found" for the private collection in its own org. Scoping the token to the repository's organization reads that org's private repositories plus every public repository. That is also why a provisioner lives in the same organization as any private collection it pins — an installation token never reads another org's private repository.

**`secrets: inherit` on the reusable-workflow jobs.** A workflow called with `uses:` receives no secrets from the caller unless `secrets: inherit` is set; without it `BOT_APP_ID` and `BOT_PRIVATE_KEY` arrive empty inside `ci.yml` and `build-provisioner.yml` on the push-to-main path.

**A preflight job, not a repository variable.** The design rule is that nothing is configured per repository. CodeQL needs GitHub Advanced Security, which private repositories on this plan lack, so the switch has to be discovered at run time. `github.event.repository` is not present on `schedule` runs, so an expression on the event payload cannot be used; `gh api repos/<repo> --jq .private` answers correctly on every trigger with the workflow's own token. The `security_and_analysis` field that would report Advanced Security directly is returned only to administrator tokens, so visibility is the gate.

**Validate after build, not on `release: published`.** release-please creates the GitHub release, which fires `release: published`, before the build job in the same run has uploaded the tar.gz and sidecars; a validate started by that event downloads nothing and fails. `release-please.yml` calls `validate.yml` with `needs: build-provisioner`, the first moment the assets exist. The daily cron re-checks every published release afterwards.

**Dependency bumps as pull requests, never direct pushes.** A bump PR runs the full CI gate, publishes a testable prerelease through `dev-release.yml`, and merges as a Conventional `fix:` commit so release-please releases it like any other change. A bump whose pin `main` already carries is closed and its branch deleted, on the dispatch path immediately and on the daily reconcile otherwise.

**Bare `vX.Y.Z` tags.** core_provisioner, every collection, and the `dev.prN` prereleases already tag that way; `include-component-in-tag: false` brings provisioner releases to the same grammar. The catalog never reads tags — it matches the `<name>-<version>.tar.gz` asset filename — so the tag form is a naming choice, not a contract.

## Adopting

1. Copy the nine files from the reference repository's `.github/`.
2. Add `driver.version`, `collections/*.version`, and the two App secrets in both stores.
3. Remove any `provisioners/ansible/requirements.yml`.
4. Commit; the push runs the full chain.

---

Next: [Publishing a Provisioner](../publishing-a-provisioner/) for the artifact contract the build satisfies, and [Admission](../admission/) to get listed.

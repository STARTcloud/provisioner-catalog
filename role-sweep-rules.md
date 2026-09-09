# STARTcloud Role Sweep — Execution Rules

You are cleaning up Ansible roles in the `startcloud.startcloud_roles` collection,
one role at a time. The roles live at:
`G:\Projects\startcloud_generic_provisioner\provisioners\ansible_collections\startcloud\startcloud_roles\roles\<role>\`
This is a **git submodule** — make file edits only; do NOT commit (Mark commits).

Work **ONE role at a time**, fully finishing a role before moving to the next.
Never batch-generate. Never work from memory — read the actual files.

**FUNCTIONAL CHANGES ARE FORBIDDEN except in ONE role.** Only the `setup` role
receives a functional edit: its `tasks/debian.yml` + `tasks/redhat.yml` var-dump
task references the deprecated `play_hosts` magic var — replace that pattern with
the same key-extraction the role's `tasks/windows.yml` already uses (build the
var set via `vars.keys() | reject('in', [...]) | map('extract', vars)` so the
deprecated vars are never accessed). EVERY OTHER ROLE: no logic changes at all —
only meta files, progress-strip, and mechanical style drift. Anything else that
looks wrong gets flagged "Needs review," never edited.

---

**OS-dispatcher refactor is DEFERRED (Mark's call, 2026-07-09):** do NOT
restructure `tasks/main.yml` into a thin OS-dispatcher during this sweep — that
is a functional change reserved for a separate second pass. Only RECORD structure
in the tracker's `Dispatcher` column (`Y` already delegates to OS-specific task
files, `N` multi-OS but inlines the work in main.yml, `N/A` single-OS role).

**Roles WITH ISSUES → ASK MARK FIRST (Mark's call, 2026-07-09):** if a role is a
stub, corrupted, abandoned, has broken logic, or references files that don't
exist, STOP and ask Mark how to handle it before repairing. The end goal is the
ENTIRE collection passing `ansible-lint --strict`, so we do want these fixed —
but Mark decides per-role (we may keep, rewrite, or defer). For a CLEAN role,
just do the mechanical sweep and fix obvious lint issues as you go (files under
~500-600 lines: rewrite the whole file to correct/house-style form in one shot).

**JOB-CRITICAL ROLES — EXTRA CARE (Mark's call, 2026-07-09):** these roles are
used in Mark's live production Hosts.yml files. Treat with kid gloves: minimal
changes, ZERO functional risk, no speculative edits, no refactors. When in doubt
on one of these, do LESS and flag rather than change:
`setup, networking, disks, hostname, dependencies, mdns, service_user,
sdkman_install, sdkman_java, sdkman_maven, sdkman_gradle, ssl, nodejs,
web_terminal, haxe, haproxy, lockdown` (plus commented-but-used:
`git_runner, quick_start, vagrant_readme`).

**FILE DELETIONS ARE DEFERRED (Mark's call, 2026-07-09):** do NOT delete orphaned
files during the sweep. Append each orphan to `role-sweep-deletions.md` on the
Desktop. At the END of the sweep, hand Mark copy-paste `rm` commands; he runs them.

**Stub specialization (Mark's call, 2026-07-09 — REVISED):** BEST-EFFORT specialize
every generic-package stub to actually implement its named software, and mark that
best-effort code `Unproven = Y` in the tracker. Specifics:

- `boxvault` installs via the STARTcloud repos, minimal, NO dependencies, not much else.
- For a stub whose name is NOT real installable software (e.g. `ifconfig_me`),
  make it a CLEAN minimal role that installs something innocuous — do not leave a
  broken generic package-dump wearing the wrong name.
- Only leave a role as a pure `Status = Stub` if you genuinely cannot determine a
  sensible implementation. When specializing, delete the old orphaned generic-stub
  assets by QUEUEING them in `role-sweep-deletions.md` (never delete inline).
- Keep implementations to a sensible single-node install (lint-clean, house style);
  don't chase exhaustive clustering/HA. Mark `Unproven = Y`.

## The per-role loop (do EXACTLY these steps, in order)

1. **Enumerate** every file in the role dir (glob `roles/<role>/**`).
2. **Read every readable file IN FULL** — `tasks/*`, `defaults/*`, `vars/*`,
   `handlers/*`, `meta/*`, and `.j2` / text templates. SKIP binaries and images
   (`.jar`, `.crt`, `.key`, `.png`, `.zip`, etc.). If a task references a file
   (`src:`, `template:`, `lookup('file', ...)`, `copy`, `include_*`), CHECK that
   the referenced file actually exists on disk.
3. **Strip the progress machinery** (see "Progress strip" below).
4. **Write/fix the two metadata files** (see "meta/main.yml" and
   "meta/argument_specs.yml" below).
5. **Fix OBVIOUS issues only** (see "Obvious fixes"). Never rewrite logic.
6. **Update the health tracker** row for this role
   (`C:\Users\Mark\Desktop\role-health-tracker.md`).
7. Move to the next role.

**Efficiency:** if a file is small enough to rewrite cleanly in one shot, use
Write (whole file) — it's cheaper than surgical Edits. For large files, Edit the
specific spots.

---

## Progress strip (remove progress; KEEP run_tasks)

`run_tasks` is a SEPARATE, load-bearing mechanism (it lets a role load its vars
without running its tasks). **NEVER remove run_tasks.**

In **`tasks/main.yml`**: DELETE every block whose name starts with
`"Managing progress for"` (there may be TWO in some roles, e.g. a "Step 1" near
the top and a "Step 2 - Final" near the bottom — remove ALL of them). The block
looks like this and must go entirely:

```yaml
- name: 'Managing progress for {{ ansible_role_name }}'
  when: count_progress | default(false)
  run_once: true
  block:
    - name: 'Incrementing global progress step counter for {{ ansible_role_name }}'
      ansible.builtin.set_fact:
        global_current_progress_step: '{{ global_current_progress_step | default(0) | int + 1 }}'
    - name: 'Including progress reporting task for {{ ansible_role_name }}'
      ansible.builtin.include_role:
        name: startcloud.startcloud_roles.progress
      vars:
        _progress_role_is_setup_run: false
        current_progress_step: '{{ global_current_progress_step | default(0) }}'
        progress_description: "{{ progress_role_description | default('Processing ' + ansible_role_name) }}"
```

**KEEP** the block named `"Block to Allow Loading of Variables without running
task"` with `when: run_tasks` — that wraps the real work and stays. After the
strip, `tasks/main.yml` should go from `---` straight into that `when: run_tasks`
block.

In **`defaults/main.yml`**: DELETE the keys `count_progress`, `progress_units`,
`progress_role_description` (and any `progress_role_description_step1/step2`).
**KEEP** `run_tasks`.

---

## meta/main.yml — locked template

Rewrite `meta/main.yml` to this. Fill `role_name`, `description`, `galaxy_tags`,
and trim `platforms` to what the role's tasks ACTUALLY target.

```yaml
galaxy_info:
  role_name: <role>
  author: Mark Gilbert
  description: <one accurate sentence from reading the tasks>
  company: STARTcloud
  issue_tracker_url: https://github.com/STARTcloud/startcloud_roles/issues
  license: Apache-2.0
  min_ansible_version: '2.15'
  platforms:
    - name: Debian
      versions: ['bookworm', 'trixie']
    - name: Ubuntu
      versions: ['jammy', 'noble']
    - name: EL
      versions: ['8', '9']
    # Add ONLY if the role's tasks target them (see platform trimming rule):
    #   - name: FreeBSD    (versions: ['14.0'])   -> if freebsd tasks exist
    #   - name: Solaris    (versions: ['11'])     -> if omnios/illumos tasks exist
    #   - name: Windows    (versions: ['2022'])   -> only if windows.yml/win-* exist
  galaxy_tags:
    - <2-5 lowercase single-word tags describing what the role does>
dependencies: [] # SEE RULE BELOW — PRESERVE the role's existing dependencies verbatim
collections:
  - startcloud.startcloud_roles
```

**Dependencies rule (Mark's call, 2026-07-09):** PRESERVE each role's existing
`dependencies:` list verbatim in the rewritten meta. Do NOT empty it. The `[]`
in the template above is only the placeholder for roles that genuinely have no
deps. Copy the old dependencies block across unchanged.

**allow_duplicates rule:** `allow_duplicates` defaults to `false`. Set it to its
default — i.e. DROP the key entirely from meta (do not carry `allow_duplicates:
true` or `allow_duplicates: false`). Omitting it == default false.

**Platform trimming rule (important — do not claim OSes the role can't do):**

- Always keep `Debian` + `Ubuntu` + `EL` for a normal Linux role.
- Keep `FreeBSD` ONLY if the role has a `freebsd.yml` or FreeBSD-specific tasks.
- If the role has `omnios.yml` / illumos tasks, ADD `- name: Solaris` `versions: ['11']` and flag "Needs review" (illumos platform naming is imperfect).
- **Windows is NOT a priority** — roles are meant to be OS-agnostic. Only keep the `Windows` platform entry if the role clearly has `windows.yml` / `win-*` tasks; otherwise drop it. Don't invest effort chasing Windows accuracy.
- `author` is ALWAYS `Mark Gilbert` (even for third-party-derived roles like docker/nodejs — Mark's call).

---

## meta/argument_specs.yml — CREATE this new file

One `options:` entry per key remaining in `defaults/main.yml` AFTER the progress
strip (so `run_tasks` is included; the removed progress keys are not). Do NOT add
ambient vars the role merely consumes (`settings.*`, `secrets.*`, `service_user`,
generator-injected `provisioner_*`) — only the role's own `defaults` keys.

```yaml
argument_specs:
  main:
    short_description: <short phrase>
    description:
      - <1-3 sentences on what the role does>
    author: Mark Gilbert
    options:
      <key>:
        type: <bool|int|str|list|dict>
        default: <the value from defaults; omit for list/dict if noisy>
        description: <one line: what this var controls, learned from the tasks>
```

Type inference from the default value:

- `true`/`false` → `bool`
- bare integer → `int`
- quoted / plain string → `str`
- `[ ... ]` → `list` (add `elements: dict` if it's a list of dicts)
- `{ ... }` → `dict`

`run_tasks` entry is always:

```yaml
run_tasks:
  type: bool
  default: true
  description: Master gate — when false the role loads its vars but runs no tasks.
```

---

## Obvious fixes (permitted — do them; never rewrite logic)

- Bare module name → FQCN (`systemd` → `ansible.builtin.systemd`, `lineinfile` →
  `ansible.builtin.lineinfile`, `blockinfile` → `ansible.builtin.blockinfile`, etc.).
- Missing `---` at the top of a YAML file → add it.
- Inline `- name:` list items → expanded form (`-` on its own line, then `name:`).
- Task names not in gerund style ("Install X" → "Installing X"), quoted.
- A copy-pasted/wrong `description` in meta (e.g. keepalived carrying haproxy's).

DO NOT: change what any task does, reorder logic, "improve" a working task,
remove functionality, or fix non-obvious problems. If something looks broken or
questionable but isn't an obvious mechanical fix — LEAVE IT and set
**Needs review = YES** in the tracker. We are NOT documenting what needs fixing,
only flagging that it does.

---

## Style canon (the target)

- Gerund, quoted task names: `"Creating Installation Directories"`.
- `-` on its own line above `name:` (expanded list-item form).
- FQCN modules.
- `---` at the top of every YAML file.
- 4-space indentation.

---

## Health tracker (update after each role)

File: `C:\Users\Mark\Desktop\role-health-tracker.md`. One row per role. Mark each
column `YES` / `NO` / `N/A`:

- **Gerund** — task names are gerund-style.
- **Style** — matches the style canon (FQCN, `---`, expanded form, 4-space).
- **run_tasks** — has `run_tasks` default + the `when: run_tasks` wrapper intact.
- **meta/main** — meta/main.yml rewritten to the locked template.
- **argument_specs** — meta/argument_specs.yml created.
- **Progress removed** — progress block(s) + progress defaults gone.
- **Needs review** — YES if anything non-obvious looks wrong (don't say what).
- **ansible-lint** — leave `TODO` until a strict lint pass is run at the end.

---

## End of sweep (only after ALL roles are done)

- Delete the `progress` role directory entirely
  (`roles/progress/`) — nothing includes it anymore once every role is stripped.
- Run `ansible-lint --strict` and record pass/fail per role in the tracker's
  last column.

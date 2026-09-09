# STARTcloud Role Health Tracker

Tracks the sweep of `startcloud.startcloud_roles`. One row per role. Fill each
status cell `Y` (yes) / `N` (no) / `N/A`. Legend for the columns:

- **Status** — completeness: `Complete` (does what its name/description claims),
  `Partial` (some real functionality but clearly missing pieces), `Stub`
  (declared but effectively unimplemented / does something unrelated to its name).
- **Unproven** — `Y` if the role now carries best-effort implementation or heavy
  reconstruction I authored that has NOT been run/tested; `N` otherwise.
- **Gerund** — task names are gerund-style, quoted.
- **Style** — FQCN modules, `---` header, expanded `-`/`name:` form, 4-space indent.
- **run_tasks** — `run_tasks` default + `when: run_tasks` wrapper intact.
- **meta** — `meta/main.yml` rewritten to the locked template.
- **arg_specs** — `meta/argument_specs.yml` created.
- **Prog rm** — progress block(s) + progress defaults removed.
- **Review** — `Y` if something non-obvious looks wrong/buggy (do NOT record what).
- **Boilerplate** — `Y` if the role is MISSING standard boilerplate files
  (LICENSE, README.md); `N` if both present.
  NOTE: `.ansible-lint` (`profile: production`), `.yamllint`, and `.gitignore` are
  now SINGLE root configs at the collection root — no longer per-role files.
- **Dispatcher** — main.yml structure: `Y` already delegates to OS-specific task
  files; `N` multi-OS but inlines the work in main.yml (2nd-pass refactor target);
  `N/A` single-OS role (no OS dispatch needed). Refactor is a SEPARATE later pass.
- **NonIdem** — `Y` if tasks/ contains actions that are NOT idempotent (unguarded
  command/shell/raw with no creates/removes/stat-guard, unconditional
  `state: restarted`, `apt upgrade: dist`/`yum name:"*" state:latest`,
  archive/unarchive without a creates guard, etc.) — i.e. re-running the role
  will re-execute real work every time rather than converging to a no-op. `N/A`
  for the two quarantined stub roles. Read-only audit only; nothing here was
  changed. Recorded so role-based (declarative) dependencies can be evaluated
  against which roles are safe to re-run vs. need explicit ordering/guards first.
- **Lint** — `ansible-lint --strict` result; `TODO` until the end-of-sweep pass.

`·` = pending. Roles below the original 124 (choco_phpnuget through
zfs_unlock_service, marked NEW in the sweep) were found later and swept by
subagents; most were skeleton roles with no `meta/` at all.

| Role                         | Collection       |  Status  | Unproven | Gerund | Style | run_tasks | meta | arg_specs | Prog rm | Review | Boilerplate | Dispatcher | NonIdem | Lint  |
| ---------------------------- | ---------------- | :------: | :------: | :----: | :---: | :-------: | :--: | :-------: | :-----: | :----: | :---------: | :--------: | :-----: | :---: |
| antivirus                    | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| apache                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| asterisk                     | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| authelia                     | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    N    | TODO  |
| bginfo                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| bigbluebutton                | startcloud_roles | Partial  |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| bottles                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| boxvault                     | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| callback                     | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| certbot                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| choco_phpnuget               | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    Y    | TODO  |
| chocolatey                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| chrome                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| cleanup                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| clone_private_git_repo       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    N    | TODO  |
| cockpit                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    Y    | TODO  |
| composer                     | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    N    | TODO  |
| conky                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    N    | TODO  |
| crossover                    | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    Y    | TODO  |
| dante                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| db2                          | startcloud_roles |   Stub   |    N     |   Y    |   N   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |     Y      |   N/A   | DEFER |
| debian_packager              | startcloud_roles | Partial  |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    Y    | TODO  |
| dependencies                 | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| desktop_gnome                | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    Y    | TODO  |
| disks                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| docker                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| drupal                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    N    | TODO  |
| elasticsearch                | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    N    | TODO  |
| example_role                 | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    Y    | TODO  |
| exim                         | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    N    | TODO  |
| fail2ban                     | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| firefox                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   N    |      N      |    N/A     |    N    | TODO  |
| firewall                     | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| flatpak                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| freeipa_client_domain_join   | startcloud_roles | Partial  |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    N    | TODO  |
| frigate                      | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   N    |      N      |    N/A     |    N    | TODO  |
| git_runner                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| go                           | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| grafana                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| graylog                      | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    N    | TODO  |
| greenbone                    | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| guacamole                    | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| guest_additions              | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   N    |      N      |     Y      |    Y    | TODO  |
| haproxy                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    Y    | TODO  |
| haxe                         | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| hello_world                  | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   N    |      N      |    N/A     |    N    | TODO  |
| hostname                     | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    N    | TODO  |
| ifconfig_me                  | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| influxdb                     | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    N    | TODO  |
| ipabackup                    | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    Y    | TODO  |
| ipaclient                    | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    N    | TODO  |
| ipareplica                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    Y    | TODO  |
| ipaserver                    | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    Y    | TODO  |
| ipasmartcard_client          | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| ipasmartcard_server          | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| jenkins                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    Y    | TODO  |
| keepalived                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| kubernetes                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    Y    | TODO  |
| librenms                     | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    Y    | TODO  |
| lockdown                     | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| logstash                     | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    N    | TODO  |
| mariadb                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| mattermost                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| mdns                         | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| mongodb                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| monit                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    Y    | TODO  |
| motd                         | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| mrtg                         | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    N    | TODO  |
| mumble_web                   | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    N    | TODO  |
| mysql                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| networking                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| nextcloud                    | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| nfs                          | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| nfs_client                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| nginx                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| nodejs                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| nojavaipmi                   | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    N    | TODO  |
| ntp                          | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| omnios_autoinstaller         | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| openfortivpn_client          | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    N    | TODO  |
| openvpn_client               | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    N    | TODO  |
| package_repository_server    | startcloud_roles |   Stub   |    N     |   Y    |   N   |     N     |  Y   |     Y     |   N/A   |   Y    |      N      |     N      |   N/A   | DEFER |
| perf_stats                   | startcloud_roles | Partial  |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    N    | TODO  |
| php                          | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| php_versions                 | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| phpmyadmin                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| postgresql                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| power_management             | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| prometheus                   | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     N      |    Y    | TODO  |
| quick_start                  | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    N    |   N    |      N      |    N/A     |    Y    | TODO  |
| quick_start_html5            | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| raritan_mpc                  | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| redis                        | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    N    | TODO  |
| remmina                      | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| remote_access                | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| rpi_lcd                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   N    |      N      |    N/A     |    N    | TODO  |
| rpi_leds                     | startcloud_roles | Partial  |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    N    | TODO  |
| rpi_nfc                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    N    | TODO  |
| rpi_x728_ups                 | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   N    |      N      |    N/A     |    N    | TODO  |
| ruby                         | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| sdkman_gradle                | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| sdkman_install               | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| sdkman_java                  | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| sdkman_maven                 | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| sendmail                     | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    N    | TODO  |
| serial                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| service_user                 | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| session_observer             | startcloud_roles |   Stub   |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    N    | TODO  |
| setup                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    Y    | TODO  |
| sikulix                      | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    N    | TODO  |
| snapd                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    N    | TODO  |
| snmp                         | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| softphone                    | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| squid                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    Y    | TODO  |
| ssl                          | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    Y    | TODO  |
| startcloud_theme             | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    Y    | TODO  |
| supervisord                  | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| support_bundle               | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| swap                         | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| sysmon                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| system_proxy                 | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    N    | TODO  |
| system_stress                | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| telegraf                     | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| tomcat                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    Y    | TODO  |
| uds_actor                    | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| vagrant_box_template_creator | startcloud_roles | Complete |    N     |   Y    |   Y   |    N/A    |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    Y    | TODO  |
| vagrant_readme               | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| vaultwarden                  | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    N    | TODO  |
| virtio                       | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| virtualmin                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    Y    | TODO  |
| vmware_horizon               | startcloud_roles | Partial  |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |     N      |    Y    | TODO  |
| vnc_server                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    N    | TODO  |
| voip_monitor                 | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     N      |    N    | TODO  |
| web_terminal                 | startcloud_roles | Complete |    Y     |   Y    |   Y   |     Y     |  Y   |     Y     |    N    |   N    |      N      |    N/A     |    Y    | TODO  |
| wifi_connect                 | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   N    |      N      |    N/A     |    N    | TODO  |
| windows_explorer             | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    N    | TODO  |
| windows_privacy              | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| windows_ssh                  | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |    N/A     |    Y    | TODO  |
| windows_sysprep              | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| winlogbeat                   | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| winrm                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   N    |      N      |     Y      |    Y    | TODO  |
| xrdp                         | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |    N/A     |    Y    | TODO  |
| zfs                          | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |
| zfs_unlock_service           | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |   N/A   |   Y    |      N      |    N/A     |    N    | TODO  |
| zrepl                        | startcloud_roles | Complete |    N     |   Y    |   Y   |     Y     |  Y   |     Y     |    Y    |   Y    |      N      |     Y      |    N    | TODO  |

**progress** — RETIRED. Not swept; its `tasks/main.yml` is already emptied, and
the whole `roles/progress/` directory is DELETED at the end of the sweep.

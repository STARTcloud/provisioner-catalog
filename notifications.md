# Notifications from the STARTcloud UI estate

Cross-repo notes for whoever works in this repository. An item appears
here when another repository's change needs a step in this one, names
that step and the file that settles it, and leaves when the step lands.
The `bump/startcloud-ui` pull request `dependency-bump.yml` opens on the
next STARTcloud UI release carries the estate changes this repository
waits on. Read every file named in any item in full before acting on it.

## Still owed

| contract                                                | what stands                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | required change                                                                                                                                        | repository and step                                                                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| universal-validation.md, The error body, the `type` row | the registry binds a `type` to 422, 409, 400, 403, 404, 500, 401, 429, 413 and 503 `send-failed` alone; `worker/src/index.js` answers `405` (`method not allowed`), `502` (`store fetch failed`, `pages fetch failed`, `dispatch failed`, `status fetch failed`, `OIDC discovery failed`, `hub token failed`, `hub write failed`) and `503` (`push not configured`, `dispatch not configured`, `hub not configured`) as `{"error":"…"}` because no registry `type` exists for them | the registry gains a `type` for a gateway fault (502), a missing configuration (503) and a wrong method (405), or names the bodies those statuses keep | startcloud-ui adds the types to the contract's registry; this repository then routes the three statuses through `problemResponse` in `worker/src/index.js` |

Estate-wide tracking lives in `../authorization-server-private/priorities.yaml`,
read-only from this repository. The contracts are
`../startcloud-ui/docs/guides/universal-*.md`,
`../startcloud-ui/docs/guides/preferences-and-branding.md` and
`../startcloud-ui/docs/guides/universal-identity.md`; every contract line
cited here is cited against those files.

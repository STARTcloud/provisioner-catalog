# Follow-ups

Estate-level work that starts here but is decided across BoxVault and the
catalog together. Nothing in this file is scheduled; it records intent so it
is not lost.

## Global search scope

The navbar search module searches the page it is on. The contract reserves
a scope row in its filter panel (Search in: This page · Everywhere · a named
app) and the binding fields `scopes`, `activeScope` and `onScopeChange`;
nothing draws it yet.

- **Scope row**: the panel's first row, pills like the filter pills without
  counts, "This page" first and active by default; present only while the
  binding offers a scope beyond the page. Picking a scope hands the query to
  that scope and hides the count and the filter groups, which belong to the
  page scope.
- **Global results**: a dropdown under the input, grouped by app with the
  app's icon (BoxVault boxes, catalog provisioners, hyperweaver and
  zoneweaver machines), each row with a title, a subline and a right-hand
  action (open in a new tab, console, an SSH launcher), arrow keys and
  Enter, Escape back to the page scope.
- **Data**: each app publishes a small `/api/search?q=` over its own data,
  read with the user's token; the IdP's userinfo favorites list says which
  apps to fan out to, so the module needs no registry beyond what the menu
  already knows.
- **Contract**: a "Global scope" section and a checklist row per app that
  exposes a search endpoint; the module file stays byte-identical, the
  scope row and result list are added to it once.

## Merging the catalog into BoxVault

The provisioner catalog is a metadata file that points at GitHub releases;
BoxVault stores and serves artifacts and already covers organizations,
visibility, versions and providers. The catalog's job could one day be a
BoxVault feature (a "provisioners" kind alongside boxes and ISOs, or BoxVault
consuming the catalog feed), which would collapse the two navbars, footers,
modals and theme files into one codebase.

- Keep converging the two frontends until the shared surface is the whole
  shell and only the data plumbing differs; that is the precondition.
- Decide whether BoxVault consumes `catalog.json` as a source or hosts the
  provisioner metadata itself before any code moves.
- Armor belongs in the same picture: as an organization-level artifact
  repository and file share it could be consumed the same way — a source
  BoxVault reads, or a store the merged app serves — so any merge decision
  covers all three.
- The merged surface is the packaged-file estate: templates (boxes),
  artifacts, installers and archives, OS package servers, and the ISOs the
  templates are built from — one place per organization.
- The gap none of the three fills today is image building: a Packer +
  GitHub Actions path that lets a publisher build an image in CI and push
  it to a BoxVault instance the way the catalog's family workflow publishes
  a provisioner release, so publishing a box is a workflow, not an upload.

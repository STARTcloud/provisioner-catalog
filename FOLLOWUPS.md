# Follow-ups

Estate-level work that starts here but is decided across BoxVault and the
catalog together. Nothing in this file is scheduled; it records intent so it
is not lost. Chrome-level work (search scope, breadcrumbs, the shared
folder) is recorded in the universal navbar contract in the auth server,
not here.

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

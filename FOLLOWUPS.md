# Follow-ups

Estate-level work that starts here but is decided across BoxVault and the
catalog together. Nothing in this file is scheduled; it records intent so it
is not lost.

## Navbar search module

Move search out of the page body and into the navbar as a shared module.
Today the catalog has a search box above its cards and BoxVault has one above
each of its box and ISO tables; both are page-specific.

- A search icon in the account cluster, next to the theme button, rendered
  from the same component in both apps. Clicking it, or hovering it for a
  short dwell, expands it into the input.
- The expanded element carries two controls of its own: an × that collapses
  it and clears the query and every active filter, and a gear that opens the
  filter panel.
- The filter panel drops out under the header at full width, hidden until
  the gear is used, holding whatever filters the page offers (the catalog's
  tier and provider chips, BoxVault's watched/provider/architecture chips).
- The module owns only the icon, the input, the panel shell and the
  expanded/open state; each app supplies its filter set and receives the
  query and active filters.
- Recorded in the universal navbar contract once the shape is agreed, with
  the component and its CSS added to the byte-identical shared files.

## Organization drill-down instead of tabs

The catalog's Public / Private tabs are the odd one out: BoxVault shows the
active organization as a breadcrumb-style link in the left nav and drills
into that organization's own list. The catalog should do the same — the
left nav carries the active organization, choosing one in the switcher
drills into that organization's provisioners alone, and the public catalog
is the root the breadcrumb returns to — so the two apps navigate
organizations the same way and the tabs go away.

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

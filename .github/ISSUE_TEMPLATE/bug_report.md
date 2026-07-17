---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: 'bug'
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Affected Component

- [ ] Published catalog.json (wrong/stale/missing data)
- [ ] Data job (generate-catalog-data workflow)
- [ ] Immutability tripwire
- [ ] Validation action (action.yml / validate_repo.py)
- [ ] PR checks
- [ ] Schemas
- [ ] Documentation

## Context

**If the bug involves catalog data:**

- Provisioner family: [e.g., startcloud_generic_provisioner]
- Version(s): [e.g., 0.1.26]
- Source repository: [e.g., STARTcloud/startcloud_generic_provisioner]
- Consumer: [hyperweaver-agent / zoneweaver-agent / direct fetch]

**If the bug involves a workflow or the validation action:**

- Link to the failing run:
- Repository it ran against:

## Steps to Reproduce

1. ...
2. ...
3. ...

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

A clear and concise description of what actually happened. Remember the data
job publishes every ~2 hours — data newer than that is not a bug yet.

## Error Messages

If applicable, add error messages or workflow log excerpts:

```text
Paste error messages here
```

## Impact Assessment

- [ ] Critical (catalog integrity: wrong checksums, tripwire bypass, malicious package)
- [ ] High (catalog unusable or blocking admissions)
- [ ] Medium (functionality impaired)
- [ ] Low (minor issue, workaround available)

## Additional Context

Add any other context about the problem here.

## Resource Understanding

I understand that this project is maintained with limited development resources and that:

- Response times may vary based on current workload and severity
- Catalog-integrity issues receive priority attention
- Detailed bug reports help prioritize and resolve issues more efficiently

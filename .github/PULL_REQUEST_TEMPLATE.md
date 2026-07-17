## Description

Brief description of the changes in this pull request.

## Type of Change

Please delete the section that does not apply.

---

### A) Provisioner admission (adding a repo to sources.yml)

**Checklist — all items are required:**

- [ ] I have read the publishing docs ([README](../blob/main/README.md) + [CONTRIBUTING](../blob/main/CONTRIBUTING.md))
- [ ] The validation action (`uses: STARTcloud/provisioner-catalog@main`) is added to my repository's CI
- [ ] All actions in my repository pass, with no disabled or skipped checks
- [ ] Links to my green validation runs:
  - <!-- paste run URL(s) here -->
- [ ] I created a release AFTER validation passed, and it carries the versioned `<name>-<version>.tar.gz` asset with its `.sha256` sidecar
- [ ] My sources.yml entry is one line, alphabetized, with an owner-attribution comment
- [ ] This PR adds exactly ONE repository and changes nothing else

**Repository being added:**

<!-- owner/name -->

Note: after this PR merges, the repo appears in the published catalog within
**~2 hours** (the next data-job run). No catalog release is needed.

---

### B) Tooling / documentation change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (catalog.json format changes require a format_version bump)
- [ ] Documentation update
- [ ] CI/workflow change

**Testing performed:**

- [ ] `python3 scripts/validate_schemas.py` passes locally
- [ ] Relevant script(s) run locally against real repositories
- [ ] Workflow changes lint clean (actionlint runs in CI)

**Changes made:**

- [ ] Code follows the existing style patterns
- [ ] Self-review completed
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow Conventional Commits (release-please depends on them)

---

## Additional Context

Any additional information that reviewers should know:

## Resource Acknowledgment

I understand that this project is maintained with limited development resources and that:

- Review times may vary based on available resources and current workload
- Admission reviews are a moderation gate — maintainers may ask questions before merging
- Community contributions directly impact the project's development pace

# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in the STARTcloud Provisioner Catalog,
please report it responsibly:

### Preferred Method: Security Advisory

1. Go to the [GitHub Security Advisory page](https://github.com/STARTcloud/provisioner-catalog/security/advisories)
2. Click "Report a vulnerability"
3. Fill out the advisory form with detailed information
4. Submit the advisory

### What to Include

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Potential impact** of the vulnerability
- **Affected component** (data job, validation action, schemas, published catalog.json)
- **Suggested fix** (if you have one)

## Response Process

Due to limited development resources, please understand that:

- **Initial Response**: we aim to acknowledge receipt within 48–72 hours
- **Assessment**: initial assessment within about a week
- **Resolution**: timeline depends on severity, typically 1–4 weeks
- **Disclosure**: coordinated disclosure after a fix is available

### Severity Levels

- **Critical**: immediate attention (e.g. a way to publish mutated artifacts past the tripwire)
- **High**: quick response (validation bypasses, workflow token exposure)
- **Medium**: standard timeline
- **Low**: lower priority

## Focus Areas for a Static Catalog

This repository publishes a static `catalog.json` from other repositories'
GitHub releases. The security-relevant areas are:

- **Catalog integrity** — the immutability tripwire (an already-published
  version's asset must never hash differently) and `.sha256` sidecar
  verification in the data job.
- **Archive safety scanning** — the validation action's checks against path
  traversal, escaping links, and decompression bombs in submitted packages.
- **Workflow and token security** — the data job runs with a read-only
  contents token plus Pages deploy permissions; publisher repositories need
  and receive **zero** secrets from this catalog.
- **Admission review** — listing is moderated by maintainer review, but
  **listing is not an endorsement**: packages execute with real privileges on
  consumers' machines. Report malicious packages immediately — maintainers
  eject them via [removed.yml](removed.yml).

## Best Practices for Consumers

1. **Verify checksums** — agents must verify the recorded sha256 after
   downloading an artifact (both agents do).
2. **Pin versions** — reference immutable versioned artifacts, never mutable
   "latest" aliases.
3. **Review what you install** — a listed package is community content from
   its own repository.

## Acknowledgments

We appreciate the security research community's efforts. Responsible
disclosure helps protect all users.

### Hall of Fame

Contributors who responsibly report security vulnerabilities will be
acknowledged here (with their permission):

- _No vulnerabilities reported yet_

## Updates to This Policy

This security policy may be updated as the project evolves. Check back
periodically for changes.

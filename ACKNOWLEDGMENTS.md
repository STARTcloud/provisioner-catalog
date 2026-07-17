# Acknowledgments

The STARTcloud Provisioner Catalog is built on excellent open-source projects
and proven community models. We're grateful to the people behind them.

## The model

**HACS (Home Assistant Community Store)** — the catalog's architecture is a
direct adaptation of the HACS model: human-reviewed admission PRs against a
default list, a scheduled data-generation job, an author-side validation
action, and a maintainer "removed" blacklist.

- Website: [hacs.xyz](https://hacs.xyz/)
- License: MIT

**Vagrant box catalogs** — the family/versions/artifacts-with-checksums JSON
shape that `catalog.json` speaks descends from the Vagrant box catalog
contract.

- Website: [developer.hashicorp.com/vagrant](https://developer.hashicorp.com/vagrant)

## Tooling

**release-please** — versioning and CHANGELOG automation for this repository

- Repository: [github.com/googleapis/release-please](https://github.com/googleapis/release-please)
- License: Apache-2.0

**actionlint** — workflow linting in CI

- Repository: [github.com/rhysd/actionlint](https://github.com/rhysd/actionlint)
- License: MIT

**PyYAML** — YAML parsing in the catalog scripts

- Website: [pyyaml.org](https://pyyaml.org/)
- License: MIT

**jsonschema (python-jsonschema)** — JSON Schema (draft 2020-12) validation

- Repository: [github.com/python-jsonschema/jsonschema](https://github.com/python-jsonschema/jsonschema)
- License: MIT

**CodeQL** — static analysis of the workflows and Python scripts

- Website: [codeql.github.com](https://codeql.github.com/)

## Platform

- **GitHub Actions, Releases, API, and Pages** — hosting, CI/CD, artifact
  distribution, and the static catalog endpoint
- **GitHub community health files** — the community file set mirrors the
  STARTcloud/hyperweaver conventions

## Standards

- **Semantic Versioning** — [semver.org](https://semver.org/)
- **Conventional Commits** — [conventionalcommits.org](https://www.conventionalcommits.org/)
- **JSON Schema** — [json-schema.org](https://json-schema.org/)
- **Contributor Covenant** — [contributor-covenant.org](https://www.contributor-covenant.org/)

## Disclaimer

This list may not be exhaustive. If you believe a project should be
acknowledged here, please open an issue or a pull request. All trademarks are
the property of their respective owners.

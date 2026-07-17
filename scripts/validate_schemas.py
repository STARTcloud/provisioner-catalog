#!/usr/bin/env python3
"""Validate the hand-edited catalog inputs against their JSON Schemas.

Checks sources.yml and removed.yml (draft 2020-12 schemas under schema/), plus
duplicate detection that schemas cannot express (case-insensitive repo
collisions). Pass --catalog to also validate a generated catalog.json.

Exit code 0 = all valid, 1 = violations found.
"""
from __future__ import annotations

import argparse
import json
import sys

import jsonschema
import yaml


def load_yaml(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def load_json(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def validate(instance, schema_path: str, label: str) -> list[str]:
    schema = load_json(schema_path)
    validator = jsonschema.Draft202012Validator(
        schema, format_checker=jsonschema.FormatChecker()
    )
    problems = []
    for error in sorted(validator.iter_errors(instance), key=lambda e: list(e.absolute_path)):
        path = "/".join(str(p) for p in error.absolute_path) or "<root>"
        problems.append(f"{label}: {path}: {error.message}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", default="sources.yml")
    parser.add_argument("--removed", default="removed.yml")
    parser.add_argument("--sources-schema", default="schema/sources.schema.json")
    parser.add_argument("--removed-schema", default="schema/removed.schema.json")
    parser.add_argument("--catalog", default="", help="optional generated catalog.json to validate")
    parser.add_argument("--catalog-schema", default="schema/catalog.schema.json")
    args = parser.parse_args()

    problems: list[str] = []

    sources = load_yaml(args.sources)
    problems += validate(sources, args.sources_schema, args.sources)

    removed = load_yaml(args.removed)
    problems += validate(removed, args.removed_schema, args.removed)

    if isinstance(sources, dict):
        seen: dict[str, str] = {}
        for entry in sources.get("sources") or []:
            repo = str(entry.get("repo", ""))
            if repo.lower() in seen:
                problems.append(
                    f"{args.sources}: duplicate repo '{repo}' (already listed as "
                    f"'{seen[repo.lower()]}')"
                )
            seen[repo.lower()] = repo

    if args.catalog:
        problems += validate(load_json(args.catalog), args.catalog_schema, args.catalog)

    for problem in problems:
        print(f"ERROR: {problem}")
    if not problems:
        checked = [args.sources, args.removed] + ([args.catalog] if args.catalog else [])
        print(f"Schema validation passed: {', '.join(checked)}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

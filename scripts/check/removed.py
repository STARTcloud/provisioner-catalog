import os

import yaml


def check():
    repo = os.environ["REPOSITORY"].lower()

    with open("removed.yml", "r", encoding="utf-8") as handle:
        removed = yaml.safe_load(handle) or {}
    removed_repositories = {
        entry["repo"].lower() for entry in removed.get("removed") or []
    }

    if repo in removed_repositories:
        exit(f"::error::'{repo}' has been removed from the catalog")

    print("Repository not removed from the catalog")


if __name__ == "__main__":
    check()

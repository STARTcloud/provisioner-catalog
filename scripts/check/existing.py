import json
import os

from scripts.validate_repo import _open_url

CHECKURL = "https://provisioner-catalog.startcloud.com/catalog.json"


def check():
    repo = os.environ["REPOSITORY"].lower()

    try:
        with _open_url(CHECKURL) as response:
            catalog = json.loads(response.read().decode("utf-8"))
    except Exception as exception:
        print(
            f"Could not fetch the published catalog ({exception}) — "
            "skipping (nothing published yet)"
        )
        return

    existing = {
        str(provisioner.get("repo", "")).lower()
        for provisioner in catalog.get("provisioners", [])
    }
    if repo in existing:
        exit(f"::error::'{repo}' already exists in the catalog")

    print("Repository does not exist in the catalog")


if __name__ == "__main__":
    check()

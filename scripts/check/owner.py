import os

from scripts.helpers.event import get_event
from scripts.remove_publishers import REMOVED_PUBLISHERS
from scripts.validate_repo import API_ROOT, gh_api_json

TOKEN = os.getenv("GITHUB_TOKEN")


def check():
    print("Information: the PR author must own the submitted repository")
    repo = os.environ["REPOSITORY"]
    event = get_event()
    actor = event["pull_request"]["user"]["login"]
    repo_owner = repo.split("/")[0].lower()

    for removed in REMOVED_PUBLISHERS:
        if repo_owner == removed["publisher"].lower():
            exit(
                f"::error::'{repo_owner}' is not allowed to publish catalog repositories"
            )

    if repo_owner == actor.lower():
        print(f"'{actor}' is the owner of '{repo}'")
        return

    try:
        data, _ = gh_api_json(f"{API_ROOT}/repos/{repo}/contributors", TOKEN)
    except Exception as exception:
        exit(f"::error::{exception}")

    contributors = [
        {"login": x["login"], "contributions": x["contributions"]}
        for x in data or []
    ]
    _sorted = sorted(contributors, key=lambda x: x["contributions"], reverse=True)

    if not _sorted or actor not in [x["login"] for x in _sorted]:
        exit(f"::error::'{actor}' is not a contributor to '{repo}'")

    _top = _sorted[0]["contributions"]

    if [x["contributions"] for x in _sorted if x["login"] == actor].pop() >= (
        _top / 3
    ):
        print(f"'{actor}' is a major contributor to '{repo}'")
        return

    exit(f"::error::'{actor}' is not a major contributor to '{repo}'")


if __name__ == "__main__":
    check()

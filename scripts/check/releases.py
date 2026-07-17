import os

from scripts.validate_repo import API_ROOT, gh_api_json

TOKEN = os.getenv("GITHUB_TOKEN")


def check():
    repo = os.environ["REPOSITORY"]
    print("Information: the submitted repository must have releases")
    try:
        data, _ = gh_api_json(f"{API_ROOT}/repos/{repo}/releases", TOKEN)
        if isinstance(data, list) and len(data) > 0:
            print(f"'{repo}' has releases")
            return
    except Exception as exception:
        exit(f"::error::{exception}")

    exit(f"::error::'{repo}' has no releases")


if __name__ == "__main__":
    check()

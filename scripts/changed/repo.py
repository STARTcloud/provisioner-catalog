import yaml

DEFAULT = "/tmp/repositories/default"


def load(path):
    with open(path, "r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    return [entry["repo"] for entry in data.get("sources") or []]


def get_repo():
    current = load(f"{DEFAULT}/sources.yml")
    new = load("sources.yml")

    for repo in current:
        if repo in new:
            new.remove(repo)

    if len(new) > 1:
        print(f"Bad data {new}")
        exit(1)

    return new.pop() if new else ""


if __name__ == "__main__":
    print(get_repo())

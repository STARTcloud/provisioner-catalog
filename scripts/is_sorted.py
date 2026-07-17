import yaml

with open("sources.yml", "r", encoding="utf-8") as handle:
    content = [
        entry["repo"] for entry in (yaml.safe_load(handle) or {}).get("sources") or []
    ]

if content != sorted(content, key=str.casefold):
    print("sources.yml is not sorted correctly")
    print("It should look like")
    print(sorted(content, key=str.casefold))
    print("But it is")
    print(content)
    exit(1)

print("sources.yml is sorted")

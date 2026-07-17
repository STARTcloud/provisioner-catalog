from scripts.helpers.event import get_event


def check():
    event = get_event()
    pull_request = event["pull_request"]
    if not pull_request["maintainer_can_modify"]:
        if pull_request["head"]["repo"]["full_name"] != "STARTcloud/provisioner-catalog":
            exit("::error::The PR is not editable by catalog maintainers")


if __name__ == "__main__":
    check()

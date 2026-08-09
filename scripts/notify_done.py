#!/usr/bin/env python3
from __future__ import annotations

import os
import sys

from scripts.notify import send_hub_notification, send_push_dispatch
from scripts.validate_repo import Reporter


def main() -> int:
    requested_by = os.environ.get("REQUESTED_BY", "").strip()
    if not requested_by:
        return 0
    rep = Reporter()
    build_result = os.environ.get("BUILD_RESULT", "unknown")
    deploy_result = os.environ.get("DEPLOY_RESULT", "unknown")
    run_id = os.environ.get("GITHUB_RUN_ID", "0")
    title = f"Catalog rebuild finished: {build_result}"
    body = f"Build {build_result}, deploy {deploy_result}."
    navigate = "https://provisioner-catalog.startcloud.com/"
    send_hub_notification(
        rep,
        {"user_uuid": requested_by},
        title,
        body,
        navigate,
        "catalog-rebuild",
        f"catalog:rebuild:{run_id}",
    )
    send_push_dispatch(
        rep,
        [
            {
                "scope": "user",
                "uuid": requested_by,
                "title": title,
                "body": body,
                "navigate": navigate,
                "tag": "catalog-rebuild",
            }
        ],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

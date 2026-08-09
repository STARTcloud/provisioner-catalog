#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from scripts.validate_repo import USER_AGENT

_token_cache: dict[str, str] = {}


def _post_json(url: str, payload: dict, headers: dict[str, str]) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/json", **headers},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode("utf-8")
        return json.loads(text) if text else {}


def _hub_token(issuer: str, client_id: str, client_secret: str) -> str:
    cached = _token_cache.get(issuer)
    if cached:
        return cached
    discovery_url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
    request = urllib.request.Request(discovery_url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        token_endpoint = json.loads(response.read().decode("utf-8"))["token_endpoint"]
    form = urllib.parse.urlencode(
        {"grant_type": "client_credentials", "scope": "notifications:write"}
    ).encode("utf-8")
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    token_request = urllib.request.Request(
        token_endpoint,
        data=form,
        method="POST",
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {basic}",
        },
    )
    with urllib.request.urlopen(token_request, timeout=60) as response:
        token = json.loads(response.read().decode("utf-8"))["access_token"]
    _token_cache[issuer] = token
    return token


def version_pairs(document: dict | None) -> set[tuple[str, str]]:
    return {
        (str(provisioner.get("name")), str(version.get("version")))
        for provisioner in (document or {}).get("provisioners", [])
        for version in provisioner.get("versions", [])
    }


def send_hub_notification(rep, recipient, title, body, navigate, tag, idempotency_key) -> None:
    issuer = os.environ.get("CATALOG_HUB_ISSUER", "https://dev-auth.startcloud.com")
    client_id = os.environ.get("CATALOG_HUB_CLIENT_ID", "")
    client_secret = os.environ.get("CATALOG_HUB_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        rep.info(f"hub notification skipped (no credentials): {idempotency_key}")
        return
    try:
        token = _hub_token(issuer, client_id, client_secret)
        _post_json(
            f"{issuer.rstrip('/')}/api/notify",
            {
                "recipient": recipient,
                "notification": {
                    "title": title[:255],
                    "body": body[:1000],
                    "navigate": navigate,
                    "tag": tag,
                },
                "type": "SYSTEM",
                "severity": "INFO",
                "delivery": {"ttl": 86400, "urgency": "normal"},
                "idempotencyKey": idempotency_key[:128],
            },
            {"Authorization": f"Bearer {token}"},
        )
        rep.info(f"hub notification sent: {idempotency_key}")
    except (urllib.error.URLError, OSError, ValueError, KeyError) as exc:
        rep.warning(f"hub notification failed ({exc}): {idempotency_key}")


def send_push_dispatch(rep, events: list[dict]) -> None:
    if not events:
        return
    url = os.environ.get(
        "CATALOG_PUSH_DISPATCH_URL", "https://provisioner-catalog.startcloud.com/push/dispatch"
    )
    key = os.environ.get("CATALOG_PUSH_DISPATCH_KEY", "")
    if not key:
        rep.info(f"push dispatch skipped (no key): {len(events)} event(s)")
        return
    try:
        result = _post_json(url, {"events": events}, {"X-Dispatch-Key": key})
        rep.info(f"push dispatch: {len(events)} event(s), delivered={result.get('delivered')}")
    except (urllib.error.URLError, OSError, ValueError) as exc:
        rep.warning(f"push dispatch failed ({exc})")

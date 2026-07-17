"""Remote CouchDB helpers for Firebase preview smoke runs."""

from __future__ import annotations

import base64
import json
import re
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from scripts.e2e_helpers import compute_storage_room_code

COUCHDB_URL_RE = re.compile(r"COUCHDB_URL\s*=\s*(?:'([^']*)'|null)")


def extract_couchdb_url(config_text: str) -> str | None:
    match = COUCHDB_URL_RE.search(config_text or "")
    if not match:
        raise ValueError("COUCHDB_URL not found in config.js")
    return match.group(1) or None


def build_couchdb_request_parts(couchdb_url: str) -> tuple[str, dict[str, str]]:
    parsed = urlsplit(couchdb_url)
    if not parsed.scheme or not parsed.hostname or parsed.username is None:
        raise ValueError("Invalid CouchDB URL")

    credentials = f"{parsed.username}:{parsed.password or ''}"
    token = base64.b64encode(credentials.encode("ascii")).decode("ascii")
    netloc = parsed.hostname
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"

    base_url = urlunsplit((parsed.scheme, netloc, "", "", ""))
    return base_url, {"Authorization": f"Basic {token}"}


def build_remote_db_name(hostname: str, room_code: str) -> str:
    return f"fortudo-{compute_storage_room_code(hostname, room_code)}"


def fetch_preview_couchdb_url(preview_url: str) -> str | None:
    config_url = urljoin(preview_url, "/js/config.js")
    with urlopen(config_url) as response:
        config_text = response.read().decode("utf-8")
    return extract_couchdb_url(config_text)


def delete_remote_database(couchdb_url: str, db_name: str) -> None:
    base_url, headers = build_couchdb_request_parts(couchdb_url)
    request = Request(f"{base_url}/{db_name}", headers=headers, method="DELETE")
    try:
        with urlopen(request):
            return
    except HTTPError as error:
        if error.code == 404:
            return
        raise


def fetch_remote_docs(
    couchdb_url: str, db_name: str, *, include_conflicts: bool = False
) -> list[dict[str, Any]]:
    base_url, headers = build_couchdb_request_parts(couchdb_url)
    query = "include_docs=true"
    if include_conflicts:
        query += "&conflicts=true"
    request = Request(
        f"{base_url}/{db_name}/_all_docs?{query}",
        headers=headers,
        method="GET",
    )
    with urlopen(request) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return [row["doc"] for row in payload.get("rows", []) if row.get("doc")]


def reset_remote_preview_rooms(preview_url: str, hostname: str, rooms: dict[str, str]) -> None:
    couchdb_url = fetch_preview_couchdb_url(preview_url)
    if not couchdb_url:
        return

    for room_code in rooms.values():
        delete_remote_database(couchdb_url, build_remote_db_name(hostname, room_code))

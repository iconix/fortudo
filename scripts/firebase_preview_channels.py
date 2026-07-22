"""Select obsolete Firebase preview channels through fail-closed rules."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LEGACY_SHA_SUFFIX = re.compile(r"^[0-9a-f]{7}$")
PR_PREVIEW_CHANNEL = re.compile(r"^pr[1-9][0-9]*-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
RFC3339_TIMESTAMP = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})T(?P<time>\d{2}:\d{2}:\d{2})"
    r"(?:\.(?P<fraction>\d{1,9}))?(?P<zone>Z|[+-]\d{2}:\d{2})$"
)
UNIX_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def load_channel_payload(path: Path) -> dict[str, Any]:
    """Load one Firebase CLI JSON response."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Firebase channel payload must be an object.")
    return payload


def _channel_collection(payload: dict[str, Any]) -> list[Any]:
    result = payload.get("result")
    channels = result.get("channels") if isinstance(result, dict) else None
    if channels is None:
        channels = payload.get("channels")
    if not isinstance(channels, list):
        raise ValueError("Firebase channel payload must contain a channels list.")
    return channels


def _channel_id(channel: dict[str, Any]) -> str:
    return str(channel.get("name") or "").rsplit("/", 1)[-1]


def _timestamp(value: Any, *, field: str) -> tuple[int, int]:
    if not isinstance(value, str) or not value:
        raise ValueError(f"Firebase {field} must be a nonempty timestamp.")
    match = RFC3339_TIMESTAMP.fullmatch(value)
    if not match:
        raise ValueError(f"Firebase {field} is not an ISO-8601 timestamp.")
    try:
        zone = "+00:00" if match.group("zone") == "Z" else match.group("zone")
        parsed = datetime.fromisoformat(
            f"{match.group('date')}T{match.group('time')}{zone}"
        ).astimezone(timezone.utc)
    except ValueError as error:
        raise ValueError(f"Firebase {field} is not an ISO-8601 timestamp.") from error
    delta = parsed - UNIX_EPOCH
    epoch_seconds = delta.days * 86400 + delta.seconds
    fraction = match.group("fraction") or ""
    nanoseconds = int(fraction.ljust(9, "0")) if fraction else 0
    return epoch_seconds, nanoseconds


def find_legacy_channel_ids(payload: dict[str, Any], prefix: str) -> list[str]:
    """Return exact-prefix channels whose only suffix is a legacy seven-digit SHA."""
    if not prefix:
        raise ValueError("Legacy channel prefix must not be empty.")

    selected = []
    included = set()
    for channel in _channel_collection(payload):
        if not isinstance(channel, dict):
            continue
        channel_id = _channel_id(channel)
        if not channel_id.startswith(prefix):
            continue
        suffix = channel_id[len(prefix) :]
        if not LEGACY_SHA_SUFFIX.fullmatch(suffix) or channel_id in included:
            continue
        included.add(channel_id)
        selected.append(channel_id)
    return selected


def find_expired_preview_channel_ids(
    payload: dict[str, Any], *, protected_channel_id: str, expired_at_or_before: str
) -> list[str]:
    """Return expired PR preview channels, excluding the channel being deployed."""
    if not PR_PREVIEW_CHANNEL.fullmatch(protected_channel_id):
        raise ValueError("Protected Firebase preview channel ID is invalid.")
    cutoff = _timestamp(expired_at_or_before, field="cleanup cutoff")

    selected = []
    included = set()
    for channel in _channel_collection(payload):
        if not isinstance(channel, dict):
            continue
        channel_id = _channel_id(channel)
        if (
            channel_id == protected_channel_id
            or not PR_PREVIEW_CHANNEL.fullmatch(channel_id)
            or channel_id in included
        ):
            continue
        expire_time = channel.get("expireTime")
        if expire_time is None:
            continue
        expires = _timestamp(expire_time, field="preview channel expiry")
        if expires <= cutoff:
            included.add(channel_id)
            selected.append(channel_id)
    return selected


def find_cleanup_channel_ids(
    payload: dict[str, Any],
    *,
    legacy_prefix: str,
    protected_channel_id: str,
    expired_at_or_before: str,
) -> list[str]:
    """Return the stable union of legacy-current-PR and expired PR channels."""
    selected = find_legacy_channel_ids(payload, legacy_prefix)
    included = set(selected)
    for channel_id in find_expired_preview_channel_ids(
        payload,
        protected_channel_id=protected_channel_id,
        expired_at_or_before=expired_at_or_before,
    ):
        if channel_id not in included:
            included.add(channel_id)
            selected.append(channel_id)
    return selected


def main(argv: list[str]) -> int:
    if len(argv) != 5:
        print(
            "usage: firebase_preview_channels.py <channels.json> <legacy-prefix> "
            "<protected-channel> <expired-at-or-before>",
            file=sys.stderr,
        )
        return 2

    try:
        payload = load_channel_payload(Path(argv[1]))
        channel_ids = find_cleanup_channel_ids(
            payload,
            legacy_prefix=argv[2],
            protected_channel_id=argv[3],
            expired_at_or_before=argv[4],
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Unable to select safe Firebase preview cleanup candidates: {error}", file=sys.stderr)
        return 1

    for channel_id in channel_ids:
        print(channel_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

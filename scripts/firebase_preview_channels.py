"""Select legacy SHA-scoped Firebase preview channels for one stable PR prefix."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

LEGACY_SHA_SUFFIX = re.compile(r"^[0-9a-f]{7}$")


def load_channel_payload(path: Path) -> dict[str, Any]:
    """Load one Firebase CLI JSON response."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Firebase channel payload must be an object.")
    return payload


def find_legacy_channel_ids(payload: dict[str, Any], prefix: str) -> list[str]:
    """Return exact-prefix channels whose only suffix is a legacy seven-digit SHA."""
    if not prefix:
        raise ValueError("Legacy channel prefix must not be empty.")

    result = payload.get("result")
    channels = result.get("channels") if isinstance(result, dict) else None
    if channels is None:
        channels = payload.get("channels")
    if not isinstance(channels, list):
        raise ValueError("Firebase channel payload must contain a channels list.")

    selected = []
    included = set()
    for channel in channels:
        if not isinstance(channel, dict):
            continue
        channel_id = str(channel.get("name") or "").rsplit("/", 1)[-1]
        if not channel_id.startswith(prefix):
            continue
        suffix = channel_id[len(prefix) :]
        if not LEGACY_SHA_SUFFIX.fullmatch(suffix) or channel_id in included:
            continue
        included.add(channel_id)
        selected.append(channel_id)
    return selected


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: firebase_preview_channels.py <channels.json> <legacy-prefix>", file=sys.stderr)
        return 2

    try:
        payload = load_channel_payload(Path(argv[1]))
        channel_ids = find_legacy_channel_ids(payload, argv[2])
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Unable to select legacy Firebase preview channels: {error}", file=sys.stderr)
        return 1

    for channel_id in channel_ids:
        print(channel_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

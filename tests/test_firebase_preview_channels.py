import json

import pytest

from scripts.firebase_preview_channels import find_legacy_channel_ids, load_channel_payload
from scripts.firebase_preview_channels import (
    find_cleanup_channel_ids,
    find_expired_preview_channel_ids,
)


def channel(channel_id: str, *, expire_time: str | None = None) -> dict[str, str]:
    result = {"name": f"projects/fortudo/sites/fortudo/channels/{channel_id}"}
    if expire_time is not None:
        result["expireTime"] = expire_time
    return result


def test_finds_only_legacy_sha_channels_for_the_exact_stable_prefix():
    prefix = "pr96-feat-unscheduled-man-"
    payload = {
        "status": "success",
        "result": {
            "channels": [
                channel("pr96-feat-unscheduled-man-450bb17"),
                channel("pr96-feat-unscheduled-man-b21cc52"),
                channel("pr96-feat-unscheduled-man"),
                channel("pr96-feat-unscheduled-man-too-long"),
                channel("pr96-feat-unscheduled-man-ABC1234"),
                channel("pr95-feat-unscheduled-man-450bb17"),
                channel("live"),
            ]
        },
    }

    assert find_legacy_channel_ids(payload, prefix) == [
        "pr96-feat-unscheduled-man-450bb17",
        "pr96-feat-unscheduled-man-b21cc52",
    ]


def test_accepts_the_cli_result_or_direct_channel_payload_shape():
    legacy = channel("pr96-feature-123abcd")

    assert find_legacy_channel_ids({"result": {"channels": [legacy]}}, "pr96-feature-") == [
        "pr96-feature-123abcd"
    ]
    assert find_legacy_channel_ids({"channels": [legacy]}, "pr96-feature-") == [
        "pr96-feature-123abcd"
    ]


def test_rejects_missing_or_malformed_channel_collections():
    with pytest.raises(ValueError, match="channels"):
        find_legacy_channel_ids({}, "pr96-feature-")
    with pytest.raises(ValueError, match="channels"):
        find_legacy_channel_ids({"result": {"channels": "not-a-list"}}, "pr96-feature-")


def test_load_channel_payload_rejects_invalid_json(tmp_path):
    payload_file = tmp_path / "channels.json"
    payload_file.write_text("not json", encoding="utf-8")

    with pytest.raises(json.JSONDecodeError):
        load_channel_payload(payload_file)


def test_finds_only_expired_pr_previews_and_protects_current_channel():
    current = "pr106-codex-temporary-unen"
    payload = {
        "channels": [
            channel("pr100-old", expire_time="2026-07-21T23:59:59Z"),
            channel("pr101-expiring-now", expire_time="2026-07-22T00:00:00+00:00"),
            channel("pr102-future", expire_time="2026-07-22T00:00:01Z"),
            channel(current, expire_time="2026-07-21T00:00:00Z"),
            channel("pr103-missing-expiry"),
            channel("manual-preview", expire_time="2026-07-21T00:00:00Z"),
            channel("live", expire_time="2026-07-21T00:00:00Z"),
        ]
    }

    assert find_expired_preview_channel_ids(
        payload,
        protected_channel_id=current,
        expired_at_or_before="2026-07-22T00:00:00Z",
    ) == ["pr100-old", "pr101-expiring-now"]


def test_expiry_comparison_preserves_nanoseconds_and_timezone_offsets():
    current = "pr106-codex-temporary-unen"
    payload = {
        "channels": [
            channel("pr100-exact-z", expire_time="2026-07-22T00:00:00.000000000Z"),
            channel("pr101-plus-one-z", expire_time="2026-07-22T00:00:00.000000001Z"),
            channel("pr102-exact-offset", expire_time="2026-07-21T20:00:00-04:00"),
            channel(
                "pr103-plus-one-offset",
                expire_time="2026-07-21T20:00:00.000000001-04:00",
            ),
        ]
    }

    assert find_expired_preview_channel_ids(
        payload,
        protected_channel_id=current,
        expired_at_or_before="2026-07-22T00:00:00Z",
    ) == ["pr100-exact-z", "pr102-exact-offset"]


@pytest.mark.parametrize(
    ("protected_channel", "cutoff", "expiry"),
    [
        ("not-a-pr-channel", "2026-07-22T00:00:00Z", "2026-07-21T00:00:00Z"),
        ("pr106-safe", "not-a-time", "2026-07-21T00:00:00Z"),
        ("pr106-safe", "2026-07-22T00:00:00", "2026-07-21T00:00:00Z"),
        ("pr106-safe", "2026-07-22T00:00:00Z", "not-a-time"),
        ("pr106-safe", "2026-07-22T00:00:00Z", "2026-07-21T00:00:00"),
    ],
)
def test_expired_cleanup_fails_closed_for_invalid_ids_or_timestamps(
    protected_channel, cutoff, expiry
):
    payload = {"channels": [channel("pr100-old", expire_time=expiry)]}

    with pytest.raises(ValueError):
        find_expired_preview_channel_ids(
            payload,
            protected_channel_id=protected_channel,
            expired_at_or_before=cutoff,
        )


def test_cleanup_union_is_stable_and_deduplicated():
    current = "pr106-safe"
    legacy = "pr106-safe-123abcd"
    payload = {
        "channels": [
            channel(legacy, expire_time="2026-07-21T00:00:00Z"),
            channel("pr100-old", expire_time="2026-07-21T00:00:00Z"),
        ]
    }

    assert find_cleanup_channel_ids(
        payload,
        legacy_prefix=f"{current}-",
        protected_channel_id=current,
        expired_at_or_before="2026-07-22T00:00:00Z",
    ) == [legacy, "pr100-old"]

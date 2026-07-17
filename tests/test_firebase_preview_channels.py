import json

import pytest

from scripts.firebase_preview_channels import find_legacy_channel_ids, load_channel_payload


def channel(channel_id: str) -> dict[str, str]:
    return {"name": f"projects/fortudo/sites/fortudo/channels/{channel_id}"}


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

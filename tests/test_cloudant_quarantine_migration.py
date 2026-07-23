"""Safety properties for the minimal Cloudant-native quarantine migration."""

from __future__ import annotations

import copy
import io
import subprocess
import sys
import urllib.error
from pathlib import Path

import pytest

from scripts import cloudant_quarantine_migration as quarantine
from scripts import migrate_taxonomy_identity as migration
from scripts.document_contract_ops import CONTRACT_DESIGN_ID, load_design_document


SOURCE = "fortudo-dat-411"
QUARANTINE = "fortudo-quarantine-0123456789abcdef01234567"


def state(*leaves: tuple[str, str, bool], winners: dict[str, str] | None = None):
    rows = [
        {"id": document_id, "rev": revision, "deleted": deleted}
        for document_id, revision, deleted in leaves
    ]
    if winners is None:
        winners = {}
        for row in rows:
            winners.setdefault(row["id"], row["rev"])
    return quarantine.build_state_model(rows, winners)


def test_state_model_is_order_independent_and_covers_deleted_and_conflicting_leaves() -> None:
    leaves = [
        {"id": "task-b", "rev": "2-winner", "deleted": False},
        {"id": "task-a", "rev": "3-deleted", "deleted": True},
        {"id": "task-b", "rev": "1-loser", "deleted": False},
        {"id": "_design/example", "rev": "1-design", "deleted": False},
        {"id": "_local/checkpoint", "rev": "0-local", "deleted": False},
    ]
    winners = {
        "task-a": "3-deleted",
        "task-b": "2-winner",
        "_design/example": "1-design",
    }

    first = quarantine.build_state_model(leaves, winners)
    second = quarantine.build_state_model(
        list(reversed(leaves)), dict(reversed(list(winners.items())))
    )

    assert first.fingerprint == second.fingerprint
    assert first.leaves == second.leaves
    assert first.winners == second.winners
    assert first.counts == {
        "documents": 3,
        "liveLeaves": 3,
        "deletedLeaves": 1,
        "conflictLeaves": 1,
    }
    assert all(not leaf.document_id.startswith("_local/") for leaf in first.leaves)


@pytest.mark.parametrize(
    ("leaves", "winners", "message"),
    [
        ([{"id": "task-a", "rev": "1-a", "deleted": False}] * 2, {"task-a": "1-a"}, "duplicate"),
        ([{"id": "task-a", "rev": "1-a", "deleted": False}], {}, "winner"),
        (
            [{"id": "task-a", "rev": "1-a", "deleted": False}],
            {"task-a": "2-missing"},
            "winner",
        ),
    ],
)
def test_state_model_rejects_inconsistent_enumeration(leaves, winners, message) -> None:
    with pytest.raises(quarantine.QuarantineSafetyError, match=message):
        quarantine.build_state_model(leaves, winners)


def test_replication_document_is_one_shot_unfiltered_and_uses_structured_auth() -> None:
    document = quarantine.build_replication_document(
        SOURCE,
        QUARANTINE,
        endpoint="https://account.example.invalid",
        username="private-user",
        password="private-password",
    )

    assert document == {
        "source": {
            "url": f"https://account.example.invalid/{SOURCE}",
            "auth": {"basic": {"username": "private-user", "password": "private-password"}},
        },
        "target": {
            "url": f"https://account.example.invalid/{QUARANTINE}",
            "auth": {"basic": {"username": "private-user", "password": "private-password"}},
        },
    }
    for forbidden in (
        "create_target",
        "continuous",
        "doc_ids",
        "filter",
        "selector",
        "winning_revs_only",
    ):
        assert forbidden not in document


def test_random_source_is_allowed_only_through_the_disposable_preview_gate() -> None:
    preview_source = "fortudo-preview-quarantine-gate-0123456789abcdef01234567-source"
    preview_quarantine = "fortudo-preview-quarantine-gate-0123456789abcdef01234567-quarantine"
    with pytest.raises(quarantine.QuarantineSafetyError, match="approved source"):
        quarantine.build_replication_document(
            preview_source,
            QUARANTINE,
            endpoint="https://account.example.invalid",
            username="user",
            password="password",
        )

    document = quarantine.build_replication_document(
        preview_source,
        preview_quarantine,
        endpoint="https://account.example.invalid",
        username="user",
        password="password",
        allow_disposable_preview=True,
    )

    assert document["source"]["url"].endswith(f"/{preview_source}")
    assert document["target"]["url"].endswith(f"/{preview_quarantine}")


class CaptureCloudant:
    def __init__(
        self,
        *,
        timer=None,
        source_states=None,
        quarantine_state=None,
        post_replication_quarantine_state=None,
        security=None,
        database_exists=False,
        fail_replication=False,
    ):
        self.timer = timer
        self.source_states = list(source_states or [])
        self.quarantine_state = quarantine_state
        self.post_replication_quarantine_state = post_replication_quarantine_state
        self.security = security or {"cloudant": {"accepted-user": ["_reader"]}}
        self._database_exists = database_exists
        self.fail_replication = fail_replication
        self.calls: list[tuple] = []

    def get_document(self, database, document_id):
        self.calls.append(("get-document", database, document_id))
        return copy.deepcopy(self.timer)

    def get_state_model(self, database):
        self.calls.append(("state", database))
        if database == SOURCE:
            return self.source_states.pop(0)
        return self.quarantine_state

    def get_security_hash(self, database):
        self.calls.append(("security", database))
        return quarantine.canonical_hash(self.security)

    def database_exists(self, database):
        self.calls.append(("exists", database))
        return self._database_exists

    def create_database(self, database, *, partitioned, allow_disposable_preview=False):
        assert allow_disposable_preview is False
        self.calls.append(("create-database", database, partitioned))

    def replicate_once(self, source, target, *, allow_disposable_preview=False):
        assert allow_disposable_preview is False
        self.calls.append(("replicate-once", source, target))
        if self.fail_replication:
            raise quarantine.QuarantineSafetyError("uncertain transient replication")
        if self.post_replication_quarantine_state is not None:
            self.quarantine_state = self.post_replication_quarantine_state
        return {"ok": True, "history": [{"doc_write_failures": 0}]}


def test_running_timer_blocks_before_any_remote_mutation() -> None:
    client = CaptureCloudant(timer={"_id": "config-running-activity"})

    with pytest.raises(quarantine.QuarantineSafetyError, match="running timer"):
        quarantine.capture_quarantine(client, SOURCE, QUARANTINE)

    assert client.calls == [("get-document", SOURCE, "config-running-activity")]


def test_capture_creates_one_exact_database_and_uses_transient_replication() -> None:
    captured = state(
        ("_design/existing", "1-design", False),
        ("task-a", "2-live", False),
        ("activity-a", "3-winner", False),
        ("activity-a", "2-loser", False),
        ("task-deleted", "2-deleted", True),
        winners={
            "_design/existing": "1-design",
            "task-a": "2-live",
            "activity-a": "3-winner",
            "task-deleted": "2-deleted",
        },
    )
    client = CaptureCloudant(source_states=[captured, captured], quarantine_state=captured)

    receipt = quarantine.capture_quarantine(client, SOURCE, QUARANTINE)

    assert receipt.source_database == SOURCE
    assert receipt.quarantine_database == QUARANTINE
    assert receipt.state == captured
    assert receipt.security_hash == quarantine.canonical_hash(client.security)
    assert ("create-database", QUARANTINE, False) in client.calls
    assert ("replicate-once", SOURCE, QUARANTINE) in client.calls
    assert all("job" not in call[0] for call in client.calls)


def test_capture_halts_on_source_drift_without_a_persistent_job() -> None:
    before = state(("task-a", "1-a", False))
    after = state(("task-a", "2-a", False))
    client = CaptureCloudant(source_states=[before, after], quarantine_state=before)

    with pytest.raises(quarantine.QuarantineSafetyError, match="source state drifted"):
        quarantine.capture_quarantine(client, SOURCE, QUARANTINE)

    assert ("replicate-once", SOURCE, QUARANTINE) in client.calls
    assert not any(call[0] == "delete-database" for call in client.calls)


def test_uncertain_transient_replication_is_safe_to_resume() -> None:
    source_state = state(("task-a", "1-a", False))
    client = CaptureCloudant(
        source_states=[source_state],
        quarantine_state=source_state,
        fail_replication=True,
    )

    with pytest.raises(quarantine.QuarantineSafetyError, match="uncertain"):
        quarantine.capture_quarantine(client, SOURCE, QUARANTINE)

    client.fail_replication = False
    client._database_exists = True
    client.source_states = [source_state, source_state]
    receipt = quarantine.capture_quarantine(client, SOURCE, QUARANTINE, resume_existing=True)
    assert receipt.state == source_state


def test_interrupted_capture_reruns_after_an_existing_source_document_was_edited() -> None:
    source_state = state(("task-a", "2-edited", False), ("task-b", "1-b", False))
    stale_quarantine = state(("task-a", "1-original", False))
    client = CaptureCloudant(
        source_states=[source_state, source_state],
        quarantine_state=stale_quarantine,
        post_replication_quarantine_state=source_state,
        database_exists=True,
    )

    receipt = quarantine.capture_quarantine(client, SOURCE, QUARANTINE, resume_existing=True)

    assert receipt.state == source_state
    assert not any(call[0] == "create-database" for call in client.calls)
    assert ("replicate-once", SOURCE, QUARANTINE) in client.calls

    unrelated = state(("task-other", "1-other", False))
    blocked = CaptureCloudant(
        source_states=[source_state, source_state],
        quarantine_state=unrelated,
        database_exists=True,
    )
    with pytest.raises(quarantine.QuarantineSafetyError, match="differs from the source"):
        quarantine.capture_quarantine(blocked, SOURCE, QUARANTINE, resume_existing=True)
    assert ("replicate-once", SOURCE, QUARANTINE) in blocked.calls


class FenceCloudant:
    def __init__(self, before, after=None, *, security_hash="security", existing=None):
        self.states = [before, after or before]
        self.security_hash = security_hash
        self.existing = copy.deepcopy(existing)
        self.calls: list[tuple] = []

    def get_document(self, database, document_id):
        self.calls.append(("get-document", database, document_id))
        if document_id == "config-running-activity":
            return None
        return copy.deepcopy(self.existing)

    def get_state_model(self, database):
        self.calls.append(("state", database))
        return self.states.pop(0)

    def get_security_hash(self, database):
        self.calls.append(("security", database))
        return self.security_hash

    def put_document(self, database, document, *, create_only=False):
        self.calls.append(("put-document", database, copy.deepcopy(document), create_only))
        return {"id": CONTRACT_DESIGN_ID, "rev": "1-validator"}


def test_fence_installation_is_create_only_and_allows_exactly_the_validator_leaf() -> None:
    before = state(("task-a", "1-a", False))
    after = state(
        ("task-a", "1-a", False),
        (CONTRACT_DESIGN_ID, "1-validator", False),
        winners={"task-a": "1-a", CONTRACT_DESIGN_ID: "1-validator"},
    )
    capture = quarantine.CaptureReceipt(SOURCE, QUARANTINE, before, "security")
    client = FenceCloudant(before, after)

    receipt = quarantine.install_fence(client, capture)

    assert receipt.validator_revision == "1-validator"
    assert receipt.fenced_state == after
    put = next(call for call in client.calls if call[0] == "put-document")
    assert put[1] == SOURCE
    assert put[2] == load_design_document()
    assert put[3] is True


@pytest.mark.parametrize("kind", ["leaf", "security"])
def test_fence_drift_blocks_before_validator_write(kind) -> None:
    captured = state(("task-a", "1-a", False))
    current = state(("task-a", "2-a", False)) if kind == "leaf" else captured
    security = "changed" if kind == "security" else "security"
    capture = quarantine.CaptureReceipt(SOURCE, QUARANTINE, captured, "security")
    client = FenceCloudant(current, security_hash=security)

    with pytest.raises(quarantine.QuarantineSafetyError, match="drift"):
        quarantine.install_fence(client, capture)

    assert not any(call[0] == "put-document" for call in client.calls)


def test_fence_blocks_a_deleted_validator_revision_tree_before_create_attempt() -> None:
    captured = state((CONTRACT_DESIGN_ID, "2-deleted", True))
    capture = quarantine.CaptureReceipt(SOURCE, QUARANTINE, captured, "security")
    client = FenceCloudant(captured)

    with pytest.raises(quarantine.QuarantineSafetyError, match="revision tree"):
        quarantine.install_fence(client, capture)

    assert not any(call[0] == "put-document" for call in client.calls)


def test_fence_resume_requires_the_explicit_exact_existing_revision_and_state() -> None:
    before = state(("task-a", "1-a", False))
    after = state(
        ("task-a", "1-a", False),
        (CONTRACT_DESIGN_ID, "1-validator", False),
        winners={"task-a": "1-a", CONTRACT_DESIGN_ID: "1-validator"},
    )
    existing = {**load_design_document(), "_rev": "1-validator"}
    capture = quarantine.CaptureReceipt(SOURCE, QUARANTINE, before, "security")

    with pytest.raises(quarantine.QuarantineSafetyError, match="explicit expected revision"):
        quarantine.install_fence(FenceCloudant(after, existing=existing), capture)

    client = FenceCloudant(after, existing=existing)
    receipt = quarantine.install_fence(
        client, capture, expected_existing_validator_revision="1-validator"
    )

    assert receipt.validator_revision == "1-validator"
    assert receipt.fenced_state == after
    assert not any(call[0] == "put-document" for call in client.calls)


def test_operational_client_enumerates_exact_leaf_bodies_without_storing_update_seq(
    monkeypatch,
) -> None:
    client = quarantine.OperationalCloudantClient(
        "https://private-user:private-password@account.example.invalid"
    )
    calls: list[tuple] = []

    def request(method, operation, path, **kwargs):
        calls.append((method, operation, path, kwargs))
        if operation == "database metadata read":
            return {"db_name": SOURCE, "update_seq": "opaque-update-sequence"}
        if operation == "leaf enumeration":
            return {
                "results": [
                    {"id": "activity-a", "changes": [{"rev": "3-win"}, {"rev": "2-lose"}]},
                    {"id": "task-deleted", "changes": [{"rev": "2-deleted"}]},
                ]
            }
        if operation == "winner enumeration":
            return {
                "rows": [
                    {"id": "activity-a", "value": {"rev": "3-win"}},
                    {
                        "id": "task-deleted",
                        "value": {"rev": "2-deleted", "deleted": True},
                    },
                ]
            }
        if operation == "leaf body read":
            assert method == "POST"
            assert kwargs["body"] == {
                "docs": [
                    {"id": "activity-a", "rev": "2-lose"},
                    {"id": "activity-a", "rev": "3-win"},
                    {"id": "task-deleted", "rev": "2-deleted"},
                ]
            }
            return {
                "results": [
                    {
                        "id": "activity-a",
                        "docs": [
                            {"ok": {"_id": "activity-a", "_rev": "3-win"}},
                            {"ok": {"_id": "activity-a", "_rev": "2-lose"}},
                        ],
                    },
                    {
                        "id": "task-deleted",
                        "docs": [
                            {
                                "ok": {
                                    "_id": "task-deleted",
                                    "_rev": "2-deleted",
                                    "_deleted": True,
                                }
                            }
                        ],
                    },
                ]
            }
        raise AssertionError((method, operation, path, kwargs))

    monkeypatch.setattr(client, "_request", request)

    result = client.get_state_model(SOURCE)

    assert not hasattr(result, "update_sequence")
    assert result.counts == {
        "documents": 2,
        "liveLeaves": 2,
        "deletedLeaves": 1,
        "conflictLeaves": 1,
    }
    winner_call = next(call for call in calls if call[1] == "winner enumeration")
    assert winner_call[0] == "POST"
    assert winner_call[3]["body"] == {"keys": ["activity-a", "task-deleted"]}
    assert len([call for call in calls if call[1] == "leaf body read"]) == 1
    assert all("attachments=true" not in call[2] for call in calls)


def test_operational_client_returns_leaf_ancestry_and_winners_without_private_output(
    monkeypatch, capsys
) -> None:
    client = quarantine.OperationalCloudantClient(
        "https://private-user:private-password@account.example.invalid"
    )

    def request(method, operation, path, **kwargs):
        if operation == "leaf enumeration":
            assert method == "GET"
            return {"results": [{"id": "task-a", "changes": [{"rev": "2-win"}]}]}
        if operation == "leaf body read":
            assert method == "POST"
            assert "revs=true" in path
            assert kwargs["body"] == {"docs": [{"id": "task-a", "rev": "2-win"}]}
            return {
                "results": [
                    {
                        "id": "task-a",
                        "docs": [
                            {
                                "ok": {
                                    "_id": "task-a",
                                    "_rev": "2-win",
                                    "_revisions": {"start": 2, "ids": ["win", "base"]},
                                    "description": "private body",
                                }
                            }
                        ],
                    }
                ]
            }
        if operation == "winning document read":
            assert method == "GET"
            assert "conflicts=true" in path
            return {
                "rows": [
                    {
                        "id": "task-a",
                        "doc": {
                            "_id": "task-a",
                            "_rev": "2-win",
                            "description": "private body",
                        },
                    },
                    {"id": "deleted", "value": {"rev": "2-deleted", "deleted": True}},
                ]
            }
        raise AssertionError((operation, path))

    monkeypatch.setattr(client, "_request", request)

    leaves = client.get_leaf_documents(SOURCE)
    winners = client.get_all_documents(SOURCE, include_conflicts=True)

    assert leaves[0]["_revisions"]["ids"] == ["win", "base"]
    assert winners == [{"_id": "task-a", "_rev": "2-win", "description": "private body"}]
    assert capsys.readouterr().out == ""


def test_operational_client_reads_leaf_bodies_in_bounded_batches(monkeypatch) -> None:
    client = quarantine.OperationalCloudantClient(
        "https://private-user:private-password@account.example.invalid"
    )
    identities = [(f"task-{index:03d}", f"1-rev-{index:03d}") for index in range(101)]
    batch_sizes = []

    def request(method, operation, path, **kwargs):
        if operation == "leaf enumeration":
            return {
                "results": [
                    {"id": document_id, "changes": [{"rev": revision}]}
                    for document_id, revision in identities
                ]
            }
        if operation == "leaf body read":
            assert method == "POST"
            assert "_bulk_get?revs=true" in path
            requested = kwargs["body"]["docs"]
            batch_sizes.append(len(requested))
            return {
                "results": [
                    {
                        "id": item["id"],
                        "docs": [
                            {
                                "ok": {
                                    "_id": item["id"],
                                    "_rev": item["rev"],
                                    "_revisions": {"start": 1, "ids": [item["rev"][2:]]},
                                }
                            }
                        ],
                    }
                    for item in requested
                ]
            }
        raise AssertionError((method, operation, path))

    monkeypatch.setattr(client, "_request", request)

    assert len(client.get_leaf_documents(SOURCE)) == 101
    assert batch_sizes == [quarantine.LEAF_READ_BATCH_SIZE, 1]


def test_operational_client_writes_only_exact_database_replication_and_document_targets(
    monkeypatch,
) -> None:
    client = quarantine.OperationalCloudantClient(
        "https://private-user:private-password@account.example.invalid"
    )
    calls: list[tuple] = []

    def request(method, operation, path, **kwargs):
        calls.append((method, operation, path, copy.deepcopy(kwargs)))
        if operation == "transient replication":
            return {"ok": True, "history": [{"doc_write_failures": 0}]}
        return {"ok": True, "id": CONTRACT_DESIGN_ID, "rev": "1-validator"}

    monkeypatch.setattr(client, "_request", request)

    client.create_database(QUARANTINE, partitioned=False)
    client.replicate_once(SOURCE, QUARANTINE)
    client.put_document(SOURCE, load_design_document(), create_only=True)

    assert calls[0][:3] == (
        "PUT",
        "database create",
        f"{QUARANTINE}?partitioned=false",
    )
    replication_body = calls[1][3]["body"]
    assert replication_body["source"]["url"].endswith(f"/{SOURCE}")
    assert replication_body["target"]["url"].endswith(f"/{QUARANTINE}")
    assert set(replication_body) == {"source", "target"}
    assert calls[1][0:3] == ("POST", "transient replication", "_replicate")
    assert calls[2][0:2] == ("PUT", "document create")
    assert calls[2][2].endswith("/_design%2Ffortudo-document-contract")


@pytest.mark.parametrize(
    ("response", "message"),
    [
        ({"ok": False}, "invalid replication response"),
        ({"ok": True}, "omitted its history"),
        (
            {"ok": True, "history": [{"doc_write_failures": 1}]},
            "document write failures",
        ),
        (
            {
                "ok": True,
                "history": [
                    {"doc_write_failures": 1},
                    {"doc_write_failures": 0},
                ],
            },
            "document write failures",
        ),
    ],
)
def test_transient_replication_rejects_incomplete_or_failed_responses(
    monkeypatch, response, message
) -> None:
    client = quarantine.OperationalCloudantClient(
        "https://private-user:private-password@account.example.invalid"
    )
    monkeypatch.setattr(client, "_request", lambda *args, **kwargs: response)

    with pytest.raises(quarantine.QuarantineSafetyError, match=message):
        client.replicate_once(SOURCE, QUARANTINE)


def test_operational_transport_sanitizes_http_error_bodies_credentials_and_urls(
    monkeypatch,
) -> None:
    client = quarantine.OperationalCloudantClient(
        "https://private-user:private-password@account.example.invalid"
    )
    private_body = io.BytesIO(b'{"reason":"private document contents"}')

    def fail(_request, *, timeout):
        assert timeout == 60
        raise urllib.error.HTTPError(
            "https://private-user:private-password@account.example.invalid/private-db",
            409,
            "conflict",
            {},
            private_body,
        )

    monkeypatch.setattr(quarantine.urllib.request, "urlopen", fail)

    with pytest.raises(quarantine.QuarantineSafetyError) as error:
        client.create_database(QUARANTINE, partitioned=False)

    message = str(error.value)
    assert "HTTP 409" in message
    assert "private" not in message
    assert "account.example.invalid" not in message
    assert QUARANTINE not in message


def test_operational_transport_retries_rate_limits_without_exposing_response(
    monkeypatch,
) -> None:
    client = quarantine.OperationalCloudantClient(
        "https://private-user:private-password@account.example.invalid"
    )
    attempts = 0
    delays = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"db_name":"fortudo-quarantine-0123456789abcdef01234567"}'

    def rate_limited_then_succeed(_request, *, timeout):
        nonlocal attempts
        assert timeout == 60
        attempts += 1
        if attempts < 3:
            raise urllib.error.HTTPError(
                "https://private.invalid",
                429,
                "rate limited",
                {"Retry-After": "0"},
                io.BytesIO(b"private response"),
            )
        return Response()

    monkeypatch.setattr(quarantine.urllib.request, "urlopen", rate_limited_then_succeed)
    monkeypatch.setattr(quarantine.time, "sleep", delays.append)

    assert client.database_exists(QUARANTINE) is True
    assert attempts == 3
    assert delays == [0.5, 1.0]


def test_migration_planner_errors_are_translated_to_sanitized_operational_errors(
    monkeypatch,
) -> None:
    def fail(_documents):
        raise migration.MigrationSafetyError("private structural detail")

    monkeypatch.setattr(quarantine, "build_migration_plan", fail)

    with pytest.raises(
        quarantine.QuarantineSafetyError, match="migration planning precondition failed"
    ) as error:
        quarantine._checked_migration_plan([])

    assert "private" not in str(error.value)


def migration_winners() -> list[dict]:
    return [
        {
            "_id": "config-categories",
            "_rev": "3-taxonomy",
            "id": "config-categories",
            "docType": "config",
            "schemaVersion": "3.5",
            "groups": [{"key": "work", "label": "Work", "colorFamily": "blue", "color": "#111111"}],
            "categories": [
                {
                    "key": "work/meetings",
                    "label": "Comms",
                    "groupKey": "work",
                    "color": "#222222",
                },
                {
                    "key": "work/comms",
                    "label": "Meetings",
                    "groupKey": "work",
                    "color": "#333333",
                },
            ],
        },
        {
            "_id": "task-a",
            "_rev": "2-task",
            "id": "task-a",
            "docType": "task",
            "type": "unscheduled",
            "description": "private task",
            "category": "work/meetings",
        },
        {
            "_id": "activity-a",
            "_rev": "4-winner",
            "_conflicts": ["3-loser"],
            "id": "activity-a",
            "docType": "activity",
            "description": "private activity",
            "category": "work/comms",
        },
    ]


def migration_base_state():
    return state(
        ("config-categories", "3-taxonomy", False),
        ("task-a", "2-task", False),
        ("activity-a", "4-winner", False),
        ("activity-a", "3-loser", False),
        winners={
            "config-categories": "3-taxonomy",
            "task-a": "2-task",
            "activity-a": "4-winner",
        },
    )


def successor(document: dict, revision: str, parent: str) -> dict:
    result = copy.deepcopy(document)
    result["_rev"] = revision
    generation, digest = revision.split("-", 1)
    _parent_generation, parent_digest = parent.split("-", 1)
    result["_revisions"] = {
        "start": int(generation),
        "ids": [digest, parent_digest],
    }
    return result


def test_resume_classifier_accepts_only_exact_deterministic_children_of_quarantine_leaves() -> None:
    base_documents = migration_winners()
    plan = migration.build_migration_plan(base_documents)
    intended = {document["_id"]: document for document in plan.updates}
    partial_leaves = [
        successor(intended["config-categories"], "4-taxonomy-next", "3-taxonomy"),
        copy.deepcopy(base_documents[1]),
        copy.deepcopy(base_documents[2]),
        {"_id": "activity-a", "_rev": "3-loser"},
        {**load_design_document(), "_rev": "1-validator"},
    ]
    partial_state = state(
        ("config-categories", "4-taxonomy-next", False),
        ("task-a", "2-task", False),
        ("activity-a", "4-winner", False),
        ("activity-a", "3-loser", False),
        (CONTRACT_DESIGN_ID, "1-validator", False),
        winners={
            "config-categories": "4-taxonomy-next",
            "task-a": "2-task",
            "activity-a": "4-winner",
            CONTRACT_DESIGN_ID: "1-validator",
        },
    )

    classification = quarantine.classify_migration_state(
        base_documents,
        migration_base_state(),
        partial_leaves,
        partial_state,
        validator_revision="1-validator",
    )

    assert classification.complete is False
    assert classification.transitioned_updates == 1
    assert classification.transitioned_tombstones == 0

    changed = copy.deepcopy(partial_leaves)
    changed[0]["categories"][0]["label"] = "Semantically changed"
    with pytest.raises(quarantine.QuarantineSafetyError, match="intended migration successor"):
        quarantine.classify_migration_state(
            base_documents,
            migration_base_state(),
            changed,
            partial_state,
            validator_revision="1-validator",
        )


def test_resume_classifier_accepts_complete_successors_and_conflict_tombstone() -> None:
    base_documents = migration_winners()
    plan = migration.build_migration_plan(base_documents)
    intended = {document["_id"]: document for document in plan.updates}
    current_leaves = [
        successor(intended["config-categories"], "4-taxonomy-next", "3-taxonomy"),
        successor(intended["task-a"], "3-task-next", "2-task"),
        successor(intended["activity-a"], "5-activity-next", "4-winner"),
        successor(plan.conflict_tombstones[0], "4-loser-deleted", "3-loser"),
        {**load_design_document(), "_rev": "1-validator"},
    ]
    current_state = state(
        ("config-categories", "4-taxonomy-next", False),
        ("task-a", "3-task-next", False),
        ("activity-a", "5-activity-next", False),
        ("activity-a", "4-loser-deleted", True),
        (CONTRACT_DESIGN_ID, "1-validator", False),
        winners={
            "config-categories": "4-taxonomy-next",
            "task-a": "3-task-next",
            "activity-a": "5-activity-next",
            CONTRACT_DESIGN_ID: "1-validator",
        },
    )

    classification = quarantine.classify_migration_state(
        base_documents,
        migration_base_state(),
        current_leaves,
        current_state,
        validator_revision="1-validator",
    )

    assert classification.complete is True
    assert classification.transitioned_updates == 3
    assert classification.transitioned_tombstones == 1


def test_locked_taxonomy_meanings_are_checked_from_current_rows_without_key_inference() -> None:
    documents = migration_winners()
    quarantine.require_locked_taxonomy_meanings(documents)

    documents[0]["categories"][0]["label"] = "Meetings"
    with pytest.raises(quarantine.QuarantineSafetyError, match="locked taxonomy meaning"):
        quarantine.require_locked_taxonomy_meanings(documents)


def fully_migrated_fixture():
    base_documents = migration_winners()
    plan = migration.build_migration_plan(base_documents)
    intended = {document["_id"]: document for document in plan.updates}
    settled = [
        successor(intended["config-categories"], "4-taxonomy-next", "3-taxonomy"),
        successor(intended["task-a"], "3-task-next", "2-task"),
        successor(intended["activity-a"], "5-activity-next", "4-winner"),
    ]
    for document in settled:
        document.pop("_revisions")
        document.pop("_conflicts", None)
    leaves = [
        successor(intended["config-categories"], "4-taxonomy-next", "3-taxonomy"),
        successor(intended["task-a"], "3-task-next", "2-task"),
        successor(intended["activity-a"], "5-activity-next", "4-winner"),
        successor(plan.conflict_tombstones[0], "4-loser-deleted", "3-loser"),
        {**load_design_document(), "_rev": "1-validator"},
    ]
    complete_state = state(
        ("config-categories", "4-taxonomy-next", False),
        ("task-a", "3-task-next", False),
        ("activity-a", "5-activity-next", False),
        ("activity-a", "4-loser-deleted", True),
        (CONTRACT_DESIGN_ID, "1-validator", False),
        winners={
            "config-categories": "4-taxonomy-next",
            "task-a": "3-task-next",
            "activity-a": "5-activity-next",
            CONTRACT_DESIGN_ID: "1-validator",
        },
    )
    return base_documents, plan, settled, leaves, complete_state


class MigrationCloudant:
    def __init__(self, *, final_state_override=None, fail_after_writes=None):
        base_documents, plan, settled, leaves, complete_state = fully_migrated_fixture()
        self.base_documents = base_documents
        self.plan = plan
        self.settled = settled
        self.complete_leaves = leaves
        self.complete_state = final_state_override or complete_state
        self.fail_after_writes = fail_after_writes
        self.write_count = 0
        self.marker = None
        self.calls: list[tuple] = []
        self.fenced_state = state(
            *(
                tuple((leaf.document_id, leaf.revision, leaf.deleted))
                for leaf in migration_base_state().leaves
            ),
            (CONTRACT_DESIGN_ID, "1-validator", False),
            winners={**dict(migration_base_state().winners), CONTRACT_DESIGN_ID: "1-validator"},
        )
        self.fenced_leaves = [
            *copy.deepcopy(self.base_documents),
            {"_id": "activity-a", "_rev": "3-loser"},
            {**load_design_document(), "_rev": "1-validator"},
        ]

    def _partial_snapshot(self):
        if self.write_count == 0:
            return self.base_documents, self.fenced_leaves, self.fenced_state
        intended = {document["_id"]: document for document in self.plan.updates}
        revisions = {
            "config-categories": ("4-taxonomy-next", "3-taxonomy", 1),
            "task-a": ("3-task-next", "2-task", 2),
            "activity-a": ("5-activity-next", "4-winner", 3),
        }
        documents: list[dict] = []
        leaves: list[dict] = []
        rows: list[tuple[str, str, bool]] = []
        winners: dict[str, str] = {}
        for base in self.base_documents:
            document_id = base["_id"]
            revision, parent, threshold = revisions[document_id]
            if self.write_count >= threshold:
                migrated = successor(intended[document_id], revision, parent)
                leaves.append(copy.deepcopy(migrated))
                winner = copy.deepcopy(migrated)
                winner.pop("_revisions")
                if document_id == "activity-a" and self.write_count < 4:
                    winner["_conflicts"] = ["3-loser"]
                documents.append(winner)
                rows.append((document_id, revision, False))
                winners[document_id] = revision
            else:
                documents.append(copy.deepcopy(base))
                leaves.append(copy.deepcopy(base))
                rows.append((document_id, base["_rev"], False))
                winners[document_id] = base["_rev"]
        if self.write_count >= 4:
            tombstone = successor(self.plan.conflict_tombstones[0], "4-loser-deleted", "3-loser")
            leaves.append(tombstone)
            rows.append(("activity-a", "4-loser-deleted", True))
        else:
            leaves.append({"_id": "activity-a", "_rev": "3-loser"})
            rows.append(("activity-a", "3-loser", False))
        leaves.append({**load_design_document(), "_rev": "1-validator"})
        rows.append((CONTRACT_DESIGN_ID, "1-validator", False))
        winners[CONTRACT_DESIGN_ID] = "1-validator"
        return documents, leaves, state(*rows, winners=winners)

    def get_document(self, database, document_id):
        self.calls.append(("get-document", database, document_id))
        if document_id == "config-running-activity":
            return None
        if document_id == CONTRACT_DESIGN_ID:
            return {**load_design_document(), "_rev": "1-validator"}
        if document_id == quarantine.COMPLETION_MARKER_ID:
            return copy.deepcopy(self.marker)
        return None

    def get_security_hash(self, database):
        self.calls.append(("security", database))
        return "security"

    def get_state_model(self, database):
        self.calls.append(("state", database))
        if database == QUARANTINE:
            return migration_base_state()
        if self.marker is not None:
            return quarantine.add_leaf_to_state(
                self.complete_state,
                quarantine.COMPLETION_MARKER_ID,
                self.marker["_rev"],
                deleted=False,
            )
        if self.write_count == 4:
            return self.complete_state
        return self._partial_snapshot()[2]

    def get_all_documents(self, database, *, include_conflicts):
        self.calls.append(("winners", database, include_conflicts))
        if database == QUARANTINE:
            return copy.deepcopy(self.base_documents)
        if self.write_count == 4:
            result = copy.deepcopy(self.settled)
            if self.marker is not None:
                result.append(copy.deepcopy(self.marker))
            return result
        return copy.deepcopy(self._partial_snapshot()[0])

    def get_leaf_documents(self, database):
        self.calls.append(("leaves", database))
        if database == QUARANTINE:
            return copy.deepcopy(self.base_documents) + [{"_id": "activity-a", "_rev": "3-loser"}]
        if self.write_count == 4:
            result = copy.deepcopy(self.complete_leaves)
            if self.marker is not None:
                result.append(copy.deepcopy(self.marker))
            return result
        return copy.deepcopy(self._partial_snapshot()[1])

    def put_document(self, database, document, *, create_only=False):
        self.calls.append(("put", database, copy.deepcopy(document), create_only))
        if self.fail_after_writes is not None and self.write_count == self.fail_after_writes:
            raise quarantine.QuarantineSafetyError("forced interruption")
        if document["_id"] == quarantine.COMPLETION_MARKER_ID:
            assert self.write_count == 4
            assert create_only is True
            self.marker = {**copy.deepcopy(document), "_rev": "1-marker"}
            return {"ok": True, "id": document["_id"], "rev": "1-marker"}
        revisions = [
            "4-taxonomy-next",
            "3-task-next",
            "5-activity-next",
            "4-loser-deleted",
        ]
        revision = revisions[self.write_count]
        self.write_count += 1
        return {"ok": True, "id": document["_id"], "rev": revision}


def test_executor_writes_taxonomy_entities_tombstone_then_separate_completion_marker() -> None:
    client = MigrationCloudant()
    capture = quarantine.CaptureReceipt(SOURCE, QUARANTINE, migration_base_state(), "security")
    fence = quarantine.FenceReceipt(capture, "1-validator", client.fenced_state)

    result = quarantine.execute_migration(client, fence, completed_at="2026-07-22T12:00:00Z")

    writes = [call for call in client.calls if call[0] == "put"]
    assert [call[2]["_id"] for call in writes] == [
        "config-categories",
        "task-a",
        "activity-a",
        "activity-a",
        quarantine.COMPLETION_MARKER_ID,
    ]
    assert writes[3][2]["_deleted"] is True
    assert writes[3][2]["writerContract"] == {"version": 1}
    assert writes[4][3] is True
    assert result.state == "complete"
    assert result.verified_state_fingerprint == client.complete_state.fingerprint
    assert result.marker_revision == "1-marker"
    assert client.marker["quarantineFingerprint"] == migration_base_state().fingerprint
    assert client.marker["validatorRevision"] == "1-validator"


def test_executor_blocks_unexpected_final_revision_before_writing_marker() -> None:
    _base, _plan, _settled, leaves, complete = fully_migrated_fixture()
    unexpected = quarantine.add_leaf_to_state(
        complete, "task-unexpected", "1-unexpected", deleted=False
    )
    client = MigrationCloudant(final_state_override=unexpected)
    client.complete_leaves = [
        *leaves,
        {"_id": "task-unexpected", "_rev": "1-unexpected"},
    ]
    capture = quarantine.CaptureReceipt(SOURCE, QUARANTINE, migration_base_state(), "security")
    fence = quarantine.FenceReceipt(capture, "1-validator", client.fenced_state)

    with pytest.raises(quarantine.QuarantineSafetyError, match="unrelated leaf"):
        quarantine.execute_migration(client, fence, completed_at="2026-07-22T12:00:00Z")

    assert client.marker is None
    assert not any(
        call[0] == "put" and call[2]["_id"] == quarantine.COMPLETION_MARKER_ID
        for call in client.calls
    )


def test_executor_resumes_after_forced_interruption_without_rewriting_completed_successor() -> None:
    client = MigrationCloudant(fail_after_writes=1)
    capture = quarantine.CaptureReceipt(SOURCE, QUARANTINE, migration_base_state(), "security")
    fence = quarantine.FenceReceipt(capture, "1-validator", client.fenced_state)

    with pytest.raises(quarantine.QuarantineSafetyError, match="forced interruption"):
        quarantine.execute_migration(client, fence, completed_at="2026-07-22T12:00:00Z")
    assert client.write_count == 1

    client.fail_after_writes = None
    result = quarantine.execute_migration(client, fence, completed_at="2026-07-22T12:00:00Z")

    taxonomy_writes = [
        call for call in client.calls if call[0] == "put" and call[2]["_id"] == "config-categories"
    ]
    assert len(taxonomy_writes) == 1
    assert result.state == "complete"


def test_operator_cli_exposes_only_minimal_quarantine_workflow(tmp_path: Path) -> None:
    script = Path(quarantine.__file__).resolve()

    result = subprocess.run(
        [sys.executable, str(script), "--help"],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    for mode in ("preflight", "capture", "fence", "migrate", "delete-quarantine"):
        assert mode in result.stdout
    usage = result.stdout.splitlines()[0]
    for retired in ("snapshot", "restore", "inventory", "portable", "backup-root"):
        assert retired not in usage


def test_account_binding_checksum_never_contains_endpoint_or_credentials() -> None:
    client = quarantine.OperationalCloudantClient(
        "https://private-user:private-password@account.example.invalid"
    )

    assert len(client.account_checksum) == 64
    assert "private" not in client.account_checksum
    assert "account.example.invalid" not in client.account_checksum


def test_mutating_cli_requires_account_binding_source_confirmation_and_approval() -> None:
    parser = quarantine._parser()

    with pytest.raises(SystemExit):
        parser.parse_args(
            [
                "capture",
                "--quarantine-database",
                QUARANTINE,
                "--expected-account-checksum",
                "a" * 64,
            ]
        )


def test_preflight_reports_exact_validator_state_without_database_or_private_values(capsys) -> None:
    class PreflightClient:
        account_checksum = "a" * 64

        def get_state_model(self, database):
            assert database == SOURCE
            return state(("task-a", "1-a", False))

        def get_security_hash(self, database):
            assert database == SOURCE
            return "b" * 64

        def get_document(self, database, document_id):
            assert database == SOURCE
            if document_id == migration.RUNNING_ACTIVITY_ID:
                return None
            return {**load_design_document(), "_rev": "1-validator"}

    result = quarantine.execute_cli(
        ["preflight"],
        environ={quarantine.CREDENTIAL_ENV_VAR: "https://user:secret@example.invalid"},
        client_factory=lambda _url: PreflightClient(),
    )

    assert result["validatorState"] == "compatible"
    assert result["validatorRevision"] == "1-validator"
    output = capsys.readouterr().out
    assert SOURCE not in output
    assert "secret" not in output


def test_delete_quarantine_requires_exact_name_fingerprint_and_confirmation() -> None:
    class DeleteClient:
        account_checksum = "a" * 64

        def __init__(self):
            self.calls = []

        def get_state_model(self, database):
            self.calls.append(("state", database))
            return state(("task-a", "1-a", False))

        def delete_database(self, database, *, allow_disposable_preview=False):
            self.calls.append(("delete", database, allow_disposable_preview))

        def database_exists(self, database):
            self.calls.append(("exists", database))
            return False

    client = DeleteClient()
    fingerprint = state(("task-a", "1-a", False)).fingerprint
    result = quarantine.execute_cli(
        [
            "delete-quarantine",
            "--quarantine-database",
            QUARANTINE,
            "--expected-account-checksum",
            "a" * 64,
            "--expected-quarantine-fingerprint",
            fingerprint,
            "--confirm-delete-quarantine",
            QUARANTINE,
            "--approve-remote-writes",
        ],
        environ={quarantine.CREDENTIAL_ENV_VAR: "https://user:secret@example.invalid"},
        client_factory=lambda _url: client,
    )

    assert result["state"] == "deleted"
    assert client.calls == [
        ("state", QUARANTINE),
        ("delete", QUARANTINE, False),
        ("exists", QUARANTINE),
    ]

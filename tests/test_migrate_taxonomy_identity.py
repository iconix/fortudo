"""Safety and invariants for the read-only taxonomy identity planner."""

from __future__ import annotations

import copy
import io
import subprocess
import sys
from pathlib import Path

import pytest

from scripts import migrate_taxonomy_identity as migration


TARGET_DATABASE = "fortudo-dat-411"


def taxonomy_doc() -> dict:
    return {
        "_id": "config-categories",
        "_rev": "3-taxonomy",
        "id": "config-categories",
        "docType": "config",
        "schemaVersion": "3.5",
        "groups": [
            {"key": "work", "label": "Work", "colorFamily": "blue", "color": "#0ea5e9"}
        ],
        "categories": [
            {
                "key": "work/meetings",
                "label": "Comms",
                "groupKey": "work",
                "color": "#38bdf8",
            },
            {
                "key": "work/comms",
                "label": "Meetings",
                "groupKey": "work",
                "color": "#7dd3fc",
            },
        ],
    }


def production_winners() -> list[dict]:
    return [
        taxonomy_doc(),
        {
            "_id": "unsched-legacy",
            "_rev": "2-task",
            "id": "unsched-legacy",
            "docType": "task",
            "type": "unscheduled",
            "description": "private task text",
            "category": "work/meetings",
        },
        {
            "_id": "activity-legacy",
            "_rev": "4-activity-winner",
            "_conflicts": ["3-activity-loser"],
            "id": "activity-legacy",
            "docType": "activity",
            "description": "private activity text",
            "category": "work/comms",
            "duration": 30,
        },
        {
            "_id": "config-running-activity",
            "_rev": "2-running",
            "id": "config-running-activity",
            "docType": "config",
            "activityId": "activity-running",
            "description": "private running text",
            "category": "work/meetings",
        },
    ]


class ReadOnlyCloudant:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def get_database_info(self, database: str) -> dict:
        self.calls.append(("info", database))
        return {"db_name": database}

    def get_all_documents(self, database: str, *, include_conflicts: bool) -> list[dict]:
        self.calls.append(("documents", database, include_conflicts))
        return copy.deepcopy(production_winners())


def test_cloudant_transport_issues_get_requests_only(monkeypatch) -> None:
    methods: list[str] = []

    class Response(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            self.close()

    def open_request(request, *, timeout):
        assert timeout == 60
        methods.append(request.get_method())
        payload = (
            b'{"db_name":"fortudo-dat-411"}'
            if request.full_url.endswith("fortudo-dat-411")
            else b'{"rows":[]}'
        )
        return Response(payload)

    monkeypatch.setattr(migration.urllib.request, "urlopen", open_request)
    client = migration.CloudantClient("https://user:secret@example.invalid")

    client.get_database_info(TARGET_DATABASE)
    client.get_all_documents(TARGET_DATABASE, include_conflicts=True)

    assert methods == ["GET", "GET"]


@pytest.mark.parametrize(
    ("operation", "payload", "message"),
    [
        ("info", ["private"], "invalid database metadata response"),
        ("documents", {"rows": "private"}, "invalid winning document response"),
        ("documents", {"rows": [{"doc": "private"}]}, "invalid winning document response"),
    ],
)
def test_cloudant_reads_reject_malformed_payloads_without_echoing_them(
    monkeypatch, operation, payload, message
) -> None:
    client = migration.CloudantClient("https://user:secret@example.invalid")
    monkeypatch.setattr(client, "_request", lambda _operation, _path: payload)

    with pytest.raises(migration.MigrationSafetyError, match=message) as error:
        if operation == "info":
            client.get_database_info(TARGET_DATABASE)
        else:
            client.get_all_documents(TARGET_DATABASE, include_conflicts=True)

    assert "private" not in str(error.value)


def test_direct_cli_is_dry_run_only_from_any_working_directory(tmp_path: Path) -> None:
    script = Path(migration.__file__).resolve()

    result = subprocess.run(
        [sys.executable, str(script), "--help"],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "--database" in result.stdout
    for retired_flag in (
        "--apply",
        "--backup-root",
        "--s1-snapshot",
        "--journal",
        "--expected-update-seq",
        "--confirm-database",
    ):
        assert retired_flag not in result.stdout


def test_retired_backup_restore_and_write_entry_points_are_absent() -> None:
    for retired_name in (
        "create_backup",
        "verify_backup",
        "apply_migration",
        "restore_backup",
        "write_completion_marker",
        "compute_verified_state_fingerprint",
    ):
        assert not hasattr(migration, retired_name)

    for retired_method in (
        "get_revision",
        "get_current_leaf_graph",
        "get_document",
        "put_document",
        "bulk_docs",
    ):
        assert not hasattr(migration.CloudantClient, retired_method)


def test_dry_run_is_the_only_mode_and_never_writes_or_exposes_private_values(capsys) -> None:
    client = ReadOnlyCloudant()

    result = migration.execute(
        ["--database", TARGET_DATABASE],
        environ={migration.CREDENTIAL_ENV_VAR: "https://user:secret@example.invalid"},
        client_factory=lambda _url: client,
    )

    assert result.mode == "dry-run"
    assert result.counts == {
        "documentsScanned": 4,
        "taxonomyRecordsMigrated": 3,
        "categorizedReferences": 3,
        "referencesMigrated": 3,
        "conflictLeaves": 1,
        "documentsUpdated": 4,
    }
    assert client.calls == [
        ("info", TARGET_DATABASE),
        ("documents", TARGET_DATABASE, True),
    ]
    output = capsys.readouterr().out
    assert "private task text" not in output
    assert "private activity text" not in output
    assert "secret" not in output
    assert TARGET_DATABASE not in output


def test_dry_run_accepts_another_explicit_fortudo_database(capsys) -> None:
    client = ReadOnlyCloudant()
    database = "fortudo-family-123"

    result = migration.execute(
        ["--database", database],
        environ={migration.CREDENTIAL_ENV_VAR: "https://user:secret@example.invalid"},
        client_factory=lambda _url: client,
    )

    assert result.mode == "dry-run"
    assert client.calls == [("info", database), ("documents", database, True)]
    assert database not in capsys.readouterr().out


@pytest.mark.parametrize(
    "retired_arguments",
    [
        ["--apply"],
        ["--backup-root", "private"],
        ["--s1-snapshot", "private/S1"],
        ["--journal", "private/journal.json"],
        ["--expected-update-seq", "opaque"],
        ["--confirm-database", TARGET_DATABASE],
    ],
)
def test_parser_rejects_all_retired_mutation_and_backup_flags(retired_arguments) -> None:
    with pytest.raises(SystemExit):
        migration._parser().parse_args(
            ["--database", TARGET_DATABASE, *retired_arguments]
        )


def test_plan_preserves_ids_locked_labels_winners_and_nonidentity_fields() -> None:
    winners = production_winners()
    before = copy.deepcopy(winners)

    plan = migration.build_migration_plan(winners)

    assert winners == before, "planning must not mutate fetched winners"
    assert {document["_id"] for document in plan.updates} == {
        "config-categories",
        "unsched-legacy",
        "activity-legacy",
        "config-running-activity",
    }
    taxonomy = next(document for document in plan.updates if document["_id"] == "config-categories")
    assert [(row["key"], row["label"]) for row in taxonomy["categories"]] == [
        ("work/meetings", "Comms"),
        ("work/comms", "Meetings"),
    ]
    assert taxonomy["categories"][0]["id"] == "9c52c0e9-c389-54e1-927f-52c16b13de99"
    task = next(document for document in plan.updates if document["_id"] == "unsched-legacy")
    assert task["id"] == "unsched-legacy"
    assert task["description"] == "private task text"
    assert task["writerContract"]["categoryReference"] == {
        "key": "work/meetings",
        "id": task["categoryId"],
        "identityVersion": 1,
    }
    assert plan.conflict_tombstones == [
        {
            "_id": "activity-legacy",
            "_rev": "3-activity-loser",
            "_deleted": True,
            "writerContract": {"version": 1},
        }
    ]


def test_plan_resolves_references_from_current_taxonomy_not_legacy_key_semantics() -> None:
    winners = production_winners()
    winners[1]["category"] = "work"

    plan = migration.build_migration_plan(winners)
    task = next(document for document in plan.updates if document["_id"] == "unsched-legacy")

    assert task["categoryId"] == "3930ae01-aef6-5c5f-8db3-d91be139ea84"
    assert task["categoryIdentityVersion"] == 1


def test_plan_repairs_id_only_and_mismatched_references_using_current_rows() -> None:
    migrated_taxonomy = migration.build_migration_plan([taxonomy_doc()]).updates[0]
    comms_id = migrated_taxonomy["categories"][0]["id"]
    meetings_id = migrated_taxonomy["categories"][1]["id"]
    documents = [
        migrated_taxonomy,
        {
            "_id": "task-id-only",
            "_rev": "1-id-only",
            "id": "task-id-only",
            "docType": "task",
            "type": "unscheduled",
            "categoryId": comms_id,
        },
        {
            "_id": "task-mismatch",
            "_rev": "1-mismatch",
            "id": "task-mismatch",
            "docType": "task",
            "type": "unscheduled",
            "category": "work/meetings",
            "categoryId": meetings_id,
            "categoryIdentityVersion": 1,
        },
        {
            "_id": "activity-stale-key",
            "_rev": "1-stale-key",
            "id": "activity-stale-key",
            "docType": "activity",
            "category": "retired-key",
            "categoryId": meetings_id,
            "categoryIdentityVersion": 1,
        },
    ]

    updates = {
        document["_id"]: document for document in migration.build_migration_plan(documents).updates
    }

    assert updates["task-id-only"]["category"] == "work/meetings"
    assert updates["task-mismatch"]["categoryId"] == comms_id
    assert updates["activity-stale-key"]["category"] == "work/comms"


def test_plan_preserves_existing_identity_archive_metadata_and_unknown_fields() -> None:
    migrated_taxonomy = migration.build_migration_plan([taxonomy_doc()]).updates[0]
    migrated_taxonomy["privateExtension"] = {"retained": [1, 2, 3]}
    migrated_taxonomy["groups"][0]["status"] = "archived"
    migrated_taxonomy["groups"][0]["archivedAt"] = "2026-07-21T12:00:00Z"

    plan = migration.build_migration_plan([migrated_taxonomy])

    assert plan.updates == []
    assert plan.counts["taxonomyRecordsMigrated"] == 0
    assert migrated_taxonomy["privateExtension"] == {"retained": [1, 2, 3]}


def test_complete_plan_is_idempotent_after_all_successors_and_tombstones() -> None:
    documents = production_winners()
    first = migration.build_migration_plan(documents)
    updates = {document["_id"]: document for document in first.updates}
    settled = []
    for source in documents:
        successor = copy.deepcopy(updates.get(source["_id"], source))
        successor.pop("_conflicts", None)
        settled.append(successor)

    rerun = migration.build_migration_plan(settled)

    assert rerun.updates == []
    assert rerun.conflict_tombstones == []
    assert rerun.counts["documentsUpdated"] == 0
    assert rerun.counts["conflictLeaves"] == 0


def test_non_activity_conflicts_require_manual_review() -> None:
    documents = production_winners()
    documents[1]["_conflicts"] = ["1-other-task"]

    with pytest.raises(migration.MigrationSafetyError, match="non-activity conflict"):
        migration.build_migration_plan(documents)


def test_unknown_reference_and_duplicate_taxonomy_identity_fail_closed() -> None:
    unknown = production_winners()
    unknown[1]["category"] = "work/unknown"
    with pytest.raises(migration.MigrationSafetyError, match="unknown taxonomy reference"):
        migration.build_migration_plan(unknown)

    migrated = migration.build_migration_plan([taxonomy_doc()]).updates[0]
    migrated["categories"][0]["id"] = migrated["groups"][0]["id"]
    with pytest.raises(migration.MigrationSafetyError, match="duplicate taxonomy ID"):
        migration.build_migration_plan([migrated])


@pytest.mark.parametrize("database", ["_users", "dat-411", "fortudo-", "fortudo-UPPER"])
def test_non_fortudo_database_fails_before_remote_reads(database) -> None:
    with pytest.raises(migration.MigrationSafetyError, match="Fortudo namespace"):
        migration.execute(
            ["--database", database],
            environ={migration.CREDENTIAL_ENV_VAR: "https://user:secret@example.invalid"},
        )


def test_missing_credential_fails_before_remote_reads() -> None:

    with pytest.raises(migration.MigrationSafetyError, match=migration.CREDENTIAL_ENV_VAR):
        migration.execute(["--database", TARGET_DATABASE], environ={})


def test_main_sanitizes_cloudant_failures(monkeypatch, capsys) -> None:
    def fail_execute():
        raise migration.MigrationSafetyError("Cloudant request failed during winning document read")

    monkeypatch.setattr(migration, "execute", fail_execute)

    assert migration.main() == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == "Migration blocked: Cloudant request failed during winning document read\n"
    assert "Traceback" not in captured.err

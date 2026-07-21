"""Safety and invariants for the guarded taxonomy identity migration."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest

from scripts import migrate_taxonomy_identity as migration


def taxonomy_doc() -> dict:
    return {
        "_id": "config-categories",
        "_rev": "3-taxonomy",
        "id": "config-categories",
        "docType": "config",
        "schemaVersion": "3.5",
        "groups": [{"key": "work", "label": "Work", "colorFamily": "blue", "color": "#0ea5e9"}],
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


def losing_leaf() -> dict:
    return {
        "_id": "activity-legacy",
        "_rev": "3-activity-loser",
        "id": "activity-legacy",
        "docType": "activity",
        "description": "private losing text",
        "category": "work/meetings",
        "duration": 45,
    }


class FakeCloudant:
    def __init__(self, *, update_seq: str = "42-seq") -> None:
        self.update_seq = update_seq
        self.winners = production_winners()
        self.leaves = {("activity-legacy", "3-activity-loser"): losing_leaf()}
        self.bulk_calls: list[list[dict]] = []

    def get_database_info(self, database: str) -> dict:
        return {
            "db_name": database,
            "update_seq": self.update_seq,
            "doc_count": len(self.winners),
            "doc_del_count": 0,
        }

    def get_all_documents(self, database: str, *, include_conflicts: bool) -> list[dict]:
        assert include_conflicts is True
        return copy.deepcopy(self.winners)

    def get_revision(self, database: str, document_id: str, revision: str) -> dict:
        return copy.deepcopy(self.leaves[(document_id, revision)])

    def get_document(self, database: str, document_id: str) -> dict | None:
        return copy.deepcopy(next((d for d in self.winners if d["_id"] == document_id), None))

    def bulk_docs(self, database: str, documents: list[dict]) -> list[dict]:
        self.bulk_calls.append(copy.deepcopy(documents))
        results = []
        for index, document in enumerate(documents):
            document_id = document["_id"]
            if document.get("_deleted"):
                winner = next(d for d in self.winners if d["_id"] == document_id)
                winner["_conflicts"] = [
                    revision
                    for revision in winner.get("_conflicts", [])
                    if revision != document["_rev"]
                ]
                if not winner["_conflicts"]:
                    winner.pop("_conflicts")
            else:
                stored = copy.deepcopy(document)
                stored["_rev"] = f"next-{len(self.bulk_calls)}-{index}"
                stored.pop("_conflicts", None)
                winner_index = next(
                    (
                        row_index
                        for row_index, winner in enumerate(self.winners)
                        if winner["_id"] == document_id
                    ),
                    None,
                )
                if winner_index is None:
                    self.winners.append(stored)
                else:
                    self.winners[winner_index] = stored
            results.append({"id": document_id, "ok": True, "rev": f"next-{index}"})
        return results


def test_dry_run_is_default_and_never_writes_or_creates_a_backup(tmp_path, capsys):
    client = FakeCloudant()

    result = migration.execute(
        ["--database", migration.EXPECTED_DATABASE_NAME, "--backup-root", str(tmp_path)],
        environ={migration.CREDENTIAL_ENV_VAR: "https://user:secret@example.invalid"},
        client_factory=lambda _url: client,
    )

    assert result.mode == "dry-run"
    assert result.update_seq == "42-seq"
    assert client.bulk_calls == []
    assert list(tmp_path.iterdir()) == []
    output = capsys.readouterr().out
    assert "private task text" not in output
    assert "private activity text" not in output
    assert "secret" not in output


def test_plan_preserves_ids_labels_and_nonidentity_fields():
    winners = production_winners()
    before = copy.deepcopy(winners)

    plan = migration.build_migration_plan(winners)

    assert {document["_id"] for document in plan.updates} == {
        "config-categories",
        "unsched-legacy",
        "activity-legacy",
        "config-running-activity",
    }
    migrated_taxonomy = next(d for d in plan.updates if d["_id"] == "config-categories")
    assert [row["label"] for row in migrated_taxonomy["categories"]] == [
        "Comms",
        "Meetings",
    ]
    assert migrated_taxonomy["categories"][0]["key"] == "work/meetings"
    assert migrated_taxonomy["categories"][1]["key"] == "work/comms"
    assert migrated_taxonomy["categories"][0]["id"] == ("9c52c0e9-c389-54e1-927f-52c16b13de99")
    for old, new in zip(before, winners, strict=True):
        assert old == new, "planning must not mutate the fetched winners"
    task_update = next(d for d in plan.updates if d["_id"] == "unsched-legacy")
    assert task_update["id"] == "unsched-legacy"
    assert task_update["description"] == "private task text"
    assert task_update["categoryIdentityVersion"] == 1


def test_plan_maps_direct_group_references_without_inferring_from_key_text():
    winners = production_winners()
    winners[1]["category"] = "work"

    plan = migration.build_migration_plan(winners)

    task_update = next(d for d in plan.updates if d["_id"] == "unsched-legacy")
    assert task_update["categoryId"] == "3930ae01-aef6-5c5f-8db3-d91be139ea84"
    assert task_update["categoryIdentityVersion"] == 1


def test_plan_repairs_id_only_and_mismatched_references_with_app_resolution_rules():
    initial = migration.build_migration_plan([taxonomy_doc()])
    migrated_taxonomy = initial.updates[0]
    comms_id = migrated_taxonomy["categories"][0]["id"]
    meetings_id = migrated_taxonomy["categories"][1]["id"]
    winners = [
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

    plan = migration.build_migration_plan(winners)
    updates = {document["_id"]: document for document in plan.updates}

    assert updates["task-id-only"]["category"] == "work/meetings"
    assert updates["task-id-only"]["categoryIdentityVersion"] == 1
    assert updates["task-mismatch"]["categoryId"] == comms_id
    assert updates["activity-stale-key"]["category"] == "work/comms"


def test_plan_preserves_existing_random_identity_and_archive_metadata():
    first = migration.build_migration_plan([taxonomy_doc()])
    migrated_taxonomy = first.updates[0]
    migrated_taxonomy["groups"][0]["status"] = "archived"
    migrated_taxonomy["groups"][0]["archivedAt"] = "2026-07-21T12:00:00Z"
    migrated_taxonomy["groups"].append(
        {
            "key": "g-11111111-1111-4111-8111-111111111111",
            "id": "11111111-1111-4111-8111-111111111111",
            "legacyKeys": [],
            "label": "New group",
            "colorFamily": "blue",
            "color": "#0ea5e9",
            "status": "active",
            "archivedAt": None,
        }
    )

    rerun = migration.build_migration_plan([migrated_taxonomy])

    assert rerun.updates == []
    assert rerun.counts["taxonomyRecordsMigrated"] == 0


def test_unknown_reference_and_duplicate_taxonomy_id_abort_before_backup(tmp_path):
    unknown = production_winners()
    unknown[1]["category"] = "work/unknown"
    with pytest.raises(migration.MigrationSafetyError, match="unknown taxonomy reference"):
        migration.build_migration_plan(unknown)

    duplicate = migration.build_migration_plan(production_winners()).updates
    duplicate_taxonomy = next(d for d in duplicate if d["_id"] == "config-categories")
    duplicate_taxonomy["categories"][0]["id"] = duplicate_taxonomy["groups"][0]["id"]
    with pytest.raises(migration.MigrationSafetyError, match="duplicate taxonomy ID"):
        migration.build_migration_plan(duplicate)
    assert list(tmp_path.iterdir()) == []


def test_backup_contains_every_winner_and_conflict_leaf_with_verified_checksum(tmp_path):
    client = FakeCloudant()
    winners = client.get_all_documents(migration.EXPECTED_DATABASE_NAME, include_conflicts=True)

    backup = migration.create_backup(
        client,
        migration.EXPECTED_DATABASE_NAME,
        client.get_database_info(migration.EXPECTED_DATABASE_NAME),
        winners,
        tmp_path,
        timestamp="20260721T120000Z",
    )

    manifest = migration.verify_backup(backup.path)
    assert backup.path.parent == tmp_path.resolve()
    assert manifest["databaseName"] == migration.EXPECTED_DATABASE_NAME
    assert manifest["winnerCount"] == len(winners)
    assert manifest["conflictLeafCount"] == 1
    assert len(manifest["backupChecksum"]) == 64
    winner_rows = (backup.path / "winning-documents.ndjson").read_text(encoding="utf-8")
    leaf_rows = (backup.path / "conflict-leaves.ndjson").read_text(encoding="utf-8")
    assert "private task text" in winner_rows
    assert "private losing text" in leaf_rows


def test_backup_verification_detects_data_tampering(tmp_path):
    client = FakeCloudant()
    backup = migration.create_backup(
        client,
        migration.EXPECTED_DATABASE_NAME,
        client.get_database_info(migration.EXPECTED_DATABASE_NAME),
        client.winners,
        tmp_path,
        timestamp="20260721T120000Z",
    )
    with (backup.path / "winning-documents.ndjson").open("ab") as stream:
        stream.write(b"{}\n")

    with pytest.raises(migration.MigrationSafetyError, match="checksum mismatch"):
        migration.verify_backup(backup.path)


def test_apply_requires_matching_seq_typed_database_and_no_running_timer(tmp_path):
    client = FakeCloudant(update_seq="changed-seq")
    with pytest.raises(migration.MigrationSafetyError, match="update_seq changed"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="dry-run-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            backup_root=tmp_path,
        )
    assert client.bulk_calls == []
    assert list(tmp_path.iterdir()) == []

    client = FakeCloudant()
    with pytest.raises(migration.MigrationSafetyError, match="running timer"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            backup_root=tmp_path,
        )
    assert client.bulk_calls == []


def test_apply_backs_up_before_writes_and_tombstones_only_losing_activity_leaf(tmp_path):
    client = FakeCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]

    result = migration.apply_migration(
        client,
        database=migration.EXPECTED_DATABASE_NAME,
        expected_update_seq="42-seq",
        confirmation=migration.EXPECTED_DATABASE_NAME,
        backup_root=tmp_path,
        timestamp="20260721T120000Z",
    )

    assert result.mode == "apply"
    assert result.backup_path is not None
    assert (result.backup_path / "manifest.json").is_file()
    written = [document for batch in client.bulk_calls for document in batch]
    tombstones = [document for document in written if document.get("_deleted")]
    assert tombstones == [
        {
            "_id": "activity-legacy",
            "_rev": "3-activity-loser",
            "_deleted": True,
        }
    ]
    activity_update = next(
        document
        for document in written
        if document["_id"] == "activity-legacy" and not document.get("_deleted")
    )
    assert activity_update["_rev"] == "4-activity-winner"
    assert activity_update["description"] == "private activity text"
    assert activity_update["categoryId"] == "0dfac102-30f3-56d9-86c0-c3b414aeaf6e"
    completion = next(
        document for document in written if document["_id"] == migration.MIGRATION_COMPLETION_ID
    )
    assert completion["backupChecksum"] == result.backup_checksum


def test_apply_retains_backup_but_aborts_if_a_winning_revision_changes(tmp_path):
    class ChangingCloudant(FakeCloudant):
        reads = 0

        def get_all_documents(self, database: str, *, include_conflicts: bool) -> list[dict]:
            rows = super().get_all_documents(database, include_conflicts=include_conflicts)
            self.reads += 1
            if self.reads == 2:
                rows[0]["_rev"] = "4-concurrent-change"
            return rows

    client = ChangingCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]

    with pytest.raises(migration.MigrationSafetyError, match="revisions changed"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            backup_root=tmp_path,
            timestamp="20260721T120000Z",
        )

    assert client.bulk_calls == []
    assert len(list(tmp_path.iterdir())) == 1


def test_migration_plan_is_idempotent_after_identity_fields_exist():
    first = migration.build_migration_plan(production_winners())
    migrated = []
    updates_by_id = {document["_id"]: document for document in first.updates}
    for document in production_winners():
        migrated.append(copy.deepcopy(updates_by_id.get(document["_id"], document)))

    second = migration.build_migration_plan(migrated)

    assert second.updates == []
    assert second.counts["taxonomyRecordsMigrated"] == 0
    assert second.counts["referencesMigrated"] == 0


def test_apply_is_a_zero_write_noop_after_completed_identity_migration(tmp_path):
    client = FakeCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    first = migration.build_migration_plan(client.winners)
    updates_by_id = {document["_id"]: document for document in first.updates}
    client.winners = [
        copy.deepcopy(updates_by_id.get(document["_id"], document)) for document in client.winners
    ]
    client.winners.append(
        {
            "_id": migration.MIGRATION_COMPLETION_ID,
            "_rev": "1-complete",
            "id": migration.MIGRATION_COMPLETION_ID,
            "docType": "config",
            "migration": "taxonomy-identity-v1",
            "backupChecksum": "a" * 64,
        }
    )

    result = migration.apply_migration(
        client,
        database=migration.EXPECTED_DATABASE_NAME,
        expected_update_seq="42-seq",
        confirmation=migration.EXPECTED_DATABASE_NAME,
        backup_root=tmp_path,
    )

    assert result.mode == "apply"
    assert result.backup_path is None
    assert result.backup_checksum == "a" * 64
    assert client.bulk_calls == []
    assert list(tmp_path.iterdir()) == []


def test_restore_verifies_backup_then_reapplies_winner_content_as_new_revisions(tmp_path):
    client = FakeCloudant()
    backup = migration.create_backup(
        client,
        migration.EXPECTED_DATABASE_NAME,
        client.get_database_info(migration.EXPECTED_DATABASE_NAME),
        client.winners,
        tmp_path,
        timestamp="20260721T120000Z",
    )
    client.bulk_calls.clear()
    current_task_revision = next(d["_rev"] for d in client.winners if d["_id"] == "unsched-legacy")

    result = migration.restore_backup(
        client,
        database=migration.EXPECTED_DATABASE_NAME,
        expected_update_seq="42-seq",
        confirmation=migration.EXPECTED_DATABASE_NAME,
        backup_path=backup.path,
    )

    assert result.mode == "restore"
    restored = [document for batch in client.bulk_calls for document in batch]
    assert len(restored) == len(client.winners)
    original_task = next(d for d in client.winners if d["_id"] == "unsched-legacy")
    restored_task = next(d for d in restored if d["_id"] == "unsched-legacy")
    assert restored_task["description"] == original_task["description"]
    assert restored_task["_rev"] == current_task_revision
    assert all("_conflicts" not in document for document in restored)


def test_backup_must_be_outside_repository(tmp_path):
    repository_backup = Path(__file__).resolve().parents[1] / "unsafe-backups"
    with pytest.raises(migration.MigrationSafetyError, match="outside the repository"):
        migration.validate_backup_root(repository_backup)


def test_cli_rejects_wrong_database_and_never_echoes_credentials(capsys, tmp_path):
    with pytest.raises(migration.MigrationSafetyError, match="unexpected database name"):
        migration.execute(
            ["--database", "dat-411", "--backup-root", str(tmp_path)],
            environ={migration.CREDENTIAL_ENV_VAR: "https://user:super-secret@example.invalid"},
            client_factory=lambda _url: FakeCloudant(),
        )

    assert "super-secret" not in capsys.readouterr().out

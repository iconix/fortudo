"""Safety and invariants for the guarded taxonomy identity migration."""

from __future__ import annotations

import copy
import hashlib
from pathlib import Path

import pytest

from scripts import migrate_taxonomy_identity as migration
from scripts import document_contract_ops as contract_ops


def test_cloudant_account_checksum_excludes_credentials_and_normalizes_host():
    client = migration.CloudantClient(
        "https://operator:private@ACCOUNT.example:443/cloudant/"
    )

    assert client.get_account_checksum() == hashlib.sha256(
        b"https://account.example:443/cloudant"
    ).hexdigest()


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
        self.account_checksum = "a" * 64
        self.winners = production_winners()
        self.leaves = {("activity-legacy", "3-activity-loser"): losing_leaf()}
        self.bulk_calls: list[list[dict]] = []
        self.put_calls: list[dict] = []
        self.tombstone_leaves: list[dict] = []
        self.graph_reads = 0
        self.security = {"admins": {"names": []}, "members": {"names": []}}
        self.validator = contract_ops.load_design_document()
        self.validator["_rev"] = "1-contract"
        self.revision_ancestries = {
            (document["_id"], document["_rev"]): [document["_rev"]]
            for document in [*self.winners, losing_leaf(), self.validator]
        }

    def get_database_info(self, database: str) -> dict:
        return {
            "db_name": database,
            "update_seq": self.update_seq,
            "doc_count": len(self.winners),
            "doc_del_count": 0,
            "props": {"partitioned": False},
        }

    def get_account_checksum(self) -> str:
        return self.account_checksum

    def get_all_documents(self, database: str, *, include_conflicts: bool) -> list[dict]:
        assert include_conflicts is True
        return copy.deepcopy(self.winners)

    def get_revision(self, database: str, document_id: str, revision: str) -> dict:
        return copy.deepcopy(self.leaves[(document_id, revision)])

    def get_document(self, database: str, document_id: str) -> dict | None:
        if document_id == contract_ops.CONTRACT_DESIGN_ID:
            return copy.deepcopy(self.validator)
        return copy.deepcopy(next((d for d in self.winners if d["_id"] == document_id), None))

    def get_security(self, database: str) -> dict:
        return copy.deepcopy(self.security)

    def get_current_leaf_graph(self, database: str) -> tuple[list[dict], dict[str, str]]:
        self.graph_reads += 1
        leaves = [
            {key: copy.deepcopy(value) for key, value in winner.items() if key != "_conflicts"}
            for winner in self.winners
        ]
        leaves.extend(copy.deepcopy(list(self.leaves.values())))
        leaves.extend(copy.deepcopy(self.tombstone_leaves))
        leaves.append(copy.deepcopy(self.validator))
        for leaf in leaves:
            ancestry = self.revision_ancestries.get(
                (leaf["_id"], leaf["_rev"]), [leaf["_rev"]]
            )
            leaf["_revisions"] = {
                "start": int(ancestry[0].split("-", 1)[0]),
                "ids": [revision.split("-", 1)[1] for revision in ancestry],
            }
        winners = {document["_id"]: document["_rev"] for document in self.winners}
        winners[self.validator["_id"]] = self.validator["_rev"]
        return leaves, winners

    def put_document(self, database: str, document: dict) -> dict:
        self.put_calls.append(copy.deepcopy(document))
        stored = copy.deepcopy(document)
        stored["_rev"] = "1-completion"
        self.winners.append(stored)
        self.revision_ancestries[(stored["_id"], stored["_rev"])] = [stored["_rev"]]
        return {"ok": True, "id": document["_id"], "rev": stored["_rev"]}

    def bulk_docs(self, database: str, documents: list[dict]) -> list[dict]:
        self.bulk_calls.append(copy.deepcopy(documents))
        results = []
        for index, document in enumerate(documents):
            document_id = document["_id"]
            pre_revision = document["_rev"]
            generation = int(pre_revision.split("-", 1)[0]) + 1
            new_revision = f"{generation}-next{len(self.bulk_calls)}{index}"
            if document.get("_deleted"):
                winner = next(d for d in self.winners if d["_id"] == document_id)
                winner["_conflicts"] = [
                    revision
                    for revision in winner.get("_conflicts", [])
                    if revision != document["_rev"]
                ]
                if not winner["_conflicts"]:
                    winner.pop("_conflicts")
                self.leaves.pop((document_id, pre_revision), None)
                tombstone = copy.deepcopy(document)
                tombstone["_rev"] = new_revision
                self.tombstone_leaves.append(tombstone)
            else:
                stored = copy.deepcopy(document)
                stored["_rev"] = new_revision
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
            parent_ancestry = self.revision_ancestries[(document_id, pre_revision)]
            self.revision_ancestries[(document_id, new_revision)] = [
                new_revision,
                *parent_ancestry,
            ]
            results.append({"id": document_id, "ok": True, "rev": new_revision})
        return results


def create_s1_snapshot(client: FakeCloudant, root: Path, suffix: str = "120000") -> Path:
    return contract_ops.create_snapshot(
        client,
        database=migration.EXPECTED_DATABASE_NAME,
        backup_root=root,
        label="S1",
        encrypted_volume_confirmed=True,
        timestamp=f"20260721T{suffix}Z",
    ).path


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
    assert migration.EXPECTED_DATABASE_NAME not in output
    assert "dry-run-seq" not in output


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
    assert task_update["writerContract"]["categoryReference"] == {
        "key": "work/meetings",
        "id": task_update["categoryId"],
        "identityVersion": 1,
    }
    assert all(tombstone["writerContract"] == {"version": 1} for tombstone in plan.conflict_tombstones)


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
            snapshot_path=tmp_path / "not-needed-before-sequence-lock",
        )
    assert client.bulk_calls == []
    assert list(tmp_path.iterdir()) == []

    client = FakeCloudant()
    snapshot = create_s1_snapshot(client, tmp_path)
    with pytest.raises(migration.MigrationSafetyError, match="running timer"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            snapshot_path=snapshot,
        )
    assert client.bulk_calls == []


def test_apply_backs_up_before_writes_and_tombstones_only_losing_activity_leaf(tmp_path):
    client = FakeCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    snapshot = create_s1_snapshot(client, tmp_path)

    result = migration.apply_migration(
        client,
        database=migration.EXPECTED_DATABASE_NAME,
        expected_update_seq="42-seq",
        confirmation=migration.EXPECTED_DATABASE_NAME,
        snapshot_path=snapshot,
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
            "writerContract": {"version": 1},
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
    assert all(document["_id"] != migration.MIGRATION_COMPLETION_ID for document in written)
    completion = client.put_calls[-1]
    assert completion["_id"] == migration.MIGRATION_COMPLETION_ID
    assert completion["s1SnapshotChecksum"] == result.backup_checksum
    assert len(completion["verifiedStateFingerprint"]) == 64
    assert completion["writerContract"] == {"version": 1, "categoryReference": None}


@pytest.mark.parametrize("drift", ["account", "security", "leaf", "winner"])
def test_apply_binds_every_live_precondition_to_the_complete_s1_snapshot(tmp_path, drift):
    client = FakeCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    snapshot = create_s1_snapshot(client, tmp_path)

    if drift == "account":
        client.account_checksum = "b" * 64
    elif drift == "security":
        client.security["members"]["names"] = ["changed"]
    elif drift == "leaf":
        extra = {"_id": "task-concurrent", "_rev": "1-concurrent", "docType": "task"}
        client.winners.append(extra)
        client.revision_ancestries[(extra["_id"], extra["_rev"])] = [extra["_rev"]]
    else:
        client.winners[0]["_rev"] = "4-concurrent"

    with pytest.raises(migration.MigrationSafetyError, match="complete S1 snapshot"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            snapshot_path=snapshot,
        )

    assert client.bulk_calls == []
    assert client.put_calls == []


def test_apply_retains_backup_but_aborts_if_a_winning_revision_changes(tmp_path):
    class ChangingCloudant(FakeCloudant):
        graph_reads = 0

        def get_current_leaf_graph(self, database: str):
            leaves, winners = super().get_current_leaf_graph(database)
            if self.graph_reads == 4:
                leaves[0]["_rev"] = "4-concurrent-change"
            return leaves, winners

    client = ChangingCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    snapshot = create_s1_snapshot(client, tmp_path)

    with pytest.raises(migration.MigrationSafetyError, match="complete S1 snapshot"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            snapshot_path=snapshot,
            timestamp="20260721T120000Z",
        )

    assert client.bulk_calls == []
    assert len(list(tmp_path.iterdir())) == 2


def test_apply_rejects_unrelated_valid_write_that_races_with_journal_application(tmp_path):
    class ConcurrentInsertCloudant(FakeCloudant):
        inserted = False

        def bulk_docs(self, database: str, documents: list[dict]) -> list[dict]:
            result = super().bulk_docs(database, documents)
            if not self.inserted:
                self.inserted = True
                concurrent = {
                    "_id": "task-concurrent",
                    "_rev": "1-concurrent",
                    "id": "task-concurrent",
                    "docType": "task",
                    "type": "unscheduled",
                    "description": "valid concurrent writer",
                    "category": None,
                    "categoryId": None,
                    "categoryIdentityVersion": None,
                    "writerContract": {"version": 1, "categoryReference": None},
                }
                self.winners.append(concurrent)
                self.revision_ancestries[(concurrent["_id"], concurrent["_rev"])] = [
                    concurrent["_rev"]
                ]
            return result

    client = ConcurrentInsertCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    snapshot = create_s1_snapshot(client, tmp_path)

    with pytest.raises(migration.MigrationSafetyError, match="unrelated changes"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            snapshot_path=snapshot,
            timestamp="20260721T120000Z",
        )

    assert client.put_calls == []


def test_apply_rechecks_security_after_journal_application(tmp_path):
    class SecurityDriftCloudant(FakeCloudant):
        drifted = False

        def bulk_docs(self, database: str, documents: list[dict]) -> list[dict]:
            result = super().bulk_docs(database, documents)
            if not self.drifted:
                self.drifted = True
                self.security["members"]["names"] = ["concurrent-change"]
            return result

    client = SecurityDriftCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    snapshot = create_s1_snapshot(client, tmp_path)

    with pytest.raises(migration.MigrationSafetyError, match="complete S1 snapshot"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            snapshot_path=snapshot,
            timestamp="20260721T120000Z",
        )

    assert client.put_calls == []


def test_apply_rechecks_security_after_completion_marker(tmp_path):
    class PostMarkerSecurityDriftCloudant(FakeCloudant):
        def put_document(self, database: str, document: dict) -> dict:
            result = super().put_document(database, document)
            self.security["members"]["names"] = ["post-marker-change"]
            return result

    client = PostMarkerSecurityDriftCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    snapshot = create_s1_snapshot(client, tmp_path)

    with pytest.raises(migration.MigrationSafetyError, match="complete S1 snapshot"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            snapshot_path=snapshot,
            timestamp="20260721T120000Z",
        )

    assert client.put_calls[-1]["_id"] == migration.MIGRATION_COMPLETION_ID


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


def test_existing_completion_marker_requires_manual_verified_state_review(tmp_path):
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
    snapshot = create_s1_snapshot(client, tmp_path)

    with pytest.raises(migration.MigrationSafetyError, match="manual verification"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            snapshot_path=snapshot,
        )

    assert client.bulk_calls == []
    assert client.put_calls == []


def test_direct_production_restore_is_disabled_in_favor_of_quarantine(tmp_path):
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
    with pytest.raises(migration.MigrationSafetyError, match="quarantine"):
        migration.restore_backup(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            backup_path=backup.path,
        )

    assert client.bulk_calls == []


def test_journal_classifies_partial_results_and_resumes_only_locked_pre_states(tmp_path):
    class PartialCloudant(FakeCloudant):
        first_attempt = True

        def bulk_docs(self, database: str, documents: list[dict]) -> list[dict]:
            if self.first_attempt:
                self.first_attempt = False
                committed = super().bulk_docs(database, documents[:1])
                return [*committed, *({"error": "forbidden"} for _ in documents[1:])]
            return super().bulk_docs(database, documents)

    client = PartialCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    plan = migration.build_migration_plan(client.winners)
    writes = [*plan.updates, *plan.conflict_tombstones]
    journal = migration.create_migration_journal(
        writes, tmp_path, timestamp="20260721T120000Z"
    )

    with pytest.raises(migration.MigrationSafetyError, match="safe to resume"):
        migration.apply_or_resume_journal(
            client, database=migration.EXPECTED_DATABASE_NAME, journal_path=journal
        )

    result = migration.apply_or_resume_journal(
        client, database=migration.EXPECTED_DATABASE_NAME, journal_path=journal
    )
    assert result["exactIntendedResults"] == len(writes)
    assert result["resumedPreStates"] == len(writes) - 1
    assert client.graph_reads == 4


def test_apply_migration_resumes_only_s1_or_ancestry_proven_partial_state(tmp_path):
    class PartialCloudant(FakeCloudant):
        first_attempt = True

        def bulk_docs(self, database: str, documents: list[dict]) -> list[dict]:
            if self.first_attempt:
                self.first_attempt = False
                committed = super().bulk_docs(database, documents[:1])
                return [*committed, *({"error": "forbidden"} for _ in documents[1:])]
            return super().bulk_docs(database, documents)

    client = PartialCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    snapshot = create_s1_snapshot(client, tmp_path)
    plan = migration.build_migration_plan(client.winners)
    journal = migration.create_migration_journal(
        [*plan.updates, *plan.conflict_tombstones],
        tmp_path,
        timestamp="20260721T120001Z",
    )

    with pytest.raises(migration.MigrationSafetyError, match="safe to resume"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            snapshot_path=snapshot,
            journal_path=journal,
            timestamp="20260721T120002Z",
        )

    result = migration.apply_migration(
        client,
        database=migration.EXPECTED_DATABASE_NAME,
        expected_update_seq="42-seq",
        confirmation=migration.EXPECTED_DATABASE_NAME,
        snapshot_path=snapshot,
        journal_path=journal,
        timestamp="20260721T120002Z",
    )

    assert result.mode == "apply"
    assert client.put_calls[-1]["_id"] == migration.MIGRATION_COMPLETION_ID


def test_completion_intent_resume_reuses_original_timestamp_after_marker_crash(tmp_path):
    class MarkerCrashCloudant(FakeCloudant):
        fail_marker_once = True

        def put_document(self, database: str, document: dict) -> dict:
            if document.get("_id") == migration.MIGRATION_COMPLETION_ID and self.fail_marker_once:
                self.fail_marker_once = False
                raise migration.MigrationSafetyError("simulated marker crash")
            return super().put_document(database, document)

    client = MarkerCrashCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    snapshot = create_s1_snapshot(client, tmp_path)
    plan = migration.build_migration_plan(client.winners)
    journal = migration.create_migration_journal(
        [*plan.updates, *plan.conflict_tombstones],
        tmp_path,
        timestamp="20260721T120001Z",
    )

    with pytest.raises(migration.MigrationSafetyError, match="simulated marker crash"):
        migration.apply_migration(
            client,
            database=migration.EXPECTED_DATABASE_NAME,
            expected_update_seq="42-seq",
            confirmation=migration.EXPECTED_DATABASE_NAME,
            snapshot_path=snapshot,
            journal_path=journal,
            timestamp="20260721T120002Z",
        )

    result = migration.apply_migration(
        client,
        database=migration.EXPECTED_DATABASE_NAME,
        expected_update_seq="42-seq",
        confirmation=migration.EXPECTED_DATABASE_NAME,
        snapshot_path=snapshot,
        journal_path=journal,
        timestamp="20260722T090000Z",
    )

    assert result.mode == "apply"
    assert client.put_calls[-1]["completedAt"] == "20260721T120002Z"


def test_journal_rejects_matching_body_without_locked_pre_revision_ancestry(tmp_path):
    client = FakeCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    plan = migration.build_migration_plan(client.winners)
    journal = migration.create_migration_journal(
        plan.updates, tmp_path, timestamp="20260721T120000Z"
    )
    intended = copy.deepcopy(plan.updates[0])
    pre_revision = intended["_rev"]
    generation = int(pre_revision.split("-", 1)[0]) + 1
    wrong_revision = f"{generation}-wrongbranch"
    intended["_rev"] = wrong_revision
    winner_index = next(
        index for index, winner in enumerate(client.winners) if winner["_id"] == intended["_id"]
    )
    client.winners[winner_index] = intended
    client.revision_ancestries[(intended["_id"], wrong_revision)] = [
        wrong_revision,
        f"{generation - 1}-differentparent",
    ]

    with pytest.raises(migration.MigrationSafetyError, match="divergent state"):
        migration.apply_or_resume_journal(
            client, database=migration.EXPECTED_DATABASE_NAME, journal_path=journal
        )


def test_journal_halts_on_divergent_remote_state(tmp_path):
    client = FakeCloudant()
    client.winners = [
        document for document in client.winners if document["_id"] != "config-running-activity"
    ]
    plan = migration.build_migration_plan(client.winners)
    journal = migration.create_migration_journal(
        plan.updates, tmp_path, timestamp="20260721T120000Z"
    )
    client.winners[0]["_rev"] = "4-concurrent"
    client.winners[0]["label"] = "concurrent semantic change"

    with pytest.raises(migration.MigrationSafetyError, match="divergent state"):
        migration.apply_or_resume_journal(
            client, database=migration.EXPECTED_DATABASE_NAME, journal_path=journal
        )


def test_backup_must_be_outside_repository(tmp_path):
    repository_backup = Path(__file__).resolve().parents[1] / "unsafe-backups"
    with pytest.raises(migration.MigrationSafetyError, match="outside the repository"):
        migration.validate_backup_root(repository_backup)


def test_private_artifact_path_must_remain_a_direct_child(tmp_path):
    root = tmp_path.resolve()

    assert migration._exact_artifact_path(root, "snapshot-S0").parent == root
    with pytest.raises(migration.MigrationSafetyError, match="escaped"):
        migration._exact_artifact_path(root, "../escaped")
    with pytest.raises(migration.MigrationSafetyError, match="unverified"):
        migration._remove_exact_artifact(root.parent, root)


def test_cli_rejects_wrong_database_and_never_echoes_credentials(capsys, tmp_path):
    with pytest.raises(migration.MigrationSafetyError, match="unexpected database name"):
        migration.execute(
            ["--database", "dat-411", "--backup-root", str(tmp_path)],
            environ={migration.CREDENTIAL_ENV_VAR: "https://user:super-secret@example.invalid"},
            client_factory=lambda _url: FakeCloudant(),
        )

    assert "super-secret" not in capsys.readouterr().out

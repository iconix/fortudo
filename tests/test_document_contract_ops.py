"""Safety gates for document-contract provisioning and complete-leaf snapshots."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

from scripts import document_contract_ops as ops


def test_runbook_direct_cli_entry_point_loads_from_any_working_directory(tmp_path) -> None:
    script = Path(ops.__file__).resolve()

    result = subprocess.run(
        [sys.executable, str(script), "--help"],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "inventory" in result.stdout
    assert "restore-quarantine" in result.stdout


class FakeCloudant:
    def __init__(self) -> None:
        self.database = "fortudo-dat-411"
        self.info = {
            "db_name": self.database,
            "update_seq": "10-seq",
            "doc_count": 2,
            "doc_del_count": 1,
            "props": {"partitioned": False},
        }
        self.security = {"admins": {"names": []}, "members": {"names": []}}
        self.leaves = [
            {
                "_id": "task-live",
                "_rev": "2-live",
                "_revisions": {"start": 2, "ids": ["live", "parent"]},
                "docType": "task",
                "private": "never print",
            },
            {
                "_id": "activity-conflict",
                "_rev": "3-winner",
                "_revisions": {"start": 3, "ids": ["winner", "p2", "p1"]},
                "docType": "activity",
            },
            {
                "_id": "activity-conflict",
                "_rev": "3-loser",
                "_revisions": {"start": 3, "ids": ["loser", "p2", "p1"]},
                "docType": "activity",
            },
            {
                "_id": "task-deleted",
                "_rev": "2-deleted",
                "_deleted": True,
                "_revisions": {"start": 2, "ids": ["deleted", "parent"]},
                "writerContract": {"version": 1},
            },
        ]
        self.winners = {
            "task-live": "2-live",
            "activity-conflict": "3-winner",
            "task-deleted": "2-deleted",
        }
        self.created: list[str] = []
        self.write_order: list[str] = []
        self.account_checksum = "a" * 64

    def get_account_checksum(self) -> str:
        return self.account_checksum

    def list_databases(self) -> list[str]:
        return [self.database, "fortudo-family", "system-database"]

    def get_database_info(self, database: str) -> dict:
        result = copy.deepcopy(self.info)
        result["db_name"] = database
        return result

    def get_security(self, database: str) -> dict:
        return copy.deepcopy(self.security)

    def put_security(self, database: str, security: dict) -> None:
        self.write_order.append("_security")
        self.security = copy.deepcopy(security)

    def get_current_leaf_graph(self, database: str) -> tuple[list[dict], dict[str, str]]:
        return copy.deepcopy(self.leaves), copy.deepcopy(self.winners)

    def get_document(self, database: str, document_id: str) -> dict | None:
        return next(
            (copy.deepcopy(leaf) for leaf in self.leaves if leaf["_id"] == document_id),
            None,
        )

    def put_document(self, database: str, document: dict) -> dict:
        self.write_order.append(document["_id"])
        stored = copy.deepcopy(document)
        stored["_rev"] = "1-contract"
        self.leaves = [leaf for leaf in self.leaves if leaf["_id"] != document["_id"]]
        self.leaves.append(stored)
        self.winners[document["_id"]] = stored["_rev"]
        self.info["update_seq"] = "11-seq"
        self.info["doc_count"] += 1
        return {"ok": True, "id": document["_id"], "rev": stored["_rev"]}

    def create_database(self, database: str) -> None:
        self.created.append(database)
        self.database = database
        self.info = {
            "db_name": database,
            "update_seq": "0-seq",
            "doc_count": 0,
            "doc_del_count": 0,
            "props": {"partitioned": False},
        }
        self.leaves = []
        self.winners = {}

    def bulk_docs_new_edits_false(self, database: str, documents: list[dict]) -> None:
        self.write_order.extend(document["_id"] for document in documents)
        self.leaves.extend(copy.deepcopy(documents))
        for document in documents:
            self.winners.setdefault(document["_id"], document["_rev"])
        self.info["doc_count"] = len(self.winners)
        self.info["update_seq"] = "restored-seq"


def test_design_document_source_and_checksum_match_the_browser_contract():
    design = ops.load_design_document()

    assert design["_id"] == "_design/fortudo-document-contract"
    assert design["fortudoDocumentContract"] == {
        "version": 1,
        "checksum": "c0bf4717ff74c9daa32b850b059df95a45f2156b3491c91f5c658990c0e26a75",
    }
    assert "FDC_CONTRACT_VERSION" in design["validate_doc_update"]


def test_snapshot_captures_complete_leaf_graph_security_and_stable_winners(tmp_path):
    client = FakeCloudant()

    result = ops.create_snapshot(
        client,
        database=client.database,
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=True,
        timestamp="20260721T120000Z",
    )

    manifest = ops.verify_snapshot(result.path)
    assert manifest["label"] == "S0"
    assert manifest["formatVersion"] == 2
    assert manifest["leafCount"] == 4
    assert manifest["winnerCount"] == 3
    assert "databaseUuid" not in manifest
    assert manifest["targetBinding"]["accountChecksum"] == "a" * 64
    assert manifest["targetBinding"]["databaseName"] == "fortudo-dat-411"
    assert len(manifest["targetBinding"]["checksum"]) == 64
    assert manifest["securityChecksum"] == ops.security_checksum(client.security)
    assert manifest["manifestChecksum"] == result.checksum
    leaf_text = (result.path / "leaf-graph.ndjson").read_text(encoding="utf-8")
    assert "never print" in leaf_text
    metadata = json.loads((result.path / "database-metadata.json").read_text(encoding="utf-8"))
    assert "databaseUuid" not in metadata


def test_target_binding_is_semantic_and_independent_of_leaf_enumeration_order():
    client = FakeCloudant()
    leaves, winners = client.get_current_leaf_graph(client.database)
    info = client.get_database_info(client.database)

    first = ops.capture_target_binding(
        client,
        database=client.database,
        info=info,
        security=client.security,
        leaves=leaves,
        winners=winners,
    )
    second = ops.capture_target_binding(
        client,
        database=client.database,
        info=info,
        security=client.security,
        leaves=list(reversed(leaves)),
        winners=dict(reversed(list(winners.items()))),
    )

    assert first == second


def test_snapshot_deletes_incomplete_output_and_halts_on_leaf_drift(tmp_path):
    class DriftingCloudant(FakeCloudant):
        reads = 0

        def get_current_leaf_graph(self, database: str):
            leaves, winners = super().get_current_leaf_graph(database)
            self.reads += 1
            if self.reads == 2:
                leaves[0]["_rev"] = "3-concurrent"
            return leaves, winners

    with pytest.raises(ops.ContractOpsSafetyError, match="changed during snapshot"):
        ops.create_snapshot(
            DriftingCloudant(),
            database="fortudo-dat-411",
            backup_root=tmp_path,
            label="S0",
            encrypted_volume_confirmed=True,
            timestamp="20260721T120000Z",
        )

    assert list(tmp_path.iterdir()) == []


def test_snapshot_halts_if_the_cloudant_account_binding_changes_during_capture(tmp_path):
    class AccountDriftCloudant(FakeCloudant):
        account_reads = 0

        def get_account_checksum(self) -> str:
            self.account_reads += 1
            return ("a" if self.account_reads == 1 else "b") * 64

    with pytest.raises(ops.ContractOpsSafetyError, match="changed during snapshot"):
        ops.create_snapshot(
            AccountDriftCloudant(),
            database="fortudo-dat-411",
            backup_root=tmp_path,
            label="S0",
            encrypted_volume_confirmed=True,
            timestamp="20260721T120000Z",
        )

    assert list(tmp_path.iterdir()) == []


def test_install_requires_locked_snapshot_and_changes_only_the_design_leaf(tmp_path):
    client = FakeCloudant()
    snapshot = ops.create_snapshot(
        client,
        database=client.database,
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=True,
        timestamp="20260721T120000Z",
    )

    result = ops.install_validator(
        client,
        database=client.database,
        confirmation=client.database,
        expected_target_binding_checksum=ops.verify_snapshot(snapshot.path)[
            "targetBinding"
        ]["checksum"],
        snapshot_path=snapshot.path,
    )

    assert result["validatorRevision"] == "1-contract"
    assert client.write_order == ["_design/fortudo-document-contract"]
    assert ops.verify_validator(client, client.database)["state"] == "compatible"


@pytest.mark.parametrize("drift", ["account", "security", "body", "winner"])
def test_install_rejects_any_state_outside_the_locked_target_binding(tmp_path, drift):
    client = FakeCloudant()
    snapshot = ops.create_snapshot(
        client,
        database=client.database,
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=True,
        timestamp="20260721T120000Z",
    )
    manifest = ops.verify_snapshot(snapshot.path)

    if drift == "account":
        client.account_checksum = "b" * 64
    elif drift == "security":
        client.security["members"]["names"] = ["changed"]
    elif drift == "body":
        client.leaves[0]["private"] = "changed under the same revision"
    else:
        client.winners["activity-conflict"] = "3-loser"

    with pytest.raises(ops.ContractOpsSafetyError, match="locked snapshot"):
        ops.install_validator(
            client,
            database=client.database,
            confirmation=client.database,
            expected_target_binding_checksum=manifest["targetBinding"]["checksum"],
            snapshot_path=snapshot.path,
        )

    assert client.write_order == []


def test_provision_is_empty_database_and_validator_first():
    client = FakeCloudant()

    result = ops.provision_database(
        client,
        database="fortudo-new-room",
        confirmation="fortudo-new-room",
        expected_account_checksum="a" * 64,
    )

    assert client.created == ["fortudo-new-room"]
    assert client.write_order == ["_design/fortudo-document-contract"]
    assert result["targetAccountChecksum"] == "a" * 64


def test_provision_rejects_the_wrong_account_before_database_creation():
    client = FakeCloudant()

    with pytest.raises(ops.ContractOpsSafetyError, match="approved Cloudant account"):
        ops.provision_database(
            client,
            database="fortudo-new-room",
            confirmation="fortudo-new-room",
            expected_account_checksum="b" * 64,
        )

    assert client.created == []


def test_quarantine_restore_loads_legacy_leaves_before_validator(tmp_path):
    source = FakeCloudant()
    snapshot = ops.create_snapshot(
        source,
        database=source.database,
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=True,
        timestamp="20260721T120000Z",
    )
    target = FakeCloudant()
    target.write_order.clear()

    ops.restore_quarantine(
        target,
        database="fortudo-quarantine-20260721",
        confirmation="fortudo-quarantine-20260721",
        expected_account_checksum="a" * 64,
        snapshot_path=snapshot.path,
    )

    assert target.created == ["fortudo-quarantine-20260721"]
    assert target.write_order[-2:] == ["_design/fortudo-document-contract", "_security"]
    assert "task-live" in target.write_order[:-2]
    assert target.security == source.security


def test_quarantine_restore_halts_before_validator_when_leaf_reconstruction_differs(tmp_path):
    source = FakeCloudant()
    snapshot = ops.create_snapshot(
        source,
        database=source.database,
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=True,
        timestamp="20260721T120000Z",
    )

    class CorruptingTarget(FakeCloudant):
        def bulk_docs_new_edits_false(self, database: str, documents: list[dict]) -> None:
            super().bulk_docs_new_edits_false(database, documents)
            self.leaves[0]["private"] = "corrupted"

    target = CorruptingTarget()
    target.write_order.clear()
    with pytest.raises(ops.ContractOpsSafetyError, match="reconstruction verification"):
        ops.restore_quarantine(
            target,
            database="fortudo-quarantine-20260721",
            confirmation="fortudo-quarantine-20260721",
            expected_account_checksum="a" * 64,
            snapshot_path=snapshot.path,
        )

    assert "_design/fortudo-document-contract" not in target.write_order


def test_quarantine_restore_rejects_snapshot_from_an_unapproved_account_before_creation(
    tmp_path,
):
    source = FakeCloudant()
    snapshot = ops.create_snapshot(
        source,
        database=source.database,
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=True,
        timestamp="20260721T120000Z",
    )
    target = FakeCloudant()
    target.account_checksum = "b" * 64

    with pytest.raises(ops.ContractOpsSafetyError, match="snapshot Cloudant account"):
        ops.restore_quarantine(
            target,
            database="fortudo-quarantine-20260721",
            confirmation="fortudo-quarantine-20260721",
            expected_account_checksum="b" * 64,
            snapshot_path=snapshot.path,
        )

    assert target.created == []


def test_quarantine_restore_rejects_wrong_active_account_before_database_creation(tmp_path):
    source = FakeCloudant()
    snapshot = ops.create_snapshot(
        source,
        database=source.database,
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=True,
        timestamp="20260721T120000Z",
    )
    target = FakeCloudant()
    target.account_checksum = "b" * 64

    with pytest.raises(ops.ContractOpsSafetyError, match="approved Cloudant account"):
        ops.restore_quarantine(
            target,
            database="fortudo-quarantine-20260721",
            confirmation="fortudo-quarantine-20260721",
            expected_account_checksum="a" * 64,
            snapshot_path=snapshot.path,
        )

    assert target.created == []


def test_inventory_writes_private_manifest_but_returns_only_aggregates(tmp_path):
    client = FakeCloudant()

    result = ops.create_inventory(
        client,
        manifest_root=tmp_path,
        encrypted_volume_confirmed=True,
        timestamp="20260721T120000Z",
    )

    assert result.counts == {"fortudoDatabases": 2, "compatible": 0, "missingValidator": 2}
    assert len(result.checksum) == 64
    assert result.account_checksum == "a" * 64
    private = json.loads(result.path.read_text(encoding="utf-8"))
    assert private["accountChecksum"] == "a" * 64
    assert [row["databaseName"] for row in private["databases"]] == [
        "fortudo-dat-411",
        "fortudo-family",
    ]
    assert all("databaseUuid" not in row for row in private["databases"])
    assert all(row["accountChecksum"] == "a" * 64 for row in private["databases"])


def test_install_cli_uses_target_binding_and_has_no_uuid_override():
    parser = ops._parser()
    commands = parser._subparsers._group_actions[0].choices
    install_parser = commands["install"]
    provision_parser = commands["provision"]
    quarantine_parser = commands["restore-quarantine"]
    help_text = parser.format_help() + install_parser.format_help()

    assert "--expected-target-binding-checksum" in help_text
    assert "--expected-account-checksum" in provision_parser.format_help()
    assert "--expected-account-checksum" in quarantine_parser.format_help()
    assert "--expected-uuid" not in help_text


def test_normal_operational_output_omits_private_targets_revisions_and_paths():
    report = ops._public_operational_report(
        {
            "mode": "inventory",
            "counts": {"fortudoDatabases": 2},
            "manifestChecksum": "a" * 64,
            "manifestPath": "X:/private/manifest.json",
            "targetBindingChecksum": "b" * 64,
            "validatorRevision": "1-private",
        }
    )

    assert report == {
        "mode": "inventory",
        "counts": {"fortudoDatabases": 2},
        "manifestChecksum": "a" * 64,
        "targetBindingChecksum": "b" * 64,
    }


def test_encrypted_volume_confirmation_and_exact_target_are_mandatory(tmp_path):
    client = FakeCloudant()
    with pytest.raises(ops.ContractOpsSafetyError, match="encrypted user-only volume"):
        ops.create_snapshot(
            client,
            database=client.database,
            backup_root=tmp_path,
            label="S0",
            encrypted_volume_confirmed=False,
        )
    with pytest.raises(ops.ContractOpsSafetyError, match="confirmation"):
        ops.provision_database(
            client,
            database="fortudo-new-room",
            confirmation="wrong",
            expected_account_checksum="a" * 64,
        )
    with pytest.raises(ops.ContractOpsSafetyError, match="unsafe characters"):
        ops.create_snapshot(
            client,
            database=client.database,
            backup_root=tmp_path,
            label="../escaped",
            encrypted_volume_confirmed=True,
        )
    assert list(tmp_path.iterdir()) == []


def test_temporary_unencrypted_override_is_explicit_and_recorded(tmp_path):
    client = FakeCloudant()

    snapshot = ops.create_snapshot(
        client,
        database=client.database,
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=False,
        temporary_unencrypted_confirmed=True,
        timestamp="20260722T170000Z",
    )
    manifest = ops.verify_snapshot(snapshot.path)

    assert manifest["backupProtection"] == {
        "mode": "temporary-unencrypted-user-only-directory",
        "retention": "delete-after-s3-and-known-client-exercise",
    }

    inventory = ops.create_inventory(
        client,
        manifest_root=tmp_path,
        encrypted_volume_confirmed=False,
        temporary_unencrypted_confirmed=True,
        timestamp="20260722T170001Z",
    )
    inventory_manifest = json.loads(inventory.path.read_text(encoding="utf-8"))
    assert inventory_manifest["backupProtection"] == manifest["backupProtection"]


@pytest.mark.parametrize(
    "invalid_protection",
    [
        None,
        {"mode": "unknown"},
        {
            "mode": "temporary-unencrypted-user-only-directory",
            "retention": "keep-indefinitely",
        },
        {"mode": "encrypted-user-only-volume", "extra": True},
    ],
)
def test_snapshot_verification_rejects_rechecksummed_invalid_backup_protection(
    tmp_path, invalid_protection
):
    client = FakeCloudant()
    snapshot = ops.create_snapshot(
        client,
        database=client.database,
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=True,
        timestamp="20260722T170000Z",
    )
    manifest_path = snapshot.path / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if invalid_protection is None:
        manifest.pop("backupProtection")
    else:
        manifest["backupProtection"] = invalid_protection
    manifest["manifestChecksum"] = ops._manifest_checksum(manifest)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(ops.ContractOpsSafetyError, match="backup protection"):
        ops.verify_snapshot(snapshot.path)


def test_snapshot_verification_rejects_rechecksummed_target_binding_tamper(tmp_path):
    snapshot = ops.create_snapshot(
        FakeCloudant(),
        database="fortudo-dat-411",
        backup_root=tmp_path,
        label="S0",
        encrypted_volume_confirmed=True,
        timestamp="20260722T170000Z",
    )
    manifest_path = snapshot.path / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["targetBinding"]["scheme"] = "unreviewed-binding"
    manifest["manifestChecksum"] = ops._manifest_checksum(manifest)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(ops.ContractOpsSafetyError, match="target binding"):
        ops.verify_snapshot(snapshot.path)


def test_backup_protection_modes_are_mutually_exclusive_for_programmatic_callers(tmp_path):
    client = FakeCloudant()

    with pytest.raises(ops.ContractOpsSafetyError, match="exactly one"):
        ops.create_snapshot(
            client,
            database=client.database,
            backup_root=tmp_path,
            label="S0",
            encrypted_volume_confirmed=True,
            temporary_unencrypted_confirmed=True,
        )

    assert list(tmp_path.iterdir()) == []

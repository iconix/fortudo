"""Guarded Cloudant document-contract inventory, snapshots, and provisioning.

Normal output contains aggregate counts and hashes only. Snapshot and inventory
manifests are private artifacts and may contain database identities and leaf
metadata; document bodies are never printed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.parse
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping, Sequence

from scripts.migrate_taxonomy_identity import (
    CREDENTIAL_ENV_VAR,
    CloudantClient,
    _canonical_json,
    _exact_artifact_path,
    _remove_exact_artifact,
    _secure_backup_directory,
    _write_secure,
    validate_backup_root,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_MODULE = REPOSITORY_ROOT / "public" / "js" / "document-contract.js"
CONTRACT_DESIGN_ID = "_design/fortudo-document-contract"
CONTRACT_VERSION = 1


class ContractOpsSafetyError(RuntimeError):
    """Raised before or during a guarded operation when a gate does not hold."""


@dataclass(frozen=True)
class SnapshotResult:
    path: Path
    checksum: str


@dataclass(frozen=True)
class InventoryResult:
    path: Path
    checksum: str
    counts: dict[str, int]


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def security_checksum(security: Mapping[str, Any]) -> str:
    return _sha256_bytes(_canonical_json(security).encode("utf-8"))


def _require_encrypted_volume(confirmed: bool) -> None:
    if not confirmed:
        raise ContractOpsSafetyError("an encrypted user-only volume must be confirmed")


def _require_database_name(database: str) -> None:
    if not re.fullmatch(r"fortudo-[a-z0-9][a-z0-9-]*", database):
        raise ContractOpsSafetyError("database name is outside the Fortudo namespace")


def _require_confirmation(database: str, confirmation: str) -> None:
    if confirmation != database:
        raise ContractOpsSafetyError("typed database confirmation did not match")


def _require_artifact_label(label: str) -> None:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", label):
        raise ContractOpsSafetyError("snapshot label contains unsafe characters")


def _extract_validator_source(module_source: str) -> str:
    start = module_source.index("function cloudantValidateDocUpdate")
    marker = "\n}\n\n/**\n * Add persistence metadata"
    end = module_source.index(marker, start) + 2
    return module_source[start:end].replace(
        "function cloudantValidateDocUpdate", "function", 1
    )


def load_design_document() -> dict[str, Any]:
    try:
        module_source = CONTRACT_MODULE.read_text(encoding="utf-8")
        validator_source = _extract_validator_source(module_source)
    except (OSError, ValueError) as error:
        raise ContractOpsSafetyError("contract source is unreadable") from error

    checksum = _sha256_bytes(validator_source.encode("utf-8"))
    declared_match = re.search(
        r"DOCUMENT_CONTRACT_CHECKSUM\s*=\s*\n?\s*'([a-f0-9]{64})'", module_source
    )
    if not declared_match or declared_match.group(1) != checksum:
        raise ContractOpsSafetyError("contract source checksum does not match its declaration")
    return {
        "_id": CONTRACT_DESIGN_ID,
        "language": "javascript",
        "fortudoDocumentContract": {"version": CONTRACT_VERSION, "checksum": checksum},
        "validate_doc_update": validator_source,
    }


def _leaf_identity(leaf: Mapping[str, Any]) -> tuple[str, str, bool]:
    document_id = leaf.get("_id")
    revision = leaf.get("_rev")
    if not isinstance(document_id, str) or not isinstance(revision, str):
        raise ContractOpsSafetyError("leaf graph contains an invalid identity")
    return document_id, revision, bool(leaf.get("_deleted"))


def _leaf_set(leaves: Sequence[Mapping[str, Any]]) -> list[tuple[str, str, bool]]:
    identities = [_leaf_identity(leaf) for leaf in leaves]
    if len(identities) != len(set(identities)):
        raise ContractOpsSafetyError("leaf graph contains duplicate identities")
    return sorted(identities)


def _ndjson_bytes(rows: Sequence[Mapping[str, Any]]) -> bytes:
    if not rows:
        return b""
    return ("\n".join(_canonical_json(row) for row in rows) + "\n").encode("utf-8")


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ContractOpsSafetyError("private artifact is unreadable") from error


def _read_ndjson(path: Path) -> list[dict[str, Any]]:
    try:
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
    except (OSError, json.JSONDecodeError) as error:
        raise ContractOpsSafetyError("snapshot leaf graph is unreadable") from error


def _manifest_checksum(manifest: Mapping[str, Any]) -> str:
    unsigned = dict(manifest)
    unsigned.pop("manifestChecksum", None)
    return _sha256_bytes(_canonical_json(unsigned).encode("utf-8"))


def create_snapshot(
    client: Any,
    *,
    database: str,
    backup_root: str | Path,
    label: str,
    encrypted_volume_confirmed: bool,
    timestamp: str | None = None,
) -> SnapshotResult:
    _require_database_name(database)
    _require_encrypted_volume(encrypted_volume_confirmed)
    _require_artifact_label(label)
    root = validate_backup_root(backup_root)
    timestamp = timestamp or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    path = _exact_artifact_path(root, f"fortudo-contract-{label}-{timestamp}")

    info_before = client.get_database_info(database)
    if info_before.get("db_name") != database or not isinstance(info_before.get("uuid"), str):
        raise ContractOpsSafetyError("database identity metadata is incomplete")
    security_before = client.get_security(database)
    leaves, winners = client.get_current_leaf_graph(database)
    leaf_identities = _leaf_set(leaves)
    if not isinstance(winners, Mapping):
        raise ContractOpsSafetyError("winner metadata is invalid")

    try:
        path.mkdir(parents=True, mode=0o700)
        _secure_backup_directory(path)
    except FileExistsError as error:
        raise ContractOpsSafetyError("snapshot directory already exists") from error
    except Exception:
        _remove_exact_artifact(path, root)
        raise

    try:
        leaf_bytes = _ndjson_bytes(leaves)
        security_bytes = (json.dumps(security_before, indent=2, sort_keys=True) + "\n").encode()
        metadata = {
            "databaseName": database,
            "databaseUuid": info_before["uuid"],
            "databaseUpdateSeq": info_before.get("update_seq"),
            "docCount": info_before.get("doc_count"),
            "deletedDocCount": info_before.get("doc_del_count"),
            "partitioned": bool(info_before.get("props", {}).get("partitioned", False)),
        }
        metadata_bytes = (json.dumps(metadata, indent=2, sort_keys=True) + "\n").encode()
        design_leaf = next(
            (leaf for leaf in leaves if leaf.get("_id") == CONTRACT_DESIGN_ID), None
        )
        manifest_base = {
            "formatVersion": 1,
            "label": label,
            "createdAt": timestamp,
            **metadata,
            "leafCount": len(leaves),
            "winnerCount": len(winners),
            "winnerRevisions": dict(sorted(winners.items())),
            "leafIdentities": [list(identity) for identity in leaf_identities],
            "securityChecksum": security_checksum(security_before),
            "validatorRevision": design_leaf.get("_rev") if design_leaf else None,
            "validatorChecksum": design_leaf.get("fortudoDocumentContract", {}).get("checksum")
            if design_leaf
            else None,
            "files": {
                "leaf-graph.ndjson": _sha256_bytes(leaf_bytes),
                "security.json": _sha256_bytes(security_bytes),
                "database-metadata.json": _sha256_bytes(metadata_bytes),
            },
        }
        manifest = {**manifest_base, "manifestChecksum": _manifest_checksum(manifest_base)}
        _write_secure(path / "leaf-graph.ndjson", leaf_bytes)
        _write_secure(path / "security.json", security_bytes)
        _write_secure(path / "database-metadata.json", metadata_bytes)
        _write_secure(
            path / "manifest.json",
            (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode(),
        )

        info_after = client.get_database_info(database)
        security_after = client.get_security(database)
        leaves_after, winners_after = client.get_current_leaf_graph(database)
        if (
            info_after.get("uuid") != info_before["uuid"]
            or info_after.get("update_seq") != info_before.get("update_seq")
            or security_checksum(security_after) != manifest["securityChecksum"]
            or _leaf_set(leaves_after) != leaf_identities
            or dict(winners_after) != dict(winners)
        ):
            raise ContractOpsSafetyError("database changed during snapshot")
        verify_snapshot(path)
        return SnapshotResult(path=path, checksum=manifest["manifestChecksum"])
    except Exception:
        _remove_exact_artifact(path, root)
        raise


def verify_snapshot(snapshot_path: str | Path) -> dict[str, Any]:
    path = Path(snapshot_path).resolve()
    manifest = _read_json(path / "manifest.json")
    for filename, checksum in manifest.get("files", {}).items():
        try:
            content = (path / filename).read_bytes()
        except OSError as error:
            raise ContractOpsSafetyError("snapshot file is unreadable") from error
        if _sha256_bytes(content) != checksum:
            raise ContractOpsSafetyError("snapshot checksum mismatch")
    if _manifest_checksum(manifest) != manifest.get("manifestChecksum"):
        raise ContractOpsSafetyError("snapshot manifest checksum mismatch")
    leaves = _read_ndjson(path / "leaf-graph.ndjson")
    if len(leaves) != manifest.get("leafCount"):
        raise ContractOpsSafetyError("snapshot leaf count mismatch")
    if [list(identity) for identity in _leaf_set(leaves)] != manifest.get("leafIdentities"):
        raise ContractOpsSafetyError("snapshot leaf identity mismatch")
    security = _read_json(path / "security.json")
    if security_checksum(security) != manifest.get("securityChecksum"):
        raise ContractOpsSafetyError("snapshot security checksum mismatch")
    return manifest


def verify_validator(client: Any, database: str) -> dict[str, Any]:
    _require_database_name(database)
    document = client.get_document(database, CONTRACT_DESIGN_ID)
    if document is None:
        return {"state": "missing-validator", "validatorRevision": None}
    expected = load_design_document()
    metadata = document.get("fortudoDocumentContract")
    if (
        metadata != expected["fortudoDocumentContract"]
        or document.get("validate_doc_update") != expected["validate_doc_update"]
    ):
        return {"state": "validator-mismatch", "validatorRevision": document.get("_rev")}
    return {"state": "compatible", "validatorRevision": document.get("_rev")}


def install_validator(
    client: Any,
    *,
    database: str,
    confirmation: str,
    expected_uuid: str,
    expected_update_seq: Any,
    expected_security_checksum: str,
    snapshot_path: str | Path,
) -> dict[str, Any]:
    _require_database_name(database)
    _require_confirmation(database, confirmation)
    manifest = verify_snapshot(snapshot_path)
    if (
        manifest.get("databaseName") != database
        or manifest.get("databaseUuid") != expected_uuid
        or manifest.get("databaseUpdateSeq") != expected_update_seq
        or manifest.get("securityChecksum") != expected_security_checksum
    ):
        raise ContractOpsSafetyError("snapshot does not match the locked installation target")

    info = client.get_database_info(database)
    security_before = client.get_security(database)
    leaves_before, winners_before = client.get_current_leaf_graph(database)
    if (
        info.get("uuid") != expected_uuid
        or info.get("update_seq") != expected_update_seq
        or security_checksum(security_before) != expected_security_checksum
        or [list(identity) for identity in _leaf_set(leaves_before)]
        != manifest.get("leafIdentities")
        or dict(winners_before) != manifest.get("winnerRevisions")
    ):
        raise ContractOpsSafetyError("database state differs from the locked snapshot")
    if any(leaf.get("_id") == CONTRACT_DESIGN_ID for leaf in leaves_before):
        raise ContractOpsSafetyError("validator already exists; use verify instead")

    result = client.put_document(database, load_design_document())
    if not result.get("ok") or not isinstance(result.get("rev"), str):
        raise ContractOpsSafetyError("validator installation did not commit")
    verified = verify_validator(client, database)
    if verified.get("state") != "compatible":
        raise ContractOpsSafetyError("installed validator verification failed")

    leaves_after, winners_after = client.get_current_leaf_graph(database)
    before_without_design = _leaf_set(
        [leaf for leaf in leaves_before if leaf.get("_id") != CONTRACT_DESIGN_ID]
    )
    after_without_design = _leaf_set(
        [leaf for leaf in leaves_after if leaf.get("_id") != CONTRACT_DESIGN_ID]
    )
    design_after = [leaf for leaf in leaves_after if leaf.get("_id") == CONTRACT_DESIGN_ID]
    if (
        before_without_design != after_without_design
        or len(design_after) != 1
        or {
            key: value
            for key, value in winners_after.items()
            if key != CONTRACT_DESIGN_ID
        }
        != dict(winners_before)
        or security_checksum(client.get_security(database)) != expected_security_checksum
    ):
        raise ContractOpsSafetyError("installation changed state beyond the design document")
    return {
        "state": "compatible",
        "validatorRevision": verified["validatorRevision"],
        "validatorChecksum": load_design_document()["fortudoDocumentContract"]["checksum"],
    }


def provision_database(client: Any, *, database: str, confirmation: str) -> dict[str, Any]:
    _require_database_name(database)
    _require_confirmation(database, confirmation)
    client.create_database(database)
    info = client.get_database_info(database)
    if info.get("db_name") != database or info.get("doc_count") != 0:
        raise ContractOpsSafetyError("new database was not empty")
    leaves, _ = client.get_current_leaf_graph(database)
    if leaves:
        raise ContractOpsSafetyError("new database already contains revisions")
    result = client.put_document(database, load_design_document())
    if not result.get("ok") or verify_validator(client, database).get("state") != "compatible":
        raise ContractOpsSafetyError("fence-first provisioning failed")
    final_leaves, _ = client.get_current_leaf_graph(database)
    if len(final_leaves) != 1 or final_leaves[0].get("_id") != CONTRACT_DESIGN_ID:
        raise ContractOpsSafetyError("validator was not the first database document")
    return {
        "databaseUuid": info.get("uuid"),
        "validatorRevision": result.get("rev"),
        "validatorChecksum": load_design_document()["fortudoDocumentContract"]["checksum"],
    }


def _read_stable_leaf_graph(
    client: Any, database: str
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    before = client.get_database_info(database)
    leaves, winners = client.get_current_leaf_graph(database)
    after = client.get_database_info(database)
    if (
        before.get("uuid") != after.get("uuid")
        or before.get("update_seq") != after.get("update_seq")
    ):
        raise ContractOpsSafetyError("quarantine state changed during verification")
    return leaves, winners


def restore_quarantine(
    client: Any,
    *,
    database: str,
    confirmation: str,
    snapshot_path: str | Path,
) -> dict[str, Any]:
    if not database.startswith("fortudo-quarantine-"):
        raise ContractOpsSafetyError("restore target must be a new quarantine database")
    _require_database_name(database)
    _require_confirmation(database, confirmation)
    manifest = verify_snapshot(snapshot_path)
    leaves = _read_ndjson(Path(snapshot_path) / "leaf-graph.ndjson")
    legacy_leaves = [leaf for leaf in leaves if leaf.get("_id") != CONTRACT_DESIGN_ID]
    expected_leaf_bodies = {
        (leaf["_id"], leaf["_rev"]): _canonical_json(leaf) for leaf in legacy_leaves
    }
    if len(expected_leaf_bodies) != len(legacy_leaves):
        raise ContractOpsSafetyError("source snapshot contains duplicate legacy leaves")
    expected_winners = {
        document_id: revision
        for document_id, revision in manifest.get("winnerRevisions", {}).items()
        if document_id != CONTRACT_DESIGN_ID
    }
    source_security = _read_json(Path(snapshot_path) / "security.json")

    client.create_database(database)
    info = client.get_database_info(database)
    if info.get("doc_count") != 0:
        raise ContractOpsSafetyError("quarantine database was not empty")
    if legacy_leaves:
        client.bulk_docs_new_edits_false(database, legacy_leaves)

    restored_before_validator, winners_before_validator = _read_stable_leaf_graph(
        client, database
    )
    restored_bodies = {
        (leaf.get("_id"), leaf.get("_rev")): _canonical_json(leaf)
        for leaf in restored_before_validator
    }
    if (
        restored_bodies != expected_leaf_bodies
        or dict(winners_before_validator) != expected_winners
    ):
        raise ContractOpsSafetyError("quarantine leaf reconstruction verification failed")

    result = client.put_document(database, load_design_document())
    if not result.get("ok") or verify_validator(client, database).get("state") != "compatible":
        raise ContractOpsSafetyError("validator-last quarantine reconstruction failed")
    # Restore source authorization only after every document write. This avoids
    # self-locking the recovery operator before the validator can be installed.
    client.put_security(database, source_security)
    restored_after_validator, winners_after_validator = _read_stable_leaf_graph(client, database)
    non_design_after = [
        leaf for leaf in restored_after_validator if leaf.get("_id") != CONTRACT_DESIGN_ID
    ]
    final_bodies = {
        (leaf.get("_id"), leaf.get("_rev")): _canonical_json(leaf)
        for leaf in non_design_after
    }
    final_winners = {
        document_id: revision
        for document_id, revision in winners_after_validator.items()
        if document_id != CONTRACT_DESIGN_ID
    }
    design_leaves = [
        leaf for leaf in restored_after_validator if leaf.get("_id") == CONTRACT_DESIGN_ID
    ]
    if (
        final_bodies != expected_leaf_bodies
        or final_winners != expected_winners
        or len(design_leaves) != 1
        or design_leaves[0].get("_rev") != result.get("rev")
        or security_checksum(client.get_security(database)) != manifest["securityChecksum"]
    ):
        raise ContractOpsSafetyError("verified quarantine state differs from the snapshot")
    return {
        "sourceSnapshotChecksum": manifest["manifestChecksum"],
        "leafCount": len(legacy_leaves),
        "validatorRevision": result.get("rev"),
    }


def create_inventory(
    client: Any,
    *,
    manifest_root: str | Path,
    encrypted_volume_confirmed: bool,
    timestamp: str | None = None,
) -> InventoryResult:
    _require_encrypted_volume(encrypted_volume_confirmed)
    root = validate_backup_root(manifest_root)
    timestamp = timestamp or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    path = _exact_artifact_path(root, f"fortudo-inventory-{timestamp}")
    try:
        path.mkdir(parents=True, mode=0o700)
        _secure_backup_directory(path)
    except FileExistsError as error:
        raise ContractOpsSafetyError("inventory directory already exists") from error

    rows = []
    counts = {"fortudoDatabases": 0, "compatible": 0, "missingValidator": 0}
    try:
        for database in sorted(
            name for name in client.list_databases() if name.startswith("fortudo-")
        ):
            info = client.get_database_info(database)
            verification = verify_validator(client, database)
            counts["fortudoDatabases"] += 1
            if verification["state"] == "compatible":
                counts["compatible"] += 1
            elif verification["state"] == "missing-validator":
                counts["missingValidator"] += 1
            rows.append(
                {
                    "databaseName": database,
                    "databaseUuid": info.get("uuid"),
                    "updateSequence": info.get("update_seq"),
                    "documentCount": info.get("doc_count"),
                    "deletedDocumentCount": info.get("doc_del_count"),
                    "partitioned": bool(info.get("props", {}).get("partitioned", False)),
                    "securityChecksum": security_checksum(client.get_security(database)),
                    **verification,
                }
            )
        manifest_base = {
            "formatVersion": 1,
            "createdAt": timestamp,
            "counts": counts,
            "databases": rows,
        }
        manifest = {**manifest_base, "manifestChecksum": _manifest_checksum(manifest_base)}
        manifest_path = path / "manifest.json"
        _write_secure(
            manifest_path,
            (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode(),
        )
        return InventoryResult(
            path=manifest_path, checksum=manifest["manifestChecksum"], counts=counts
        )
    except Exception:
        _remove_exact_artifact(path, root)
        raise


class ContractOpsCloudantClient(CloudantClient):
    def list_databases(self) -> list[str]:
        return self._request("database inventory", "_all_dbs")

    def get_security(self, database: str) -> dict[str, Any]:
        return self._request(
            "security metadata read", f"{urllib.parse.quote(database, safe='')}/_security"
        )

    def put_security(self, database: str, security: Mapping[str, Any]) -> None:
        self._request(
            "security metadata write",
            f"{urllib.parse.quote(database, safe='')}/_security",
            method="PUT",
            body=security,
        )

    def get_current_leaf_graph(
        self, database: str
    ) -> tuple[list[dict[str, Any]], dict[str, str]]:
        encoded = urllib.parse.quote(database, safe="")
        changes = self._request(
            "current leaf inventory", f"{encoded}/_changes?since=0&style=all_docs"
        )
        leaves: list[dict[str, Any]] = []
        for row in changes.get("results", []):
            document_id = row.get("id")
            if not isinstance(document_id, str) or document_id.startswith("_local/"):
                continue
            for item in row.get("changes", []):
                revision = item.get("rev")
                path = (
                    f"{encoded}/{urllib.parse.quote(document_id, safe='')}?"
                    f"rev={urllib.parse.quote(revision, safe='')}&revs=true&attachments=true"
                )
                leaves.append(self._request("leaf revision read", path))
        winners_payload = self._request("winner identity read", f"{encoded}/_all_docs")
        winners = {
            row["id"]: row["value"]["rev"]
            for row in winners_payload.get("rows", [])
            if isinstance(row.get("value", {}).get("rev"), str)
        }
        return leaves, winners

    def put_document(self, database: str, document: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "guarded document write",
            f"{urllib.parse.quote(database, safe='')}/{urllib.parse.quote(document['_id'], safe='')}",
            method="PUT",
            body=document,
        )

    def create_database(self, database: str) -> None:
        self._request(
            "guarded database creation",
            urllib.parse.quote(database, safe=""),
            method="PUT",
        )

    def bulk_docs_new_edits_false(self, database: str, documents: list[dict[str, Any]]) -> None:
        result = self._request(
            "quarantine leaf reconstruction",
            f"{urllib.parse.quote(database, safe='')}/_bulk_docs",
            method="POST",
            body={"docs": documents, "new_edits": False},
        )
        if len(result) != len(documents) or any(row.get("error") for row in result):
            raise ContractOpsSafetyError("quarantine leaf reconstruction was incomplete")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="mode", required=True)

    inventory = subparsers.add_parser("inventory")
    inventory.add_argument("--manifest-root", required=True)
    inventory.add_argument("--confirm-encrypted-volume", action="store_true")

    snapshot = subparsers.add_parser("snapshot")
    snapshot.add_argument("--database", required=True)
    snapshot.add_argument("--backup-root", required=True)
    snapshot.add_argument("--label", required=True)
    snapshot.add_argument("--confirm-encrypted-volume", action="store_true")

    verify = subparsers.add_parser("verify")
    verify.add_argument("--database", required=True)

    install = subparsers.add_parser("install")
    install.add_argument("--database", required=True)
    install.add_argument("--confirm-database", required=True)
    install.add_argument("--expected-uuid", required=True)
    install.add_argument("--expected-update-seq", required=True)
    install.add_argument("--expected-security-checksum", required=True)
    install.add_argument("--snapshot", required=True)

    provision = subparsers.add_parser("provision")
    provision.add_argument("--database", required=True)
    provision.add_argument("--confirm-database", required=True)

    quarantine = subparsers.add_parser("restore-quarantine")
    quarantine.add_argument("--database", required=True)
    quarantine.add_argument("--confirm-database", required=True)
    quarantine.add_argument("--snapshot", required=True)
    return parser


def _public_operational_report(report: Mapping[str, Any]) -> dict[str, Any]:
    public = {"mode": report["mode"]}
    for key, value in report.items():
        if key == "counts" or key == "state" or key == "leafCount" or key.endswith("Checksum"):
            public[key] = value
    return public


def execute(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    client_factory: Any = ContractOpsCloudantClient,
) -> dict[str, Any]:
    args = _parser().parse_args(argv)
    environment = os.environ if environ is None else environ
    credential_url = environment.get(CREDENTIAL_ENV_VAR)
    if not credential_url:
        raise ContractOpsSafetyError(f"required environment variable {CREDENTIAL_ENV_VAR} is unset")
    client = client_factory(credential_url)

    if args.mode == "inventory":
        result = create_inventory(
            client,
            manifest_root=args.manifest_root,
            encrypted_volume_confirmed=args.confirm_encrypted_volume,
        )
        report = {
            "mode": args.mode,
            "counts": result.counts,
            "manifestPath": str(result.path),
            "manifestChecksum": result.checksum,
        }
    elif args.mode == "snapshot":
        result = create_snapshot(
            client,
            database=args.database,
            backup_root=args.backup_root,
            label=args.label,
            encrypted_volume_confirmed=args.confirm_encrypted_volume,
        )
        report = {
            "mode": args.mode,
            "snapshotPath": str(result.path),
            "snapshotChecksum": result.checksum,
        }
    elif args.mode == "verify":
        report = {"mode": args.mode, **verify_validator(client, args.database)}
    elif args.mode == "install":
        report = {
            "mode": args.mode,
            **install_validator(
                client,
                database=args.database,
                confirmation=args.confirm_database,
                expected_uuid=args.expected_uuid,
                expected_update_seq=args.expected_update_seq,
                expected_security_checksum=args.expected_security_checksum,
                snapshot_path=args.snapshot,
            ),
        }
    elif args.mode == "provision":
        report = {
            "mode": args.mode,
            **provision_database(
                client, database=args.database, confirmation=args.confirm_database
            ),
        }
    else:
        report = {
            "mode": args.mode,
            **restore_quarantine(
                client,
                database=args.database,
                confirmation=args.confirm_database,
                snapshot_path=args.snapshot,
            ),
        }
    print(json.dumps(_public_operational_report(report), indent=2, sort_keys=True))
    return report


def main() -> int:
    try:
        execute()
    except ContractOpsSafetyError as error:
        print(f"Contract operation blocked: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

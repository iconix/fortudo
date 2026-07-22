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

# The operational runbook invokes this file directly. In that mode Python adds
# ``scripts/`` rather than the repository root to ``sys.path``, so make the
# package import below resolve identically to ``python -m`` execution.
if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

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
SNAPSHOT_FORMAT_VERSION = 2
TARGET_BINDING_FORMAT_VERSION = 1
TARGET_BINDING_SCHEME = "ibm-cloudant-account-database-state-v1"
TEMPORARY_UNENCRYPTED_RETENTION = "delete-after-s3-and-known-client-exercise"


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
    account_checksum: str


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def security_checksum(security: Mapping[str, Any]) -> str:
    return _sha256_bytes(_canonical_json(security).encode("utf-8"))


def _require_backup_protection(
    *, encrypted_volume_confirmed: bool, temporary_unencrypted_confirmed: bool
) -> dict[str, str]:
    if encrypted_volume_confirmed == temporary_unencrypted_confirmed:
        raise ContractOpsSafetyError(
            "confirm exactly one backup protection mode: an encrypted user-only volume "
            "or the explicit temporary-unencrypted retention override"
        )
    if encrypted_volume_confirmed:
        return {"mode": "encrypted-user-only-volume"}
    return {
        "mode": "temporary-unencrypted-user-only-directory",
        "retention": TEMPORARY_UNENCRYPTED_RETENTION,
    }


def _validate_backup_protection(value: Any) -> None:
    valid = (
        value == {"mode": "encrypted-user-only-volume"}
        or value
        == {
            "mode": "temporary-unencrypted-user-only-directory",
            "retention": TEMPORARY_UNENCRYPTED_RETENTION,
        }
    )
    if not valid:
        raise ContractOpsSafetyError("snapshot backup protection evidence is invalid")


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


def _leaf_body_map(leaves: Sequence[Mapping[str, Any]]) -> dict[tuple[str, str, bool], str]:
    identities = _leaf_set(leaves)
    by_identity = {
        _leaf_identity(leaf): _canonical_json(leaf)
        for leaf in leaves
    }
    if len(by_identity) != len(identities):
        raise ContractOpsSafetyError("leaf graph contains duplicate identities")
    return by_identity


def _ndjson_bytes(rows: Sequence[Mapping[str, Any]]) -> bytes:
    if not rows:
        return b""
    _leaf_set(rows)
    return ("\n".join(_canonical_json(row) for row in rows) + "\n").encode("utf-8")


def _canonical_leaf_graph_checksum(rows: Sequence[Mapping[str, Any]]) -> str:
    _leaf_set(rows)
    ordered = sorted(rows, key=_leaf_identity)
    content = ("\n".join(_canonical_json(row) for row in ordered) + "\n").encode("utf-8")
    return _sha256_bytes(content)


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


def _partitioned(info: Mapping[str, Any]) -> bool:
    return bool(
        info.get("partitioned") is True
        or info.get("props", {}).get("partitioned", False)
    )


def _account_checksum(client: Any) -> str:
    try:
        checksum = client.get_account_checksum()
    except (AttributeError, TypeError) as error:
        raise ContractOpsSafetyError("Cloudant account identity is unavailable") from error
    return _require_sha256(checksum, field="Cloudant account identity")


def _require_sha256(value: Any, *, field: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ContractOpsSafetyError(f"{field} is invalid")
    return value


def _target_binding_from_parts(
    *,
    account_checksum: str,
    database: str,
    partitioned: bool,
    update_seq: Any,
    security_checksum_value: str,
    leaf_graph_checksum: str,
    winner_revisions: Mapping[str, str],
) -> dict[str, Any]:
    if not isinstance(database, str):
        raise ContractOpsSafetyError("database identity is invalid")
    _require_database_name(database)
    if not isinstance(partitioned, bool):
        raise ContractOpsSafetyError("database partitioning metadata is invalid")
    if not isinstance(winner_revisions, Mapping):
        raise ContractOpsSafetyError("winner metadata is invalid")
    account_checksum = _require_sha256(
        account_checksum, field="Cloudant account identity"
    )
    security_checksum_value = _require_sha256(
        security_checksum_value, field="security checksum"
    )
    leaf_graph_checksum = _require_sha256(
        leaf_graph_checksum, field="leaf graph checksum"
    )
    if not isinstance(update_seq, str) or not update_seq:
        raise ContractOpsSafetyError("database update sequence is incomplete")
    if any(
        not isinstance(document_id, str) or not isinstance(revision, str)
        for document_id, revision in winner_revisions.items()
    ):
        raise ContractOpsSafetyError("winner metadata is invalid")
    body = {
        "formatVersion": TARGET_BINDING_FORMAT_VERSION,
        "scheme": TARGET_BINDING_SCHEME,
        "accountChecksum": account_checksum,
        "databaseName": database,
        "partitioned": partitioned,
        "databaseUpdateSeq": update_seq,
        "securityChecksum": security_checksum_value,
        "leafGraphChecksum": leaf_graph_checksum,
        "winnerRevisionsChecksum": _sha256_bytes(
            _canonical_json(dict(sorted(winner_revisions.items()))).encode("utf-8")
        ),
    }
    return {**body, "checksum": _sha256_bytes(_canonical_json(body).encode("utf-8"))}


def capture_target_binding(
    client: Any,
    *,
    database: str,
    info: Mapping[str, Any],
    security: Mapping[str, Any],
    leaves: Sequence[Mapping[str, Any]],
    winners: Mapping[str, str],
) -> dict[str, Any]:
    """Bind one exact Cloudant account/database state without a database UUID."""
    if info.get("db_name") != database:
        raise ContractOpsSafetyError("Cloudant reported a different database name")
    return _target_binding_from_parts(
        account_checksum=_account_checksum(client),
        database=database,
        partitioned=_partitioned(info),
        update_seq=info.get("update_seq"),
        security_checksum_value=security_checksum(security),
        leaf_graph_checksum=_canonical_leaf_graph_checksum(leaves),
        winner_revisions=winners,
    )


def _database_observation(
    client: Any, database: str, info: Mapping[str, Any]
) -> dict[str, Any]:
    if info.get("db_name") != database:
        raise ContractOpsSafetyError("Cloudant reported a different database name")
    update_seq = info.get("update_seq")
    if not isinstance(update_seq, str) or not update_seq:
        raise ContractOpsSafetyError("database update sequence is incomplete")
    return {
        "accountChecksum": _account_checksum(client),
        "databaseName": database,
        "partitioned": _partitioned(info),
        "databaseUpdateSeq": update_seq,
    }


def _validate_snapshot_target_binding(
    manifest: Mapping[str, Any], *, leaf_graph_checksum: str
) -> None:
    if manifest.get("formatVersion") != SNAPSHOT_FORMAT_VERSION:
        raise ContractOpsSafetyError("snapshot format version is unsupported")
    binding = manifest.get("targetBinding")
    if not isinstance(binding, Mapping):
        raise ContractOpsSafetyError("snapshot target binding is missing")
    if not isinstance(manifest.get("partitioned"), bool):
        raise ContractOpsSafetyError("snapshot partitioning metadata is invalid")
    expected = _target_binding_from_parts(
        account_checksum=binding.get("accountChecksum"),
        database=manifest.get("databaseName"),
        partitioned=manifest["partitioned"],
        update_seq=manifest.get("databaseUpdateSeq"),
        security_checksum_value=manifest.get("securityChecksum"),
        leaf_graph_checksum=leaf_graph_checksum,
        winner_revisions=manifest.get("winnerRevisions", {}),
    )
    if dict(binding) != expected:
        raise ContractOpsSafetyError("snapshot target binding is invalid")


def create_snapshot(
    client: Any,
    *,
    database: str,
    backup_root: str | Path,
    label: str,
    encrypted_volume_confirmed: bool,
    temporary_unencrypted_confirmed: bool = False,
    timestamp: str | None = None,
) -> SnapshotResult:
    _require_database_name(database)
    backup_protection = _require_backup_protection(
        encrypted_volume_confirmed=encrypted_volume_confirmed,
        temporary_unencrypted_confirmed=temporary_unencrypted_confirmed,
    )
    _require_artifact_label(label)
    root = validate_backup_root(backup_root)
    timestamp = timestamp or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    path = _exact_artifact_path(root, f"fortudo-contract-{label}-{timestamp}")

    info_before = client.get_database_info(database)
    security_before = client.get_security(database)
    leaves, winners = client.get_current_leaf_graph(database)
    leaf_identities = _leaf_set(leaves)
    if not isinstance(winners, Mapping):
        raise ContractOpsSafetyError("winner metadata is invalid")
    target_binding = capture_target_binding(
        client,
        database=database,
        info=info_before,
        security=security_before,
        leaves=leaves,
        winners=winners,
    )

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
            "databaseUpdateSeq": info_before.get("update_seq"),
            "docCount": info_before.get("doc_count"),
            "deletedDocCount": info_before.get("doc_del_count"),
            "partitioned": _partitioned(info_before),
        }
        metadata_bytes = (json.dumps(metadata, indent=2, sort_keys=True) + "\n").encode()
        design_leaf = next(
            (leaf for leaf in leaves if leaf.get("_id") == CONTRACT_DESIGN_ID), None
        )
        manifest_base = {
            "formatVersion": SNAPSHOT_FORMAT_VERSION,
            "label": label,
            "createdAt": timestamp,
            "backupProtection": backup_protection,
            **metadata,
            "targetBinding": target_binding,
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
        target_binding_after = capture_target_binding(
            client,
            database=database,
            info=info_after,
            security=security_after,
            leaves=leaves_after,
            winners=winners_after,
        )
        if target_binding_after != target_binding:
            raise ContractOpsSafetyError("database changed during snapshot")
        verify_snapshot(path)
        return SnapshotResult(path=path, checksum=manifest["manifestChecksum"])
    except Exception:
        _remove_exact_artifact(path, root)
        raise


def verify_snapshot(snapshot_path: str | Path) -> dict[str, Any]:
    path = Path(snapshot_path).resolve()
    manifest = _read_json(path / "manifest.json")
    if not isinstance(manifest, Mapping):
        raise ContractOpsSafetyError("snapshot manifest is invalid")
    _validate_backup_protection(manifest.get("backupProtection"))
    files = manifest.get("files")
    expected_files = {"leaf-graph.ndjson", "security.json", "database-metadata.json"}
    if not isinstance(files, Mapping) or set(files) != expected_files:
        raise ContractOpsSafetyError("snapshot file manifest is invalid")
    for filename, checksum in files.items():
        _require_sha256(checksum, field="snapshot file checksum")
        try:
            content = (path / filename).read_bytes()
        except OSError as error:
            raise ContractOpsSafetyError("snapshot file is unreadable") from error
        if _sha256_bytes(content) != checksum:
            raise ContractOpsSafetyError("snapshot checksum mismatch")
    if _manifest_checksum(manifest) != manifest.get("manifestChecksum"):
        raise ContractOpsSafetyError("snapshot manifest checksum mismatch")
    leaves = _read_ndjson(path / "leaf-graph.ndjson")
    _validate_snapshot_target_binding(
        manifest, leaf_graph_checksum=_canonical_leaf_graph_checksum(leaves)
    )
    if len(leaves) != manifest.get("leafCount"):
        raise ContractOpsSafetyError("snapshot leaf count mismatch")
    if [list(identity) for identity in _leaf_set(leaves)] != manifest.get("leafIdentities"):
        raise ContractOpsSafetyError("snapshot leaf identity mismatch")
    winners = manifest.get("winnerRevisions")
    if not isinstance(winners, Mapping) or len(winners) != manifest.get("winnerCount"):
        raise ContractOpsSafetyError("snapshot winner metadata is invalid")
    live_identities = {(identity[0], identity[1]) for identity in _leaf_set(leaves)}
    if any((document_id, revision) not in live_identities for document_id, revision in winners.items()):
        raise ContractOpsSafetyError("snapshot winner identity is missing")
    security = _read_json(path / "security.json")
    if security_checksum(security) != manifest.get("securityChecksum"):
        raise ContractOpsSafetyError("snapshot security checksum mismatch")
    metadata = _read_json(path / "database-metadata.json")
    expected_metadata = {
        key: manifest.get(key)
        for key in (
            "databaseName",
            "databaseUpdateSeq",
            "docCount",
            "deletedDocCount",
            "partitioned",
        )
    }
    if metadata != expected_metadata:
        raise ContractOpsSafetyError("snapshot database metadata mismatch")
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
    expected_target_binding_checksum: str,
    snapshot_path: str | Path,
) -> dict[str, Any]:
    _require_database_name(database)
    _require_confirmation(database, confirmation)
    manifest = verify_snapshot(snapshot_path)
    expected_target_binding_checksum = _require_sha256(
        expected_target_binding_checksum, field="expected target binding checksum"
    )
    if manifest.get("targetBinding", {}).get("checksum") != expected_target_binding_checksum:
        raise ContractOpsSafetyError("snapshot does not match the locked installation target")

    info = client.get_database_info(database)
    security_before = client.get_security(database)
    leaves_before, winners_before = client.get_current_leaf_graph(database)
    live_target_binding = capture_target_binding(
        client,
        database=database,
        info=info,
        security=security_before,
        leaves=leaves_before,
        winners=winners_before,
    )
    if live_target_binding != manifest.get("targetBinding"):
        raise ContractOpsSafetyError("database state differs from the locked snapshot")
    if any(leaf.get("_id") == CONTRACT_DESIGN_ID for leaf in leaves_before):
        raise ContractOpsSafetyError("validator already exists; use verify instead")

    result = client.put_document(database, load_design_document())
    if not result.get("ok") or not isinstance(result.get("rev"), str):
        raise ContractOpsSafetyError("validator installation did not commit")
    verified = verify_validator(client, database)
    if verified.get("state") != "compatible":
        raise ContractOpsSafetyError("installed validator verification failed")

    info_after = client.get_database_info(database)
    security_after = client.get_security(database)
    leaves_after, winners_after = client.get_current_leaf_graph(database)
    after_target_binding = capture_target_binding(
        client,
        database=database,
        info=info_after,
        security=security_after,
        leaves=leaves_after,
        winners=winners_after,
    )
    before_without_design = _leaf_set(
        [leaf for leaf in leaves_before if leaf.get("_id") != CONTRACT_DESIGN_ID]
    )
    after_without_design = _leaf_set(
        [leaf for leaf in leaves_after if leaf.get("_id") != CONTRACT_DESIGN_ID]
    )
    design_after = [leaf for leaf in leaves_after if leaf.get("_id") == CONTRACT_DESIGN_ID]
    bodies_before = _leaf_body_map(
        [leaf for leaf in leaves_before if leaf.get("_id") != CONTRACT_DESIGN_ID]
    )
    bodies_after = _leaf_body_map(
        [leaf for leaf in leaves_after if leaf.get("_id") != CONTRACT_DESIGN_ID]
    )
    if (
        before_without_design != after_without_design
        or bodies_before != bodies_after
        or len(design_after) != 1
        or {
            key: value
            for key, value in winners_after.items()
            if key != CONTRACT_DESIGN_ID
        }
        != dict(winners_before)
        or any(
            after_target_binding.get(key) != manifest["targetBinding"].get(key)
            for key in ("accountChecksum", "databaseName", "partitioned", "securityChecksum")
        )
    ):
        raise ContractOpsSafetyError("installation changed state beyond the design document")
    return {
        "state": "compatible",
        "validatorRevision": verified["validatorRevision"],
        "validatorChecksum": load_design_document()["fortudoDocumentContract"]["checksum"],
    }


def provision_database(
    client: Any,
    *,
    database: str,
    confirmation: str,
    expected_account_checksum: str,
) -> dict[str, Any]:
    _require_database_name(database)
    _require_confirmation(database, confirmation)
    expected_account_checksum = _require_sha256(
        expected_account_checksum, field="expected Cloudant account checksum"
    )
    if _account_checksum(client) != expected_account_checksum:
        raise ContractOpsSafetyError("credential does not match the approved Cloudant account")
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
        "targetAccountChecksum": _account_checksum(client),
        "validatorRevision": result.get("rev"),
        "validatorChecksum": load_design_document()["fortudoDocumentContract"]["checksum"],
    }


def _read_stable_leaf_graph(
    client: Any, database: str
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    before = client.get_database_info(database)
    leaves, winners = client.get_current_leaf_graph(database)
    after = client.get_database_info(database)
    if _database_observation(client, database, before) != _database_observation(
        client, database, after
    ):
        raise ContractOpsSafetyError("quarantine state changed during verification")
    return leaves, winners


def restore_quarantine(
    client: Any,
    *,
    database: str,
    confirmation: str,
    expected_account_checksum: str,
    snapshot_path: str | Path,
) -> dict[str, Any]:
    if not database.startswith("fortudo-quarantine-"):
        raise ContractOpsSafetyError("restore target must be a new quarantine database")
    _require_database_name(database)
    _require_confirmation(database, confirmation)
    expected_account_checksum = _require_sha256(
        expected_account_checksum, field="expected Cloudant account checksum"
    )
    if _account_checksum(client) != expected_account_checksum:
        raise ContractOpsSafetyError("credential does not match the approved Cloudant account")
    manifest = verify_snapshot(snapshot_path)
    if manifest["targetBinding"]["accountChecksum"] != expected_account_checksum:
        raise ContractOpsSafetyError("snapshot Cloudant account is not the approved account")
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
    temporary_unencrypted_confirmed: bool = False,
    timestamp: str | None = None,
) -> InventoryResult:
    backup_protection = _require_backup_protection(
        encrypted_volume_confirmed=encrypted_volume_confirmed,
        temporary_unencrypted_confirmed=temporary_unencrypted_confirmed,
    )
    root = validate_backup_root(manifest_root)
    account_checksum = _account_checksum(client)
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
                    "accountChecksum": account_checksum,
                    "updateSequence": info.get("update_seq"),
                    "documentCount": info.get("doc_count"),
                    "deletedDocumentCount": info.get("doc_del_count"),
                    "partitioned": bool(info.get("props", {}).get("partitioned", False)),
                    "securityChecksum": security_checksum(client.get_security(database)),
                    **verification,
                }
            )
        manifest_base = {
            "formatVersion": 2,
            "createdAt": timestamp,
            "backupProtection": backup_protection,
            "accountChecksum": account_checksum,
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
            path=manifest_path,
            checksum=manifest["manifestChecksum"],
            counts=counts,
            account_checksum=account_checksum,
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
    inventory_protection = inventory.add_mutually_exclusive_group()
    inventory_protection.add_argument("--confirm-encrypted-volume", action="store_true")
    inventory_protection.add_argument("--confirm-temporary-unencrypted", action="store_true")

    snapshot = subparsers.add_parser("snapshot")
    snapshot.add_argument("--database", required=True)
    snapshot.add_argument("--backup-root", required=True)
    snapshot.add_argument("--label", required=True)
    snapshot_protection = snapshot.add_mutually_exclusive_group()
    snapshot_protection.add_argument("--confirm-encrypted-volume", action="store_true")
    snapshot_protection.add_argument("--confirm-temporary-unencrypted", action="store_true")

    verify = subparsers.add_parser("verify")
    verify.add_argument("--database", required=True)

    install = subparsers.add_parser("install")
    install.add_argument("--database", required=True)
    install.add_argument("--confirm-database", required=True)
    install.add_argument("--expected-target-binding-checksum", required=True)
    install.add_argument("--snapshot", required=True)

    provision = subparsers.add_parser("provision")
    provision.add_argument("--database", required=True)
    provision.add_argument("--confirm-database", required=True)
    provision.add_argument("--expected-account-checksum", required=True)

    quarantine = subparsers.add_parser("restore-quarantine")
    quarantine.add_argument("--database", required=True)
    quarantine.add_argument("--confirm-database", required=True)
    quarantine.add_argument("--expected-account-checksum", required=True)
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
            temporary_unencrypted_confirmed=args.confirm_temporary_unencrypted,
        )
        report = {
            "mode": args.mode,
            "counts": result.counts,
            "accountChecksum": result.account_checksum,
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
            temporary_unencrypted_confirmed=args.confirm_temporary_unencrypted,
        )
        snapshot_manifest = verify_snapshot(result.path)
        report = {
            "mode": args.mode,
            "snapshotPath": str(result.path),
            "snapshotChecksum": result.checksum,
            "targetBindingChecksum": snapshot_manifest["targetBinding"]["checksum"],
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
                expected_target_binding_checksum=args.expected_target_binding_checksum,
                snapshot_path=args.snapshot,
            ),
        }
    elif args.mode == "provision":
        report = {
            "mode": args.mode,
            **provision_database(
                client,
                database=args.database,
                confirmation=args.confirm_database,
                expected_account_checksum=args.expected_account_checksum,
            ),
        }
    else:
        report = {
            "mode": args.mode,
            **restore_quarantine(
                client,
                database=args.database,
                confirmation=args.confirm_database,
                expected_account_checksum=args.expected_account_checksum,
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

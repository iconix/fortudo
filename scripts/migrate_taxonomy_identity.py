"""Guarded Cloudant migration for Fortudo taxonomy identity version 1.

Dry-run is the default. Apply and restore modes require an exact database name,
an update-sequence lock, typed confirmation, and a backup outside this repository.
The command deliberately prints metadata only; document bodies and credentials
must never appear in its output or exception messages.
"""

from __future__ import annotations

import argparse
import base64
import copy
import csv
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence


EXPECTED_DATABASE_NAME = "fortudo-dat-411"
CREDENTIAL_ENV_VAR = "FORTUDO_CLOUDANT_URL"
MIGRATION_COMPLETION_ID = "config-taxonomy-identity-migration-v1"
TAXONOMY_DOCUMENT_ID = "config-categories"
RUNNING_ACTIVITY_ID = "config-running-activity"
TAXONOMY_IDENTITY_VERSION = 1
DOCUMENT_CONTRACT_VERSION = 1
TAXONOMY_NAMESPACE = uuid.UUID("8e2e8b7a-5c3f-4f3e-9c5d-7a1b2e4f6c80")
REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


class MigrationSafetyError(RuntimeError):
    """Raised when a production-safety precondition is not satisfied."""


@dataclass(frozen=True)
class MigrationPlan:
    updates: list[dict[str, Any]]
    conflict_tombstones: list[dict[str, Any]]
    counts: dict[str, int]
    running_timer_present: bool


@dataclass(frozen=True)
class BackupResult:
    path: Path
    checksum: str


@dataclass(frozen=True)
class MigrationResult:
    mode: str
    update_seq: str
    counts: dict[str, int] = field(default_factory=dict)
    backup_path: Path | None = None
    backup_checksum: str | None = None
    journal_path: Path | None = None


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _deterministic_id(kind: str, legacy_key: str) -> str:
    return str(uuid.uuid5(TAXONOMY_NAMESPACE, f"{kind}:{legacy_key}"))


def _document_kind(document: Mapping[str, Any]) -> str:
    doc_type = document.get("docType")
    if isinstance(doc_type, str):
        return doc_type
    document_id = str(document.get("_id", ""))
    if document_id.startswith("activity"):
        return "activity"
    if document_id.startswith(("task", "unsched")):
        return "task"
    if document_id.startswith("config-"):
        return "config"
    return "unknown"


def _ensure_exact_database(database: str) -> None:
    if database != EXPECTED_DATABASE_NAME:
        raise MigrationSafetyError(
            f'unexpected database name; expected exactly "{EXPECTED_DATABASE_NAME}"'
        )


def _find_taxonomy_document(documents: Sequence[Mapping[str, Any]]) -> Mapping[str, Any]:
    matches = [document for document in documents if document.get("_id") == TAXONOMY_DOCUMENT_ID]
    if len(matches) != 1:
        raise MigrationSafetyError("expected exactly one taxonomy configuration document")
    taxonomy = matches[0]
    if taxonomy.get("schemaVersion") != "3.5":
        raise MigrationSafetyError('taxonomy schemaVersion differs from required "3.5"')
    if not isinstance(taxonomy.get("groups"), list) or not isinstance(
        taxonomy.get("categories"), list
    ):
        raise MigrationSafetyError("taxonomy groups and categories must be arrays")
    return taxonomy


def _validate_taxonomy_rows(
    taxonomy: Mapping[str, Any],
) -> tuple[dict[str, str], dict[str, str]]:
    identity_version = taxonomy.get("identityVersion")
    if identity_version not in (None, TAXONOMY_IDENTITY_VERSION):
        raise MigrationSafetyError("unsupported taxonomy identityVersion")
    has_identity = identity_version == TAXONOMY_IDENTITY_VERSION
    group_ids: dict[str, str] = {}
    category_ids: dict[str, str] = {}
    seen_ids: set[str] = set()

    for group in taxonomy["groups"]:
        if not isinstance(group, Mapping) or not isinstance(group.get("key"), str):
            raise MigrationSafetyError("taxonomy group is missing a string key")
        key = group["key"]
        expected_id = _deterministic_id("group", key)
        existing_id = group.get("id")
        if isinstance(existing_id, str):
            if existing_id in seen_ids:
                raise MigrationSafetyError("duplicate taxonomy ID")
            seen_ids.add(existing_id)
            try:
                uuid.UUID(existing_id)
            except ValueError as error:
                raise MigrationSafetyError("taxonomy group ID is not a UUID") from error
            if not has_identity and existing_id != expected_id:
                raise MigrationSafetyError("existing taxonomy group ID is not deterministic")
        elif existing_id is not None:
            raise MigrationSafetyError("taxonomy group ID must be a string")
        if key in group_ids:
            raise MigrationSafetyError("duplicate taxonomy group key")
        resolved_id = existing_id or expected_id
        if resolved_id in group_ids.values():
            raise MigrationSafetyError("duplicate taxonomy ID")
        group_ids[key] = resolved_id
        if has_identity:
            _validate_identity_metadata(group, kind="group")

    for category in taxonomy["categories"]:
        if not isinstance(category, Mapping) or not isinstance(category.get("key"), str):
            raise MigrationSafetyError("taxonomy category is missing a string key")
        key = category["key"]
        group_key = category.get("groupKey")
        if not isinstance(group_key, str) or group_key not in group_ids:
            raise MigrationSafetyError("taxonomy category has an unknown parent group")
        expected_id = _deterministic_id("category", key)
        existing_id = category.get("id")
        if isinstance(existing_id, str):
            if existing_id in seen_ids:
                raise MigrationSafetyError("duplicate taxonomy ID")
            seen_ids.add(existing_id)
            try:
                uuid.UUID(existing_id)
            except ValueError as error:
                raise MigrationSafetyError("taxonomy category ID is not a UUID") from error
            if not has_identity and existing_id != expected_id:
                raise MigrationSafetyError("existing taxonomy category ID is not deterministic")
        elif existing_id is not None:
            raise MigrationSafetyError("taxonomy category ID must be a string")
        if key in category_ids:
            raise MigrationSafetyError("duplicate taxonomy category key")
        resolved_id = existing_id or expected_id
        if resolved_id in {*group_ids.values(), *category_ids.values()}:
            raise MigrationSafetyError("duplicate taxonomy ID")
        category_ids[key] = resolved_id
        if has_identity:
            _validate_identity_metadata(category, kind="category")
            if category.get("groupId") != group_ids[group_key]:
                raise MigrationSafetyError("taxonomy category groupId mismatch")

    return group_ids, category_ids


def _validate_identity_metadata(row: Mapping[str, Any], *, kind: str) -> None:
    if not isinstance(row.get("legacyKeys"), list) or not all(
        isinstance(key, str) for key in row["legacyKeys"]
    ):
        raise MigrationSafetyError(f"taxonomy {kind} legacyKeys are invalid")
    if row.get("status") not in {"active", "archived"}:
        raise MigrationSafetyError(f"taxonomy {kind} status is invalid")
    archived_at = row.get("archivedAt")
    if row["status"] == "active" and archived_at is not None:
        raise MigrationSafetyError(f"active taxonomy {kind} has archivedAt")
    if row["status"] == "archived" and not isinstance(archived_at, str):
        raise MigrationSafetyError(f"archived taxonomy {kind} is missing archivedAt")


def _set_if_changed(document: dict[str, Any], key: str, value: Any) -> bool:
    if document.get(key) == value and key in document:
        return False
    document[key] = value
    return True


def _apply_writer_contract(document: Mapping[str, Any]) -> dict[str, Any]:
    contracted = copy.deepcopy(dict(document))
    contracted.pop("_conflicts", None)
    if contracted.get("_deleted"):
        contracted["writerContract"] = {"version": DOCUMENT_CONTRACT_VERSION}
        return contracted

    category = contracted.get("category")
    category_id = contracted.get("categoryId")
    identity_version = contracted.get("categoryIdentityVersion")
    if category in (None, "") and category_id in (None, ""):
        category = None
        category_id = None
        identity_version = None
    contracted["category"] = category
    contracted["categoryId"] = category_id
    contracted["categoryIdentityVersion"] = identity_version
    category_reference = (
        None
        if category is None and category_id is None and identity_version is None
        else {"key": category, "id": category_id, "identityVersion": identity_version}
    )
    contracted["writerContract"] = {
        "version": DOCUMENT_CONTRACT_VERSION,
        "categoryReference": category_reference,
    }
    return contracted


def _migrate_taxonomy_document(
    taxonomy: Mapping[str, Any],
    group_ids: Mapping[str, str],
    category_ids: Mapping[str, str],
) -> tuple[dict[str, Any], int]:
    migrated = copy.deepcopy(dict(taxonomy))
    migrated.pop("_conflicts", None)
    if taxonomy.get("identityVersion") == TAXONOMY_IDENTITY_VERSION:
        return migrated, 0
    changed_records = 0
    changed = _set_if_changed(migrated, "identityVersion", TAXONOMY_IDENTITY_VERSION)

    for group in migrated["groups"]:
        row_changed = False
        row_changed |= _set_if_changed(group, "id", group_ids[group["key"]])
        row_changed |= _set_if_changed(group, "legacyKeys", [group["key"]])
        row_changed |= _set_if_changed(group, "status", "active")
        row_changed |= _set_if_changed(group, "archivedAt", None)
        changed_records += int(row_changed)
        changed |= row_changed

    for category in migrated["categories"]:
        row_changed = False
        row_changed |= _set_if_changed(category, "id", category_ids[category["key"]])
        row_changed |= _set_if_changed(category, "groupId", group_ids[category["groupKey"]])
        row_changed |= _set_if_changed(category, "legacyKeys", [category["key"]])
        row_changed |= _set_if_changed(category, "status", "active")
        row_changed |= _set_if_changed(category, "archivedAt", None)
        changed_records += int(row_changed)
        changed |= row_changed

    result = migrated if changed else copy.deepcopy(dict(taxonomy))
    return _apply_writer_contract(result), changed_records


def _migrate_reference(
    document: Mapping[str, Any], category_ids: Mapping[str, str]
) -> tuple[dict[str, Any], bool]:
    category_key = document.get("category")
    category_id = document.get("categoryId")
    if category_key in (None, "") and category_id in (None, ""):
        return copy.deepcopy(dict(document)), False

    key_from_id = next(
        (key for key, identity in category_ids.items() if identity == category_id), None
    )
    if isinstance(category_key, str) and category_key in category_ids:
        resolved_key = category_key
    elif key_from_id is not None:
        resolved_key = key_from_id
    else:
        raise MigrationSafetyError("unknown taxonomy reference")
    resolved_id = category_ids[resolved_key]
    migrated = copy.deepcopy(dict(document))
    migrated.pop("_conflicts", None)
    changed = False
    if category_key != resolved_key:
        migrated["category"] = resolved_key
        changed = True
    if category_id != resolved_id:
        migrated["categoryId"] = resolved_id
        changed = True
    if migrated.get("categoryIdentityVersion") != TAXONOMY_IDENTITY_VERSION:
        migrated["categoryIdentityVersion"] = TAXONOMY_IDENTITY_VERSION
        changed = True
    contracted = _apply_writer_contract(migrated)
    comparable_source = copy.deepcopy(dict(document))
    comparable_source.pop("_conflicts", None)
    return contracted, changed or contracted != comparable_source


def build_migration_plan(documents: Sequence[Mapping[str, Any]]) -> MigrationPlan:
    """Build a validated, non-mutating migration plan from current winners."""

    taxonomy = _find_taxonomy_document(documents)
    group_ids, category_ids = _validate_taxonomy_rows(taxonomy)
    reference_ids = {**group_ids, **category_ids}
    migrated_taxonomy, taxonomy_records_migrated = _migrate_taxonomy_document(
        taxonomy, group_ids, category_ids
    )

    updates: list[dict[str, Any]] = []
    if migrated_taxonomy != taxonomy:
        updates.append(migrated_taxonomy)

    references_migrated = 0
    categorized_references = 0
    conflicts = 0
    running_timer_present = False
    tombstones: list[dict[str, Any]] = []

    for source in documents:
        document_id = source.get("_id")
        if not isinstance(document_id, str):
            raise MigrationSafetyError("document is missing a string _id")
        kind = _document_kind(source)
        conflict_revisions = source.get("_conflicts", [])
        if conflict_revisions:
            if kind != "activity":
                raise MigrationSafetyError("non-activity conflict requires manual review")
            if not isinstance(conflict_revisions, list) or not all(
                isinstance(revision, str) for revision in conflict_revisions
            ):
                raise MigrationSafetyError("invalid conflict revision metadata")
            conflicts += len(conflict_revisions)
            tombstones.extend(
                _apply_writer_contract(
                    {"_id": document_id, "_rev": revision, "_deleted": True}
                )
                for revision in conflict_revisions
            )

        if document_id == RUNNING_ACTIVITY_ID:
            running_timer_present = True

        is_reference_document = kind in {"task", "activity"} or document_id == RUNNING_ACTIVITY_ID
        if not is_reference_document:
            continue
        if source.get("category") not in (None, "") or source.get("categoryId") not in (
            None,
            "",
        ):
            categorized_references += 1
        migrated, changed = _migrate_reference(source, reference_ids)
        if changed:
            updates.append(migrated)
            references_migrated += 1

    counts = {
        "documentsScanned": len(documents),
        "taxonomyRecordsMigrated": taxonomy_records_migrated,
        "categorizedReferences": categorized_references,
        "referencesMigrated": references_migrated,
        "conflictLeaves": conflicts,
        "documentsUpdated": len(updates),
    }
    return MigrationPlan(
        updates=updates,
        conflict_tombstones=tombstones,
        counts=counts,
        running_timer_present=running_timer_present,
    )


def validate_backup_root(backup_root: str | Path) -> Path:
    resolved = Path(backup_root).expanduser().resolve()
    try:
        resolved.relative_to(REPOSITORY_ROOT)
    except ValueError:
        return resolved
    raise MigrationSafetyError("backup root must be outside the repository")


def _exact_artifact_path(root: Path, name: str) -> Path:
    """Resolve one private artifact immediately below its validated root."""

    path = (root / name).resolve()
    if path.parent != root or path == root:
        raise MigrationSafetyError("private artifact path escaped its approved root")
    return path


def _remove_exact_artifact(path: Path, root: Path) -> None:
    """Remove only a previously resolved direct child of the approved root."""

    resolved_path = path.resolve()
    if resolved_path.parent != root or resolved_path == root:
        raise MigrationSafetyError("refusing to remove an unverified private artifact path")
    shutil.rmtree(resolved_path, ignore_errors=True)


def _write_secure(path: Path, content: bytes) -> None:
    with path.open("xb") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    path.chmod(0o600)


def _secure_backup_directory(path: Path) -> None:
    """Restrict a backup directory to the current user on the host platform."""

    path.chmod(0o700)
    if os.name != "nt":
        return

    try:
        identity = subprocess.run(
            ["whoami", "/user", "/fo", "csv", "/nh"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        row = next(csv.reader([identity.stdout.strip()]))
        sid = row[1].strip()
        if not sid.startswith("S-1-"):
            raise ValueError
        subprocess.run(
            [
                "icacls",
                str(path),
                "/inheritance:r",
                "/grant:r",
                f"*{sid}:(OI)(CI)F",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, ValueError, IndexError, StopIteration, subprocess.SubprocessError) as error:
        raise MigrationSafetyError("could not enforce user-only backup permissions") from error


def _ndjson_bytes(documents: Iterable[Mapping[str, Any]]) -> bytes:
    rows = [_canonical_json(document) for document in documents]
    return (("\n".join(rows) + "\n") if rows else "").encode("utf-8")


def _backup_checksum(manifest_without_checksum: Mapping[str, Any]) -> str:
    return _sha256_bytes(_canonical_json(manifest_without_checksum).encode("utf-8"))


def create_backup(
    client: Any,
    database: str,
    database_info: Mapping[str, Any],
    winners: Sequence[Mapping[str, Any]],
    backup_root: str | Path,
    *,
    timestamp: str | None = None,
) -> BackupResult:
    """Write winners and every losing conflict leaf, then verify all checksums."""

    _ensure_exact_database(database)
    root = validate_backup_root(backup_root)
    timestamp = timestamp or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")

    conflict_leaves: list[dict[str, Any]] = []
    conflict_revisions: list[dict[str, str]] = []
    for winner in winners:
        document_id = winner.get("_id")
        for revision in winner.get("_conflicts", []) or []:
            leaf = client.get_revision(database, document_id, revision)
            if leaf.get("_id") != document_id or leaf.get("_rev") != revision:
                raise MigrationSafetyError("conflict leaf revision did not match its request")
            conflict_leaves.append(leaf)
            conflict_revisions.append({"id": document_id, "revision": revision})

    root.mkdir(parents=True, exist_ok=True)
    backup_path = _exact_artifact_path(root, f"fortudo-taxonomy-identity-{timestamp}")
    try:
        backup_path.mkdir(mode=0o700)
    except FileExistsError as error:
        raise MigrationSafetyError("backup directory already exists") from error
    try:
        _secure_backup_directory(backup_path)
    except Exception:
        _remove_exact_artifact(backup_path, root)
        raise

    winners_bytes = _ndjson_bytes(winners)
    conflicts_bytes = _ndjson_bytes(conflict_leaves)
    manifest_base = {
        "formatVersion": 1,
        "databaseName": database,
        "databaseUpdateSeq": database_info.get("update_seq"),
        "databaseDocCount": database_info.get("doc_count"),
        "databaseDeletedDocCount": database_info.get("doc_del_count"),
        "createdAt": timestamp,
        "winnerCount": len(winners),
        "conflictLeafCount": len(conflict_leaves),
        "winningRevisions": [
            {"id": winner.get("_id"), "revision": winner.get("_rev")} for winner in winners
        ],
        "conflictRevisions": conflict_revisions,
        "files": {
            "winning-documents.ndjson": _sha256_bytes(winners_bytes),
            "conflict-leaves.ndjson": _sha256_bytes(conflicts_bytes),
        },
    }
    checksum = _backup_checksum(manifest_base)
    manifest = {**manifest_base, "backupChecksum": checksum}

    try:
        _write_secure(backup_path / "winning-documents.ndjson", winners_bytes)
        _write_secure(backup_path / "conflict-leaves.ndjson", conflicts_bytes)
        _write_secure(
            backup_path / "manifest.json",
            (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8"),
        )
        verify_backup(backup_path)
    except Exception:
        _remove_exact_artifact(backup_path, root)
        raise
    return BackupResult(path=backup_path, checksum=checksum)


def _load_ndjson(path: Path) -> list[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as stream:
            return [json.loads(line) for line in stream if line.strip()]
    except (OSError, json.JSONDecodeError) as error:
        raise MigrationSafetyError("backup data is unreadable") from error


def verify_backup(backup_path: str | Path) -> dict[str, Any]:
    path = Path(backup_path).resolve()
    try:
        with (path / "manifest.json").open("r", encoding="utf-8") as stream:
            manifest = json.load(stream)
    except (OSError, json.JSONDecodeError) as error:
        raise MigrationSafetyError("backup manifest is unreadable") from error

    if manifest.get("databaseName") != EXPECTED_DATABASE_NAME:
        raise MigrationSafetyError("backup database name does not match production")
    for filename in ("winning-documents.ndjson", "conflict-leaves.ndjson"):
        try:
            content = (path / filename).read_bytes()
        except OSError as error:
            raise MigrationSafetyError("backup data file is unreadable") from error
        if _sha256_bytes(content) != manifest.get("files", {}).get(filename):
            raise MigrationSafetyError("backup file checksum mismatch")

    winners = _load_ndjson(path / "winning-documents.ndjson")
    conflicts = _load_ndjson(path / "conflict-leaves.ndjson")
    if len(winners) != manifest.get("winnerCount") or len(conflicts) != manifest.get(
        "conflictLeafCount"
    ):
        raise MigrationSafetyError("backup row count mismatch")
    expected_revisions = {
        (row.get("id"), row.get("revision")) for row in manifest.get("conflictRevisions", [])
    }
    actual_revisions = {(row.get("_id"), row.get("_rev")) for row in conflicts}
    if expected_revisions != actual_revisions:
        raise MigrationSafetyError("backup conflict leaf set mismatch")
    expected_winners = {
        (row.get("id"), row.get("revision")) for row in manifest.get("winningRevisions", [])
    }
    actual_winners = {(row.get("_id"), row.get("_rev")) for row in winners}
    if expected_winners != actual_winners:
        raise MigrationSafetyError("backup winning revision set mismatch")

    checksum = manifest.get("backupChecksum")
    manifest_base = dict(manifest)
    manifest_base.pop("backupChecksum", None)
    if checksum != _backup_checksum(manifest_base):
        raise MigrationSafetyError("backup manifest checksum mismatch")
    return manifest


def _validate_database_info(database: str, database_info: Mapping[str, Any]) -> None:
    _ensure_exact_database(database)
    if database_info.get("db_name") != database:
        raise MigrationSafetyError("Cloudant reported a different database name")
    if not isinstance(database_info.get("update_seq"), str):
        raise MigrationSafetyError("Cloudant did not report an opaque update_seq string")


def _validate_locked_state(
    *,
    expected_update_seq: str,
    database_info: Mapping[str, Any],
    original_winners: Sequence[Mapping[str, Any]],
    current_winners: Sequence[Mapping[str, Any]],
) -> None:
    if database_info.get("update_seq") != expected_update_seq:
        raise MigrationSafetyError("update_seq changed after the dry-run")
    original_revisions = {row.get("_id"): row.get("_rev") for row in original_winners}
    current_revisions = {row.get("_id"): row.get("_rev") for row in current_winners}
    if original_revisions != current_revisions:
        raise MigrationSafetyError("winning document revisions changed after backup")


def _bulk_write_checked(client: Any, database: str, documents: list[dict[str, Any]]) -> None:
    if not documents:
        return
    results = client.bulk_docs(database, documents)
    if len(results) != len(documents) or any(not result.get("ok") for result in results):
        raise MigrationSafetyError("Cloudant bulk write did not commit every requested revision")


def create_migration_journal(
    documents: Sequence[Mapping[str, Any]],
    journal_root: str | Path,
    *,
    timestamp: str | None = None,
) -> Path:
    root = validate_backup_root(journal_root)
    timestamp = timestamp or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    path = _exact_artifact_path(root, f"fortudo-taxonomy-migration-journal-{timestamp}")
    entries = []
    seen: set[tuple[str, str]] = set()
    for document in documents:
        document_id = document.get("_id")
        pre_revision = document.get("_rev")
        if not isinstance(document_id, str) or not isinstance(pre_revision, str):
            raise MigrationSafetyError("journal entry is missing its locked pre-revision")
        identity = (document_id, pre_revision)
        if identity in seen:
            raise MigrationSafetyError("journal contains a duplicate pre-revision")
        seen.add(identity)
        intended = copy.deepcopy(dict(document))
        entries.append(
            {
                "documentId": document_id,
                "preRevision": pre_revision,
                "intendedBody": intended,
                "intendedBodyChecksum": _sha256_bytes(
                    _canonical_json(intended).encode("utf-8")
                ),
            }
        )
    manifest_base = {
        "formatVersion": 1,
        "databaseName": EXPECTED_DATABASE_NAME,
        "createdAt": timestamp,
        "entryCount": len(entries),
        "entries": entries,
    }
    manifest = {**manifest_base, "manifestChecksum": _backup_checksum(manifest_base)}
    try:
        path.mkdir(parents=True, mode=0o700)
        _secure_backup_directory(path)
        _write_secure(
            path / "journal.json",
            (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8"),
        )
    except FileExistsError as error:
        raise MigrationSafetyError("migration journal already exists") from error
    except Exception:
        _remove_exact_artifact(path, root)
        raise
    return path


def _load_migration_journal(journal_path: str | Path) -> dict[str, Any]:
    path = Path(journal_path).resolve()
    try:
        manifest = json.loads((path / "journal.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise MigrationSafetyError("migration journal is unreadable") from error
    unsigned = dict(manifest)
    checksum = unsigned.pop("manifestChecksum", None)
    if checksum != _backup_checksum(unsigned):
        raise MigrationSafetyError("migration journal checksum mismatch")
    if manifest.get("databaseName") != EXPECTED_DATABASE_NAME or manifest.get(
        "entryCount"
    ) != len(manifest.get("entries", [])):
        raise MigrationSafetyError("migration journal metadata is invalid")
    for entry in manifest["entries"]:
        if entry.get("intendedBodyChecksum") != _sha256_bytes(
            _canonical_json(entry.get("intendedBody")).encode("utf-8")
        ):
            raise MigrationSafetyError("migration journal body checksum mismatch")
    return manifest


def _without_revision(document: Mapping[str, Any]) -> dict[str, Any]:
    body = copy.deepcopy(dict(document))
    body.pop("_rev", None)
    body.pop("_revisions", None)
    body.pop("_conflicts", None)
    return body


def _classify_journal_entry(
    client: Any, database: str, entry: Mapping[str, Any]
) -> str:
    document_id = entry["documentId"]
    pre_revision = entry["preRevision"]
    intended = entry["intendedBody"]
    leaves, winners = client.get_current_leaf_graph(database)
    matching = [leaf for leaf in leaves if leaf.get("_id") == document_id]
    if any(leaf.get("_rev") == pre_revision for leaf in matching):
        return "locked-pre-state"
    intended_body = _without_revision(intended)
    if intended.get("_deleted"):
        # CouchDB may retain only special fields in a stored deletion stub. A deleted
        # successor is exact because the locked pre-revision can have only one child.
        if any(leaf.get("_deleted") for leaf in matching):
            return "exact-intended-result"
    else:
        winner_revision = winners.get(document_id)
        winner = next((leaf for leaf in matching if leaf.get("_rev") == winner_revision), None)
        if winner is not None and _without_revision(winner) == intended_body:
            return "exact-intended-result"
    return "divergent"


def apply_or_resume_journal(
    client: Any, *, database: str, journal_path: str | Path
) -> dict[str, int]:
    _ensure_exact_database(database)
    journal = _load_migration_journal(journal_path)
    classifications = [
        _classify_journal_entry(client, database, entry) for entry in journal["entries"]
    ]
    if "divergent" in classifications:
        raise MigrationSafetyError("journaled operation encountered divergent state")

    pending = [
        copy.deepcopy(entry["intendedBody"])
        for entry, state in zip(journal["entries"], classifications, strict=True)
        if state == "locked-pre-state"
    ]
    if pending:
        # Bulk responses are advisory. Exact rereads below establish what actually committed.
        client.bulk_docs(database, pending)

    final = [_classify_journal_entry(client, database, entry) for entry in journal["entries"]]
    if "divergent" in final:
        raise MigrationSafetyError("journaled operation diverged after a partial write")
    if "locked-pre-state" in final:
        raise MigrationSafetyError("journaled operation remains incomplete and is safe to resume")
    return {
        "exactIntendedResults": final.count("exact-intended-result"),
        "resumedPreStates": classifications.count("locked-pre-state"),
    }


def _without_identity(document: Mapping[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(dict(document))
    result.pop("_rev", None)
    result.pop("_conflicts", None)
    result.pop("writerContract", None)
    if result.get("category") is None:
        result.pop("category", None)
    result.pop("categoryId", None)
    result.pop("categoryIdentityVersion", None)
    if result.get("_id") == TAXONOMY_DOCUMENT_ID:
        result.pop("identityVersion", None)
        for row in [*result.get("groups", []), *result.get("categories", [])]:
            for field_name in ("id", "groupId", "legacyKeys", "status", "archivedAt"):
                row.pop(field_name, None)
    return result


def _verify_post_migration(
    before: Sequence[Mapping[str, Any]], after: Sequence[Mapping[str, Any]]
) -> None:
    after_by_id = {row.get("_id"): row for row in after}
    for original in before:
        if original.get("_id") == MIGRATION_COMPLETION_ID:
            continue
        current = after_by_id.get(original.get("_id"))
        if current is None or _without_identity(current) != _without_identity(original):
            raise MigrationSafetyError("post-migration nonidentity invariant failed")

    remaining = build_migration_plan(after)
    if remaining.updates or remaining.conflict_tombstones:
        raise MigrationSafetyError("post-migration identity or conflict invariant failed")
    if MIGRATION_COMPLETION_ID in after_by_id:
        raise MigrationSafetyError("completion marker was written before data verification")


def _attachment_digests(document: Mapping[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for name, attachment in sorted((document.get("_attachments") or {}).items()):
        digest = attachment.get("digest") if isinstance(attachment, Mapping) else None
        if isinstance(digest, str):
            result[name] = digest
        elif isinstance(attachment, Mapping) and isinstance(attachment.get("data"), str):
            result[name] = _sha256_bytes(attachment["data"].encode("utf-8"))
        else:
            raise MigrationSafetyError("attachment digest metadata is incomplete")
    return result


def compute_verified_state_fingerprint(
    client: Any, database: str, validator_revision: str
) -> tuple[str, dict[str, int]]:
    leaves, _winners = client.get_current_leaf_graph(database)
    filtered = [leaf for leaf in leaves if leaf.get("_id") != MIGRATION_COMPLETION_ID]
    identities = [(leaf.get("_id"), leaf.get("_rev")) for leaf in filtered]
    if len(identities) != len(set(identities)):
        raise MigrationSafetyError("verified leaf graph contains duplicate identities")
    id_counts: dict[str, int] = {}
    canonical_leaves = []
    for leaf in sorted(filtered, key=lambda row: (str(row.get("_id")), str(row.get("_rev")))):
        document_id = leaf.get("_id")
        revision = leaf.get("_rev")
        if not isinstance(document_id, str) or not isinstance(revision, str):
            raise MigrationSafetyError("verified leaf graph contains an invalid identity")
        id_counts[document_id] = id_counts.get(document_id, 0) + 1
        body = copy.deepcopy(dict(leaf))
        body.pop("_conflicts", None)
        canonical_leaves.append(
            {
                "documentId": document_id,
                "leafRevision": revision,
                "deleted": bool(leaf.get("_deleted")),
                "body": body,
                "attachmentDigests": _attachment_digests(leaf),
            }
        )
    counts = {
        "leafCount": len(filtered),
        "liveLeafCount": sum(not bool(leaf.get("_deleted")) for leaf in filtered),
        "deletedLeafCount": sum(bool(leaf.get("_deleted")) for leaf in filtered),
        "conflictedDocumentCount": sum(count > 1 for count in id_counts.values()),
    }
    fingerprint_body = {
        "validatorRevision": validator_revision,
        "counts": counts,
        "leaves": canonical_leaves,
    }
    return _sha256_bytes(_canonical_json(fingerprint_body).encode("utf-8")), counts


def _validate_snapshot_and_fence(
    client: Any,
    *,
    database: str,
    expected_update_seq: str,
    snapshot_path: str | Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    # Lazy import avoids a module cycle: the operations module reuses this file's HTTP client.
    from scripts.document_contract_ops import verify_snapshot, verify_validator

    snapshot = verify_snapshot(snapshot_path)
    if (
        snapshot.get("databaseName") != database
        or snapshot.get("databaseUpdateSeq") != expected_update_seq
        or snapshot.get("label") != "S1"
    ):
        raise MigrationSafetyError("S1 snapshot does not match the locked migration state")
    validator = verify_validator(client, database)
    if validator.get("state") != "compatible":
        raise MigrationSafetyError("compatible document validator is not installed")
    if snapshot.get("validatorRevision") != validator.get("validatorRevision"):
        raise MigrationSafetyError("validator revision differs from S1")
    return snapshot, validator


def apply_migration(
    client: Any,
    *,
    database: str,
    expected_update_seq: str,
    confirmation: str,
    snapshot_path: str | Path,
    journal_path: str | Path | None = None,
    timestamp: str | None = None,
) -> MigrationResult:
    _ensure_exact_database(database)
    if confirmation != database:
        raise MigrationSafetyError("typed database confirmation did not match")
    info = client.get_database_info(database)
    _validate_database_info(database, info)
    if info["update_seq"] != expected_update_seq:
        raise MigrationSafetyError("update_seq changed after the dry-run")

    snapshot, validator = _validate_snapshot_and_fence(
        client,
        database=database,
        expected_update_seq=expected_update_seq,
        snapshot_path=snapshot_path,
    )

    winners = client.get_all_documents(database, include_conflicts=True)
    plan = build_migration_plan(winners)
    if plan.running_timer_present:
        raise MigrationSafetyError("running timer must be stopped before production migration")

    existing_completion = next(
        (row for row in winners if row.get("_id") == MIGRATION_COMPLETION_ID), None
    )
    if existing_completion is not None:
        raise MigrationSafetyError("completion marker already exists; manual verification is required")

    locked_info = client.get_database_info(database)
    _validate_database_info(database, locked_info)
    locked_winners = client.get_all_documents(database, include_conflicts=True)
    _validate_locked_state(
        expected_update_seq=expected_update_seq,
        database_info=locked_info,
        original_winners=winners,
        current_winners=locked_winners,
    )

    writes = [*plan.updates, *plan.conflict_tombstones]
    if journal_path is None:
        journal_path = create_migration_journal(
            writes,
            Path(snapshot_path).resolve().parent,
            timestamp=timestamp,
        )
    journal = _load_migration_journal(journal_path)
    if [entry["intendedBody"] for entry in journal["entries"]] != writes:
        raise MigrationSafetyError("migration journal does not match the current dry-run")
    apply_or_resume_journal(client, database=database, journal_path=journal_path)
    post_winners = client.get_all_documents(database, include_conflicts=True)
    _verify_post_migration(winners, post_winners)

    fingerprint, verified_counts = compute_verified_state_fingerprint(
        client, database, validator["validatorRevision"]
    )
    repeated_fingerprint, repeated_counts = compute_verified_state_fingerprint(
        client, database, validator["validatorRevision"]
    )
    if fingerprint != repeated_fingerprint or verified_counts != repeated_counts:
        raise MigrationSafetyError("verified state changed before completion")

    completion = _apply_writer_contract({
        "_id": MIGRATION_COMPLETION_ID,
        "id": MIGRATION_COMPLETION_ID,
        "docType": "config",
        "migration": "taxonomy-identity-v1",
        "completedAt": timestamp or datetime.now(UTC).isoformat(),
        "s1SnapshotChecksum": snapshot["manifestChecksum"],
        "verifiedStateFingerprint": fingerprint,
        "validatorRevision": validator["validatorRevision"],
        "counts": plan.counts,
        "verifiedCounts": verified_counts,
    })
    completion_intent = {
        "formatVersion": 1,
        "documentId": MIGRATION_COMPLETION_ID,
        "preRevision": None,
        "intendedBody": completion,
        "intendedBodyChecksum": _sha256_bytes(
            _canonical_json(completion).encode("utf-8")
        ),
    }
    completion_intent["intentChecksum"] = _backup_checksum(completion_intent)
    completion_intent_path = Path(journal_path) / "completion-intent.json"
    if completion_intent_path.exists():
        try:
            existing_intent = json.loads(completion_intent_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise MigrationSafetyError("completion intent journal is unreadable") from error
        if existing_intent != completion_intent:
            raise MigrationSafetyError("completion intent journal diverges from verified state")
    else:
        _write_secure(
            completion_intent_path,
            (json.dumps(completion_intent, indent=2, sort_keys=True) + "\n").encode("utf-8"),
        )
    marker_result = client.put_document(database, completion)
    if not marker_result.get("ok") or not isinstance(marker_result.get("rev"), str):
        raise MigrationSafetyError("completion marker write conflicted or failed")
    stored_marker = client.get_document(database, MIGRATION_COMPLETION_ID)
    if (
        stored_marker is None
        or stored_marker.get("verifiedStateFingerprint") != fingerprint
        or stored_marker.get("s1SnapshotChecksum") != snapshot["manifestChecksum"]
    ):
        raise MigrationSafetyError("completion marker reread failed")
    final_fingerprint, final_counts = compute_verified_state_fingerprint(
        client, database, validator["validatorRevision"]
    )
    if final_fingerprint != fingerprint or final_counts != verified_counts:
        raise MigrationSafetyError("verified state changed after completion")
    final_winners = client.get_all_documents(database, include_conflicts=True)
    final_without_marker = [
        document for document in final_winners if document.get("_id") != MIGRATION_COMPLETION_ID
    ]
    remaining = build_migration_plan(final_without_marker)
    if remaining.updates or remaining.conflict_tombstones:
        raise MigrationSafetyError("post-completion invariants are incomplete")
    return MigrationResult(
        mode="apply",
        update_seq=expected_update_seq,
        counts=plan.counts,
        backup_path=Path(snapshot_path).resolve(),
        backup_checksum=snapshot["manifestChecksum"],
        journal_path=Path(journal_path).resolve(),
    )


def restore_backup(
    client: Any,
    *,
    database: str,
    expected_update_seq: str,
    confirmation: str,
    backup_path: str | Path,
) -> MigrationResult:
    raise MigrationSafetyError(
        "direct production restore is disabled; reconstruct a validator-last quarantine database"
    )


class CloudantClient:
    """Small standard-library Cloudant client with credential-redacted errors."""

    def __init__(self, credential_url: str) -> None:
        parsed = urllib.parse.urlsplit(credential_url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise MigrationSafetyError("Cloudant credential URL must use HTTPS")
        port = f":{parsed.port}" if parsed.port else ""
        self._base_url = urllib.parse.urlunsplit(
            (parsed.scheme, f"{parsed.hostname}{port}", parsed.path.rstrip("/"), "", "")
        )
        if parsed.username is None or parsed.password is None:
            raise MigrationSafetyError("Cloudant credential URL is missing credentials")
        token = base64.b64encode(
            f"{urllib.parse.unquote(parsed.username)}:{urllib.parse.unquote(parsed.password)}".encode()
        ).decode("ascii")
        self._authorization = f"Basic {token}"

    def _request(
        self,
        operation: str,
        path: str,
        *,
        method: str = "GET",
        body: Mapping[str, Any] | None = None,
    ) -> Any:
        data = _canonical_json(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            f"{self._base_url}/{path.lstrip('/')}",
            data=data,
            method=method,
            headers={
                "Authorization": self._authorization,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raise MigrationSafetyError(
                f"Cloudant request failed with HTTP {error.code} during {operation}"
            ) from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            raise MigrationSafetyError(f"Cloudant request failed during {operation}") from None

    def get_database_info(self, database: str) -> dict[str, Any]:
        return self._request("database metadata read", urllib.parse.quote(database, safe=""))

    def get_all_documents(self, database: str, *, include_conflicts: bool) -> list[dict[str, Any]]:
        query = "include_docs=true"
        if include_conflicts:
            query += "&conflicts=true"
        payload = self._request(
            "winning document read",
            f"{urllib.parse.quote(database, safe='')}/_all_docs?{query}",
        )
        return [row["doc"] for row in payload.get("rows", []) if row.get("doc")]

    def get_revision(self, database: str, document_id: str, revision: str) -> dict[str, Any]:
        path = (
            f"{urllib.parse.quote(database, safe='')}/"
            f"{urllib.parse.quote(document_id, safe='')}?rev={urllib.parse.quote(revision, safe='')}"
        )
        return self._request("conflict leaf read", path)

    def get_document(self, database: str, document_id: str) -> dict[str, Any] | None:
        path = f"{urllib.parse.quote(database, safe='')}/{urllib.parse.quote(document_id, safe='')}"
        try:
            return self._request("document revision read", path)
        except MigrationSafetyError as error:
            if "HTTP 404" in str(error):
                return None
            raise

    def get_current_leaf_graph(
        self, database: str
    ) -> tuple[list[dict[str, Any]], dict[str, str]]:
        encoded = urllib.parse.quote(database, safe="")
        changes = self._request(
            "verified leaf inventory", f"{encoded}/_changes?since=0&style=all_docs"
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
                leaves.append(self._request("verified leaf read", path))
        winner_payload = self._request("verified winner read", f"{encoded}/_all_docs")
        winners = {
            row["id"]: row["value"]["rev"]
            for row in winner_payload.get("rows", [])
            if isinstance(row.get("value", {}).get("rev"), str)
        }
        return leaves, winners

    def put_document(self, database: str, document: Mapping[str, Any]) -> dict[str, Any]:
        return self._request(
            "guarded single document write",
            f"{urllib.parse.quote(database, safe='')}/"
            f"{urllib.parse.quote(str(document['_id']), safe='')}",
            method="PUT",
            body=document,
        )

    def bulk_docs(self, database: str, documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return self._request(
            "guarded bulk write",
            f"{urllib.parse.quote(database, safe='')}/_bulk_docs",
            method="POST",
            body={"docs": documents},
        )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True)
    parser.add_argument("--backup-root")
    parser.add_argument("--s1-snapshot")
    parser.add_argument("--journal")
    parser.add_argument("--expected-update-seq")
    parser.add_argument("--confirm-database")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true")
    return parser


def _safe_report(result: MigrationResult, *, running_timer_present: bool = False) -> None:
    report = {
        "mode": result.mode,
        "counts": result.counts,
        "runningTimerPresent": running_timer_present,
    }
    if result.backup_path is not None:
        report["s1SnapshotChecksum"] = result.backup_checksum
    print(json.dumps(report, indent=2, sort_keys=True))


def execute(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    client_factory: Callable[[str], Any] = CloudantClient,
) -> MigrationResult:
    args = _parser().parse_args(argv)
    _ensure_exact_database(args.database)
    environment = os.environ if environ is None else environ
    credential_url = environment.get(CREDENTIAL_ENV_VAR)
    if not credential_url:
        raise MigrationSafetyError(
            f"required credential environment variable {CREDENTIAL_ENV_VAR} is unset"
        )
    client = client_factory(credential_url)

    if args.apply:
        if not args.expected_update_seq or not args.confirm_database or not args.s1_snapshot:
            raise MigrationSafetyError(
                "apply requires --expected-update-seq, --confirm-database, and --s1-snapshot"
            )
        result = apply_migration(
            client,
            database=args.database,
            expected_update_seq=args.expected_update_seq,
            confirmation=args.confirm_database,
            snapshot_path=args.s1_snapshot,
            journal_path=args.journal,
        )
        _safe_report(result)
        return result

    info = client.get_database_info(args.database)
    _validate_database_info(args.database, info)
    winners = client.get_all_documents(args.database, include_conflicts=True)
    plan = build_migration_plan(winners)
    result = MigrationResult(mode="dry-run", update_seq=info["update_seq"], counts=plan.counts)
    _safe_report(result, running_timer_present=plan.running_timer_present)
    return result


def main() -> int:
    try:
        execute()
    except MigrationSafetyError as error:
        print(f"Migration blocked: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

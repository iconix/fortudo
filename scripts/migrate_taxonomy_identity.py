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

    return migrated if changed else copy.deepcopy(dict(taxonomy)), changed_records


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
    return migrated, changed


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
                {"_id": document_id, "_rev": revision, "_deleted": True}
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
    backup_path = root / f"fortudo-taxonomy-identity-{timestamp}"
    try:
        backup_path.mkdir(mode=0o700)
    except FileExistsError as error:
        raise MigrationSafetyError("backup directory already exists") from error
    try:
        _secure_backup_directory(backup_path)
    except Exception:
        shutil.rmtree(backup_path, ignore_errors=True)
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
        shutil.rmtree(backup_path, ignore_errors=True)
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


def _without_identity(document: Mapping[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(dict(document))
    result.pop("_rev", None)
    result.pop("_conflicts", None)
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
        current = after_by_id.get(original.get("_id"))
        if current is None or _without_identity(current) != _without_identity(original):
            raise MigrationSafetyError("post-migration nonidentity invariant failed")

    remaining = build_migration_plan(after)
    if remaining.updates or remaining.conflict_tombstones:
        raise MigrationSafetyError("post-migration identity or conflict invariant failed")
    if MIGRATION_COMPLETION_ID not in after_by_id:
        raise MigrationSafetyError("migration completion marker is missing")


def apply_migration(
    client: Any,
    *,
    database: str,
    expected_update_seq: str,
    confirmation: str,
    backup_root: str | Path,
    timestamp: str | None = None,
) -> MigrationResult:
    _ensure_exact_database(database)
    if confirmation != database:
        raise MigrationSafetyError("typed database confirmation did not match")
    info = client.get_database_info(database)
    _validate_database_info(database, info)
    if info["update_seq"] != expected_update_seq:
        raise MigrationSafetyError("update_seq changed after the dry-run")

    winners = client.get_all_documents(database, include_conflicts=True)
    plan = build_migration_plan(winners)
    if plan.running_timer_present:
        raise MigrationSafetyError("running timer must be stopped before production migration")

    existing_completion = next(
        (row for row in winners if row.get("_id") == MIGRATION_COMPLETION_ID), None
    )
    if existing_completion is not None:
        checksum = existing_completion.get("backupChecksum")
        if (
            existing_completion.get("migration") != "taxonomy-identity-v1"
            or not isinstance(checksum, str)
            or len(checksum) != 64
            or any(character not in "0123456789abcdef" for character in checksum.lower())
        ):
            raise MigrationSafetyError("existing migration completion marker is invalid")

    if not plan.updates and not plan.conflict_tombstones and existing_completion is not None:
        locked_info = client.get_database_info(database)
        _validate_database_info(database, locked_info)
        locked_winners = client.get_all_documents(database, include_conflicts=True)
        _validate_locked_state(
            expected_update_seq=expected_update_seq,
            database_info=locked_info,
            original_winners=winners,
            current_winners=locked_winners,
        )
        locked_plan = build_migration_plan(locked_winners)
        if locked_plan.running_timer_present:
            raise MigrationSafetyError("running timer must be stopped before production migration")
        if locked_plan.updates or locked_plan.conflict_tombstones:
            raise MigrationSafetyError("migration state changed during idempotency verification")
        return MigrationResult(
            mode="apply",
            update_seq=expected_update_seq,
            counts=locked_plan.counts,
            backup_checksum=existing_completion["backupChecksum"],
        )

    backup = create_backup(client, database, info, winners, backup_root, timestamp=timestamp)
    locked_info = client.get_database_info(database)
    _validate_database_info(database, locked_info)
    locked_winners = client.get_all_documents(database, include_conflicts=True)
    _validate_locked_state(
        expected_update_seq=expected_update_seq,
        database_info=locked_info,
        original_winners=winners,
        current_winners=locked_winners,
    )

    completion = {
        "_id": MIGRATION_COMPLETION_ID,
        "id": MIGRATION_COMPLETION_ID,
        "docType": "config",
        "migration": "taxonomy-identity-v1",
        "completedAt": timestamp or datetime.now(UTC).isoformat(),
        "databaseUpdateSeq": expected_update_seq,
        "backupChecksum": backup.checksum,
        "counts": plan.counts,
    }
    if existing_completion and existing_completion.get("_rev"):
        completion["_rev"] = existing_completion["_rev"]

    writes = [*plan.updates, *plan.conflict_tombstones, completion]
    _bulk_write_checked(client, database, writes)
    post_winners = client.get_all_documents(database, include_conflicts=True)
    _verify_post_migration(winners, post_winners)
    return MigrationResult(
        mode="apply",
        update_seq=expected_update_seq,
        counts=plan.counts,
        backup_path=backup.path,
        backup_checksum=backup.checksum,
    )


def restore_backup(
    client: Any,
    *,
    database: str,
    expected_update_seq: str,
    confirmation: str,
    backup_path: str | Path,
) -> MigrationResult:
    _ensure_exact_database(database)
    if confirmation != database:
        raise MigrationSafetyError("typed database confirmation did not match")
    manifest = verify_backup(backup_path)
    info = client.get_database_info(database)
    _validate_database_info(database, info)
    if info["update_seq"] != expected_update_seq:
        raise MigrationSafetyError("update_seq changed before restore")

    original_winners = _load_ndjson(Path(backup_path) / "winning-documents.ndjson")
    restored: list[dict[str, Any]] = []
    for original in original_winners:
        document = copy.deepcopy(original)
        document.pop("_conflicts", None)
        current = client.get_document(database, document["_id"])
        if current and current.get("_rev"):
            document["_rev"] = current["_rev"]
        else:
            document.pop("_rev", None)
        restored.append(document)
    _bulk_write_checked(client, database, restored)
    return MigrationResult(
        mode="restore",
        update_seq=expected_update_seq,
        counts={"documentsRestored": len(restored)},
        backup_path=Path(backup_path).resolve(),
        backup_checksum=manifest["backupChecksum"],
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
    parser.add_argument("--expected-update-seq")
    parser.add_argument("--confirm-database")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true")
    modes.add_argument("--restore", metavar="BACKUP_PATH")
    return parser


def _safe_report(result: MigrationResult, *, running_timer_present: bool = False) -> None:
    report = {
        "mode": result.mode,
        "databaseName": EXPECTED_DATABASE_NAME,
        "updateSeq": result.update_seq,
        "counts": result.counts,
        "runningTimerPresent": running_timer_present,
    }
    if result.backup_path is not None:
        report["backupPath"] = str(result.backup_path)
        report["backupChecksum"] = result.backup_checksum
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
        if not args.expected_update_seq or not args.confirm_database or not args.backup_root:
            raise MigrationSafetyError(
                "apply requires --expected-update-seq, --confirm-database, and --backup-root"
            )
        result = apply_migration(
            client,
            database=args.database,
            expected_update_seq=args.expected_update_seq,
            confirmation=args.confirm_database,
            backup_root=args.backup_root,
        )
        _safe_report(result)
        return result

    if args.restore:
        if not args.expected_update_seq or not args.confirm_database:
            raise MigrationSafetyError(
                "restore requires --expected-update-seq and --confirm-database"
            )
        result = restore_backup(
            client,
            database=args.database,
            expected_update_seq=args.expected_update_seq,
            confirmation=args.confirm_database,
            backup_path=args.restore,
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

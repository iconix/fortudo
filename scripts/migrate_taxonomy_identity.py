"""Read-only planner for Fortudo taxonomy identity version 1.

This command validates the exact production database and reports aggregate dry-run
counts. It has no backup, restore, or write capability. Document bodies, database
names, opaque database metadata, and credentials are never printed.
"""

from __future__ import annotations

import argparse
import base64
import copy
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Sequence


CREDENTIAL_ENV_VAR = "FORTUDO_CLOUDANT_URL"
TAXONOMY_DOCUMENT_ID = "config-categories"
RUNNING_ACTIVITY_ID = "config-running-activity"
TAXONOMY_IDENTITY_VERSION = 1
DOCUMENT_CONTRACT_VERSION = 1
TAXONOMY_NAMESPACE = uuid.UUID("8e2e8b7a-5c3f-4f3e-9c5d-7a1b2e4f6c80")


class MigrationSafetyError(RuntimeError):
    """Raised when a read-only migration-planning precondition is not satisfied."""


@dataclass(frozen=True)
class MigrationPlan:
    updates: list[dict[str, Any]]
    conflict_tombstones: list[dict[str, Any]]
    counts: dict[str, int]
    running_timer_present: bool


@dataclass(frozen=True)
class MigrationResult:
    mode: str
    counts: dict[str, int]


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


def _ensure_fortudo_database(database: str) -> None:
    if not re.fullmatch(r"fortudo-[a-z0-9][a-z0-9-]*", database):
        raise MigrationSafetyError("database name is outside the Fortudo namespace")


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


class CloudantClient:
    """Small read-only Cloudant client with credential-redacted errors."""

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

    def _request(self, operation: str, path: str) -> Any:
        request = urllib.request.Request(
            f"{self._base_url}/{path.lstrip('/')}",
            method="GET",
            headers={"Authorization": self._authorization, "Accept": "application/json"},
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
        payload = self._request("database metadata read", urllib.parse.quote(database, safe=""))
        if not isinstance(payload, Mapping):
            raise MigrationSafetyError("Cloudant returned an invalid database metadata response")
        return dict(payload)

    def get_all_documents(self, database: str, *, include_conflicts: bool) -> list[dict[str, Any]]:
        query = "include_docs=true"
        if include_conflicts:
            query += "&conflicts=true"
        payload = self._request(
            "winning document read",
            f"{urllib.parse.quote(database, safe='')}/_all_docs?{query}",
        )
        if not isinstance(payload, Mapping) or not isinstance(payload.get("rows"), list):
            raise MigrationSafetyError("Cloudant returned an invalid winning document response")
        documents: list[dict[str, Any]] = []
        for row in payload["rows"]:
            if not isinstance(row, Mapping):
                raise MigrationSafetyError(
                    "Cloudant returned an invalid winning document response"
                )
            document = row.get("doc")
            if document is None:
                continue
            if not isinstance(document, Mapping):
                raise MigrationSafetyError(
                    "Cloudant returned an invalid winning document response"
                )
            documents.append(dict(document))
        return documents


def _validate_database_info(database: str, database_info: Mapping[str, Any]) -> None:
    _ensure_fortudo_database(database)
    if database_info.get("db_name") != database:
        raise MigrationSafetyError("Cloudant reported a different database name")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True)
    return parser


def _safe_report(result: MigrationResult, *, running_timer_present: bool) -> None:
    print(
        json.dumps(
            {
                "mode": result.mode,
                "counts": result.counts,
                "runningTimerPresent": running_timer_present,
            },
            indent=2,
            sort_keys=True,
        )
    )


def execute(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    client_factory: Callable[[str], Any] = CloudantClient,
) -> MigrationResult:
    args = _parser().parse_args(argv)
    _ensure_fortudo_database(args.database)
    environment = os.environ if environ is None else environ
    credential_url = environment.get(CREDENTIAL_ENV_VAR)
    if not credential_url:
        raise MigrationSafetyError(
            f"required credential environment variable {CREDENTIAL_ENV_VAR} is unset"
        )
    client = client_factory(credential_url)
    info = client.get_database_info(args.database)
    _validate_database_info(args.database, info)
    winners = client.get_all_documents(args.database, include_conflicts=True)
    plan = build_migration_plan(winners)
    result = MigrationResult(mode="dry-run", counts=plan.counts)
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

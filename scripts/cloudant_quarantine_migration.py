"""Minimal Cloudant-native quarantine and migration safety operations.

This module deliberately delegates revision-tree transfer to Cloudant replication.
It does not implement a local backup format or a reverse-restore path.
"""

from __future__ import annotations

import argparse
import copy
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.document_contract_ops import (
    CONTRACT_DESIGN_ID,
    load_design_document,
    verify_validator,
)
from scripts.migrate_taxonomy_identity import (
    CREDENTIAL_ENV_VAR,
    MigrationSafetyError,
    RUNNING_ACTIVITY_ID,
    TAXONOMY_DOCUMENT_ID,
    build_migration_plan,
)


SOURCE_DATABASE = "fortudo-dat-411"
PREVIEW_SOURCE_PATTERN = re.compile(r"fortudo-preview-quarantine-gate-[a-f0-9]{24,64}-source")
PREVIEW_QUARANTINE_PATTERN = re.compile(
    r"fortudo-preview-quarantine-gate-[a-f0-9]{24,64}-quarantine"
)
QUARANTINE_PATTERN = re.compile(r"fortudo-quarantine-[a-f0-9]{24,64}")
COMPLETION_MARKER_ID = "config-taxonomy-identity-migration-v1"
LEAF_READ_BATCH_SIZE = 100
RATE_LIMIT_RETRIES = 6
RATE_LIMIT_BASE_DELAY_SECONDS = 0.5


class QuarantineSafetyError(RuntimeError):
    """Raised when a remote mutation safety gate does not hold."""


@dataclass(frozen=True, order=True)
class LeafRevision:
    """One current non-local revision-tree leaf."""

    document_id: str
    revision: str
    deleted: bool


@dataclass(frozen=True)
class StateModel:
    """Canonical current revision state."""

    leaves: tuple[LeafRevision, ...]
    winners: tuple[tuple[str, str], ...]
    counts: dict[str, int]
    fingerprint: str


@dataclass(frozen=True)
class CaptureReceipt:
    source_database: str
    quarantine_database: str
    state: StateModel
    security_hash: str
    disposable_preview: bool = False


@dataclass(frozen=True)
class FenceReceipt:
    capture: CaptureReceipt
    validator_revision: str
    fenced_state: StateModel


@dataclass(frozen=True)
class MigrationClassification:
    complete: bool
    transitioned_updates: int
    transitioned_tombstones: int


@dataclass(frozen=True)
class MigrationExecutionResult:
    state: str
    counts: dict[str, int]
    verified_state_fingerprint: str
    marker_revision: str


class OperationalCloudantClient:
    """Small write-capable client limited to this migration's Cloudant endpoints."""

    def __init__(self, credential_url: str) -> None:
        parsed = urllib.parse.urlsplit(credential_url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise QuarantineSafetyError("Cloudant credential URL must use HTTPS")
        if parsed.username is None or parsed.password is None:
            raise QuarantineSafetyError("Cloudant credential URL is missing credentials")
        port = f":{parsed.port}" if parsed.port else ""
        self._endpoint = urllib.parse.urlunsplit(
            (parsed.scheme, f"{parsed.hostname}{port}", parsed.path.rstrip("/"), "", "")
        )
        self._username = urllib.parse.unquote(parsed.username)
        self._password = urllib.parse.unquote(parsed.password)
        token = base64.b64encode(f"{self._username}:{self._password}".encode("utf-8")).decode(
            "ascii"
        )
        self._authorization = f"Basic {token}"

    @property
    def account_checksum(self) -> str:
        """Stable non-secret binding for the credential's account endpoint."""

        return hashlib.sha256(self._endpoint.encode("utf-8")).hexdigest()

    def _request(
        self,
        method: str,
        operation: str,
        path: str,
        *,
        body: Mapping[str, Any] | None = None,
        allow_not_found: bool = False,
    ) -> Any:
        encoded_body = None
        headers = {"Authorization": self._authorization, "Accept": "application/json"}
        if body is not None:
            encoded_body = json.dumps(body, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self._endpoint}/{path.lstrip('/')}",
            data=encoded_body,
            method=method,
            headers=headers,
        )
        for attempt in range(RATE_LIMIT_RETRIES + 1):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    payload = response.read()
                return json.loads(payload) if payload else {}
            except urllib.error.HTTPError as error:
                if allow_not_found and error.code == 404:
                    return None
                if error.code == 429 and attempt < RATE_LIMIT_RETRIES:
                    delay = RATE_LIMIT_BASE_DELAY_SECONDS * (2**attempt)
                    retry_after = error.headers.get("Retry-After") if error.headers else None
                    try:
                        delay = max(delay, float(retry_after))
                    except (TypeError, ValueError):
                        pass
                    time.sleep(min(delay, 8.0))
                    continue
                raise QuarantineSafetyError(
                    f"Cloudant request failed with HTTP {error.code} during {operation}"
                ) from None
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                raise QuarantineSafetyError(
                    f"Cloudant request failed during {operation}"
                ) from None
        raise AssertionError("unreachable Cloudant retry state")

    @staticmethod
    def _database_path(database: str) -> str:
        return urllib.parse.quote(database, safe="")

    def get_document(self, database: str, document_id: str) -> dict[str, Any] | None:
        path = f"{self._database_path(database)}/{urllib.parse.quote(document_id, safe='')}"
        payload = self._request("GET", "document read", path, allow_not_found=True)
        if payload is None:
            return None
        if not isinstance(payload, Mapping):
            raise QuarantineSafetyError("Cloudant returned an invalid document response")
        return dict(payload)

    def get_security_hash(self, database: str) -> str:
        payload = self._request(
            "GET", "security read", f"{self._database_path(database)}/_security"
        )
        if not isinstance(payload, Mapping):
            raise QuarantineSafetyError("Cloudant returned an invalid security response")
        return canonical_hash(payload)

    def database_exists(self, database: str) -> bool:
        payload = self._request(
            "GET",
            "database existence read",
            self._database_path(database),
            allow_not_found=True,
        )
        if payload is None:
            return False
        if not isinstance(payload, Mapping) or payload.get("db_name") != database:
            raise QuarantineSafetyError("Cloudant reported a different database identity")
        return True

    def create_database(
        self,
        database: str,
        *,
        partitioned: bool,
        allow_disposable_preview: bool = False,
    ) -> None:
        _require_database_lifecycle_target(
            database, allow_disposable_preview=allow_disposable_preview
        )
        partition_value = "true" if partitioned else "false"
        payload = self._request(
            "PUT",
            "database create",
            f"{self._database_path(database)}?partitioned={partition_value}",
        )
        if not isinstance(payload, Mapping) or payload.get("ok") is not True:
            raise QuarantineSafetyError("Cloudant returned an invalid database create response")

    def delete_database(self, database: str, *, allow_disposable_preview: bool = False) -> None:
        _require_database_lifecycle_target(
            database, allow_disposable_preview=allow_disposable_preview
        )
        payload = self._request("DELETE", "database delete", self._database_path(database))
        if not isinstance(payload, Mapping) or payload.get("ok") is not True:
            raise QuarantineSafetyError("Cloudant returned an invalid database delete response")

    def get_security_document(self, database: str) -> dict[str, Any]:
        payload = self._request(
            "GET", "security read", f"{self._database_path(database)}/_security"
        )
        if not isinstance(payload, Mapping):
            raise QuarantineSafetyError("Cloudant returned an invalid security response")
        return dict(payload)

    def replicate_once(
        self,
        source_database: str,
        quarantine_database: str,
        *,
        allow_disposable_preview: bool = False,
    ) -> dict[str, Any]:
        """Run one non-persistent replication request.

        A timeout or disconnected response is deliberately reported as ambiguous. The caller
        retains the target and may safely rerun this request before trusting exact state equality.
        """

        body = build_replication_document(
            source_database,
            quarantine_database,
            endpoint=self._endpoint,
            username=self._username,
            password=self._password,
            allow_disposable_preview=allow_disposable_preview,
        )
        payload = self._request(
            "POST",
            "transient replication",
            "_replicate",
            body=body,
        )
        if not isinstance(payload, Mapping) or payload.get("ok") is not True:
            raise QuarantineSafetyError("Cloudant returned an invalid replication response")
        history = payload.get("history")
        if not isinstance(history, list) or not history:
            raise QuarantineSafetyError("Cloudant replication response omitted its history")
        latest = history[0]
        if not isinstance(latest, Mapping) or latest.get("doc_write_failures", 0) != 0:
            raise QuarantineSafetyError("replication completed with document write failures")
        return dict(payload)

    def put_document(
        self, database: str, document: Mapping[str, Any], *, create_only: bool = False
    ) -> dict[str, Any]:
        document_id = document.get("_id")
        if not isinstance(document_id, str) or not document_id:
            raise QuarantineSafetyError("document write is missing an ID")
        if create_only and "_rev" in document:
            raise QuarantineSafetyError("create-only document must not contain a revision")
        operation = "document create" if create_only else "document update"
        payload = self._request(
            "PUT",
            operation,
            f"{self._database_path(database)}/{urllib.parse.quote(document_id, safe='')}",
            body=document,
        )
        if not isinstance(payload, Mapping) or payload.get("ok") is not True:
            raise QuarantineSafetyError("Cloudant returned an invalid document write response")
        return dict(payload)

    def get_all_documents(self, database: str, *, include_conflicts: bool) -> list[dict[str, Any]]:
        query = "include_docs=true"
        if include_conflicts:
            query += "&conflicts=true"
        payload = self._request(
            "GET",
            "winning document read",
            f"{self._database_path(database)}/_all_docs?{query}",
        )
        if not isinstance(payload, Mapping) or not isinstance(payload.get("rows"), list):
            raise QuarantineSafetyError("Cloudant returned an invalid winning document response")
        documents: list[dict[str, Any]] = []
        for row in payload["rows"]:
            if not isinstance(row, Mapping):
                raise QuarantineSafetyError(
                    "Cloudant returned an invalid winning document response"
                )
            document = row.get("doc")
            if document is None:
                continue
            if not isinstance(document, Mapping):
                raise QuarantineSafetyError(
                    "Cloudant returned an invalid winning document response"
                )
            documents.append(dict(document))
        return documents

    def _get_current_leaf_documents(
        self, database: str, *, include_ancestry: bool
    ) -> list[dict[str, Any]]:
        database_path = self._database_path(database)
        changes = self._request(
            "GET",
            "leaf enumeration",
            f"{database_path}/_changes?since=0&style=all_docs&include_docs=false",
        )
        if not isinstance(changes, Mapping) or not isinstance(changes.get("results"), list):
            raise QuarantineSafetyError("Cloudant returned an invalid leaf enumeration")
        expected: set[tuple[str, str]] = set()
        for row in changes["results"]:
            document_id = row.get("id") if isinstance(row, Mapping) else None
            revision_rows = row.get("changes") if isinstance(row, Mapping) else None
            if (
                not isinstance(document_id, str)
                or not isinstance(revision_rows, list)
                or not revision_rows
            ):
                raise QuarantineSafetyError("Cloudant returned an invalid leaf enumeration")
            for revision_row in revision_rows:
                revision = revision_row.get("rev") if isinstance(revision_row, Mapping) else None
                identity = (document_id, revision)
                if not isinstance(revision, str) or not revision or identity in expected:
                    raise QuarantineSafetyError("Cloudant returned an invalid leaf enumeration")
                expected.add((document_id, revision))

        leaf_documents: list[dict[str, Any]] = []
        returned: set[tuple[str, str]] = set()
        requested = sorted(expected)
        for offset in range(0, len(requested), LEAF_READ_BATCH_SIZE):
            batch = requested[offset : offset + LEAF_READ_BATCH_SIZE]
            payload = self._request(
                "POST",
                "leaf body read",
                f"{database_path}/_bulk_get"
                f"?revs={'true' if include_ancestry else 'false'}&attachments=false",
                body={
                    "docs": [
                        {"id": document_id, "rev": revision} for document_id, revision in batch
                    ]
                },
            )
            if not isinstance(payload, Mapping) or not isinstance(payload.get("results"), list):
                raise QuarantineSafetyError("Cloudant returned an invalid leaf body response")
            for result in payload["results"]:
                result_id = result.get("id") if isinstance(result, Mapping) else None
                documents = result.get("docs") if isinstance(result, Mapping) else None
                if not isinstance(result_id, str) or not isinstance(documents, list):
                    raise QuarantineSafetyError("Cloudant returned an invalid leaf body response")
                for document_result in documents:
                    document = (
                        document_result.get("ok") if isinstance(document_result, Mapping) else None
                    )
                    revision = document.get("_rev") if isinstance(document, Mapping) else None
                    identity = (result_id, revision)
                    if (
                        not isinstance(document, Mapping)
                        or document.get("_id") != result_id
                        or not isinstance(revision, str)
                        or identity not in expected
                        or identity in returned
                    ):
                        raise QuarantineSafetyError("Cloudant returned an inconsistent leaf body")
                    returned.add((result_id, revision))
                    leaf_documents.append(dict(document))
        if returned != expected:
            raise QuarantineSafetyError("Cloudant omitted a current leaf body")
        return leaf_documents

    def get_leaf_documents(self, database: str) -> list[dict[str, Any]]:
        return self._get_current_leaf_documents(database, include_ancestry=True)

    def get_state_model(self, database: str) -> StateModel:
        database_path = self._database_path(database)
        metadata = self._request("GET", "database metadata read", database_path)
        leaf_documents = self._get_current_leaf_documents(database, include_ancestry=False)
        all_documents = self._request(
            "POST",
            "winner enumeration",
            f"{database_path}/_all_docs",
            body={"keys": sorted({document["_id"] for document in leaf_documents})},
        )
        if not isinstance(metadata, Mapping) or metadata.get("db_name") != database:
            raise QuarantineSafetyError("Cloudant returned invalid database metadata")
        if not isinstance(all_documents, Mapping) or not isinstance(
            all_documents.get("rows"), list
        ):
            raise QuarantineSafetyError("Cloudant returned an invalid winner enumeration")

        leaf_rows = [
            {
                "id": document["_id"],
                "rev": document["_rev"],
                "deleted": document.get("_deleted") is True,
            }
            for document in leaf_documents
        ]

        winners: dict[str, str] = {}
        for row in all_documents["rows"]:
            value = row.get("value") if isinstance(row, Mapping) else None
            document_id = row.get("id") if isinstance(row, Mapping) else None
            revision = value.get("rev") if isinstance(value, Mapping) else None
            if not isinstance(document_id, str) or not isinstance(revision, str):
                raise QuarantineSafetyError("Cloudant returned an invalid winner enumeration")
            winners[document_id] = revision
        return build_state_model(leaf_rows, winners)


def canonical_hash(value: Any) -> str:
    """Hash a JSON value with deterministic object-key and whitespace handling."""

    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def build_state_model(
    leaf_rows: Sequence[Mapping[str, Any]],
    winner_revisions: Mapping[str, str],
) -> StateModel:
    """Validate and canonicalize the current non-``_local`` leaf graph."""

    leaves: list[LeafRevision] = []
    seen: set[tuple[str, str]] = set()
    revisions_by_document: dict[str, set[str]] = {}
    for row in leaf_rows:
        document_id = row.get("id")
        revision = row.get("rev")
        deleted = row.get("deleted")
        if isinstance(document_id, str) and document_id.startswith("_local/"):
            continue
        if not isinstance(document_id, str) or not document_id:
            raise QuarantineSafetyError("leaf enumeration contains an invalid document ID")
        if not isinstance(revision, str) or not revision:
            raise QuarantineSafetyError("leaf enumeration contains an invalid revision")
        if not isinstance(deleted, bool):
            raise QuarantineSafetyError("leaf enumeration contains an invalid deletion state")
        identity = (document_id, revision)
        if identity in seen:
            raise QuarantineSafetyError("leaf enumeration contains a duplicate revision")
        seen.add(identity)
        revisions_by_document.setdefault(document_id, set()).add(revision)
        leaves.append(LeafRevision(document_id, revision, deleted))

    winners: dict[str, str] = {}
    for document_id, revision in winner_revisions.items():
        if document_id.startswith("_local/"):
            continue
        if not document_id or not isinstance(revision, str) or not revision:
            raise QuarantineSafetyError("winner enumeration is invalid")
        winners[document_id] = revision

    if set(winners) != set(revisions_by_document):
        raise QuarantineSafetyError("winner enumeration does not match the leaf documents")
    for document_id, revision in winners.items():
        if revision not in revisions_by_document[document_id]:
            raise QuarantineSafetyError("winner revision is absent from the current leaf set")

    canonical_leaves = tuple(sorted(leaves))
    canonical_winners = tuple(sorted(winners.items()))
    counts = {
        "documents": len(revisions_by_document),
        "liveLeaves": sum(not leaf.deleted for leaf in canonical_leaves),
        "deletedLeaves": sum(leaf.deleted for leaf in canonical_leaves),
        "conflictLeaves": sum(
            max(0, len(revisions) - 1) for revisions in revisions_by_document.values()
        ),
    }
    fingerprint_payload = {
        "leaves": [[leaf.document_id, leaf.revision, leaf.deleted] for leaf in canonical_leaves],
        "winners": [list(winner) for winner in canonical_winners],
    }
    return StateModel(
        leaves=canonical_leaves,
        winners=canonical_winners,
        counts=counts,
        fingerprint=canonical_hash(fingerprint_payload),
    )


def add_leaf_to_state(
    source: StateModel,
    document_id: str,
    revision: str,
    *,
    deleted: bool,
) -> StateModel:
    """Return a state with one new document leaf, failing on identity reuse."""

    if document_id in dict(source.winners):
        raise QuarantineSafetyError("cannot add a leaf for an existing document")
    rows = [
        {"id": leaf.document_id, "rev": leaf.revision, "deleted": leaf.deleted}
        for leaf in source.leaves
    ]
    rows.append({"id": document_id, "rev": revision, "deleted": deleted})
    winners = dict(source.winners)
    winners[document_id] = revision
    return build_state_model(rows, winners)


def _remove_document_from_state(source: StateModel, document_id: str) -> StateModel:
    rows = [
        {"id": leaf.document_id, "rev": leaf.revision, "deleted": leaf.deleted}
        for leaf in source.leaves
        if leaf.document_id != document_id
    ]
    winners = dict(source.winners)
    winners.pop(document_id, None)
    return build_state_model(rows, winners)


def _require_source_database(database: str, *, allow_disposable_preview: bool = False) -> None:
    if database == SOURCE_DATABASE:
        return
    if allow_disposable_preview and PREVIEW_SOURCE_PATTERN.fullmatch(database):
        return
    raise QuarantineSafetyError("database is not an approved source target")


def _require_quarantine_database(database: str, *, allow_disposable_preview: bool = False) -> None:
    if QUARANTINE_PATTERN.fullmatch(database):
        return
    if allow_disposable_preview and PREVIEW_QUARANTINE_PATTERN.fullmatch(database):
        return
    raise QuarantineSafetyError("quarantine database name is invalid")


def _require_database_lifecycle_target(database: str, *, allow_disposable_preview: bool) -> None:
    if QUARANTINE_PATTERN.fullmatch(database):
        return
    if allow_disposable_preview and (
        PREVIEW_SOURCE_PATTERN.fullmatch(database) or PREVIEW_QUARANTINE_PATTERN.fullmatch(database)
    ):
        return
    raise QuarantineSafetyError("database lifecycle target is invalid")


def build_replication_document(
    source_database: str,
    quarantine_database: str,
    *,
    endpoint: str,
    username: str,
    password: str,
    allow_disposable_preview: bool = False,
) -> dict[str, Any]:
    """Build the only supported one-shot, unfiltered replication definition."""

    _require_source_database(source_database, allow_disposable_preview=allow_disposable_preview)
    _require_quarantine_database(
        quarantine_database, allow_disposable_preview=allow_disposable_preview
    )
    root = endpoint.rstrip("/")
    if not root.startswith("https://") or not username or not password:
        raise QuarantineSafetyError("replication authentication is invalid")
    authentication = {"basic": {"username": username, "password": password}}
    return {
        "source": {
            "url": f"{root}/{source_database}",
            "auth": copy.deepcopy(authentication),
        },
        "target": {
            "url": f"{root}/{quarantine_database}",
            "auth": copy.deepcopy(authentication),
        },
    }


def _require_no_running_timer(client: Any, database: str) -> None:
    if client.get_document(database, RUNNING_ACTIVITY_ID) is not None:
        raise QuarantineSafetyError("running timer must be stopped before any remote mutation")


def require_locked_taxonomy_meanings(documents: Sequence[Mapping[str, Any]]) -> None:
    """Check the two approved production meanings from the current taxonomy rows."""

    matches = [document for document in documents if document.get("_id") == TAXONOMY_DOCUMENT_ID]
    if len(matches) != 1 or not isinstance(matches[0].get("categories"), list):
        raise QuarantineSafetyError("locked taxonomy meaning cannot be verified")
    labels: dict[str, str] = {}
    for row in matches[0]["categories"]:
        if isinstance(row, Mapping) and isinstance(row.get("key"), str):
            labels[row["key"]] = row.get("label")
    if labels.get("work/meetings") != "Comms" or labels.get("work/comms") != "Meetings":
        raise QuarantineSafetyError("locked taxonomy meaning differs from the approved mapping")


def _checked_migration_plan(documents: Sequence[Mapping[str, Any]]) -> Any:
    try:
        return build_migration_plan(documents)
    except MigrationSafetyError:
        raise QuarantineSafetyError("migration planning precondition failed") from None


def _normalized_successor(document: Mapping[str, Any]) -> dict[str, Any]:
    normalized = copy.deepcopy(dict(document))
    normalized.pop("_revisions", None)
    normalized.pop("_conflicts", None)
    normalized.pop("_deleted_conflicts", None)
    return normalized


def _immediate_parent(document: Mapping[str, Any]) -> str | None:
    revision = document.get("_rev")
    history = document.get("_revisions")
    if not isinstance(revision, str) or not isinstance(history, Mapping):
        return None
    try:
        generation_text, digest = revision.split("-", 1)
        generation = int(generation_text)
    except (ValueError, AttributeError):
        return None
    start = history.get("start")
    identifiers = history.get("ids")
    if (
        not isinstance(start, int)
        or start != generation
        or not isinstance(identifiers, list)
        or len(identifiers) < 2
        or identifiers[0] != digest
        or not isinstance(identifiers[1], str)
        or generation < 2
    ):
        return None
    return f"{generation - 1}-{identifiers[1]}"


def classify_migration_state(
    base_documents: Sequence[Mapping[str, Any]],
    base_state: StateModel,
    current_leaf_documents: Sequence[Mapping[str, Any]],
    current_state: StateModel,
    *,
    validator_revision: str,
    completion_marker: Mapping[str, Any] | None = None,
) -> MigrationClassification:
    """Accept only unchanged quarantine leaves or exact one-step migration descendants."""

    require_locked_taxonomy_meanings(base_documents)
    plan = _checked_migration_plan(base_documents)
    if plan.running_timer_present:
        raise QuarantineSafetyError("quarantine contains a running timer")
    base_winners = dict(base_state.winners)
    expected_updates = {document["_id"]: document for document in plan.updates}
    expected_tombstones = {
        (document["_id"], document["_rev"]): document for document in plan.conflict_tombstones
    }

    state_deletions = {
        (leaf.document_id, leaf.revision): leaf.deleted for leaf in current_state.leaves
    }
    current_by_identity: dict[tuple[str, str], dict[str, Any]] = {}
    children_by_parent: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for source in current_leaf_documents:
        document = copy.deepcopy(dict(source))
        document_id = document.get("_id")
        revision = document.get("_rev")
        identity = (document_id, revision)
        if (
            not isinstance(document_id, str)
            or not isinstance(revision, str)
            or identity in current_by_identity
            or identity not in state_deletions
            or (document.get("_deleted") is True) != state_deletions[identity]
        ):
            raise QuarantineSafetyError("current leaf bodies do not match current state")
        current_by_identity[identity] = document
        parent = _immediate_parent(document)
        if parent is not None:
            children_by_parent.setdefault((document_id, parent), []).append(document)
    if set(current_by_identity) != set(state_deletions):
        raise QuarantineSafetyError("current leaf bodies do not cover current state")

    consumed: set[tuple[str, str]] = set()
    winner_transitions: dict[str, str] = {}
    transitioned_updates = 0
    transitioned_tombstones = 0
    for leaf in base_state.leaves:
        identity = (leaf.document_id, leaf.revision)
        if identity in current_by_identity:
            consumed.add(identity)
            continue
        candidates = children_by_parent.get(identity, [])
        if len(candidates) != 1:
            raise QuarantineSafetyError("base leaf has no unique immediate migration successor")
        candidate = candidates[0]
        candidate_identity = (candidate["_id"], candidate["_rev"])
        intended: Mapping[str, Any] | None = None
        if base_winners.get(leaf.document_id) == leaf.revision:
            intended = expected_updates.get(leaf.document_id)
            if intended is not None:
                transitioned_updates += 1
                winner_transitions[leaf.document_id] = candidate["_rev"]
        if intended is None:
            intended = expected_tombstones.get(identity)
            if intended is not None:
                transitioned_tombstones += 1
        if intended is None:
            raise QuarantineSafetyError("unexpected successor of a quarantined leaf")
        comparable_intended = copy.deepcopy(dict(intended))
        comparable_intended["_rev"] = candidate["_rev"]
        if _normalized_successor(candidate) != _normalized_successor(comparable_intended):
            raise QuarantineSafetyError("leaf is not the intended migration successor")
        consumed.add(candidate_identity)

    design_identity = (CONTRACT_DESIGN_ID, validator_revision)
    design = current_by_identity.get(design_identity)
    if design is None:
        raise QuarantineSafetyError("expected validator leaf is absent")
    comparable_design = load_design_document()
    comparable_design["_rev"] = validator_revision
    if _normalized_successor(design) != comparable_design:
        raise QuarantineSafetyError("validator leaf differs from the reviewed contract")
    consumed.add(design_identity)
    if completion_marker is not None:
        marker_revision = completion_marker.get("_rev")
        marker_identity = (COMPLETION_MARKER_ID, marker_revision)
        current_marker = current_by_identity.get(marker_identity)
        if (
            not isinstance(marker_revision, str)
            or current_marker is None
            or _normalized_successor(current_marker) != _normalized_successor(completion_marker)
        ):
            raise QuarantineSafetyError("completion marker leaf differs from expectation")
        consumed.add(marker_identity)
    if consumed != set(current_by_identity):
        raise QuarantineSafetyError("current state contains an unrelated leaf")

    expected_winners = dict(base_state.winners)
    expected_winners.update(winner_transitions)
    expected_winners[CONTRACT_DESIGN_ID] = validator_revision
    if completion_marker is not None:
        expected_winners[COMPLETION_MARKER_ID] = completion_marker["_rev"]
    if dict(current_state.winners) != expected_winners:
        raise QuarantineSafetyError("current winners differ from the intended migration state")
    return MigrationClassification(
        complete=(
            transitioned_updates == len(expected_updates)
            and transitioned_tombstones == len(expected_tombstones)
        ),
        transitioned_updates=transitioned_updates,
        transitioned_tombstones=transitioned_tombstones,
    )


def _completion_marker(
    fence: FenceReceipt,
    verified_state: StateModel,
    counts: Mapping[str, int],
    completed_at: str,
) -> dict[str, Any]:
    if not isinstance(completed_at, str) or not completed_at:
        raise QuarantineSafetyError("completion timestamp is required")
    return {
        "_id": COMPLETION_MARKER_ID,
        "id": COMPLETION_MARKER_ID,
        "docType": "config",
        "migrationVersion": 1,
        "quarantineFingerprint": fence.capture.state.fingerprint,
        "verifiedStateFingerprint": verified_state.fingerprint,
        "validatorRevision": fence.validator_revision,
        "counts": dict(counts),
        "completedAt": completed_at,
        "category": None,
        "categoryId": None,
        "categoryIdentityVersion": None,
        "writerContract": {"version": 1, "categoryReference": None},
    }


def _validate_completion_marker(
    marker: Mapping[str, Any],
    fence: FenceReceipt,
    data_state: StateModel,
    counts: Mapping[str, int],
) -> None:
    expected_fields = {
        "_id": COMPLETION_MARKER_ID,
        "id": COMPLETION_MARKER_ID,
        "docType": "config",
        "migrationVersion": 1,
        "quarantineFingerprint": fence.capture.state.fingerprint,
        "verifiedStateFingerprint": data_state.fingerprint,
        "validatorRevision": fence.validator_revision,
        "counts": dict(counts),
        "category": None,
        "categoryId": None,
        "categoryIdentityVersion": None,
        "writerContract": {"version": 1, "categoryReference": None},
    }
    if any(marker.get(key) != value for key, value in expected_fields.items()):
        raise QuarantineSafetyError("completion marker does not match verified state")
    if not isinstance(marker.get("completedAt"), str) or not marker["completedAt"]:
        raise QuarantineSafetyError("completion marker timestamp is invalid")
    allowed = {*expected_fields, "completedAt", "_rev", "_revisions"}
    if set(marker) - allowed:
        raise QuarantineSafetyError("completion marker contains unexpected fields")


def _require_exact_validator(client: Any, database: str, expected_revision: str) -> None:
    document = client.get_document(database, CONTRACT_DESIGN_ID)
    if document is None or document.get("_rev") != expected_revision:
        raise QuarantineSafetyError("validator revision differs from the fenced revision")
    comparable = copy.deepcopy(dict(document))
    comparable.pop("_rev", None)
    if comparable != load_design_document():
        raise QuarantineSafetyError("validator differs from the reviewed contract")


def _ordered_updates(plan: Any) -> list[dict[str, Any]]:
    kind_order = {"task": 1, "activity": 2}
    return sorted(
        plan.updates,
        key=lambda document: (
            0
            if document.get("_id") == TAXONOMY_DOCUMENT_ID
            else kind_order.get(document.get("docType"), 3),
            str(document.get("_id")),
        ),
    )


def execute_migration(
    client: Any,
    fence: FenceReceipt,
    *,
    completed_at: str,
) -> MigrationExecutionResult:
    """Resume or complete the exact ``fortudo-dat-411`` identity migration."""

    source_database = fence.capture.source_database
    quarantine_database = fence.capture.quarantine_database
    _require_source_database(
        source_database, allow_disposable_preview=fence.capture.disposable_preview
    )
    _require_quarantine_database(
        quarantine_database,
        allow_disposable_preview=fence.capture.disposable_preview,
    )
    _require_no_running_timer(client, source_database)
    if client.get_security_hash(source_database) != fence.capture.security_hash:
        raise QuarantineSafetyError("source security drift blocks migration")
    if client.get_state_model(quarantine_database) != fence.capture.state:
        raise QuarantineSafetyError("quarantine state drift blocks migration")
    base_documents = client.get_all_documents(quarantine_database, include_conflicts=True)
    require_locked_taxonomy_meanings(base_documents)
    base_plan = _checked_migration_plan(base_documents)
    if base_plan.running_timer_present:
        raise QuarantineSafetyError("quarantine contains a running timer")
    _require_exact_validator(client, source_database, fence.validator_revision)

    current_state = client.get_state_model(source_database)
    current_leaves = client.get_leaf_documents(source_database)
    existing_marker = client.get_document(source_database, COMPLETION_MARKER_ID)
    data_state = (
        _remove_document_from_state(current_state, COMPLETION_MARKER_ID)
        if existing_marker is not None
        else current_state
    )
    if existing_marker is not None:
        _validate_completion_marker(existing_marker, fence, data_state, base_plan.counts)
    initial_classification = classify_migration_state(
        base_documents,
        fence.capture.state,
        current_leaves,
        current_state,
        validator_revision=fence.validator_revision,
        completion_marker=existing_marker,
    )
    if existing_marker is not None:
        if not initial_classification.complete:
            raise QuarantineSafetyError("completion marker exists before migration convergence")
        return MigrationExecutionResult(
            state="complete",
            counts=base_plan.counts,
            verified_state_fingerprint=data_state.fingerprint,
            marker_revision=existing_marker["_rev"],
        )

    current_documents = client.get_all_documents(source_database, include_conflicts=True)
    require_locked_taxonomy_meanings(current_documents)
    current_plan = _checked_migration_plan(current_documents)
    if current_plan.running_timer_present:
        raise QuarantineSafetyError("running timer appeared before migration writes")
    for document in _ordered_updates(current_plan):
        response = client.put_document(source_database, document, create_only=False)
        if (
            not isinstance(response, Mapping)
            or response.get("id") != document["_id"]
            or not isinstance(response.get("rev"), str)
        ):
            raise QuarantineSafetyError("migration successor response is invalid")
    for tombstone in sorted(
        current_plan.conflict_tombstones,
        key=lambda document: (document["_id"], document["_rev"]),
    ):
        response = client.put_document(source_database, tombstone, create_only=False)
        if (
            not isinstance(response, Mapping)
            or response.get("id") != tombstone["_id"]
            or not isinstance(response.get("rev"), str)
        ):
            raise QuarantineSafetyError("conflict tombstone response is invalid")

    verified_state = client.get_state_model(source_database)
    verified_leaves = client.get_leaf_documents(source_database)
    classification = classify_migration_state(
        base_documents,
        fence.capture.state,
        verified_leaves,
        verified_state,
        validator_revision=fence.validator_revision,
    )
    if not classification.complete:
        raise QuarantineSafetyError("migration did not reach complete identity state")
    settled_documents = client.get_all_documents(source_database, include_conflicts=True)
    require_locked_taxonomy_meanings(settled_documents)
    settled_plan = _checked_migration_plan(settled_documents)
    if settled_plan.updates or settled_plan.conflict_tombstones:
        raise QuarantineSafetyError("post-migration invariants are incomplete")
    if client.get_security_hash(source_database) != fence.capture.security_hash:
        raise QuarantineSafetyError("source security drifted during migration")

    marker_body = _completion_marker(fence, verified_state, base_plan.counts, completed_at)
    marker_response = client.put_document(source_database, marker_body, create_only=True)
    if not isinstance(marker_response, Mapping):
        raise QuarantineSafetyError("completion marker response is invalid")
    marker_revision = marker_response.get("rev")
    if marker_response.get("id") != COMPLETION_MARKER_ID or not isinstance(marker_revision, str):
        raise QuarantineSafetyError("completion marker response is invalid")

    final_state = client.get_state_model(source_database)
    final_leaves = client.get_leaf_documents(source_database)
    marker = client.get_document(source_database, COMPLETION_MARKER_ID)
    if marker is None or marker.get("_rev") != marker_revision:
        raise QuarantineSafetyError("completion marker reread differs from write response")
    _validate_completion_marker(marker, fence, verified_state, base_plan.counts)
    final_classification = classify_migration_state(
        base_documents,
        fence.capture.state,
        final_leaves,
        final_state,
        validator_revision=fence.validator_revision,
        completion_marker=marker,
    )
    if not final_classification.complete:
        raise QuarantineSafetyError("final migration verification is incomplete")
    if _remove_document_from_state(final_state, COMPLETION_MARKER_ID) != verified_state:
        raise QuarantineSafetyError("source changed while writing the completion marker")
    if client.get_security_hash(source_database) != fence.capture.security_hash:
        raise QuarantineSafetyError("source security drifted after completion")
    return MigrationExecutionResult(
        state="complete",
        counts=base_plan.counts,
        verified_state_fingerprint=verified_state.fingerprint,
        marker_revision=marker_revision,
    )


def capture_quarantine(
    client: Any,
    source_database: str,
    quarantine_database: str,
    *,
    allow_disposable_preview: bool = False,
    resume_existing: bool = False,
) -> CaptureReceipt:
    """Create and verify one Cloudant-native quarantine copy."""

    _require_source_database(source_database, allow_disposable_preview=allow_disposable_preview)
    _require_quarantine_database(
        quarantine_database, allow_disposable_preview=allow_disposable_preview
    )
    _require_no_running_timer(client, source_database)

    security_hash = client.get_security_hash(source_database)
    locked_source = client.get_state_model(source_database)
    if client.database_exists(quarantine_database):
        if not resume_existing:
            raise QuarantineSafetyError("quarantine database already exists")
    else:
        client.create_database(
            quarantine_database,
            partitioned=False,
            allow_disposable_preview=allow_disposable_preview,
        )

    client.replicate_once(
        source_database,
        quarantine_database,
        allow_disposable_preview=allow_disposable_preview,
    )
    current_source = client.get_state_model(source_database)
    quarantine_state = client.get_state_model(quarantine_database)
    if current_source != locked_source:
        raise QuarantineSafetyError("source state drifted during quarantine capture")
    if quarantine_state != current_source:
        raise QuarantineSafetyError("quarantine state differs from the source")
    if client.get_security_hash(source_database) != security_hash:
        raise QuarantineSafetyError("source security drifted during quarantine capture")
    return CaptureReceipt(
        source_database=source_database,
        quarantine_database=quarantine_database,
        state=current_source,
        security_hash=security_hash,
        disposable_preview=allow_disposable_preview,
    )


def _expected_fenced_state(before: StateModel, validator_revision: str) -> StateModel:
    leaf_rows = [
        {"id": leaf.document_id, "rev": leaf.revision, "deleted": leaf.deleted}
        for leaf in before.leaves
    ]
    leaf_rows.append({"id": CONTRACT_DESIGN_ID, "rev": validator_revision, "deleted": False})
    winners = dict(before.winners)
    winners[CONTRACT_DESIGN_ID] = validator_revision
    return build_state_model(leaf_rows, winners)


def install_fence(
    client: Any,
    capture: CaptureReceipt,
    *,
    expected_existing_validator_revision: str | None = None,
) -> FenceReceipt:
    """Install the reviewed validator only if the captured state is still current."""

    _require_source_database(
        capture.source_database,
        allow_disposable_preview=capture.disposable_preview,
    )
    _require_quarantine_database(
        capture.quarantine_database,
        allow_disposable_preview=capture.disposable_preview,
    )
    _require_no_running_timer(client, capture.source_database)
    current = client.get_state_model(capture.source_database)
    if client.get_security_hash(capture.source_database) != capture.security_hash:
        raise QuarantineSafetyError("source security drift blocks fence installation")
    if any(leaf.document_id == CONTRACT_DESIGN_ID for leaf in capture.state.leaves):
        raise QuarantineSafetyError("validator revision tree existed before fence installation")
    existing = client.get_document(capture.source_database, CONTRACT_DESIGN_ID)
    if existing is not None:
        if expected_existing_validator_revision is None:
            raise QuarantineSafetyError("existing validator requires an explicit expected revision")
        if existing.get("_rev") != expected_existing_validator_revision:
            raise QuarantineSafetyError("existing validator revision differs from expectation")
        comparable_existing = copy.deepcopy(dict(existing))
        comparable_existing.pop("_rev", None)
        if comparable_existing != load_design_document():
            raise QuarantineSafetyError("existing validator differs from the reviewed contract")
        validator_revision = expected_existing_validator_revision
        fenced_state = current
    else:
        if current != capture.state:
            raise QuarantineSafetyError("source leaf drift blocks fence installation")
        response = client.put_document(
            capture.source_database, load_design_document(), create_only=True
        )
        validator_revision = response.get("rev") if isinstance(response, Mapping) else None
        if not isinstance(validator_revision, str) or not validator_revision:
            raise QuarantineSafetyError("validator create response is invalid")
        fenced_state = client.get_state_model(capture.source_database)
    expected = _expected_fenced_state(capture.state, validator_revision)
    if fenced_state != expected:
        raise QuarantineSafetyError("source drifted while installing the validator")
    if client.get_security_hash(capture.source_database) != capture.security_hash:
        raise QuarantineSafetyError("source security drifted while installing the validator")
    return FenceReceipt(
        capture=capture,
        validator_revision=validator_revision,
        fenced_state=fenced_state,
    )


def _sha256_argument(value: str) -> str:
    if not re.fullmatch(r"[a-f0-9]{64}", value):
        raise argparse.ArgumentTypeError("expected a lowercase SHA-256 value")
    return value


def _add_mutation_gates(parser: argparse.ArgumentParser, *, source: bool = True) -> None:
    parser.add_argument("--expected-account-checksum", required=True, type=_sha256_argument)
    if source:
        parser.add_argument("--confirm-source", required=True, choices=[SOURCE_DATABASE])
    parser.add_argument("--approve-remote-writes", required=True, action="store_true")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    modes.add_parser("preflight")

    capture = modes.add_parser("capture")
    capture.add_argument("--quarantine-database", required=True)
    capture.add_argument("--resume-existing", action="store_true")
    _add_mutation_gates(capture)

    fence = modes.add_parser("fence")
    fence.add_argument("--quarantine-database", required=True)
    fence.add_argument("--expected-quarantine-fingerprint", required=True, type=_sha256_argument)
    fence.add_argument("--expected-security-hash", required=True, type=_sha256_argument)
    fence.add_argument("--expected-existing-validator-revision")
    _add_mutation_gates(fence)

    migrate = modes.add_parser("migrate")
    migrate.add_argument("--quarantine-database", required=True)
    migrate.add_argument("--expected-quarantine-fingerprint", required=True, type=_sha256_argument)
    migrate.add_argument("--expected-security-hash", required=True, type=_sha256_argument)
    migrate.add_argument("--validator-revision", required=True)
    migrate.add_argument("--completed-at", required=True)
    _add_mutation_gates(migrate)

    delete = modes.add_parser("delete-quarantine")
    delete.add_argument("--quarantine-database", required=True)
    delete.add_argument("--expected-quarantine-fingerprint", required=True, type=_sha256_argument)
    delete.add_argument("--confirm-delete-quarantine", required=True)
    _add_mutation_gates(delete, source=False)
    return parser


def _capture_from_quarantine(
    client: Any,
    quarantine_database: str,
    expected_fingerprint: str,
    security_hash: str,
) -> CaptureReceipt:
    _require_quarantine_database(quarantine_database)
    quarantine_state = client.get_state_model(quarantine_database)
    if quarantine_state.fingerprint != expected_fingerprint:
        raise QuarantineSafetyError("quarantine fingerprint differs from expectation")
    return CaptureReceipt(
        source_database=SOURCE_DATABASE,
        quarantine_database=quarantine_database,
        state=quarantine_state,
        security_hash=security_hash,
    )


def _safe_print(report: Mapping[str, Any]) -> None:
    print(json.dumps(report, indent=2, sort_keys=True))


def execute_cli(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    client_factory: Any = OperationalCloudantClient,
) -> dict[str, Any]:
    args = _parser().parse_args(argv)
    environment = os.environ if environ is None else environ
    credential_url = environment.get(CREDENTIAL_ENV_VAR)
    if not credential_url:
        raise QuarantineSafetyError(f"required environment variable {CREDENTIAL_ENV_VAR} is unset")
    client = client_factory(credential_url)

    if args.mode == "preflight":
        source_state = client.get_state_model(SOURCE_DATABASE)
        security_hash = client.get_security_hash(SOURCE_DATABASE)
        timer_present = client.get_document(SOURCE_DATABASE, RUNNING_ACTIVITY_ID) is not None
        validator = verify_validator(client, SOURCE_DATABASE)
        report = {
            "mode": "preflight",
            "accountChecksum": client.account_checksum,
            "sourceFingerprint": source_state.fingerprint,
            "securityHash": security_hash,
            "counts": source_state.counts,
            "runningTimerPresent": timer_present,
            "validatorState": validator["state"],
            "validatorRevision": validator["validatorRevision"],
        }
        _safe_print(report)
        return report

    if client.account_checksum != args.expected_account_checksum:
        raise QuarantineSafetyError("Cloudant account binding differs from expectation")

    if args.mode == "capture":
        _require_quarantine_database(args.quarantine_database)
        receipt = capture_quarantine(
            client,
            SOURCE_DATABASE,
            args.quarantine_database,
            resume_existing=args.resume_existing,
        )
        report = {
            "mode": "capture",
            "state": "verified",
            "sourceFingerprint": receipt.state.fingerprint,
            "quarantineFingerprint": receipt.state.fingerprint,
            "securityHash": receipt.security_hash,
            "counts": receipt.state.counts,
            "replicationMode": "transient",
        }
    elif args.mode == "fence":
        capture = _capture_from_quarantine(
            client,
            args.quarantine_database,
            args.expected_quarantine_fingerprint,
            args.expected_security_hash,
        )
        receipt = install_fence(
            client,
            capture,
            expected_existing_validator_revision=(args.expected_existing_validator_revision),
        )
        report = {
            "mode": "fence",
            "state": "verified",
            "validatorRevision": receipt.validator_revision,
            "validatorChecksum": load_design_document()["fortudoDocumentContract"]["checksum"],
            "fencedFingerprint": receipt.fenced_state.fingerprint,
            "counts": receipt.fenced_state.counts,
        }
    elif args.mode == "migrate":
        capture = _capture_from_quarantine(
            client,
            args.quarantine_database,
            args.expected_quarantine_fingerprint,
            args.expected_security_hash,
        )
        fence = FenceReceipt(
            capture=capture,
            validator_revision=args.validator_revision,
            fenced_state=client.get_state_model(SOURCE_DATABASE),
        )
        result = execute_migration(client, fence, completed_at=args.completed_at)
        report = {
            "mode": "migrate",
            "state": result.state,
            "counts": result.counts,
            "verifiedStateFingerprint": result.verified_state_fingerprint,
            "markerRevision": result.marker_revision,
        }
    else:
        _require_quarantine_database(args.quarantine_database)
        if args.confirm_delete_quarantine != args.quarantine_database:
            raise QuarantineSafetyError("quarantine deletion confirmation differs from target")
        quarantine_state = client.get_state_model(args.quarantine_database)
        if quarantine_state.fingerprint != args.expected_quarantine_fingerprint:
            raise QuarantineSafetyError("quarantine fingerprint differs from expectation")
        client.delete_database(args.quarantine_database, allow_disposable_preview=False)
        if client.database_exists(args.quarantine_database):
            raise QuarantineSafetyError("quarantine database still exists after deletion")
        report = {"mode": "delete-quarantine", "state": "deleted"}
    _safe_print(report)
    return report


def main() -> int:
    try:
        execute_cli()
    except QuarantineSafetyError as error:
        print(f"Quarantine operation blocked: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

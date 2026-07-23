"""Canonical Cloudant state models used by guarded migration operations."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Mapping, Sequence


class CloudantMigrationSafetyError(RuntimeError):
    """Raised when a Cloudant migration safety invariant does not hold."""


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
    """Verified identity and state of one native Cloudant quarantine capture."""

    source_database: str
    quarantine_database: str
    state: StateModel
    security_hash: str
    disposable_preview: bool = False


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
            raise CloudantMigrationSafetyError(
                "leaf enumeration contains an invalid document ID"
            )
        if not isinstance(revision, str) or not revision:
            raise CloudantMigrationSafetyError("leaf enumeration contains an invalid revision")
        if not isinstance(deleted, bool):
            raise CloudantMigrationSafetyError(
                "leaf enumeration contains an invalid deletion state"
            )
        identity = (document_id, revision)
        if identity in seen:
            raise CloudantMigrationSafetyError(
                "leaf enumeration contains a duplicate revision"
            )
        seen.add(identity)
        revisions_by_document.setdefault(document_id, set()).add(revision)
        leaves.append(LeafRevision(document_id, revision, deleted))

    winners: dict[str, str] = {}
    for document_id, revision in winner_revisions.items():
        if document_id.startswith("_local/"):
            continue
        if not document_id or not isinstance(revision, str) or not revision:
            raise CloudantMigrationSafetyError("winner enumeration is invalid")
        winners[document_id] = revision

    if set(winners) != set(revisions_by_document):
        raise CloudantMigrationSafetyError(
            "winner enumeration does not match the leaf documents"
        )
    for document_id, revision in winners.items():
        if revision not in revisions_by_document[document_id]:
            raise CloudantMigrationSafetyError(
                "winner revision is absent from the current leaf set"
            )

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
        raise CloudantMigrationSafetyError("cannot add a leaf for an existing document")
    rows = [
        {"id": leaf.document_id, "rev": leaf.revision, "deleted": leaf.deleted}
        for leaf in source.leaves
    ]
    rows.append({"id": document_id, "rev": revision, "deleted": deleted})
    winners = dict(source.winners)
    winners[document_id] = revision
    return build_state_model(rows, winners)


def remove_document_from_state(source: StateModel, document_id: str) -> StateModel:
    """Return a state without any leaves or winner for one document."""

    rows = [
        {"id": leaf.document_id, "rev": leaf.revision, "deleted": leaf.deleted}
        for leaf in source.leaves
        if leaf.document_id != document_id
    ]
    winners = dict(source.winners)
    winners.pop(document_id, None)
    return build_state_model(rows, winners)

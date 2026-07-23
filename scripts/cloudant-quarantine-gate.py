"""Disposable real-Cloudant proof for the minimal quarantine migration machinery."""

from __future__ import annotations

import base64
import copy
import json
import os
import secrets
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping, Sequence

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.cloudant_quarantine_migration import (
    COMPLETION_MARKER_ID,
    PREVIEW_QUARANTINE_PATTERN,
    PREVIEW_SOURCE_PATTERN,
    OperationalCloudantClient,
    QuarantineSafetyError,
    build_state_model,
    capture_quarantine,
    execute_migration,
    install_fence,
)
from scripts.document_contract_ops import CONTRACT_DESIGN_ID, load_design_document
from scripts.migrate_taxonomy_identity import CREDENTIAL_ENV_VAR, RUNNING_ACTIVITY_ID


def require(condition: bool, message: str) -> None:
    if not condition:
        raise QuarantineSafetyError(message)


class DisposablePreviewCloudantClient(OperationalCloudantClient):
    """Fixture-only mutations that are deliberately absent from the production CLI client."""

    def seed_revisions(self, database: str, documents: Sequence[Mapping[str, Any]]) -> None:
        require(
            bool(PREVIEW_SOURCE_PATTERN.fullmatch(database)),
            "target is not a disposable preview source",
        )
        require(bool(documents), "disposable preview seed is empty")
        payload = self._request(
            "POST",
            "disposable preview seed",
            f"{self._database_path(database)}/_bulk_docs",
            body={"docs": list(documents), "new_edits": False},
        )
        if not isinstance(payload, list):
            raise QuarantineSafetyError("Cloudant returned an invalid preview seed response")
        rejected = sum(
            not isinstance(row, Mapping)
            or isinstance(row.get("error"), str)
            or row.get("ok") is False
            for row in payload
        )
        if rejected:
            raise QuarantineSafetyError(
                f"Cloudant rejected {rejected} disposable preview revisions"
            )

    def put_preview_security(self, database: str, security: Mapping[str, Any]) -> None:
        require(
            bool(PREVIEW_SOURCE_PATTERN.fullmatch(database)),
            "target is not a disposable preview source",
        )
        payload = self._request(
            "PUT",
            "disposable preview security write",
            f"{self._database_path(database)}/_security",
            body=security,
        )
        require(
            isinstance(payload, Mapping) and payload.get("ok") is True,
            "Cloudant returned an invalid security write response",
        )


def fixture_documents() -> list[dict[str, Any]]:
    activity_parent = "b" * 32
    deleted_parent = "c" * 32
    return [
        {
            "_id": "config-categories",
            "_rev": f"1-{'1' * 32}",
            "id": "config-categories",
            "docType": "config",
            "schemaVersion": "3.5",
            "groups": [
                {
                    "key": "work",
                    "label": "Work",
                    "colorFamily": "blue",
                    "color": "#0ea5e9",
                }
            ],
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
        },
        {
            "_id": "task-preview",
            "_rev": f"1-{'2' * 32}",
            "id": "task-preview",
            "docType": "task",
            "type": "unscheduled",
            "description": "private preview task",
            "category": "work/meetings",
        },
        {
            "_id": "activity-preview",
            "_rev": f"2-{'f' * 32}",
            "_revisions": {"start": 2, "ids": ["f" * 32, activity_parent]},
            "id": "activity-preview",
            "docType": "activity",
            "description": "private winning activity",
            "category": "work/comms",
        },
        {
            "_id": "activity-preview",
            "_rev": f"2-{'a' * 32}",
            "_revisions": {"start": 2, "ids": ["a" * 32, activity_parent]},
            "id": "activity-preview",
            "docType": "activity",
            "description": "private losing activity",
            "category": "work/meetings",
        },
        {
            "_id": "task-deleted-preview",
            "_rev": f"2-{'d' * 32}",
            "_revisions": {"start": 2, "ids": ["d" * 32, deleted_parent]},
            "_deleted": True,
        },
        {
            "_id": "config-attachment-preview",
            "_rev": f"1-{'4' * 32}",
            "id": "config-attachment-preview",
            "docType": "config",
            "_attachments": {
                "proof.txt": {
                    "content_type": "text/plain",
                    "revpos": 1,
                    "data": base64.b64encode(b"private attachment proof").decode("ascii"),
                }
            },
        },
        {
            "_id": RUNNING_ACTIVITY_ID,
            "_rev": f"1-{'5' * 32}",
            "id": RUNNING_ACTIVITY_ID,
            "docType": "config",
            "activityId": "activity-preview",
            "category": "work/comms",
        },
        {
            "_id": "config-preview-ordinary",
            "_rev": f"1-{'6' * 32}",
            "id": "config-preview-ordinary",
            "docType": "config",
        },
    ]


def expected_fixture_state():
    rows = [
        {"id": "config-categories", "rev": f"1-{'1' * 32}", "deleted": False},
        {"id": "task-preview", "rev": f"1-{'2' * 32}", "deleted": False},
        {"id": "activity-preview", "rev": f"2-{'f' * 32}", "deleted": False},
        {"id": "activity-preview", "rev": f"2-{'a' * 32}", "deleted": False},
        {"id": "task-deleted-preview", "rev": f"2-{'d' * 32}", "deleted": True},
        {
            "id": "config-attachment-preview",
            "rev": f"1-{'4' * 32}",
            "deleted": False,
        },
        {"id": RUNNING_ACTIVITY_ID, "rev": f"1-{'5' * 32}", "deleted": False},
        {"id": "config-preview-ordinary", "rev": f"1-{'6' * 32}", "deleted": False},
    ]
    winners = {
        row["id"]: row["rev"] for row in rows if row["id"] != "activity-preview"
    }
    winners["activity-preview"] = f"2-{'f' * 32}"
    return build_state_model(rows, winners)


def stop_timer_compatibly(client: OperationalCloudantClient, database: str) -> None:
    timer = client.get_document(database, RUNNING_ACTIVITY_ID)
    require(timer is not None and isinstance(timer.get("_rev"), str), "preview timer is absent")
    client.put_document(
        database,
        {
            "_id": RUNNING_ACTIVITY_ID,
            "_rev": timer["_rev"],
            "_deleted": True,
            "writerContract": {"version": 1},
        },
        create_only=False,
    )
    require(
        client.get_document(database, RUNNING_ACTIVITY_ID) is None,
        "compatible timer stop did not remove the running configuration",
    )


def capture_with_current_bindings(
    client: OperationalCloudantClient,
    source_database: str,
    quarantine_database: str,
    *,
    resume_existing: bool = False,
):
    preflight_state = client.get_state_model(source_database)
    preflight_security_hash = client.get_security_hash(source_database)
    return capture_quarantine(
        client,
        source_database,
        quarantine_database,
        allow_disposable_preview=True,
        resume_existing=resume_existing,
        expected_source_fingerprint=preflight_state.fingerprint,
        expected_security_hash=preflight_security_hash,
    )


def attachment_revision(client: OperationalCloudantClient, database: str) -> tuple[str, str]:
    matches = [
        document
        for document in client.get_leaf_documents(database)
        if document.get("_id") == "config-attachment-preview"
    ]
    require(len(matches) == 1, "attachment leaf count differs from expectation")
    attachments = matches[0].get("_attachments")
    proof = attachments.get("proof.txt") if isinstance(attachments, dict) else None
    require(
        isinstance(proof, dict) and isinstance(proof.get("digest"), str),
        "attachment digest is absent",
    )
    return matches[0]["_rev"], proof["digest"]


class InterruptOnce:
    def __init__(self, client: OperationalCloudantClient) -> None:
        self.client = client
        self.application_writes = 0
        self.interrupted = False

    def __getattr__(self, name: str) -> Any:
        return getattr(self.client, name)

    def put_document(self, database: str, document: dict, *, create_only: bool = False):
        if document.get("_id") not in {CONTRACT_DESIGN_ID, COMPLETION_MARKER_ID}:
            if self.application_writes == 1 and not self.interrupted:
                self.interrupted = True
                raise QuarantineSafetyError("forced interruption")
            self.application_writes += 1
        return self.client.put_document(database, document, create_only=create_only)


class AmbiguousReplicationOnce:
    """Lose one successful transient response to prove retained-target retry."""

    def __init__(self, client: OperationalCloudantClient) -> None:
        self.client = client
        self.interrupted = False

    def __getattr__(self, name: str) -> Any:
        return getattr(self.client, name)

    def replicate_once(self, source: str, target: str, *, allow_disposable_preview: bool = False):
        result = self.client.replicate_once(
            source,
            target,
            allow_disposable_preview=allow_disposable_preview,
        )
        if not self.interrupted:
            self.interrupted = True
            raise QuarantineSafetyError("forced ambiguous transient response")
        return result


class DriftDuringCapturePreconditions:
    """Create a real source revision between capture's two state reads."""

    def __init__(self, client: OperationalCloudantClient, database: str) -> None:
        self.client = client
        self.database = database
        self.drifted = False

    def __getattr__(self, name: str) -> Any:
        return getattr(self.client, name)

    def get_all_documents(self, database: str, *, include_conflicts: bool):
        documents = self.client.get_all_documents(database, include_conflicts=include_conflicts)
        if not self.drifted:
            require(database == self.database, "capture precondition drift target differs")
            task = self.client.get_document(database, "task-preview")
            require(
                task is not None and isinstance(task.get("_rev"), str),
                "preview task is absent before capture precondition drift",
            )
            task["description"] = "private capture precondition drift"
            self.client.put_document(database, task, create_only=False)
            self.drifted = True
        return documents


class SecurityDriftDuringCapturePreconditions:
    """Change preview `_security` between capture's two security reads."""

    def __init__(
        self,
        client: DisposablePreviewCloudantClient,
        database: str,
        drifted_security: Mapping[str, Any],
    ) -> None:
        self.client = client
        self.database = database
        self.drifted_security = drifted_security
        self.drifted = False

    def __getattr__(self, name: str) -> Any:
        return getattr(self.client, name)

    def get_all_documents(self, database: str, *, include_conflicts: bool):
        documents = self.client.get_all_documents(database, include_conflicts=include_conflicts)
        if not self.drifted:
            require(database == self.database, "capture security drift target differs")
            self.client.put_preview_security(database, self.drifted_security)
            self.drifted = True
        return documents


def safe_report(
    *,
    capture: Any,
    fence: Any,
    migration: Any,
    counts: dict[str, int],
) -> None:
    print(
        json.dumps(
            {
                "mode": "real-cloudant-quarantine-gate",
                "result": "passed",
                "counts": counts,
                "quarantineFingerprint": capture.state.fingerprint,
                "validatorChecksum": load_design_document()["fortudoDocumentContract"]["checksum"],
                "validatorRevision": fence.validator_revision,
                "verifiedStateFingerprint": migration.verified_state_fingerprint,
                "markerRevision": migration.marker_revision,
                "cleanup": "verified",
            },
            indent=2,
            sort_keys=True,
        )
    )


def main() -> int:
    credential_url = os.environ.get(CREDENTIAL_ENV_VAR)
    require(bool(credential_url), f"required environment variable {CREDENTIAL_ENV_VAR} is unset")
    nonce = secrets.token_hex(12)
    source_database = f"fortudo-preview-quarantine-gate-{nonce}-source"
    quarantine_database = f"fortudo-preview-quarantine-gate-{nonce}-quarantine"
    require(
        bool(PREVIEW_SOURCE_PATTERN.fullmatch(source_database)), "preview source name is invalid"
    )
    require(
        bool(PREVIEW_QUARANTINE_PATTERN.fullmatch(quarantine_database)),
        "preview quarantine name is invalid",
    )
    client = DisposablePreviewCloudantClient(credential_url)
    source_may_be_owned = False
    quarantine_may_be_owned = False
    phase = "initialization"
    report_values = None
    counts = {
        "timerZeroWritePreflights": 0,
        "taxonomyMeaningZeroWritePreflights": 0,
        "captureBindingMismatchBlocks": 0,
        "capturePreconditionDriftBlocks": 0,
        "capturePreconditionSecurityDriftBlocks": 0,
        "ambiguousReplicationRetries": 0,
        "leafDriftBlocks": 0,
        "securityDriftBlocks": 0,
        "forcedInterruptions": 0,
        "legacyWritesDenied": 0,
        "compatibleWritesAccepted": 0,
        "unexpectedRevisionBlocks": 0,
        "disposableDatabases": 2,
    }
    try:
        phase = "disposable identity preflight"
        require(not client.database_exists(source_database), "preview source already exists")
        require(
            not client.database_exists(quarantine_database), "preview quarantine already exists"
        )

        phase = "source fixture setup"
        source_may_be_owned = True
        client.create_database(source_database, partitioned=False, allow_disposable_preview=True)
        client.seed_revisions(source_database, fixture_documents())
        require(
            client.get_state_model(source_database) == expected_fixture_state(),
            "preview fixture state differs after seeding",
        )
        winners = client.get_all_documents(source_database, include_conflicts=True)
        winning_activity = next(
            document for document in winners if document.get("_id") == "activity-preview"
        )
        require(
            winning_activity.get("_rev") == f"2-{'f' * 32}",
            "preview conflict winner differs from the locked fixture",
        )

        phase = "timer zero-write preflight"
        before_timer_gate = client.get_state_model(source_database)
        quarantine_may_be_owned = True
        try:
            capture_with_current_bindings(
                client,
                source_database,
                quarantine_database,
            )
        except QuarantineSafetyError as error:
            require("running timer" in str(error), "timer preflight failed for another reason")
        else:
            raise QuarantineSafetyError("running timer did not block capture")
        require(
            client.get_state_model(source_database) == before_timer_gate
            and not client.database_exists(quarantine_database),
            "timer preflight wrote remote state",
        )
        counts["timerZeroWritePreflights"] += 1
        stop_timer_compatibly(client, source_database)

        phase = "taxonomy meaning zero-write preflight"
        taxonomy = client.get_document(source_database, "config-categories")
        require(
            taxonomy is not None and isinstance(taxonomy.get("_rev"), str),
            "preview taxonomy is absent before meaning drift",
        )
        meeting_row = next(
            (
                row
                for row in taxonomy.get("categories", [])
                if isinstance(row, dict) and row.get("key") == "work/meetings"
            ),
            None,
        )
        require(meeting_row is not None, "preview locked taxonomy row is absent")
        meeting_row["label"] = "Meetings"
        drift_response = client.put_document(source_database, taxonomy, create_only=False)
        require(
            isinstance(drift_response, Mapping) and isinstance(drift_response.get("rev"), str),
            "preview taxonomy drift response is invalid",
        )
        taxonomy["_rev"] = drift_response["rev"]
        try:
            capture_with_current_bindings(
                client,
                source_database,
                quarantine_database,
            )
        except QuarantineSafetyError as error:
            require(
                "locked taxonomy meaning" in str(error),
                "taxonomy meaning preflight failed for another reason",
            )
        else:
            raise QuarantineSafetyError("taxonomy meaning drift did not block capture")
        require(
            not client.database_exists(quarantine_database),
            "taxonomy meaning preflight created a quarantine database",
        )
        meeting_row["label"] = "Comms"
        restore_response = client.put_document(source_database, taxonomy, create_only=False)
        require(
            isinstance(restore_response, Mapping) and isinstance(restore_response.get("rev"), str),
            "preview taxonomy restore response is invalid",
        )
        counts["taxonomyMeaningZeroWritePreflights"] += 1

        phase = "capture binding mismatch gates"
        binding_state = client.get_state_model(source_database)
        binding_security_hash = client.get_security_hash(source_database)
        for changed_binding in ("source", "security"):
            try:
                capture_quarantine(
                    client,
                    source_database,
                    quarantine_database,
                    allow_disposable_preview=True,
                    expected_source_fingerprint=(
                        "0" * 64
                        if changed_binding == "source"
                        else binding_state.fingerprint
                    ),
                    expected_security_hash=(
                        "0" * 64
                        if changed_binding == "security"
                        else binding_security_hash
                    ),
                )
            except QuarantineSafetyError as error:
                require(
                    "preflight expectation" in str(error),
                    "capture binding mismatch failed for another reason",
                )
            else:
                raise QuarantineSafetyError("capture binding mismatch did not block capture")
            require(
                not client.database_exists(quarantine_database),
                "capture binding mismatch created a quarantine database",
            )
            counts["captureBindingMismatchBlocks"] += 1

        phase = "capture precondition drift gate"
        drift_client = DriftDuringCapturePreconditions(client, source_database)
        try:
            capture_with_current_bindings(
                drift_client,
                source_database,
                quarantine_database,
            )
        except QuarantineSafetyError as error:
            require(
                "capture preconditions" in str(error),
                "capture precondition drift failed for another reason",
            )
        else:
            raise QuarantineSafetyError("capture precondition drift did not block capture")
        require(
            drift_client.drifted and not client.database_exists(quarantine_database),
            "capture precondition drift created a quarantine database",
        )
        counts["capturePreconditionDriftBlocks"] += 1

        phase = "capture precondition security drift gate"
        original_capture_security = client.get_security_document(source_database)
        drifted_capture_security = copy.deepcopy(original_capture_security)
        capture_cloudant_roles = drifted_capture_security.setdefault("cloudant", {})
        require(
            isinstance(capture_cloudant_roles, dict),
            "preview capture security shape is unsupported",
        )
        capture_cloudant_roles[f"preview-capture-drift-{nonce}"] = ["_reader"]
        security_drift_client = SecurityDriftDuringCapturePreconditions(
            client,
            source_database,
            drifted_capture_security,
        )
        try:
            try:
                capture_with_current_bindings(
                    security_drift_client,
                    source_database,
                    quarantine_database,
                )
            except QuarantineSafetyError as error:
                require(
                    "security drifted during capture preconditions" in str(error),
                    "capture precondition security drift failed for another reason",
                )
            else:
                raise QuarantineSafetyError(
                    "capture precondition security drift did not block capture"
                )
        finally:
            client.put_preview_security(source_database, original_capture_security)
        require(
            security_drift_client.drifted
            and not client.database_exists(quarantine_database)
            and client.get_security_document(source_database) == original_capture_security,
            "capture precondition security drift was not restored exactly",
        )
        counts["capturePreconditionSecurityDriftBlocks"] += 1

        phase = "ambiguous quarantine capture"
        ambiguous_client = AmbiguousReplicationOnce(client)
        try:
            capture_with_current_bindings(
                ambiguous_client,
                source_database,
                quarantine_database,
            )
        except QuarantineSafetyError as error:
            require(
                "forced ambiguous transient response" in str(error),
                "initial transient replication failed before response ambiguity",
            )
            counts["ambiguousReplicationRetries"] += 1
        else:
            raise QuarantineSafetyError("transient response ambiguity was not exercised")
        require(
            client.database_exists(quarantine_database),
            "ambiguous replication did not retain its quarantine target",
        )

        phase = "retained-target quarantine retry"
        capture = capture_with_current_bindings(
            client,
            source_database,
            quarantine_database,
            resume_existing=True,
        )
        source_attachment = attachment_revision(client, source_database)
        quarantine_attachment = attachment_revision(client, quarantine_database)
        require(
            source_attachment == quarantine_attachment,
            "attachment revision did not survive quarantine replication",
        )

        phase = "source drift fence gate"
        drifted_task = client.get_document(source_database, "task-preview")
        require(
            drifted_task is not None and isinstance(drifted_task.get("_rev"), str),
            "preview task is absent before source drift",
        )
        drifted_task["description"] = "private edited preview task"
        client.put_document(
            source_database,
            drifted_task,
            create_only=False,
        )
        try:
            install_fence(client, capture)
        except QuarantineSafetyError:
            counts["leafDriftBlocks"] += 1
        else:
            raise QuarantineSafetyError("source leaf drift did not block fencing")
        require(
            client.get_document(source_database, CONTRACT_DESIGN_ID) is None,
            "source leaf drift installed a validator",
        )

        phase = "resumed quarantine capture"
        capture = capture_with_current_bindings(
            client,
            source_database,
            quarantine_database,
            resume_existing=True,
        )

        phase = "security drift fence gate"
        original_security = client.get_security_document(source_database)
        drifted_security = copy.deepcopy(original_security)
        cloudant_roles = drifted_security.setdefault("cloudant", {})
        require(isinstance(cloudant_roles, dict), "preview security shape is unsupported")
        cloudant_roles[f"preview-drift-{nonce}"] = ["_reader"]
        client.put_preview_security(source_database, drifted_security)
        try:
            try:
                install_fence(client, capture)
            except QuarantineSafetyError:
                counts["securityDriftBlocks"] += 1
            else:
                raise QuarantineSafetyError("security drift did not block fencing")
        finally:
            client.put_preview_security(source_database, original_security)
        require(
            client.get_security_hash(source_database) == capture.security_hash,
            "preview security was not restored exactly",
        )

        phase = "validator installation"
        fence = install_fence(client, capture)
        require(
            client.get_state_model(source_database) == fence.fenced_state,
            "validator installation state was not stable",
        )

        phase = "legacy denial"
        try:
            client.put_document(
                source_database,
                {
                    "_id": "task-preview-legacy-denied",
                    "id": "task-preview-legacy-denied",
                    "docType": "task",
                    "type": "unscheduled",
                },
                create_only=True,
            )
        except QuarantineSafetyError:
            counts["legacyWritesDenied"] += 1
        else:
            raise QuarantineSafetyError("legacy write was not denied")

        phase = "forced migration interruption"
        interrupted_client = InterruptOnce(client)
        try:
            execute_migration(
                interrupted_client,
                fence,
                completed_at=datetime.now(UTC).isoformat(),
            )
        except QuarantineSafetyError as error:
            require("forced interruption" in str(error), "migration failed before interruption")
            counts["forcedInterruptions"] += 1
        else:
            raise QuarantineSafetyError("forced interruption did not occur")

        phase = "fresh migration resume"
        fresh_client = OperationalCloudantClient(credential_url)
        migration = execute_migration(
            fresh_client,
            fence,
            completed_at=datetime.now(UTC).isoformat(),
        )

        phase = "compatible write and final invariant"
        fresh_client.put_document(
            source_database,
            {
                "_id": "config-preview-unexpected",
                "id": "config-preview-unexpected",
                "docType": "config",
                "category": None,
                "categoryId": None,
                "categoryIdentityVersion": None,
                "writerContract": {"version": 1, "categoryReference": None},
            },
            create_only=True,
        )
        counts["compatibleWritesAccepted"] += 1
        try:
            execute_migration(
                fresh_client,
                fence,
                completed_at=datetime.now(UTC).isoformat(),
            )
        except QuarantineSafetyError:
            counts["unexpectedRevisionBlocks"] += 1
        else:
            raise QuarantineSafetyError("unexpected revision did not block final verification")
        require(
            fresh_client.get_security_hash(source_database) == capture.security_hash,
            "source security changed during successful migration",
        )
        report_values = (capture, fence, migration)
    except QuarantineSafetyError as error:
        print(f"Cloudant quarantine gate blocked during {phase}: {error}", file=sys.stderr)
        return_code = 2
    else:
        return_code = 0
    finally:
        cleanup_errors = 0
        if quarantine_may_be_owned:
            try:
                if client.database_exists(quarantine_database):
                    client.delete_database(quarantine_database, allow_disposable_preview=True)
            except QuarantineSafetyError:
                cleanup_errors += 1
        if source_may_be_owned:
            try:
                if client.database_exists(source_database):
                    client.delete_database(source_database, allow_disposable_preview=True)
            except QuarantineSafetyError:
                cleanup_errors += 1
        try:
            if client.database_exists(source_database) or client.database_exists(
                quarantine_database
            ):
                cleanup_errors += 1
        except QuarantineSafetyError:
            cleanup_errors += 1
        if cleanup_errors:
            print("Cloudant quarantine gate cleanup verification failed", file=sys.stderr)
            return_code = 2

    if return_code == 0 and report_values is not None:
        safe_report(
            capture=report_values[0],
            fence=report_values[1],
            migration=report_values[2],
            counts=counts,
        )
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())

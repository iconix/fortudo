"""Credential-redacting Cloudant client for guarded migration operations."""

from __future__ import annotations

import base64
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Mapping

from scripts.cloudant_migration.state import (
    CloudantMigrationSafetyError,
    StateModel,
    build_state_model,
    canonical_hash,
)


LEAF_READ_BATCH_SIZE = 100
RATE_LIMIT_RETRIES = 6
RATE_LIMIT_BASE_DELAY_SECONDS = 0.5


class CloudantMigrationClient:
    """Small Cloudant client whose errors never expose credentials or document bodies."""

    def __init__(self, credential_url: str) -> None:
        parsed = urllib.parse.urlsplit(credential_url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise CloudantMigrationSafetyError("Cloudant credential URL must use HTTPS")
        if parsed.username is None or parsed.password is None:
            raise CloudantMigrationSafetyError("Cloudant credential URL is missing credentials")
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
                raise CloudantMigrationSafetyError(
                    f"Cloudant request failed with HTTP {error.code} during {operation}"
                ) from None
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                raise CloudantMigrationSafetyError(
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
            raise CloudantMigrationSafetyError("Cloudant returned an invalid document response")
        return dict(payload)

    def get_security_hash(self, database: str) -> str:
        payload = self._request(
            "GET", "security read", f"{self._database_path(database)}/_security"
        )
        if not isinstance(payload, Mapping):
            raise CloudantMigrationSafetyError("Cloudant returned an invalid security response")
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
            raise CloudantMigrationSafetyError(
                "Cloudant reported a different database identity"
            )
        return True

    def get_security_document(self, database: str) -> dict[str, Any]:
        payload = self._request(
            "GET", "security read", f"{self._database_path(database)}/_security"
        )
        if not isinstance(payload, Mapping):
            raise CloudantMigrationSafetyError("Cloudant returned an invalid security response")
        return dict(payload)

    def put_document(
        self, database: str, document: Mapping[str, Any], *, create_only: bool = False
    ) -> dict[str, Any]:
        document_id = document.get("_id")
        if not isinstance(document_id, str) or not document_id:
            raise CloudantMigrationSafetyError("document write is missing an ID")
        if create_only and "_rev" in document:
            raise CloudantMigrationSafetyError(
                "create-only document must not contain a revision"
            )
        operation = "document create" if create_only else "document update"
        payload = self._request(
            "PUT",
            operation,
            f"{self._database_path(database)}/{urllib.parse.quote(document_id, safe='')}",
            body=document,
        )
        if not isinstance(payload, Mapping) or payload.get("ok") is not True:
            raise CloudantMigrationSafetyError(
                "Cloudant returned an invalid document write response"
            )
        return dict(payload)

    def get_all_documents(
        self, database: str, *, include_conflicts: bool
    ) -> list[dict[str, Any]]:
        query = "include_docs=true"
        if include_conflicts:
            query += "&conflicts=true"
        payload = self._request(
            "GET",
            "winning document read",
            f"{self._database_path(database)}/_all_docs?{query}",
        )
        if not isinstance(payload, Mapping) or not isinstance(payload.get("rows"), list):
            raise CloudantMigrationSafetyError(
                "Cloudant returned an invalid winning document response"
            )
        documents: list[dict[str, Any]] = []
        for row in payload["rows"]:
            if not isinstance(row, Mapping):
                raise CloudantMigrationSafetyError(
                    "Cloudant returned an invalid winning document response"
                )
            document = row.get("doc")
            if document is None:
                continue
            if not isinstance(document, Mapping):
                raise CloudantMigrationSafetyError(
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
            raise CloudantMigrationSafetyError(
                "Cloudant returned an invalid leaf enumeration"
            )
        expected: set[tuple[str, str]] = set()
        for row in changes["results"]:
            document_id = row.get("id") if isinstance(row, Mapping) else None
            revision_rows = row.get("changes") if isinstance(row, Mapping) else None
            if (
                not isinstance(document_id, str)
                or not isinstance(revision_rows, list)
                or not revision_rows
            ):
                raise CloudantMigrationSafetyError(
                    "Cloudant returned an invalid leaf enumeration"
                )
            for revision_row in revision_rows:
                revision = (
                    revision_row.get("rev") if isinstance(revision_row, Mapping) else None
                )
                identity = (document_id, revision)
                if not isinstance(revision, str) or not revision or identity in expected:
                    raise CloudantMigrationSafetyError(
                        "Cloudant returned an invalid leaf enumeration"
                    )
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
                        {"id": document_id, "rev": revision}
                        for document_id, revision in batch
                    ]
                },
            )
            if not isinstance(payload, Mapping) or not isinstance(
                payload.get("results"), list
            ):
                raise CloudantMigrationSafetyError(
                    "Cloudant returned an invalid leaf body response"
                )
            for result in payload["results"]:
                result_id = result.get("id") if isinstance(result, Mapping) else None
                documents = result.get("docs") if isinstance(result, Mapping) else None
                if not isinstance(result_id, str) or not isinstance(documents, list):
                    raise CloudantMigrationSafetyError(
                        "Cloudant returned an invalid leaf body response"
                    )
                for document_result in documents:
                    document = (
                        document_result.get("ok")
                        if isinstance(document_result, Mapping)
                        else None
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
                        raise CloudantMigrationSafetyError(
                            "Cloudant returned an inconsistent leaf body"
                        )
                    returned.add((result_id, revision))
                    leaf_documents.append(dict(document))
        if returned != expected:
            raise CloudantMigrationSafetyError("Cloudant omitted a current leaf body")
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
            raise CloudantMigrationSafetyError("Cloudant returned invalid database metadata")
        if not isinstance(all_documents, Mapping) or not isinstance(
            all_documents.get("rows"), list
        ):
            raise CloudantMigrationSafetyError(
                "Cloudant returned an invalid winner enumeration"
            )

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
                raise CloudantMigrationSafetyError(
                    "Cloudant returned an invalid winner enumeration"
                )
            winners[document_id] = revision
        return build_state_model(leaf_rows, winners)

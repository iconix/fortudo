"""Read-only inspection of the Fortudo Cloudant document contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Any, Mapping, Sequence

# The runbook invokes this file directly. In that mode Python adds ``scripts/``
# rather than the repository root to ``sys.path``.
if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.migrations.taxonomy_identity_v1.planner import (
    CREDENTIAL_ENV_VAR,
    CloudantClient,
    MigrationSafetyError,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_ARTIFACT = REPOSITORY_ROOT / "contracts" / "document-contract-v1.json"
CONTRACT_DESIGN_ID = "_design/fortudo-document-contract"
CONTRACT_VERSION = 1
CONTRACT_CHECKSUM = "c0bf4717ff74c9daa32b850b059df95a45f2156b3491c91f5c658990c0e26a75"


class ContractOpsSafetyError(RuntimeError):
    """Raised when a read-only contract-inspection precondition does not hold."""


def _require_database_name(database: str) -> None:
    if not re.fullmatch(r"fortudo-[a-z0-9][a-z0-9-]*", database):
        raise ContractOpsSafetyError("database name is outside the Fortudo namespace")


def load_design_document() -> dict[str, Any]:
    """Load the Node-exported artifact and independently enforce the reviewed v1 identity."""

    try:
        document = json.loads(CONTRACT_ARTIFACT.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as error:
        raise ContractOpsSafetyError("contract artifact is unreadable") from error

    if not isinstance(document, dict):
        raise ContractOpsSafetyError("contract artifact is invalid")
    metadata = document.get("fortudoDocumentContract")
    validator = document.get("validate_doc_update")
    if (
        set(document)
        != {"_id", "language", "fortudoDocumentContract", "validate_doc_update"}
        or document.get("_id") != CONTRACT_DESIGN_ID
        or document.get("language") != "javascript"
        or not isinstance(metadata, dict)
        or type(metadata.get("version")) is not int
        or metadata != {"version": CONTRACT_VERSION, "checksum": CONTRACT_CHECKSUM}
        or not isinstance(validator, str)
    ):
        raise ContractOpsSafetyError("contract artifact is invalid")
    if hashlib.sha256(validator.encode("utf-8")).hexdigest() != CONTRACT_CHECKSUM:
        raise ContractOpsSafetyError("contract artifact checksum does not match reviewed v1")
    return document


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


class ContractOpsCloudantClient(CloudantClient):
    """Cloudant client extension for one exact read-only document lookup."""

    def get_document(self, database: str, document_id: str) -> dict[str, Any] | None:
        path = (
            f"{urllib.parse.quote(database, safe='')}/"
            f"{urllib.parse.quote(document_id, safe='')}"
        )
        try:
            payload = self._request("document read", path)
        except MigrationSafetyError as error:
            if "HTTP 404" in str(error):
                return None
            raise
        if not isinstance(payload, Mapping):
            raise MigrationSafetyError("Cloudant returned an invalid document response")
        return dict(payload)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="mode", required=True)
    verify = subparsers.add_parser("verify")
    verify.add_argument("--database", required=True)
    return parser


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
    report = {"mode": "verify", **verify_validator(client, args.database)}
    print(json.dumps({"mode": report["mode"], "state": report["state"]}, indent=2, sort_keys=True))
    return report


def main() -> int:
    try:
        execute()
    except (ContractOpsSafetyError, MigrationSafetyError) as error:
        print(f"Contract operation blocked: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

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

from scripts.migrate_taxonomy_identity import (
    CREDENTIAL_ENV_VAR,
    CloudantClient,
    MigrationSafetyError,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_MODULE = REPOSITORY_ROOT / "public" / "js" / "document-contract.js"
CONTRACT_DESIGN_ID = "_design/fortudo-document-contract"
CONTRACT_VERSION = 1
CONTRACT_CHECKSUM = "c0bf4717ff74c9daa32b850b059df95a45f2156b3491c91f5c658990c0e26a75"


class ContractOpsSafetyError(RuntimeError):
    """Raised when a read-only contract-inspection precondition does not hold."""


def _require_database_name(database: str) -> None:
    if not re.fullmatch(r"fortudo-[a-z0-9][a-z0-9-]*", database):
        raise ContractOpsSafetyError("database name is outside the Fortudo namespace")


def _extract_validator_source(module_source: str) -> str:
    start = module_source.index("function cloudantValidateDocUpdate")
    marker = "\n}\n\n/**\n * Add persistence metadata"
    end = module_source.index(marker, start) + 2
    return module_source[start:end].replace("function cloudantValidateDocUpdate", "function", 1)


def load_design_document() -> dict[str, Any]:
    try:
        module_source = CONTRACT_MODULE.read_text(encoding="utf-8")
        validator_source = _extract_validator_source(module_source)
    except (OSError, ValueError) as error:
        raise ContractOpsSafetyError("contract source is unreadable") from error

    checksum = hashlib.sha256(validator_source.encode("utf-8")).hexdigest()
    declared_match = re.search(
        r"DOCUMENT_CONTRACT_CHECKSUM\s*=\s*\n?\s*'([a-f0-9]{64})'", module_source
    )
    if (
        not declared_match
        or declared_match.group(1) != checksum
        or checksum != CONTRACT_CHECKSUM
    ):
        raise ContractOpsSafetyError("contract source checksum does not match its declaration")
    return {
        "_id": CONTRACT_DESIGN_ID,
        "language": "javascript",
        "fortudoDocumentContract": {"version": CONTRACT_VERSION, "checksum": checksum},
        "validate_doc_update": validator_source,
    }


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

"""Tests for the intentionally read-only document-contract inspector."""

from __future__ import annotations

import copy
import subprocess
import sys
from pathlib import Path

import pytest

from scripts import document_contract_ops as ops


class ReadOnlyCloudant:
    def __init__(self, document: dict | None = None) -> None:
        self.document = copy.deepcopy(document)
        self.reads: list[tuple[str, str]] = []

    def get_document(self, database: str, document_id: str) -> dict | None:
        self.reads.append((database, document_id))
        return copy.deepcopy(self.document)


def test_direct_cli_exposes_only_validator_verification(tmp_path: Path) -> None:
    script = Path(ops.__file__).resolve()

    result = subprocess.run(
        [sys.executable, str(script), "--help"],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "verify" in result.stdout
    for retired_mode in ("inventory", "snapshot", "install", "provision", "restore-quarantine"):
        assert retired_mode not in result.stdout


def test_retired_backup_and_mutation_entry_points_are_absent() -> None:
    for retired_name in (
        "create_inventory",
        "create_snapshot",
        "verify_snapshot",
        "install_validator",
        "provision_database",
        "restore_quarantine",
    ):
        assert not hasattr(ops, retired_name)

    for retired_method in (
        "create_database",
        "delete_database",
        "put_document",
        "put_security",
        "bulk_docs_new_edits_false",
    ):
        assert not hasattr(ops.ContractOpsCloudantClient, retired_method)


def test_design_document_source_and_declared_checksum_match_browser_contract() -> None:
    document = ops.load_design_document()
    metadata = document["fortudoDocumentContract"]

    assert document["_id"] == ops.CONTRACT_DESIGN_ID
    assert document["language"] == "javascript"
    assert metadata == {
        "version": ops.CONTRACT_VERSION,
        "checksum": ops.CONTRACT_CHECKSUM,
    }
    assert document["validate_doc_update"].startswith("function(newDoc, oldDoc)")


@pytest.mark.parametrize(
    ("document", "state"),
    [
        (None, "missing-validator"),
        ({"_id": ops.CONTRACT_DESIGN_ID, "_rev": "1-wrong"}, "validator-mismatch"),
    ],
)
def test_verify_validator_classifies_missing_and_mismatched_documents(document, state) -> None:
    client = ReadOnlyCloudant(document)

    result = ops.verify_validator(client, "fortudo-dat-411")

    assert result["state"] == state
    assert client.reads == [("fortudo-dat-411", ops.CONTRACT_DESIGN_ID)]


def test_verify_validator_accepts_the_exact_design_document() -> None:
    document = ops.load_design_document()
    document["_rev"] = "3-compatible"

    result = ops.verify_validator(ReadOnlyCloudant(document), "fortudo-dat-411")

    assert result == {"state": "compatible", "validatorRevision": "3-compatible"}


def test_cloudant_document_read_rejects_malformed_payload_without_echoing_it(monkeypatch) -> None:
    client = ops.ContractOpsCloudantClient("https://user:secret@example.invalid")
    monkeypatch.setattr(client, "_request", lambda _operation, _path: "private response body")

    with pytest.raises(ops.MigrationSafetyError, match="invalid document response") as error:
        client.get_document("fortudo-dat-411", ops.CONTRACT_DESIGN_ID)

    assert "private response body" not in str(error.value)


def test_execute_requires_credentials_and_performs_only_the_validator_read(capsys) -> None:
    client = ReadOnlyCloudant()

    result = ops.execute(
        ["verify", "--database", "fortudo-dat-411"],
        environ={ops.CREDENTIAL_ENV_VAR: "https://user:secret@example.invalid"},
        client_factory=lambda _credential: client,
    )

    assert result == {
        "mode": "verify",
        "state": "missing-validator",
        "validatorRevision": None,
    }
    assert client.reads == [("fortudo-dat-411", ops.CONTRACT_DESIGN_ID)]
    output = capsys.readouterr().out
    assert "secret" not in output
    assert "fortudo-dat-411" not in output
    assert "missing-validator" in output

    with pytest.raises(ops.ContractOpsSafetyError, match=ops.CREDENTIAL_ENV_VAR):
        ops.execute(["verify", "--database", "fortudo-dat-411"], environ={})


@pytest.mark.parametrize(
    "retired_argv",
    [
        [
            "inventory",
            "--manifest-root",
            "private",
            "--confirm-temporary-unencrypted",
        ],
        [
            "snapshot",
            "--database",
            "fortudo-dat-411",
            "--backup-root",
            "private",
            "--label",
            "S0",
            "--confirm-temporary-unencrypted",
        ],
        [
            "install",
            "--database",
            "fortudo-dat-411",
            "--confirm-database",
            "fortudo-dat-411",
            "--expected-target-binding-checksum",
            "a" * 64,
            "--snapshot",
            "private/S0",
        ],
        [
            "provision",
            "--database",
            "fortudo-new",
            "--confirm-database",
            "fortudo-new",
            "--expected-account-checksum",
            "a" * 64,
        ],
        [
            "restore-quarantine",
            "--database",
            "fortudo-quarantine",
            "--confirm-database",
            "fortudo-quarantine",
            "--expected-account-checksum",
            "a" * 64,
            "--snapshot",
            "private/S0",
        ],
    ],
)
def test_parser_rejects_retired_modes(retired_argv) -> None:
    with pytest.raises(SystemExit):
        ops._parser().parse_args(retired_argv)


def test_main_sanitizes_cloudant_failures(monkeypatch, capsys) -> None:
    def fail_execute():
        raise ops.MigrationSafetyError("Cloudant request failed with HTTP 429 during document read")

    monkeypatch.setattr(ops, "execute", fail_execute)

    assert ops.main() == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == (
        "Contract operation blocked: Cloudant request failed with HTTP 429 during document read\n"
    )
    assert "Traceback" not in captured.err

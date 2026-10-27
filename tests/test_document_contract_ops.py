"""Tests for the intentionally read-only document-contract inspector."""

from __future__ import annotations

import copy
import json
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


@pytest.mark.parametrize("contents", ["not json", "[]", "null", "{}", '{"validate_doc_update": 7}'])
def test_artifact_loader_rejects_invalid_documents_without_echoing_contents(
    tmp_path, monkeypatch, contents
):
    artifact = tmp_path / "contract.json"
    artifact.write_text(contents, encoding="utf-8")
    monkeypatch.setattr(ops, "CONTRACT_ARTIFACT", artifact)
    with pytest.raises(ops.ContractOpsSafetyError):
        ops.load_design_document()


def test_artifact_loader_rejects_missing_artifact(tmp_path, monkeypatch):
    monkeypatch.setattr(ops, "CONTRACT_ARTIFACT", tmp_path / "missing.json")
    with pytest.raises(ops.ContractOpsSafetyError, match="unreadable"):
        ops.load_design_document()


@pytest.mark.parametrize("field", ["source", "checksum", "version", "id", "language"])
def test_artifact_loader_rejects_drift(tmp_path, monkeypatch, field):
    document = ops.load_design_document()
    if field == "source":
        document["validate_doc_update"] += "\n"
    elif field == "checksum":
        document["fortudoDocumentContract"]["checksum"] = "0" * 64
    elif field == "version":
        document["fortudoDocumentContract"]["version"] = 2
    elif field == "id":
        document["_id"] = "_design/different"
    else:
        document["language"] = "different"
    artifact = tmp_path / "contract.json"
    artifact.write_text(json.dumps(document), encoding="utf-8")
    monkeypatch.setattr(ops, "CONTRACT_ARTIFACT", artifact)
    with pytest.raises(ops.ContractOpsSafetyError):
        ops.load_design_document()


def test_node_export_matches_python_artifact_from_another_working_directory(tmp_path):
    exporter = Path(ops.__file__).resolve().parent / "export-document-contract.mjs"
    result = subprocess.run(
        ["node", str(exporter)], cwd=tmp_path, capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == ops.load_design_document()


def test_generated_artifact_is_current():
    exporter = Path(ops.__file__).resolve().parent / "export-document-contract.mjs"
    result = subprocess.run(
        ["node", str(exporter), "--check"], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "fault", ["source", "metadata", "artifact", "missing-artifact", "arguments"]
)
def test_exporter_fails_closed_without_printing_artifact_on_error(tmp_path, fault):
    import shutil

    root = Path(ops.__file__).resolve().parents[1]
    for relative in (
        "scripts/export-document-contract.mjs",
        "public/js/contracts/remote-contract-v1.js",
        "public/js/contracts/package.json",
        "contracts/document-contract-v1.json",
    ):
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / relative, target)
    remote = tmp_path / "public/js/contracts/remote-contract-v1.js"
    artifact = tmp_path / "contracts/document-contract-v1.json"
    if fault == "source":
        remote.write_text(
            remote.read_text(encoding="utf-8").replace(
                "function deny(code) {", "function deny(code) { /* changed */"
            ),
            encoding="utf-8",
        )
    elif fault == "metadata":
        remote.write_text(
            remote.read_text(encoding="utf-8").replace(
                "REMOTE_DOCUMENT_CONTRACT_VERSION = 1", "REMOTE_DOCUMENT_CONTRACT_VERSION = 2"
            ),
            encoding="utf-8",
        )
    elif fault == "artifact":
        artifact.write_text("private artifact contents", encoding="utf-8")
    elif fault == "missing-artifact":
        artifact.unlink()
    args = ["--unknown"] if fault == "arguments" else ["--check"]
    result = subprocess.run(
        ["node", str(tmp_path / "scripts/export-document-contract.mjs"), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert result.stdout == ""
    assert "Document-contract export failed" in result.stderr
    assert "private artifact contents" not in result.stderr


def test_exporter_can_regenerate_the_same_reviewed_artifact(tmp_path):
    import shutil

    root = Path(ops.__file__).resolve().parents[1]
    for relative in (
        "scripts/export-document-contract.mjs",
        "public/js/contracts/remote-contract-v1.js",
        "public/js/contracts/package.json",
    ):
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / relative, target)
    (tmp_path / "contracts").mkdir()
    exporter = tmp_path / "scripts/export-document-contract.mjs"
    result = subprocess.run(
        ["node", str(exporter), "--write"], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == ""
    artifact = tmp_path / "contracts/document-contract-v1.json"
    assert json.loads(artifact.read_text(encoding="utf-8")) == ops.load_design_document()

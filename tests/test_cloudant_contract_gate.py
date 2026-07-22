"""Static safety boundaries for the disposable real-Cloudant gate."""

from pathlib import Path


GATE = Path(__file__).resolve().parents[1] / "scripts" / "cloudant-contract-gate.mjs"


def test_gate_uses_pouchdb_9_and_exact_disposable_cleanup():
    source = GATE.read_text(encoding="utf-8")

    assert "from 'pouchdb'" in source
    assert "fortudo-preview-contract-gate-" in source
    assert "cleanup target identity changed" in source
    assert "await database.destroy()" in source
    assert "--cleanup-orphans" in source
    assert "remaining.length === 0" in source
    assert "too_many_requests" in source
    assert "fortudo-dat-411" not in source


def test_gate_covers_partial_denial_checkpoint_detection_and_validator_last_order():
    source = GATE.read_text(encoding="utf-8")

    assert "doc_write_failures" in source
    assert "mixed batch valid sibling did not commit" in source
    assert "await local.replicate.from(database)" in source
    assert "database.revsDiff" in source
    assert "valid successor conflict was not replicated" in source
    assert "database.bulkDocs([base, validBase, taxonomyBase], { new_edits: false })" in source
    assert "validServerDeniedLeavesDetected" in source
    quarantine_gate = source[source.index("async function runCheckpointAndQuarantineGate") :]
    assert quarantine_gate.index("bulkDocs([base, validBase, taxonomyBase]") < quarantine_gate.index(
        "database.put(design)"
    )


def test_gate_runs_the_shared_golden_corpus_against_real_cloudant():
    source = GATE.read_text(encoding="utf-8")

    assert "document-contract-golden.json" in source
    assert "goldenCases" in source
    assert "runGoldenCorpusGate" in source


def test_gate_never_prints_credentials_urls_or_document_bodies():
    source = GATE.read_text(encoding="utf-8")

    assert "console.log(error" not in source
    assert "console.error(error" not in source
    assert "credentialUrl}" not in source
    assert "JSON.stringify(error" not in source
    assert "error instanceof GateAssertionError" in source

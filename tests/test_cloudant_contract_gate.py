"""Safety boundaries and offline CLI checks for the disposable Cloudant gate."""

import hashlib
import json
import os
import subprocess
from pathlib import Path

import pytest


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
    assert quarantine_gate.index(
        "bulkDocs([base, validBase, taxonomyBase]"
    ) < quarantine_gate.index("database.put(design)")


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


@pytest.mark.parametrize("mode", ["--audit-orphans", "--cleanup-orphans"])
@pytest.mark.parametrize("has_orphans", [False, True])
def test_orphan_commands_report_checksum_without_remote_access(tmp_path, mode, has_orphans):
    prefix = "fortudo-preview-contract-gate-"
    orphans = (
        [f"{prefix}{'b' * 24}-primary", f"{prefix}{'a' * 24}-quarantine"] if has_orphans else []
    )
    inventory = ["fortudo-preserved-room", "fortudo-preview-unrelated", *orphans]
    preload = tmp_path / "mock-cloudant.mjs"
    preload.write_text(
        r"""
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const gatePath = process.argv[1];
const mode = process.argv[2];
const inventory = JSON.parse(process.env.FORTUDO_TEST_INVENTORY);
const prefix = 'fortudo-preview-contract-gate-';
const expected = inventory.filter(name => name.startsWith(prefix)).sort();
const destroyed = [];
let reads = 0;
process.env.FORTUDO_CLOUDANT_URL = 'https://test-user:test-secret@cloudant.invalid';
globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://cloudant.invalid/_all_dbs');
    reads++;
    return { ok: true, json: async () => [...inventory] };
};
class FakePouchDB {
    static plugin() {}
    constructor(url, options) {
        assert.equal(mode, '--cleanup-orphans');
        assert.equal(options.skip_setup, true);
        this.name = decodeURIComponent(new URL(url).pathname.slice(1));
        assert.ok(expected.includes(this.name));
    }
    async info() { return { db_name: this.name }; }
    async destroy() {
        destroyed.push(this.name);
        inventory.splice(inventory.indexOf(this.name), 1);
    }
}
const require = createRequire(pathToFileURL(gatePath));
const pouchPath = require.resolve('pouchdb');
require.cache[pouchPath] = { id: pouchPath, filename: pouchPath, loaded: true, exports: FakePouchDB };
process.on('exit', () => {
    assert.equal(reads, mode === '--cleanup-orphans' ? 2 : 1);
    assert.deepEqual(destroyed, mode === '--cleanup-orphans' ? expected : []);
    assert.ok(inventory.includes('fortudo-preserved-room'));
    assert.ok(inventory.includes('fortudo-preview-unrelated'));
});
""",
        encoding="utf-8",
    )
    result = subprocess.run(
        ["node", "--import", preload.as_uri(), str(GATE), mode],
        env={**os.environ, "FORTUDO_TEST_INVENTORY": json.dumps(inventory)},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {
        "mode": "disposable-preview-cleanup"
        if mode == "--cleanup-orphans"
        else "disposable-preview-audit",
        "count": len(orphans),
        "identitySetChecksum": hashlib.sha256("\n".join(sorted(orphans)).encode()).hexdigest(),
    }
    assert "test-secret" not in result.stdout + result.stderr
    for name in inventory:
        assert name not in result.stdout + result.stderr

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VENDOR_DIR = ROOT / "public" / "vendor" / "pouchdb"
VENDORED = VENDOR_DIR / "pouchdb.min.js"


def run_vendor(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", "scripts/vendor-pouchdb.mjs", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def restore_vendor() -> None:
    result = run_vendor()
    assert result.returncode == 0, result.stdout + result.stderr


def test_pouchdb_vendor_is_fresh():
    result = run_vendor("--check")

    assert result.returncode == 0, result.stdout + result.stderr


def test_pouchdb_check_detects_stale_extra_and_vendor_restores():
    stale = VENDOR_DIR / "stale.js"
    stale.write_text("stale", encoding="utf-8")
    try:
        result = run_vendor("--check")
        assert result.returncode == 1

        result = run_vendor()
        assert result.returncode == 0, result.stdout + result.stderr
        assert sorted(path.name for path in VENDOR_DIR.iterdir()) == ["pouchdb.min.js"]
        assert run_vendor("--check").returncode == 0
        assert b"e&&![404,405,501].includes(e.status)?t(e)" in VENDORED.read_bytes()
    finally:
        restore_vendor()


def test_pouchdb_check_detects_byte_mismatch_and_vendor_restores():
    VENDORED.write_bytes(b"not pouchdb")
    try:
        result = run_vendor("--check")
        assert result.returncode == 1

        result = run_vendor()
        assert result.returncode == 0, result.stdout + result.stderr
        assert run_vendor("--check").returncode == 0
    finally:
        restore_vendor()


def test_patch_refuses_unreviewed_upstream_bundle():
    result = subprocess.run(
        [
            "node", "--input-type=module", "-e",
            "import { patchBulkGetDetection } from './scripts/pouchdb-bulk-get-patch.mjs';"
            "patchBulkGetDetection('// PouchDB 10.0.0\\nunknown');",
        ],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0
    assert "Unrecognized PouchDB bulk-get detection" in result.stderr

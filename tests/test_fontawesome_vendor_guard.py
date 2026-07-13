"""Guardrails for the committed Font Awesome vendor snapshot."""

from __future__ import annotations

import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
VENDOR_ROOT = REPO_ROOT / "public" / "vendor" / "fontawesome"


def run_vendor(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", "scripts/vendor-fontawesome.mjs", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )


def test_fontawesome_vendor_snapshot_is_fresh():
    result = run_vendor("--check")
    assert result.returncode == 0, result.stderr
    assert "Font Awesome vendor snapshot is up to date" in result.stdout


def test_check_rejects_an_unexpected_stale_file():
    stale = VENDOR_ROOT / "webfonts" / "obsolete-font.woff2"
    stale.write_bytes(b"stale")
    try:
        result = run_vendor("--check")
        assert result.returncode == 1
        assert "unexpected destination file" in result.stderr
    finally:
        stale.unlink(missing_ok=True)


def test_check_rejects_changed_bytes():
    css = VENDOR_ROOT / "css" / "all.min.css"
    original = css.read_bytes()
    css.write_bytes(original + b"\n/* drift */\n")
    try:
        result = run_vendor("--check")
        assert result.returncode == 1
        assert "content differs" in result.stderr
    finally:
        css.write_bytes(original)


def test_vendor_mode_removes_stale_files_and_restores_freshness():
    stale = VENDOR_ROOT / "webfonts" / "obsolete-font.woff2"
    stale.write_bytes(b"stale")
    try:
        result = run_vendor()

        assert result.returncode == 0, result.stderr
        assert not stale.exists()
        assert run_vendor("--check").returncode == 0
    finally:
        stale.unlink(missing_ok=True)

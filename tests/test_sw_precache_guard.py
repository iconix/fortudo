"""Guardrail: committed sw-precache.js must match public/ contents."""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_sw_precache_is_fresh():
    result = subprocess.run(
        ["node", "scripts/generate-sw-precache.mjs", "--check"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"stale sw-precache.js — run `npm run build:sw-precache`\n{result.stderr}"
    )


def test_sw_precache_version_is_independent_of_text_line_endings(tmp_path):
    workspace = tmp_path / "workspace"
    shutil.copytree(REPO_ROOT / "public", workspace / "public")
    (workspace / "scripts").mkdir()
    shutil.copy2(
        REPO_ROOT / "scripts" / "generate-sw-precache.mjs",
        workspace / "scripts" / "generate-sw-precache.mjs",
    )

    index = workspace / "public" / "index.html"
    lf_contents = index.read_bytes().replace(b"\r\n", b"\n")
    index.write_bytes(lf_contents)
    lf_result = subprocess.run(
        ["node", "scripts/generate-sw-precache.mjs"],
        cwd=workspace,
        capture_output=True,
        text=True,
        check=True,
    )

    index.write_bytes(lf_contents.replace(b"\n", b"\r\n"))
    crlf_result = subprocess.run(
        ["node", "scripts/generate-sw-precache.mjs"],
        cwd=workspace,
        capture_output=True,
        text=True,
        check=True,
    )

    version_pattern = re.compile(r"version ([0-9a-f]{12})")
    lf_version = version_pattern.search(lf_result.stdout).group(1)
    crlf_version = version_pattern.search(crlf_result.stdout).group(1)
    assert crlf_version == lf_version

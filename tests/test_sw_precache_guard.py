"""Guardrail: committed sw-precache.js must match public/ contents."""

from __future__ import annotations

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

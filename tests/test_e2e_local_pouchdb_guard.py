"""Guardrails for local E2E PouchDB asset routing."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from tests.e2e.helpers import install_required_local_pouchdb_route

E2E_DIR = Path(__file__).resolve().parent / "e2e"


class FakeBrowserContext:
    def route(self, *_args, **_kwargs):
        raise AssertionError("route should not be called when the PouchDB asset is missing")


def test_required_local_pouchdb_route_raises_when_asset_is_missing(tmp_path):
    with pytest.raises(RuntimeError, match="PouchDB asset"):
        install_required_local_pouchdb_route(FakeBrowserContext(), repo_root=tmp_path)


def test_e2e_tests_use_local_pouchdb_guard_helpers():
    offenders: list[str] = []

    for path in sorted(E2E_DIR.glob("test_*.py")):
        module = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(module):
            if not isinstance(node, ast.ImportFrom):
                continue
            if node.module != "scripts.e2e_helpers":
                continue
            imported_names = {alias.name for alias in node.names}
            direct_helpers = imported_names & {"install_local_pouchdb_route", "launch_browser"}
            if direct_helpers:
                offenders.append(f"{path.name}: {', '.join(sorted(direct_helpers))}")

    assert offenders == []

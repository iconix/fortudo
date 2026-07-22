"""Boundary tests for preview smoke modules."""

from __future__ import annotations

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
E2E_HELPERS = REPO_ROOT / "scripts" / "e2e_helpers.py"

PREVIEW_ONLY_HELPERS = {
    "build_couchdb_request_parts",
    "build_launch_options",
    "build_remote_db_name",
    "create_run_scoped_prefix",
    "create_scenario_rooms",
    "create_remote_database",
    "delete_remote_database",
    "derive_smoke_room_prefix",
    "extract_couchdb_url",
    "fetch_preview_couchdb_url",
    "fetch_remote_docs",
    "parse_cli_args",
    "put_remote_docs",
    "reset_remote_preview_rooms",
    "run_activities_room_scenario",
    "run_phase5_insights_smoke",
}


def parse_e2e_helpers() -> ast.Module:
    return ast.parse(E2E_HELPERS.read_text(encoding="utf-8"), filename=str(E2E_HELPERS))


def test_e2e_helpers_do_not_define_preview_only_smoke_functions():
    module = parse_e2e_helpers()
    defined_functions = {
        node.name for node in module.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }

    assert defined_functions.isdisjoint(PREVIEW_ONLY_HELPERS)


def test_e2e_helpers_do_not_import_preview_smoke_package():
    module = parse_e2e_helpers()
    preview_imports: list[str] = []

    for node in module.body:
        if isinstance(node, ast.Import):
            preview_imports.extend(
                alias.name for alias in node.names if alias.name.startswith("scripts.preview_smoke")
            )
        elif isinstance(node, ast.ImportFrom) and (node.module or "").startswith(
            "scripts.preview_smoke"
        ):
            preview_imports.append(node.module or "")

    assert preview_imports == []

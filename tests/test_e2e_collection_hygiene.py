"""Guardrails for pytest E2E module collection."""

from __future__ import annotations

import ast
from pathlib import Path

E2E_DIR = Path(__file__).resolve().parent / "e2e"


def top_level_calls(module: ast.Module, names: set[str]) -> list[str]:
    calls: list[str] = []
    for node in module.body:
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            func = node.value.func
            if isinstance(func, ast.Name) and func.id in names:
                calls.append(func.id)
            elif isinstance(func, ast.Attribute) and func.attr in names:
                calls.append(func.attr)
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            func = node.value.func
            if isinstance(func, ast.Attribute) and func.attr in names:
                calls.append(func.attr)
    return calls


def test_e2e_modules_do_not_run_schedules_at_collection_time():
    offenders: list[str] = []
    for path in sorted(E2E_DIR.glob("test_*.py")):
        if path.name == "test_server_fixture.py":
            continue
        module = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        calls = top_level_calls(module, {"now", "print", "skip"})
        if calls:
            offenders.append(f"{path.name}: {', '.join(calls)}")

    assert offenders == []

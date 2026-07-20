"""Contracts for Fortudo's multi-runtime test infrastructure."""

from __future__ import annotations

import ast
import json
import re
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def read_text(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def workflow_job(name: str) -> str:
    workflow = read_text(".github/workflows/ci-cd.yml")
    match = re.search(
        rf"^    {re.escape(name)}:\n(?P<body>.*?)(?=^    [a-zA-Z0-9_-]+:\n|\Z)",
        workflow,
        flags=re.MULTILINE | re.DOTALL,
    )
    assert match, f"workflow job {name!r} was not found"
    return match.group("body")


def test_python_toolchain_is_declared_and_locked():
    pyproject_path = REPO_ROOT / "pyproject.toml"
    lock_path = REPO_ROOT / "uv.lock"
    python_version_path = REPO_ROOT / ".python-version"

    assert pyproject_path.is_file()
    assert lock_path.is_file()
    assert python_version_path.read_text(encoding="utf-8").strip() == "3.12"
    gitignore_entries = {
        line.strip()
        for line in read_text(".gitignore").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    assert "uv.lock" not in gitignore_entries

    pyproject = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
    assert pyproject["project"]["requires-python"] == ">=3.12,<3.13"
    assert set(pyproject["dependency-groups"]["dev"]) == {
        "playwright==1.61.0",
        "pytest==9.1.1",
        "ruff==0.15.22",
    }


def test_package_scripts_expose_honest_locked_test_boundaries():
    scripts = json.loads(read_text("package.json"))["scripts"]

    assert scripts["lint:python"] == "uv run --locked ruff check scripts tests"
    assert (
        scripts["test:python"]
        == "uv run --locked pytest tests --ignore=tests/e2e --ignore=tests/preview -q"
    )
    assert scripts["test:e2e"] == "uv run --locked pytest tests/e2e -q"
    assert scripts["test:preview"] == "uv run --locked pytest tests/preview -q"
    for command in ("test:python", "test:e2e", "test:preview"):
        assert "python -m pytest tests -q" not in scripts[command]

    verify = scripts["verify"]
    for command in ("check", "lint:python", "test:coverage", "test:python", "test:e2e"):
        assert f"npm run {command}" in verify


def test_local_browser_server_is_explicit_dynamic_and_preview_independent():
    conftest_path = REPO_ROOT / "tests" / "e2e" / "conftest.py"
    module = ast.parse(conftest_path.read_text(encoding="utf-8"), filename=str(conftest_path))
    fixture = next(
        node
        for node in module.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "app_server"
    )
    fixture_decorator = next(
        decorator
        for decorator in fixture.decorator_list
        if isinstance(decorator, ast.Call)
        and isinstance(decorator.func, ast.Attribute)
        and decorator.func.attr == "fixture"
    )
    autouse = next((keyword.value for keyword in fixture_decorator.keywords if keyword.arg == "autouse"), None)
    assert autouse is None or (isinstance(autouse, ast.Constant) and autouse.value is False)

    missing_fixture_users: list[str] = []
    for path in sorted((REPO_ROOT / "tests" / "e2e").glob("test_*.py")):
        test_module = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in test_module.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith(
                "test_"
            ):
                argument_names = {argument.arg for argument in node.args.args}
                if "app_server" not in argument_names:
                    missing_fixture_users.append(f"{path.name}::{node.name}")
    assert missing_fixture_users == []

    helpers = read_text("tests/e2e/helpers.py")
    assert "FORTUDO_E2E_PORT" in helpers
    assert "PORT = 9847" not in helpers
    assert "FORTUDO_E2E_REUSE_SERVER" not in read_text("tests/e2e/conftest.py")

    assert not (REPO_ROOT / "tests" / "e2e" / "test_unscheduled_order_preview_sync.py").exists()
    assert (REPO_ROOT / "tests" / "preview" / "test_unscheduled_order_sync.py").is_file()


def test_ci_separates_python_unit_browser_and_deployment_gates():
    workflow = read_text(".github/workflows/ci-cd.yml")
    python_tests = workflow_job("python-tests")
    e2e = workflow_job("e2e")

    assert "actions/setup-node@v7" in python_tests
    assert "npm run lint:python" in python_tests
    assert "npm run test:python" in python_tests
    assert "npm run test:e2e" not in python_tests

    assert "actions/setup-node@v7" in e2e
    assert "npm run test:e2e" in e2e
    assert "npm run test:python" not in e2e

    assert "pip install playwright pytest" not in workflow
    assert workflow.count("python -m pip install uv==0.11.21") >= 2
    assert workflow.count("uv sync --locked") >= 2

    for job_name in ("deploy-preview", "deploy-production"):
        job = workflow_job(job_name)
        needs = re.search(r"^        needs: \[(?P<jobs>[^]]+)]$", job, flags=re.MULTILINE)
        assert needs, f"{job_name} must declare its deployment gates in a flow list"
        dependencies = {dependency.strip() for dependency in needs.group("jobs").split(",")}
        assert {"test", "python-tests", "e2e", "build", "check_for_code_changes"} <= dependencies


def test_precommit_is_fast_language_aware_and_worktree_safe():
    hook = read_text("hooks/pre-commit")
    installer = read_text("hooks/install.js")

    assert r"\.(js|jsx|ts|tsx|json|md|py|toml|ya?ml)$" in hook
    assert "npm run lint:python" in hook
    assert "npm run test:python" in hook
    assert "--findRelatedTests" in hook
    assert "npm test -- --coverage" not in hook
    assert "--git-common-dir" in installer

# E2E Suite Consolidation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `test_phase6_e2e.py` actually run in CI (unblocking PR #83), then consolidate the fragmented Python E2E surface into one pytest-based suite with a shared helper library and a documented boundary between pre-merge tests and post-deploy smoke.

**Architecture:** One branch, one PR. All work lands as a sequence of commits on the existing `phase6d-e2e` branch, so PR #83 carries both the review fixes and the full consolidation. Two logical stages on that branch: Part 1 (Tasks 1–3) fixes the PR — env-driven browser channel, one wasted browser launch removed, the pytest suite wired into `test_run_all.py` + CI; Part 2 (Tasks 4–10) consolidates — a `tests/` tree with a pytest server fixture, extraction of the shared helper library out of `scripts/playwright_preview_smoke.py` into `scripts/e2e_helpers.py`, mechanical conversion of the 5 legacy procedural suites into single-scenario pytest tests, and deletion of the bespoke runner (`test_run_all.py`, `scripts/e2e_server.py`). Task 3's `test_run_all.py` edit is deliberately kept even though Task 9 deletes the file: each commit stays green on its own, so the PR can be reviewed (or bisected) commit by commit. Tradeoff accepted knowingly: #83 grows from a 2-file draft to a tree-wide test refactor; the PR title/body must be updated to match (manual item, Task 10).

**Tech Stack:** Playwright (Python, sync API), pytest, plain `http.server` for static serving, GitHub Actions, npm scripts as entry points.

## Context: review findings this plan addresses

From the 2026-07-06 review of PR #83:

1. **High — dead coverage:** `test_phase6_e2e.py` is never executed. CI runs `npm run test:e2e` → `test_run_all.py`, whose script list has only the 5 legacy suites. The file is pytest-style with no `__main__` block, and CI installs only `playwright` (no pytest). → Part 1, Task 3.
2. **Medium — browser channel mismatch:** the phase6 file hardcodes `channel="chrome"` (system Chrome) while every other suite and CI's `playwright install chromium` use bundled chromium. → Part 1, Task 1; unified in Part 2, Task 5.
3. **Medium — implicit suite boundary:** the preview smoke harness already covers timer-restore-after-reload and day-scoping; nothing documents which suite owns what. → Part 2, Task 10.
4. **Low — wasted browser launch:** `test_insights_selected_day_scopes_details` launches a throwaway browser just to compute dates. → Part 1, Task 2.
5. **Low — `sys.path.insert` import hack** in `test_phase6_e2e.py`. → Part 2, Tasks 4–6.
6. **Low — plan docs untracked:** `docs/plans/design/2026-06-30-fortudo-phase6-polish.md` and `docs/plans/implementation/2026-06-30-phase6-polish.md` exist only in the working tree. → Part 2, Task 10.
7. **Bonus (found while planning):** `test_functional.py` and `test_ui_interaction.py` never exit nonzero when their `test(name, condition)` accumulator records failures — only hard `assert`s fail CI; accumulated `FAIL:` lines print and the script exits 0. (`test_gap_indicators.py` and `test_overlap_warnings.py` already end with `if failed > 0: exit(1)` and are not affected.) The pytest conversion fixes this with a final `assert failed == 0`. → Part 2, Task 7.

Not in scope for the implementing agent: pushing `phase6d-e2e` and editing PR #83's title/description (stale "Stacked on #82" line, plus retitling to reflect the expanded scope) — both need github.com access the agent doesn't have; Nadja handles them.

## Global Constraints

- E2E tests expect the app on `http://127.0.0.1:9847` serving `public/`
- CI failure-screenshot artifact path is `test_screenshots/` at repo root — every screenshot must keep landing there after files move
- Local Python invocations use `uv run` (never bare pip/venv); CI keeps its existing `pip install` style
- `npm run format` before every commit that touches `.json`/`.md` files; never `--no-verify`
- All existing tests (Jest unit, legacy E2E, preview-smoke unit tests) must still pass after every task
- Playwright browser install for local verification: `uv run --with playwright python -m playwright install chromium`
- Prettier/ESLint govern JS only; Python files have no linter — match surrounding style by hand

---

## File Structure

All files below change on the single `phase6d-e2e` branch (PR #83).

### Part 1 (PR fixes, Tasks 1–3)

- Modify: `test_phase6_e2e.py` — env-driven channel, single-browser insights test
- Modify: `test_run_all.py` — run the pytest suite after the script suites
- Modify: `.github/workflows/ci-cd.yml` — install pytest

### Part 2 (consolidation, Tasks 4–10)

- Create: `pyproject.toml` — pytest config (`testpaths`, `pythonpath`)
- Create: `tests/e2e/conftest.py` — session-scoped app-server fixture
- Create: `tests/e2e/test_server_fixture.py` — fixture smoke test
- Create: `scripts/e2e_helpers.py` — shared browser/page/assertion/doc-builder library (moved out of `scripts/playwright_preview_smoke.py`)
- Modify: `scripts/playwright_preview_smoke.py` — keeps CLI + preview/CouchDB helpers + scenarios; re-exports helpers
- Move: `test_phase6_e2e.py` → `tests/e2e/test_phase6.py`
- Move: `test_visual_inspection.py` → `tests/e2e/test_visual_inspection.py` (and the other 4 legacy suites likewise)
- Move: `test_playwright_preview_smoke.py` → `tests/test_preview_smoke_helpers.py`
- Delete: `test_run_all.py`, `scripts/e2e_server.py`
- Modify: `package.json` — `test:e2e` script
- Modify: `README.md` — testing section documenting the suite boundary
- Modify: `.gitignore` — add `.DS_Store`

---

# Part 1 — Fix PR #83 (Tasks 1–3)

All tasks in this plan work on the existing PR branch:

```bash
cd /Users/nadjar/code/fortudo
git fetch origin
git checkout phase6d-e2e 2>/dev/null || git checkout -b phase6d-e2e origin/phase6d-e2e
```

Expected starting state (verified 2026-07-06): local `phase6d-e2e` is 1 commit ahead of `origin/phase6d-e2e` — `c596a7f` "docs: add e2e wiring + consolidation plan from PR review", which adds this plan file. That commit rides along in the final push; don't treat it as unexpected drift. If the branch has moved beyond this (e.g. someone pushed or committed in the meantime), stop and re-check the Task 10 assumptions before proceeding.

For local verification in Part 1 (no fixture yet), start the app server once in a background shell and leave it running:

```bash
python3 -m http.server 9847 --bind 127.0.0.1 --directory public &
```

Kill it when Part 1 is done: `lsof -ti :9847 | xargs kill`.

**Do not push at any point.** Pushing `phase6d-e2e` updates the open PR #83, so that stays Nadja's call — she pushes once, after the whole plan is done and reviewed.

### Task 1: Env-driven browser channel in `test_phase6_e2e.py`

**Files:**

- Modify: `test_phase6_e2e.py`

**Interfaces:**

- Produces: `launch_browser(playwright) -> Browser` module helper, `E2E_BROWSER_CHANNEL` env var contract (unset/`chromium` → bundled chromium; any other value, e.g. `chrome`, is passed as Playwright `channel`). Part 2 Task 5 moves this same function into `scripts/e2e_helpers.py` verbatim.

- [ ] **Step 1: Add the helper and `os` import**

In `test_phase6_e2e.py`, add `import os` to the stdlib import block at the top (alongside `import sys`). Then add, directly below the `ROOM_CODE`/`BASE_URL` constants near the top of the file:

```python
BROWSER_CHANNEL = os.environ.get("E2E_BROWSER_CHANNEL", "chromium")


def launch_browser(playwright):
    """Launch chromium; set E2E_BROWSER_CHANNEL=chrome to use system Chrome instead."""
    options = {"headless": True}
    if BROWSER_CHANNEL != "chromium":
        options["channel"] = BROWSER_CHANNEL
    return playwright.chromium.launch(**options)
```

(This mirrors `build_launch_options` in `scripts/playwright_preview_smoke.py:310`, which treats `"chromium"` as "no channel".)

- [ ] **Step 2: Replace all four hardcoded launch sites**

There are exactly 4 occurrences of:

```python
browser = playwright.chromium.launch(headless=True, channel="chrome")
```

(inside `test_activities_onboarding_prepares_ui_and_persists_dismissal`, `launch_seeded_page`, `test_mobile_insights_has_no_horizontal_overflow`, and `test_mobile_scheduled_edit_draft_survives_delayed_ui_refresh`). Replace each with:

```python
browser = launch_browser(playwright)
```

Confirm zero remaining: `grep -n 'channel="chrome"' test_phase6_e2e.py` → no output.

- [ ] **Step 3: Run the suite under the new default (bundled chromium)**

```bash
uv run --with pytest --with playwright python -m playwright install chromium
uv run --with pytest --with playwright python -m pytest test_phase6_e2e.py -q
```

Expected: `7 passed` (~30–60s). If a mobile-overflow test fails only under chromium (not chrome), that is a real rendering difference — stop and report it to Nadja rather than re-pinning chrome silently.

- [ ] **Step 4: Also verify the chrome escape hatch still works**

```bash
E2E_BROWSER_CHANNEL=chrome uv run --with pytest --with playwright python -m pytest test_phase6_e2e.py -q
```

Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add test_phase6_e2e.py
git commit -m "test: make phase6 e2e browser channel env-driven, default chromium"
```

### Task 2: Single-browser `test_insights_selected_day_scopes_details`

**Files:**

- Modify: `test_phase6_e2e.py`

**Interfaces:**

- Consumes: `launch_browser` from Task 1; `install_local_pouchdb_route`, `clear_room_storage`, `seed_docs`, `enter_room`, `wait_for_main_app`, `dismiss_open_modals`, `build_relative_day_activity_doc`, `build_relative_day_scheduled_task_doc`, `assert_trend_day_selection_scopes_details` (all already imported from `playwright_preview_smoke`)
- Produces: `seed_and_enter_room(page, room_code, docs)` module helper (reused by `launch_seeded_page`)

- [ ] **Step 1: Split `launch_seeded_page` so the seeding steps are reusable on an existing page**

Replace the current `launch_seeded_page` definition with:

```python
def seed_and_enter_room(page, room_code: str, docs: list[dict] | None = None) -> None:
    page.goto(BASE_URL, wait_until="load")
    page.evaluate("localStorage.clear()")
    clear_room_storage(page, room_code)
    seed_docs(page, room_code, docs or [])
    enter_room(page, room_code)
    wait_for_main_app(page)
    dismiss_open_modals(page)


def launch_seeded_page(playwright, room_code: str, docs: list[dict] | None = None):
    browser = launch_browser(playwright)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    install_local_pouchdb_route(context, repo_root=Path(__file__).parent)
    page = context.new_page()
    seed_and_enter_room(page, room_code, docs)
    return browser, context, page
```

- [ ] **Step 2: Rewrite the insights test to use one browser**

Replace the entire `test_insights_selected_day_scopes_details` function with:

```python
def test_insights_selected_day_scopes_details():
    room_code = "phase6-insights-scope"
    with sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        install_local_pouchdb_route(context, repo_root=Path(__file__).parent)
        page = context.new_page()

        try:
            # Doc builders evaluate date math in the browser, so load the page first.
            page.goto(BASE_URL, wait_until="load")
            today_activity = build_relative_day_activity_doc(
                page,
                doc_id="phase6-today-activity",
                description="Phase 6 today actual",
                day_offset=0,
                start_hour=9,
                start_minute=0,
                duration_minutes=30,
            )
            prior_activity = build_relative_day_activity_doc(
                page,
                doc_id="phase6-prior-activity",
                description="Phase 6 prior actual",
                day_offset=-1,
                start_hour=10,
                start_minute=0,
                duration_minutes=45,
            )
            today_task = build_relative_day_scheduled_task_doc(
                page,
                doc_id="phase6-today-task",
                description="Phase 6 today plan",
                day_offset=0,
                start_hour=8,
                start_minute=30,
                duration_minutes=30,
            )
            prior_task = build_relative_day_scheduled_task_doc(
                page,
                doc_id="phase6-prior-task",
                description="Phase 6 prior plan",
                day_offset=-1,
                start_hour=9,
                start_minute=30,
                duration_minutes=30,
            )

            seed_and_enter_room(
                page,
                room_code,
                [activities_config(), today_task, prior_task, today_activity, prior_activity],
            )

            page.locator("#view-toggle-insights").click()
            page.locator("#insights-view").wait_for(state="visible", timeout=10000)

            assert_trend_day_selection_scopes_details(
                page,
                selected_date=prior_activity["localDate"],
                expected_date_text=format_browser_long_date(page, prior_activity["localDate"]),
                expected_activity_description="Phase 6 prior actual",
            )
            assert "Phase 6 today actual" not in (
                page.locator("#insights-activity-list").text_content() or ""
            )
        finally:
            context.close()
            browser.close()
```

- [ ] **Step 3: Run the full file**

```bash
uv run --with pytest --with playwright python -m pytest test_phase6_e2e.py -q
```

Expected: `7 passed`.

- [ ] **Step 4: Commit**

```bash
git add test_phase6_e2e.py
git commit -m "test: reuse one browser in insights day-scoping e2e"
```

### Task 3: Wire the pytest suite into `test_run_all.py` and CI

**Files:**

- Modify: `test_run_all.py`
- Modify: `.github/workflows/ci-cd.yml`

**Interfaces:**

- Consumes: `test_phase6_e2e.py` as a pytest file (no `__main__` block — must be invoked via `python -m pytest`)
- Produces: CI's "E2E Tests (Playwright)" job actually executes the phase6 suite; `pytest` present in the CI Python env (Part 2 relies on this)

- [ ] **Step 1: Add a pytest-suite list and second run loop to `test_run_all.py`**

Directly below the existing `scripts = [...]` list, add:

```python
# pytest-style suites (no __main__ block; must run via python -m pytest)
pytest_suites = [
    "test_phase6_e2e.py",
]
```

Then replace the `# --- Run test suites ---` block's `try:` body (keep the existing `for script in scripts:` loop unchanged) so a second loop follows it inside the same `try`:

```python
# --- Run test suites ---
exit_code = 0
try:
    for script in scripts:
        print(f"\n{'='*70}", flush=True)
        print(f"  RUNNING: {script}", flush=True)
        print(f"{'='*70}\n", flush=True)
        result = subprocess.run(
            [sys.executable, script],
            cwd=os.path.dirname(os.path.abspath(__file__)),
        )
        if result.returncode != 0:
            exit_code = 1
            print(
                f"\n  *** {script} exited with code {result.returncode} ***\n",
                flush=True,
            )

    for suite in pytest_suites:
        print(f"\n{'='*70}", flush=True)
        print(f"  RUNNING: {suite} (pytest)", flush=True)
        print(f"{'='*70}\n", flush=True)
        result = subprocess.run(
            [sys.executable, "-m", "pytest", suite, "-q"],
            cwd=os.path.dirname(os.path.abspath(__file__)),
        )
        if result.returncode != 0:
            exit_code = 1
            print(
                f"\n  *** {suite} exited with code {result.returncode} ***\n",
                flush=True,
            )
finally:
```

(The `finally:` block and everything after it stay exactly as they are.)

- [ ] **Step 2: Install pytest in the CI E2E job**

In `.github/workflows/ci-cd.yml`, the "Install Playwright" step currently reads:

```yaml
- name: Install Playwright
  run: |
    pip install playwright
    python -m playwright install chromium --with-deps
```

Change the pip line to:

```yaml
pip install playwright pytest
```

Note on CI behavior: the E2E job never runs `npm ci`, so `node_modules/pouchdb/dist/pouchdb.min.js` doesn't exist there and `install_local_pouchdb_route` silently no-ops — in CI the phase6 tests fetch PouchDB from the live CDN (the legacy suites already do). Not new breakage, but if a CDN blip ever fails only the phase6 tests, this is why.

- [ ] **Step 3: Verify the full runner locally**

Kill any server you started manually first (`lsof -ti :9847 | xargs kill`), then:

```bash
uv run --with pytest --with playwright python test_run_all.py
```

Expected: the 5 legacy suites run, then `RUNNING: test_phase6_e2e.py (pytest)` with `7 passed`, overall exit code 0 (`echo $?` → `0`).

- [ ] **Step 4: Commit, then stop for review**

```bash
git add test_run_all.py .github/workflows/ci-cd.yml
git commit -m "ci: run phase6 pytest e2e suite in test_run_all and install pytest"
```

**Checkpoint.** Part 1 is complete. Continue straight into Part 2 on the same branch.

---

# Part 2 — Consolidate the E2E suite (Tasks 4–10)

Stay on `phase6d-e2e`. Part 2 depends on Part 1's edits to `test_phase6_e2e.py`, `test_run_all.py`, and the CI pytest install.

Background for the implementer — the current landscape this part unifies:

| File                                                                                                                              | Style                                                | Runs where                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------- |
| `test_visual_inspection.py`, `test_functional.py`, `test_ui_interaction.py`, `test_gap_indicators.py`, `test_overlap_warnings.py` | procedural module-level scripts                      | CI via `test_run_all.py`                |
| `test_phase6_e2e.py`                                                                                                              | pytest                                               | CI via `test_run_all.py` (since Part 1) |
| `scripts/playwright_preview_smoke.py` (3,220 lines)                                                                               | argparse CLI + de facto shared helper library        | manually, against preview deploys       |
| `test_playwright_preview_smoke.py` (1,634 lines)                                                                                  | unittest, mock-based unit tests of the smoke helpers | manually only                           |

### Task 4: pytest scaffolding — config, server fixture, fixture smoke test

**Files:**

- Create: `pyproject.toml`
- Create: `tests/e2e/conftest.py`
- Create: `tests/e2e/test_server_fixture.py`

**Interfaces:**

- Produces: `pytest` configured with `testpaths = ["tests"]` and `pythonpath = ["."]` (repo root importable, so `from scripts.e2e_helpers import ...` works from any test); an autouse session fixture in `tests/e2e/` that serves `public/` on `127.0.0.1:9847`, reusing an already-running server if one is up (so headed local debugging against a manually started server still works). Every later task's tests rely on both.

- [ ] **Step 1: Write the failing fixture smoke test**

Create `tests/e2e/test_server_fixture.py`:

```python
"""Sanity check that the session app-server fixture serves the app."""

import http.client


def test_app_server_serves_index():
    conn = http.client.HTTPConnection("127.0.0.1", 9847, timeout=5)
    conn.request("GET", "/")
    resp = conn.getresponse()
    conn.close()
    assert resp.status == 200
```

- [ ] **Step 2: Create `pyproject.toml`, then run the test to verify it fails**

Create `pyproject.toml` at repo root:

```toml
[tool.pytest.ini_options]
# pythonpath requires pytest >= 7.0; minversion makes older pytest fail loudly
# instead of silently ignoring it (which would break `from scripts...` imports).
minversion = "7.0"
testpaths = ["tests"]
pythonpath = ["."]
```

Run (make sure nothing is listening on 9847 first: `lsof -ti :9847 | xargs kill`):

```bash
uv run --with pytest python -m pytest tests/e2e/test_server_fixture.py -q
```

Expected: FAIL with `ConnectionRefusedError` (no server, no fixture yet).

- [ ] **Step 3: Create the conftest fixture**

Create `tests/e2e/conftest.py` (the start/reuse logic is ported from `test_run_all.py`, which Task 9 deletes):

```python
"""Session fixture: serve public/ on 127.0.0.1:9847 for the E2E suite.

If a server is already running on the port (e.g. started manually for headed
debugging), it is reused and left running.
"""

import http.client
import os
import socket
import subprocess
import sys
import time

import pytest

PORT = 9847
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUBLIC_DIR = os.path.join(REPO_ROOT, "public")


def _is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def _wait_for_server(port, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            conn.request("GET", "/")
            resp = conn.getresponse()
            conn.close()
            if resp.status == 200:
                return True
        except (ConnectionRefusedError, OSError):
            pass
        time.sleep(0.3)
    return False


@pytest.fixture(scope="session", autouse=True)
def app_server():
    if _is_port_in_use(PORT):
        yield
        return
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=PUBLIC_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if not _wait_for_server(PORT):
        proc.kill()
        raise RuntimeError(f"Could not start app server on port {PORT}")
    yield
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
uv run --with pytest python -m pytest tests/e2e/test_server_fixture.py -q
```

Expected: `1 passed`. Afterwards confirm the fixture cleaned up: `lsof -ti :9847` → no output.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml tests/e2e/conftest.py tests/e2e/test_server_fixture.py
git commit -m "test: add pytest scaffolding with session app-server fixture"
```

### Task 5: Extract `scripts/e2e_helpers.py` from the smoke module

**Files:**

- Create: `scripts/e2e_helpers.py`
- Modify: `scripts/playwright_preview_smoke.py`
- Modify (only if patch targets break, see Step 5): `test_playwright_preview_smoke.py`

**Interfaces:**

- Produces: `scripts/e2e_helpers.py` exporting every shared browser/page/assertion/doc-builder helper (exact list in Step 1) plus a new `launch_browser(playwright) -> Browser` (same env contract as Part 1 Task 1: `E2E_BROWSER_CHANNEL`, default `"chromium"` → no channel). `scripts/playwright_preview_smoke.py` keeps its full public surface via a star re-export, so existing imports (`test_phase6_e2e.py`, unit tests) keep working unchanged until later tasks migrate them.

- [ ] **Step 1: Move the shared helpers**

This is a cut-paste move, not a rewrite. In `scripts/playwright_preview_smoke.py`, the functions fall into two groups.

**KEEP in `playwright_preview_smoke.py`** (preview-deploy specific — CouchDB access, CLI, scenario orchestration). Exhaustive list:

- Module constant: `COUCHDB_URL_RE`
- `extract_couchdb_url`, `build_couchdb_request_parts`, `build_remote_db_name`, `fetch_preview_couchdb_url`, `delete_remote_database`, `fetch_remote_docs`, `reset_remote_preview_rooms`
- `derive_smoke_room_prefix`, `create_scenario_rooms`, `create_run_scoped_prefix`
- `parse_cli_args`, `build_launch_options`
- `run_phase5_insights_smoke`, `run_activities_room_scenario`, `run_smoke`, `main`, and the `if __name__ == "__main__":` guard

`get_hostname_from_url`, `is_preview_host`, and `supports_activity_smoke_failure_host` MOVE despite looking preview-flavored: moved helpers call them (`compute_storage_room_code` → `is_preview_host`; `queue_activity_smoke_failure` → `get_hostname_from_url` + `supports_activity_smoke_failure_host`), and moved code resolves callees in `e2e_helpers`' globals — leaving them behind means a `NameError`, and the `queue_activity_smoke_failure` one would only surface during a manual preview smoke run. They are pure string/urlparse helpers; the kept CouchDB code still reaches them through the star re-export.

**MOVE to `scripts/e2e_helpers.py`**: every other top-level function and constant in the file — i.e. `get_hostname_from_url`, `is_preview_host`, `supports_activity_smoke_failure_host`, `configure_demo_logging`, `normalize_doc`, `compute_storage_room_code`, `summarize_docs`, `format_doc_ids`, `format_snapshot`, `assert_same_ids`, `assert_migrated_task_docs`, `assert_non_task_docs_remain`, `build_phase3_taxonomy_config_doc`, `install_local_pouchdb_route`, `storage_eval_arg`, `read_docs`, `seed_docs`, `clear_room_storage`, `set_activities_enabled`, `queue_activity_smoke_failure`, `open_settings_modal`, `close_settings_modal`, `wait_for_toast_text`, `add_activity`, `force_activity_mode`, `start_activity_timer`, `get_relative_browser_time`, `build_relative_day_activity_doc`, `build_relative_day_scheduled_task_doc`, `stop_activity_timer`, `start_timer_from_unscheduled_task`, `add_active_scheduled_task`, `ensure_activity_doc_present`, `get_running_activity_config`, `wait_for_activity_doc`, `wait_for_running_activity_config`, `wait_for_activity_failure_alert`, `wait_for_running_timer_ui`, `add_category_via_settings`, `update_group_family_via_settings`, `wait_until`, `wait_for_app_ready`, `wait_for_main_app`, `wait_for_room_code`, `dismiss_open_modals`, `cancel_open_confirm_modal`, `request_manual_sync`, `enter_room`, `switch_room`, `task_form_input_selector`, `fill_locator_value`, `wait_for_text_in_locator`, `wait_for_input_value`, `wait_for_activity_row_text`, `assert_selected_trend_day_visible`, `assert_trend_strip_scrollbar_hidden_and_scrollable`, `assert_insights_rerender_preserves_vertical_scroll`, `assert_trend_day_selection_scopes_details`, `assert_activity_data_issue_badge`, `assert_running_timer_id_reused_by_stopped_activity`, `assert_phase5_insights_view`, `add_scheduled_task`, `add_unscheduled_task`, `ensure_task_doc_present`, `wait_for_task_doc`, `open_scheduled_edit_form`, `open_scheduled_task_actions_menu`, `open_unscheduled_task_actions_menu`, `get_unscheduled_delete_state`, `delete_unscheduled_task_via_ui`, `arm_unscheduled_delete_confirm`, `complete_scheduled_task_via_ui`, `clear_all_tasks_via_ui`, `is_expected_sync_response_error`, `filter_runtime_errors`, `assert_no_runtime_errors`, `save_failure_screenshot`, `format_demo_timestamp`, `demo_note`, `demo_step`, `wait_for_demo_start` — plus the module constants `ACTIVITY_SMOKE_FAILURES_KEY`, `RUNNING_ACTIVITY_CONFIG_ID`, `DEMO_LOGGING_ENABLED`.

Give `scripts/e2e_helpers.py` this header, then paste the moved code below it in its original order:

```python
"""Shared Playwright helpers for Fortudo E2E tests and the preview smoke CLI.

Imported by tests/e2e/* (local pre-merge suite) and by
scripts/playwright_preview_smoke.py (post-deploy preview smoke).
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse
```

Trim this import list to what the moved code actually uses (add `re`, `base64`, etc. only if a moved function needs them; a `NameError` at runtime or in Step 4's test run will flag anything missing).

- [ ] **Step 2: Add `launch_browser` to `scripts/e2e_helpers.py`**

Append (this is the Part 1 Task 1 function, now in its permanent home):

```python
BROWSER_CHANNEL = os.environ.get("E2E_BROWSER_CHANNEL", "chromium")


def launch_browser(playwright: Any) -> Any:
    """Launch chromium; set E2E_BROWSER_CHANNEL=chrome to use system Chrome instead."""
    options = {"headless": True}
    if BROWSER_CHANNEL != "chromium":
        options["channel"] = BROWSER_CHANNEL
    return playwright.chromium.launch(**options)
```

- [ ] **Step 3: Re-export from the smoke module**

At the top of `scripts/playwright_preview_smoke.py`, directly after its (now trimmed) import block, add:

```python
# Shared helpers were extracted to scripts/e2e_helpers.py; re-export so the
# scenarios below and the mock-based unit tests keep resolving names here.
try:
    from scripts.e2e_helpers import *  # noqa: F401,F403
except ImportError:  # invoked directly as `python scripts/playwright_preview_smoke.py <url>`
    from e2e_helpers import *  # noqa: F401,F403
```

(The dual import matters: the README documents direct-file invocation, where `sys.path[0]` is `scripts/`, not the repo root.)

Also trim the smoke module's own import block of anything only the moved code used.

- [ ] **Step 4: Verify everything that touches the smoke module still works**

```bash
# 1. Smoke helper unit tests (mock-heavy — the sensitive one)
uv run --with pytest python -m pytest test_playwright_preview_smoke.py -q
# 2. CLI still parses
uv run --with playwright python scripts/playwright_preview_smoke.py --help
# 3. Phase6 suite still green (it imports via the re-export).
#    The file is still at repo root, so the tests/e2e server fixture does NOT
#    apply — start a server manually and kill it after, or the 7 tests fail
#    with connection errors that look like (but are not) refactor breakage:
python3 -m http.server 9847 --bind 127.0.0.1 --directory public &
uv run --with pytest --with playwright python -m pytest test_phase6_e2e.py -q
lsof -ti :9847 | xargs kill
```

Expected: all pass / `--help` prints usage and exits 0. Port 9847 must be free again afterwards (the Task 6 fixture takes over from there).

- [ ] **Step 5: Fix any unit-test patch failures using this rule**

The unit tests use `unittest.mock.patch("scripts.playwright_preview_smoke.<name>")`. After the move:

- Tests exercising a **kept** function (scenarios like `run_phase5_insights_smoke`) can keep patching `scripts.playwright_preview_smoke.<name>` — the star re-export binds moved names into that namespace, and scenario code looks them up there. No change needed.
- Tests exercising a **moved** function that internally calls another moved function must patch the new namespace: change the patch target to `"scripts.e2e_helpers.<name>"` (moved functions resolve callees in `e2e_helpers`' globals, not the smoke module's).

Run the suite from Step 4 item 1 again after each fix until green. Do not change test assertions — only patch paths.

- [ ] **Step 6: Commit**

```bash
git add scripts/e2e_helpers.py scripts/playwright_preview_smoke.py test_playwright_preview_smoke.py
git commit -m "refactor: extract shared e2e helpers out of preview smoke module"
```

### Task 6: Move the phase6 suite into `tests/e2e/`

**Files:**

- Move: `test_phase6_e2e.py` → `tests/e2e/test_phase6.py`

**Interfaces:**

- Consumes: `scripts.e2e_helpers` (all helper imports + `launch_browser`), the Task 4 server fixture (autouse — no code needed)
- Produces: nothing new; later tasks follow the same pattern

- [ ] **Step 1: Move the file**

```bash
git mv test_phase6_e2e.py tests/e2e/test_phase6.py
```

- [ ] **Step 2: Fix imports and paths inside `tests/e2e/test_phase6.py`**

1. Delete the `sys.path.insert(...)` line and the `import sys` (if now unused).
2. Change the import block from `from playwright_preview_smoke import (...)` to `from scripts.e2e_helpers import (...)` with the same names, and add `launch_browser` to that import list.
3. Delete the local `BROWSER_CHANNEL` constant and `launch_browser` definition (now imported), and `import os` if now unused.
4. The file moved two directories deeper, so `Path(__file__).parent` no longer points at the repo root. Add near the top:

```python
REPO_ROOT = Path(__file__).resolve().parents[2]
```

and change every `install_local_pouchdb_route(context, repo_root=Path(__file__).parent)` (3 occurrences) to:

```python
install_local_pouchdb_route(context, repo_root=REPO_ROOT)
```

5. Keep this commit green for CI: in `test_run_all.py`, change the `pytest_suites` entry from `"test_phase6_e2e.py"` to `"tests/e2e/test_phase6.py"` (the runner lives until Task 9; `python -m pytest tests/e2e/test_phase6.py` works from the runner's cwd, and the runner's own server on 9847 is reused by the Task 4 fixture rather than conflicting with it).

- [ ] **Step 3: Run it from the new location (fixture provides the server — make sure port 9847 is free first)**

```bash
uv run --with pytest --with playwright python -m pytest tests/e2e/test_phase6.py -q
```

Expected: `7 passed`.

- [ ] **Step 4: Commit**

```bash
git add -A tests/e2e/test_phase6.py test_run_all.py
git commit -m "refactor: move phase6 e2e suite under tests/e2e"
```

### Task 7: Convert the 5 legacy suites to pytest

**Files:**

- Move+modify: `test_visual_inspection.py` → `tests/e2e/test_visual_inspection.py`
- Move+modify: `test_functional.py` → `tests/e2e/test_functional.py`
- Move+modify: `test_ui_interaction.py` → `tests/e2e/test_ui_interaction.py`
- Move+modify: `test_gap_indicators.py` → `tests/e2e/test_gap_indicators.py`
- Move+modify: `test_overlap_warnings.py` → `tests/e2e/test_overlap_warnings.py`

**Interfaces:**

- Consumes: `launch_browser` from `scripts.e2e_helpers`, the Task 4 server fixture
- Produces: one pytest test function per legacy scenario (names in the table below); the accumulator-failure fix (`assert failed == 0`)

Each legacy file is one long ordered scenario: module-level helper `def`s, then a module-level `with sync_playwright() as p:` block that runs steps sequentially with shared state. **Do not split the steps into separate test functions** — they are order-dependent. The conversion is the same mechanical recipe for every file:

**Recipe (apply per file):**

1. `git mv test_<name>.py tests/e2e/test_<name>.py`
2. Add imports at top: `import pytest` (only where the skip in rule 7 applies) and `from scripts.e2e_helpers import launch_browser`.
3. Fix the screenshots dir so CI's `test_screenshots/` artifact path keeps working. Every file with a `SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_screenshots")` line: replace with

   ```python
   REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
   SCREENSHOTS_DIR = os.path.join(REPO_ROOT, "test_screenshots")
   ```

4. Leave module-level constants (`PORT`, `ROOM_CODE`) and helper `def`s (`setup_room`, `clear_and_setup`, `test`, `screenshot`, `dismiss_modals`, `fmt_time`, menu helpers, and the `passed = 0` / `failed = 0` / `results = []` accumulator globals where present) at module level, unchanged.
5. Wrap everything else — the module-level dynamic-schedule computation (`now = datetime.now()` and the `OFFSET`/`T1_TIME`/... block, including its `print` lines) **and** the whole `with sync_playwright() as p:` block — inside a single test function (name from the table), indented one level, body otherwise byte-for-byte unchanged. The schedule variables become locals; because the step code moves into the same function, no `global` statements are needed for them. (In `test_overlap_warnings.py` the "schedule" is a fixed `now = datetime(2026, 3, 11, 12, 0, 0)` — same treatment.)
6. Inside the function, replace `browser = p.chromium.launch(headless=True)` with `browser = launch_browser(p)`.
7. `tests/e2e/test_gap_indicators.py` only: its schedule block has a near-midnight fallback `else:` branch (two `print(...)` statements, `import sys`, `sys.exit(0)` — 4 statements over 5 lines). Replace the **entire `else:` branch body** with a single statement:

   ```python
   pytest.skip(f"Only {minutes_to_midnight}m to midnight, need at least {COMPACT_SPAN + 5}m")
   ```

8. Files with the `test(name, condition, detail="")` accumulator helper (`test_functional.py`, `test_ui_interaction.py`, `test_gap_indicators.py`, `test_overlap_warnings.py`): pytest would collect a module-level function named `test` as a test (default `python_functions = "test*"` matches the bare name, and its args would be treated as missing fixtures), and — the bigger bug in 2 of the 4 files — accumulated failures never fail the run. Rename the helper to `check` (and every call site: `sed` is fine, the string `test(` appears only as this helper's calls inside these files — verify with grep first). Then:
   - `test_gap_indicators.py` and `test_overlap_warnings.py` already end with `if failed > 0: exit(1)` — **replace** that statement (a bare `exit(1)` inside a pytest function raises a confusing `SystemExit`) with the assert below.
   - `test_functional.py` and `test_ui_interaction.py` have no failure exit at all — **add** the assert as the last line inside the `with sync_playwright()` block, after the summary printing.

   ```python
   assert failed == 0, f"{failed} checks failed (see FAIL lines above)"
   ```

   `test_visual_inspection.py` has no accumulator (bare asserts only) — skip this rule for it.

9. Keep each commit green for CI: in the same commit, update `test_run_all.py` — remove the file from the `scripts` list and add its new `tests/e2e/` path to `pytest_suites`. It cannot stay in `scripts`: `python tests/e2e/test_<name>.py` would now define the test function without calling it and exit 0, a silent no-op.
10. Run the converted file alone and confirm it passes (command per file below).

**Per-file specifics:**

| File                        | Test function name            | Accumulator (rule 8)? | Skip guard (rule 7)? |
| --------------------------- | ----------------------------- | --------------------- | -------------------- |
| `test_visual_inspection.py` | `test_visual_inspection_flow` | no                    | no                   |
| `test_functional.py`        | `test_functional_flow`        | yes                   | no                   |
| `test_ui_interaction.py`    | `test_ui_interaction_flow`    | yes                   | no                   |
| `test_gap_indicators.py`    | `test_gap_indicators_flow`    | yes                   | yes                  |
| `test_overlap_warnings.py`  | `test_overlap_warnings_flow`  | yes                   | no                   |

**Worked example** — `tests/e2e/test_visual_inspection.py` after conversion (showing the changed regions; `<UNCHANGED>` marks code kept byte-for-byte, indented where noted):

```python
"""Visual inspection of the Fortudo app - takes screenshots in various states."""
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import os

from scripts.e2e_helpers import launch_browser

PORT = 9847
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCREENSHOTS_DIR = os.path.join(REPO_ROOT, "test_screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

ROOM_CODE = "test-room"

# <UNCHANGED: setup_room, clear_and_setup, screenshot, dismiss_modals defs>


def test_visual_inspection_flow():
    # <UNCHANGED, now indented: the dynamic-schedule block —
    #  now = datetime.now() ... fmt_time ... OFFSET/D1/D2 ... T1_TIME/T2_TIME
    #  and its print(f"Schedule: ...") line>

    with sync_playwright() as p:
        browser = launch_browser(p)
        # <UNCHANGED, indented: everything from `page = browser.new_page(...)`
        #  through the final `browser.close()`>
```

Note: `fmt_time` closes over `now`, so when `now` moves inside the test function, move the `def fmt_time` (and in `test_gap_indicators.py` also `duration_label`, in `test_overlap_warnings.py` also `fmt_12h`) inside the function with it, directly after `now`.

- [ ] **Step 1: Convert `test_visual_inspection.py`** (recipe rules 1–6, 9, 10)

Run: `uv run --with pytest --with playwright python -m pytest tests/e2e/test_visual_inspection.py -q`
Expected: `1 passed`; screenshots appear in repo-root `test_screenshots/`.

- [ ] **Step 2: Commit**

```bash
git add -A tests/e2e/test_visual_inspection.py test_run_all.py
git commit -m "refactor: convert visual inspection e2e to pytest"
```

- [ ] **Step 3: Convert `test_functional.py`** (rules 1–6, 8–10)

Run: `uv run --with pytest --with playwright python -m pytest tests/e2e/test_functional.py -q`
Expected: `1 passed`. If the new `assert failed == 0` fails, the FAIL lines were latent pre-existing failures CI never saw — **stop and report them to Nadja**; do not delete the assert or "fix" checks to force green.

- [ ] **Step 4: Commit** (`git add -A tests/e2e/test_functional.py test_run_all.py && git commit -m "refactor: convert functional e2e to pytest, fail on accumulated check failures"`)

- [ ] **Step 5: Convert `test_ui_interaction.py`** (rules 1–6, 8–10); run `uv run --with pytest --with playwright python -m pytest tests/e2e/test_ui_interaction.py -q`, expect `1 passed`, same stop-and-report rule.

- [ ] **Step 6: Commit** (`git add -A tests/e2e/test_ui_interaction.py test_run_all.py && git commit -m "refactor: convert ui interaction e2e to pytest, fail on accumulated check failures"`)

- [ ] **Step 7: Convert `test_gap_indicators.py`** (rules 1–10 including the skip guard); run `uv run --with pytest --with playwright python -m pytest tests/e2e/test_gap_indicators.py -q`, expect `1 passed` (or `1 skipped` near midnight), same stop-and-report rule.

- [ ] **Step 8: Commit** (`git add -A tests/e2e/test_gap_indicators.py test_run_all.py && git commit -m "refactor: convert gap indicators e2e to pytest, fail on accumulated check failures"`)

- [ ] **Step 9: Convert `test_overlap_warnings.py`** (rules 1–6, 8–10); run `uv run --with pytest --with playwright python -m pytest tests/e2e/test_overlap_warnings.py -q`, expect `1 passed`, same stop-and-report rule.

- [ ] **Step 10: Commit** (`git add -A tests/e2e/test_overlap_warnings.py test_run_all.py && git commit -m "refactor: convert overlap warnings e2e to pytest, fail on accumulated check failures"`)

- [ ] **Step 11: Full-runner check (CI's exact entry point at this commit)**

Ensure port 9847 is free, then:

```bash
uv run --with pytest --with playwright python test_run_all.py
```

Expected: exit code 0 — `scripts` is now empty, and every converted suite plus phase6 runs via `pytest_suites`. This proves the intermediate commits kept `npm run test:e2e` green.

### Task 8: Move the smoke-helper unit tests under `tests/`

**Files:**

- Move: `test_playwright_preview_smoke.py` → `tests/test_preview_smoke_helpers.py`
- Modify: `README.md`

**Interfaces:**

- Consumes: `scripts.playwright_preview_smoke` / `scripts.e2e_helpers` imports (work from the new location thanks to `pythonpath = ["."]`)
- Produces: these 1,634 lines of unit tests now run in CI for the first time (they're collected by `testpaths = ["tests"]`); they're mock-based and need no server (they sit outside `tests/e2e/`, so the server fixture doesn't apply)

- [ ] **Step 1: Move the file**

```bash
git mv test_playwright_preview_smoke.py tests/test_preview_smoke_helpers.py
```

No content changes needed: it already imports `from scripts.playwright_preview_smoke import ...`, which resolves via `pythonpath`.

- [ ] **Step 2: Run it from the new location**

```bash
uv run --with pytest python -m pytest tests/test_preview_smoke_helpers.py -q
```

Expected: all pass (pytest collects unittest classes natively).

- [ ] **Step 3: Update the README invocation**

In `README.md`, replace:

```bash
uv run python -B -m unittest test_playwright_preview_smoke.py
```

with:

```bash
uv run --with pytest python -m pytest tests/test_preview_smoke_helpers.py
```

- [ ] **Step 4: Commit**

```bash
npm run format
git add -A tests/test_preview_smoke_helpers.py README.md
git commit -m "refactor: move preview smoke helper unit tests under tests/"
```

### Task 9: Replace the bespoke runner with pytest

**Files:**

- Delete: `test_run_all.py`
- Delete: `scripts/e2e_server.py`
- Modify: `package.json`
- Modify (verify only, no expected change): `.github/workflows/ci-cd.yml`

**Interfaces:**

- Consumes: everything above — after Tasks 4–8, `pytest tests` is the complete Python test entry point
- Produces: `npm run test:e2e` → `python -m pytest tests -q`; CI's E2E job needs no other change (it already runs `npm run test:e2e` and installs pytest since Part 1 Task 3)

- [ ] **Step 1: Confirm nothing else references the two files being deleted**

```bash
grep -rn "test_run_all\|e2e_server" --include="*.py" --include="*.json" --include="*.yml" --include="*.md" . | grep -v node_modules | grep -v docs/
```

Expected: only the `package.json` `test:e2e` line (and these files themselves). If anything else shows up, update it to the new pytest entry point before deleting.

- [ ] **Step 2: Update `package.json`**

Change:

```json
"test:e2e": "python scripts/e2e_server.py --server \"python -m http.server 9847 --directory public\" --port 9847 -- python test_run_all.py"
```

to:

```json
"test:e2e": "python -m pytest tests -q"
```

- [ ] **Step 3: Delete the runner and server wrapper**

```bash
git rm test_run_all.py scripts/e2e_server.py
```

- [ ] **Step 4: Run the full consolidated suite exactly as CI will**

Ensure port 9847 is free, then:

```bash
uv run --with pytest --with playwright python -m pytest tests -q
```

Expected: everything passes — 1 fixture test + 7 phase6 tests + 5 legacy flow tests + the preview-smoke helper unit tests. This is the single most important verification in the plan; do not proceed with failures.

- [ ] **Step 5: Commit**

```bash
npm run format
git add -A package.json test_run_all.py scripts/e2e_server.py
git commit -m "refactor: replace bespoke e2e runner with pytest"
```

### Task 10: Document the suite boundary, fix .gitignore, commit plan docs

**Files:**

- Modify: `README.md`
- Modify: `.gitignore`
- Add: `docs/plans/design/2026-06-30-fortudo-phase6-polish.md`, `docs/plans/implementation/2026-06-30-phase6-polish.md` (untracked in the working tree); commit pending edits to `docs/plans/implementation/2026-07-06-e2e-consolidation.md` (already tracked — see Step 3)

**Interfaces:**

- Produces: the documented contract for where new test coverage goes (finding 3)

- [ ] **Step 1: Replace the README testing section**

Replace the current "run tests:" + "preview storage smoke:" blocks in `README.md` with:

````markdown
## testing

Three layers, each with a distinct job:

**Unit (Jest, `__tests__/`)** — pre-merge, runs in CI:

```bash
npm test
```

**E2E (pytest + Playwright, `tests/`)** — pre-merge, runs in CI against a local
server on `127.0.0.1:9847` (started automatically by a session fixture). New
browser-level coverage goes here by default:

```bash
uv run --with pytest --with playwright python -m pytest tests -q
# headed debugging with system Chrome:
E2E_BROWSER_CHANNEL=chrome uv run --with pytest --with playwright python -m pytest tests/e2e -q
```

**Preview smoke (`scripts/playwright_preview_smoke.py`)** — post-deploy, run
manually against a Firebase preview URL. Owns deployed-environment concerns
(CouchDB sync, room reset, cross-room scenarios). Some behaviors (e.g. running-
timer restore after reload) are intentionally covered both here and in `tests/`
— pre-merge vs post-deploy:

```bash
uv run --with pytest python -m pytest tests/test_preview_smoke_helpers.py
uv run --with playwright python -B scripts/playwright_preview_smoke.py <preview-url> --channel chrome
```
````

- [ ] **Step 2: Add `.DS_Store` to `.gitignore`**

`.gitignore` doesn't cover it (checked 2026-07-06). Add a line: `.DS_Store`

- [ ] **Step 3: Track the plan docs**

The two 2026-06-30 docs are untracked. This consolidation plan is **already tracked** — local `phase6d-e2e` carries commit `c596a7f` ("docs: add e2e wiring + consolidation plan from PR review"), and later review-round edits may sit as an uncommitted modification; the `git add` below simply stages those pending edits.

```bash
git add docs/plans/design/2026-06-30-fortudo-phase6-polish.md \
        docs/plans/implementation/2026-06-30-phase6-polish.md \
        docs/plans/implementation/2026-07-06-e2e-consolidation.md
```

(Do **not** `git add` any `.DS_Store` files — Step 2 ignores them.)

- [ ] **Step 4: Commit**

```bash
npm run format
git add README.md .gitignore
git commit -m "docs: document three-layer test structure; track phase plans"
```

- [ ] **Step 5: Final full run + stop for review**

```bash
uv run --with pytest --with playwright python -m pytest tests -q && npm test
```

Expected: all green. **STOP** — the plan is complete; nothing is pushed. Ask Nadja to review the commits on `phase6d-e2e` and push (one push updates PR #83 with everything). Remind her of the manual GitHub UI items on #83:

1. Retitle the PR — it's no longer just "Phase 6D: add persistence E2E coverage"; it now also consolidates the whole Python E2E suite.
2. Rewrite the body: drop the stale "Stacked on #82" line and summarize the added scope (channel unification, `tests/` layout, helper extraction, legacy-suite pytest conversion, runner deletion, accumulator-failure fix).

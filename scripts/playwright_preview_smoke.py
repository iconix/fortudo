"""Headed Playwright smoke for preview deployments of Fortudo."""

from __future__ import annotations

import argparse
import base64
import json
import re
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urljoin, urlparse, urlsplit, urlunsplit
from urllib.request import Request, urlopen

COUCHDB_URL_RE = re.compile(r"COUCHDB_URL\s*=\s*(?:'([^']*)'|null)")


def normalize_doc(doc: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(doc)
    normalized["id"] = normalized.get("id") or normalized.get("_id")
    return normalized


def compute_storage_room_code(hostname: str, room_code: str) -> str:
    host = str(hostname or "")
    is_preview_host = (
        host.startswith("fortudo--") and host.endswith(".web.app")
    ) or (host.startswith("fortudo--") and host.endswith(".firebaseapp.com"))
    return f"preview-{room_code}" if is_preview_host else room_code


def summarize_docs(docs: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    summary = {
        "tasks": [],
        "legacy_tasks": [],
        "activities": [],
        "configs": [],
        "other_docs": [],
    }

    for raw_doc in docs or []:
        doc = normalize_doc(raw_doc)
        has_doc_type = "docType" in doc
        doc_type = doc.get("docType") if has_doc_type else None
        doc_id = str(doc.get("id") or "")
        is_legacy_task = not doc_type and (
            doc.get("type") in {"scheduled", "unscheduled"}
            or doc_id.startswith("sched-")
            or doc_id.startswith("unsched-")
        )

        if doc_type == "task":
            summary["tasks"].append(doc)
        elif is_legacy_task:
            summary["legacy_tasks"].append(doc)
        elif doc_type == "activity":
            summary["activities"].append(doc)
        elif doc_type == "config":
            summary["configs"].append(doc)
        else:
            summary["other_docs"].append(doc)

    return summary


def format_doc_ids(docs: list[dict[str, Any]]) -> list[str]:
    return sorted(str(doc["id"]) for doc in docs)


def format_snapshot(summary: dict[str, list[dict[str, Any]]]) -> str:
    return json.dumps(summary, indent=2, sort_keys=True)


def assert_same_ids(actual_docs: list[dict[str, Any]], expected_ids: list[str], label: str) -> None:
    actual = format_doc_ids(actual_docs)
    expected = sorted(expected_ids)
    if actual != expected:
        raise ValueError(
            f"{label} mismatch.\nExpected: {json.dumps(expected)}\nActual: {json.dumps(actual)}"
        )


def assert_migrated_task_docs(
    summary: dict[str, list[dict[str, Any]]], expected_task_ids: list[str]
) -> None:
    if summary["legacy_tasks"]:
        raise ValueError(f"legacy task docs remain:\n{format_snapshot(summary)}")
    assert_same_ids(summary["tasks"], expected_task_ids, "migrated task ids")


def assert_non_task_docs_remain(
    summary: dict[str, list[dict[str, Any]]], expected: dict[str, str]
) -> None:
    if summary["tasks"] or summary["legacy_tasks"]:
        raise ValueError(f"unexpected task docs remain:\n{format_snapshot(summary)}")

    activity_ids = format_doc_ids(summary["activities"])
    if expected["activity_id"] not in activity_ids:
        raise ValueError(
            f"missing expected activity document: {expected['activity_id']}\n{format_snapshot(summary)}"
        )

    config_ids = format_doc_ids(summary["configs"])
    if expected["config_id"] not in config_ids:
        raise ValueError(
            f"missing expected config document: {expected['config_id']}\n{format_snapshot(summary)}"
        )


def get_hostname_from_url(preview_url: str) -> str:
    parsed = urlparse(preview_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid preview URL: {preview_url}")
    return parsed.hostname or ""


def extract_couchdb_url(config_text: str) -> str | None:
    match = COUCHDB_URL_RE.search(config_text or "")
    if not match:
        raise ValueError("COUCHDB_URL not found in config.js")
    return match.group(1) or None


def build_couchdb_request_parts(couchdb_url: str) -> tuple[str, dict[str, str]]:
    parsed = urlsplit(couchdb_url)
    if not parsed.scheme or not parsed.hostname or parsed.username is None:
        raise ValueError("Invalid CouchDB URL")

    credentials = f"{parsed.username}:{parsed.password or ''}"
    token = base64.b64encode(credentials.encode("ascii")).decode("ascii")
    netloc = parsed.hostname
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"

    base_url = urlunsplit((parsed.scheme, netloc, "", "", ""))
    return base_url, {"Authorization": f"Basic {token}"}


def build_remote_db_name(hostname: str, room_code: str) -> str:
    return f"fortudo-{compute_storage_room_code(hostname, room_code)}"


def fetch_preview_couchdb_url(preview_url: str) -> str | None:
    config_url = urljoin(preview_url, "/js/config.js")
    with urlopen(config_url) as response:
        config_text = response.read().decode("utf-8")
    return extract_couchdb_url(config_text)


def delete_remote_database(couchdb_url: str, db_name: str) -> None:
    base_url, headers = build_couchdb_request_parts(couchdb_url)
    request = Request(f"{base_url}/{db_name}", headers=headers, method="DELETE")
    try:
        with urlopen(request):
            return
    except HTTPError as error:
        if error.code == 404:
            return
        raise


def reset_remote_preview_rooms(preview_url: str, hostname: str, rooms: dict[str, str]) -> None:
    couchdb_url = fetch_preview_couchdb_url(preview_url)
    if not couchdb_url:
        return

    for room_code in rooms.values():
        delete_remote_database(couchdb_url, build_remote_db_name(hostname, room_code))


def derive_smoke_room_prefix(hostname: str) -> str:
    host = str(hostname or "")
    if host.startswith("fortudo--") and host.endswith(".web.app"):
        return host.removeprefix("fortudo--").removesuffix(".web.app")
    if host.startswith("fortudo--") and host.endswith(".firebaseapp.com"):
        return host.removeprefix("fortudo--").removesuffix(".firebaseapp.com")
    return "smoke"


def is_preview_host(hostname: str) -> bool:
    host = str(hostname or "")
    return (host.startswith("fortudo--") and host.endswith(".web.app")) or (
        host.startswith("fortudo--") and host.endswith(".firebaseapp.com")
    )


def create_scenario_rooms(prefix: str) -> dict[str, str]:
    return {
        "alpha": f"{prefix}-alpha",
        "legacy": f"{prefix}-legacy",
        "beta": f"{prefix}-beta",
    }


def create_run_scoped_prefix(hostname: str) -> str:
    if is_preview_host(hostname):
        return f"{derive_smoke_room_prefix(hostname)}-smoke"
    token = int(time.time() * 1000)
    return f"{derive_smoke_room_prefix(hostname)}-{token:x}"


def parse_cli_args(argv: list[str]) -> dict[str, Any]:
    parser = argparse.ArgumentParser(
        prog="playwright_preview_smoke.py",
        description="Run a visible Playwright storage smoke against a Fortudo preview URL.",
    )
    parser.add_argument("preview_url", nargs="?")
    parser.add_argument("--keep-open", action="store_true", dest="keep_open")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument(
        "--channel",
        choices=("chrome", "chromium"),
        default="chrome",
        help="Browser channel to use. Defaults to installed Chrome.",
    )
    parsed = parser.parse_args(argv)
    return {
        "help": False,
        "preview_url": parsed.preview_url,
        "keep_open": parsed.keep_open,
        "headless": parsed.headless,
        "channel": parsed.channel,
    }


def storage_eval_arg(page: Any, room_code: str, payload: Any | None = None) -> dict[str, Any]:
    return {
        "hostname": page.url.split("/")[2] if "://" in page.url else "",
        "roomCode": room_code,
        "payload": payload,
    }


def read_docs(page: Any, room_code: str) -> list[dict[str, Any]]:
    return page.evaluate(
        """
        async ({ hostname, roomCode }) => {
            const isPreviewHost = (host) =>
                (host.startsWith('fortudo--') && host.endsWith('.web.app')) ||
                (host.startsWith('fortudo--') && host.endsWith('.firebaseapp.com'));
            const storageRoomCode = isPreviewHost(hostname) ? `preview-${roomCode}` : roomCode;
            const dbName = `fortudo-${storageRoomCode}`;
            const db = new window.PouchDB(dbName);
            const rows = await db.allDocs({ include_docs: true });
            return rows.rows.map((row) => row.doc).filter(Boolean);
        }
        """,
        storage_eval_arg(page, room_code),
    )


def seed_docs(page: Any, room_code: str, docs: list[dict[str, Any]]) -> None:
    page.evaluate(
        """
        async ({ hostname, roomCode, payload }) => {
            const isPreviewHost = (host) =>
                (host.startsWith('fortudo--') && host.endsWith('.web.app')) ||
                (host.startsWith('fortudo--') && host.endsWith('.firebaseapp.com'));
            const storageRoomCode = isPreviewHost(hostname) ? `preview-${roomCode}` : roomCode;
            const dbName = `fortudo-${storageRoomCode}`;
            const db = new window.PouchDB(dbName);
            await db.bulkDocs(payload);
        }
        """,
        storage_eval_arg(page, room_code, docs),
    )


def clear_room_storage(page: Any, room_code: str) -> None:
    page.evaluate(
        """
        async ({ hostname, roomCode }) => {
            const isPreviewHost = (host) =>
                (host.startsWith('fortudo--') && host.endsWith('.web.app')) ||
                (host.startsWith('fortudo--') && host.endsWith('.firebaseapp.com'));
            const storageRoomCode = isPreviewHost(hostname) ? `preview-${roomCode}` : roomCode;
            const dbName = `fortudo-${storageRoomCode}`;
            const db = new window.PouchDB(dbName);
            const rows = await db.allDocs({ include_docs: true });
            const docsToDelete = rows.rows
                .map((row) => row.doc)
                .filter(Boolean)
                .filter((doc) => !String(doc._id || '').startsWith('_'))
                .map((doc) => ({ _id: doc._id, _rev: doc._rev, _deleted: true }));
            if (docsToDelete.length > 0) {
                await db.bulkDocs(docsToDelete);
            }
        }
        """,
        storage_eval_arg(page, room_code),
    )


def wait_until(predicate: Any, description: str, timeout_s: float = 15.0, interval_s: float = 0.2) -> Any:
    deadline = time.time() + timeout_s
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            result = predicate()
            if result:
                return result
        except Exception as error:  # pragma: no cover - diagnostic path
            last_error = error
        time.sleep(interval_s)
    if last_error is not None:
        raise TimeoutError(f"Timed out waiting for {description}: {last_error}") from last_error
    raise TimeoutError(f"Timed out waiting for {description}")


def wait_for_app_ready(page: Any) -> None:
    page.wait_for_load_state("load")
    page.wait_for_function(
        """
        () => {
            const roomEntry = document.querySelector('#room-entry-screen');
            const mainApp = document.querySelector('#main-app');
            return (
                (roomEntry instanceof HTMLElement && !roomEntry.classList.contains('hidden')) ||
                (mainApp instanceof HTMLElement && !mainApp.classList.contains('hidden'))
            );
        }
        """,
        timeout=15000,
    )


def wait_for_main_app(page: Any) -> None:
    page.wait_for_function(
        """
        () => {
            const mainApp = document.querySelector('#main-app');
            const roomDisplay = document.querySelector('#room-code-display');
            return (
                mainApp instanceof HTMLElement &&
                !mainApp.classList.contains('hidden') &&
                roomDisplay instanceof HTMLElement &&
                roomDisplay.textContent.trim().length > 0
            );
        }
        """,
        timeout=15000,
    )


def dismiss_open_modals(page: Any) -> None:
    for selector in ("#ok-custom-alert-modal", "#ok-custom-confirm-modal", "#cancel-custom-confirm-modal"):
        locator = page.locator(selector)
        if locator.count() and locator.first.is_visible():
            locator.first.click(force=True)
            page.wait_for_timeout(100)


def enter_room(page: Any, room_code: str) -> None:
    page.locator("#room-entry-screen").wait_for(state="visible", timeout=15000)
    page.locator("#room-code-input").fill(room_code)
    page.locator("#room-entry-form").evaluate("(form) => form.requestSubmit()")
    wait_for_main_app(page)


def switch_room(page: Any, room_code: str) -> None:
    dismiss_open_modals(page)
    page.locator("#room-code-badge").click()
    page.locator("#room-entry-screen").wait_for(state="visible", timeout=15000)
    page.locator("#room-code-input").fill(room_code)
    page.locator("#room-entry-form").evaluate("(form) => form.requestSubmit()")
    wait_for_main_app(page)


def add_scheduled_task(page: Any, description: str, start_time: str, duration_minutes: int) -> None:
    page.locator("#scheduled").check()
    page.locator('input[name="description"]').fill(description)
    page.locator('input[name="start-time"]').fill(start_time)
    page.locator('input[name="duration-hours"]').fill(str(duration_minutes // 60))
    page.locator('input[name="duration-minutes"]').fill(str(duration_minutes % 60))
    page.locator("#task-form button[type='submit']").click()


def add_unscheduled_task(page: Any, description: str, est_minutes: int, priority: str = "medium") -> None:
    page.locator("#unscheduled").check()
    page.locator('input[name="description"]').fill(description)
    page.locator(f'input[name="priority"][value="{priority}"]').check(force=True)
    page.locator('input[name="est-duration-hours"]').fill(str(est_minutes // 60))
    page.locator('input[name="est-duration-minutes"]').fill(str(est_minutes % 60))
    page.locator("#task-form button[type='submit']").click()


def ensure_task_doc_present(room_code: str, description: str, docs: list[dict[str, Any]]) -> dict[str, Any]:
    for doc in docs:
        if doc.get("description") == description:
            return normalize_doc(doc)
    raise ValueError(f"Missing task document for {room_code}: {description}")


def assert_no_runtime_errors(console_errors: list[str], page_errors: list[str], request_failures: list[str]) -> None:
    filtered_console_errors = [
        message
        for message in console_errors
        if message != "Failed to load resource: the server responded with a status of 404 ()"
    ]
    if filtered_console_errors or page_errors or request_failures:
        raise ValueError(
            "Runtime errors detected.\n"
            f"Console errors: {json.dumps(filtered_console_errors[:10], indent=2)}\n"
            f"Page errors: {json.dumps(page_errors[:10], indent=2)}\n"
            f"Request failures: {json.dumps(request_failures[:10], indent=2)}"
        )


def save_failure_screenshot(page: Any) -> None:
    screenshot_dir = Path("test_screenshots")
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot_dir / "playwright_preview_smoke_failure.png"), full_page=True)


def run_smoke(preview_url: str, *, headless: bool = False, keep_open: bool = False, channel: str = "chrome") -> bool:
    from playwright.sync_api import sync_playwright

    hostname = get_hostname_from_url(preview_url)
    rooms = create_scenario_rooms(create_run_scoped_prefix(hostname))

    if is_preview_host(hostname):
        reset_remote_preview_rooms(preview_url, hostname, rooms)

    console_errors: list[str] = []
    page_errors: list[str] = []
    request_failures: list[str] = []

    with sync_playwright() as playwright:
        launch_options: dict[str, Any] = {"headless": headless}
        if channel != "chromium":
            launch_options["channel"] = channel

        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(viewport={"width": 1440, "height": 960})
        page = context.new_page()

        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on(
            "requestfailed",
            lambda request: request_failures.append(
                f"{request.method} {request.url} {request.failure}"
            ),
        )

        try:
            page.goto(preview_url, wait_until="load")
            wait_for_app_ready(page)
            enter_room(page, rooms["alpha"])
            clear_room_storage(page, rooms["alpha"])
            page.reload(wait_until="load")
            wait_for_main_app(page)

            add_scheduled_task(page, "Playwright scheduled task", "09:00", 30)
            add_unscheduled_task(page, "Playwright unscheduled task", 15)

            page.reload(wait_until="load")
            wait_for_main_app(page)

            alpha_docs = read_docs(page, rooms["alpha"])
            scheduled_doc = ensure_task_doc_present(
                rooms["alpha"], "Playwright scheduled task", alpha_docs
            )
            unscheduled_doc = ensure_task_doc_present(
                rooms["alpha"], "Playwright unscheduled task", alpha_docs
            )

            page.locator(f'[data-task-id="{scheduled_doc["id"]}"] .btn-edit').click()
            edit_form_selector = f'#edit-task-{scheduled_doc["id"]}'
            page.locator(f"{edit_form_selector} input[name='description']").fill(
                "Playwright scheduled task edited"
            )
            page.locator(edit_form_selector).evaluate("(form) => form.requestSubmit()")

            delete_button = page.locator(
                f'[data-task-id="{unscheduled_doc["id"]}"] .btn-delete-unscheduled'
            )
            delete_button.click()
            delete_button.click()

            def fresh_room_storage_updated() -> bool:
                docs = list(map(normalize_doc, read_docs(page, rooms["alpha"])))
                return any(
                    doc.get("description") == "Playwright scheduled task edited"
                    and doc.get("docType") == "task"
                    for doc in docs
                ) and not any(doc.get("id") == unscheduled_doc["id"] for doc in docs)

            try:
                wait_until(fresh_room_storage_updated, "fresh-room storage update")
            except TimeoutError as error:
                snapshot = summarize_docs(read_docs(page, rooms["alpha"]))
                raise TimeoutError(
                    "Timed out waiting for fresh-room storage update.\n"
                    f"{format_snapshot(snapshot)}"
                ) from error

            alpha_summary = summarize_docs(read_docs(page, rooms["alpha"]))
            if "Playwright scheduled task edited" not in [
                doc.get("description") for doc in alpha_summary["tasks"]
            ]:
                raise ValueError(f"missing edited scheduled task.\n{format_snapshot(alpha_summary)}")

            switch_room(page, rooms["legacy"])
            clear_room_storage(page, rooms["legacy"])
            seed_docs(
                page,
                rooms["legacy"],
                [
                    {
                        "_id": "sched-legacy",
                        "type": "scheduled",
                        "description": "Legacy scheduled task",
                        "startDateTime": "2026-03-20T09:00:00",
                        "endDateTime": "2026-03-20T09:30:00",
                        "duration": 30,
                        "status": "incomplete",
                    },
                    {
                        "_id": "unsched-legacy",
                        "type": "unscheduled",
                        "description": "Legacy unscheduled task",
                        "priority": "medium",
                        "estDuration": 15,
                        "status": "incomplete",
                    },
                ],
            )
            page.reload(wait_until="load")
            wait_for_main_app(page)

            wait_until(
                lambda: (
                    lambda docs: any(
                        doc.get("id") == "sched-legacy" and doc.get("docType") == "task"
                        for doc in docs
                    )
                    and any(
                        doc.get("id") == "unsched-legacy" and doc.get("docType") == "task"
                        for doc in docs
                    )
                )(list(map(normalize_doc, read_docs(page, rooms["legacy"])))),
                "legacy migration",
            )
            assert_migrated_task_docs(
                summarize_docs(read_docs(page, rooms["legacy"])),
                ["sched-legacy", "unsched-legacy"],
            )

            switch_room(page, rooms["alpha"])
            seed_docs(
                page,
                rooms["alpha"],
                [
                    {"_id": "activity-smoke", "docType": "activity", "note": "keep me"},
                    {"_id": "config-categories", "docType": "config", "categories": []},
                ],
            )

            page.evaluate(
                """
                () => {
                    const option = document.getElementById('clear-all-tasks-option');
                    if (!(option instanceof HTMLElement)) {
                        throw new Error('Missing clear-all option');
                    }
                    option.click();
                }
                """
            )
            page.locator("#ok-custom-confirm-modal").click()

            wait_until(
                lambda: (
                    lambda docs: not any(
                        doc.get("docType") == "task"
                        or doc.get("type") in {"scheduled", "unscheduled"}
                        for doc in docs
                    )
                    and any(doc.get("id") == "activity-smoke" for doc in docs)
                    and any(doc.get("id") == "config-categories" for doc in docs)
                )(list(map(normalize_doc, read_docs(page, rooms["alpha"])))),
                "cross-type isolation persistence",
            )
            assert_non_task_docs_remain(
                summarize_docs(read_docs(page, rooms["alpha"])),
                {"activity_id": "activity-smoke", "config_id": "config-categories"},
            )

            dismiss_open_modals(page)
            switch_room(page, rooms["beta"])
            clear_room_storage(page, rooms["beta"])
            beta_empty = summarize_docs(read_docs(page, rooms["beta"]))
            if any(beta_empty[key] for key in beta_empty):
                raise ValueError(f"beta room was not empty.\n{format_snapshot(beta_empty)}")

            add_scheduled_task(page, "Playwright beta task", "10:00", 20)
            wait_until(
                lambda: any(
                    doc.get("description") == "Playwright beta task"
                    for doc in read_docs(page, rooms["beta"])
                ),
                "beta room task persistence",
            )

            beta_summary = summarize_docs(read_docs(page, rooms["beta"]))
            if not any(
                doc.get("description") == "Playwright beta task" for doc in beta_summary["tasks"]
            ):
                raise ValueError(f"beta room task missing.\n{format_snapshot(beta_summary)}")
            if beta_summary["activities"] or beta_summary["configs"]:
                raise ValueError(f"beta room leaked alpha docs.\n{format_snapshot(beta_summary)}")

            switch_room(page, rooms["alpha"])
            alpha_final = summarize_docs(read_docs(page, rooms["alpha"]))
            if not any(doc.get("id") == "activity-smoke" for doc in alpha_final["activities"]):
                raise ValueError(f"alpha room lost its activity doc.\n{format_snapshot(alpha_final)}")
            if not any(doc.get("id") == "config-categories" for doc in alpha_final["configs"]):
                raise ValueError(f"alpha room lost its config doc.\n{format_snapshot(alpha_final)}")
            if any(
                doc.get("description") == "Playwright beta task" for doc in alpha_final["tasks"]
            ):
                raise ValueError(f"alpha room picked up beta task data.\n{format_snapshot(alpha_final)}")

            assert_no_runtime_errors(console_errors, page_errors, request_failures)

            if keep_open and not headless:
                input("Smoke passed. Press Enter to close the browser...")
            return True
        except Exception:
            save_failure_screenshot(page)
            if keep_open and not headless:
                print("Smoke failed. Browser left open for inspection. Press Enter to close it.")
                input()
            raise
        finally:
            context.close()
            browser.close()


def main(argv: list[str] | None = None) -> int:
    parsed = parse_cli_args(argv or [])
    if not parsed["preview_url"]:
        print(
            "Usage: uv run --with playwright python scripts/playwright_preview_smoke.py "
            "<preview-url> [--keep-open] [--headless] [--channel chrome|chromium]"
        )
        return 1

    run_smoke(
        parsed["preview_url"],
        headless=parsed["headless"],
        keep_open=parsed["keep_open"],
        channel=parsed["channel"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))

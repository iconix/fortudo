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
ACTIVITY_SMOKE_FAILURES_KEY = "fortudo-smoke-activity-failures"


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


def fetch_remote_docs(couchdb_url: str, db_name: str) -> list[dict[str, Any]]:
    base_url, headers = build_couchdb_request_parts(couchdb_url)
    request = Request(
        f"{base_url}/{db_name}/_all_docs?include_docs=true",
        headers=headers,
        method="GET",
    )
    with urlopen(request) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return [row["doc"] for row in payload.get("rows", []) if row.get("doc")]


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


def supports_activity_smoke_failure_host(hostname: str) -> bool:
    host = str(hostname or "")
    return host in {"localhost", "127.0.0.1"} or is_preview_host(host)


def create_scenario_rooms(prefix: str) -> dict[str, str]:
    return {
        "alpha": f"{prefix}-alpha",
        "legacy": f"{prefix}-legacy",
        "beta": f"{prefix}-beta",
        "taxonomy": f"{prefix}-taxonomy",
        "activities": f"{prefix}-activities",
    }


def build_phase3_taxonomy_config_doc() -> dict[str, Any]:
    return {
        "_id": "config-categories",
        "id": "config-categories",
        "docType": "config",
        "schemaVersion": "3.5",
        "groups": [
            {"key": "work", "label": "Work", "colorFamily": "blue", "color": "#2563eb"},
            {"key": "family", "label": "Family", "colorFamily": "gray", "color": "#4b5563"},
            {"key": "break", "label": "Break", "colorFamily": "green", "color": "#16a34a"},
        ],
        "categories": [
            {
                "key": "work/project",
                "label": "Project",
                "groupKey": "work",
                "color": "#1d4ed8",
                "isLinkedToGroupFamily": True,
            },
            {
                "key": "work/comms",
                "label": "Comms",
                "groupKey": "work",
                "color": "#2563eb",
                "isLinkedToGroupFamily": True,
            },
            {
                "key": "work/meeting",
                "label": "Meeting",
                "groupKey": "work",
                "color": "#3b82f6",
                "isLinkedToGroupFamily": True,
            },
        ],
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
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--keep-open", action="store_true", dest="keep_open")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--slow-ms", type=int, default=0, dest="slow_mo_ms")
    parser.add_argument("--step-pause-ms", type=int, default=0, dest="step_pause_ms")
    parser.add_argument(
        "--channel",
        choices=("chrome", "chromium"),
        default="chrome",
        help="Browser channel to use. Defaults to installed Chrome.",
    )
    parsed = parser.parse_args(argv)
    keep_open = parsed.keep_open
    headless = parsed.headless
    slow_mo_ms = parsed.slow_mo_ms
    step_pause_ms = parsed.step_pause_ms

    if parsed.demo:
        keep_open = True
        headless = False
        if slow_mo_ms == 0:
            slow_mo_ms = 600
        if step_pause_ms == 0:
            step_pause_ms = 900

    return {
        "help": False,
        "preview_url": parsed.preview_url,
        "demo": parsed.demo,
        "keep_open": keep_open,
        "headless": headless,
        "slow_mo_ms": slow_mo_ms,
        "step_pause_ms": step_pause_ms,
        "channel": parsed.channel,
    }


def build_launch_options(*, headless: bool, channel: str, slow_mo_ms: int = 0) -> dict[str, Any]:
    launch_options: dict[str, Any] = {"headless": headless}
    if channel != "chromium":
        launch_options["channel"] = channel
    if slow_mo_ms > 0:
        launch_options["slow_mo"] = slow_mo_ms
    return launch_options


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


def set_activities_enabled(page: Any, enabled: bool = True) -> None:
    page.evaluate(
        """
        (value) => {
            window.localStorage.setItem('fortudo-activities-enabled', String(!!value));
        }
        """,
        enabled,
    )


def queue_activity_smoke_failure(page: Any, failure_kind: str, count: int = 1) -> None:
    hostname = get_hostname_from_url(page.url)
    if not supports_activity_smoke_failure_host(hostname):
        raise ValueError(
            "Activity failure injection requires a preview or local host; "
            f"got {hostname!r}."
        )

    page.evaluate(
        """
        ({ key, failureKind, count }) => {
            const rawValue = window.localStorage.getItem(key);
            let failures = {};
            if (rawValue) {
                try {
                    failures = JSON.parse(rawValue) || {};
                } catch {
                    failures = {};
                }
            }
            failures[failureKind] = Number(failures[failureKind] || 0) + Number(count || 0);
            window.localStorage.setItem(key, JSON.stringify(failures));
        }
        """,
        {
            "key": ACTIVITY_SMOKE_FAILURES_KEY,
            "failureKind": failure_kind,
            "count": count,
        },
    )


def open_settings_modal(page: Any) -> None:
    page.locator("#settings-gear-btn").click()
    page.locator("#settings-modal").wait_for(state="visible", timeout=10000)
    page.locator("#settings-content").wait_for(state="visible", timeout=10000)


def close_settings_modal(page: Any) -> None:
    page.locator("#close-settings-modal").click()
    page.locator("#settings-modal").wait_for(state="hidden", timeout=10000)


def wait_for_toast_text(
    page: Any,
    expected_text: str,
    *,
    timeout_s: float = 10.0,
    interval_s: float = 0.2,
) -> None:
    wait_until(
        lambda: expected_text
        in (
            page.locator("[data-toast-container]").text_content() or ""
        ),
        f"toast text {expected_text!r}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def add_activity(page: Any, description: str, start_time: str, duration_minutes: int) -> None:
    page.locator("#activity").check()
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("description")),
        description,
        description="activity description",
    )
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("start-time")),
        start_time,
        description="activity start time",
    )
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("duration-hours")),
        str(duration_minutes // 60),
        description="activity duration hours",
    )
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("duration-minutes")),
        str(duration_minutes % 60),
        description="activity duration minutes",
    )
    page.locator("#task-form button[type='submit']").click()


def add_active_scheduled_task(page: Any, description: str, duration_minutes: int) -> None:
    page.locator("#scheduled").check()
    start_time = page.locator(task_form_input_selector("start-time")).input_value()
    if not start_time:
        raise ValueError("Scheduled task form did not provide a suggested start time.")

    add_scheduled_task(page, description, start_time, duration_minutes)


def ensure_activity_doc_present(
    room_code: str, description: str, docs: list[dict[str, Any]]
) -> dict[str, Any]:
    for doc in docs:
        normalized = normalize_doc(doc)
        if normalized.get("docType") == "activity" and normalized.get("description") == description:
            return normalized
    raise ValueError(f"Missing activity document for {room_code}: {description}")


def wait_for_activity_doc(
    page: Any,
    room_code: str,
    description: str,
    *,
    timeout_s: float = 15.0,
    interval_s: float = 0.2,
) -> dict[str, Any]:
    return wait_until(
        lambda: next(
            (
                normalized
                for normalized in map(normalize_doc, read_docs(page, room_code))
                if normalized.get("docType") == "activity"
                and normalized.get("description") == description
            ),
            False,
        ),
        f"activity persistence for {description!r}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def wait_for_activity_failure_alert(
    page: Any,
    room_code: str,
    description: str,
    *,
    timeout_s: float = 10.0,
    interval_s: float = 0.2,
) -> None:
    outcome = wait_until(
        lambda: (
            "alert"
            if page.locator("#custom-alert-modal").is_visible()
            else (
                "persisted"
                if any(
                    normalize_doc(doc).get("docType") == "activity"
                    and normalize_doc(doc).get("description") == description
                    for doc in read_docs(page, room_code)
                )
                else False
            )
        ),
        f"activity failure outcome for {description!r}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    if outcome == "persisted":
        raise ValueError(
            f"Activity failure hook did not fire for {description!r}; the activity was persisted."
        )
    if outcome != "alert":
        raise TimeoutError(f"Timed out waiting for activity failure alert for {description!r}")


def add_category_via_settings(page: Any, group_key: str, label: str) -> None:
    form = page.locator("#add-category-form")
    if not form.is_visible():
        page.locator("#add-category-btn").click()
    form.wait_for(state="visible", timeout=5000)
    page.locator('#add-category-form select[name="parent-group"]').select_option(group_key)
    page.locator('#add-category-form input[name="category-label"]').fill(label)
    page.locator("#add-category-form").evaluate("(form) => form.requestSubmit()")


def update_group_family_via_settings(page: Any, group_key: str, color_family: str) -> None:
    page.locator(f'.btn-edit-group[data-key="{group_key}"]').click()
    form = page.locator(f'.edit-group-form[data-key="{group_key}"]')
    form.wait_for(state="visible", timeout=5000)
    page.locator(f'.edit-group-form[data-key="{group_key}"] select[name="edit-group-family"]').select_option(color_family)
    form.evaluate("(node) => node.requestSubmit()")


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


def wait_for_room_code(
    page: Any, room_code: str, timeout_s: float = 15.0, interval_s: float = 0.2
) -> None:
    room_display = page.locator("#room-code-display")
    wait_until(
        lambda: room_display.text_content().strip() == room_code,
        f"room code display for {room_code}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def dismiss_open_modals(page: Any) -> None:
    for selector in ("#ok-custom-alert-modal", "#ok-custom-confirm-modal", "#cancel-custom-confirm-modal"):
        locator = page.locator(selector)
        if locator.count() and locator.first.is_visible():
            locator.first.click(force=True)
            page.wait_for_timeout(100)


def request_manual_sync(page: Any) -> None:
    indicator = page.locator("#sync-status-indicator")
    if indicator.count():
        indicator.click()


def enter_room(page: Any, room_code: str) -> None:
    page.locator("#room-entry-screen").wait_for(state="visible", timeout=15000)
    page.locator("#room-code-input").fill(room_code)
    page.locator("#room-entry-form").evaluate("(form) => form.requestSubmit()")
    wait_for_main_app(page)
    wait_for_room_code(page, room_code)


def switch_room(page: Any, room_code: str) -> None:
    dismiss_open_modals(page)
    page.locator("#room-code-badge").click()
    page.locator("#room-entry-screen").wait_for(state="visible", timeout=15000)
    page.locator("#room-code-input").fill(room_code)
    page.locator("#room-entry-form").evaluate("(form) => form.requestSubmit()")
    wait_for_main_app(page)
    wait_for_room_code(page, room_code)


def task_form_input_selector(field_name: str) -> str:
    return f'#task-form input[name="{field_name}"]'


def fill_locator_value(
    page: Any,
    locator: Any,
    value: str,
    *,
    description: str,
    attempts: int = 3,
    retry_delay_ms: int = 150,
) -> None:
    last_seen_value = ""
    for attempt in range(attempts):
        locator.fill(value)
        current_value = locator.input_value()
        if current_value == value:
            return
        last_seen_value = current_value
        if attempt < attempts - 1 and retry_delay_ms > 0:
            page.wait_for_timeout(retry_delay_ms)

    raise TimeoutError(
        f"Timed out filling {description}. Expected {value!r}, saw {last_seen_value!r}."
    )


def wait_for_text_in_locator(
    page: Any,
    selector: str,
    expected_text: str,
    *,
    description: str,
    timeout_s: float = 15.0,
    interval_s: float = 0.2,
) -> None:
    locator = page.locator(selector)
    wait_until(
        lambda: expected_text in (locator.text_content() or ""),
        description,
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def wait_for_input_value(
    page: Any,
    selector: str,
    expected_value: str,
    *,
    description: str,
    timeout_s: float = 15.0,
    interval_s: float = 0.2,
) -> str:
    locator = page.locator(selector)
    return wait_until(
        lambda: (
            value if (value := locator.input_value()) == expected_value else False
        ),
        description,
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def wait_for_activity_row_text(
    page: Any,
    activity_id: str,
    expected_text: str,
    *,
    timeout_s: float = 15.0,
    interval_s: float = 0.2,
) -> str:
    selector = f'div.activity-item[data-activity-id="{activity_id}"]'
    locator = page.locator(selector)
    return wait_until(
        lambda: (
            text if expected_text in (text := (locator.text_content() or "")) else False
        ),
        f"activity row text for {activity_id}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def add_scheduled_task(page: Any, description: str, start_time: str, duration_minutes: int) -> None:
    page.locator("#scheduled").check()
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("description")),
        description,
        description="task description",
    )
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("start-time")),
        start_time,
        description="scheduled task start time",
    )
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("duration-hours")),
        str(duration_minutes // 60),
        description="scheduled task duration hours",
    )
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("duration-minutes")),
        str(duration_minutes % 60),
        description="scheduled task duration minutes",
    )
    page.locator("#task-form button[type='submit']").click()


def add_unscheduled_task(page: Any, description: str, est_minutes: int, priority: str = "medium") -> None:
    page.locator("#unscheduled").check()
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("description")),
        description,
        description="task description",
    )
    page.locator(f'input[name="priority"][value="{priority}"]').check(force=True)
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("est-duration-hours")),
        str(est_minutes // 60),
        description="unscheduled task duration hours",
    )
    fill_locator_value(
        page,
        page.locator(task_form_input_selector("est-duration-minutes")),
        str(est_minutes % 60),
        description="unscheduled task duration minutes",
    )
    page.locator("#task-form button[type='submit']").click()


def ensure_task_doc_present(room_code: str, description: str, docs: list[dict[str, Any]]) -> dict[str, Any]:
    for doc in docs:
        if doc.get("description") == description:
            return normalize_doc(doc)
    raise ValueError(f"Missing task document for {room_code}: {description}")


def wait_for_task_doc(
    page: Any,
    room_code: str,
    description: str,
    *,
    timeout_s: float = 15.0,
    interval_s: float = 0.2,
) -> dict[str, Any]:
    return wait_until(
        lambda: next(
            (
                normalized
                for normalized in map(normalize_doc, read_docs(page, room_code))
                if normalized.get("description") == description
            ),
            False,
        ),
        f"task persistence for {description!r}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def open_scheduled_edit_form(
    page: Any,
    task_id: str,
    *,
    attempts: int = 3,
    form_timeout_ms: int = 4000,
    retry_delay_ms: int = 250,
) -> str:
    button_selector = f'[data-task-id="{task_id}"] .btn-edit'
    form_selector = f"#edit-task-{task_id}"
    form_locator = page.locator(form_selector)
    last_error: Exception | None = None

    for attempt in range(attempts):
        if form_locator.is_visible():
            return form_selector

        button_locator = page.locator(button_selector)
        try:
            button_locator.scroll_into_view_if_needed()
            button_locator.click()
            form_locator.wait_for(state="visible", timeout=form_timeout_ms)
            return form_selector
        except Exception as error:
            last_error = error
            if attempt < attempts - 1 and retry_delay_ms > 0:
                page.wait_for_timeout(retry_delay_ms)

    raise TimeoutError(f"Timed out opening scheduled edit form for {task_id}: {last_error}")


def get_unscheduled_delete_state(page: Any, task_id: str) -> str:
    task_selector = f'.task-card[data-task-id="{task_id}"]'
    if page.locator(task_selector).count() == 0:
        return "deleted"

    button_classes = (
        page.locator(f"{task_selector} .btn-delete-unscheduled").first.get_attribute("class") or ""
    )
    icon_classes = (
        page.locator(f"{task_selector} .btn-delete-unscheduled i").first.get_attribute("class")
        or ""
    )
    if "text-rose-400" in button_classes or "fa-check-circle" in icon_classes:
        return "confirming"
    return "idle"


def delete_unscheduled_task_via_ui(
    page: Any, task_id: str, *, timeout_s: float = 10.0, interval_s: float = 0.2
) -> None:
    button_selector = f'.task-card[data-task-id="{task_id}"] .btn-delete-unscheduled'
    deadline = time.time() + timeout_s
    page.locator(button_selector).click()

    state_after_first_click = wait_until(
        lambda: (
            state
            if (state := get_unscheduled_delete_state(page, task_id)) in {"confirming", "deleted"}
            else False
        ),
        f"unscheduled delete confirmation for {task_id}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    if state_after_first_click == "deleted":
        return

    while time.time() < deadline:
        page.locator(button_selector).click()
        state = wait_until(
            lambda: (
                current_state
                if (
                    current_state := get_unscheduled_delete_state(page, task_id)
                ) in {"confirming", "deleted"}
                else False
            ),
            f"unscheduled task deletion state for {task_id}",
            timeout_s=max(interval_s, 0.05),
            interval_s=interval_s,
        )
        if state == "deleted":
            return

    raise TimeoutError(f"Timed out waiting for unscheduled task deletion for {task_id}")


def arm_unscheduled_delete_confirm(
    page: Any, task_id: str, *, timeout_s: float = 10.0, interval_s: float = 0.2
) -> None:
    button_selector = f'.task-card[data-task-id="{task_id}"] .btn-delete-unscheduled'
    page.locator(button_selector).click()
    state = wait_until(
        lambda: (
            current_state
            if (current_state := get_unscheduled_delete_state(page, task_id)) == "confirming"
            else False
        ),
        f"unscheduled delete confirm arm for {task_id}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    if state != "confirming":
        raise TimeoutError(f"Timed out arming unscheduled delete confirmation for {task_id}")


def complete_scheduled_task_via_ui(page: Any, task_id: str) -> None:
    page.locator(f'[data-task-id="{task_id}"] .checkbox').click()
    confirm_modal = page.locator("#custom-confirm-modal")
    if confirm_modal.count() and confirm_modal.first.is_visible():
        page.locator("#ok-custom-confirm-modal").click()


def clear_all_tasks_via_ui(
    page: Any,
    *,
    option_timeout_ms: int = 5000,
    confirm_timeout_ms: int = 5000,
    attempts: int = 3,
    retry_delay_ms: int = 250,
) -> None:
    trigger = page.locator("#clear-options-dropdown-trigger-btn")
    option = page.locator("#clear-all-tasks-option")
    confirm_button = page.locator("#ok-custom-confirm-modal")
    confirm_modal = page.locator("#custom-confirm-modal")

    last_option_error: Exception | None = None
    option_became_visible = False
    for attempt in range(attempts):
        trigger.scroll_into_view_if_needed()
        trigger.click()
        try:
            option.wait_for(state="visible", timeout=option_timeout_ms)
            option_became_visible = True
            break
        except Exception as error:
            last_option_error = error
            if retry_delay_ms > 0:
                page.wait_for_timeout(retry_delay_ms)

    if option_became_visible:
        option.click()
    else:
        option.evaluate("(node) => node.click()")
    last_confirm_error: Exception | None = None
    for attempt in range(attempts):
        try:
            confirm_button.wait_for(state="visible", timeout=confirm_timeout_ms)
            break
        except Exception as error:
            last_confirm_error = error
            if attempt == attempts - 1:
                raise TimeoutError(
                    f"Timed out waiting for clear-all confirm button: {last_confirm_error}"
                ) from error
            if retry_delay_ms > 0:
                page.wait_for_timeout(retry_delay_ms)

    confirm_button.click()
    confirm_modal.wait_for(state="hidden", timeout=confirm_timeout_ms)


def is_expected_sync_response_error(response_error: tuple[int, str, str]) -> bool:
    status, method, url = response_error
    path_parts = [segment for segment in urlsplit(url).path.split("/") if segment]
    if not path_parts:
        return False

    db_name = path_parts[0]
    if not db_name.startswith("fortudo-"):
        return False

    if status == 404 and method == "GET":
        return len(path_parts) == 1 or (len(path_parts) >= 2 and path_parts[1] == "_local")
    if status == 412 and method == "PUT":
        return len(path_parts) == 1
    return False


def filter_runtime_errors(
    console_errors: list[str],
    request_failures: list[str],
    response_errors: list[tuple[int, str, str]],
) -> tuple[list[str], list[str], list[tuple[int, str, str]]]:
    has_only_abort_failures = bool(request_failures) and all(
        "net::ERR_ABORTED" in failure for failure in request_failures
    )

    filtered_console_errors = []
    for message in console_errors:
        if message.startswith("Failed to load resource: the server responded with a status of "):
            continue
        if has_only_abort_failures and "[sync-manager.js:" in message and "Sync error:" in message:
            continue
        if "Failed to auto-log completed task as activity:" in message and (
            "Smoke forced activity auto-log failure." in message
        ):
            continue
        filtered_console_errors.append(message)

    filtered_request_failures = [
        failure for failure in request_failures if "net::ERR_ABORTED" not in failure
    ]
    filtered_response_errors = [
        response_error
        for response_error in response_errors
        if not is_expected_sync_response_error(response_error)
    ]
    return filtered_console_errors, filtered_request_failures, filtered_response_errors


def assert_no_runtime_errors(
    console_errors: list[str],
    page_errors: list[str],
    request_failures: list[str],
    response_errors: list[tuple[int, str, str]],
) -> None:
    filtered_console_errors, filtered_request_failures, filtered_response_errors = (
        filter_runtime_errors(console_errors, request_failures, response_errors)
    )
    if filtered_console_errors or page_errors or filtered_request_failures or filtered_response_errors:
        raise ValueError(
            "Runtime errors detected.\n"
            f"Console errors: {json.dumps(filtered_console_errors[:10], indent=2)}\n"
            f"Page errors: {json.dumps(page_errors[:10], indent=2)}\n"
            f"Request failures: {json.dumps(filtered_request_failures[:10], indent=2)}\n"
            f"Response errors: {json.dumps(filtered_response_errors[:10], indent=2)}"
        )


def save_failure_screenshot(page: Any) -> None:
    screenshot_dir = Path("test_screenshots")
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot_dir / "playwright_preview_smoke_failure.png"), full_page=True)


def demo_step(page: Any, message: str, step_pause_ms: int) -> None:
    if step_pause_ms <= 0:
        return
    print(f"[demo] {message}")
    page.wait_for_timeout(step_pause_ms)


def wait_for_demo_start(
    *,
    demo: bool,
    headless: bool,
    input_fn: Any = input,
    output_fn: Any = print,
) -> None:
    if not demo or headless:
        return
    output_fn("[demo] Preview loaded. Press Enter to start the smoke...")
    input_fn("")


def run_smoke(
    preview_url: str,
    *,
    demo: bool = False,
    headless: bool = False,
    keep_open: bool = False,
    channel: str = "chrome",
    slow_mo_ms: int = 0,
    step_pause_ms: int = 0,
) -> bool:
    from playwright.sync_api import sync_playwright

    hostname = get_hostname_from_url(preview_url)
    rooms = create_scenario_rooms(create_run_scoped_prefix(hostname))
    couchdb_url = fetch_preview_couchdb_url(preview_url)

    if is_preview_host(hostname) and couchdb_url:
        reset_remote_preview_rooms(preview_url, hostname, rooms)

    console_errors: list[str] = []
    page_errors: list[str] = []
    request_failures: list[str] = []
    response_errors: list[tuple[int, str, str]] = []

    with sync_playwright() as playwright:
        launch_options = build_launch_options(
            headless=headless,
            channel=channel,
            slow_mo_ms=slow_mo_ms,
        )
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
        page.on(
            "response",
            lambda response: response_errors.append(
                (response.status, response.request.method, response.url)
            )
            if response.status >= 400
            else None,
        )

        try:
            def wait_for_sync_status_normal(label: str) -> None:
                if not couchdb_url:
                    return
                settled_status = wait_until(
                    lambda: (
                        status
                        if (status := (page.locator("#sync-status-text").text_content() or "").strip())
                        and status != "Syncing"
                        else False
                    ),
                    f"{label} sync status",
                    timeout_s=20.0,
                )
                if settled_status == "Error":
                    raise ValueError(f"{label} sync status entered error state.")

            def read_remote_summary(room_code: str) -> dict[str, list[dict[str, Any]]]:
                if not couchdb_url:
                    raise ValueError("Remote sync smoke requested without COUCHDB_URL configured.")
                return summarize_docs(
                    fetch_remote_docs(couchdb_url, build_remote_db_name(hostname, room_code))
                )

            page.goto(preview_url, wait_until="load")
            wait_for_app_ready(page)
            wait_for_demo_start(demo=demo, headless=headless)
            demo_step(page, "opening alpha room", step_pause_ms)
            enter_room(page, rooms["alpha"])
            clear_room_storage(page, rooms["alpha"])
            page.reload(wait_until="load")
            wait_for_main_app(page)

            demo_step(page, "adding fresh-room tasks", step_pause_ms)
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

            edit_form_selector = open_scheduled_edit_form(page, scheduled_doc["id"])
            page.locator(f"{edit_form_selector} input[name='description']").fill(
                "Playwright scheduled task edited"
            )
            page.locator(edit_form_selector).evaluate("(form) => form.requestSubmit()")
            wait_until(
                lambda: any(
                    doc.get("id") == scheduled_doc["id"]
                    and doc.get("description") == "Playwright scheduled task edited"
                    for doc in list(map(normalize_doc, read_docs(page, rooms["alpha"])))
                ),
                "scheduled edit persistence",
            )

            demo_step(page, "editing scheduled task and deleting unscheduled task", step_pause_ms)
            delete_unscheduled_task_via_ui(page, unscheduled_doc["id"])

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
            if couchdb_url:
                request_manual_sync(page)
                wait_for_sync_status_normal("taxonomy manual sync")
                wait_until(
                    lambda: (
                        lambda summary: any(
                            doc.get("description") == "Playwright scheduled task edited"
                            for doc in summary["tasks"]
                        )
                        and not any(doc.get("id") == unscheduled_doc["id"] for doc in summary["tasks"])
                    )(read_remote_summary(rooms["alpha"])),
                    "alpha remote sync",
                    timeout_s=25.0,
                )
                wait_for_sync_status_normal("alpha")

            demo_step(page, "checking legacy migration room", step_pause_ms)
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
            if couchdb_url:
                wait_until(
                    lambda: (
                        lambda summary: format_doc_ids(summary["tasks"])
                        == ["sched-legacy", "unsched-legacy"]
                        and not summary["legacy_tasks"]
                    )(read_remote_summary(rooms["legacy"])),
                    "legacy remote sync",
                    timeout_s=25.0,
                )
                wait_for_sync_status_normal("legacy")

            demo_step(page, "checking cross-type isolation in alpha", step_pause_ms)
            switch_room(page, rooms["alpha"])
            wait_for_text_in_locator(
                page,
                "#scheduled-task-list",
                "Playwright scheduled task edited",
                description="alpha scheduled task reload",
            )
            seed_docs(
                page,
                rooms["alpha"],
                [
                    {"_id": "activity-smoke", "docType": "activity", "note": "keep me"},
                    {"_id": "config-categories", "docType": "config", "categories": []},
                ],
            )

            clear_all_tasks_via_ui(page)

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
            if couchdb_url:
                wait_until(
                    lambda: (
                        lambda summary: not summary["tasks"]
                        and not summary["legacy_tasks"]
                        and any(doc.get("id") == "activity-smoke" for doc in summary["activities"])
                        and any(doc.get("id") == "config-categories" for doc in summary["configs"])
                    )(read_remote_summary(rooms["alpha"])),
                    "alpha remote clear-all sync",
                    timeout_s=25.0,
                )
                wait_for_sync_status_normal("alpha clear-all")

            demo_step(page, "checking beta room isolation", step_pause_ms)
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
            if couchdb_url:
                wait_until(
                    lambda: (
                        lambda summary: any(
                            doc.get("description") == "Playwright beta task"
                            for doc in summary["tasks"]
                        )
                        and not summary["activities"]
                        and not summary["configs"]
                    )(read_remote_summary(rooms["beta"])),
                    "beta remote sync",
                    timeout_s=25.0,
                )
                wait_for_sync_status_normal("beta")

            demo_step(page, "returning to alpha for final sync verification", step_pause_ms)
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
            if couchdb_url:
                alpha_remote_final = read_remote_summary(rooms["alpha"])
                assert_non_task_docs_remain(
                    alpha_remote_final,
                    {"activity_id": "activity-smoke", "config_id": "config-categories"},
                )
                wait_for_sync_status_normal("alpha final")

            demo_step(page, "checking phase 3 taxonomy and settings room", step_pause_ms)
            switch_room(page, rooms["taxonomy"])
            clear_room_storage(page, rooms["taxonomy"])
            set_activities_enabled(page, True)
            seed_docs(page, rooms["taxonomy"], [build_phase3_taxonomy_config_doc()])
            page.reload(wait_until="load")
            wait_for_main_app(page)

            wait_until(
                lambda: page.locator("#category-dropdown-row").is_visible(),
                "activities-enabled category dropdown",
            )
            wait_until(
                lambda: (
                    page.locator('#category-select option[value="work/project"]').text_content() or ""
                )
                == "› Project",
                "visible nested project category option",
            )

            open_settings_modal(page)
            wait_for_text_in_locator(
                page,
                "#settings-content",
                "Work",
                description="seeded taxonomy settings content",
            )
            wait_for_text_in_locator(
                page,
                "#settings-content",
                "Family",
                description="seeded family group content",
            )
            wait_until(
                lambda: "settings-scroll-area"
                in (page.locator("#settings-content").get_attribute("class") or ""),
                "settings scroll shell class",
            )

            page.locator("#add-category-btn").click()
            page.locator("#add-category-form").wait_for(state="visible", timeout=5000)
            separator_text = (
                page.locator("#add-category-form [data-category-path-separator]").text_content()
                or ""
            ).strip()
            if separator_text != "/":
                raise ValueError(f"unexpected add-category separator: {separator_text!r}")
            group_placeholder = (
                page.locator('#add-category-form select[name="parent-group"] option').first.text_content()
                or ""
            ).strip()
            if group_placeholder != "Group":
                raise ValueError(f"unexpected add-category group placeholder: {group_placeholder!r}")
            category_placeholder = page.locator(
                '#add-category-form input[name="category-label"]'
            ).get_attribute("placeholder")
            if category_placeholder != "Category name":
                raise ValueError(
                    f"unexpected add-category input placeholder: {category_placeholder!r}"
                )

            add_category_via_settings(page, "break", "Walk")
            wait_until(
                lambda: page.locator('[data-category-key="break/walk"]').count() == 1,
                "new break walk category row",
            )
            wait_until(
                lambda: page.locator('#category-select option[value="break/walk"]').count() == 1,
                "live dropdown refresh for added category",
            )

            update_group_family_via_settings(page, "work", "amber")
            wait_until(
                lambda: "#b45309"
                in (
                    page.locator(
                        '[data-category-key="work/project"] .category-dot'
                    ).get_attribute("style")
                    or ""
                ),
                "linked work/project category recolor",
            )
            close_settings_modal(page)

            page.locator("#scheduled").check()
            fill_locator_value(
                page,
                page.locator(task_form_input_selector("description")),
                "Taxonomy scheduled group task",
                description="taxonomy scheduled description",
            )
            fill_locator_value(
                page,
                page.locator(task_form_input_selector("start-time")),
                "11:00",
                description="taxonomy scheduled start",
            )
            fill_locator_value(
                page,
                page.locator(task_form_input_selector("duration-hours")),
                "0",
                description="taxonomy scheduled duration hours",
            )
            fill_locator_value(
                page,
                page.locator(task_form_input_selector("duration-minutes")),
                "25",
                description="taxonomy scheduled duration minutes",
            )
            page.locator("#category-select").select_option("family")
            page.locator("#task-form button[type='submit']").click()

            page.locator("#unscheduled").check()
            fill_locator_value(
                page,
                page.locator(task_form_input_selector("description")),
                "Taxonomy child category task",
                description="taxonomy unscheduled description",
            )
            page.locator('input[name="priority"][value="medium"]').check(force=True)
            fill_locator_value(
                page,
                page.locator(task_form_input_selector("est-duration-hours")),
                "0",
                description="taxonomy unscheduled duration hours",
            )
            fill_locator_value(
                page,
                page.locator(task_form_input_selector("est-duration-minutes")),
                "15",
                description="taxonomy unscheduled duration minutes",
            )
            page.locator("#category-select").select_option("work/project")
            page.locator("#task-form button[type='submit']").click()

            wait_until(
                lambda: (
                    lambda docs: any(
                        doc.get("description") == "Taxonomy scheduled group task"
                        and doc.get("category") == "family"
                        for doc in docs
                    )
                    and any(
                        doc.get("description") == "Taxonomy child category task"
                        and doc.get("category") == "work/project"
                        for doc in docs
                    )
                )(list(map(normalize_doc, read_docs(page, rooms["taxonomy"])))),
                "taxonomy task category persistence",
            )

            wait_until(
                lambda: "Family" in (page.locator("#scheduled-task-list").text_content() or ""),
                "scheduled group badge label",
            )
            wait_until(
                lambda: "Project" in (page.locator("#unscheduled-task-list").text_content() or ""),
                "unscheduled child badge label",
            )
            scheduled_badge_style = (
                page.locator("#scheduled-task-list .category-badge").first.get_attribute("style")
                or ""
            )
            unscheduled_badge_style = (
                page.locator("#unscheduled-task-list .category-badge").first.get_attribute("style")
                or ""
            )
            if "background-color: rgba(15, 23, 42, 0.9)" not in scheduled_badge_style:
                raise ValueError(f"scheduled badge lost standardized background: {scheduled_badge_style}")
            if "#4b5563" not in scheduled_badge_style:
                raise ValueError(f"scheduled group badge lost gray accent: {scheduled_badge_style}")
            if "background-color: rgba(15, 23, 42, 0.9)" not in unscheduled_badge_style:
                raise ValueError(
                    f"unscheduled badge lost standardized background: {unscheduled_badge_style}"
                )
            if "#b45309" not in unscheduled_badge_style:
                raise ValueError(f"unscheduled child badge did not reflect amber family: {unscheduled_badge_style}")

            page.reload(wait_until="load")
            wait_for_main_app(page)
            wait_for_text_in_locator(
                page,
                "#scheduled-task-list",
                "Taxonomy scheduled group task",
                description="taxonomy scheduled task after reload",
            )
            wait_for_text_in_locator(
                page,
                "#unscheduled-task-list",
                "Taxonomy child category task",
                description="taxonomy unscheduled task after reload",
            )

            open_settings_modal(page)
            wait_for_text_in_locator(
                page,
                "#settings-content",
                "Walk",
                description="persisted added category after reload",
            )
            page.locator('.btn-delete-group[data-key="family"]').click()
            wait_for_toast_text(page, 'Group "family" is referenced by tasks')
            page.locator('.btn-delete-category[data-key="work/project"]').click()
            wait_for_toast_text(page, 'Category "work/project" is referenced by tasks')
            close_settings_modal(page)

            taxonomy_summary = summarize_docs(read_docs(page, rooms["taxonomy"]))
            taxonomy_config = next(
                (doc for doc in taxonomy_summary["configs"] if doc.get("id") == "config-categories"),
                None,
            )
            if not taxonomy_config:
                raise ValueError(
                    f"taxonomy room missing config-categories doc.\n{format_snapshot(taxonomy_summary)}"
                )
            if not any(group.get("key") == "work" and group.get("colorFamily") == "amber" for group in taxonomy_config.get("groups", [])):
                raise ValueError(
                    f"taxonomy room did not persist work family edit.\n{format_snapshot(taxonomy_summary)}"
                )
            if not any(category.get("key") == "break/walk" for category in taxonomy_config.get("categories", [])):
                raise ValueError(
                    f"taxonomy room did not persist compact add-category flow.\n{format_snapshot(taxonomy_summary)}"
                )
            if couchdb_url:
                wait_until(
                    lambda: (
                        lambda summary: any(
                            doc.get("description") == "Taxonomy scheduled group task"
                            and doc.get("category") == "family"
                            for doc in summary["tasks"]
                        )
                        and any(
                            doc.get("description") == "Taxonomy child category task"
                            and doc.get("category") == "work/project"
                            for doc in summary["tasks"]
                        )
                        and any(
                            doc.get("id") == "config-categories"
                            and any(
                                group.get("key") == "work"
                                and group.get("colorFamily") == "amber"
                                for group in doc.get("groups", [])
                            )
                            and any(
                                category.get("key") == "break/walk"
                                for category in doc.get("categories", [])
                            )
                            for doc in summary["configs"]
                        )
                    )(read_remote_summary(rooms["taxonomy"])),
                    "taxonomy remote sync",
                    timeout_s=60.0,
                )
                wait_for_sync_status_normal("taxonomy")

            demo_step(page, "checking activities room flows", step_pause_ms)
            switch_room(page, rooms["activities"])
            clear_room_storage(page, rooms["activities"])
            set_activities_enabled(page, True)
            page.reload(wait_until="load")
            wait_for_main_app(page)

            add_activity(page, "Playwright manual activity", "13:00", 30)
            wait_until(
                lambda: any(
                    doc.get("description") == "Playwright manual activity"
                    for doc in read_docs(page, rooms["activities"])
                ),
                "manual activity persistence",
            )
            wait_for_text_in_locator(
                page,
                "#activity-list",
                "Playwright manual activity",
                description="manual activity render",
            )

            queue_activity_smoke_failure(page, "manual-add", 1)
            add_activity(page, "Playwright failed activity", "13:45", 15)
            wait_for_activity_failure_alert(
                page,
                rooms["activities"],
                "Playwright failed activity",
            )
            wait_for_text_in_locator(
                page,
                "#custom-alert-message",
                "Could not log activity.",
                description="manual activity failure alert",
            )
            failed_activity_description = page.locator(
                task_form_input_selector("description")
            ).input_value()
            if failed_activity_description != "Playwright failed activity":
                raise ValueError(
                    "manual activity failure cleared the form unexpectedly: "
                    f"{failed_activity_description!r}"
                )
            page.locator("#ok-custom-alert-modal").click()
            page.locator("#custom-alert-modal").wait_for(state="hidden", timeout=10000)
            if any(
                doc.get("description") == "Playwright failed activity"
                for doc in read_docs(page, rooms["activities"])
            ):
                raise ValueError("failed manual activity unexpectedly persisted")

            add_active_scheduled_task(page, "Playwright auto-log success", 20)
            success_task_doc = wait_for_task_doc(
                page,
                rooms["activities"],
                "Playwright auto-log success",
            )
            complete_scheduled_task_via_ui(page, success_task_doc["id"])
            wait_until(
                lambda: any(
                    doc.get("docType") == "activity"
                    and doc.get("description") == "Playwright auto-log success"
                    and doc.get("source") == "auto"
                    for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
                ),
                "successful auto-log activity persistence",
            )
            wait_for_text_in_locator(
                page,
                "#activity-list",
                "Playwright auto-log success",
                description="successful auto-log activity render",
            )

            add_active_scheduled_task(page, "Playwright auto-log failure", 20)
            failing_task_doc = wait_for_task_doc(
                page,
                rooms["activities"],
                "Playwright auto-log failure",
            )
            queue_activity_smoke_failure(page, "auto-log", 1)
            complete_scheduled_task_via_ui(page, failing_task_doc["id"])
            wait_for_toast_text(page, "Task completed, but activity auto-log failed.")
            wait_until(
                lambda: any(
                    doc.get("id") == failing_task_doc["id"] and doc.get("status") == "completed"
                    for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
                ),
                "failed auto-log task completion persistence",
            )
            if any(
                doc.get("docType") == "activity"
                and doc.get("description") == "Playwright auto-log failure"
                for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
            ):
                raise ValueError("failed auto-log unexpectedly created an activity")

            add_unscheduled_task(page, "Playwright delete confirm task", 15)
            delete_confirm_task_doc = wait_for_task_doc(
                page,
                rooms["activities"],
                "Playwright delete confirm task",
            )

            add_activity(page, "Playwright editable activity", "15:30", 15)
            editable_activity_doc = wait_for_activity_doc(
                page,
                rooms["activities"],
                "Playwright editable activity",
            )
            wait_for_activity_row_text(
                page,
                editable_activity_doc["id"],
                "Playwright editable activity",
            )
            arm_unscheduled_delete_confirm(page, delete_confirm_task_doc["id"])
            page.locator(
                f'[data-activity-id="{editable_activity_doc["id"]}"] .btn-edit-activity'
            ).click()
            page.locator("#activity-edit-modal").wait_for(state="visible", timeout=10000)
            current_modal_value = wait_for_input_value(
                page,
                "#activity-edit-description",
                "Playwright editable activity",
                description="activity edit modal description preload",
            )
            if current_modal_value != "Playwright editable activity":
                raise ValueError(
                    "activity edit modal lost the current description after rerender: "
                    f"{current_modal_value!r}"
                )
            fill_locator_value(
                page,
                page.locator("#activity-edit-description"),
                "Playwright editable activity updated",
                description="activity edit modal description",
            )
            page.locator("#activity-edit-form").evaluate("(form) => form.requestSubmit()")
            page.locator("#activity-edit-modal").wait_for(state="hidden", timeout=10000)
            wait_until(
                lambda: any(
                    doc.get("id") == editable_activity_doc["id"]
                    and doc.get("description") == "Playwright editable activity updated"
                    for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
                ),
                "activity edit after delete-confirm rerender",
            )
            if get_unscheduled_delete_state(page, delete_confirm_task_doc["id"]) != "idle":
                raise ValueError("delete confirm state was not cleared by activity edit")

            add_activity(page, "Playwright delete activity", "16:00", 10)
            deletable_activity_doc = wait_for_activity_doc(
                page,
                rooms["activities"],
                "Playwright delete activity",
            )
            wait_for_activity_row_text(
                page,
                deletable_activity_doc["id"],
                "Playwright delete activity",
            )
            arm_unscheduled_delete_confirm(page, delete_confirm_task_doc["id"])
            page.locator(
                f'[data-activity-id="{deletable_activity_doc["id"]}"] .btn-delete-activity'
            ).click()
            wait_until(
                lambda: not any(
                    doc.get("id") == deletable_activity_doc["id"]
                    for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
                ),
                "activity delete after delete-confirm rerender",
            )
            if get_unscheduled_delete_state(page, delete_confirm_task_doc["id"]) != "idle":
                raise ValueError("delete confirm state was not cleared by activity delete")

            assert_no_runtime_errors(console_errors, page_errors, request_failures, response_errors)

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
            "Usage: uv run --with playwright python -B scripts/playwright_preview_smoke.py "
            "<preview-url> [--demo] [--keep-open] [--headless] "
            "[--slow-ms N] [--step-pause-ms N] [--channel chrome|chromium]"
        )
        return 1

    run_smoke(
        parsed["preview_url"],
        demo=parsed["demo"],
        headless=parsed["headless"],
        keep_open=parsed["keep_open"],
        channel=parsed["channel"],
        slow_mo_ms=parsed["slow_mo_ms"],
        step_pause_ms=parsed["step_pause_ms"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))

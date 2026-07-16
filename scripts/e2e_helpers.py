"""Shared helpers for local E2E tests and preview smoke flows.

Keep this module limited to helpers that local E2E tests import or could
reasonably share. Preview-only CLI, remote cleanup, and scenario runners
belong under scripts.preview_smoke.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse, urlsplit

ACTIVITY_SMOKE_FAILURES_KEY = "fortudo-smoke-activity-failures"
RUNNING_ACTIVITY_CONFIG_ID = "config-running-activity"
DEMO_LOGGING_ENABLED = False


def configure_demo_logging(*, enabled: bool) -> None:
    global DEMO_LOGGING_ENABLED
    DEMO_LOGGING_ENABLED = enabled


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


















def is_preview_host(hostname: str) -> bool:
    host = str(hostname or "")
    return (host.startswith("fortudo--") and host.endswith(".web.app")) or (
        host.startswith("fortudo--") and host.endswith(".firebaseapp.com")
    )


def supports_activity_smoke_failure_host(hostname: str) -> bool:
    host = str(hostname or "")
    return host in {"localhost", "127.0.0.1"} or is_preview_host(host)




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








def install_local_pouchdb_route(
    context: Any,
    *,
    repo_root: Path | None = None,
) -> bool:
    root = repo_root or Path(__file__).resolve().parents[1]
    pouchdb_path = root / "node_modules" / "pouchdb" / "dist" / "pouchdb.min.js"
    if not pouchdb_path.exists():
        return False

    body = pouchdb_path.read_text(encoding="utf-8")

    def fulfill_pouchdb(route: Any) -> None:
        route.fulfill(
            status=200,
            content_type="application/javascript",
            body=body,
        )

    context.route(
        "https://cdn.jsdelivr.net/npm/pouchdb@9.0.0/dist/pouchdb.min.js",
        fulfill_pouchdb,
    )
    return True


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


def force_activity_mode(page: Any) -> None:
    page.evaluate(
        """
        () => {
            const scheduled = document.getElementById('scheduled');
            const unscheduled = document.getElementById('unscheduled');
            const activity = document.getElementById('activity');
            if (!(activity instanceof HTMLInputElement)) {
                return;
            }

            if (scheduled instanceof HTMLInputElement) {
                scheduled.checked = false;
            }
            if (unscheduled instanceof HTMLInputElement) {
                unscheduled.checked = false;
            }

            activity.checked = true;
            activity.dispatchEvent(new Event('input', { bubbles: true }));
            activity.dispatchEvent(new Event('change', { bubbles: true }));
        }
        """
    )

    wait_until(
        lambda: not page.locator('#start-timer-btn').is_hidden()
        and (
            page.locator('#timer-display').is_visible()
            or 'Log Activity' in (page.locator('#add-task-btn').text_content() or '')
        ),
        "activity mode sync",
        timeout_s=10.0,
        interval_s=0.1,
    )


def start_activity_timer(
    page: Any,
    description: str,
    category: str | None = None,
    *,
    room_code: str | None = None,
) -> None:
    timer_display = page.locator("#timer-display")
    if not timer_display.is_visible():
        force_activity_mode(page)

    if timer_display.is_visible():
        if category is not None:
            page.locator("#next-activity-category").select_option(category)
        fill_locator_value(
            page,
            page.locator("#next-activity-description"),
            description,
            description="next timer description",
        )
        wait_for_input_value(
            page,
            "#next-activity-description",
            description,
            description="next timer description before start",
        )
    else:
        if category is not None:
            page.locator('#task-form select[name="category"]').select_option(category)
        fill_locator_value(
            page,
            page.locator(task_form_input_selector("description")),
            description,
            description="timer start description",
        )
        wait_for_input_value(
            page,
            task_form_input_selector("description"),
            description,
            description="timer start description before click",
        )

    page.locator("#start-timer-btn").click()
    if room_code:
        wait_for_running_activity_config(
            page,
            room_code,
            expected_description=description,
            expected_category=category,
        )
    wait_for_running_timer_ui(page, description)


def get_relative_browser_time(page: Any, minutes_delta: int) -> str:
    value = page.evaluate(
        """
        (offsetMinutes) => {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const requestedMinutes = currentMinutes + Number(offsetMinutes || 0);
            const clampedMinutes = Math.max(0, Math.min(1439, requestedMinutes));
            const hours = String(Math.floor(clampedMinutes / 60)).padStart(2, '0');
            const minutes = String(clampedMinutes % 60).padStart(2, '0');
            return `${hours}:${minutes}`;
        }
        """,
        minutes_delta,
    )
    if not value:
        raise ValueError("Could not derive a browser-relative time value.")
    return value


def build_relative_day_activity_doc(
    page: Any,
    *,
    doc_id: str,
    description: str,
    day_offset: int,
    start_hour: int,
    start_minute: int,
    duration_minutes: int,
    category: str | None = "work/project",
) -> dict[str, Any]:
    doc = page.evaluate(
        """
        ({ id, description, dayOffset, startHour, startMinute, durationMinutes, category }) => {
            const start = new Date();
            start.setDate(start.getDate() + Number(dayOffset || 0));
            start.setHours(Number(startHour || 0), Number(startMinute || 0), 0, 0);
            const end = new Date(start.getTime() + Number(durationMinutes || 0) * 60000);
            const localDate = [
                start.getFullYear(),
                String(start.getMonth() + 1).padStart(2, '0'),
                String(start.getDate()).padStart(2, '0'),
            ].join('-');
            const dateText = start.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            });

            return {
                _id: id,
                id,
                docType: 'activity',
                description,
                category,
                source: 'manual',
                sourceTaskId: null,
                startDateTime: start.toISOString(),
                endDateTime: end.toISOString(),
                duration: Number(durationMinutes || 0),
                localDate,
                dateText,
            };
        }
        """,
        {
            "id": doc_id,
            "description": description,
            "dayOffset": day_offset,
            "startHour": start_hour,
            "startMinute": start_minute,
            "durationMinutes": duration_minutes,
            "category": category,
        },
    )
    if not doc:
        raise ValueError(f"Could not build relative activity doc for {description!r}.")
    return doc


def build_relative_day_scheduled_task_doc(
    page: Any,
    *,
    doc_id: str,
    description: str,
    day_offset: int,
    start_hour: int,
    start_minute: int,
    duration_minutes: int,
) -> dict[str, Any]:
    doc = page.evaluate(
        """
        ({ id, description, dayOffset, startHour, startMinute, durationMinutes }) => {
            const start = new Date();
            start.setDate(start.getDate() + Number(dayOffset || 0));
            start.setHours(Number(startHour || 0), Number(startMinute || 0), 0, 0);
            const end = new Date(start.getTime() + Number(durationMinutes || 0) * 60000);

            return {
                _id: id,
                id,
                docType: 'task',
                type: 'scheduled',
                description,
                startDateTime: start.toISOString(),
                endDateTime: end.toISOString(),
                duration: Number(durationMinutes || 0),
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: false,
            };
        }
        """,
        {
            "id": doc_id,
            "description": description,
            "dayOffset": day_offset,
            "startHour": start_hour,
            "startMinute": start_minute,
            "durationMinutes": duration_minutes,
        },
    )
    if not doc:
        raise ValueError(f"Could not build relative scheduled task doc for {description!r}.")
    return doc


def stop_activity_timer(
    page: Any, *, timeout_s: float = 10.0, interval_s: float = 0.2
) -> None:
    page.locator("#timer-stop-btn").click()
    wait_until(
        lambda: not page.locator("#timer-display").is_visible(),
        "timer display hidden after stop",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def start_timer_from_unscheduled_task(page: Any, task_id: str, expected_description: str) -> None:
    open_unscheduled_task_actions_menu(page, task_id)
    page.locator(f'.task-card[data-task-id="{task_id}"] .btn-start-unscheduled-timer').click()
    wait_for_running_timer_ui(page, expected_description)


def add_active_scheduled_task(page: Any, description: str, duration_minutes: int) -> None:
    page.locator("#scheduled").check()
    start_time = get_relative_browser_time(page, -1)

    add_scheduled_task(page, description, start_time, duration_minutes)


def ensure_activity_doc_present(
    room_code: str, description: str, docs: list[dict[str, Any]]
) -> dict[str, Any]:
    for doc in docs:
        normalized = normalize_doc(doc)
        if normalized.get("docType") == "activity" and normalized.get("description") == description:
            return normalized
    raise ValueError(f"Missing activity document for {room_code}: {description}")


def get_running_activity_config(
    room_code: str, docs: list[dict[str, Any]]
) -> dict[str, Any]:
    for doc in docs:
        normalized = normalize_doc(doc)
        if normalized.get("id") == RUNNING_ACTIVITY_CONFIG_ID:
            return normalized
    raise ValueError(f"Missing running activity config for {room_code}")


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


def wait_for_running_activity_config(
    page: Any,
    room_code: str,
    *,
    expected_description: str | None = None,
    expected_category: str | None = None,
    timeout_s: float = 15.0,
    interval_s: float = 0.2,
) -> dict[str, Any]:
    return wait_until(
        lambda: next(
            (
                normalized
                for normalized in map(normalize_doc, read_docs(page, room_code))
                if normalized.get("id") == RUNNING_ACTIVITY_CONFIG_ID
                and (
                    expected_description is None
                    or normalized.get("description") == expected_description
                )
                and (
                    expected_category is None or normalized.get("category") == expected_category
                )
            ),
            False,
        ),
        f"running activity config persistence for {room_code!r}",
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


def wait_for_running_timer_ui(
    page: Any,
    expected_description: str,
    *,
    timeout_s: float = 10.0,
    interval_s: float = 0.2,
) -> None:
    wait_until(
        lambda: (
            page.locator("#timer-display").is_visible()
            and page.locator("#timer-description").input_value() == expected_description
        ),
        f"running timer UI for {expected_description!r}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


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


def cancel_open_confirm_modal(page: Any, *, timeout_ms: int = 1500) -> None:
    confirm_modal = page.locator("#custom-confirm-modal")
    cancel_button = page.locator("#cancel-custom-confirm-modal")
    if confirm_modal.count():
        try:
            confirm_modal.first.wait_for(state="visible", timeout=timeout_ms)
        except Exception:
            return
    if confirm_modal.count() and confirm_modal.first.is_visible() and cancel_button.count():
        cancel_button.first.click(force=True)
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


def assert_selected_trend_day_visible(page: Any) -> None:
    result = page.evaluate(
        """
        () => {
            const strip = document.querySelector('[data-trend-day-strip]');
            const selected = document.querySelector('[data-trend-day][data-selected="true"]');
            if (!(strip instanceof HTMLElement) || !(selected instanceof HTMLElement)) {
                return { ok: false, reason: 'selected trend day or strip missing' };
            }

            const stripRect = strip.getBoundingClientRect();
            const selectedRect = selected.getBoundingClientRect();
            const tolerance = 1;
            const ok =
                selectedRect.left >= stripRect.left - tolerance &&
                selectedRect.right <= stripRect.right + tolerance;

            return {
                ok,
                reason: ok ? '' : 'selected trend day is outside strip',
                stripLeft: stripRect.left,
                stripRight: stripRect.right,
                selectedLeft: selectedRect.left,
                selectedRight: selectedRect.right,
            };
        }
        """
    )
    if not result or not result.get("ok"):
        raise ValueError(f"Selected trend day is not visible: {json.dumps(result, indent=2)}")


def assert_trend_strip_scrollbar_hidden_and_scrollable(page: Any) -> None:
    result = page.evaluate(
        """
        () => {
            const strip = document.querySelector('[data-trend-day-strip]');
            if (!(strip instanceof HTMLElement)) {
                return { ok: false, reason: 'trend day strip missing' };
            }

            const className = strip.getAttribute('class') || '';
            const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
            strip.scrollLeft = 0;
            strip.scrollLeft = Math.min(maxScrollLeft, 96);

            const hidden = className.includes('scrollbar-hidden');
            const scrollable = maxScrollLeft > 0 && strip.scrollLeft > 0;

            return {
                ok: hidden && scrollable,
                hidden,
                scrollable,
                className,
                maxScrollLeft,
                scrollLeft: strip.scrollLeft,
            };
        }
        """
    )
    if not result or not result.get("ok"):
        raise ValueError(
            f"Trend strip scrollbar/scrollability check failed: {json.dumps(result, indent=2)}"
        )


def assert_insights_rerender_preserves_vertical_scroll(
    page: Any,
    activity_id: str,
    *,
    tolerance_px: int = 24,
    timeout_s: float = 10.0,
    interval_s: float = 0.2,
) -> None:
    starting_scroll_y = page.evaluate(
        """
        () => {
            let spacer = document.querySelector('[data-preview-smoke-scroll-spacer]');
            if (!(spacer instanceof HTMLElement)) {
                spacer = document.createElement('div');
                spacer.dataset.previewSmokeScrollSpacer = 'true';
                spacer.style.height = '960px';
                spacer.style.pointerEvents = 'none';
                document.body.append(spacer);
            }
            window.scrollTo(0, Math.max(0, document.body.scrollHeight - window.innerHeight - 40));
            return window.scrollY;
        }
        """
    )
    delete_button = page.locator(
        f'#insights-activity-list div.activity-item[data-activity-id="{activity_id}"] '
        ".btn-delete-activity"
    )
    delete_button.scroll_into_view_if_needed()
    starting_scroll_y = page.evaluate("() => window.scrollY")
    delete_button.click()

    ending_scroll_y = wait_until(
        lambda: (
            current
            if abs((current := page.evaluate("() => window.scrollY")) - starting_scroll_y)
            <= tolerance_px
            else False
        ),
        "Insights vertical scroll preserved after activity delete-confirm render",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    if abs(ending_scroll_y - starting_scroll_y) > tolerance_px:
        raise ValueError(
            "Insights vertical scroll moved after delete-confirm render: "
            f"before={starting_scroll_y}, after={ending_scroll_y}"
        )


def assert_trend_day_selection_scopes_details(
    page: Any,
    *,
    selected_date: str,
    expected_date_text: str,
    expected_activity_description: str,
    timeout_s: float = 10.0,
    interval_s: float = 0.2,
) -> None:
    day = page.locator(f'[data-trend-day="{selected_date}"]')
    day.click()
    wait_until(
        lambda: page.locator(f'[data-trend-day="{selected_date}"]').get_attribute(
            "data-selected"
        )
        == "true",
        f"selected trend day {selected_date}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    wait_for_text_in_locator(
        page,
        "#insights-selected-day",
        expected_date_text,
        description=f"selected day context for {selected_date}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    wait_for_text_in_locator(
        page,
        "#insights-activity-list",
        expected_activity_description,
        description=f"activity log scoped to {selected_date}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def assert_activity_data_issue_badge(
    page: Any,
    *,
    expected_activity_description: str,
    timeout_s: float = 10.0,
    interval_s: float = 0.2,
) -> None:
    def badge_text() -> str | bool:
        text = page.locator("#insights-activity-list").text_content() or ""
        return text if expected_activity_description in text and "Data issue" in text else False

    wait_until(
        badge_text,
        f"activity data issue badge for {expected_activity_description!r}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def assert_running_timer_id_reused_by_stopped_activity(
    running_config: dict[str, Any],
    stopped_activity_doc: dict[str, Any],
) -> None:
    running_activity_id = running_config.get("activityId")
    stopped_activity_id = normalize_doc(stopped_activity_doc).get("id")
    if not running_activity_id:
        raise ValueError(
            "Running timer config did not include an activityId.\n"
            f"{json.dumps(running_config, indent=2)}"
        )
    if stopped_activity_id != running_activity_id:
        raise ValueError(
            "Stopped timer activity did not reuse running timer activityId.\n"
            f"running={json.dumps(running_config, indent=2)}\n"
            f"stopped={json.dumps(stopped_activity_doc, indent=2)}"
        )


def assert_phase5_insights_view(
    page: Any,
    *,
    activity_description: str,
    running_timer_description: str,
    timeout_s: float = 15.0,
    interval_s: float = 0.2,
) -> None:
    page.locator("#insights-view").wait_for(state="visible", timeout=10000)
    wait_for_text_in_locator(
        page,
        "#insights-summary",
        "Planned",
        description="insights planned summary",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    wait_for_text_in_locator(
        page,
        "#insights-summary",
        "Actual",
        description="insights actual summary",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    wait_until(
        lambda: page.locator('#insights-timeline [data-timeline-block="planned"]').count() > 0,
        "insights planned timeline row",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    wait_until(
        lambda: page.locator('#insights-timeline [data-timeline-block="actual"]').count() > 0,
        "insights actual timeline row",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    wait_for_text_in_locator(
        page,
        "#insights-timeline",
        activity_description,
        description="insights completed activity timeline block",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    wait_for_text_in_locator(
        page,
        "#insights-timeline",
        running_timer_description,
        description="insights running timer timeline block",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )
    wait_for_text_in_locator(
        page,
        "#insights-activity-list",
        activity_description,
        description="insights activity log entry",
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


def add_unscheduled_task(
    page: Any,
    description: str,
    est_minutes: int,
    priority: str = "medium",
    category: str | None = None,
) -> None:
    cancel_open_confirm_modal(page)
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
    if category is not None:
        page.locator("#category-select").select_option(category)
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
            open_scheduled_task_actions_menu(page, task_id)
            button_locator.scroll_into_view_if_needed()
            button_locator.click()
            form_locator.wait_for(state="visible", timeout=form_timeout_ms)
            return form_selector
        except Exception as error:
            last_error = error
            if attempt < attempts - 1 and retry_delay_ms > 0:
                page.wait_for_timeout(retry_delay_ms)

    raise TimeoutError(f"Timed out opening scheduled edit form for {task_id}: {last_error}")


def open_scheduled_task_actions_menu(page: Any, task_id: str) -> None:
    task_selector = f'[data-task-id="{task_id}"]'
    menu = page.locator(f"{task_selector} .task-actions-menu").first
    if menu.is_visible():
        return
    trigger = page.locator(f"{task_selector} .btn-task-actions-menu").first
    trigger.scroll_into_view_if_needed()
    trigger.click()
    menu.wait_for(state="visible", timeout=5000)


def open_unscheduled_task_actions_menu(page: Any, task_id: str) -> None:
    task_selector = f'.task-card[data-task-id="{task_id}"]'

    def open_current_card_menu() -> bool:
        menu = page.locator(f"{task_selector} .unscheduled-task-actions-menu").first
        if menu.is_visible():
            return True
        trigger = page.locator(f"{task_selector} .btn-unscheduled-task-actions-menu").first
        trigger.click(timeout=500)
        return menu.is_visible()

    wait_until(
        open_current_card_menu,
        f"unscheduled task actions menu for {task_id}",
        timeout_s=5,
        interval_s=0.05,
    )


def get_unscheduled_delete_state(page: Any, task_id: str) -> str:
    return page.evaluate(
        """
        (taskId) => {
            const card = [...document.querySelectorAll('.task-card[data-task-id]')].find(
                (candidate) => candidate.dataset.taskId === taskId
            );
            if (!card) return 'deleted';

            const button = card.querySelector('.btn-delete-unscheduled');
            const icon = button?.querySelector('i');
            if (
                button?.classList.contains('text-rose-400') ||
                icon?.classList.contains('fa-check-circle')
            ) {
                return 'confirming';
            }
            return 'idle';
        }
        """,
        task_id,
    )


def delete_unscheduled_task_via_ui(
    page: Any, task_id: str, *, timeout_s: float = 10.0, interval_s: float = 0.2
) -> None:
    button_selector = f'.task-card[data-task-id="{task_id}"] .btn-delete-unscheduled'
    open_unscheduled_task_actions_menu(page, task_id)
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
    page.locator(
        f'.task-card[data-task-id="{task_id}"] .unscheduled-task-actions-menu'
    ).wait_for(state="visible", timeout=5000)
    open_unscheduled_task_actions_menu(page, task_id)
    page.locator(button_selector).click()
    wait_until(
        lambda: get_unscheduled_delete_state(page, task_id) == "deleted",
        f"unscheduled task deletion for {task_id}",
        timeout_s=timeout_s,
        interval_s=interval_s,
    )


def arm_unscheduled_delete_confirm(
    page: Any, task_id: str, *, timeout_s: float = 10.0, interval_s: float = 0.2
) -> None:
    button_selector = f'.task-card[data-task-id="{task_id}"] .btn-delete-unscheduled'
    open_unscheduled_task_actions_menu(page, task_id)
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
    page.locator(
        f'.task-card[data-task-id="{task_id}"] .unscheduled-task-actions-menu'
    ).wait_for(state="visible", timeout=5000)


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
    browser_captured_errors: list[dict[str, Any]] | None = None,
) -> None:
    filtered_console_errors, filtered_request_failures, filtered_response_errors = (
        filter_runtime_errors(console_errors, request_failures, response_errors)
    )
    if (
        filtered_console_errors
        or page_errors
        or filtered_request_failures
        or filtered_response_errors
        or browser_captured_errors
    ):
        raise ValueError(
            "Runtime errors detected.\n"
            f"Console errors: {json.dumps(filtered_console_errors[:10], indent=2)}\n"
            f"Page errors: {json.dumps(page_errors[:10], indent=2)}\n"
            f"Browser captured errors: {json.dumps((browser_captured_errors or [])[:10], indent=2)}\n"
            f"Request failures: {json.dumps(filtered_request_failures[:10], indent=2)}\n"
            f"Response errors: {json.dumps(filtered_response_errors[:10], indent=2)}"
        )


def save_failure_screenshot(page: Any) -> None:
    screenshot_dir = Path("test_screenshots")
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot_dir / "playwright_preview_smoke_failure.png"), full_page=True)


def format_demo_timestamp() -> str:
    return time.strftime("%H:%M:%S")


def demo_note(message: str) -> None:
    if not DEMO_LOGGING_ENABLED:
        return
    print(f"[demo {format_demo_timestamp()}] {message}")


def demo_step(page: Any, message: str, step_pause_ms: int) -> None:
    if step_pause_ms <= 0:
        return
    demo_note(message)
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



def launch_browser(playwright: Any):
    """Launch chromium; set E2E_BROWSER_CHANNEL=chrome to use system Chrome instead."""
    channel = os.environ.get("E2E_BROWSER_CHANNEL", "chromium")
    options: dict[str, Any] = {"headless": True}
    if channel != "chromium":
        options["channel"] = channel
    return playwright.chromium.launch(**options)

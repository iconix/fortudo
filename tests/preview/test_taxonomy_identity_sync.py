"""Preview acceptance for compatibility-era taxonomy and stable task identity."""

from __future__ import annotations

import os
import time
from urllib.parse import urlparse

import pytest
from playwright.sync_api import Page, sync_playwright

from scripts.e2e_helpers import (
    clear_room_storage,
    enter_room,
    launch_browser,
    read_docs,
    request_manual_sync,
    seed_docs,
    wait_until,
)
from scripts.preview_smoke.remote import (
    build_remote_db_name,
    delete_remote_database,
    fetch_preview_couchdb_url,
    fetch_remote_docs,
)

LEGACY_TASK_ID = "unsched-taxonomy-identity-legacy"
LEGACY_ACTIVITY_ID = "activity-taxonomy-identity-legacy"
COMMS_ID = "9c52c0e9-c389-54e1-927f-52c16b13de99"


def compatibility_seed() -> list[dict]:
    return [
        {
            "_id": "config-settings",
            "docType": "config",
            "activitiesEnabled": True,
            "onboardingDismissed": True,
        },
        {
            "_id": "config-categories",
            "docType": "config",
            "schemaVersion": "3.5",
            "groups": [
                {
                    "key": "work",
                    "label": "Work",
                    "colorFamily": "blue",
                    "color": "#0ea5e9",
                }
            ],
            "categories": [
                {
                    "key": "work/meetings",
                    "label": "Comms",
                    "groupKey": "work",
                    "color": "#38bdf8",
                    "isLinkedToGroupFamily": True,
                },
                {
                    "key": "work/comms",
                    "label": "Meetings",
                    "groupKey": "work",
                    "color": "#7dd3fc",
                    "isLinkedToGroupFamily": True,
                },
            ],
        },
        {
            "_id": LEGACY_TASK_ID,
            "docType": "task",
            "type": "unscheduled",
            "description": "Compatibility task",
            "status": "incomplete",
            "priority": "medium",
            "estDuration": 30,
            "category": "work/meetings",
        },
        {
            "_id": LEGACY_ACTIVITY_ID,
            "docType": "activity",
            "description": "Compatibility activity",
            "category": "work/comms",
            "startDateTime": "2026-07-21T13:00:00.000Z",
            "endDateTime": "2026-07-21T13:35:00.000Z",
            "duration": 35,
            "source": "manual",
            "sourceTaskId": None,
        },
    ]


def local_doc(page: Page, room_code: str, document_id: str) -> dict | None:
    return next(
        (document for document in read_docs(page, room_code) if document.get("_id") == document_id),
        None,
    )


def compatibility_state(page: Page) -> dict:
    return page.evaluate(
        """
        async () => {
            const selectors = await import('/js/taxonomy/taxonomy-selectors.js');
            const activityManager = await import('/js/activities/manager.js');
            const summary = await import('/js/activities/summary.js');
            const taskManager = await import('/js/tasks/manager.js');
            const model = summary.buildActivitySummaryModel(activityManager.getActivityState());
            return {
                commsLabel: selectors.getCategoryByKey('work/meetings')?.label,
                meetingsLabel: selectors.getCategoryByKey('work/comms')?.label,
                totalDuration: model.totalDuration,
                summaryLabels: model.summaryItems.map((item) => item.label),
                task: taskManager.getTaskState().find((task) =>
                    task.id === 'unsched-taxonomy-identity-legacy'
                ) ?? null
            };
        }
        """
    )


def schedule_legacy_task(page: Page) -> None:
    card = page.locator(f'.task-card[data-task-id="{LEGACY_TASK_ID}"]')
    card.locator(".btn-unscheduled-task-actions-menu").click()
    card.locator(".btn-schedule-task").click()
    modal = page.locator("#schedule-modal")
    modal.wait_for(state="visible", timeout=5000)
    modal.locator('input[name="modal-start-time"]').fill("12:00")
    modal.locator('input[name="modal-duration-hours"]').fill("0")
    modal.locator('input[name="modal-duration-minutes"]').fill("30")
    modal.locator('button[type="submit"]').click()
    modal.wait_for(state="hidden", timeout=5000)


def test_taxonomy_identity_compatibility_converges_across_two_preview_clients():
    preview_url = os.environ.get("FORTUDO_PREVIEW_URL")
    if not preview_url:
        pytest.skip("Set FORTUDO_PREVIEW_URL to run taxonomy identity preview acceptance")

    preview_url = preview_url.rstrip("/") + "/"
    hostname = urlparse(preview_url).hostname or ""
    couchdb_url = fetch_preview_couchdb_url(preview_url)
    if not couchdb_url:
        pytest.skip("Preview does not have remote CouchDB sync configured")

    room_code = f"taxonomy-identity-{int(time.time() * 1000)}"
    remote_db_name = build_remote_db_name(hostname, room_code)
    delete_remote_database(couchdb_url, remote_db_name)

    browser = None
    try:
        with sync_playwright() as playwright:
            browser = launch_browser(playwright)
            context_a = browser.new_context()
            context_b = browser.new_context()
            page_a = context_a.new_page()
            page_b = context_b.new_page()

            page_a.goto(preview_url, wait_until="load")
            page_a.evaluate("localStorage.clear()")
            clear_room_storage(page_a, room_code)
            seed_docs(page_a, room_code, compatibility_seed())
            enter_room(page_a, room_code)

            def remote_seed_ready():
                request_manual_sync(page_a)
                remote_ids = {
                    document.get("_id")
                    for document in fetch_remote_docs(couchdb_url, remote_db_name)
                }
                return {
                    "config-categories",
                    LEGACY_TASK_ID,
                    LEGACY_ACTIVITY_ID,
                }.issubset(remote_ids)

            wait_until(remote_seed_ready, "compatibility seed to reach preview Cloudant")

            page_b.goto(preview_url, wait_until="load")
            page_b.evaluate("localStorage.clear()")
            clear_room_storage(page_b, room_code)
            enter_room(page_b, room_code)

            def client_b_seed_ready():
                request_manual_sync(page_b)
                state = compatibility_state(page_b)
                return (
                    local_doc(page_b, room_code, LEGACY_ACTIVITY_ID) is not None
                    and state["task"] is not None
                    and state["totalDuration"] == 35
                )

            wait_until(client_b_seed_ready, "second client to pull compatibility seed")
            state_a = compatibility_state(page_a)
            state_b = compatibility_state(page_b)
            for state in (state_a, state_b):
                assert state["commsLabel"] == "Comms"
                assert state["meetingsLabel"] == "Meetings"
                assert state["totalDuration"] == 35
                assert "Work" in state["summaryLabels"]
                assert state["task"]["id"] == LEGACY_TASK_ID

            schedule_legacy_task(page_a)

            def stable_task_converged():
                request_manual_sync(page_a)
                request_manual_sync(page_b)
                task_a = local_doc(page_a, room_code, LEGACY_TASK_ID) or {}
                task_b = local_doc(page_b, room_code, LEGACY_TASK_ID) or {}
                state_a = compatibility_state(page_a)
                state_b = compatibility_state(page_b)
                return (
                    task_a.get("type") == "scheduled"
                    and task_b.get("type") == "scheduled"
                    and task_a.get("categoryId") == COMMS_ID
                    and task_b.get("categoryId") == COMMS_ID
                    and task_a.get("categoryIdentityVersion") == 1
                    and task_b.get("categoryIdentityVersion") == 1
                    and state_a["task"] is not None
                    and state_b["task"] is not None
                    and state_a["task"].get("type") == "scheduled"
                    and state_b["task"].get("type") == "scheduled"
                )

            wait_until(
                stable_task_converged,
                "stable legacy task identity and taxonomy repair on both clients",
                timeout_s=30,
            )
            assert compatibility_state(page_a)["task"]["id"] == LEGACY_TASK_ID
            assert compatibility_state(page_b)["task"]["id"] == LEGACY_TASK_ID
    finally:
        if browser is not None:
            browser.close()
        delete_remote_database(couchdb_url, remote_db_name)

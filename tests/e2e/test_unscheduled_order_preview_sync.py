"""Cloudant acceptance coverage for cross-client Unscheduled ordering conflicts."""

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
    wait_for_main_app,
    wait_until,
)
from scripts.preview_smoke.remote import (
    build_remote_db_name,
    delete_remote_database,
    fetch_preview_couchdb_url,
    fetch_remote_docs,
)

SEQUENCE_ID = "config-unscheduled-sequence"


def task_doc(task_id: str, description: str) -> dict:
    return {
        "_id": task_id,
        "docType": "task",
        "type": "unscheduled",
        "description": description,
        "status": "incomplete",
        "priority": "medium",
        "estDuration": 30,
    }


def sequence_doc(task_ids: list[str]) -> dict:
    return {
        "_id": SEQUENCE_ID,
        "docType": "config",
        "schemaVersion": 1,
        "orderedTaskIds": task_ids,
    }


def card_for(page: Page, task_id: str):
    return page.locator(f'.task-card[data-task-id="{task_id}"]').first


def visible_ids(page: Page) -> list[str]:
    return page.locator("#unscheduled-task-list .task-card").evaluate_all(
        "nodes => nodes.map((node) => node.dataset.taskId)"
    )


def local_doc(page: Page, room_code: str, doc_id: str) -> dict | None:
    return next((doc for doc in read_docs(page, room_code) if doc.get("_id") == doc_id), None)


def local_doc_with_conflicts(page: Page, room_code: str, doc_id: str) -> dict | None:
    return page.evaluate(
        """
        async ({ roomCode, docId }) => {
            const storageRoomCode = `preview-${roomCode}`;
            const db = new window.PouchDB(`fortudo-${storageRoomCode}`);
            try {
                return await db.get(docId, { conflicts: true });
            } catch (error) {
                if (error?.status === 404) return null;
                throw error;
            }
        }
        """,
        {"roomCode": room_code, "docId": doc_id},
    )


def move_to_top(page: Page, task_id: str) -> None:
    card = card_for(page, task_id)
    card.locator(".btn-unscheduled-task-actions-menu").click()
    card.locator('[data-move-kind="top"]').click()


def edit_description(page: Page, task_id: str, description: str) -> None:
    card = card_for(page, task_id)
    card.locator(".btn-unscheduled-task-actions-menu").click()
    card.locator(".btn-edit-unscheduled").click()
    card.locator('input[name="inline-edit-description"]').fill(description)
    card.locator(".btn-save-inline-edit").click()


def request_both_sync(page_a: Page, page_b: Page) -> None:
    request_manual_sync(page_a)
    request_manual_sync(page_b)


def test_two_client_sequence_sync_preserves_task_edits_and_cleans_order_conflicts():
    preview_url = os.environ.get("FORTUDO_PREVIEW_URL")
    if not preview_url:
        pytest.skip("Set FORTUDO_PREVIEW_URL to run Cloudant preview acceptance coverage")

    preview_url = preview_url.rstrip("/") + "/"
    hostname = urlparse(preview_url).hostname or ""
    couchdb_url = fetch_preview_couchdb_url(preview_url)
    if not couchdb_url:
        pytest.skip("Preview does not have remote CouchDB sync configured")

    room_code = f"order-sync-{int(time.time() * 1000)}"
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
            seed_docs(
                page_a,
                room_code,
                [
                    task_doc("task-alpha", "Alpha"),
                    task_doc("task-beta", "Beta"),
                    task_doc("task-gamma", "Gamma"),
                    sequence_doc(["task-alpha", "task-beta", "task-gamma"]),
                ],
            )
            enter_room(page_a, room_code)

            def initial_remote_ready():
                request_manual_sync(page_a)
                docs = fetch_remote_docs(couchdb_url, remote_db_name)
                return docs if len(docs) == 4 else False

            wait_until(initial_remote_ready, "initial preview documents to reach Cloudant")

            page_b.goto(preview_url, wait_until="load")
            page_b.evaluate("localStorage.clear()")
            clear_room_storage(page_b, room_code)
            enter_room(page_b, room_code)

            def client_b_ready():
                request_manual_sync(page_b)
                return (
                    local_doc(page_b, room_code, SEQUENCE_ID)
                    if len(read_docs(page_b, room_code)) == 4
                    else False
                )

            wait_until(client_b_ready, "second client to pull initial room state")
            wait_for_main_app(page_a)
            wait_for_main_app(page_b)
            page_a.get_by_role("button", name="My order", exact=True).click()
            page_b.get_by_role("button", name="My order", exact=True).click()

            context_a.set_offline(True)
            context_b.set_offline(True)
            move_to_top(page_a, "task-gamma")
            edit_description(page_b, "task-alpha", "Alpha edited on client B")
            wait_until(
                lambda: local_doc(page_a, room_code, SEQUENCE_ID).get("orderedTaskIds")
                == ["task-gamma", "task-alpha", "task-beta"],
                "offline reorder persistence",
            )
            wait_until(
                lambda: local_doc(page_b, room_code, "task-alpha").get("description")
                == "Alpha edited on client B",
                "offline task edit persistence",
            )

            context_a.set_offline(False)
            context_b.set_offline(False)

            def edit_and_order_converged():
                request_both_sync(page_a, page_b)
                docs = fetch_remote_docs(
                    couchdb_url, remote_db_name, include_conflicts=True
                )
                by_id = {doc.get("_id"): doc for doc in docs}
                task = by_id.get("task-alpha", {})
                sequence = by_id.get(SEQUENCE_ID, {})
                task_docs = [doc for doc in docs if doc.get("docType") == "task"]
                if (
                    task.get("description") == "Alpha edited on client B"
                    and sequence.get("orderedTaskIds")
                    == ["task-gamma", "task-alpha", "task-beta"]
                    and not any(doc.get("_conflicts") for doc in task_docs)
                ):
                    return by_id
                return False

            wait_until(
                edit_and_order_converged,
                "task edit and independent sequence write to converge without task conflicts",
                timeout_s=30,
            )
            wait_until(
                lambda: visible_ids(page_a)
                == ["task-gamma", "task-alpha", "task-beta"]
                and visible_ids(page_b) == ["task-gamma", "task-alpha", "task-beta"],
                "both clients to render the converged edit-vs-reorder result",
                timeout_s=30,
            )

            # Create two genuine sibling revisions of the sequence document.
            context_a.set_offline(True)
            context_b.set_offline(True)
            move_to_top(page_a, "task-alpha")
            move_to_top(page_b, "task-beta")
            wait_until(
                lambda: local_doc(page_a, room_code, SEQUENCE_ID).get("orderedTaskIds")
                == ["task-alpha", "task-gamma", "task-beta"],
                "client A concurrent order",
            )
            wait_until(
                lambda: local_doc(page_b, room_code, SEQUENCE_ID).get("orderedTaskIds")
                == ["task-beta", "task-gamma", "task-alpha"],
                "client B concurrent order",
            )
            context_a.set_offline(False)
            context_b.set_offline(False)

            valid_winners = {
                ("task-alpha", "task-gamma", "task-beta"),
                ("task-beta", "task-gamma", "task-alpha"),
            }

            def order_conflict_cleaned():
                request_both_sync(page_a, page_b)
                docs = fetch_remote_docs(
                    couchdb_url, remote_db_name, include_conflicts=True
                )
                sequence = next(
                    (doc for doc in docs if doc.get("_id") == SEQUENCE_ID), None
                )
                if (
                    sequence
                    and tuple(sequence.get("orderedTaskIds", [])) in valid_winners
                    and not sequence.get("_conflicts")
                ):
                    return sequence
                return False

            remote_sequence = wait_until(
                order_conflict_cleaned,
                "concurrent sequence revisions to resolve and clean up",
                timeout_s=45,
            )
            winning_ids = remote_sequence["orderedTaskIds"]

            wait_until(
                lambda: all(
                    local_doc_with_conflicts(page, room_code, SEQUENCE_ID).get(
                        "orderedTaskIds"
                    )
                    == winning_ids
                    and not local_doc_with_conflicts(page, room_code, SEQUENCE_ID).get(
                        "_conflicts"
                    )
                    for page in (page_a, page_b)
                ),
                "both clients to receive the conflict-free sequence winner",
                timeout_s=45,
            )
            wait_until(
                lambda: visible_ids(page_a) == winning_ids
                and visible_ids(page_b) == winning_ids,
                "both clients to render the conflict-free sequence winner",
                timeout_s=30,
            )
    finally:
        if browser is not None:
            browser.close()
        delete_remote_database(couchdb_url, remote_db_name)

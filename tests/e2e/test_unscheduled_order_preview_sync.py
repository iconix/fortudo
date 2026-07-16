"""Cloudant acceptance coverage for cross-client Unscheduled ordering conflicts."""

from __future__ import annotations

import os
import time
from urllib.parse import urlparse

import pytest
from playwright.sync_api import Page, sync_playwright

from scripts.e2e_helpers import (
    add_unscheduled_task,
    clear_room_storage,
    delete_unscheduled_task_via_ui,
    enter_room,
    launch_browser,
    read_docs,
    request_manual_sync,
    seed_docs,
    wait_for_task_doc,
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
        "acceptanceSentinel": f"preserve-{task_id}",
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


def manager_task_ids(page: Page) -> list[str]:
    return page.evaluate(
        """
        async () => {
            const manager = await import('/js/tasks/manager.js');
            return manager.getTaskState().map((task) => task.id);
        }
        """
    )


def move_to_top(page: Page, task_id: str) -> None:
    card = card_for(page, task_id)
    card.locator(".btn-unscheduled-task-actions-menu").click()
    menu = card.locator(".unscheduled-task-actions-menu")
    menu.wait_for(state="visible", timeout=5000)
    menu.locator('[data-move-kind="top"]').click()


def edit_description(page: Page, task_id: str, description: str) -> None:
    card = card_for(page, task_id)
    card.locator(".btn-unscheduled-task-actions-menu").click()
    card.locator(".btn-edit-unscheduled").click()
    card.locator('input[name="inline-edit-description"]').fill(description)
    card.locator(".btn-save-inline-edit").click()


def begin_inline_edit_draft(
    page: Page,
    task_id: str,
    draft: str,
    selection_start: int,
    selection_end: int,
) -> None:
    card = card_for(page, task_id)
    card.locator(".btn-unscheduled-task-actions-menu").click()
    card.locator(".btn-edit-unscheduled").click()
    description_input = card.locator('input[name="inline-edit-description"]')
    description_input.fill(draft)
    description_input.evaluate(
        """
        (input, selection) => {
            input.focus();
            input.setSelectionRange(selection.start, selection.end);
        }
        """,
        {"start": selection_start, "end": selection_end},
    )


def inline_edit_state(page: Page, task_id: str) -> dict:
    return page.evaluate(
        """
        (taskId) => {
            const card = [...document.querySelectorAll('.task-card[data-task-id]')].find(
                (candidate) => candidate.dataset.taskId === taskId
            );
            const editor = card?.querySelector('.inline-edit-unscheduled-form');
            const input = editor?.querySelector('input[name="inline-edit-description"]');
            return {
                visible: !!editor && !editor.classList.contains('hidden'),
                value: input?.value ?? null,
                focused: document.activeElement === input,
                selectionStart: input?.selectionStart ?? null,
                selectionEnd: input?.selectionEnd ?? null
            };
        }
        """,
        task_id,
    )


def trigger_background_sync(page: Page) -> None:
    page.evaluate(
        """
        async () => {
            const syncManager = await import('/js/sync-manager.js');
            await syncManager.triggerSync();
        }
        """
    )


def request_both_sync(page_a: Page, page_b: Page) -> None:
    request_manual_sync(page_a)
    request_manual_sync(page_b)


def wait_for_local_order(
    page: Page,
    room_code: str,
    expected: list[str],
    description: str,
) -> None:
    try:
        wait_until(
            lambda: local_doc(page, room_code, SEQUENCE_ID).get("orderedTaskIds")
            == expected,
            description,
        )
    except TimeoutError as error:
        sequence = local_doc(page, room_code, SEQUENCE_ID)
        raise AssertionError(
            f"Timed out waiting for {description}; sequence={sequence!r}, "
            f"visible={visible_ids(page)!r}"
        ) from error


def assert_clients_render_exact_task_set(
    page_a: Page,
    page_b: Page,
    expected_task_ids: set[str],
) -> list[str] | bool:
    order_a = visible_ids(page_a)
    order_b = visible_ids(page_b)
    if (
        order_a == order_b
        and len(order_a) == len(expected_task_ids)
        and set(order_a) == expected_task_ids
    ):
        return order_a
    return False


def wait_for_stable_client_task_set(
    page_a: Page,
    page_b: Page,
    expected_task_ids: set[str],
    description: str,
    *,
    stable_s: float = 0.75,
    timeout_s: float = 45,
) -> list[str]:
    stable_since: float | None = None

    def stable_task_set() -> list[str] | bool:
        nonlocal stable_since
        order = assert_clients_render_exact_task_set(page_a, page_b, expected_task_ids)
        if not order:
            stable_since = None
            return False
        if stable_since is None:
            stable_since = time.monotonic()
            return False
        return order if time.monotonic() - stable_since >= stable_s else False

    return wait_until(stable_task_set, description, timeout_s=timeout_s, interval_s=0.1)


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
            if os.environ.get("FORTUDO_E2E_BYPASS_CORS") == "1":
                launch_options = {
                    "headless": True,
                    "args": ["--disable-web-security"],
                }
                channel = os.environ.get("E2E_BROWSER_CHANNEL", "chromium")
                if channel != "chromium":
                    launch_options["channel"] = channel
                browser = playwright.chromium.launch(**launch_options)
            else:
                browser = launch_browser(playwright)
            context_a = browser.new_context()
            context_b = browser.new_context()
            page_a = context_a.new_page()
            page_b = context_b.new_page()
            sync_diagnostics: list[str] = []
            page_a.on(
                "console",
                lambda message: sync_diagnostics.append(f"console: {message.text}")
                if message.type == "error"
                else None,
            )
            page_a.on(
                "requestfailed",
                lambda request: sync_diagnostics.append(
                    f"request failed: {request.method} {request.url} {request.failure}"
                ),
            )
            page_a.on(
                "response",
                lambda response: sync_diagnostics.append(
                    f"response: {response.status} {response.request.method} {response.url}"
                )
                if response.status >= 400
                else None,
            )

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
            seeded_ids = {"task-alpha", "task-beta", "task-gamma", SEQUENCE_ID}

            def initial_remote_ready():
                request_manual_sync(page_a)
                docs = fetch_remote_docs(couchdb_url, remote_db_name)
                remote_ids = {doc.get("_id") for doc in docs}
                return docs if seeded_ids.issubset(remote_ids) else False

            try:
                wait_until(initial_remote_ready, "initial preview documents to reach Cloudant")
            except TimeoutError as error:
                sync_status = (
                    page_a.locator("#sync-status-text").text_content() or "missing"
                ).strip()
                raise AssertionError(
                    f"Initial Cloudant sync did not settle; status={sync_status!r}, "
                    f"diagnostics={sync_diagnostics[-20:]!r}"
                ) from error

            page_b.goto(preview_url, wait_until="load")
            page_b.evaluate("localStorage.clear()")
            clear_room_storage(page_b, room_code)
            enter_room(page_b, room_code)

            def client_b_ready():
                request_manual_sync(page_b)
                local_ids = {doc.get("_id") for doc in read_docs(page_b, room_code)}
                return (
                    local_doc(page_b, room_code, SEQUENCE_ID)
                    if seeded_ids.issubset(local_ids)
                    else False
                )

            wait_until(client_b_ready, "second client to pull initial room state")
            wait_for_main_app(page_a)
            wait_for_main_app(page_b)
            page_a.get_by_role("button", name="My order", exact=True).click()
            page_b.get_by_role("button", name="My order", exact=True).click()

            # Keep an active draft, focus, and caret intact while another client updates a task.
            draft_description = "Beta draft survives remote refresh"
            draft_selection = (5, 16)
            begin_inline_edit_draft(
                page_a,
                "task-beta",
                draft_description,
                *draft_selection,
            )
            remote_refresh_description = "Gamma changed on client B"
            edit_description(page_b, "task-gamma", remote_refresh_description)

            expected_draft_state = {
                "visible": True,
                "value": draft_description,
                "focused": True,
                "selectionStart": draft_selection[0],
                "selectionEnd": draft_selection[1],
            }

            def remote_edit_pulled_without_disturbing_draft():
                trigger_background_sync(page_b)
                trigger_background_sync(page_a)
                gamma = local_doc(page_a, room_code, "task-gamma") or {}
                return (
                    gamma.get("description") == remote_refresh_description
                    and inline_edit_state(page_a, "task-beta") == expected_draft_state
                )

            wait_until(
                remote_edit_pulled_without_disturbing_draft,
                "client A to preserve its focused inline draft through a remote task refresh",
                timeout_s=30,
            )
            card_for(page_a, "task-beta").locator(".btn-save-inline-edit").click()

            def saved_draft_converged():
                trigger_background_sync(page_a)
                trigger_background_sync(page_b)
                docs = fetch_remote_docs(couchdb_url, remote_db_name, include_conflicts=True)
                beta = next((doc for doc in docs if doc.get("_id") == "task-beta"), {})
                local_beta_b = local_doc(page_b, room_code, "task-beta") or {}
                return (
                    beta.get("description") == draft_description
                    and not beta.get("_conflicts")
                    and local_beta_b.get("description") == draft_description
                    and draft_description in (card_for(page_b, "task-beta").text_content() or "")
                )

            wait_until(
                saved_draft_converged,
                "the preserved inline draft to save and converge on both clients",
                timeout_s=30,
            )

            context_a.set_offline(True)
            context_b.set_offline(True)
            move_to_top(page_a, "task-gamma")
            edit_description(page_b, "task-alpha", "Alpha edited on client B")
            wait_for_local_order(
                page_a,
                room_code,
                ["task-gamma", "task-alpha", "task-beta"],
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
            wait_for_local_order(
                page_a,
                room_code,
                ["task-alpha", "task-gamma", "task-beta"],
                "client A concurrent order",
            )
            wait_for_local_order(
                page_b,
                room_code,
                ["task-beta", "task-gamma", "task-alpha"],
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

            # Add on one client while the other reorders the prior sequence.
            context_a.set_offline(True)
            context_b.set_offline(True)
            add_description = "Delta added on client A"
            add_unscheduled_task(page_a, add_description, 25)
            added_task = wait_for_task_doc(page_a, room_code, add_description)
            added_id = added_task["id"]
            wait_until(
                lambda: added_id
                in local_doc(page_a, room_code, SEQUENCE_ID).get("orderedTaskIds", []),
                "client A to place its added task in the sequence",
            )

            prior_order_b = visible_ids(page_b)
            reorder_id = prior_order_b[-1]
            move_to_top(page_b, reorder_id)
            wait_for_local_order(
                page_b,
                room_code,
                [reorder_id, *prior_order_b[:-1]],
                "client B reorder concurrent with client A add",
            )
            context_a.set_offline(False)
            context_b.set_offline(False)

            expected_after_add = {*winning_ids, added_id}

            def add_and_reorder_converged():
                request_both_sync(page_a, page_b)
                docs = fetch_remote_docs(
                    couchdb_url, remote_db_name, include_conflicts=True
                )
                task_docs = [doc for doc in docs if doc.get("docType") == "task"]
                sequence = next(
                    (doc for doc in docs if doc.get("_id") == SEQUENCE_ID), None
                )
                remote_task_ids = {doc.get("_id") for doc in task_docs}
                if (
                    remote_task_ids == expected_after_add
                    and sum(doc.get("description") == add_description for doc in task_docs)
                    == 1
                    and sequence
                    and not sequence.get("_conflicts")
                    and not any(doc.get("_conflicts") for doc in task_docs)
                ):
                    return docs
                return False

            added_remote_docs = wait_until(
                add_and_reorder_converged,
                "add and concurrent reorder to converge without task conflicts",
                timeout_s=45,
            )
            wait_for_stable_client_task_set(
                page_a,
                page_b,
                expected_after_add,
                "both clients to render every task exactly once after add versus reorder",
            )

            added_remote_tasks = {
                doc["_id"]: doc
                for doc in added_remote_docs
                if doc.get("docType") == "task"
            }
            assert added_remote_tasks["task-alpha"]["description"] == "Alpha edited on client B"
            for task_id in ("task-alpha", "task-beta", "task-gamma"):
                assert added_remote_tasks[task_id]["acceptanceSentinel"] == (
                    f"preserve-{task_id}"
                )
            assert all("manualOrder" not in task for task in added_remote_tasks.values())

            # Delete on one client while the other reorders a stale sequence containing that task.
            context_a.set_offline(True)
            context_b.set_offline(True)
            wait_for_stable_client_task_set(
                page_a,
                page_b,
                expected_after_add,
                "both clients to retain every task after entering offline mode",
                stable_s=1.0,
            )
            prior_delete_order = visible_ids(page_b)
            deleted_id = prior_delete_order[-1]
            offline_order_a = visible_ids(page_a)
            if deleted_id not in offline_order_a:
                local_ids_a = {
                    doc.get("_id")
                    for doc in read_docs(page_a, room_code)
                    if doc.get("docType") == "task"
                }
                raise AssertionError(
                    "Client A lost the delete target while going offline; "
                    f"target={deleted_id!r}, visible_a={offline_order_a!r}, "
                    f"visible_b={prior_delete_order!r}, local_task_ids_a={local_ids_a!r}"
                )
            try:
                delete_unscheduled_task_via_ui(page_a, deleted_id)
            except TimeoutError as error:
                local_ids_a = [
                    doc.get("_id")
                    for doc in read_docs(page_a, room_code)
                    if doc.get("docType") == "task"
                ]
                local_ids_b = [
                    doc.get("_id")
                    for doc in read_docs(page_b, room_code)
                    if doc.get("docType") == "task"
                ]
                remote_ids = [
                    doc.get("_id")
                    for doc in fetch_remote_docs(
                        couchdb_url, remote_db_name, include_conflicts=True
                    )
                    if doc.get("docType") == "task"
                ]
                raise AssertionError(
                    "Client A could not open the delete target after entering offline mode; "
                    f"target={deleted_id!r}, visible_a={visible_ids(page_a)!r}, "
                    f"manager_ids_a={manager_task_ids(page_a)!r}, "
                    f"local_task_ids_a={local_ids_a!r}, visible_b={visible_ids(page_b)!r}, "
                    f"manager_ids_b={manager_task_ids(page_b)!r}, "
                    f"local_task_ids_b={local_ids_b!r}, remote_task_ids={remote_ids!r}"
                ) from error
            wait_until(
                lambda: local_doc(page_a, room_code, deleted_id) is None,
                "client A offline task deletion",
            )
            move_to_top(page_b, deleted_id)
            wait_for_local_order(
                page_b,
                room_code,
                [deleted_id, *prior_delete_order[:-1]],
                "client B reorder containing the concurrently deleted task",
            )
            context_a.set_offline(False)
            context_b.set_offline(False)

            expected_after_delete = expected_after_add - {deleted_id}

            def delete_and_reorder_converged():
                request_both_sync(page_a, page_b)
                docs = fetch_remote_docs(
                    couchdb_url, remote_db_name, include_conflicts=True
                )
                task_docs = [doc for doc in docs if doc.get("docType") == "task"]
                sequence = next(
                    (doc for doc in docs if doc.get("_id") == SEQUENCE_ID), None
                )
                if (
                    {doc.get("_id") for doc in task_docs} == expected_after_delete
                    and sequence
                    and not sequence.get("_conflicts")
                    and not any(doc.get("_conflicts") for doc in task_docs)
                ):
                    return docs
                return False

            deleted_remote_docs = wait_until(
                delete_and_reorder_converged,
                "delete and stale reorder to converge without resurrection",
                timeout_s=45,
            )
            wait_until(
                lambda: assert_clients_render_exact_task_set(
                    page_a, page_b, expected_after_delete
                ),
                "both clients to omit the deleted task and render every survivor once",
                timeout_s=45,
            )
            assert all(doc.get("_id") != deleted_id for doc in deleted_remote_docs)
            for page in (page_a, page_b):
                local_sequence = local_doc_with_conflicts(page, room_code, SEQUENCE_ID)
                assert local_sequence and not local_sequence.get("_conflicts")
    finally:
        try:
            if browser is not None and browser.is_connected():
                browser.close()
        except Exception:
            pass
        finally:
            delete_remote_database(couchdb_url, remote_db_name)

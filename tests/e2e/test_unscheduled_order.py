"""Observable acceptance coverage for manually ordering Unscheduled tasks."""

from __future__ import annotations

from playwright.sync_api import Page, sync_playwright

from scripts.e2e_helpers import read_docs, wait_for_main_app, wait_until
from tests.e2e.helpers import BASE_URL, launch_seeded_page

ROOM_CODE = "unscheduled-manual-order"


def unscheduled_task(
    task_id: str,
    description: str,
    priority: str,
    est_duration: int,
) -> dict:
    """Build a persisted Unscheduled task document for the acceptance room."""
    return {
        "_id": task_id,
        "docType": "task",
        "description": description,
        "status": "incomplete",
        "editing": False,
        "confirmingDelete": False,
        "type": "unscheduled",
        "category": None,
        "priority": priority,
        "estDuration": est_duration,
    }


def card_for(page: Page, description: str):
    """Find the rendered task card with an exact visible task name."""
    return page.locator(
        f'#unscheduled-task-list .task-card[data-task-name="{description}"]'
    ).first


def task_order(page: Page) -> list[str]:
    """Read the visible Unscheduled order from rendered task cards."""
    return page.locator("#unscheduled-task-list .task-card").evaluate_all(
        "nodes => nodes.map((node) => node.dataset.taskName)"
    )


def wait_for_order(page: Page, expected: list[str]) -> None:
    try:
        wait_until(
            lambda: task_order(page) == expected,
            f"visible Unscheduled order {expected!r}",
        )
    except TimeoutError as error:
        raise AssertionError(
            f"Expected visible Unscheduled order {expected!r}; observed {task_order(page)!r}"
        ) from error


def persisted_manual_order(page: Page) -> list[str] | None:
    """Return the durable manual order once every Unscheduled task has a rank."""
    tasks = [
        doc
        for doc in read_docs(page, ROOM_CODE)
        if doc.get("docType") == "task" and doc.get("type") == "unscheduled"
    ]
    if not tasks or any(not isinstance(task.get("manualOrder"), (int, float)) for task in tasks):
        return None
    return [task["description"] for task in sorted(tasks, key=lambda task: task["manualOrder"])]


def wait_for_persisted_order(page: Page, expected: list[str]) -> None:
    wait_until(
        lambda: persisted_manual_order(page) == expected,
        f"persisted Unscheduled order {expected!r}",
    )


def move_menu_item(page: Page, description: str, kind: str) -> None:
    """Move a task with its visible action-menu command."""
    card = card_for(page, description)
    card.locator(".btn-unscheduled-task-actions-menu").click()
    menu = card.locator(".unscheduled-task-actions-menu")
    menu.wait_for(state="visible", timeout=5000)
    menu.locator(f'[data-move-kind="{kind}"]').click()


def complete_unscheduled_task(page: Page, description: str) -> None:
    """Complete a task and wait for its visible checked treatment."""
    card_for(page, description).locator(".task-checkbox-unscheduled").click()
    wait_until(
        lambda: card_for(page, description).locator(".fa-check-square").count() == 1,
        f"checked state for {description!r}",
    )


def add_new_unscheduled_task(page: Page, description: str, est_minutes: int) -> None:
    """Add an Unscheduled task through the visible form controls."""
    page.locator("#unscheduled").locator("..").click()
    page.locator('#task-form input[name="description"]').fill(description)
    page.locator('input[name="priority"][value="high"]').locator("..").click()
    page.locator('#task-form input[name="est-duration-hours"]').fill(str(est_minutes // 60))
    page.locator('#task-form input[name="est-duration-minutes"]').fill(str(est_minutes % 60))
    page.locator('#task-form button[type="submit"]').click()


def drag_task_before(page: Page, source_description: str, target_description: str) -> None:
    """Use the real pointer handle to place one task immediately before another."""
    source_handle = card_for(page, source_description).locator(".unscheduled-drag-handle")
    target_card = card_for(page, target_description)
    source_handle.evaluate("node => node.scrollIntoView({ block: 'center' })")
    source_box = source_handle.bounding_box()
    target_box = target_card.bounding_box()
    assert source_box is not None, f"Missing drag handle bounds for {source_description}"
    assert target_box is not None, f"Missing task-card bounds for {target_description}"

    source_x = source_box["x"] + source_box["width"] / 2
    source_y = source_box["y"] + source_box["height"] / 2
    target_x = target_box["x"] + target_box["width"] / 2
    target_y = target_box["y"] + 1
    page.mouse.move(source_x, source_y)
    page.mouse.down()
    page.mouse.move(source_x, source_y + 8, steps=2)
    page.mouse.move(target_x, target_y, steps=8)
    page.mouse.up()


def test_unscheduled_manual_order_is_flexible_durable_and_shared():
    seeded_tasks = [
        unscheduled_task("unsched-drop-off", "Drop off", "medium", 30),
        unscheduled_task("unsched-interview", "Interview prep", "high", 60),
        unscheduled_task("unsched-dinner", "Dinner", "low", 45),
        unscheduled_task("unsched-read", "Read", "medium", 15),
    ]
    initial_priority_order = ["Interview prep", "Read", "Drop off", "Dinner"]
    saved_manual_order = ["Read", "Interview prep", "Drop off", "Dinner"]

    with sync_playwright() as playwright:
        browser, context, page = launch_seeded_page(playwright, ROOM_CODE, seeded_tasks)
        try:
            wait_for_order(page, initial_priority_order)
            assert (
                page.locator('[data-unscheduled-mode="priority"]').get_attribute("aria-pressed")
                == "true"
            )

            page.get_by_role("button", name="My order", exact=True).click()
            move_menu_item(page, "Read", "top")
            wait_for_order(page, saved_manual_order)
            wait_for_persisted_order(page, saved_manual_order)

            page.reload(wait_until="load")
            wait_for_main_app(page)
            wait_for_order(page, saved_manual_order)
            assert (
                page.locator('[data-unscheduled-mode="manual"]').get_attribute("aria-pressed")
                == "true"
            )

            page.get_by_role("button", name="Priority", exact=True).click()
            wait_for_order(page, initial_priority_order)
            page.get_by_role("button", name="My order", exact=True).click()
            wait_for_order(page, saved_manual_order)

            complete_unscheduled_task(page, "Interview prep")
            wait_for_order(page, saved_manual_order)
            assert "line-through" in (
                card_for(page, "Interview prep")
                .locator(".task-checkbox-unscheduled + div > .font-medium")
                .get_attribute("class")
                or ""
            )

            add_new_unscheduled_task(page, "New task", 20)
            with_new_task = [*saved_manual_order, "New task"]
            wait_for_order(page, with_new_task)
            wait_for_persisted_order(page, with_new_task)

            drag_task_before(page, "Dinner", "Drop off")
            dragged_order = ["Read", "Interview prep", "Dinner", "Drop off", "New task"]
            wait_for_order(page, dragged_order)
            wait_for_persisted_order(page, dragged_order)
            assert card_for(page, "Dinner").get_attribute("data-task-id") == "unsched-dinner"
            assert card_for(page, "Drop off").get_attribute("data-task-id") == "unsched-drop-off"

            second_page = context.new_page()
            second_page.goto(BASE_URL, wait_until="load")
            wait_for_main_app(second_page)
            wait_for_order(second_page, dragged_order)
            assert (
                second_page.locator('[data-unscheduled-mode="manual"]').get_attribute(
                    "aria-pressed"
                )
                == "true"
            )
            assert card_for(second_page, "Interview prep").locator(".fa-check-square").count() == 1
        finally:
            browser.close()

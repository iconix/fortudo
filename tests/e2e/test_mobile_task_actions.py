"""Mobile regressions for task action menus."""

from __future__ import annotations

from datetime import datetime, time, timedelta

from playwright.sync_api import expect, sync_playwright

from tests.e2e.helpers import launch_e2e_page, seed_and_enter_room


def build_today_scheduled_task() -> dict:
    """Return an incomplete scheduled task on the browser host's local day."""
    now = datetime.now().astimezone()
    start = datetime.combine(now.date(), time(9, 0), tzinfo=now.tzinfo)
    end = start + timedelta(minutes=30)
    return {
        "_id": "mobile-delete-task",
        "id": "mobile-delete-task",
        "docType": "task",
        "type": "scheduled",
        "description": "Delete me on mobile",
        "startDateTime": start.isoformat(),
        "endDateTime": end.isoformat(),
        "duration": 30,
        "status": "incomplete",
        "locked": False,
        "priority": "medium",
    }


def build_unscheduled_task() -> dict:
    """Return an incomplete unscheduled task."""
    return {
        "_id": "mobile-delete-unscheduled-task",
        "id": "mobile-delete-unscheduled-task",
        "docType": "task",
        "type": "unscheduled",
        "description": "Delete unscheduled on mobile",
        "estDuration": 30,
        "priority": "medium",
        "status": "incomplete",
    }


def test_mobile_task_delete_confirmation_is_tappable(app_server):
    """Mobile task menus open a stable modal before deleting either task type."""
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright,
            viewport={"width": 375, "height": 812},
            context_options={"has_touch": True, "is_mobile": True},
        )

        try:
            seed_and_enter_room(
                page,
                "mobile-delete-actions",
                [build_today_scheduled_task(), build_unscheduled_task()],
            )

            task = page.locator('[data-task-id="mobile-delete-task"]')
            task.locator(".btn-task-actions-menu").tap()
            expect(task.locator(".task-actions-menu")).to_be_visible()

            task.locator(".btn-delete").tap()
            confirmation = page.locator("#custom-confirm-modal")
            expect(confirmation).to_be_visible()
            expect(page.locator("#custom-confirm-message")).to_contain_text(
                'Delete "Delete me on mobile"?'
            )

            page.locator("#ok-custom-confirm-modal").tap()
            expect(task).to_have_count(0)

            unscheduled_task = page.locator(
                '[data-task-id="mobile-delete-unscheduled-task"]'
            )
            unscheduled_task.locator(".btn-unscheduled-task-actions-menu").tap()
            expect(unscheduled_task.locator(".unscheduled-task-actions-menu")).to_be_visible()

            unscheduled_task.locator(".btn-delete-unscheduled").tap()
            expect(confirmation).to_be_visible()
            expect(page.locator("#custom-confirm-message")).to_contain_text(
                'Delete "Delete unscheduled on mobile"?'
            )

            page.locator("#ok-custom-confirm-modal").tap()
            expect(unscheduled_task).to_have_count(0)
        finally:
            context.close()
            browser.close()

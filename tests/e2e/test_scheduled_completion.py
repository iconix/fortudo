from playwright.sync_api import expect, sync_playwright

from scripts.e2e_helpers import add_scheduled_task, wait_for_task_doc
from tests.e2e.helpers import launch_e2e_page, seed_and_enter_room


def test_only_the_first_incomplete_task_can_be_completed(app_server):
    room = "scheduled-completion"
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright, context_options={"timezone_id": "UTC"})
        try:
            page.clock.set_fixed_time("2025-05-21T08:00:00Z")
            seed_and_enter_room(page, room)
            add_scheduled_task(page, "First", "09:00", 30)
            add_scheduled_task(page, "Second", "09:30", 30)
            first = page.get_by_role("checkbox", name="Complete First", exact=True)
            second = page.get_by_role("checkbox", name="Complete Second", exact=True)
            second.click(force=True)
            assert wait_for_task_doc(page, room, "Second")["status"] == "incomplete"
            expect(second).to_be_disabled()
            first.focus()
            expect(first).to_be_focused()
            page.keyboard.press("Space")
            expect(first).to_be_checked()
            expect(first).to_be_disabled()
            assert wait_for_task_doc(page, room, "First")["status"] == "completed"
            expect(second).to_be_enabled()
            second.click()
            expect(second).to_be_checked()
            assert wait_for_task_doc(page, room, "Second")["status"] == "completed"
        finally:
            context.close()
            browser.close()

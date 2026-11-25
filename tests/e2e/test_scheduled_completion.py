from playwright.sync_api import expect, sync_playwright

from scripts.e2e_helpers import build_relative_day_scheduled_task_doc, wait_for_task_doc
from tests.e2e.helpers import launch_e2e_page, seed_and_enter_room


def test_only_the_first_incomplete_task_can_be_completed(app_server):
    room = "scheduled-completion"
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright, context_options={"timezone_id": "UTC"})
        try:
            page.clock.set_fixed_time("2025-05-21T08:00:00Z")
            tasks = [
                build_relative_day_scheduled_task_doc(
                    page,
                    doc_id=f"task-{name.lower()}",
                    description=name,
                    day_offset=0,
                    start_hour=9,
                    start_minute=minute,
                    duration_minutes=30,
                )
                for name, minute in [("First", 0), ("Second", 30)]
            ]
            seed_and_enter_room(page, room, tasks)
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

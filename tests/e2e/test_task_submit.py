import pytest
from playwright.sync_api import expect, sync_playwright

from scripts.e2e_helpers import read_docs, wait_for_task_doc
from tests.e2e.helpers import launch_seeded_page


@pytest.mark.parametrize("submit_field", ["start-time", "duration-hours"])
def test_enter_validates_duration_before_saving(app_server, submit_field):
    room = "keyboard-submit"
    with sync_playwright() as playwright:
        browser, context, page = launch_seeded_page(playwright, room)
        try:
            form = page.locator("#task-form")
            form.locator('[name="description"]').fill("Keyboard task")
            form.locator('[name="start-time"]').fill("09:00")
            minutes = form.locator('[name="duration-minutes"]')
            minutes.fill("1.5")
            field = form.locator(f'[name="{submit_field}"]')
            field.press("Enter")
            expect(minutes).to_be_focused()
            assert all(doc.get("description") != "Keyboard task" for doc in read_docs(page, room))

            minutes.fill("15")
            field.press("Enter")
            task = wait_for_task_doc(page, room, "Keyboard task")
            assert task["duration"] == 15
            expect(page.locator("#scheduled-task-list").get_by_text("Keyboard task", exact=True)).to_have_count(1)
        finally:
            context.close()
            browser.close()

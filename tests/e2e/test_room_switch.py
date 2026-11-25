from playwright.sync_api import expect, sync_playwright

from tests.e2e.helpers import launch_seeded_page


def test_clear_menu_opens_after_switching_rooms(app_server):
    with sync_playwright() as playwright:
        browser, context, page = launch_seeded_page(playwright, "first-room")
        try:
            page.locator("#room-code-badge").click()
            page.locator("#room-code-input").fill("second-room")
            page.locator('#room-entry-form button[type="submit"]').click()
            expect(page.locator("#room-code-display")).to_have_text("second-room")
            expect(page.locator("#add-task-btn")).to_have_attribute("aria-disabled", "false")
            page.locator("#clear-options-dropdown-trigger-btn").click()
            expect(page.locator("#clear-all-tasks-option")).to_be_visible()
            page.locator("#clear-options-dropdown-trigger-btn").click()
            expect(page.locator("#clear-all-tasks-option")).to_be_hidden()
        finally:
            context.close()
            browser.close()

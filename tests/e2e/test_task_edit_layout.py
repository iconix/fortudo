"""Regression coverage for inline task controls overflowing their cards."""

import pytest
from playwright.sync_api import expect, sync_playwright

from tests.e2e.helpers import launch_e2e_page, seed_and_enter_room
from tests.e2e.test_mobile_task_actions import build_today_scheduled_task, build_unscheduled_task


@pytest.mark.parametrize("width", [320, 640, 1280])
@pytest.mark.parametrize("task_type", ["scheduled", "unscheduled"])
def test_inline_task_edit_controls_fit_and_save(app_server, width, task_type):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, viewport={"width": width, "height": 900},
            context_options={"service_workers": "block"},
        )
        try:
            page.route(
                "**/js/config.js",
                lambda route: route.fulfill(
                    content_type="application/javascript", body="export const COUCHDB_URL = null;"
                ),
            )
            if task_type == "scheduled":
                task = build_today_scheduled_task()
                edit_selector = ".btn-edit"
            else:
                task = build_unscheduled_task()
                edit_selector = ".btn-edit-unscheduled"

            seed_and_enter_room(page, "task-edit-layout", [task])
            task_id = task["id"]
            card = page.locator(f'[data-task-id="{task_id}"]').first
            card.locator('button[aria-haspopup="menu"]').click()
            card.locator(edit_selector).click()
            form = page.locator(
                f'form[id="edit-task-{task_id}"], .task-card[data-task-id="{task_id}"] form'
            )
            expect(form).to_be_visible()
            page.evaluate("document.fonts.ready")
            save = form.locator(".btn-save-edit, .btn-save-inline-edit")
            cancel = form.locator(".btn-edit-cancel, .btn-cancel-inline-edit")
            assert form.evaluate("node => node.scrollWidth <= node.clientWidth")
            for button in [cancel, save]:
                assert button.evaluate("""button => {
                    const label = document.createRange();
                    label.selectNodeContents(button.lastChild);
                    return label.getClientRects().length === 1;
                }""")

            description = f"{task_type} edit saved"
            form.locator('input[type="text"]').fill(description)
            save.click()
            expect(form).to_be_hidden()
            expect(card.locator(".task-description")).to_have_text(description)
        finally:
            context.close()
            browser.close()

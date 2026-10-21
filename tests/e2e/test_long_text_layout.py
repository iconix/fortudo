"""Long user text wraps in task cards and repair review without horizontal scrolling."""

import pytest
from playwright.sync_api import expect, sync_playwright

from tests.e2e.helpers import REPO_ROOT, launch_e2e_page, seed_and_enter_room
from tests.e2e.test_mobile_task_actions import build_today_scheduled_task, build_unscheduled_task


@pytest.mark.parametrize("width", [320, 390, 1280])
def test_long_user_text_wraps_in_tasks_and_repair(app_server, width):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, viewport={"width": width, "height": 900},
            context_options={"service_workers": "block"},
        )
        try:
            page.route("**/js/config.js", lambda route: route.fulfill(
                content_type="application/javascript", body="export const COUCHDB_URL = null;"
            ))
            url = "https://example.com/" + "a" * 150
            identifier = "TaskIdentifier" + "b" * 150
            seed_and_enter_room(page, "long-text", [
                {**build_today_scheduled_task(), "description": url},
                {**build_unscheduled_task(), "description": identifier},
            ])
            cards = [
                page.locator('[data-task-id="mobile-delete-task"]'),
                page.locator('.task-card[data-task-id="mobile-delete-unscheduled-task"]'),
            ]
            for card, text in zip(cards, [url, identifier], strict=True):
                expect(card.locator(".task-description")).to_have_text(text)
                assert card.evaluate("node => node.scrollWidth <= node.clientWidth")
                rect = card.bounding_box()
                assert rect["x"] >= 0 and rect["x"] + rect["width"] <= width
                actions = card.locator('button[aria-haspopup="menu"]').last
                actions.scroll_into_view_if_needed()
                expect(actions).to_be_in_viewport(ratio=1)
            screenshots = REPO_ROOT / "test_screenshots"
            screenshots.mkdir(exist_ok=True)
            page.screenshot(path=str(screenshots / f"long-task-text-{width}.png"), full_page=True)

            # Exercise the actual repair renderer; the session isolates this layout test
            # from recovery persistence and never alters the seeded tasks.
            page.evaluate("""async ({url, identifier}) => {
                const {initializeRecoveryUI} = await import('/js/recovery-ui.js');
                const entry = {key:'long@1', id:'long', local:{description:url},
                    current:{description:identifier}, proposed:{_id:'long',description:url},
                    warnings:[identifier]};
                const ui = initializeRecoveryUI({signal:new AbortController().signal,
                    notify:()=>{}, openSession:async()=>({archiveId:'recovery-layout',
                        list:async()=>[], close:()=>{}, service:{review:async()=>[entry],
                            load:async()=>({decisions:{}})}})});
                await ui.open();
            }""", {"url": url, "identifier": identifier})
            dialog = page.get_by_role("dialog")
            expect(dialog.get_by_role("heading", name=url, exact=True)).to_be_visible()
            assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth")
            for text in dialog.locator("h3, section > p, .recovery-comparison p").all():
                assert text.evaluate("node => node.scrollWidth <= node.clientWidth")
            page.screenshot(path=str(screenshots / f"long-repair-text-{width}.png"))
            dialog.get_by_text("Edit description", exact=True).click()
            expect(dialog.get_by_role("textbox", name="Saved description: long", exact=True)).to_have_value(url)
            dialog.get_by_text("Troubleshooting details", exact=True).click()
            assert url in dialog.get_by_role("textbox", name="Record to restore: long", exact=True).input_value()
            assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth")
            assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
        finally:
            context.close()
            browser.close()

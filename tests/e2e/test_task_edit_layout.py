"""Regression coverage for responsive inline task editors."""

from datetime import datetime, timedelta

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

            docs = [task]
            if task_type == "scheduled" and width == 640:
                next_start = datetime.fromisoformat(task["endDateTime"]) + timedelta(minutes=15)
                docs.append({
                    **task, "_id": "next-task", "id": "next-task", "description": "Next task",
                    "startDateTime": next_start.isoformat(),
                    "endDateTime": (next_start + timedelta(minutes=30)).isoformat(),
                })
            seed_and_enter_room(page, "task-edit-layout", docs)
            task_id = task["id"]
            card = page.locator(f'[data-task-id="{task_id}"]').first
            left_border = """node => {
                const style = getComputedStyle(node);
                return [style.borderLeftWidth, style.borderLeftColor];
            }"""
            view_border = card.evaluate(left_border)
            menu_trigger = card.locator('button[aria-haspopup="menu"]')
            menu_trigger.click()
            card.locator(edit_selector).click()
            form = page.locator(
                f'form[id="edit-task-{task_id}"], .task-card[data-task-id="{task_id}"] form'
            )
            expect(form).to_be_visible()
            editor_card = form if task_type == "scheduled" else card
            assert editor_card.evaluate(left_border) == view_border
            assert editor_card.evaluate("node => getComputedStyle(node).borderTopWidth") == "1px"
            page.evaluate("document.fonts.ready")
            save = form.locator(".btn-save-edit, .btn-save-inline-edit")
            cancel = form.locator(".btn-edit-cancel, .btn-cancel-inline-edit")
            description_field = form.locator('input[type="text"]')
            category = form.locator("select")
            expect(description_field).to_be_focused()
            expect(form.get_by_role("combobox", name="Category")).to_be_visible()
            controls = form.locator("input:not([type=hidden], [type=radio]), select, button")
            for control in controls.all():
                assert abs(control.bounding_box()["height"] - 44) <= 0.1
            for field in form.locator("input:not([type=hidden], [type=radio]), select").all():
                assert field.evaluate("node => getComputedStyle(node).borderTop") == (
                    "1px solid rgb(71, 85, 105)"
                )
            assert form.evaluate("node => node.scrollWidth <= node.clientWidth")
            description_box = description_field.bounding_box()
            category_box = category.bounding_box()
            border_top = editor_card.evaluate(
                "node => parseFloat(getComputedStyle(node).borderTopWidth)"
            )
            top_inset = description_box["y"] - editor_card.bounding_box()["y"] - border_top
            assert abs(top_inset - 12) <= 1
            assert editor_card.evaluate("node => getComputedStyle(node).padding") == "12px"
            if width < 640:
                assert description_box["y"] + description_box["height"] <= category_box["y"]
            else:
                assert description_box["x"] + description_box["width"] <= category_box["x"]
                assert abs(description_box["y"] - category_box["y"]) <= 3
            for button in [cancel, save]:
                assert button.evaluate("""button => {
                    const label = document.createRange();
                    label.selectNodeContents(button.lastChild);
                    return label.getClientRects().length === 1;
                }""")

            if task_type == "scheduled" and width == 640:
                warning = form.locator(".edit-overlap-warning")
                expect(warning).to_have_attribute("role", "status")
                expect(warning).to_be_empty()
                assert warning.evaluate("node => getComputedStyle(node).position") == "absolute"
                action_position = save.bounding_box()["y"] - form.bounding_box()["y"]
                hours = form.locator('[name="duration-hours"]')
                hours.fill("1")
                expect(save).to_contain_text("Reschedule")
                expect(form.locator(".edit-overlap-warning")).to_be_visible()
                assert abs(save.bounding_box()["y"] - form.bounding_box()["y"] - action_position) <= 1
                assert form.evaluate("node => node.scrollWidth <= node.clientWidth")
                hours.fill("0")
                expect(save).to_contain_text("Save")

            if width == 640:
                minutes = form.locator('input[name$="duration-minutes"]')
                minutes.evaluate("""field => field.addEventListener(
                    'invalid', () => { field.dataset.rejected = 'true'; }
                )""")
                original_minutes = minutes.input_value()
                minutes.fill("60")
                for action in [save.click, lambda: minutes.press("Enter")]:
                    minutes.evaluate("field => delete field.dataset.rejected")
                    action()
                    expect(minutes).to_have_attribute("data-rejected", "true")
                    expect(page.locator("#custom-alert-modal")).to_be_hidden()
                minutes.fill(original_minutes)

            if task_type == "unscheduled":
                description_field.press("Tab")
                expect(category).to_be_focused()
                category.press("Tab")
                medium = form.locator('input[value="medium"]')
                expect(medium).to_be_focused()
                medium.press("ArrowLeft")
                expect(form.locator('input[value="high"]')).to_be_checked()
                priorities = form.locator(".task-edit-priority-option")
                priority_boxes = [option.bounding_box() for option in priorities.all()]
                heights = [box["height"] for box in priority_boxes]
                assert max(heights) - min(heights) <= 0.1
                for option in priorities.all():
                    icon = option.locator("i").bounding_box()
                    label = option.locator("span").bounding_box()
                    assert icon["x"] + icon["width"] <= label["x"]
                    assert abs(icon["y"] + icon["height"] / 2 - label["y"] - label["height"] / 2) <= 1
                if width == 1280:
                    # The desktop card is 640 CSS px, matching the reported 800 px card at 125%.
                    assert card.bounding_box()["width"] == 640
                if width >= 640:
                    for wider_labels in ([False, True] if width == 640 else [False]):
                        if wider_labels:
                            # Exercise wider system-font metrics at the breakpoint.
                            page.add_style_tag(content="""
                                .task-card .inline-editor-actions button {
                                    transition: none;
                                    letter-spacing: 0.125em;
                                }
                            """)
                        priority = priorities.last.bounding_box()
                        duration = form.locator(".task-edit-duration-hours").bounding_box()
                        buttons = save.bounding_box()
                        assert priority["x"] < duration["x"] < buttons["x"]
                        assert abs(priority["y"] - buttons["y"]) < 8
                        assert abs(duration["y"] - buttons["y"]) < 8
                        assert form.evaluate("node => node.scrollWidth <= node.clientWidth")

            description = f'{task_type} "quoted" edit & notes'
            description_field.fill(description)
            category.select_option("work/admin")
            description_field.press("Enter")
            expect(form).to_be_hidden()
            expect(menu_trigger).to_be_focused()
            expect(card.locator(".task-description")).to_have_text(description)
            expect(card.locator(".category-badge")).to_have_text("Admin")
            if task_type == "unscheduled":
                expect(card.locator(".priority-badge")).to_contain_text("High Priority")
            menu_trigger.click()
            card.locator(edit_selector).click()
            expect(description_field).to_have_value(description)
            cancel.press("Enter")
            expect(form).to_be_hidden()
            expect(menu_trigger).to_be_focused()
        finally:
            context.close()
            browser.close()

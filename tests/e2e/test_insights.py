"""Insights timeline and selected-day E2E checks."""

from __future__ import annotations

import pytest
from playwright.sync_api import sync_playwright

from tests.e2e.helpers import (
    BASE_URL,
    activities_config,
    format_browser_long_date,
    launch_e2e_page,
    seed_and_enter_room,
)
from scripts.e2e_helpers import (
    assert_trend_day_selection_scopes_details,
    build_relative_day_activity_doc,
    build_relative_day_scheduled_task_doc,
    clear_room_storage,
    dismiss_open_modals,
    enter_room,
    seed_docs,
    wait_for_main_app,
)

ROOM_CODE = "insights-mobile"


@pytest.mark.parametrize("viewport_width", [375, 768])
def test_mobile_insights_has_no_horizontal_overflow(app_server, viewport_width: int):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright,
            viewport={"width": viewport_width, "height": 812},
        )

        try:
            page.goto(BASE_URL, wait_until="load")
            page.evaluate("localStorage.clear()")
            clear_room_storage(page, ROOM_CODE)
            seed_docs(
                page,
                ROOM_CODE,
                [
                    {
                        **activities_config(),
                    },
                    build_relative_day_scheduled_task_doc(
                        page,
                        doc_id="insights-mobile-task",
                        description="Mobile planning block",
                        day_offset=0,
                        start_hour=9,
                        start_minute=0,
                        duration_minutes=45,
                    ),
                    build_relative_day_activity_doc(
                        page,
                        doc_id="insights-mobile-activity",
                        description="Mobile actual block",
                        day_offset=0,
                        start_hour=9,
                        start_minute=15,
                        duration_minutes=35,
                    ),
                ],
            )

            enter_room(page, ROOM_CODE)
            wait_for_main_app(page)
            dismiss_open_modals(page)
            page.locator("#view-toggle-insights").click()
            page.locator("#insights-timeline").wait_for(state="visible", timeout=10000)

            has_horizontal_overflow = page.evaluate(
                "document.documentElement.scrollWidth > document.documentElement.clientWidth"
            )

            assert has_horizontal_overflow is False
        finally:
            context.close()
            browser.close()


def test_insights_selected_day_scopes_details(app_server):
    room_code = "insights-selected-day-scope"
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright,
            viewport={"width": 1280, "height": 900},
        )

        try:
            # Doc builders evaluate date math in the browser, so load the page first.
            page.goto(BASE_URL, wait_until="load")
            today_activity = build_relative_day_activity_doc(
                page,
                doc_id="insights-today-activity",
                description="Insights today actual",
                day_offset=0,
                start_hour=9,
                start_minute=0,
                duration_minutes=30,
            )
            prior_activity = build_relative_day_activity_doc(
                page,
                doc_id="insights-prior-activity",
                description="Insights prior actual",
                day_offset=-1,
                start_hour=10,
                start_minute=0,
                duration_minutes=45,
            )
            today_task = build_relative_day_scheduled_task_doc(
                page,
                doc_id="insights-today-task",
                description="Insights today plan",
                day_offset=0,
                start_hour=8,
                start_minute=30,
                duration_minutes=30,
            )
            prior_task = build_relative_day_scheduled_task_doc(
                page,
                doc_id="insights-prior-task",
                description="Insights prior plan",
                day_offset=-1,
                start_hour=9,
                start_minute=30,
                duration_minutes=30,
            )

            seed_and_enter_room(
                page,
                room_code,
                [activities_config(), today_task, prior_task, today_activity, prior_activity],
            )

            page.locator("#view-toggle-insights").click()
            page.locator("#insights-view").wait_for(state="visible", timeout=10000)

            assert_trend_day_selection_scopes_details(
                page,
                selected_date=prior_activity["localDate"],
                expected_date_text=format_browser_long_date(page, prior_activity["localDate"]),
                expected_activity_description="Insights prior actual",
            )
            assert "Insights today actual" not in (
                page.locator("#insights-activity-list").text_content() or ""
            )
        finally:
            context.close()
            browser.close()

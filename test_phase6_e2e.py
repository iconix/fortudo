"""Phase 6 E2E checks for mobile Insights behavior."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent / "scripts"))
from playwright_preview_smoke import (  # noqa: E402
    build_relative_day_activity_doc,
    build_relative_day_scheduled_task_doc,
    clear_room_storage,
    dismiss_open_modals,
    enter_room,
    install_local_pouchdb_route,
    seed_docs,
    wait_for_main_app,
)

BASE_URL = "http://127.0.0.1:9847"
ROOM_CODE = "phase6-mobile"


@pytest.mark.parametrize("viewport_width", [375, 768])
def test_mobile_insights_has_no_horizontal_overflow(viewport_width: int):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": viewport_width, "height": 812})
        install_local_pouchdb_route(context, repo_root=Path(__file__).parent)
        page = context.new_page()

        try:
            page.goto(BASE_URL, wait_until="load")
            page.evaluate("localStorage.clear()")
            clear_room_storage(page, ROOM_CODE)
            seed_docs(
                page,
                ROOM_CODE,
                [
                    {
                        "_id": "config-settings",
                        "id": "config-settings",
                        "docType": "config",
                        "activitiesEnabled": True,
                    },
                    build_relative_day_scheduled_task_doc(
                        page,
                        doc_id="phase6-mobile-task",
                        description="Mobile planning block",
                        day_offset=0,
                        start_hour=9,
                        start_minute=0,
                        duration_minutes=45,
                    ),
                    build_relative_day_activity_doc(
                        page,
                        doc_id="phase6-mobile-activity",
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

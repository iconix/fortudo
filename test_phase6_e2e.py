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
    open_scheduled_edit_form,
    read_docs,
    seed_docs,
    wait_until,
    wait_for_main_app,
)

BASE_URL = "http://127.0.0.1:9847"
ROOM_CODE = "phase6-mobile"


def get_onboarding_target(page):
    return page.evaluate(
        """
        () => {
            const target = document.querySelector('.activity-onboarding-highlight');
            return target
                ? {
                    id: target.id,
                    text: target.textContent.trim(),
                    hidden: target.classList.contains('hidden')
                }
                : null;
        }
        """
    )


def assert_onboarding_step(page, expected_title: str, expected_target_id: str):
    onboarding = page.locator("[data-activity-onboarding]")
    onboarding.wait_for(state="visible", timeout=10000)
    assert expected_title in onboarding.inner_text()
    assert get_onboarding_target(page) == {
        "id": expected_target_id,
        "text": page.locator(f"#{expected_target_id}").inner_text().strip(),
        "hidden": False,
    }


def test_activities_onboarding_prepares_ui_and_persists_dismissal():
    room_code = "phase6-onboarding-sequence"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 390, "height": 844})
        install_local_pouchdb_route(context, repo_root=Path(__file__).parent)
        page = context.new_page()

        try:
            page.goto(BASE_URL, wait_until="load")
            page.evaluate("localStorage.clear()")
            clear_room_storage(page, room_code)
            seed_docs(
                page,
                room_code,
                [
                    {
                        "_id": "config-settings",
                        "id": "config-settings",
                        "docType": "config",
                        "activitiesEnabled": True,
                        "onboardingDismissed": False,
                    },
                ],
            )

            enter_room(page, room_code)
            wait_for_main_app(page)
            page.locator("#custom-alert-modal").wait_for(state="hidden", timeout=10000)

            assert_onboarding_step(page, "Activity mode", "activity-toggle-option")
            assert page.locator("#activity").is_checked()
            assert not page.locator("#start-timer-btn").evaluate(
                "(node) => node.classList.contains('hidden')"
            )

            page.locator("[data-activity-onboarding-next]").click()
            assert_onboarding_step(page, "Live timer", "start-timer-btn")
            assert page.locator("#activity").is_checked()
            assert not page.locator("#activity-toggle-option").evaluate(
                "(node) => node.classList.contains('activity-onboarding-highlight')"
            )

            page.locator("[data-activity-onboarding-next]").click()
            assert_onboarding_step(page, "Insights", "view-toggle-insights")
            assert page.locator("#view-toggle-insights").get_attribute("aria-pressed") == "true"
            assert not page.locator("#start-timer-btn").evaluate(
                "(node) => node.classList.contains('activity-onboarding-highlight')"
            )

            page.locator("[data-activity-onboarding-next]").click()
            page.locator("[data-activity-onboarding]").wait_for(state="detached", timeout=10000)

            settings_config = wait_until(
                lambda: next(
                    (
                        doc
                        for doc in read_docs(page, room_code)
                        if (doc.get("id") or doc.get("_id")) == "config-settings"
                        and doc.get("onboardingDismissed") is True
                    ),
                    False,
                ),
                "onboarding dismissed config persistence",
            )
            assert settings_config["onboardingDismissed"] is True
        finally:
            context.close()
            browser.close()


# TODO: Add a flag-enabled what's-new E2E flow when the announcement flag ships
# or when the app has an intentional test-only feature-flag hook. Unit coverage
# currently verifies the structured modal content while this suite covers the
# onboarding sequence that follows Activities enablement.


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
                        "onboardingDismissed": True,
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


def test_mobile_scheduled_edit_draft_survives_delayed_ui_refresh():
    room_code = "phase6-mobile-edit-draft"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 375, "height": 812})
        install_local_pouchdb_route(context, repo_root=Path(__file__).parent)
        page = context.new_page()

        try:
            page.goto(BASE_URL, wait_until="load")
            page.evaluate("localStorage.clear()")
            clear_room_storage(page, room_code)
            seed_docs(
                page,
                room_code,
                [
                    {
                        "_id": "config-settings",
                        "id": "config-settings",
                        "docType": "config",
                        "activitiesEnabled": True,
                        "onboardingDismissed": True,
                    },
                    build_relative_day_scheduled_task_doc(
                        page,
                        doc_id="phase6-edit-draft-task",
                        description="Draft preservation task",
                        day_offset=0,
                        start_hour=9,
                        start_minute=0,
                        duration_minutes=30,
                    ),
                ],
            )

            enter_room(page, room_code)
            wait_for_main_app(page)
            dismiss_open_modals(page)

            edit_form = open_scheduled_edit_form(page, "phase6-edit-draft-task")
            duration_minutes = page.locator(f'{edit_form} input[name="duration-minutes"]')
            duration_minutes.fill("45")

            page.evaluate("import('/js/dom-renderer.js').then(({ refreshUI }) => refreshUI())")
            page.wait_for_timeout(500)

            assert duration_minutes.input_value() == "45"
        finally:
            context.close()
            browser.close()

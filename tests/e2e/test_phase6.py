"""Phase 6 E2E checks for mobile and persistence polish."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent / "scripts"))
from playwright_preview_smoke import (  # noqa: E402
    assert_trend_day_selection_scopes_details,
    build_relative_day_activity_doc,
    build_relative_day_scheduled_task_doc,
    clear_room_storage,
    dismiss_open_modals,
    enter_room,
    force_activity_mode,
    open_settings_modal,
    install_local_pouchdb_route,
    open_scheduled_edit_form,
    read_docs,
    seed_docs,
    start_activity_timer,
    wait_for_running_activity_config,
    wait_for_running_timer_ui,
    wait_until,
    wait_for_main_app,
)

BASE_URL = "http://127.0.0.1:9847"
ROOM_CODE = "phase6-mobile"
BROWSER_CHANNEL = os.environ.get("E2E_BROWSER_CHANNEL", "chromium")


def launch_browser(playwright):
    """Launch chromium; set E2E_BROWSER_CHANNEL=chrome to use system Chrome instead."""
    options = {"headless": True}
    if BROWSER_CHANNEL != "chromium":
        options["channel"] = BROWSER_CHANNEL
    return playwright.chromium.launch(**options)


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
        browser = launch_browser(playwright)
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


def seed_and_enter_room(page, room_code: str, docs: list[dict] | None = None) -> None:
    page.goto(BASE_URL, wait_until="load")
    page.evaluate("localStorage.clear()")
    clear_room_storage(page, room_code)
    seed_docs(page, room_code, docs or [])
    enter_room(page, room_code)
    wait_for_main_app(page)
    dismiss_open_modals(page)


def launch_seeded_page(playwright, room_code: str, docs: list[dict] | None = None):
    browser = launch_browser(playwright)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    install_local_pouchdb_route(context, repo_root=Path(__file__).parent)
    page = context.new_page()
    seed_and_enter_room(page, room_code, docs)

    return browser, context, page


def activities_config(*, enabled: bool = True, onboarding_dismissed: bool = True) -> dict:
    return {
        "_id": "config-settings",
        "id": "config-settings",
        "docType": "config",
        "activitiesEnabled": enabled,
        "onboardingDismissed": onboarding_dismissed,
    }


def format_browser_long_date(page, date_value: str) -> str:
    return page.evaluate(
        """
        (dateValue) => new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        })
        """,
        date_value,
    )


@pytest.mark.parametrize("viewport_width", [375, 768])
def test_mobile_insights_has_no_horizontal_overflow(viewport_width: int):
    with sync_playwright() as playwright:
        browser = launch_browser(playwright)
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
                        **activities_config(),
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
        browser = launch_browser(playwright)
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


def test_running_timer_restores_after_reload():
    room_code = "phase6-timer-restore"
    with sync_playwright() as playwright:
        browser, context, page = launch_seeded_page(
            playwright,
            room_code,
            [activities_config()],
        )

        try:
            start_activity_timer(page, "Phase 6 reload timer", room_code=room_code)
            running_config = wait_for_running_activity_config(
                page,
                room_code,
                expected_description="Phase 6 reload timer",
            )
            assert running_config.get("activityId")

            page.reload(wait_until="load")
            wait_for_main_app(page)
            dismiss_open_modals(page)

            wait_for_running_timer_ui(page, "Phase 6 reload timer")
            restored_config = wait_for_running_activity_config(
                page,
                room_code,
                expected_description="Phase 6 reload timer",
            )
            assert restored_config.get("activityId") == running_config.get("activityId")
        finally:
            context.close()
            browser.close()


def test_settings_activities_toggle_persists_across_reload():
    room_code = "phase6-settings-persist"
    with sync_playwright() as playwright:
        browser, context, page = launch_seeded_page(
            playwright,
            room_code,
            [activities_config(enabled=False)],
        )

        try:
            assert page.locator("#activity-toggle-option").is_hidden()

            open_settings_modal(page)
            page.locator("label:has(#activities-toggle)").click()
            page.locator("#reload-apply-btn").click()

            wait_for_main_app(page)
            dismiss_open_modals(page)

            page.locator("#activity-toggle-option").wait_for(state="visible", timeout=10000)
            force_activity_mode(page)
            page.locator("#start-timer-btn").wait_for(state="visible", timeout=10000)
        finally:
            context.close()
            browser.close()


def test_insights_selected_day_scopes_details():
    room_code = "phase6-insights-scope"
    with sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        install_local_pouchdb_route(context, repo_root=Path(__file__).parent)
        page = context.new_page()

        try:
            # Doc builders evaluate date math in the browser, so load the page first.
            page.goto(BASE_URL, wait_until="load")
            today_activity = build_relative_day_activity_doc(
                page,
                doc_id="phase6-today-activity",
                description="Phase 6 today actual",
                day_offset=0,
                start_hour=9,
                start_minute=0,
                duration_minutes=30,
            )
            prior_activity = build_relative_day_activity_doc(
                page,
                doc_id="phase6-prior-activity",
                description="Phase 6 prior actual",
                day_offset=-1,
                start_hour=10,
                start_minute=0,
                duration_minutes=45,
            )
            today_task = build_relative_day_scheduled_task_doc(
                page,
                doc_id="phase6-today-task",
                description="Phase 6 today plan",
                day_offset=0,
                start_hour=8,
                start_minute=30,
                duration_minutes=30,
            )
            prior_task = build_relative_day_scheduled_task_doc(
                page,
                doc_id="phase6-prior-task",
                description="Phase 6 prior plan",
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
                expected_activity_description="Phase 6 prior actual",
            )
            assert "Phase 6 today actual" not in (
                page.locator("#insights-activity-list").text_content() or ""
            )
        finally:
            context.close()
            browser.close()

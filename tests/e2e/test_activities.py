"""Activities onboarding and persistence E2E checks."""

from __future__ import annotations

from playwright.sync_api import sync_playwright

from scripts.e2e_helpers import (
    clear_room_storage,
    dismiss_open_modals,
    enter_room,
    force_activity_mode,
    install_local_pouchdb_route,
    launch_browser,
    open_settings_modal,
    read_docs,
    seed_docs,
    start_activity_timer,
    wait_for_main_app,
    wait_for_running_activity_config,
    wait_for_running_timer_ui,
    wait_until,
)
from tests.e2e.helpers import BASE_URL, REPO_ROOT, activities_config, launch_seeded_page


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
    room_code = "activities-onboarding-sequence"

    with sync_playwright() as playwright:
        browser = launch_browser(playwright)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        install_local_pouchdb_route(context, repo_root=REPO_ROOT)
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


def test_running_timer_restores_after_reload():
    room_code = "activities-timer-restore"
    with sync_playwright() as playwright:
        browser, context, page = launch_seeded_page(
            playwright,
            room_code,
            [activities_config()],
        )

        try:
            start_activity_timer(page, "Activities reload timer", room_code=room_code)
            running_config = wait_for_running_activity_config(
                page,
                room_code,
                expected_description="Activities reload timer",
            )
            assert running_config.get("activityId")

            page.reload(wait_until="load")
            wait_for_main_app(page)
            dismiss_open_modals(page)

            wait_for_running_timer_ui(page, "Activities reload timer")
            restored_config = wait_for_running_activity_config(
                page,
                room_code,
                expected_description="Activities reload timer",
            )
            assert restored_config.get("activityId") == running_config.get("activityId")
        finally:
            context.close()
            browser.close()


def test_settings_activities_toggle_persists_across_reload():
    room_code = "activities-settings-persist"
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

"""Activities onboarding and persistence E2E checks."""

from __future__ import annotations

from playwright.sync_api import sync_playwright

from scripts.e2e_helpers import (
    build_relative_day_activity_doc,
    clear_room_storage,
    dismiss_open_modals,
    enter_room,
    force_activity_mode,
    open_settings_modal,
    read_docs,
    seed_docs,
    start_activity_timer,
    wait_for_main_app,
    wait_for_running_activity_config,
    wait_for_running_timer_ui,
    wait_until,
)
from tests.e2e.helpers import (
    BASE_URL,
    activities_config,
    launch_e2e_page,
    launch_seeded_page,
    seed_and_enter_room,
)

LIVE_OVERLAP_TEST_TIME = "2026-08-19T12:00:00Z"


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


def build_live_overlap_docs(page):
    return page.evaluate(
        """
        () => {
            const now = new Date();
            const savedStart = new Date(now.getTime() - 60 * 60000);
            const savedEnd = new Date(now.getTime() - 10 * 60000);
            const runningStart = new Date(now.getTime() - 30 * 60000);

            return [
                {
                    _id: 'live-overlap-saved',
                    id: 'live-overlap-saved',
                    docType: 'activity',
                    description: 'Saved overlapping timer',
                    category: null,
                    source: 'timer',
                    sourceTaskId: null,
                    startDateTime: savedStart.toISOString(),
                    endDateTime: savedEnd.toISOString(),
                    duration: 50,
                },
                {
                    _id: 'config-running-activity',
                    id: 'config-running-activity',
                    docType: 'config',
                    activityId: 'live-overlap-running',
                    description: 'Current overlapping timer',
                    category: null,
                    source: 'timer',
                    sourceTaskId: null,
                    startDateTime: runningStart.toISOString(),
                },
            ];
        }
        """
    )


def test_activities_onboarding_prepares_ui_and_persists_dismissal(app_server):
    room_code = "activities-onboarding-sequence"

    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright,
            viewport={"width": 390, "height": 844},
        )

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


def test_running_timer_restores_after_reload(app_server):
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


def test_timer_category_color_dots_follow_current_and_next_activity(app_server):
    room_code = "activities-timer-category-dots"
    with sync_playwright() as playwright:
        browser, context, page = launch_seeded_page(
            playwright,
            room_code,
            [activities_config()],
        )

        try:
            start_activity_timer(
                page,
                "Categorized timer",
                category="work/deep",
                room_code=room_code,
            )

            current_dot_color = page.locator(
                "#timer-category-color-indicator"
            ).evaluate("(node) => getComputedStyle(node).backgroundColor")
            main_form_dot_color = page.locator("#category-color-indicator").evaluate(
                "(node) => getComputedStyle(node).backgroundColor"
            )
            assert current_dot_color == main_form_dot_color

            next_dot = page.locator("#next-activity-category-color-indicator")
            default_next_color = next_dot.evaluate(
                "(node) => getComputedStyle(node).backgroundColor"
            )
            page.locator("#next-activity-category").select_option("work/admin")
            selected_next_color = next_dot.evaluate(
                "(node) => getComputedStyle(node).backgroundColor"
            )

            assert selected_next_color != default_next_color
        finally:
            context.close()
            browser.close()


def test_running_timer_elapsed_advances_with_stale_server_date_header(app_server):
    room_code = "activities-timer-stale-server-date"
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright)

        def serve_stale_date_header(route):
            if route.request.method == "HEAD":
                route.fulfill(
                    status=200,
                    headers={"Date": "Thu, 01 Jan 1970 00:00:00 GMT"},
                )
                return
            route.continue_()

        page.route("**/*", serve_stale_date_header)

        try:
            seed_and_enter_room(page, room_code, [activities_config()])
            start_activity_timer(page, "Advancing elapsed timer", room_code=room_code)
            wait_for_running_timer_ui(page, "Advancing elapsed timer")

            initial_elapsed = page.locator("#timer-elapsed").inner_text()
            wait_until(
                lambda: page.locator("#timer-elapsed").inner_text() != initial_elapsed,
                "elapsed timer to advance despite a stale server date header",
                timeout_s=3.0,
                interval_s=0.1,
            )
        finally:
            context.close()
            browser.close()


def test_settings_activities_toggle_persists_across_reload(app_server):
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


def test_today_activities_surface_overlapping_data_issues(app_server):
    room_code = "activities-today-data-warning"
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright)

        try:
            page.goto(BASE_URL, wait_until="load")
            first_activity = build_relative_day_activity_doc(
                page,
                doc_id="today-overlap-first",
                description="Today overlap first",
                day_offset=0,
                start_hour=9,
                start_minute=0,
                duration_minutes=60,
            )
            second_activity = build_relative_day_activity_doc(
                page,
                doc_id="today-overlap-second",
                description="Today overlap second",
                day_offset=0,
                start_hour=9,
                start_minute=30,
                duration_minutes=60,
            )

            seed_and_enter_room(
                page,
                room_code,
                [activities_config(), first_activity, second_activity],
            )

            issue_rows = page.locator(
                "#activity-list .activity-item:has([data-activity-data-issue])"
            )
            issue_rows.first.wait_for(state="visible", timeout=10000)

            assert issue_rows.count() == 2
            assert "Data issue" in issue_rows.first.inner_text()
            assert "Overlapping activity" in issue_rows.first.inner_text()
        finally:
            context.close()
            browser.close()


def test_live_overlap_repairs_saved_activity_while_current_timer_keeps_running(app_server):
    room_code = "activities-today-live-overlap"
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright)

        try:
            page.clock.set_fixed_time(LIVE_OVERLAP_TEST_TIME)
            page.goto(BASE_URL, wait_until="load")
            docs = [activities_config(), *build_live_overlap_docs(page)]
            seed_and_enter_room(page, room_code, docs)

            saved_row = page.locator(
                '#activity-list .activity-item[data-activity-id="live-overlap-saved"]'
            )
            live_issue = saved_row.locator("[data-activity-live-overlap]")
            live_issue.wait_for(state="visible", timeout=10000)

            assert "Live overlap" in live_issue.inner_text()
            assert "Overlaps current timer" in live_issue.inner_text()
            assert "Repair available after the timer stops" not in live_issue.inner_text()
            assert saved_row.locator("[data-activity-data-issue]").count() == 0
            repair_action = page.locator(
                "#activity-list [data-truncate-activity-overlaps]"
            )
            repair_action.wait_for(state="visible", timeout=10000)

            repair_action.click()
            confirm_modal = page.locator("#custom-confirm-modal")
            confirm_modal.wait_for(state="visible", timeout=10000)
            assert "Review overlap fixes" in page.locator("#custom-confirm-title").inner_text()
            preview_text = page.locator("#custom-confirm-message").inner_text()
            assert "Saved overlapping timer" in preview_text
            assert "Current timer" in preview_text
            assert "Protected" in preview_text
            assert "Current overlapping timer" in preview_text
            assert "ends at current timer start" in preview_text
            assert "will keep running and will not change" in preview_text
            page.locator("#ok-custom-confirm-modal").click()

            confirm_modal.wait_for(state="hidden", timeout=10000)
            page.locator(
                '#activity-list .activity-item[data-activity-id="live-overlap-saved"] '
                "[data-activity-live-overlap]"
            ).wait_for(state="detached", timeout=10000)
            assert page.locator(
                "#activity-list [data-truncate-activity-overlaps]"
            ).count() == 0
            assert page.locator("#timer-stop-btn").is_visible()

            persisted_docs = read_docs(page, room_code)
            saved_doc = next(
                doc for doc in persisted_docs if doc.get("_id") == "live-overlap-saved"
            )
            running_doc = next(
                doc for doc in persisted_docs if doc.get("_id") == "config-running-activity"
            )
            assert saved_doc["endDateTime"] == running_doc["startDateTime"]
            assert running_doc["activityId"] == "live-overlap-running"
        finally:
            context.close()
            browser.close()


def test_editing_running_timer_start_refreshes_today_live_overlap_without_reload(app_server):
    room_code = "activities-today-live-overlap-edit"
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright)

        try:
            page.clock.set_fixed_time(LIVE_OVERLAP_TEST_TIME)
            page.goto(BASE_URL, wait_until="load")
            live_docs = build_live_overlap_docs(page)
            live_docs[1]["startDateTime"] = page.evaluate(
                "new Date(Date.now() - 5 * 60000).toISOString()"
            )
            seed_and_enter_room(page, room_code, [activities_config(), *live_docs])

            saved_row = page.locator(
                '#activity-list .activity-item[data-activity-id="live-overlap-saved"]'
            )
            live_issue = saved_row.locator("[data-activity-live-overlap]")
            assert live_issue.count() == 0

            overlapping_start_time = page.evaluate(
                """
                () => {
                    const date = new Date(Date.now() - 30 * 60000);
                    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                }
                """
            )
            page.locator("#timer-start-time").fill(overlapping_start_time)
            page.locator("#timer-start-time").press("Tab")

            live_issue.wait_for(state="visible", timeout=10000)
            assert "Overlaps current timer" in live_issue.inner_text()
        finally:
            context.close()
            browser.close()

"""Headed Playwright smoke for preview deployments of Fortudo."""

from __future__ import annotations

import json
from typing import Any

from scripts.e2e_helpers import *  # noqa: F403
from scripts.preview_smoke.cli import build_launch_options, parse_cli_args
from scripts.preview_smoke.remote import (
    build_remote_db_name,
    fetch_preview_couchdb_url,
    fetch_remote_docs,
    reset_remote_preview_rooms,
)
from scripts.preview_smoke.scenarios import (
    create_run_scoped_prefix,
    create_scenario_rooms,
    run_activities_room_scenario,
)


def run_smoke(
    preview_url: str,
    *,
    demo: bool = False,
    headless: bool = False,
    keep_open: bool = False,
    channel: str = "chrome",
    slow_mo_ms: int = 0,
    step_pause_ms: int = 0,
) -> bool:
    from playwright.sync_api import sync_playwright

    configure_demo_logging(enabled=demo and not headless)
    hostname = get_hostname_from_url(preview_url)
    rooms = create_scenario_rooms(create_run_scoped_prefix(hostname))
    couchdb_url = fetch_preview_couchdb_url(preview_url)

    if is_preview_host(hostname) and couchdb_url:
        reset_remote_preview_rooms(preview_url, hostname, rooms)

    console_errors: list[str] = []
    page_errors: list[dict[str, Any]] = []
    request_failures: list[str] = []
    response_errors: list[tuple[int, str, str]] = []

    with sync_playwright() as playwright:
        launch_options = build_launch_options(
            headless=headless,
            channel=channel,
            slow_mo_ms=slow_mo_ms,
        )
        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(viewport={"width": 1440, "height": 960})
        install_local_pouchdb_route(context)
        context.add_init_script(
            """
            window.__fortudoSmokeBrowserErrors = [];
            const captureBrowserError = (payload) => {
                window.__fortudoSmokeBrowserErrors.push(payload);
            };
            window.addEventListener('error', (event) => {
                captureBrowserError({
                    type: 'error',
                    message: String(event.message || ''),
                    source: String(event.filename || ''),
                    line: Number(event.lineno || 0),
                    column: Number(event.colno || 0),
                    error: event.error ? String(event.error) : '',
                    stack: event.error && event.error.stack ? String(event.error.stack) : '',
                });
            });
            window.addEventListener('unhandledrejection', (event) => {
                const reason = event.reason;
                captureBrowserError({
                    type: 'unhandledrejection',
                    message: reason ? String(reason) : '',
                    stack: reason && reason.stack ? String(reason.stack) : '',
                });
            });
            """
        )
        page = context.new_page()

        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on(
            "pageerror",
            lambda error: page_errors.append(
                {
                    "type": type(error).__name__,
                    "str": str(error),
                    "repr": repr(error),
                    "args": list(getattr(error, "args", [])),
                    "name": getattr(error, "name", ""),
                    "message": getattr(error, "message", ""),
                    "stack": getattr(error, "stack", ""),
                }
            ),
        )
        page.on(
            "requestfailed",
            lambda request: request_failures.append(
                f"{request.method} {request.url} {request.failure}"
            ),
        )
        page.on(
            "response",
            lambda response: response_errors.append(
                (response.status, response.request.method, response.url)
            )
            if response.status >= 400
            else None,
        )

        try:
            def assert_no_page_errors_yet(label: str) -> None:
                if page_errors:
                    raise ValueError(
                        f"Page errors surfaced by {label}.\n{json.dumps(page_errors, indent=2)}"
                    )

            def wait_for_sync_status_normal(label: str) -> None:
                if not couchdb_url:
                    return
                settled_status = wait_until(
                    lambda: (
                        status
                        if (status := (page.locator("#sync-status-text").text_content() or "").strip())
                        and status != "Syncing"
                        else False
                    ),
                    f"{label} sync status",
                    timeout_s=20.0,
                )
                if settled_status == "Error":
                    raise ValueError(f"{label} sync status entered error state.")

            def read_remote_summary(room_code: str) -> dict[str, list[dict[str, Any]]]:
                if not couchdb_url:
                    raise ValueError("Remote sync smoke requested without COUCHDB_URL configured.")
                return summarize_docs(
                    fetch_remote_docs(couchdb_url, build_remote_db_name(hostname, room_code))
                )

            def run_alpha_room_scenario() -> None:
                demo_step(page, "opening alpha room", step_pause_ms)
                enter_room(page, rooms["alpha"])
                clear_room_storage(page, rooms["alpha"])
                stale_schedule_description = "Playwright stale scheduled task"
                seed_docs(
                    page,
                    rooms["alpha"],
                    [
                        build_relative_day_scheduled_task_doc(
                            page,
                            doc_id="task-playwright-stale-scheduled",
                            description=stale_schedule_description,
                            day_offset=-1,
                            start_hour=10,
                            start_minute=0,
                            duration_minutes=30,
                        )
                    ],
                )
                page.reload(wait_until="load")
                wait_for_main_app(page)
                wait_until(
                    lambda: any(
                        doc.get("description") == stale_schedule_description
                        for doc in list(map(normalize_doc, read_docs(page, rooms["alpha"])))
                    ),
                    "prior-day scheduled task remains in storage",
                )
                wait_until(
                    lambda: stale_schedule_description
                    not in (page.locator("#scheduled-task-list").text_content() or ""),
                    "prior-day scheduled task hidden from today's schedule",
                )

                demo_step(page, "adding fresh-room tasks", step_pause_ms)
                add_scheduled_task(page, "Playwright scheduled task", "09:00", 30)
                add_unscheduled_task(page, "Playwright unscheduled task", 15)

                page.reload(wait_until="load")
                wait_for_main_app(page)

                alpha_docs = read_docs(page, rooms["alpha"])
                scheduled_doc = ensure_task_doc_present(
                    rooms["alpha"], "Playwright scheduled task", alpha_docs
                )
                ensure_task_doc_present(rooms["alpha"], stale_schedule_description, alpha_docs)
                unscheduled_doc = ensure_task_doc_present(
                    rooms["alpha"], "Playwright unscheduled task", alpha_docs
                )

                edit_form_selector = open_scheduled_edit_form(page, scheduled_doc["id"])
                page.locator(f"{edit_form_selector} input[name='description']").fill(
                    "Playwright scheduled task edited"
                )
                page.locator(edit_form_selector).evaluate("(form) => form.requestSubmit()")
                cancel_open_confirm_modal(page)
                wait_until(
                    lambda: any(
                        doc.get("id") == scheduled_doc["id"]
                        and doc.get("description") == "Playwright scheduled task edited"
                        for doc in list(map(normalize_doc, read_docs(page, rooms["alpha"])))
                    ),
                    "scheduled edit persistence",
                )

                demo_step(page, "editing scheduled task and deleting unscheduled task", step_pause_ms)
                delete_unscheduled_task_via_ui(page, unscheduled_doc["id"])

                def fresh_room_storage_updated() -> bool:
                    docs = list(map(normalize_doc, read_docs(page, rooms["alpha"])))
                    return any(
                        doc.get("description") == "Playwright scheduled task edited"
                        and doc.get("docType") == "task"
                        for doc in docs
                    ) and not any(doc.get("id") == unscheduled_doc["id"] for doc in docs)

                try:
                    wait_until(fresh_room_storage_updated, "fresh-room storage update")
                except TimeoutError as error:
                    snapshot = summarize_docs(read_docs(page, rooms["alpha"]))
                    raise TimeoutError(
                        "Timed out waiting for fresh-room storage update.\n"
                        f"{format_snapshot(snapshot)}"
                    ) from error

                alpha_summary = summarize_docs(read_docs(page, rooms["alpha"]))
                if "Playwright scheduled task edited" not in [
                    doc.get("description") for doc in alpha_summary["tasks"]
                ]:
                    raise ValueError(
                        f"missing edited scheduled task.\n{format_snapshot(alpha_summary)}"
                    )
                if couchdb_url:
                    request_manual_sync(page)
                    wait_for_sync_status_normal("taxonomy manual sync")
                    wait_until(
                        lambda: (
                            lambda summary: any(
                                doc.get("description") == "Playwright scheduled task edited"
                                for doc in summary["tasks"]
                            )
                            and not any(
                                doc.get("id") == unscheduled_doc["id"] for doc in summary["tasks"]
                            )
                        )(read_remote_summary(rooms["alpha"])),
                        "alpha remote sync",
                        timeout_s=25.0,
                    )
                    wait_for_sync_status_normal("alpha")

            def run_legacy_room_scenario() -> None:
                demo_step(page, "checking legacy migration room", step_pause_ms)
                switch_room(page, rooms["legacy"])
                clear_room_storage(page, rooms["legacy"])
                seed_docs(
                    page,
                    rooms["legacy"],
                    [
                        {
                            "_id": "sched-legacy",
                            "type": "scheduled",
                            "description": "Legacy scheduled task",
                            "startDateTime": "2026-03-20T09:00:00",
                            "endDateTime": "2026-03-20T09:30:00",
                            "duration": 30,
                            "status": "incomplete",
                        },
                        {
                            "_id": "unsched-legacy",
                            "type": "unscheduled",
                            "description": "Legacy unscheduled task",
                            "priority": "medium",
                            "estDuration": 15,
                            "status": "incomplete",
                        },
                    ],
                )
                page.reload(wait_until="load")
                wait_for_main_app(page)

                wait_until(
                    lambda: (
                        lambda docs: any(
                            doc.get("id") == "sched-legacy" and doc.get("docType") == "task"
                            for doc in docs
                        )
                        and any(
                            doc.get("id") == "unsched-legacy" and doc.get("docType") == "task"
                            for doc in docs
                        )
                    )(list(map(normalize_doc, read_docs(page, rooms["legacy"])))),
                    "legacy migration",
                )
                assert_migrated_task_docs(
                    summarize_docs(read_docs(page, rooms["legacy"])),
                    ["sched-legacy", "unsched-legacy"],
                )
                if couchdb_url:
                    wait_until(
                        lambda: (
                            lambda summary: format_doc_ids(summary["tasks"])
                            == ["sched-legacy", "unsched-legacy"]
                            and not summary["legacy_tasks"]
                        )(read_remote_summary(rooms["legacy"])),
                        "legacy remote sync",
                        timeout_s=25.0,
                    )
                    wait_for_sync_status_normal("legacy")

            def run_taxonomy_room_scenario() -> None:
                demo_step(page, "checking phase 3 taxonomy and settings room", step_pause_ms)
                switch_room(page, rooms["taxonomy"])
                clear_room_storage(page, rooms["taxonomy"])
                set_activities_enabled(page, True)
                seed_docs(page, rooms["taxonomy"], [build_phase3_taxonomy_config_doc()])
                page.reload(wait_until="load")
                wait_for_main_app(page)

                wait_until(
                    lambda: page.locator("#category-dropdown-row").is_visible(),
                    "activities-enabled category dropdown",
                )
                wait_until(
                    lambda: (
                        page.locator('#category-select option[value="work/project"]').text_content()
                        or ""
                    )
                    == "› Project",
                    "visible nested project category option",
                )

                open_settings_modal(page)
                wait_for_text_in_locator(
                    page,
                    "#settings-content",
                    "Work",
                    description="seeded taxonomy settings content",
                )
                wait_for_text_in_locator(
                    page,
                    "#settings-content",
                    "Family",
                    description="seeded family group content",
                )
                wait_until(
                    lambda: "settings-scroll-area"
                    in (page.locator("#settings-content").get_attribute("class") or ""),
                    "settings scroll shell class",
                )

                page.locator("#add-category-btn").click()
                page.locator("#add-category-form").wait_for(state="visible", timeout=5000)
                separator_text = (
                    page.locator("#add-category-form [data-category-path-separator]").text_content()
                    or ""
                ).strip()
                if separator_text != "/":
                    raise ValueError(f"unexpected add-category separator: {separator_text!r}")
                group_placeholder = (
                    page.locator(
                        '#add-category-form select[name="parent-group"] option'
                    ).first.text_content()
                    or ""
                ).strip()
                if group_placeholder != "Group":
                    raise ValueError(
                        f"unexpected add-category group placeholder: {group_placeholder!r}"
                    )
                category_placeholder = page.locator(
                    '#add-category-form input[name="category-label"]'
                ).get_attribute("placeholder")
                if category_placeholder != "Category name":
                    raise ValueError(
                        f"unexpected add-category input placeholder: {category_placeholder!r}"
                    )

                add_category_via_settings(page, "break", "Walk")
                wait_until(
                    lambda: page.locator('[data-category-key="break/walk"]').count() == 1,
                    "new break walk category row",
                )
                wait_until(
                    lambda: page.locator('#category-select option[value="break/walk"]').count() == 1,
                    "live dropdown refresh for added category",
                )

                update_group_family_via_settings(page, "work", "amber")
                wait_until(
                    lambda: "#b45309"
                    in (
                        page.locator(
                            '[data-category-key="work/project"] .category-dot'
                        ).get_attribute("style")
                        or ""
                    ),
                    "linked work/project category recolor",
                )
                demo_note("taxonomy: added break/walk and recolored work family to amber")
                assert_no_page_errors_yet("taxonomy category mutations")
                close_settings_modal(page)

                page.locator("#scheduled").check()
                fill_locator_value(
                    page,
                    page.locator(task_form_input_selector("description")),
                    "Taxonomy scheduled group task",
                    description="taxonomy scheduled description",
                )
                fill_locator_value(
                    page,
                    page.locator(task_form_input_selector("start-time")),
                    "11:00",
                    description="taxonomy scheduled start",
                )
                fill_locator_value(
                    page,
                    page.locator(task_form_input_selector("duration-hours")),
                    "0",
                    description="taxonomy scheduled duration hours",
                )
                fill_locator_value(
                    page,
                    page.locator(task_form_input_selector("duration-minutes")),
                    "25",
                    description="taxonomy scheduled duration minutes",
                )
                page.locator("#category-select").select_option("family")
                page.locator("#task-form button[type='submit']").click()

                page.locator("#unscheduled").check()
                fill_locator_value(
                    page,
                    page.locator(task_form_input_selector("description")),
                    "Taxonomy child category task",
                    description="taxonomy unscheduled description",
                )
                page.locator('input[name="priority"][value="medium"]').check(force=True)
                fill_locator_value(
                    page,
                    page.locator(task_form_input_selector("est-duration-hours")),
                    "0",
                    description="taxonomy unscheduled duration hours",
                )
                fill_locator_value(
                    page,
                    page.locator(task_form_input_selector("est-duration-minutes")),
                    "15",
                    description="taxonomy unscheduled duration minutes",
                )
                page.locator("#category-select").select_option("work/project")
                page.locator("#task-form button[type='submit']").click()

                wait_until(
                    lambda: (
                        lambda docs: any(
                            doc.get("description") == "Taxonomy scheduled group task"
                            and doc.get("category") == "family"
                            for doc in docs
                        )
                        and any(
                            doc.get("description") == "Taxonomy child category task"
                            and doc.get("category") == "work/project"
                            for doc in docs
                        )
                    )(list(map(normalize_doc, read_docs(page, rooms["taxonomy"])))),
                    "taxonomy task category persistence",
                )

                wait_until(
                    lambda: "Family" in (page.locator("#scheduled-task-list").text_content() or ""),
                    "scheduled group badge label",
                )
                wait_until(
                    lambda: "Project" in (page.locator("#unscheduled-task-list").text_content() or ""),
                    "unscheduled child badge label",
                )
                scheduled_badge_style = (
                    page.locator("#scheduled-task-list .category-badge").first.get_attribute("style")
                    or ""
                )
                unscheduled_badge_style = (
                    page.locator("#unscheduled-task-list .category-badge").first.get_attribute("style")
                    or ""
                )
                if "background-color: rgba(15, 23, 42, 0.9)" not in scheduled_badge_style:
                    raise ValueError(
                        f"scheduled badge lost standardized background: {scheduled_badge_style}"
                    )
                if "#4b5563" not in scheduled_badge_style:
                    raise ValueError(
                        f"scheduled group badge lost gray accent: {scheduled_badge_style}"
                    )
                if "background-color: rgba(15, 23, 42, 0.9)" not in unscheduled_badge_style:
                    raise ValueError(
                        f"unscheduled badge lost standardized background: {unscheduled_badge_style}"
                    )
                if "#b45309" not in unscheduled_badge_style:
                    raise ValueError(
                        "unscheduled child badge did not reflect amber family: "
                        f"{unscheduled_badge_style}"
                    )
                demo_note(
                    "taxonomy: scheduled and unscheduled tasks persisted with expected category badges"
                )
                assert_no_page_errors_yet("taxonomy task persistence")

                page.reload(wait_until="load")
                wait_for_main_app(page)
                wait_for_text_in_locator(
                    page,
                    "#scheduled-task-list",
                    "Taxonomy scheduled group task",
                    description="taxonomy scheduled task after reload",
                )
                wait_for_text_in_locator(
                    page,
                    "#unscheduled-task-list",
                    "Taxonomy child category task",
                    description="taxonomy unscheduled task after reload",
                )

                open_settings_modal(page)
                wait_for_text_in_locator(
                    page,
                    "#settings-content",
                    "Walk",
                    description="persisted added category after reload",
                )
                page.locator('.btn-delete-group[data-key="family"]').click()
                wait_for_toast_text(page, 'Group "family" is referenced by tasks')
                page.locator('.btn-delete-category[data-key="work/project"]').click()
                wait_for_toast_text(page, 'Category "work/project" is referenced by tasks')
                close_settings_modal(page)

                scheduled_taxonomy_doc = wait_for_task_doc(
                    page,
                    rooms["taxonomy"],
                    "Taxonomy scheduled group task",
                )
                scheduled_edit_form_selector = open_scheduled_edit_form(
                    page, scheduled_taxonomy_doc["id"]
                )
                page.locator(
                    f'{scheduled_edit_form_selector} select[name="category"]'
                ).select_option("work/meeting")
                page.locator(scheduled_edit_form_selector).evaluate(
                    "(form) => form.requestSubmit()"
                )
                cancel_open_confirm_modal(page)
                page.locator(scheduled_edit_form_selector).wait_for(
                    state="hidden", timeout=10000
                )

                unscheduled_taxonomy_doc = wait_for_task_doc(
                    page,
                    rooms["taxonomy"],
                    "Taxonomy child category task",
                )
                unscheduled_card_selector = (
                    f'.task-card[data-task-id="{unscheduled_taxonomy_doc["id"]}"]'
                )
                open_unscheduled_task_actions_menu(page, unscheduled_taxonomy_doc["id"])
                page.locator(f"{unscheduled_card_selector} .btn-edit-unscheduled").click()
                page.locator(
                    f'{unscheduled_card_selector} select[name="inline-edit-category"]'
                ).wait_for(state="visible", timeout=10000)
                page.locator(
                    f'{unscheduled_card_selector} select[name="inline-edit-category"]'
                ).select_option("break/walk")
                page.locator(f"{unscheduled_card_selector} .btn-save-inline-edit").click()

                wait_until(
                    lambda: (
                        lambda docs: any(
                            doc.get("description") == "Taxonomy scheduled group task"
                            and doc.get("category") == "work/meeting"
                            for doc in docs
                        )
                        and any(
                            doc.get("description") == "Taxonomy child category task"
                            and doc.get("category") == "break/walk"
                            for doc in docs
                        )
                    )(list(map(normalize_doc, read_docs(page, rooms["taxonomy"])))),
                    "taxonomy task edit category persistence",
                )
                wait_until(
                    lambda: "Meeting" in (page.locator("#scheduled-task-list").text_content() or ""),
                    "scheduled edited category badge label",
                )
                wait_until(
                    lambda: "Walk" in (page.locator("#unscheduled-task-list").text_content() or ""),
                    "unscheduled edited category badge label",
                )
                demo_note("taxonomy: scheduled and unscheduled category edits persisted")
                assert_no_page_errors_yet("taxonomy task category edits")

                taxonomy_summary = summarize_docs(read_docs(page, rooms["taxonomy"]))
                taxonomy_config = next(
                    (
                        doc
                        for doc in taxonomy_summary["configs"]
                        if doc.get("id") == "config-categories"
                    ),
                    None,
                )
                if not taxonomy_config:
                    raise ValueError(
                        "taxonomy room missing config-categories doc.\n"
                        f"{format_snapshot(taxonomy_summary)}"
                    )
                if not any(
                    group.get("key") == "work" and group.get("colorFamily") == "amber"
                    for group in taxonomy_config.get("groups", [])
                ):
                    raise ValueError(
                        "taxonomy room did not persist work family edit.\n"
                        f"{format_snapshot(taxonomy_summary)}"
                    )
                if not any(
                    category.get("key") == "break/walk"
                    for category in taxonomy_config.get("categories", [])
                ):
                    raise ValueError(
                        "taxonomy room did not persist compact add-category flow.\n"
                        f"{format_snapshot(taxonomy_summary)}"
                    )
                demo_note("taxonomy: reload and settings persistence checks passed")
                assert_no_page_errors_yet("taxonomy reload and settings persistence")
                if couchdb_url:
                    wait_until(
                        lambda: (
                            lambda summary: any(
                                doc.get("description") == "Taxonomy scheduled group task"
                                and doc.get("category") == "work/meeting"
                                for doc in summary["tasks"]
                            )
                            and any(
                                doc.get("description") == "Taxonomy child category task"
                                and doc.get("category") == "break/walk"
                                for doc in summary["tasks"]
                            )
                            and any(
                                doc.get("id") == "config-categories"
                                and any(
                                    group.get("key") == "work"
                                    and group.get("colorFamily") == "amber"
                                    for group in doc.get("groups", [])
                                )
                                and any(
                                    category.get("key") == "break/walk"
                                    for category in doc.get("categories", [])
                                )
                                for doc in summary["configs"]
                            )
                        )(read_remote_summary(rooms["taxonomy"])),
                        "taxonomy remote sync",
                        timeout_s=60.0,
                    )
                    wait_for_sync_status_normal("taxonomy")

            page.goto(preview_url, wait_until="load")
            wait_for_app_ready(page)
            wait_for_demo_start(demo=demo, headless=headless)
            run_alpha_room_scenario()

            run_legacy_room_scenario()

            run_taxonomy_room_scenario()
            run_activities_room_scenario(
                page=page,
                rooms=rooms,
                step_pause_ms=step_pause_ms,
                assert_no_page_errors_yet=assert_no_page_errors_yet,
            )

            browser_captured_errors = page.evaluate(
                "() => window.__fortudoSmokeBrowserErrors || []"
            )
            assert_no_runtime_errors(
                console_errors,
                page_errors,
                request_failures,
                response_errors,
                browser_captured_errors,
            )

            if keep_open and not headless:
                input("Smoke passed. Press Enter to close the browser...")
            return True
        except Exception:
            save_failure_screenshot(page)
            if keep_open and not headless:
                print("Smoke failed. Browser left open for inspection. Press Enter to close it.")
                input()
            raise
        finally:
            context.close()
            browser.close()


def main(argv: list[str] | None = None) -> int:
    parsed = parse_cli_args(argv or [])
    if not parsed["preview_url"]:
        print(
            "Usage: uv run --with playwright python -m scripts.preview_smoke "
            "<preview-url> [--demo] [--keep-open] [--headless] "
            "[--slow-ms N] [--step-pause-ms N] [--channel chrome|chromium]"
        )
        return 1

    run_smoke(
        parsed["preview_url"],
        demo=parsed["demo"],
        headless=parsed["headless"],
        keep_open=parsed["keep_open"],
        channel=parsed["channel"],
        slow_mo_ms=parsed["slow_mo_ms"],
        step_pause_ms=parsed["step_pause_ms"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))

"""Preview smoke room setup and scenario runners."""

from __future__ import annotations

import time
from typing import Any, Callable

from scripts.e2e_helpers import *  # noqa: F403


def derive_smoke_room_prefix(hostname: str) -> str:
    host = str(hostname or "")
    if host.startswith("fortudo--") and host.endswith(".web.app"):
        return host.removeprefix("fortudo--").removesuffix(".web.app")
    if host.startswith("fortudo--") and host.endswith(".firebaseapp.com"):
        return host.removeprefix("fortudo--").removesuffix(".firebaseapp.com")
    return "smoke"


def create_scenario_rooms(prefix: str) -> dict[str, str]:
    return {
        "alpha": f"{prefix}-alpha",
        "legacy": f"{prefix}-legacy",
        "beta": f"{prefix}-beta",
        "taxonomy": f"{prefix}-taxonomy",
        "activities": f"{prefix}-activities",
    }


def create_run_scoped_prefix(hostname: str) -> str:
    if is_preview_host(hostname):
        return f"{derive_smoke_room_prefix(hostname)}-smoke"
    token = int(time.time() * 1000)
    return f"{derive_smoke_room_prefix(hostname)}-{token:x}"


def run_phase5_insights_smoke(page: Any, room_code: str) -> None:
    auto_log_description = "Playwright insights auto-log"
    live_timer_description = "Playwright insights live timer"
    prior_day_description = "Playwright prior-day insights"
    overlap_issue_description = "Playwright overlap issue second"

    set_activities_enabled(page, True)
    page.reload(wait_until="load")
    wait_for_main_app(page)

    prior_day_doc = build_relative_day_activity_doc(
        page,
        doc_id="activity-playwright-prior-day-insights",
        description=prior_day_description,
        day_offset=-1,
        start_hour=9,
        start_minute=0,
        duration_minutes=30,
    )
    overlap_first_doc = build_relative_day_activity_doc(
        page,
        doc_id="activity-playwright-overlap-issue-first",
        description="Playwright overlap issue first",
        day_offset=0,
        start_hour=8,
        start_minute=0,
        duration_minutes=60,
    )
    overlap_second_doc = build_relative_day_activity_doc(
        page,
        doc_id="activity-playwright-overlap-issue-second",
        description=overlap_issue_description,
        day_offset=0,
        start_hour=8,
        start_minute=30,
        duration_minutes=30,
    )
    seed_docs(page, room_code, [prior_day_doc, overlap_first_doc, overlap_second_doc])
    page.reload(wait_until="load")
    wait_for_main_app(page)

    add_active_scheduled_task(page, auto_log_description, 20)
    task_doc = wait_for_task_doc(page, room_code, auto_log_description)
    complete_scheduled_task_via_ui(page, task_doc["id"])
    auto_log_activity_doc = wait_for_activity_doc(page, room_code, auto_log_description)

    start_activity_timer(
        page,
        live_timer_description,
        room_code=room_code,
    )
    running_timer_config = wait_for_running_activity_config(
        page,
        room_code,
        expected_description=live_timer_description,
    )

    page.locator("#view-toggle-insights").click()
    assert_phase5_insights_view(
        page,
        activity_description=auto_log_description,
        running_timer_description=live_timer_description,
    )
    assert_selected_trend_day_visible(page)
    assert_trend_strip_scrollbar_hidden_and_scrollable(page)
    assert_activity_data_issue_badge(
        page,
        expected_activity_description=overlap_issue_description,
    )
    assert_insights_rerender_preserves_vertical_scroll(page, auto_log_activity_doc["id"])
    assert_trend_day_selection_scopes_details(
        page,
        selected_date=prior_day_doc["localDate"],
        expected_date_text=prior_day_doc["dateText"],
        expected_activity_description=prior_day_description,
    )

    page.locator("#view-toggle-tasks").click()
    stop_activity_timer(page)
    stopped_timer_doc = wait_for_activity_doc(page, room_code, live_timer_description)
    assert_running_timer_id_reused_by_stopped_activity(running_timer_config, stopped_timer_doc)


def run_activities_room_scenario(
    *,
    page: Any,
    rooms: dict[str, str],
    step_pause_ms: int,
    assert_no_page_errors_yet: Callable[[str], None],
) -> None:
    demo_step(page, "checking activities room flows", step_pause_ms)
    switch_room(page, rooms["activities"])
    clear_room_storage(page, rooms["activities"])
    seed_docs(page, rooms["activities"], [build_phase3_taxonomy_config_doc()])
    set_activities_enabled(page, True)
    page.reload(wait_until="load")
    wait_for_main_app(page)

    add_activity(page, "Playwright manual activity", "13:00", 30)
    manual_activity_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright manual activity",
    )
    if manual_activity_doc.get("source") != "manual":
        raise ValueError(
            f"manual activity was not stored as manual.\n{json.dumps(manual_activity_doc, indent=2)}"
        )
    if manual_activity_doc.get("sourceTaskId") is not None:
        raise ValueError(
            f"manual activity unexpectedly linked to a source task.\n{json.dumps(manual_activity_doc, indent=2)}"
        )
    if manual_activity_doc.get("duration") != 30:
        raise ValueError(
            f"manual activity persisted wrong duration.\n{json.dumps(manual_activity_doc, indent=2)}"
        )
    wait_for_text_in_locator(
        page,
        "#activity-list",
        "Playwright manual activity",
        description="manual activity render",
    )
    demo_note("activities: manual activity add persisted and rendered")
    assert_no_page_errors_yet("manual activity add")

    queue_activity_smoke_failure(page, "manual-add", 1)
    add_activity(page, "Playwright failed activity", "13:45", 15)
    wait_for_activity_failure_alert(
        page,
        rooms["activities"],
        "Playwright failed activity",
    )
    wait_for_text_in_locator(
        page,
        "#custom-alert-message",
        "Could not log activity.",
        description="manual activity failure alert",
    )
    failed_activity_description = page.locator(
        task_form_input_selector("description")
    ).input_value()
    if failed_activity_description != "Playwright failed activity":
        raise ValueError(
            "manual activity failure cleared the form unexpectedly: "
            f"{failed_activity_description!r}"
        )
    page.locator("#ok-custom-alert-modal").click()
    page.locator("#custom-alert-modal").wait_for(state="hidden", timeout=10000)
    if any(
        doc.get("description") == "Playwright failed activity"
        for doc in read_docs(page, rooms["activities"])
    ):
        raise ValueError("failed manual activity unexpectedly persisted")
    demo_note("activities: manual add failure path preserved form state")
    assert_no_page_errors_yet("manual add failure path")

    add_active_scheduled_task(page, "Playwright auto-log success", 20)
    success_task_doc = wait_for_task_doc(
        page,
        rooms["activities"],
        "Playwright auto-log success",
    )
    complete_scheduled_task_via_ui(page, success_task_doc["id"])
    success_activity_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright auto-log success",
    )
    if success_activity_doc.get("source") != "auto":
        raise ValueError(
            f"successful auto-log activity had wrong source.\n{json.dumps(success_activity_doc, indent=2)}"
        )
    if success_activity_doc.get("sourceTaskId") != success_task_doc["id"]:
        raise ValueError(
            "successful auto-log activity did not keep the source task id.\n"
            f"{json.dumps(success_activity_doc, indent=2)}"
        )
    wait_for_text_in_locator(
        page,
        "#activity-list",
        "Playwright auto-log success",
        description="successful auto-log activity render",
    )
    demo_note("activities: scheduled-task auto-log success verified")
    assert_no_page_errors_yet("auto-log success")

    add_active_scheduled_task(page, "Playwright auto-log failure", 20)
    failing_task_doc = wait_for_task_doc(
        page,
        rooms["activities"],
        "Playwright auto-log failure",
    )
    queue_activity_smoke_failure(page, "auto-log", 1)
    complete_scheduled_task_via_ui(page, failing_task_doc["id"])
    wait_for_toast_text(page, "Task completed, but activity auto-log failed.")
    if any(
        doc.get("docType") == "activity"
        and doc.get("description") == "Playwright auto-log failure"
        for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
    ):
        raise ValueError("failed auto-log unexpectedly created an activity")
    demo_note("activities: auto-log failure path surfaced toast without persisting activity")
    assert_no_page_errors_yet("auto-log failure path")

    add_unscheduled_task(
        page,
        "Playwright linked timer task",
        25,
        category="work/project",
    )
    linked_timer_task_doc = wait_for_task_doc(
        page,
        rooms["activities"],
        "Playwright linked timer task",
    )
    start_timer_from_unscheduled_task(
        page,
        linked_timer_task_doc["id"],
        "Playwright linked timer task",
    )
    linked_running_config = wait_for_running_activity_config(
        page,
        rooms["activities"],
        expected_description="Playwright linked timer task",
        expected_category="work/project",
    )
    if linked_running_config.get("source") != "auto":
        raise ValueError(
            "unscheduled timer did not persist the auto source.\n"
            f"{json.dumps(linked_running_config, indent=2)}"
        )
    if linked_running_config.get("sourceTaskId") != linked_timer_task_doc["id"]:
        raise ValueError(
            "unscheduled timer did not keep the source task id.\n"
            f"{json.dumps(linked_running_config, indent=2)}"
        )
    wait_for_text_in_locator(
        page,
        "#unscheduled-task-list",
        "In progress",
        description="unscheduled linked timer in-progress badge",
    )
    stop_activity_timer(page)
    wait_until(
        lambda: not any(
            normalize_doc(doc).get("id") == RUNNING_ACTIVITY_CONFIG_ID
            for doc in read_docs(page, rooms["activities"])
        ),
        "linked running activity config cleared after stop",
    )
    linked_timer_activity_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright linked timer task",
    )
    if linked_timer_activity_doc.get("source") != "auto":
        raise ValueError(
            "stopped unscheduled timer had wrong source.\n"
            f"{json.dumps(linked_timer_activity_doc, indent=2)}"
        )
    if linked_timer_activity_doc.get("sourceTaskId") != linked_timer_task_doc["id"]:
        raise ValueError(
            "stopped unscheduled timer did not keep the source task id.\n"
            f"{json.dumps(linked_timer_activity_doc, indent=2)}"
        )
    if linked_timer_activity_doc.get("category") != "work/project":
        raise ValueError(
            "stopped unscheduled timer did not inherit the task category.\n"
            f"{json.dumps(linked_timer_activity_doc, indent=2)}"
        )
    demo_note("activities: unscheduled task start-timer bridge verified")
    assert_no_page_errors_yet("unscheduled start timer bridge")

    add_unscheduled_task(page, "Playwright delete confirm task", 15)
    delete_confirm_task_doc = wait_for_task_doc(
        page,
        rooms["activities"],
        "Playwright delete confirm task",
    )

    add_activity(page, "Playwright editable activity", "15:30", 15)
    editable_activity_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright editable activity",
    )
    wait_for_activity_row_text(
        page,
        editable_activity_doc["id"],
        "Playwright editable activity",
    )
    arm_unscheduled_delete_confirm(page, delete_confirm_task_doc["id"])
    page.locator(
        f'[data-activity-id="{editable_activity_doc["id"]}"] .btn-edit-activity'
    ).click()
    page.locator(
        f'form.activity-inline-edit-form[data-activity-id="{editable_activity_doc["id"]}"]'
    ).wait_for(state="visible", timeout=10000)
    current_modal_value = wait_for_input_value(
        page,
        f'form.activity-inline-edit-form[data-activity-id="{editable_activity_doc["id"]}"] input[name="description"]',
        "Playwright editable activity",
        description="activity inline edit description preload",
    )
    if current_modal_value != "Playwright editable activity":
        raise ValueError(
            "activity inline edit lost the current description after rerender: "
            f"{current_modal_value!r}"
        )
    fill_locator_value(
        page,
        page.locator(
            f'form.activity-inline-edit-form[data-activity-id="{editable_activity_doc["id"]}"] input[name="description"]'
        ),
        "Playwright editable activity updated",
        description="activity inline edit description",
    )
    page.locator(
        f'form.activity-inline-edit-form[data-activity-id="{editable_activity_doc["id"]}"] select[name="category"]'
    ).select_option("work/project")
    page.locator(
        f'form.activity-inline-edit-form[data-activity-id="{editable_activity_doc["id"]}"] .btn-save-activity-edit'
    ).click()
    page.locator(
        f'form.activity-inline-edit-form[data-activity-id="{editable_activity_doc["id"]}"]'
    ).wait_for(state="hidden", timeout=10000)
    wait_until(
        lambda: any(
            doc.get("id") == editable_activity_doc["id"]
            and doc.get("description") == "Playwright editable activity updated"
            and doc.get("category") == "work/project"
            for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
        ),
        "activity edit category after delete-confirm rerender",
    )
    if get_unscheduled_delete_state(page, delete_confirm_task_doc["id"]) != "idle":
        raise ValueError("delete confirm state was not cleared by activity edit")
    demo_note("activities: inline edit survived delete-confirm rerender state")
    assert_no_page_errors_yet("activity inline edit")

    add_activity(page, "Playwright delete activity", "16:00", 10)
    deletable_activity_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright delete activity",
    )
    wait_for_activity_row_text(
        page,
        deletable_activity_doc["id"],
        "Playwright delete activity",
    )
    arm_unscheduled_delete_confirm(page, delete_confirm_task_doc["id"])
    delete_activity_button = page.locator(
        f'[data-activity-id="{deletable_activity_doc["id"]}"] .btn-delete-activity'
    )
    delete_activity_button.click()
    wait_until(
        lambda: "fa-check-circle"
        in (
            page.locator(
                f'[data-activity-id="{deletable_activity_doc["id"]}"] .btn-delete-activity i'
            ).get_attribute("class")
            or ""
        ),
        "activity delete confirmation arm",
    )
    delete_activity_button.click()
    wait_until(
        lambda: not any(
            doc.get("id") == deletable_activity_doc["id"]
            for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
        ),
        "activity delete after delete-confirm rerender",
    )
    if get_unscheduled_delete_state(page, delete_confirm_task_doc["id"]) != "idle":
        raise ValueError("delete confirm state was not cleared by activity delete")
    demo_note("activities: manual activity delete verified")
    assert_no_page_errors_yet("manual activity delete")

    try:
        start_activity_timer(
            page,
            "Playwright timer start",
            category="work/project",
            room_code=rooms["activities"],
        )
    except Exception as error:
        timer_start_state = page.evaluate(
            """
            () => ({
                scheduledChecked: document.getElementById('scheduled')?.checked ?? null,
                unscheduledChecked: document.getElementById('unscheduled')?.checked ?? null,
                activityChecked: document.getElementById('activity')?.checked ?? null,
                addTaskText: document.getElementById('add-task-btn')?.textContent ?? null,
                startTimerHidden:
                    document.getElementById('start-timer-btn')?.classList.contains('hidden') ??
                    null,
                formDescription:
                    document.querySelector('#task-form input[name="description"]')?.value ??
                    null,
                formCategory:
                    document.querySelector('#task-form select[name="category"]')?.value ??
                    null,
                formPlaceholder:
                    document
                        .querySelector('#task-form input[name="description"]')
                        ?.getAttribute('placeholder') ?? null,
                timerVisible:
                    !(document.getElementById('timer-display')?.classList.contains('hidden') ??
                    true),
                timerDescription: document.getElementById('timer-description')?.value ?? null,
                timerCategory: document.getElementById('timer-category')?.value ?? null,
                alertVisible:
                    !(document.getElementById('custom-alert-modal')?.classList.contains('hidden') ??
                    true),
                alertMessage:
                    document.getElementById('custom-alert-message')?.textContent ?? null,
                taskFormActivityClass:
                    document.getElementById('task-form')?.classList.contains('task-form--activity') ??
                    null
            })
            """
        )
        timer_start_docs = list(map(normalize_doc, read_docs(page, rooms["activities"])))
        raise ValueError(
            "Initial timer start failed.\n"
            f"error={error!r}\n"
            f"state={json.dumps(timer_start_state, indent=2)}\n"
            f"docs={json.dumps(timer_start_docs, indent=2)}"
        ) from error
    running_timer_config = wait_for_running_activity_config(page, rooms["activities"])
    if running_timer_config.get("description") != "Playwright timer start":
        raise ValueError(
            "running activity config stored wrong description after timer start.\n"
            f"{json.dumps(running_timer_config, indent=2)}"
        )
    if running_timer_config.get("category") != "work/project":
        raise ValueError(
            "running activity config stored wrong category after timer start.\n"
            f"{json.dumps(running_timer_config, indent=2)}"
        )
    if any(
        doc.get("docType") == "activity"
        and doc.get("description") == "Playwright timer start"
        for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
    ):
        raise ValueError("starting a timer unexpectedly created an activity doc immediately")
    demo_note("activities: timer started and running config persisted")
    assert_no_page_errors_yet("timer start")

    fill_locator_value(
        page,
        page.locator("#timer-description"),
        "Playwright timer edited",
        description="timer description edit",
    )
    page.locator("#timer-description").evaluate(
        "(node) => node.dispatchEvent(new Event('change', { bubbles: true }))"
    )
    wait_until(
        lambda: next(
            (
                normalized.get("description") == "Playwright timer edited"
                for normalized in map(normalize_doc, read_docs(page, rooms["activities"]))
                if normalized.get("id") == RUNNING_ACTIVITY_CONFIG_ID
            ),
            False,
        ),
        "timer description config update",
        timeout_s=10.0,
        interval_s=0.1,
    )
    page.locator("#timer-category").select_option("work/meeting")
    wait_until(
        lambda: next(
            (
                normalized.get("category") == "work/meeting"
                for normalized in map(normalize_doc, read_docs(page, rooms["activities"]))
                if normalized.get("id") == RUNNING_ACTIVITY_CONFIG_ID
            ),
            False,
        ),
        "timer category config update",
        timeout_s=10.0,
        interval_s=0.1,
    )
    original_start_date_time = wait_for_running_activity_config(
        page, rooms["activities"]
    ).get("startDateTime")
    timer_start_backdate = get_relative_browser_time(page, -60)
    fill_locator_value(
        page,
        page.locator("#timer-start-time"),
        timer_start_backdate,
        description="timer start time edit",
    )
    page.locator("#timer-start-time").evaluate(
        "(node) => node.dispatchEvent(new Event('change', { bubbles: true }))"
    )
    wait_until(
        lambda: next(
            (
                normalized.get("startDateTime") != original_start_date_time
                for normalized in map(normalize_doc, read_docs(page, rooms["activities"]))
                if normalized.get("id") == RUNNING_ACTIVITY_CONFIG_ID
            ),
            False,
        ),
        "timer start time config update",
        timeout_s=10.0,
        interval_s=0.1,
    )
    wait_for_input_value(
        page,
        "#timer-start-time",
        timer_start_backdate,
        description="timer start time field after backdate",
    )

    stop_activity_timer(page)
    wait_until(
        lambda: not any(
            normalize_doc(doc).get("id") == RUNNING_ACTIVITY_CONFIG_ID
            for doc in read_docs(page, rooms["activities"])
        ),
        "running activity config cleared after stop",
    )
    stopped_timer_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright timer edited",
    )
    if stopped_timer_doc.get("source") != "timer":
        raise ValueError(
            f"stopped timer activity had wrong source.\n{json.dumps(stopped_timer_doc, indent=2)}"
        )
    if stopped_timer_doc.get("category") != "work/meeting":
        raise ValueError(
            f"stopped timer activity had wrong category.\n{json.dumps(stopped_timer_doc, indent=2)}"
        )
    if stopped_timer_doc.get("duration", 0) <= 0:
        raise ValueError(
            f"stopped timer activity did not record positive duration.\n{json.dumps(stopped_timer_doc, indent=2)}"
        )
    if stopped_timer_doc.get("sourceTaskId") is not None:
        raise ValueError(
            f"timer activity unexpectedly linked to a source task.\n{json.dumps(stopped_timer_doc, indent=2)}"
        )
    demo_note("activities: timer edits and stop-to-activity persistence verified")
    assert_no_page_errors_yet("timer stop persistence")

    start_activity_timer(
        page,
        "Playwright timer replace first",
        category="work/project",
        room_code=rooms["activities"],
    )
    replacement_timer_start = get_relative_browser_time(page, -30)
    fill_locator_value(
        page,
        page.locator("#timer-start-time"),
        replacement_timer_start,
        description="replacement timer first start time",
    )
    page.locator("#timer-start-time").evaluate(
        "(node) => node.dispatchEvent(new Event('change', { bubbles: true }))"
    )
    wait_for_input_value(
        page,
        "#timer-start-time",
        replacement_timer_start,
        description="replacement timer first start time applied",
    )
    start_activity_timer(
        page,
        "Playwright timer replace second",
        category="work/comms",
        room_code=rooms["activities"],
    )
    replacement_running_config = wait_for_running_activity_config(page, rooms["activities"])
    if replacement_running_config.get("description") != "Playwright timer replace second":
        raise ValueError(
            "replacement timer did not become the new running timer.\n"
            f"{json.dumps(replacement_running_config, indent=2)}"
        )
    replaced_timer_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright timer replace first",
    )
    if replaced_timer_doc.get("source") != "timer" or replaced_timer_doc.get("duration", 0) <= 0:
        raise ValueError(
            "replaced running timer did not persist as a positive-duration timer activity.\n"
            f"{json.dumps(replaced_timer_doc, indent=2)}"
        )
    demo_note("activities: stop-on-start replacement flow verified")
    assert_no_page_errors_yet("timer replacement flow")

    page.reload(wait_until="load")
    wait_for_main_app(page)
    page.locator("#activity").check()
    wait_for_running_timer_ui(page, "Playwright timer replace second")
    restored_running_config = wait_for_running_activity_config(page, rooms["activities"])
    if restored_running_config.get("description") != "Playwright timer replace second":
        raise ValueError(
            "running timer was not restored after reload.\n"
            f"{json.dumps(restored_running_config, indent=2)}"
        )
    demo_note("activities: running timer restored after reload")
    assert_no_page_errors_yet("timer reload restore")

    overlap_timer_start = get_relative_browser_time(page, -15)
    fill_locator_value(
        page,
        page.locator("#timer-start-time"),
        overlap_timer_start,
        description="overlap timer start time",
    )
    page.locator("#timer-start-time").evaluate(
        "(node) => node.dispatchEvent(new Event('change', { bubbles: true }))"
    )
    wait_for_input_value(
        page,
        "#timer-start-time",
        overlap_timer_start,
        description="overlap timer start time applied",
    )

    add_active_scheduled_task(page, "Playwright overlap auto-stop", 20)
    overlap_task_doc = wait_for_task_doc(
        page,
        rooms["activities"],
        "Playwright overlap auto-stop",
    )
    complete_scheduled_task_via_ui(page, overlap_task_doc["id"])
    overlap_auto_activity_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright overlap auto-stop",
    )
    overlap_timer_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright timer replace second",
    )
    if overlap_auto_activity_doc.get("source") != "auto":
        raise ValueError(
            "overlap auto-log activity had wrong source.\n"
            f"{json.dumps(overlap_auto_activity_doc, indent=2)}"
        )
    if overlap_timer_doc.get("source") != "timer":
        raise ValueError(
            "overlap auto-stop did not persist the running timer as a timer activity.\n"
            f"{json.dumps(overlap_timer_doc, indent=2)}"
        )
    if any(
        normalize_doc(doc).get("id") == RUNNING_ACTIVITY_CONFIG_ID
        for doc in read_docs(page, rooms["activities"])
    ):
        raise ValueError("overlap auto-stop left a running activity config behind")
    wait_until(
        lambda: not page.locator("#timer-display").is_visible(),
        "timer display hidden after overlap auto-stop",
    )
    demo_note("activities: overlapping scheduled completion auto-stopped running timer")
    assert_no_page_errors_yet("overlap auto-stop")

    start_activity_timer(
        page,
        "Playwright boundary timer",
        room_code=rooms["activities"],
    )
    boundary_running_config = wait_for_running_activity_config(page, rooms["activities"])
    boundary_safe_start = get_relative_browser_time(page, 5)
    fill_locator_value(
        page,
        page.locator("#timer-start-time"),
        boundary_safe_start,
        description="boundary timer future start time",
    )
    page.locator("#timer-start-time").evaluate(
        "(node) => node.dispatchEvent(new Event('change', { bubbles: true }))"
    )
    wait_for_input_value(
        page,
        "#timer-start-time",
        boundary_safe_start,
        description="boundary timer future start time applied",
    )
    boundary_running_config = wait_for_running_activity_config(page, rooms["activities"])
    add_active_scheduled_task(page, "Playwright boundary auto-log", 20)
    boundary_task_doc = wait_for_task_doc(
        page,
        rooms["activities"],
        "Playwright boundary auto-log",
    )
    complete_scheduled_task_via_ui(page, boundary_task_doc["id"])
    boundary_auto_activity_doc = wait_for_activity_doc(
        page,
        rooms["activities"],
        "Playwright boundary auto-log",
    )
    if boundary_auto_activity_doc.get("source") != "auto":
        raise ValueError(
            "boundary auto-log activity had wrong source.\n"
            f"{json.dumps(boundary_auto_activity_doc, indent=2)}"
        )
    boundary_running_config_after = wait_for_running_activity_config(
        page,
        rooms["activities"],
    )
    if boundary_running_config_after.get("description") != "Playwright boundary timer":
        raise ValueError(
            "boundary timer was unexpectedly replaced or stopped.\n"
            f"{json.dumps(boundary_running_config_after, indent=2)}"
        )
    if boundary_running_config_after.get("startDateTime") != boundary_running_config.get(
        "startDateTime"
    ):
        raise ValueError(
            "boundary timer start time changed unexpectedly after non-overlap case.\n"
            f"before={json.dumps(boundary_running_config, indent=2)}\n"
            f"after={json.dumps(boundary_running_config_after, indent=2)}"
        )
    if any(
        doc.get("docType") == "activity"
        and doc.get("description") == "Playwright boundary timer"
        for doc in map(normalize_doc, read_docs(page, rooms["activities"]))
    ):
        raise ValueError("boundary timer unexpectedly auto-stopped in a non-overlap case")
    page.locator("#activity").check()
    wait_for_running_timer_ui(page, "Playwright boundary timer")
    boundary_stop_start = get_relative_browser_time(page, -1)
    fill_locator_value(
        page,
        page.locator("#timer-start-time"),
        boundary_stop_start,
        description="boundary timer stop start time",
    )
    page.locator("#timer-start-time").evaluate(
        "(node) => node.dispatchEvent(new Event('change', { bubbles: true }))"
    )
    wait_for_input_value(
        page,
        "#timer-start-time",
        boundary_stop_start,
        description="boundary timer stop start time applied",
    )
    stop_activity_timer(page)
    wait_for_activity_doc(page, rooms["activities"], "Playwright boundary timer")
    demo_note("activities: boundary non-overlap preserved the running timer until manual stop")
    assert_no_page_errors_yet("boundary non-overlap")

    run_phase5_insights_smoke(page, rooms["activities"])
    demo_note("activities: phase 5 insights summary, timeline, and log verified")
    assert_no_page_errors_yet("phase 5 insights smoke")

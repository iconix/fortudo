"""E2E tests for live overlap warnings, end-time hints, gap task picker, and reschedule pre-approval."""
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import os

from tests.e2e.helpers import BASE_URL, REPO_ROOT, launch_e2e_page

SCREENSHOTS_DIR = os.path.join(str(REPO_ROOT), "test_screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

passed = 0
failed = 0
results = []

def build_schedule():
    """Build fixed overlap-warning schedule at test runtime."""
    fixed_now = datetime(2026, 3, 11, 12, 0, 0)

    def fmt_time(minutes_from_now):
        t = fixed_now + timedelta(minutes=minutes_from_now)
        return f"{t.hour:02d}:{t.minute:02d}"

    def fmt_12h(minutes_from_now):
        t = fixed_now + timedelta(minutes=minutes_from_now)
        hour = t.hour % 12 or 12
        ampm = "AM" if t.hour < 12 else "PM"
        return f"{hour}:{t.minute:02d} {ampm}"

    minutes_to_midnight = (23 - fixed_now.hour) * 60 + (59 - fixed_now.minute) + 1
    if minutes_to_midnight >= 300:
        offset = 60
        d1, d2 = 60, 30
        gap = 60
        d3 = 30
        d_unsched = 20
    else:
        offset = min(10, max(5, minutes_to_midnight - 60))
        d1, d2 = 10, 5
        gap = 15
        d3 = 5
        d_unsched = 5

    t1_off = offset
    t2_off = t1_off + d1
    t3_off = t2_off + d2 + gap
    gap_start_off = t2_off + d2
    schedule = {
        "FIXED_NOW": fixed_now,
        "T1_TIME": fmt_time(t1_off),
        "T2_TIME": fmt_time(t2_off),
        "T3_TIME": fmt_time(t3_off),
        "OVERLAP_TIME": fmt_time(t1_off),
        "T1_END_12H": fmt_12h(t1_off + d1),
        "GAP_TIME": fmt_time(gap_start_off + 5),
        "NO_CONFLICT_TIME": fmt_time(t3_off + d3 + 30),
        "GAP_START_OFF": gap_start_off,
        "D1": d1,
        "D2": d2,
        "D3": d3,
        "D_UNSCHED": d_unsched,
        "GAP": gap,
    }
    print(
        f"Schedule: T1={schedule['T1_TIME']} ({d1}m), "
        f"T2={schedule['T2_TIME']} ({d2}m), "
        f"T3={schedule['T3_TIME']} ({d3}m)",
        flush=True,
    )
    print(f"Gap between T2 end and T3 start: {gap}m", flush=True)
    return schedule

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        results.append(f"  PASS: {name}")
        print(f"  PASS: {name}", flush=True)
    else:
        failed += 1
        results.append(f"  FAIL: {name} - {detail}")
        print(f"  FAIL: {name} - {detail}", flush=True)

def screenshot(page, name):
    path = os.path.join(SCREENSHOTS_DIR, f"overlap_{name}.png")
    page.screenshot(path=path, full_page=True)

def dismiss_modals(page):
    """Dismiss any alert, confirm, or schedule modals that may be showing."""
    for _ in range(3):
        schedule_modal = page.locator("#schedule-modal")
        if schedule_modal.is_visible():
            page.locator("#close-schedule-modal").click()
            page.wait_for_timeout(300)
        gap_picker = page.locator("#gap-task-picker-modal")
        if gap_picker.is_visible():
            page.locator("#cancel-gap-task-picker-modal").click()
            page.wait_for_timeout(300)
        confirm_modal = page.locator("#custom-confirm-modal")
        if confirm_modal.is_visible():
            page.locator("#ok-custom-confirm-modal").click()
            page.wait_for_timeout(300)
        alert_modal = page.locator("#custom-alert-modal")
        if alert_modal.is_visible():
            page.locator("#ok-custom-alert-modal").click()
            page.wait_for_timeout(300)

def switch_to_scheduled(page):
    """Switch form to scheduled mode via JS (radio may not be Playwright-visible)."""
    page.evaluate('document.getElementById("scheduled").click()')
    page.wait_for_timeout(200)

def switch_to_unscheduled(page):
    """Switch form to unscheduled mode via JS (radio may not be Playwright-visible)."""
    page.evaluate('document.getElementById("unscheduled").click()')
    page.wait_for_timeout(200)

def add_scheduled_task(page, description, start_time, hours, minutes):
    """Helper to add a scheduled task via the add form."""
    switch_to_scheduled(page)
    page.fill('input[name="description"]', description)
    page.fill('input[name="start-time"]', start_time)
    page.fill('input[name="duration-hours"]', str(hours))
    page.fill('input[name="duration-minutes"]', str(minutes))
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

def add_unscheduled_task(page, description, hours, minutes, priority="medium"):
    """Helper to add an unscheduled task."""
    switch_to_unscheduled(page)
    page.fill('input[name="description"]', description)
    page.evaluate(f'document.querySelector(\'input[name="priority"][value="{priority}"]\').click()')
    page.fill('input[name="est-duration-hours"]', str(hours))
    page.fill('input[name="est-duration-minutes"]', str(minutes))
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

def open_scheduled_action_menu(page, index=0):
    """Open the action menu for a scheduled task by visual order."""
    task = page.locator("#scheduled-task-list > [data-task-id]").nth(index)
    menu = task.locator(".task-actions-menu")
    if menu.is_visible():
        return task
    task.locator(".btn-task-actions-menu").click()
    menu.wait_for(state="visible", timeout=5000)
    return task

def click_scheduled_action(page, index, selector):
    task = open_scheduled_action_menu(page, index)
    task.locator(selector).evaluate("el => el.click()")

def open_unscheduled_action_menu(page, index=0):
    """Open the action menu for an unscheduled task by visual order."""
    task = page.locator("#unscheduled-task-list .task-card").nth(index)
    menu = task.locator(".unscheduled-task-actions-menu")
    if menu.is_visible():
        return task
    task.locator(".btn-unscheduled-task-actions-menu").click()
    menu.wait_for(state="visible", timeout=5000)
    return task

def click_unscheduled_action(page, index, selector):
    task = open_unscheduled_action_menu(page, index)
    task.locator(selector).evaluate("el => el.click()")

def open_unscheduled_action_menu_for_text(page, text):
    """Open the action menu for the unscheduled task matching visible text."""
    task = page.locator("#unscheduled-task-list .task-card").filter(has_text=text).first
    menu = task.locator(".unscheduled-task-actions-menu")
    if menu.is_visible():
        return task
    task.locator(".btn-unscheduled-task-actions-menu").click()
    menu.wait_for(state="visible", timeout=5000)
    return task


def test_schedule_overlaps_flow():
    schedule = build_schedule()
    fixed_now = schedule["FIXED_NOW"]
    T1_TIME = schedule["T1_TIME"]
    T2_TIME = schedule["T2_TIME"]
    T3_TIME = schedule["T3_TIME"]
    OVERLAP_TIME = schedule["OVERLAP_TIME"]
    T1_END_12H = schedule["T1_END_12H"]
    GAP_TIME = schedule["GAP_TIME"]
    NO_CONFLICT_TIME = schedule["NO_CONFLICT_TIME"]
    D1 = schedule["D1"]
    D2 = schedule["D2"]
    D3 = schedule["D3"]
    D_UNSCHED = schedule["D_UNSCHED"]

    with sync_playwright() as p:
        browser, _context, page = launch_e2e_page(
            p,
            viewport={"width": 1280, "height": 900},
        )
        fixed_ms = int(fixed_now.timestamp() * 1000)
        page.add_init_script(f"""
    (() => {{
      const fixed = {fixed_ms};
      let nowOffset = 0;
      const OriginalDate = Date;
      class MockDate extends OriginalDate {{
        constructor(...args) {{
          if (args.length === 0) return new OriginalDate(fixed);
          return new OriginalDate(...args);
        }}
        static now() {{ return fixed + (nowOffset++); }}
      }}
      MockDate.UTC = OriginalDate.UTC;
      MockDate.parse = OriginalDate.parse;
      MockDate.prototype = OriginalDate.prototype;
      Date = MockDate;
    }})();
    """)
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        # Clear any leftover state from prior runs, then set a room to bypass entry screen
        page.evaluate("localStorage.clear()")
        page.evaluate("localStorage.setItem('fortudo-active-room', 'test-room')")
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        # =========================================================================
        # TEST 1: End-time hint appears in add form
        # =========================================================================
        print("\nTEST 1: End-time hint appears in add form", flush=True)
        switch_to_scheduled(page)

        page.fill('input[name="start-time"]', T1_TIME)
        page.fill('input[name="duration-hours"]', str(D1 // 60))
        page.fill('input[name="duration-minutes"]', str(D1 % 60))
        # Trigger input event to update hint
        page.locator('input[name="duration-minutes"]').dispatch_event("input")
        page.wait_for_timeout(500)

        hint_el = page.locator("#end-time-hint")
        hint_text = hint_el.text_content().strip()
        hint_opacity = hint_el.evaluate("el => getComputedStyle(el).opacity")

        check("End-time hint shows computed end time", T1_END_12H in hint_text,
             f"Hint text: '{hint_text}', expected to contain '{T1_END_12H}'")
        check("End-time hint is visible (opacity > 0)", hint_opacity != "0",
             f"Opacity: {hint_opacity}")

        screenshot(page, "01_end_time_hint")

        # =========================================================================
        # TEST 2: No overlap warning when no tasks exist
        # =========================================================================
        print("\nTEST 2: No overlap warning when no tasks exist", flush=True)
        warning_el = page.locator("#overlap-warning")
        warning_text = warning_el.text_content().strip()
        check("No overlap warning with empty schedule", warning_text == "",
             f"Warning text: '{warning_text}'")

        # =========================================================================
        # TEST 3: Setup - add baseline tasks
        # =========================================================================
        print("\nTEST 3: Setup - add baseline tasks", flush=True)
        # Clear form first
        page.fill('input[name="description"]', "")

        add_scheduled_task(page, "Morning focus", T1_TIME, D1 // 60, D1 % 60)
        add_scheduled_task(page, "Quick sync", T2_TIME, D2 // 60, D2 % 60)
        add_scheduled_task(page, "Afternoon work", T3_TIME, D3 // 60, D3 % 60)

        scheduled_count = page.locator("#scheduled-task-list > [data-task-id]").count()
        check("Three baseline tasks created", scheduled_count == 3,
             f"Expected 3, got {scheduled_count}")

        screenshot(page, "02_baseline_tasks")

        # =========================================================================
        # TEST 4: Live overlap warning appears in add form
        # =========================================================================
        print("\nTEST 4: Live overlap warning appears in add form", flush=True)
        switch_to_scheduled(page)

        # Fill in a time that overlaps T1
        page.fill('input[name="start-time"]', OVERLAP_TIME)
        page.fill('input[name="duration-hours"]', str(D1 // 60))
        page.fill('input[name="duration-minutes"]', str(D1 % 60))
        page.locator('input[name="duration-minutes"]').dispatch_event("input")
        page.wait_for_timeout(500)

        warning_el = page.locator("#overlap-warning")
        warning_text = warning_el.text_content().strip()
        check("Overlap warning appears for conflicting time",
             len(warning_text) > 0 and "overlap" in warning_text.lower(),
             f"Warning text: '{warning_text}'")

        check("Overlap warning mentions conflicting task name",
             "Morning focus" in warning_text,
             f"Warning text: '{warning_text}'")

        screenshot(page, "03_overlap_warning_add_form")

        # =========================================================================
        # TEST 5: Add form button changes to amber "Reschedule" when overlap detected
        # =========================================================================
        print("\nTEST 5: Add form button changes to Reschedule", flush=True)
        add_btn = page.locator("#add-task-btn")
        btn_text = add_btn.text_content().strip()
        btn_class = add_btn.get_attribute("class") or ""

        check("Button text changes to Reschedule", "Reschedule" in btn_text,
             f"Button text: '{btn_text}'")
        check("Button has amber styling", "amber" in btn_class,
             f"Button classes: '{btn_class[:100]}'")

        screenshot(page, "04_reschedule_button")

        # =========================================================================
        # TEST 6: Overlap warning clears when conflict removed
        # =========================================================================
        print("\nTEST 6: Overlap warning clears when conflict removed", flush=True)
        # Change start time to the gap (no overlap)
        page.fill('input[name="start-time"]', GAP_TIME)
        page.fill('input[name="duration-hours"]', "0")
        page.fill('input[name="duration-minutes"]', "15")
        page.locator('input[name="duration-minutes"]').dispatch_event("input")
        page.wait_for_timeout(500)

        warning_text_after = page.locator("#overlap-warning").text_content().strip()
        btn_text_after = add_btn.text_content().strip()
        btn_class_after = add_btn.get_attribute("class") or ""

        check("Overlap warning clears when no conflict", warning_text_after == "",
             f"Warning text: '{warning_text_after}'")
        check("Button text restores to Add Task", "Add Task" in btn_text_after,
             f"Button text: '{btn_text_after}'")
        check("Button restores violet styling", "violet" in btn_class_after,
             f"Button classes: '{btn_class_after[:100]}'")

        screenshot(page, "05_warning_cleared")

        # =========================================================================
        # TEST 7: Reschedule button skips confirmation dialog
        # =========================================================================
        print("\nTEST 7: Reschedule button skips confirmation dialog", flush=True)
        # Set up overlap again
        page.fill('input[name="description"]', "Overlapping task")
        page.fill('input[name="start-time"]', OVERLAP_TIME)
        page.fill('input[name="duration-hours"]', "0")
        page.fill('input[name="duration-minutes"]', "30")
        page.locator('input[name="duration-minutes"]').dispatch_event("input")
        page.wait_for_timeout(500)

        # Verify overlap warning is showing
        warning_before_submit = page.locator("#overlap-warning").text_content().strip()
        check("Overlap warning present before submit", len(warning_before_submit) > 0,
             f"Warning: '{warning_before_submit}'")

        # Submit the form - should NOT show confirmation dialog
        page.click('#task-form button[type="submit"]')
        page.wait_for_timeout(800)

        # Check that the confirm modal did NOT appear (or appeared and was auto-resolved)
        confirm_modal = page.locator("#custom-confirm-modal")
        confirm_visible = confirm_modal.is_visible()
        check("Confirmation dialog skipped (pre-approved via Reschedule button)",
             not confirm_visible,
             "Confirm modal appeared when it should have been skipped")

        # Clean up any modals that might have appeared
        dismiss_modals(page)

        # Verify the task was actually added
        scheduled_count_after = page.locator("#scheduled-task-list > [data-task-id]").count()
        check("Overlapping task was added successfully", scheduled_count_after == 4,
             f"Expected 4, got {scheduled_count_after}")

        screenshot(page, "06_reschedule_skipped_confirm")

        # =========================================================================
        # TEST 8: Add unscheduled task for gap picker test
        # =========================================================================
        print("\nTEST 8: Add unscheduled task for gap picker test", flush=True)
        add_unscheduled_task(page, "Gap filler task", D_UNSCHED // 60, D_UNSCHED % 60, "high")

        unsched_count = page.locator("#unscheduled-task-list .task-card").count()
        check("Unscheduled task created for gap picker test", unsched_count >= 1,
             f"Expected >= 1, got {unsched_count}")

        screenshot(page, "07_unscheduled_for_gap")

        # =========================================================================
        # TEST 9: Gap task picker modal opens when clicking a gap
        # =========================================================================
        print("\nTEST 9: Gap task picker modal opens on gap click", flush=True)
        # Switch back to scheduled view
        switch_to_scheduled(page)
        page.wait_for_timeout(300)

        gap_elements = page.locator("#scheduled-task-list .schedule-gap")
        gap_count = gap_elements.count()

        if gap_count >= 1:
            gap_elements.nth(0).click()
            page.wait_for_timeout(500)

            gap_picker = page.locator("#gap-task-picker-modal")
            check("Gap task picker modal opens", gap_picker.is_visible(),
                 "Gap task picker modal did not appear")

            if gap_picker.is_visible():
                screenshot(page, "08_gap_picker_open")

                # Check modal content
                time_range = page.locator("#gap-picker-time-range").text_content().strip()
                check("Gap picker shows time range", len(time_range) > 0,
                     f"Time range: '{time_range}'")

                duration_text = page.locator("#gap-picker-duration").text_content().strip()
                check("Gap picker shows duration", len(duration_text) > 0,
                     f"Duration: '{duration_text}'")

                # Check that unscheduled tasks are listed
                task_options = page.locator("#gap-task-picker-list .gap-task-option")
                check("Gap picker lists unscheduled tasks", task_options.count() >= 1,
                     f"Task options: {task_options.count()}")

                if task_options.count() >= 1:
                    option_text = task_options.nth(0).text_content()
                    check("Gap picker shows task description", "Gap filler task" in option_text,
                         f"Option text: '{option_text[:80]}'")

                # Close the modal
                page.locator("#cancel-gap-task-picker-modal").click()
                page.wait_for_timeout(300)
                check("Gap picker closes on cancel", gap_picker.is_hidden(),
                     "Gap picker still visible")
        else:
            check("Gap task picker modal opens", False, f"No gap elements found ({gap_count})")
            check("Gap picker shows time range", False, "Skipped - no gaps")
            check("Gap picker shows duration", False, "Skipped - no gaps")
            check("Gap picker lists unscheduled tasks", False, "Skipped - no gaps")
            check("Gap picker shows task description", False, "Skipped - no gaps")
            check("Gap picker closes on cancel", False, "Skipped - no gaps")

        # =========================================================================
        # TEST 10: Selecting a task from gap picker schedules it
        # =========================================================================
        print("\nTEST 10: Selecting a task from gap picker schedules it", flush=True)
        gap_elements = page.locator("#scheduled-task-list .schedule-gap")
        unsched_before = page.locator("#unscheduled-task-list .task-card").count()
        sched_before = page.locator("#scheduled-task-list > [data-task-id]").count()

        if gap_elements.count() >= 1:
            gap_elements.nth(0).click()
            page.wait_for_timeout(500)

            gap_picker = page.locator("#gap-task-picker-modal")
            if gap_picker.is_visible():
                task_options = page.locator("#gap-task-picker-list .gap-task-option")
                if task_options.count() >= 1:
                    task_options.nth(0).click()
                    page.wait_for_timeout(800)

                    # Gap picker opens the schedule modal - submit it
                    schedule_modal = page.locator("#schedule-modal")
                    if schedule_modal.is_visible():
                        page.locator('#schedule-modal-form button[type="submit"]').click()
                        page.wait_for_timeout(800)
                        dismiss_modals(page)

                    sched_after = page.locator("#scheduled-task-list > [data-task-id]").count()
                    unsched_after = page.locator("#unscheduled-task-list .task-card").count()

                    check("Task scheduled from gap picker (scheduled count increased)",
                         sched_after > sched_before,
                         f"Before: {sched_before}, After: {sched_after}")
                    check("Unscheduled count decreased after gap pick",
                         unsched_after < unsched_before,
                         f"Before: {unsched_before}, After: {unsched_after}")
                else:
                    check("Task scheduled from gap picker", False, "No task options in picker")
                    check("Unscheduled count decreased after gap pick", False, "No task options")
            else:
                check("Task scheduled from gap picker", False, "Gap picker did not open")
                check("Unscheduled count decreased after gap pick", False, "Gap picker did not open")
        else:
            check("Task scheduled from gap picker", False, "No gap elements found")
            check("Unscheduled count decreased after gap pick", False, "No gap elements found")

        screenshot(page, "09_after_gap_pick")

        # =========================================================================
        # TEST 11: Edit form shows end-time hint
        # =========================================================================
        print("\nTEST 11: Edit form shows end-time hint", flush=True)
        edit_buttons = page.locator("#scheduled-task-list .btn-edit")
        if edit_buttons.count() >= 1:
            click_scheduled_action(page, 0, ".btn-edit")
            page.wait_for_timeout(500)

            edit_hint = page.locator("#scheduled-task-list .edit-end-time-hint")
            if edit_hint.count() >= 1:
                hint_text = edit_hint.nth(0).text_content().strip()
                check("Edit form shows end-time hint", len(hint_text) > 0,
                     f"Hint text: '{hint_text}'")
            else:
                check("Edit form shows end-time hint", False, "No .edit-end-time-hint element found")

            screenshot(page, "10_edit_form_hint")

            # Cancel the edit
            cancel_btn = page.locator("#scheduled-task-list .btn-edit-cancel")
            if cancel_btn.count() >= 1:
                cancel_btn.nth(0).click()
                page.wait_for_timeout(300)
        else:
            check("Edit form shows end-time hint", False, "No edit buttons found")

        # =========================================================================
        # TEST 12: Edit form shows overlap warning when creating conflict
        # =========================================================================
        print("\nTEST 12: Edit form overlap warning", flush=True)
        edit_buttons = page.locator("#scheduled-task-list .btn-edit")
        if edit_buttons.count() >= 2:
            # Edit the second task and change its time to overlap the first
            click_scheduled_action(page, 1, ".btn-edit")
            page.wait_for_timeout(500)

            edit_form = page.locator("#scheduled-task-list form[id^='edit-task-']")
            if edit_form.count() >= 1:
                # Change the start time to overlap the first task
                start_input = edit_form.nth(0).locator('input[name="start-time"]')
                start_input.fill(T1_TIME)
                start_input.dispatch_event("input")
                page.wait_for_timeout(500)

                # Check for overlap warning
                edit_warning = edit_form.nth(0).locator(".edit-overlap-warning")
                if edit_warning.count() >= 1:
                    warning_text = edit_warning.nth(0).text_content().strip()
                    check("Edit form shows overlap warning",
                         len(warning_text) > 0 and "overlap" in warning_text.lower(),
                         f"Warning text: '{warning_text}'")
                else:
                    check("Edit form shows overlap warning", False,
                         "No .edit-overlap-warning element found")

                # Check that Save button changed
                save_btn = edit_form.nth(0).locator(".btn-save-edit")
                if save_btn.count() >= 1:
                    save_text = save_btn.nth(0).text_content().strip()
                    save_class = save_btn.nth(0).get_attribute("class") or ""
                    check("Edit Save button changes to Reschedule",
                         "Reschedule" in save_text,
                         f"Button text: '{save_text}'")
                    check("Edit Save button has amber styling",
                         "amber" in save_class,
                         f"Button classes: '{save_class[:100]}'")
                else:
                    check("Edit Save button changes to Reschedule", False,
                         "No .btn-save-edit element found")
                    check("Edit Save button has amber styling", False,
                         "No .btn-save-edit element found")

                screenshot(page, "11_edit_overlap_warning")

                # Cancel the edit
                cancel_btn = edit_form.nth(0).locator(".btn-edit-cancel")
                if cancel_btn.count() >= 1:
                    cancel_btn.nth(0).click()
                    page.wait_for_timeout(300)
            else:
                check("Edit form shows overlap warning", False, "No edit form found")
                check("Edit Save button changes to Reschedule", False, "No edit form found")
                check("Edit Save button has amber styling", False, "No edit form found")
        else:
            check("Edit form shows overlap warning", False,
                 f"Need >= 2 edit buttons, got {edit_buttons.count()}")
            check("Edit Save button changes to Reschedule", False, "Skipped")
            check("Edit Save button has amber styling", False, "Skipped")

        # =========================================================================
        # TEST 13: Schedule modal shows overlap warning
        # =========================================================================
        print("\nTEST 13: Schedule modal overlap warning", flush=True)
        # Add a fresh unscheduled task for modal test
        add_unscheduled_task(page, "Modal overlap test", 0, 30, "medium")

        schedule_btns = page.locator("#unscheduled-task-list .btn-schedule-task")
        if schedule_btns.count() >= 1:
            open_unscheduled_action_menu_for_text(page, "Modal overlap test").locator(
                ".btn-schedule-task"
            ).evaluate("el => el.click()")

            schedule_modal = page.locator("#schedule-modal")
            try:
                schedule_modal.wait_for(state="visible", timeout=5000)
            except Exception:
                pass
            if schedule_modal.is_visible():
                # Fill in overlapping time
                page.fill('input[name="modal-start-time"]', OVERLAP_TIME)
                page.fill('input[name="modal-duration-hours"]', "0")
                page.fill('input[name="modal-duration-minutes"]', "30")
                page.locator('input[name="modal-duration-minutes"]').dispatch_event("input")
                page.wait_for_timeout(500)

                # Check modal end-time hint
                modal_hint = page.locator("#modal-end-time-hint")
                modal_hint_text = modal_hint.text_content().strip()
                check("Schedule modal shows end-time hint", len(modal_hint_text) > 0,
                     f"Hint: '{modal_hint_text}'")

                # Check modal overlap warning
                modal_warning = page.locator("#modal-overlap-warning")
                modal_warning_text = modal_warning.text_content().strip()
                check("Schedule modal shows overlap warning",
                     len(modal_warning_text) > 0 and "overlap" in modal_warning_text.lower(),
                     f"Warning: '{modal_warning_text}'")

                # Check modal submit button changed
                modal_btn = page.locator("#schedule-modal-submit-btn")
                modal_btn_text = modal_btn.text_content().strip()
                modal_btn_class = modal_btn.get_attribute("class") or ""
                check("Modal button changes to Reschedule",
                     "Reschedule" in modal_btn_text,
                     f"Button text: '{modal_btn_text}'")
                check("Modal button has amber styling",
                     "amber" in modal_btn_class,
                     f"Button classes: '{modal_btn_class[:100]}'")

                screenshot(page, "12_modal_overlap_warning")

                # Close the modal
                page.locator("#close-schedule-modal").click()
                page.wait_for_timeout(300)
            else:
                check("Schedule modal shows end-time hint", False, "Modal didn't open")
                check("Schedule modal shows overlap warning", False, "Modal didn't open")
                check("Modal button changes to Reschedule", False, "Modal didn't open")
                check("Modal button has amber styling", False, "Modal didn't open")
        else:
            check("Schedule modal shows end-time hint", False, "No schedule buttons found")
            check("Schedule modal shows overlap warning", False, "No schedule buttons found")
            check("Modal button changes to Reschedule", False, "No schedule buttons found")
            check("Modal button has amber styling", False, "No schedule buttons found")

        # =========================================================================
        # TEST 14: Schedule modal overlap warning clears for non-conflicting time
        # =========================================================================
        print("\nTEST 14: Schedule modal warning clears for non-conflicting time", flush=True)
        schedule_btns = page.locator("#unscheduled-task-list .btn-schedule-task")
        if schedule_btns.count() >= 1:
            open_unscheduled_action_menu_for_text(page, "Modal overlap test").locator(
                ".btn-schedule-task"
            ).evaluate("el => el.click()")

            schedule_modal = page.locator("#schedule-modal")
            try:
                schedule_modal.wait_for(state="visible", timeout=5000)
            except Exception:
                pass
            if schedule_modal.is_visible():
                # Use a time far in the future with no overlap
                page.fill('input[name="modal-start-time"]', NO_CONFLICT_TIME)
                page.fill('input[name="modal-duration-hours"]', "0")
                page.fill('input[name="modal-duration-minutes"]', "15")
                page.locator('input[name="modal-duration-minutes"]').dispatch_event("input")
                page.wait_for_timeout(500)

                modal_warning = page.locator("#modal-overlap-warning")
                modal_warning_text = modal_warning.text_content().strip()
                check("Modal warning clears for non-conflicting time",
                     modal_warning_text == "",
                     f"Warning still shows: '{modal_warning_text}'")

                modal_btn = page.locator("#schedule-modal-submit-btn")
                modal_btn_text = modal_btn.text_content().strip()
                check("Modal button restores to Schedule",
                     "Schedule" in modal_btn_text and "Reschedule" not in modal_btn_text,
                     f"Button text: '{modal_btn_text}'")

                screenshot(page, "13_modal_no_overlap")

                page.locator("#close-schedule-modal").click()
                page.wait_for_timeout(300)
            else:
                check("Modal warning clears for non-conflicting time", False, "Modal didn't open")
                check("Modal button restores to Schedule", False, "Modal didn't open")
        else:
            check("Modal warning clears for non-conflicting time", False, "No schedule buttons")
            check("Modal button restores to Schedule", False, "No schedule buttons")

        # Clear localStorage for next test suite
        page.evaluate("localStorage.clear()")

        # =========================================================================
        print("\n" + "=" * 60, flush=True)
        print("OVERLAP WARNING TEST RESULTS", flush=True)
        print("=" * 60, flush=True)
        for r in results:
            print(r, flush=True)
        print(f"\nTotal: {passed + failed} | Passed: {passed} | Failed: {failed}", flush=True)
        print("=" * 60, flush=True)

        browser.close()

        assert failed == 0, f"{failed} checks failed (see FAIL lines above)"

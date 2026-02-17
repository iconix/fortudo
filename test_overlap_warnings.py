"""E2E tests for live overlap warnings, end-time hints, gap task picker, and reschedule pre-approval."""
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import os

PORT = 9847
SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

ROOM_CODE = "test-room"

def setup_room(page):
    """Set room code in localStorage so the app skips the room entry screen."""
    page.evaluate(f"""() => {{
        localStorage.setItem('fortudo-active-room', '{ROOM_CODE}');
        localStorage.setItem('fortudo-rooms', JSON.stringify(['{ROOM_CODE}']));
    }}""")

def clear_and_setup(page):
    """Clear all state (localStorage + PouchDB) and set up a fresh room."""
    page.evaluate(f"""() => {{
        return new Promise((resolve) => {{
            const db = new PouchDB('fortudo-{ROOM_CODE}');
            db.destroy().then(() => resolve()).catch(() => resolve());
        }});
    }}""")
    page.evaluate("localStorage.clear()")
    setup_room(page)

passed = 0
failed = 0
results = []

# ---------------------------------------------------------------------------
# Dynamic future schedule
#
# All task times are computed relative to "now" so they are always in the
# future.  This avoids the ADJUST_RUNNING_TASK confirmation flow that fires
# when a task start time is in the past.
# ---------------------------------------------------------------------------

now = datetime.now()

def fmt_time(minutes_from_now):
    """Return HH:MM string for a time N minutes from now."""
    t = now + timedelta(minutes=minutes_from_now)
    return f"{t.hour:02d}:{t.minute:02d}"

def fmt_12h(minutes_from_now):
    """Return 12-hour time string (e.g. '2:30 PM') for a time N minutes from now."""
    t = now + timedelta(minutes=minutes_from_now)
    hour = t.hour % 12 or 12
    ampm = "AM" if t.hour < 12 else "PM"
    return f"{hour}:{t.minute:02d} {ampm}"

# Check how much room we have before midnight
minutes_to_midnight = (23 - now.hour) * 60 + (59 - now.minute) + 1

# Standard layout: 1h buffer, ~4h total span
# Compact layout:  10m buffer, ~60m total span (near midnight)
if minutes_to_midnight >= 300:
    OFFSET = 60
    D1, D2 = 60, 30        # Task 1: 1h, Task 2: 30m
    GAP = 60                # 1h gap between task 2 end and task 3 start
    D3 = 30                 # Task 3: 30m
    D_UNSCHED = 20          # Unscheduled task est duration: 20m
else:
    OFFSET = min(10, max(5, minutes_to_midnight - 60))
    D1, D2 = 10, 5
    GAP = 15
    D3 = 5
    D_UNSCHED = 5

# Task schedule layout:
# T1 starts at OFFSET, duration D1
# T2 starts right after T1 (back-to-back), duration D2
# GAP of free time
# T3 starts after the gap, duration D3
T1_OFF = OFFSET
T2_OFF = T1_OFF + D1
T3_OFF = T2_OFF + D2 + GAP

T1_TIME = fmt_time(T1_OFF)
T2_TIME = fmt_time(T2_OFF)
T3_TIME = fmt_time(T3_OFF)

# Overlapping time: same as T1 start (will overlap T1)
OVERLAP_TIME = T1_TIME

# End time for T1 (for hint verification)
T1_END_12H = fmt_12h(T1_OFF + D1)

# Gap midpoint for gap task picker test
GAP_START_OFF = T2_OFF + D2

print(f"Schedule: T1={T1_TIME} ({D1}m), T2={T2_TIME} ({D2}m), "
      f"T3={T3_TIME} ({D3}m)", flush=True)
print(f"Gap between T2 end and T3 start: {GAP}m", flush=True)

def test(name, condition, detail=""):
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


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto(f"http://127.0.0.1:{PORT}")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # Clear any leftover state from prior runs and set up room
    clear_and_setup(page)
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

    test("End-time hint shows computed end time", T1_END_12H in hint_text,
         f"Hint text: '{hint_text}', expected to contain '{T1_END_12H}'")
    test("End-time hint is visible (opacity > 0)", hint_opacity != "0",
         f"Opacity: {hint_opacity}")

    screenshot(page, "01_end_time_hint")

    # =========================================================================
    # TEST 2: No overlap warning when no tasks exist
    # =========================================================================
    print("\nTEST 2: No overlap warning when no tasks exist", flush=True)
    warning_el = page.locator("#overlap-warning")
    warning_text = warning_el.text_content().strip()
    test("No overlap warning with empty schedule", warning_text == "",
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
    test("Three baseline tasks created", scheduled_count == 3,
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
    test("Overlap warning appears for conflicting time",
         len(warning_text) > 0 and "overlap" in warning_text.lower(),
         f"Warning text: '{warning_text}'")

    test("Overlap warning mentions conflicting task name",
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

    test("Button text changes to Reschedule", "Reschedule" in btn_text,
         f"Button text: '{btn_text}'")
    test("Button has amber styling", "amber" in btn_class,
         f"Button classes: '{btn_class[:100]}'")

    screenshot(page, "04_reschedule_button")

    # =========================================================================
    # TEST 6: Overlap warning clears when conflict removed
    # =========================================================================
    print("\nTEST 6: Overlap warning clears when conflict removed", flush=True)
    # Change start time to the gap (no overlap)
    gap_time = fmt_time(GAP_START_OFF + 5)  # 5 minutes into the gap
    page.fill('input[name="start-time"]', gap_time)
    page.fill('input[name="duration-hours"]', "0")
    page.fill('input[name="duration-minutes"]', "15")
    page.locator('input[name="duration-minutes"]').dispatch_event("input")
    page.wait_for_timeout(500)

    warning_text_after = page.locator("#overlap-warning").text_content().strip()
    btn_text_after = add_btn.text_content().strip()
    btn_class_after = add_btn.get_attribute("class") or ""

    test("Overlap warning clears when no conflict", warning_text_after == "",
         f"Warning text: '{warning_text_after}'")
    test("Button text restores to Add Task", "Add Task" in btn_text_after,
         f"Button text: '{btn_text_after}'")
    test("Button restores teal styling", "teal" in btn_class_after,
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
    test("Overlap warning present before submit", len(warning_before_submit) > 0,
         f"Warning: '{warning_before_submit}'")

    # Submit the form - should NOT show confirmation dialog
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(800)

    # Check that the confirm modal did NOT appear (or appeared and was auto-resolved)
    confirm_modal = page.locator("#custom-confirm-modal")
    confirm_visible = confirm_modal.is_visible()
    test("Confirmation dialog skipped (pre-approved via Reschedule button)",
         not confirm_visible,
         "Confirm modal appeared when it should have been skipped")

    # Clean up any modals that might have appeared
    dismiss_modals(page)

    # Verify the task was actually added
    scheduled_count_after = page.locator("#scheduled-task-list > [data-task-id]").count()
    test("Overlapping task was added successfully", scheduled_count_after == 4,
         f"Expected 4, got {scheduled_count_after}")

    screenshot(page, "06_reschedule_skipped_confirm")

    # =========================================================================
    # TEST 8: Add unscheduled task for gap picker test
    # =========================================================================
    print("\nTEST 8: Add unscheduled task for gap picker test", flush=True)
    add_unscheduled_task(page, "Gap filler task", D_UNSCHED // 60, D_UNSCHED % 60, "high")

    unsched_count = page.locator("#unscheduled-task-list .task-card").count()
    test("Unscheduled task created for gap picker test", unsched_count >= 1,
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
        test("Gap task picker modal opens", gap_picker.is_visible(),
             "Gap task picker modal did not appear")

        if gap_picker.is_visible():
            screenshot(page, "08_gap_picker_open")

            # Check modal content
            time_range = page.locator("#gap-picker-time-range").text_content().strip()
            test("Gap picker shows time range", len(time_range) > 0,
                 f"Time range: '{time_range}'")

            duration_text = page.locator("#gap-picker-duration").text_content().strip()
            test("Gap picker shows duration", len(duration_text) > 0,
                 f"Duration: '{duration_text}'")

            # Check that unscheduled tasks are listed
            task_options = page.locator("#gap-task-picker-list .gap-task-option")
            test("Gap picker lists unscheduled tasks", task_options.count() >= 1,
                 f"Task options: {task_options.count()}")

            if task_options.count() >= 1:
                option_text = task_options.nth(0).text_content()
                test("Gap picker shows task description", "Gap filler task" in option_text,
                     f"Option text: '{option_text[:80]}'")

            # Close the modal
            page.locator("#cancel-gap-task-picker-modal").click()
            page.wait_for_timeout(300)
            test("Gap picker closes on cancel", gap_picker.is_hidden(),
                 "Gap picker still visible")
    else:
        test("Gap task picker modal opens", False, f"No gap elements found ({gap_count})")
        test("Gap picker shows time range", False, "Skipped - no gaps")
        test("Gap picker shows duration", False, "Skipped - no gaps")
        test("Gap picker lists unscheduled tasks", False, "Skipped - no gaps")
        test("Gap picker shows task description", False, "Skipped - no gaps")
        test("Gap picker closes on cancel", False, "Skipped - no gaps")

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

                test("Task scheduled from gap picker (scheduled count increased)",
                     sched_after > sched_before,
                     f"Before: {sched_before}, After: {sched_after}")
                test("Unscheduled count decreased after gap pick",
                     unsched_after < unsched_before,
                     f"Before: {unsched_before}, After: {unsched_after}")
            else:
                test("Task scheduled from gap picker", False, "No task options in picker")
                test("Unscheduled count decreased after gap pick", False, "No task options")
        else:
            test("Task scheduled from gap picker", False, "Gap picker did not open")
            test("Unscheduled count decreased after gap pick", False, "Gap picker did not open")
    else:
        test("Task scheduled from gap picker", False, "No gap elements found")
        test("Unscheduled count decreased after gap pick", False, "No gap elements found")

    screenshot(page, "09_after_gap_pick")

    # =========================================================================
    # TEST 11: Edit form shows end-time hint
    # =========================================================================
    print("\nTEST 11: Edit form shows end-time hint", flush=True)
    edit_buttons = page.locator("#scheduled-task-list .btn-edit")
    if edit_buttons.count() >= 1:
        edit_buttons.nth(0).click()
        page.wait_for_timeout(500)

        edit_hint = page.locator("#scheduled-task-list .edit-end-time-hint")
        if edit_hint.count() >= 1:
            hint_text = edit_hint.nth(0).text_content().strip()
            test("Edit form shows end-time hint", len(hint_text) > 0,
                 f"Hint text: '{hint_text}'")
        else:
            test("Edit form shows end-time hint", False, "No .edit-end-time-hint element found")

        screenshot(page, "10_edit_form_hint")

        # Cancel the edit
        cancel_btn = page.locator("#scheduled-task-list .btn-edit-cancel")
        if cancel_btn.count() >= 1:
            cancel_btn.nth(0).click()
            page.wait_for_timeout(300)
    else:
        test("Edit form shows end-time hint", False, "No edit buttons found")

    # =========================================================================
    # TEST 12: Edit form shows overlap warning when creating conflict
    # =========================================================================
    print("\nTEST 12: Edit form overlap warning", flush=True)
    edit_buttons = page.locator("#scheduled-task-list .btn-edit")
    if edit_buttons.count() >= 2:
        # Edit the second task and change its time to overlap the first
        edit_buttons.nth(1).click()
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
                test("Edit form shows overlap warning",
                     len(warning_text) > 0 and "overlap" in warning_text.lower(),
                     f"Warning text: '{warning_text}'")
            else:
                test("Edit form shows overlap warning", False,
                     "No .edit-overlap-warning element found")

            # Check that Save button changed
            save_btn = edit_form.nth(0).locator(".btn-save-edit")
            if save_btn.count() >= 1:
                save_text = save_btn.nth(0).text_content().strip()
                save_class = save_btn.nth(0).get_attribute("class") or ""
                test("Edit Save button changes to Reschedule",
                     "Reschedule" in save_text,
                     f"Button text: '{save_text}'")
                test("Edit Save button has amber styling",
                     "amber" in save_class,
                     f"Button classes: '{save_class[:100]}'")
            else:
                test("Edit Save button changes to Reschedule", False,
                     "No .btn-save-edit element found")
                test("Edit Save button has amber styling", False,
                     "No .btn-save-edit element found")

            screenshot(page, "11_edit_overlap_warning")

            # Cancel the edit
            cancel_btn = edit_form.nth(0).locator(".btn-edit-cancel")
            if cancel_btn.count() >= 1:
                cancel_btn.nth(0).click()
                page.wait_for_timeout(300)
        else:
            test("Edit form shows overlap warning", False, "No edit form found")
            test("Edit Save button changes to Reschedule", False, "No edit form found")
            test("Edit Save button has amber styling", False, "No edit form found")
    else:
        test("Edit form shows overlap warning", False,
             f"Need >= 2 edit buttons, got {edit_buttons.count()}")
        test("Edit Save button changes to Reschedule", False, "Skipped")
        test("Edit Save button has amber styling", False, "Skipped")

    # =========================================================================
    # TEST 13: Schedule modal shows overlap warning
    # =========================================================================
    print("\nTEST 13: Schedule modal overlap warning", flush=True)
    # Add a fresh unscheduled task for modal test
    add_unscheduled_task(page, "Modal overlap test", 0, 30, "medium")

    schedule_btns = page.locator("#unscheduled-task-list .btn-schedule-task")
    if schedule_btns.count() >= 1:
        schedule_btns.nth(0).click()
        page.wait_for_timeout(500)

        schedule_modal = page.locator("#schedule-modal")
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
            test("Schedule modal shows end-time hint", len(modal_hint_text) > 0,
                 f"Hint: '{modal_hint_text}'")

            # Check modal overlap warning
            modal_warning = page.locator("#modal-overlap-warning")
            modal_warning_text = modal_warning.text_content().strip()
            test("Schedule modal shows overlap warning",
                 len(modal_warning_text) > 0 and "overlap" in modal_warning_text.lower(),
                 f"Warning: '{modal_warning_text}'")

            # Check modal submit button changed
            modal_btn = page.locator("#schedule-modal-submit-btn")
            modal_btn_text = modal_btn.text_content().strip()
            modal_btn_class = modal_btn.get_attribute("class") or ""
            test("Modal button changes to Reschedule",
                 "Reschedule" in modal_btn_text,
                 f"Button text: '{modal_btn_text}'")
            test("Modal button has amber styling",
                 "amber" in modal_btn_class,
                 f"Button classes: '{modal_btn_class[:100]}'")

            screenshot(page, "12_modal_overlap_warning")

            # Close the modal
            page.locator("#close-schedule-modal").click()
            page.wait_for_timeout(300)
        else:
            test("Schedule modal shows end-time hint", False, "Modal didn't open")
            test("Schedule modal shows overlap warning", False, "Modal didn't open")
            test("Modal button changes to Reschedule", False, "Modal didn't open")
            test("Modal button has amber styling", False, "Modal didn't open")
    else:
        test("Schedule modal shows end-time hint", False, "No schedule buttons found")
        test("Schedule modal shows overlap warning", False, "No schedule buttons found")
        test("Modal button changes to Reschedule", False, "No schedule buttons found")
        test("Modal button has amber styling", False, "No schedule buttons found")

    # =========================================================================
    # TEST 14: Schedule modal overlap warning clears for non-conflicting time
    # =========================================================================
    print("\nTEST 14: Schedule modal warning clears for non-conflicting time", flush=True)
    schedule_btns = page.locator("#unscheduled-task-list .btn-schedule-task")
    if schedule_btns.count() >= 1:
        schedule_btns.nth(0).click()
        page.wait_for_timeout(500)

        schedule_modal = page.locator("#schedule-modal")
        if schedule_modal.is_visible():
            # Use a time far in the future with no overlap
            no_conflict_time = fmt_time(T3_OFF + D3 + 30)
            page.fill('input[name="modal-start-time"]', no_conflict_time)
            page.fill('input[name="modal-duration-hours"]', "0")
            page.fill('input[name="modal-duration-minutes"]', "15")
            page.locator('input[name="modal-duration-minutes"]').dispatch_event("input")
            page.wait_for_timeout(500)

            modal_warning = page.locator("#modal-overlap-warning")
            modal_warning_text = modal_warning.text_content().strip()
            test("Modal warning clears for non-conflicting time",
                 modal_warning_text == "",
                 f"Warning still shows: '{modal_warning_text}'")

            modal_btn = page.locator("#schedule-modal-submit-btn")
            modal_btn_text = modal_btn.text_content().strip()
            test("Modal button restores to Schedule",
                 "Schedule" in modal_btn_text and "Reschedule" not in modal_btn_text,
                 f"Button text: '{modal_btn_text}'")

            screenshot(page, "13_modal_no_overlap")

            page.locator("#close-schedule-modal").click()
            page.wait_for_timeout(300)
        else:
            test("Modal warning clears for non-conflicting time", False, "Modal didn't open")
            test("Modal button restores to Schedule", False, "Modal didn't open")
    else:
        test("Modal warning clears for non-conflicting time", False, "No schedule buttons")
        test("Modal button restores to Schedule", False, "No schedule buttons")

    # Clear state for next test suite
    clear_and_setup(page)

    # =========================================================================
    print("\n" + "=" * 60, flush=True)
    print("OVERLAP WARNING TEST RESULTS", flush=True)
    print("=" * 60, flush=True)
    for r in results:
        print(r, flush=True)
    print(f"\nTotal: {passed + failed} | Passed: {passed} | Failed: {failed}", flush=True)
    print("=" * 60, flush=True)

    browser.close()

    if failed > 0:
        exit(1)

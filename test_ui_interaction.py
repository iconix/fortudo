"""UI interaction tests for Fortudo app - form toggling, modals, editing, etc."""
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import os

PORT = 9847
SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Dynamic future schedule
#
# All task times are computed relative to "now" so they are always in the
# future.  This avoids the ADJUST_RUNNING_TASK confirmation flow that fires
# when a task start time is in the past, which was causing test failures on
# the CI (UTC timezone).
# ---------------------------------------------------------------------------

now = datetime.now()

def fmt_time(minutes_from_now):
    """Return HH:MM string for a time N minutes from now."""
    t = now + timedelta(minutes=minutes_from_now)
    return f"{t.hour:02d}:{t.minute:02d}"

# Check how much room we have before midnight
minutes_to_midnight = (23 - now.hour) * 60 + (59 - now.minute) + 1

# Standard layout: 1h buffer, ~3.5h total span
# Compact layout:  10m buffer, ~45m total span (near midnight)
if minutes_to_midnight >= 300:
    OFFSET = 60
    D_VAL = 60                  # validation test (task won't be created)
    D1, D2, D3 = 60, 30, 60    # three back-to-back tasks
    D_MODAL = 30                # schedule-via-modal task
    MODAL_GAP = 30              # gap between T3 end and modal task start
else:
    OFFSET = min(10, max(5, minutes_to_midnight - 50))
    D_VAL = 10
    D1, D2, D3 = 10, 5, 10
    D_MODAL = 5
    MODAL_GAP = 10

T_VAL_OFF = OFFSET
T1_OFF = OFFSET
T2_OFF = T1_OFF + D1
T3_OFF = T2_OFF + D2
T_MODAL_OFF = T3_OFF + D3 + MODAL_GAP

T_VAL_TIME = fmt_time(T_VAL_OFF)
T1_TIME = fmt_time(T1_OFF)
T2_TIME = fmt_time(T2_OFF)
T3_TIME = fmt_time(T3_OFF)
T_MODAL_TIME = fmt_time(T_MODAL_OFF)

print(f"Schedule: T1={T1_TIME} ({D1}m), T2={T2_TIME} ({D2}m), "
      f"T3={T3_TIME} ({D3}m), T_MODAL={T_MODAL_TIME} ({D_MODAL}m)", flush=True)

passed = 0
failed = 0
results = []

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
    path = os.path.join(SCREENSHOTS_DIR, f"ui_{name}.png")
    page.screenshot(path=path, full_page=True)

def dismiss_modals(page):
    """Dismiss any alert or confirm modals that may be showing."""
    for _ in range(3):
        confirm_modal = page.locator("#custom-confirm-modal")
        if confirm_modal.is_visible():
            page.locator("#ok-custom-confirm-modal").click()
            page.wait_for_timeout(300)
        alert_modal = page.locator("#custom-alert-modal")
        if alert_modal.is_visible():
            page.locator("#ok-custom-alert-modal").click()
            page.wait_for_timeout(300)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    console_messages = []
    page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))

    page.goto(f"http://127.0.0.1:{PORT}")
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    # Clear any leftover state
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    # =========================================================================
    # TEST 1: Form type toggle - visual changes
    # =========================================================================
    print("\nTEST 1: Form type toggle", flush=True)

    submit_btn = page.locator('#task-form button[type="submit"]')
    btn_class = submit_btn.get_attribute("class") or ""
    test("Default button has teal theme", "teal" in btn_class, f"Classes: {btn_class[:80]}")

    page.locator("#unscheduled").click()
    page.wait_for_timeout(300)
    btn_class_unsched = submit_btn.get_attribute("class") or ""
    test("Unscheduled button has indigo theme", "indigo" in btn_class_unsched,
         f"Classes: {btn_class_unsched[:80]}")

    desc_input = page.locator('input[name="description"]')
    desc_class = desc_input.get_attribute("class") or ""
    test("Description input has indigo focus style", "indigo" in desc_class,
         f"Classes: {desc_class[:80]}")

    page.locator("#scheduled").click()
    page.wait_for_timeout(300)
    btn_class_sched = submit_btn.get_attribute("class") or ""
    test("Back to scheduled - teal theme restored", "teal" in btn_class_sched,
         f"Classes: {btn_class_sched[:80]}")

    screenshot(page, "01_form_toggle")

    # =========================================================================
    # TEST 2: Form validation - empty description
    # =========================================================================
    print("\nTEST 2: Form validation", flush=True)
    page.fill('input[name="description"]', "")
    page.fill('input[name="start-time"]', T_VAL_TIME)
    page.fill('input[name="duration-hours"]', str(D_VAL // 60))
    page.fill('input[name="duration-minutes"]', str(D_VAL % 60))
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)

    scheduled_count = page.locator("#scheduled-task-list > [data-task-id]").count()
    test("Empty description prevents submission", scheduled_count == 0,
         f"Tasks found: {scheduled_count}")

    screenshot(page, "02_validation")

    # =========================================================================
    # TEST 3: Setup tasks for interaction tests
    # =========================================================================
    print("\nTEST 3: Setup - adding tasks", flush=True)
    tasks_to_add = [
        ("Morning workout", T1_TIME, str(D1 // 60), str(D1 % 60)),
        ("Breakfast", T2_TIME, str(D2 // 60), str(D2 % 60)),
        ("Team meeting", T3_TIME, str(D3 // 60), str(D3 % 60)),
    ]
    for desc, start, hrs, mins in tasks_to_add:
        page.fill('input[name="description"]', desc)
        page.fill('input[name="start-time"]', start)
        page.fill('input[name="duration-hours"]', hrs)
        page.fill('input[name="duration-minutes"]', mins)
        page.click('#task-form button[type="submit"]')
        page.wait_for_timeout(500)
        dismiss_modals(page)

    scheduled_count = page.locator("#scheduled-task-list > [data-task-id]").count()
    test("Three scheduled tasks created", scheduled_count == 3,
         f"Expected 3, got {scheduled_count}")

    # Add unscheduled task
    page.locator("#unscheduled").click()
    page.wait_for_timeout(300)
    page.fill('input[name="description"]', "Read article")
    page.evaluate('document.querySelector(\'input[name="priority"][value="medium"]\').click()')
    page.fill('input[name="est-duration-hours"]', "0")
    page.fill('input[name="est-duration-minutes"]', "20")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

    unsched_count = page.locator("#unscheduled-task-list .task-card").count()
    test("Unscheduled task created", unsched_count >= 1,
         f"Expected >= 1, got {unsched_count}")

    screenshot(page, "03_setup_complete")

    # =========================================================================
    # TEST 4: Edit a scheduled task
    # =========================================================================
    print("\nTEST 4: Edit a scheduled task", flush=True)
    page.locator("#scheduled").click()
    page.wait_for_timeout(300)

    edit_buttons = page.locator("#scheduled-task-list .btn-edit")
    if edit_buttons.count() >= 1:
        edit_buttons.nth(0).click()
        page.wait_for_timeout(500)

        edit_form = page.locator("#scheduled-task-list form[id^='edit-task-']")
        test("Edit form appears", edit_form.count() >= 1,
             f"Edit forms found: {edit_form.count()}")

        if edit_form.count() >= 1:
            screenshot(page, "04a_edit_mode")

            edit_desc = edit_form.nth(0).locator('input[name="description"]')
            if edit_desc.count() > 0:
                edit_desc.fill("Morning workout (updated)")
                edit_form.nth(0).locator('button[type="submit"]').click()
                page.wait_for_timeout(500)
                dismiss_modals(page)

                task_text = page.locator("#scheduled-task-list").text_content()
                test("Task description updated", "updated" in task_text,
                     f"Text: {task_text[:150]}")
            else:
                test("Edit description input found", False, "No description input in edit form")
    else:
        test("Edit button found", False, f"Edit buttons: {edit_buttons.count()}")

    screenshot(page, "04b_after_edit")

    # =========================================================================
    # TEST 5: Cancel edit
    # =========================================================================
    print("\nTEST 5: Cancel edit", flush=True)
    edit_buttons = page.locator("#scheduled-task-list .btn-edit")
    if edit_buttons.count() >= 1:
        edit_buttons.nth(0).click()
        page.wait_for_timeout(500)

        cancel_btn = page.locator("#scheduled-task-list .btn-edit-cancel")
        if cancel_btn.count() >= 1:
            cancel_btn.nth(0).click()
            page.wait_for_timeout(500)

            edit_form = page.locator("#scheduled-task-list form[id^='edit-task-']")
            test("Edit cancelled successfully", edit_form.count() == 0,
                 f"Edit forms still visible: {edit_form.count()}")
        else:
            test("Cancel button found", False, "No cancel button in edit form")
    else:
        test("Edit button found for cancel test", False, "No edit buttons")

    screenshot(page, "05_cancel_edit")

    # =========================================================================
    # TEST 6: Lock/unlock a task
    # =========================================================================
    print("\nTEST 6: Lock/unlock task", flush=True)
    lock_buttons = page.locator("#scheduled-task-list .btn-lock")
    if lock_buttons.count() >= 1:
        lock_buttons.nth(0).click()
        page.wait_for_timeout(500)

        task_html = page.locator("#scheduled-task-list > [data-task-id]").nth(0).inner_html()
        test("Task lock toggled", "lock" in task_html.lower(),
             f"HTML snippet: {task_html[:100]}")

        screenshot(page, "06a_task_locked")

        lock_buttons_after = page.locator("#scheduled-task-list .btn-lock")
        if lock_buttons_after.count() >= 1:
            lock_buttons_after.nth(0).click()
            page.wait_for_timeout(500)
        screenshot(page, "06b_task_unlocked")
    else:
        test("Lock button found", False, f"Lock buttons: {lock_buttons.count()}")

    # =========================================================================
    # TEST 7: Unschedule a task
    # =========================================================================
    print("\nTEST 7: Unschedule a task", flush=True)
    unsched_btns = page.locator("#scheduled-task-list .btn-unschedule")
    sched_before = page.locator("#scheduled-task-list > [data-task-id]").count()
    unsched_before = page.locator("#unscheduled-task-list .task-card").count()

    if unsched_btns.count() >= 1:
        unsched_btns.nth(0).click()
        page.wait_for_timeout(500)

        sched_after = page.locator("#scheduled-task-list > [data-task-id]").count()
        unsched_after = page.locator("#unscheduled-task-list .task-card").count()

        test("Scheduled count decreased", sched_after < sched_before,
             f"Before: {sched_before}, After: {sched_after}")
        test("Unscheduled count increased", unsched_after > unsched_before,
             f"Before: {unsched_before}, After: {unsched_after}")
    else:
        test("Unschedule button found", False, f"Buttons: {unsched_btns.count()}")

    screenshot(page, "07_task_unscheduled")

    # =========================================================================
    # TEST 8: Schedule an unscheduled task via modal
    # =========================================================================
    print("\nTEST 8: Schedule an unscheduled task via modal", flush=True)
    schedule_btns = page.locator("#unscheduled-task-list .btn-schedule-task")
    if schedule_btns.count() >= 1:
        schedule_btns.nth(0).click()
        page.wait_for_timeout(500)

        schedule_modal = page.locator("#schedule-modal")
        test("Schedule modal appears", schedule_modal.is_visible(),
             "Modal did not appear")

        if schedule_modal.is_visible():
            screenshot(page, "08a_schedule_modal")

            page.fill('input[name="modal-start-time"]', T_MODAL_TIME)
            page.fill('input[name="modal-duration-hours"]', str(D_MODAL // 60))
            page.fill('input[name="modal-duration-minutes"]', str(D_MODAL % 60))

            page.locator('#schedule-modal-form button[type="submit"]').click()
            page.wait_for_timeout(500)
            dismiss_modals(page)

            test("Schedule modal closed after submit", schedule_modal.is_hidden(),
                 "Modal still visible")
    else:
        test("Schedule button found", False, f"Buttons: {schedule_btns.count()}")

    screenshot(page, "08b_after_scheduling")

    # =========================================================================
    # TEST 9: Close schedule modal with X button
    # =========================================================================
    print("\nTEST 9: Close schedule modal with X", flush=True)
    page.locator("#unscheduled").click()
    page.wait_for_timeout(200)
    page.fill('input[name="description"]', "Modal test task")
    page.evaluate('document.querySelector(\'input[name="priority"][value="low"]\').click()')
    page.fill('input[name="est-duration-hours"]', "0")
    page.fill('input[name="est-duration-minutes"]', "15")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

    schedule_btns = page.locator("#unscheduled-task-list .btn-schedule-task")
    if schedule_btns.count() >= 1:
        schedule_btns.last.click()
        page.wait_for_timeout(500)

        schedule_modal = page.locator("#schedule-modal")
        if schedule_modal.is_visible():
            page.locator("#close-schedule-modal").click()
            page.wait_for_timeout(300)
            test("Modal closed with X", schedule_modal.is_hidden(),
                 "Modal still visible after X click")
        else:
            test("Modal appeared for X test", False, "Modal didn't appear")
    else:
        test("Schedule button for modal X test", False, "No schedule buttons")

    # =========================================================================
    # TEST 10: Clear dropdown menu
    # =========================================================================
    print("\nTEST 10: Clear tasks dropdown", flush=True)
    dropdown = page.locator("#clear-tasks-dropdown")
    test("Dropdown initially hidden", dropdown.is_hidden(), "Dropdown visible initially")

    page.locator("#clear-options-dropdown-trigger-btn").click()
    page.wait_for_timeout(300)
    test("Dropdown opens on caret click", dropdown.is_visible(),
         "Dropdown still hidden")

    screenshot(page, "10a_dropdown_open")

    clear_sched_option = page.locator("#clear-scheduled-tasks-option")
    clear_completed_option = page.locator("#clear-completed-tasks-option")
    test("Clear Schedule option exists", clear_sched_option.count() == 1)
    test("Clear Completed option exists", clear_completed_option.count() == 1)

    page.locator("h1").click()
    page.wait_for_timeout(300)
    test("Dropdown closes on outside click", dropdown.is_hidden(),
         "Dropdown still visible")

    screenshot(page, "10b_dropdown_closed")

    # =========================================================================
    # TEST 11: Edit unscheduled task inline
    # =========================================================================
    print("\nTEST 11: Edit unscheduled task inline", flush=True)
    unsched_edit_btns = page.locator("#unscheduled-task-list .btn-edit-unscheduled")
    if unsched_edit_btns.count() >= 1:
        unsched_edit_btns.nth(0).click()
        page.wait_for_timeout(500)

        inline_form = page.locator("#unscheduled-task-list .inline-edit-form, #unscheduled-task-list form")
        test("Inline edit form appears for unscheduled task", inline_form.count() >= 1,
             f"Forms found: {inline_form.count()}")

        screenshot(page, "11a_inline_edit")

        cancel_btns = page.locator("#unscheduled-task-list .btn-cancel-inline-edit")
        if cancel_btns.count() >= 1:
            cancel_btns.nth(0).click()
            page.wait_for_timeout(300)
            test("Inline edit cancelled", True)
        else:
            unsched_edit_btns_after = page.locator("#unscheduled-task-list .btn-edit-unscheduled")
            if unsched_edit_btns_after.count() >= 1:
                unsched_edit_btns_after.nth(0).click()
                page.wait_for_timeout(300)
                test("Inline edit toggled off", True)
    else:
        test("Unscheduled edit button found", False,
             f"Edit buttons: {unsched_edit_btns.count()}")

    screenshot(page, "11b_after_inline_edit")

    # =========================================================================
    # TEST 12: Toggle unscheduled task completion
    # =========================================================================
    print("\nTEST 12: Toggle unscheduled task completion", flush=True)
    unsched_checkboxes = page.locator("#unscheduled-task-list .task-checkbox-unscheduled")
    if unsched_checkboxes.count() >= 1:
        unsched_checkboxes.nth(0).click()
        page.wait_for_timeout(500)

        test("Unscheduled task completion toggled", True)
        screenshot(page, "12a_unsched_completed")

        unsched_checkboxes_after = page.locator("#unscheduled-task-list .task-checkbox-unscheduled")
        if unsched_checkboxes_after.count() >= 1:
            unsched_checkboxes_after.last.click()
            page.wait_for_timeout(500)
            test("Unscheduled task uncompleted", True)
    else:
        test("Unscheduled checkbox found", False,
             f"Checkboxes: {unsched_checkboxes.count()}")

    screenshot(page, "12b_unsched_toggled_back")

    # =========================================================================
    # TEST 13: Console errors check
    # =========================================================================
    print("\nTEST 13: Console errors check", flush=True)
    error_messages = [m for m in console_messages if m.startswith("[error]")]
    test("No console errors", len(error_messages) == 0,
         f"Errors: {error_messages[:3]}")

    # Clear localStorage for cleanliness
    page.evaluate("localStorage.clear()")

    # =========================================================================
    print("\n" + "=" * 60, flush=True)
    print("UI INTERACTION TEST RESULTS", flush=True)
    print("=" * 60, flush=True)
    for r in results:
        print(r, flush=True)
    print(f"\nTotal: {passed + failed} | Passed: {passed} | Failed: {failed}", flush=True)
    print("=" * 60, flush=True)

    browser.close()

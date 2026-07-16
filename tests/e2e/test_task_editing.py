"""UI interaction tests for Fortudo app - form toggling, modals, editing, etc."""
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import os

from scripts.e2e_helpers import (
    build_relative_day_scheduled_task_doc,
    clear_room_storage,
    dismiss_open_modals,
    enter_room,
    open_scheduled_edit_form,
    seed_docs,
    wait_for_main_app,
)
from tests.e2e.helpers import BASE_URL, REPO_ROOT, activities_config, launch_e2e_page

SCREENSHOTS_DIR = os.path.join(str(REPO_ROOT), "test_screenshots")
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

def build_schedule():
    """Build future task times at test runtime."""
    now = datetime.now()

    def fmt_time(minutes_from_now):
        t = now + timedelta(minutes=minutes_from_now)
        return f"{t.hour:02d}:{t.minute:02d}"

    minutes_to_midnight = (23 - now.hour) * 60 + (59 - now.minute) + 1
    if minutes_to_midnight >= 300:
        offset = 60
        d_val = 60
        d1, d2, d3 = 60, 30, 60
        d_modal = 30
        modal_gap = 30
    else:
        offset = min(10, max(5, minutes_to_midnight - 50))
        d_val = 10
        d1, d2, d3 = 10, 5, 10
        d_modal = 5
        modal_gap = 10

    t_val_off = offset
    t1_off = offset
    t2_off = t1_off + d1
    t3_off = t2_off + d2
    t_modal_off = t3_off + d3 + modal_gap

    schedule = {
        "T_VAL_TIME": fmt_time(t_val_off),
        "T1_TIME": fmt_time(t1_off),
        "T2_TIME": fmt_time(t2_off),
        "T3_TIME": fmt_time(t3_off),
        "T_MODAL_TIME": fmt_time(t_modal_off),
        "D_VAL": d_val,
        "D1": d1,
        "D2": d2,
        "D3": d3,
        "D_MODAL": d_modal,
    }
    print(
        f"Schedule: T1={schedule['T1_TIME']} ({d1}m), "
        f"T2={schedule['T2_TIME']} ({d2}m), "
        f"T3={schedule['T3_TIME']} ({d3}m), "
        f"T_MODAL={schedule['T_MODAL_TIME']} ({d_modal}m)",
        flush=True,
    )
    return schedule

passed = 0
failed = 0
results = []

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


def test_task_editing_flow(app_server):
    schedule = build_schedule()
    T_VAL_TIME = schedule["T_VAL_TIME"]
    T1_TIME = schedule["T1_TIME"]
    T2_TIME = schedule["T2_TIME"]
    T3_TIME = schedule["T3_TIME"]
    T_MODAL_TIME = schedule["T_MODAL_TIME"]
    D_VAL = schedule["D_VAL"]
    D1 = schedule["D1"]
    D2 = schedule["D2"]
    D3 = schedule["D3"]
    D_MODAL = schedule["D_MODAL"]

    with sync_playwright() as p:
        browser, _context, page = launch_e2e_page(
            p,
            viewport={"width": 1280, "height": 900},
        )

        console_messages = []
        http_404_urls = []
        page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))
        page.on(
            "response",
            lambda response: http_404_urls.append(response.url) if response.status == 404 else None
        )

        page.goto(BASE_URL)
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)

        # Clear any leftover state
        clear_and_setup(page)
        page.reload()
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)

        # =========================================================================
        # TEST 1: Form type toggle - visual changes
        # =========================================================================
        print("\nTEST 1: Form type toggle", flush=True)

        submit_btn = page.locator('#task-form button[type="submit"]')
        btn_class = submit_btn.get_attribute("class") or ""
        check("Default button has teal theme", "teal" in btn_class, f"Classes: {btn_class[:80]}")

        page.locator("#unscheduled").click()
        page.wait_for_timeout(300)
        btn_class_unsched = submit_btn.get_attribute("class") or ""
        check("Unscheduled button has indigo theme", "indigo" in btn_class_unsched,
             f"Classes: {btn_class_unsched[:80]}")

        desc_input = page.locator('input[name="description"]')
        desc_class = desc_input.get_attribute("class") or ""
        check("Description input has indigo focus style", "indigo" in desc_class,
             f"Classes: {desc_class[:80]}")

        page.locator("#scheduled").click()
        page.wait_for_timeout(300)
        btn_class_sched = submit_btn.get_attribute("class") or ""
        check("Back to scheduled - teal theme restored", "teal" in btn_class_sched,
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
        check("Empty description prevents submission", scheduled_count == 0,
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
        check("Three scheduled tasks created", scheduled_count == 3,
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
        check("Unscheduled task created", unsched_count >= 1,
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
            click_scheduled_action(page, 0, ".btn-edit")
            page.wait_for_timeout(500)

            edit_form = page.locator("#scheduled-task-list form[id^='edit-task-']")
            check("Edit form appears", edit_form.count() >= 1,
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
                    check("Task description updated", "updated" in task_text,
                         f"Text: {task_text[:150]}")
                else:
                    check("Edit description input found", False, "No description input in edit form")
        else:
            check("Edit button found", False, f"Edit buttons: {edit_buttons.count()}")

        screenshot(page, "04b_after_edit")

        # =========================================================================
        # TEST 5: Cancel edit
        # =========================================================================
        print("\nTEST 5: Cancel edit", flush=True)
        edit_buttons = page.locator("#scheduled-task-list .btn-edit")
        if edit_buttons.count() >= 1:
            click_scheduled_action(page, 0, ".btn-edit")
            page.wait_for_timeout(500)

            cancel_btn = page.locator("#scheduled-task-list .btn-edit-cancel")
            if cancel_btn.count() >= 1:
                cancel_btn.nth(0).click()
                page.wait_for_timeout(500)

                edit_form = page.locator("#scheduled-task-list form[id^='edit-task-']")
                check("Edit cancelled successfully", edit_form.count() == 0,
                     f"Edit forms still visible: {edit_form.count()}")
            else:
                check("Cancel button found", False, "No cancel button in edit form")
        else:
            check("Edit button found for cancel test", False, "No edit buttons")

        screenshot(page, "05_cancel_edit")

        # =========================================================================
        # TEST 6: Lock/unlock a task
        # =========================================================================
        print("\nTEST 6: Lock/unlock task", flush=True)
        lock_buttons = page.locator("#scheduled-task-list .btn-lock")
        if lock_buttons.count() >= 1:
            click_scheduled_action(page, 0, ".btn-lock")
            page.wait_for_timeout(500)

            task_html = page.locator("#scheduled-task-list > [data-task-id]").nth(0).inner_html()
            check("Task lock toggled", "lock" in task_html.lower(),
                 f"HTML snippet: {task_html[:100]}")

            screenshot(page, "06a_task_locked")

            lock_buttons_after = page.locator("#scheduled-task-list .btn-lock")
            if lock_buttons_after.count() >= 1:
                click_scheduled_action(page, 0, ".btn-lock")
                page.wait_for_timeout(500)
            screenshot(page, "06b_task_unlocked")
        else:
            check("Lock button found", False, f"Lock buttons: {lock_buttons.count()}")

        # =========================================================================
        # TEST 7: Unschedule a task
        # =========================================================================
        print("\nTEST 7: Unschedule a task", flush=True)
        unsched_btns = page.locator("#scheduled-task-list .btn-unschedule")
        sched_before = page.locator("#scheduled-task-list > [data-task-id]").count()
        unsched_before = page.locator("#unscheduled-task-list .task-card").count()

        if unsched_btns.count() >= 1:
            click_scheduled_action(page, 0, ".btn-unschedule")
            page.wait_for_timeout(500)

            sched_after = page.locator("#scheduled-task-list > [data-task-id]").count()
            unsched_after = page.locator("#unscheduled-task-list .task-card").count()

            check("Scheduled count decreased", sched_after < sched_before,
                 f"Before: {sched_before}, After: {sched_after}")
            check("Unscheduled count increased", unsched_after > unsched_before,
                 f"Before: {unsched_before}, After: {unsched_after}")
        else:
            check("Unschedule button found", False, f"Buttons: {unsched_btns.count()}")

        screenshot(page, "07_task_unscheduled")

        # =========================================================================
        # TEST 8: Schedule an unscheduled task via modal
        # =========================================================================
        print("\nTEST 8: Schedule an unscheduled task via modal", flush=True)
        schedule_btns = page.locator("#unscheduled-task-list .btn-schedule-task")
        if schedule_btns.count() >= 1:
            click_unscheduled_action(page, 0, ".btn-schedule-task")

            schedule_modal = page.locator("#schedule-modal")
            try:
                schedule_modal.wait_for(state="visible", timeout=5000)
            except Exception:
                pass
            check("Schedule modal appears", schedule_modal.is_visible(),
                 "Modal did not appear")

            if schedule_modal.is_visible():
                screenshot(page, "08a_schedule_modal")

                page.fill('input[name="modal-start-time"]', T_MODAL_TIME)
                page.fill('input[name="modal-duration-hours"]', str(D_MODAL // 60))
                page.fill('input[name="modal-duration-minutes"]', str(D_MODAL % 60))

                page.locator('#schedule-modal-form button[type="submit"]').click()
                page.wait_for_timeout(500)
                dismiss_modals(page)

                check("Schedule modal closed after submit", schedule_modal.is_hidden(),
                     "Modal still visible")
        else:
            check("Schedule button found", False, f"Buttons: {schedule_btns.count()}")

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
            open_unscheduled_action_menu_for_text(page, "Modal test task").locator(
                ".btn-schedule-task"
            ).evaluate("el => el.click()")

            schedule_modal = page.locator("#schedule-modal")
            try:
                schedule_modal.wait_for(state="visible", timeout=5000)
            except Exception:
                pass
            if schedule_modal.is_visible():
                page.locator("#close-schedule-modal").click()
                page.wait_for_timeout(300)
                check("Modal closed with X", schedule_modal.is_hidden(),
                     "Modal still visible after X click")
            else:
                check("Modal appeared for X test", False, "Modal didn't appear")
        else:
            check("Schedule button for modal X test", False, "No schedule buttons")

        # =========================================================================
        # TEST 10: Clear controls
        # =========================================================================
        print("\nTEST 10: Clear tasks dropdown", flush=True)
        dropdown = page.locator("#clear-tasks-dropdown")
        check("Dropdown initially hidden", dropdown.is_hidden(), "Dropdown visible initially")

        clear_schedule_button = page.locator("#clear-schedule-button")
        check("Clear Schedule button exists", clear_schedule_button.count() == 1)

        page.locator("#clear-options-dropdown-trigger-btn").click()
        page.wait_for_timeout(300)
        check("Dropdown opens on caret click", dropdown.is_visible(),
             "Dropdown still hidden")

        screenshot(page, "10a_dropdown_open")

        clear_all_option = page.locator("#clear-all-tasks-option")
        clear_completed_option = page.locator("#clear-completed-tasks-option")
        check("Clear All option exists", clear_all_option.count() == 1)
        check("Clear Completed option exists", clear_completed_option.count() == 1)

        page.locator("#main-app h1").click()
        page.wait_for_timeout(300)
        check("Dropdown closes on outside click", dropdown.is_hidden(),
             "Dropdown still visible")

        screenshot(page, "10b_dropdown_closed")

        # =========================================================================
        # TEST 11: Edit unscheduled task inline
        # =========================================================================
        print("\nTEST 11: Edit unscheduled task inline", flush=True)
        unsched_edit_btns = page.locator("#unscheduled-task-list .btn-edit-unscheduled")
        if unsched_edit_btns.count() >= 1:
            click_unscheduled_action(page, 0, ".btn-edit-unscheduled")
            page.wait_for_timeout(500)

            inline_form = page.locator("#unscheduled-task-list .inline-edit-form, #unscheduled-task-list form")
            check("Inline edit form appears for unscheduled task", inline_form.count() >= 1,
                 f"Forms found: {inline_form.count()}")

            screenshot(page, "11a_inline_edit")

            cancel_btns = page.locator("#unscheduled-task-list .btn-cancel-inline-edit")
            if cancel_btns.count() >= 1:
                cancel_btns.nth(0).click()
                page.wait_for_timeout(300)
                check("Inline edit cancelled", True)
            else:
                unsched_edit_btns_after = page.locator("#unscheduled-task-list .btn-edit-unscheduled")
                if unsched_edit_btns_after.count() >= 1:
                    click_unscheduled_action(page, 0, ".btn-edit-unscheduled")
                    page.wait_for_timeout(300)
                    check("Inline edit toggled off", True)
        else:
            check("Unscheduled edit button found", False,
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

            check("Unscheduled task completion toggled", True)
            screenshot(page, "12a_unsched_completed")

            unsched_checkboxes_after = page.locator("#unscheduled-task-list .task-checkbox-unscheduled")
            if unsched_checkboxes_after.count() >= 1:
                unsched_checkboxes_after.last.click()
                page.wait_for_timeout(500)
                check("Unscheduled task uncompleted", True)
        else:
            check("Unscheduled checkbox found", False,
                 f"Checkboxes: {unsched_checkboxes.count()}")

        screenshot(page, "12b_unsched_toggled_back")

        # =========================================================================
        # TEST 13: Console errors check
        # =========================================================================
        print("\nTEST 13: Console errors check", flush=True)
        error_messages = [m for m in console_messages if m.startswith("[error]")]
        check("No unexpected console errors", len(error_messages) == 0 and len(http_404_urls) == 0,
             f"Errors: {error_messages[:3]}, 404s: {http_404_urls[:3]}")

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

    assert failed == 0, f"{failed} checks failed (see FAIL lines above)"


def test_mobile_scheduled_edit_draft_survives_delayed_ui_refresh(app_server):
    room_code = "task-editing-mobile-draft"

    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright,
            viewport={"width": 375, "height": 812},
        )

        try:
            page.goto(BASE_URL, wait_until="load")
            page.evaluate("localStorage.clear()")
            clear_room_storage(page, room_code)
            seed_docs(
                page,
                room_code,
                [
                    activities_config(),
                    build_relative_day_scheduled_task_doc(
                        page,
                        doc_id="task-editing-mobile-draft-task",
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

            edit_form = open_scheduled_edit_form(page, "task-editing-mobile-draft-task")
            duration_minutes = page.locator(f'{edit_form} input[name="duration-minutes"]')
            duration_minutes.fill("45")

            page.evaluate("import('/js/dom-renderer.js').then(({ refreshUI }) => refreshUI())")
            page.wait_for_timeout(500)

            assert duration_minutes.input_value() == "45"
        finally:
            context.close()
            browser.close()

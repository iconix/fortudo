"""Functional tests for Fortudo app - task CRUD operations."""
from playwright.sync_api import sync_playwright
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
    path = os.path.join(SCREENSHOTS_DIR, f"func_{name}.png")
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
    page.goto(f"http://127.0.0.1:{PORT}")
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    # Clear any leftover state from prior runs
    clear_and_setup(page)
    page.reload()
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    # =========================================================================
    # TEST 1: Add a scheduled task
    # =========================================================================
    print("\nTEST 1: Add a scheduled task", flush=True)
    page.fill('input[name="description"]', "Team standup")
    page.fill('input[name="start-time"]', "09:00")
    page.fill('input[name="duration-hours"]', "0")
    page.fill('input[name="duration-minutes"]', "30")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

    scheduled_tasks = page.locator("#scheduled-task-list > [data-task-id]")
    count1 = scheduled_tasks.count()
    test("Scheduled task appears in list", count1 == 1, f"Expected 1, got {count1}")

    task_text = page.locator("#scheduled-task-list").text_content()
    test("Task description visible", "Team standup" in task_text,
         f"Text content: {task_text[:100]}")

    desc_value = page.locator('input[name="description"]').input_value()
    test("Form reset after submission", desc_value == "",
         f"Description still has: {desc_value}")

    screenshot(page, "01_scheduled_task_added")

    # =========================================================================
    # TEST 2: Add a second scheduled task
    # =========================================================================
    print("\nTEST 2: Add a second scheduled task", flush=True)
    page.fill('input[name="description"]', "Code review")
    page.fill('input[name="start-time"]', "09:30")
    page.fill('input[name="duration-hours"]', "1")
    page.fill('input[name="duration-minutes"]', "0")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

    scheduled_tasks = page.locator("#scheduled-task-list > [data-task-id]")
    count2 = scheduled_tasks.count()
    test("Two scheduled tasks in list", count2 == 2, f"Expected 2, got {count2}")

    if count2 >= 2:
        first_task = scheduled_tasks.nth(0).text_content()
        test("Tasks sorted by time (first)", "Team standup" in first_task,
             f"First task: {first_task[:80]}")
        second_task = scheduled_tasks.nth(1).text_content()
        test("Tasks sorted by time (second)", "Code review" in second_task,
             f"Second task: {second_task[:80]}")
    else:
        test("Tasks sorted by time (first)", False, f"Only {count2} tasks found")
        test("Tasks sorted by time (second)", False, f"Only {count2} tasks found")

    screenshot(page, "02_two_scheduled_tasks")

    # =========================================================================
    # TEST 3: Add an unscheduled task
    # =========================================================================
    print("\nTEST 3: Add an unscheduled task", flush=True)
    page.locator("#unscheduled").click()
    page.wait_for_timeout(300)
    page.fill('input[name="description"]', "Fix login bug")
    page.evaluate('document.querySelector(\'input[name="priority"][value="high"]\').click()')
    page.fill('input[name="est-duration-hours"]', "2")
    page.fill('input[name="est-duration-minutes"]', "0")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

    unscheduled_tasks = page.locator("#unscheduled-task-list .task-card")
    test("Unscheduled task appears", unscheduled_tasks.count() >= 1,
         f"Expected >= 1, got {unscheduled_tasks.count()}")

    unscheduled_text = page.locator("#unscheduled-task-list").text_content()
    test("Unscheduled task description visible", "Fix login bug" in unscheduled_text,
         f"Text: {unscheduled_text[:100]}")

    screenshot(page, "03_unscheduled_task_added")

    # =========================================================================
    # TEST 4: Priority sorting of unscheduled tasks
    # =========================================================================
    print("\nTEST 4: Add a low priority unscheduled task", flush=True)
    page.fill('input[name="description"]', "Write tests")
    page.evaluate('document.querySelector(\'input[name="priority"][value="low"]\').click()')
    page.fill('input[name="est-duration-hours"]', "1")
    page.fill('input[name="est-duration-minutes"]', "0")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

    unscheduled_tasks = page.locator("#unscheduled-task-list .task-card")
    unsched_count = unscheduled_tasks.count()
    test("Two unscheduled tasks", unsched_count >= 2, f"Expected >= 2, got {unsched_count}")

    if unsched_count >= 1:
        first_unscheduled = unscheduled_tasks.nth(0).text_content()
        test("High priority task sorted first", "Fix login bug" in first_unscheduled,
             f"First unscheduled: {first_unscheduled[:80]}")

    screenshot(page, "04_priority_sorted")

    # =========================================================================
    # TEST 5: Delete a scheduled task (two-click confirmation)
    # =========================================================================
    print("\nTEST 5: Delete a scheduled task", flush=True)
    page.locator("#scheduled").click()
    page.wait_for_timeout(300)

    delete_buttons = page.locator("#scheduled-task-list .btn-delete")
    del_count = delete_buttons.count()
    if del_count >= 2:
        delete_buttons.nth(1).click()
        page.wait_for_timeout(300)
        screenshot(page, "05a_delete_confirm_state")

        delete_buttons_after = page.locator("#scheduled-task-list .btn-delete")
        if delete_buttons_after.count() >= 2:
            delete_buttons_after.nth(1).click()
            page.wait_for_timeout(500)

        scheduled_tasks_after = page.locator("#scheduled-task-list > [data-task-id]")
        test("Task deleted after confirmation", scheduled_tasks_after.count() == 1,
             f"Expected 1, got {scheduled_tasks_after.count()}")
        screenshot(page, "05b_task_deleted")
    else:
        test("Delete buttons found", False, f"Expected >= 2, got {del_count}")

    # =========================================================================
    # TEST 6: Delete an unscheduled task
    # =========================================================================
    print("\nTEST 6: Delete an unscheduled task", flush=True)
    unsched_delete_buttons = page.locator("#unscheduled-task-list .btn-delete-unscheduled")
    initial_unsched_count = page.locator("#unscheduled-task-list .task-card").count()

    if unsched_delete_buttons.count() >= 1:
        unsched_delete_buttons.nth(0).click()
        page.wait_for_timeout(300)
        unsched_delete_buttons_after = page.locator("#unscheduled-task-list .btn-delete-unscheduled")
        if unsched_delete_buttons_after.count() >= 1:
            unsched_delete_buttons_after.nth(0).click()
            page.wait_for_timeout(500)
            dismiss_modals(page)

        final_unsched_count = page.locator("#unscheduled-task-list .task-card").count()
        test("Unscheduled task deleted", final_unsched_count < initial_unsched_count,
             f"Before: {initial_unsched_count}, After: {final_unsched_count}")
    else:
        test("Unscheduled delete buttons found", False,
             f"Got {unsched_delete_buttons.count()}")

    screenshot(page, "06_after_deletes")

    # =========================================================================
    # TEST 7: Complete a scheduled task
    # =========================================================================
    print("\nTEST 7: Complete a scheduled task", flush=True)
    checkboxes = page.locator("#scheduled-task-list .checkbox")
    if checkboxes.count() >= 1:
        checkboxes.nth(0).click()
        page.wait_for_timeout(1000)
        dismiss_modals(page)

        task_item = page.locator("#scheduled-task-list > [data-task-id]").nth(0)
        task_html = task_item.inner_html()
        test("Task marked as completed",
             "completed" in task_html.lower() or "line-through" in task_html or "check" in task_html.lower(),
             f"Task HTML snippet: {task_html[:150]}")
    else:
        test("Checkbox found for completion", False, "No checkboxes found")

    screenshot(page, "07_task_completed")

    # =========================================================================
    # TEST 8: Clear All Tasks
    # =========================================================================
    print("\nTEST 8: Clear All Tasks", flush=True)
    page.fill('input[name="description"]', "Temp task")
    page.fill('input[name="start-time"]', "14:00")
    page.fill('input[name="duration-hours"]', "0")
    page.fill('input[name="duration-minutes"]', "30")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

    page.locator("#delete-all").click()
    page.wait_for_timeout(500)

    confirm_modal = page.locator("#custom-confirm-modal")
    test("Confirm modal appears for clear all", confirm_modal.is_visible(),
         "Confirm modal did not appear")

    if confirm_modal.is_visible():
        screenshot(page, "08a_clear_all_confirm")
        page.locator("#ok-custom-confirm-modal").click()
        page.wait_for_timeout(500)
        dismiss_modals(page)

    scheduled_after_clear = page.locator("#scheduled-task-list > [data-task-id]").count()
    unscheduled_after_clear = page.locator("#unscheduled-task-list .task-card").count()
    test("All tasks cleared", scheduled_after_clear == 0 and unscheduled_after_clear == 0,
         f"Scheduled: {scheduled_after_clear}, Unscheduled: {unscheduled_after_clear}")

    screenshot(page, "08b_all_cleared")

    # =========================================================================
    # TEST 9: PouchDB persistence
    # =========================================================================
    print("\nTEST 9: PouchDB persistence", flush=True)
    page.fill('input[name="description"]', "Persistent task")
    page.fill('input[name="start-time"]', "10:00")
    page.fill('input[name="duration-hours"]', "1")
    page.fill('input[name="duration-minutes"]', "0")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

    # Verify the task was stored in PouchDB (IndexedDB) rather than localStorage
    pouch_db_count = page.evaluate("""() => {
        return new Promise((resolve) => {
            const db = new PouchDB('fortudo-test-room');
            db.allDocs().then(result => resolve(result.total_rows)).catch(() => resolve(-1));
        });
    }""")
    test("Tasks saved to PouchDB",
         pouch_db_count is not None and pouch_db_count >= 1,
         f"PouchDB doc count: {pouch_db_count}")

    page.reload()
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    scheduled_after_reload = page.locator("#scheduled-task-list > [data-task-id]").count()
    test("Tasks persist after reload", scheduled_after_reload >= 1,
         f"Expected >= 1, got {scheduled_after_reload}")

    reload_text = page.locator("#scheduled-task-list").text_content()
    test("Persistent task description after reload", "Persistent task" in reload_text,
         f"Text: {reload_text[:100]}")

    screenshot(page, "09_after_reload")

    # Clear localStorage for next test suite
    page.evaluate("localStorage.clear()")

    # =========================================================================
    print("\n" + "=" * 60, flush=True)
    print("FUNCTIONAL TEST RESULTS", flush=True)
    print("=" * 60, flush=True)
    for r in results:
        print(r, flush=True)
    print(f"\nTotal: {passed + failed} | Passed: {passed} | Failed: {failed}", flush=True)
    print("=" * 60, flush=True)

    browser.close()

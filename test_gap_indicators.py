"""E2E tests for visual gap indicators between scheduled tasks."""
from playwright.sync_api import sync_playwright
import os

PORT = 9847
SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

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
    path = os.path.join(SCREENSHOTS_DIR, f"gap_{name}.png")
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

def add_scheduled_task(page, description, start_time, hours, minutes):
    """Helper to add a scheduled task."""
    page.fill('input[name="description"]', description)
    page.fill('input[name="start-time"]', start_time)
    page.fill('input[name="duration-hours"]', str(hours))
    page.fill('input[name="duration-minutes"]', str(minutes))
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    dismiss_modals(page)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto(f"http://127.0.0.1:{PORT}")
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    # Clear any leftover state from prior runs
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    # =========================================================================
    # TEST 1: No gap indicator for back-to-back tasks
    # =========================================================================
    print("\nTEST 1: No gap indicator for back-to-back tasks", flush=True)
    add_scheduled_task(page, "Morning standup", "09:00", 0, 30)
    add_scheduled_task(page, "Code review", "09:30", 1, 0)

    gap_elements = page.locator("#scheduled-task-list .schedule-gap")
    gap_count = gap_elements.count()
    test("No gap between back-to-back tasks", gap_count == 0,
         f"Expected 0 gaps, got {gap_count}")

    screenshot(page, "01_back_to_back_no_gap")

    # =========================================================================
    # TEST 2: Gap indicator appears between tasks with free time
    # =========================================================================
    print("\nTEST 2: Gap indicator appears between tasks with free time", flush=True)
    add_scheduled_task(page, "Lunch break", "12:00", 1, 0)

    gap_elements = page.locator("#scheduled-task-list .schedule-gap")
    gap_count = gap_elements.count()
    test("Gap appears between non-adjacent tasks", gap_count >= 1,
         f"Expected >= 1 gaps, got {gap_count}")

    screenshot(page, "02_gap_between_tasks")

    # =========================================================================
    # TEST 3: Gap shows correct duration label
    # =========================================================================
    print("\nTEST 3: Gap shows correct duration label", flush=True)
    # Code review ends at 10:30, Lunch starts at 12:00 => 1h 30m gap
    if gap_count >= 1:
        gap_text = gap_elements.nth(0).text_content()
        test("Gap shows duration with 'free' label", "free" in gap_text,
             f"Gap text: {gap_text}")
        test("Gap shows correct duration (1h 30m)", "1h 30m" in gap_text,
             f"Gap text: {gap_text}")
    else:
        test("Gap shows duration with 'free' label", False, "No gap elements found")
        test("Gap shows correct duration (1h 30m)", False, "No gap elements found")

    # =========================================================================
    # TEST 4: Gap has aria-hidden for accessibility
    # =========================================================================
    print("\nTEST 4: Gap has aria-hidden for accessibility", flush=True)
    if gap_count >= 1:
        aria_hidden = gap_elements.nth(0).get_attribute("aria-hidden")
        test("Gap has aria-hidden='true'", aria_hidden == "true",
             f"aria-hidden: {aria_hidden}")
    else:
        test("Gap has aria-hidden='true'", False, "No gap elements found")

    # =========================================================================
    # TEST 5: Gap has data attributes for time range
    # =========================================================================
    print("\nTEST 5: Gap has data attributes for time range", flush=True)
    if gap_count >= 1:
        gap_start = gap_elements.nth(0).get_attribute("data-gap-start")
        gap_end = gap_elements.nth(0).get_attribute("data-gap-end")
        test("Gap has data-gap-start attribute", gap_start is not None and len(gap_start) > 0,
             f"data-gap-start: {gap_start}")
        test("Gap has data-gap-end attribute", gap_end is not None and len(gap_end) > 0,
             f"data-gap-end: {gap_end}")
    else:
        test("Gap has data-gap-start attribute", False, "No gap elements found")
        test("Gap has data-gap-end attribute", False, "No gap elements found")

    # =========================================================================
    # TEST 6: Multiple gaps between multiple tasks
    # =========================================================================
    print("\nTEST 6: Multiple gaps between multiple tasks", flush=True)
    add_scheduled_task(page, "Afternoon focus", "15:00", 1, 0)

    gap_elements = page.locator("#scheduled-task-list .schedule-gap")
    gap_count = gap_elements.count()
    # Gaps: after Code review (10:30) -> Lunch (12:00), after Lunch (13:00) -> Afternoon (15:00)
    test("Two gaps for three non-adjacent task pairs", gap_count == 2,
         f"Expected 2 gaps, got {gap_count}")

    screenshot(page, "03_multiple_gaps")

    # =========================================================================
    # TEST 7: Gap elements don't have data-task-id (not clickable as tasks)
    # =========================================================================
    print("\nTEST 7: Gap elements don't have data-task-id", flush=True)
    gap_elements = page.locator("#scheduled-task-list .schedule-gap")
    all_gaps_clean = True
    for i in range(gap_elements.count()):
        task_id = gap_elements.nth(i).get_attribute("data-task-id")
        if task_id is not None:
            all_gaps_clean = False
            break
    test("Gap elements have no data-task-id", all_gaps_clean,
         "Found data-task-id on a gap element")

    # =========================================================================
    # TEST 8: Gap contains dashed border styling
    # =========================================================================
    print("\nTEST 8: Gap contains dashed border styling", flush=True)
    if gap_elements.count() >= 1:
        border_spans = gap_elements.nth(0).locator(".border-dashed")
        test("Gap has dashed border elements", border_spans.count() >= 2,
             f"Expected >= 2 border spans, got {border_spans.count()}")
    else:
        test("Gap has dashed border elements", False, "No gap elements found")

    # =========================================================================
    # TEST 9: Gaps persist after page reload
    # =========================================================================
    print("\nTEST 9: Gaps persist after page reload", flush=True)
    page.reload()
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    gap_elements_after_reload = page.locator("#scheduled-task-list .schedule-gap")
    test("Gaps still present after reload", gap_elements_after_reload.count() == 2,
         f"Expected 2 gaps, got {gap_elements_after_reload.count()}")

    screenshot(page, "04_gaps_after_reload")

    # =========================================================================
    # TEST 10: Single task has no gap indicators
    # =========================================================================
    print("\nTEST 10: Single task has no gap indicators", flush=True)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    add_scheduled_task(page, "Solo task", "10:00", 1, 0)

    gap_elements = page.locator("#scheduled-task-list .schedule-gap")
    test("No gaps with single task", gap_elements.count() == 0,
         f"Expected 0 gaps, got {gap_elements.count()}")

    screenshot(page, "05_single_task_no_gap")

    # =========================================================================
    # TEST 11: Boundary marker visible when all tasks are in the future
    # =========================================================================
    print("\nTEST 11: Boundary marker visible when all tasks are in the future", flush=True)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    add_scheduled_task(page, "Future task", "23:00", 0, 30)

    # Wait for the 1-second refreshCurrentGapHighlight() interval to fire
    page.wait_for_timeout(1500)

    boundary_before = page.locator('#scheduled-task-list .schedule-boundary[data-boundary="before"]')
    test("Before-boundary marker exists", boundary_before.count() == 1,
         f"Expected 1 before-boundary, got {boundary_before.count()}")

    # The "before" boundary should be visible since current time is before 23:00
    is_visible = boundary_before.first.is_visible()
    test("Before-boundary marker is visible for future task", is_visible,
         "Before-boundary marker should be visible when now < first task start")

    screenshot(page, "06_boundary_before_future_task")

    # Clear localStorage for next test suite
    page.evaluate("localStorage.clear()")

    # =========================================================================
    print("\n" + "=" * 60, flush=True)
    print("GAP INDICATOR TEST RESULTS", flush=True)
    print("=" * 60, flush=True)
    for r in results:
        print(r, flush=True)
    print(f"\nTotal: {passed + failed} | Passed: {passed} | Failed: {failed}", flush=True)
    print("=" * 60, flush=True)

    browser.close()

    if failed > 0:
        exit(1)

"""E2E tests for visual gap indicators between scheduled tasks."""
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import os

from tests.e2e.helpers import BASE_URL, REPO_ROOT, launch_e2e_page

import pytest

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

passed = 0
failed = 0
results = []

STANDARD_SPAN = 240
COMPACT_SPAN = 21


def duration_label(minutes):
    """Return duration text matching the app's calculateHoursAndMinutes."""
    h, m = divmod(minutes, 60)
    parts = []
    if h:
        parts.append(f"{h}h")
    if m:
        parts.append(f"{m}m")
    return " ".join(parts) or "0m"


def build_schedule():
    """Build future task times at test runtime."""
    now = datetime.now()

    def fmt_time(minutes_from_now):
        t = now + timedelta(minutes=minutes_from_now)
        return f"{t.hour:02d}:{t.minute:02d}"

    minutes_to_midnight = (23 - now.hour) * 60 + (59 - now.minute) + 1
    if minutes_to_midnight >= STANDARD_SPAN + 5:
        offset = 60
        d1, d2, d3, d4 = 15, 30, 30, 30
        gap1 = 45
        gap2 = 30
    elif minutes_to_midnight >= COMPACT_SPAN + 5:
        offset = 5
        d1, d2, d3, d4 = 2, 2, 2, 2
        gap1 = 5
        gap2 = 3
    else:
        pytest.skip(
            f"Only {minutes_to_midnight}m to midnight, need at least {COMPACT_SPAN + 5}m"
        )

    t1_off = offset
    t2_off = t1_off + d1
    t3_off = t2_off + d2 + gap1
    t4_off = t3_off + d3 + gap2
    schedule = {
        "T1_TIME": fmt_time(t1_off),
        "T2_TIME": fmt_time(t2_off),
        "T3_TIME": fmt_time(t3_off),
        "T4_TIME": fmt_time(t4_off),
        "EXPECTED_GAP_LABEL": duration_label(gap1),
        "D1": d1,
        "D2": d2,
        "D3": d3,
        "D4": d4,
    }
    print(
        f"Schedule: T1={schedule['T1_TIME']} ({d1}m), "
        f"T2={schedule['T2_TIME']} ({d2}m), "
        f"T3={schedule['T3_TIME']} ({d3}m), "
        f"T4={schedule['T4_TIME']} ({d4}m)",
        flush=True,
    )
    print(f"Expected first gap: {schedule['EXPECTED_GAP_LABEL']} free", flush=True)
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


def test_schedule_gaps_flow():
    schedule = build_schedule()
    T1_TIME = schedule["T1_TIME"]
    T2_TIME = schedule["T2_TIME"]
    T3_TIME = schedule["T3_TIME"]
    T4_TIME = schedule["T4_TIME"]
    EXPECTED_GAP_LABEL = schedule["EXPECTED_GAP_LABEL"]
    D1 = schedule["D1"]
    D2 = schedule["D2"]
    D3 = schedule["D3"]
    D4 = schedule["D4"]

    with sync_playwright() as p:
        browser, _context, page = launch_e2e_page(
            p,
            viewport={"width": 1280, "height": 900},
        )
        page.goto(BASE_URL)
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)

        # Clear any leftover state from prior runs
        clear_and_setup(page)
        page.reload()
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)

        # =========================================================================
        # TEST 1: No gap indicator for back-to-back tasks
        # =========================================================================
        print("\nTEST 1: No gap indicator for back-to-back tasks", flush=True)
        add_scheduled_task(page, "Morning standup", T1_TIME, D1 // 60, D1 % 60)
        add_scheduled_task(page, "Code review", T2_TIME, D2 // 60, D2 % 60)

        gap_elements = page.locator("#scheduled-task-list .schedule-gap")
        gap_count = gap_elements.count()
        check("No gap between back-to-back tasks", gap_count == 0,
             f"Expected 0 gaps, got {gap_count}")

        screenshot(page, "01_back_to_back_no_gap")

        # =========================================================================
        # TEST 2: Gap indicator appears between tasks with free time
        # =========================================================================
        print("\nTEST 2: Gap indicator appears between tasks with free time", flush=True)
        add_scheduled_task(page, "Lunch break", T3_TIME, D3 // 60, D3 % 60)

        gap_elements = page.locator("#scheduled-task-list .schedule-gap")
        gap_count = gap_elements.count()
        check("Gap appears between non-adjacent tasks", gap_count >= 1,
             f"Expected >= 1 gaps, got {gap_count}")

        screenshot(page, "02_gap_between_tasks")

        # =========================================================================
        # TEST 3: Gap shows correct duration label
        # =========================================================================
        print("\nTEST 3: Gap shows correct duration label", flush=True)
        if gap_count >= 1:
            gap_text = gap_elements.nth(0).text_content()
            check("Gap shows duration with 'free' label", "free" in gap_text,
                 f"Gap text: {gap_text}")
            check(f"Gap shows correct duration ({EXPECTED_GAP_LABEL})",
                 EXPECTED_GAP_LABEL in gap_text,
                 f"Gap text: {gap_text}")
        else:
            check("Gap shows duration with 'free' label", False, "No gap elements found")
            check(f"Gap shows correct duration ({EXPECTED_GAP_LABEL})", False,
                 "No gap elements found")

        # =========================================================================
        # TEST 4: Gap is interactive (clickable) for scheduling
        # =========================================================================
        print("\nTEST 4: Gap is interactive for scheduling", flush=True)
        if gap_count >= 1:
            role = gap_elements.nth(0).get_attribute("role")
            check("Gap has role='button'", role == "button",
                 f"role: {role}")
        else:
            check("Gap has role='button'", False, "No gap elements found")

        # =========================================================================
        # TEST 5: Gap has data attributes for time range
        # =========================================================================
        print("\nTEST 5: Gap has data attributes for time range", flush=True)
        if gap_count >= 1:
            gap_start = gap_elements.nth(0).get_attribute("data-gap-start")
            gap_end = gap_elements.nth(0).get_attribute("data-gap-end")
            check("Gap has data-gap-start attribute", gap_start is not None and len(gap_start) > 0,
                 f"data-gap-start: {gap_start}")
            check("Gap has data-gap-end attribute", gap_end is not None and len(gap_end) > 0,
                 f"data-gap-end: {gap_end}")
        else:
            check("Gap has data-gap-start attribute", False, "No gap elements found")
            check("Gap has data-gap-end attribute", False, "No gap elements found")

        # =========================================================================
        # TEST 6: Multiple gaps between multiple tasks
        # =========================================================================
        print("\nTEST 6: Multiple gaps between multiple tasks", flush=True)
        add_scheduled_task(page, "Afternoon focus", T4_TIME, D4 // 60, D4 % 60)

        gap_elements = page.locator("#scheduled-task-list .schedule-gap")
        gap_count = gap_elements.count()
        check("Two gaps for three non-adjacent task pairs", gap_count == 2,
             f"Expected 2 gaps, got {gap_count}")

        screenshot(page, "03_multiple_gaps")

        # =========================================================================
        # TEST 7: Gap elements don't have data-task-id (not treated as tasks)
        # =========================================================================
        print("\nTEST 7: Gap elements don't have data-task-id", flush=True)
        gap_elements = page.locator("#scheduled-task-list .schedule-gap")
        all_gaps_clean = True
        for i in range(gap_elements.count()):
            task_id = gap_elements.nth(i).get_attribute("data-task-id")
            if task_id is not None:
                all_gaps_clean = False
                break
        check("Gap elements have no data-task-id", all_gaps_clean,
             "Found data-task-id on a gap element")

        # =========================================================================
        # TEST 8: Gap contains dashed border styling
        # =========================================================================
        print("\nTEST 8: Gap contains dashed border styling", flush=True)
        if gap_elements.count() >= 1:
            border_spans = gap_elements.nth(0).locator(".border-dashed")
            check("Gap has dashed border elements", border_spans.count() >= 2,
                 f"Expected >= 2 border spans, got {border_spans.count()}")
        else:
            check("Gap has dashed border elements", False, "No gap elements found")

        # =========================================================================
        # TEST 9: Gaps persist after page reload
        # =========================================================================
        print("\nTEST 9: Gaps persist after page reload", flush=True)
        page.reload()
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)

        gap_elements_after_reload = page.locator("#scheduled-task-list .schedule-gap")
        check("Gaps still present after reload", gap_elements_after_reload.count() == 2,
             f"Expected 2 gaps, got {gap_elements_after_reload.count()}")

        screenshot(page, "04_gaps_after_reload")

        # =========================================================================
        # TEST 10: Single task has no gap indicators
        # =========================================================================
        print("\nTEST 10: Single task has no gap indicators", flush=True)
        clear_and_setup(page)
        page.reload()
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)

        add_scheduled_task(page, "Solo task", T1_TIME, D1 // 60, D1 % 60)

        gap_elements = page.locator("#scheduled-task-list .schedule-gap")
        check("No gaps with single task", gap_elements.count() == 0,
             f"Expected 0 gaps, got {gap_elements.count()}")

        screenshot(page, "05_single_task_no_gap")

        # =========================================================================
        # TEST 11: Boundary marker visible when all tasks are in the future
        # =========================================================================
        print("\nTEST 11: Boundary marker visible when all tasks are in the future", flush=True)
        clear_and_setup(page)
        page.reload()
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)

        add_scheduled_task(page, "Future task", T1_TIME, 0, D1)

        # Wait for the 1-second refreshCurrentGapHighlight() interval to fire
        page.wait_for_timeout(1500)

        boundary_before = page.locator('#scheduled-task-list .schedule-boundary[data-boundary="before"]')
        check("Before-boundary marker exists", boundary_before.count() == 1,
             f"Expected 1 before-boundary, got {boundary_before.count()}")

        # The "before" boundary should be visible since current time is before the task
        is_visible = boundary_before.first.is_visible()
        check("Before-boundary marker is visible for future task", is_visible,
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

        assert failed == 0, f"{failed} checks failed (see FAIL lines above)"

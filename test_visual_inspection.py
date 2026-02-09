"""Visual inspection of the Fortudo app - takes screenshots in various states."""
from playwright.sync_api import sync_playwright
import os

PORT = 9847
SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def screenshot(page, name):
    path = os.path.join(SCREENSHOTS_DIR, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"  [screenshot] {name}.png", flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto(f"http://127.0.0.1:{PORT}")
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)  # Let JS initialize and CDNs settle

    # 1. Initial empty state
    print("1. Initial empty state", flush=True)
    screenshot(page, "01_initial_state")

    # 2. Scheduled task form (default)
    print("2. Scheduled task form visible", flush=True)
    scheduled_radio = page.locator("#scheduled")
    assert scheduled_radio.is_checked(), "Scheduled radio should be checked by default"
    time_inputs = page.locator("#time-inputs")
    assert time_inputs.is_visible(), "Time inputs should be visible for scheduled mode"
    priority_input = page.locator("#priority-input")
    assert priority_input.is_hidden(), "Priority input should be hidden for scheduled mode"
    screenshot(page, "02_scheduled_form")

    # 3. Switch to unscheduled form
    print("3. Unscheduled task form", flush=True)
    page.locator("#unscheduled").click()
    page.wait_for_timeout(300)
    assert time_inputs.is_hidden(), "Time inputs should be hidden for unscheduled mode"
    assert priority_input.is_visible(), "Priority input should be visible for unscheduled mode"
    screenshot(page, "03_unscheduled_form")

    # 4. Switch back to scheduled and add a task
    print("4. Adding a scheduled task", flush=True)
    page.locator("#scheduled").click()
    page.wait_for_timeout(300)
    page.fill('input[name="description"]', "Morning standup meeting")
    page.fill('input[name="start-time"]', "09:00")
    page.fill('input[name="duration-hours"]', "0")
    page.fill('input[name="duration-minutes"]', "30")
    screenshot(page, "04_filled_scheduled_form")

    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    screenshot(page, "05_after_adding_scheduled_task")

    # 5. Add a second scheduled task
    print("5. Adding a second scheduled task", flush=True)
    page.fill('input[name="description"]', "Code review session")
    page.fill('input[name="start-time"]', "09:30")
    page.fill('input[name="duration-hours"]', "1")
    page.fill('input[name="duration-minutes"]', "0")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    screenshot(page, "06_two_scheduled_tasks")

    # 6. Add an unscheduled task
    print("6. Adding an unscheduled task", flush=True)
    page.locator("#unscheduled").click()
    page.wait_for_timeout(300)
    page.fill('input[name="description"]', "Review pull requests")
    # Use force=True for hidden radio inputs (styled via Tailwind peer class)
    page.evaluate('document.querySelector(\'input[name="priority"][value="high"]\').click()')
    page.fill('input[name="est-duration-hours"]', "0")
    page.fill('input[name="est-duration-minutes"]', "45")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    screenshot(page, "07_with_unscheduled_task")

    # 7. Add a second unscheduled task with low priority
    print("7. Adding a low priority unscheduled task", flush=True)
    page.fill('input[name="description"]', "Update documentation")
    page.evaluate('document.querySelector(\'input[name="priority"][value="low"]\').click()')
    page.fill('input[name="est-duration-hours"]', "1")
    page.fill('input[name="est-duration-minutes"]', "30")
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(500)
    screenshot(page, "08_multiple_tasks")

    # 8. Check the info panel (clock and date)
    print("8. Info panel check", flush=True)
    current_time = page.locator("#current-time").text_content()
    current_date = page.locator("#current-date").text_content()
    print(f"   Current time displayed: {current_time}", flush=True)
    print(f"   Current date displayed: {current_date}", flush=True)
    assert current_time, "Current time should be displayed"
    assert current_date, "Current date should be displayed"

    # 9. Mobile viewport
    print("9. Mobile viewport", flush=True)
    page.set_viewport_size({"width": 375, "height": 812})
    page.wait_for_timeout(300)
    screenshot(page, "09_mobile_view")

    # 10. Tablet viewport
    print("10. Tablet viewport", flush=True)
    page.set_viewport_size({"width": 768, "height": 1024})
    page.wait_for_timeout(300)
    screenshot(page, "10_tablet_view")

    print("\n=== Visual Inspection Complete ===", flush=True)
    print(f"Screenshots saved to: {SCREENSHOTS_DIR}", flush=True)

    browser.close()

from playwright.sync_api import expect, sync_playwright

from scripts.e2e_helpers import build_relative_day_scheduled_task_doc
from tests.e2e.helpers import launch_e2e_page, seed_and_enter_room


def test_replacing_the_reviewed_conflict_requires_confirmation(app_server):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright, context_options={"timezone_id": "UTC"})
        try:
            page.clock.set_fixed_time("2026-07-07T08:00:00Z")
            original = build_relative_day_scheduled_task_doc(
                page, doc_id="task-a", description="Original", day_offset=0,
                start_hour=10, start_minute=0, duration_minutes=30,
            )
            seed_and_enter_room(page, "approval-refresh", [original])
            form = page.locator("#task-form")
            form.locator('[name="description"]').fill("New task")
            form.locator('[name="start-time"]').fill("10:00")
            form.locator('[name="duration-minutes"]').fill("15")
            expect(page.locator("#overlap-warning")).to_contain_text("Original")
            page.evaluate("""async () => {
                const { getDb, loadTasks } = await import('/js/storage.js');
                const { updateTaskStateFromStorage } = await import('/js/tasks/manager.js');
                const db = getDb();
                const original = await db.get('task-a');
                const { _rev, ...replacement } = original;
                await db.remove(original);
                await db.put({...replacement, id: 'task-b', _id: 'task-b', description: 'Replacement'});
                updateTaskStateFromStorage(await loadTasks());
            }""")
            form.locator('button[type="submit"]').click()
            expect(page.locator("#custom-confirm-modal")).to_be_visible()
            page.locator("#cancel-custom-confirm-modal").click()
            saved = page.evaluate("""async () => {
                const { loadTasks } = await import('/js/storage.js');
                return (await loadTasks()).map(task => [task.id, task.startDateTime]);
            }""")
            assert saved == [["task-b", original["startDateTime"]]]
        finally:
            context.close()
            browser.close()

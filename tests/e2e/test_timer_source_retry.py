import pytest
from playwright.sync_api import expect, sync_playwright

from scripts.e2e_helpers import start_timer_from_unscheduled_task
from tests.e2e.helpers import activities_config, launch_e2e_page, seed_and_enter_room


@pytest.mark.parametrize("interrupt_id", ["task-source", "config-running-activity"])
def test_retry_source_cleanup_after_reload(app_server, interrupt_id):
    with sync_playwright() as p:
        browser, context, page = launch_e2e_page(p)
        try:
            task = dict(_id="task-source", id="task-source", docType="task", type="unscheduled",
                        description="Linked work", status="incomplete", priority="medium", estDuration=15)
            seed_and_enter_room(page, "source-retry", [activities_config(), task])
            start_timer_from_unscheduled_task(page, "task-source", "Linked work")
            page.evaluate("""async interruptId => {
                const db = (await import('/js/storage.js')).getDb();
                const put = db.put.bind(db);
                db.put = (doc, ...args) => {
                    if (doc._id === interruptId && doc._deleted) {
                        window.cleanupInterrupted = true;
                        return new Promise(() => {});
                    }
                    return put(doc, ...args);
                };
                const bulk = db.bulkDocs.bind(db);
                db.bulkDocs = (docs, ...args) => {
                    if (Array.isArray(docs) && docs.some(d => d._id === interruptId && d._deleted)) {
                        window.cleanupInterrupted = true;
                        return new Promise(() => {});
                    }
                    return bulk(docs, ...args);
                };
            }""", interrupt_id)
            page.locator("#timer-stop-btn").click()
            page.wait_for_function("window.cleanupInterrupted === true")
            read = """async () => {
                const {getDb} = await import('/js/storage.js');
                const docs = (await getDb().allDocs({include_docs:true})).rows.map(row => row.doc);
                return [docs.filter(d => d.docType === 'activity').map(d => [d._id, d.endDateTime]),
                    docs.some(d => d._id === 'task-source')];
            }"""
            activities, pending = page.evaluate(read)
            assert len(activities) == 1
            assert pending == (interrupt_id == "task-source")
            page.reload()
            expect(page.locator("#main-app")).to_be_visible()
            expect(page.locator("#timer-stop-btn")).to_be_visible()
            page.locator("#timer-stop-btn").click()
            expect(page.locator("#timer-display")).to_be_hidden()
            assert page.evaluate(read) == [activities, False]
        finally:
            context.close()
            browser.close()

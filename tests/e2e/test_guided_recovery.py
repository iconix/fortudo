"""Repair uses real independent IndexedDB copies and the real contract checks."""

import pytest
from playwright.sync_api import expect, sync_playwright

from tests.e2e.helpers import BASE_URL, REPO_ROOT, launch_e2e_page


@pytest.mark.parametrize("width", [1280, 390, 320])
def test_guided_repair_survives_reload_and_recovers_only_reviewed_changes(app_server, width):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, viewport={"width": width, "height": 900},
            context_options={"service_workers": "block"},
        )
        messages = []
        page.on("console", lambda message: messages.append(message.text))
        page.on("pageerror", lambda error: messages.append(str(error)))
        try:
            context.route("**/js/config.js", lambda route: route.fulfill(
                content_type="application/javascript", body="export const COUCHDB_URL = 'recovery-cloud';"
            ))
            page.goto(BASE_URL)
            page.evaluate("""async () => {
                const {buildDocumentContractDesignDoc, applyWriterContract} = await import('/js/document-contract.js');
                const source = new PouchDB('fortudo-repair-room');
                await source.bulkDocs([
                    {_id:'task-cloud',type:'unscheduled',description:'A local description change',status:'incomplete',priority:'medium',estDuration:15},
                    {_id:'unsched-missing',type:'unscheduled',description:'Saved unsynced task',status:'incomplete'},
                    {_id:'unsched-keep',type:'unscheduled',description:'Keep this archived',status:'incomplete'},
                    {_id:'config-categories',docType:'config',schemaVersion:'3.5',groups:[{key:'work',label:'Office'}],categories:[{key:'writing',label:'Writing',groupKey:'work',status:'archived'}]}
                ]);
                const cloud = new PouchDB('recovery-cloud/fortudo-repair-room');
                await cloud.put(buildDocumentContractDesignDoc());
                await cloud.put(applyWriterContract({_id:'config-categories',docType:'config',schemaVersion:'3.5',identityVersion:1,
                    groups:[{id:'group-1',key:'work',label:'Work',legacyKeys:['work'],status:'active',archivedAt:null}],
                    categories:[{id:'cat-1',key:'meetings',label:'Meetings',legacyKeys:['meetings'],groupKey:'work',groupId:'group-1',status:'active',archivedAt:null}]}));
                await cloud.put(applyWriterContract({_id:'task-cloud',docType:'task',type:'unscheduled',description:'Cloud task',status:'incomplete',priority:'medium',estDuration:0}));
                await source.close(); await cloud.close();
            }""")
            page.locator("#room-code-input").fill("repair-room")
            page.locator('#room-entry-form button[type="submit"]').click()
            expect(page.locator("#sync-status-text")).to_have_text("Recovery required")
            older_tab = context.new_page()
            older_tab.goto(BASE_URL)
            expect(older_tab.locator("#sync-status-text")).to_have_text("Recovery required")
            older_tab.locator('input[name="description"]').fill("Draft in older tab")
            page.get_by_role("button", name="Recover changes", exact=True).click()
            dialog = page.get_by_role("dialog")
            expect(dialog).to_contain_text("Your original copy is kept")
            expect(dialog.locator('[data-action="download"]')).to_have_count(0)
            dialog.get_by_role("button", name="Repair this room", exact=True).click()
            page.wait_for_load_state("load")
            expect(page.locator("#add-task-btn")).to_be_enabled(timeout=15000)
            expect(page.locator("#unscheduled-task-list")).to_contain_text("Cloud task")
            expect(older_tab.locator("#sync-status-text")).to_have_text("Reload room")
            expect(older_tab.locator("#add-task-btn")).to_be_disabled()
            expect(older_tab.locator('input[name="description"]')).to_have_value("Draft in older tab")
            expect(older_tab.locator('[data-toast-key="replica-replaced"]')).to_contain_text("Reload to continue")
            expect(page.locator("#unscheduled-task-list")).not_to_contain_text("Saved unsynced task")
            page.get_by_role("button", name="Review changes", exact=True).click()
            dialog = page.get_by_role("dialog")
            expect(dialog.locator('[data-action="download"]')).to_have_count(0)
            comparison = dialog.locator("section").filter(has=page.get_by_role("heading", name="A local description change", exact=True)).locator(".recovery-comparison")
            expect(comparison).to_contain_text("A local description change")
            expect(comparison).to_contain_text("Cloud task")
            expect(dialog.get_by_role("heading", name="Review 4 saved changes", exact=True)).to_be_visible()
            categories = dialog.locator("section").filter(has=page.get_by_role("heading", name="Categories", exact=True))
            expect(categories.locator(".recovery-comparison")).to_contain_text("Writing · Office · Archived · Saved only")
            expect(categories.locator(".recovery-comparison")).to_contain_text("Meetings · Work · Active · Current only")
            screenshot_dir = REPO_ROOT / "test_screenshots"
            screenshot_dir.mkdir(exist_ok=True)
            page.screenshot(path=str(screenshot_dir / f"guided-recovery-{width}.png"))
            row = dialog.locator("section").filter(has=page.get_by_role("heading", name="Saved unsynced task", exact=True))
            expect(row.get_by_role("textbox", name="Saved description: unsched-missing", exact=True)).not_to_be_visible()
            row.get_by_text("Edit description", exact=True).click()
            row.get_by_role("textbox", name="Saved description: unsched-missing", exact=True).fill("Recovered and reviewed")
            disclosure = row.get_by_text("Troubleshooting details", exact=True)
            assert disclosure.bounding_box()["height"] >= 44
            disclosure.click()
            editor = row.get_by_role("textbox", name="Record to restore: unsched-missing", exact=True)
            edited = editor.input_value().replace('"priority": "medium"', '"priority": "high"')
            editor.fill(edited)
            categories.get_by_role("button", name="Keep current", exact=True).click()
            expect(row.get_by_role("textbox", name="Saved description: unsched-missing", exact=True)).to_have_value("Recovered and reviewed")
            expect(editor).to_have_value(edited)
            row.get_by_role("button", name="Restore change", exact=True).click()
            expect(dialog).not_to_contain_text("Saved unsynced task")
            expect(dialog.get_by_role("heading", name="Keep this archived", exact=True)).to_be_focused()
            expect(dialog.get_by_role("heading", name="Keep this archived", exact=True)).to_be_visible()
            expect(dialog.get_by_role("heading", name="Keep this archived", exact=True)).to_be_in_viewport(ratio=1)
            page.screenshot(path=str(screenshot_dir / f"guided-recovery-next-{width}.png"))
            dialog.get_by_role("button", name="Close", exact=True).click()
            page.reload()
            expect(page.locator("#unscheduled-task-list")).to_contain_text("Recovered and reviewed")
            page.get_by_role("button", name="Review changes", exact=True).click()
            dialog.locator("section").filter(has=page.get_by_role("heading", name="A local description change", exact=True)).get_by_role("button", name="Keep current", exact=True).click()
            dialog.locator("section").filter(has=page.get_by_role("heading", name="Keep this archived", exact=True)).get_by_role("button", name="Keep current", exact=True).click()
            expect(dialog).to_contain_text("Room repaired")
            expect(dialog).to_contain_text("1 change restored")
            expect(dialog.locator('[data-action="download"]')).to_have_count(0)
            expect(dialog.locator('.recovery-history')).to_have_count(0)
            expect(dialog.get_by_role("button", name="Review skipped changes", exact=True)).to_be_visible()
            expect(dialog.get_by_role("button", name="Close", exact=True)).to_have_count(0)
            bounds = dialog.locator(".recovery-actions button").evaluate_all("nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}; })")
            first, second = bounds
            assert min(first["height"], second["height"]) >= 44
            assert max(second["left"] - first["right"], second["top"] - first["bottom"]) >= 11
            assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth")
            page.screenshot(path=str(screenshot_dir / f"guided-recovery-complete-{width}.png"))
            dialog.get_by_role("button", name="Done", exact=True).click()
            page.locator("#settings-gear-btn").click()
            page.get_by_role("button", name="Recovery copies", exact=True).click()
            debug_copy = dialog.get_by_role("button", name="Download debug copy", exact=True)
            expect(debug_copy).not_to_be_visible()
            expect(dialog.locator('.recovery-history')).not_to_have_attribute('open', '')
            page.screenshot(path=str(screenshot_dir / f"guided-recovery-settings-{width}.png"))
            dialog.get_by_text("Saved copies", exact=True).click()
            expect(debug_copy).to_be_visible()
            assert "T13:" not in dialog.locator('select option').first.text_content()
            assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth")
            page.screenshot(path=str(screenshot_dir / f"guided-recovery-history-{width}.png"))
            dialog.get_by_role("button", name="Done", exact=True).click()
            page.reload()
            expect(page.locator("#unscheduled-task-list")).to_contain_text("Recovered and reviewed")
            expect(page.locator("#unscheduled-task-list")).not_to_contain_text("Keep this archived")
            result = page.evaluate("""async () => {
                const original = new PouchDB('fortudo-repair-room');
                const retained = await original.get('unsched-keep');
                const {getDb} = await import('/js/storage.js');
                const restored = await getDb().get('unsched-missing');
                return {original:retained.description,contract:restored.writerContract.version};
            }""")
            assert result == {"original": "Keep this archived", "contract": 1}
        except Exception:
            print("\n".join(messages))
            raise
        finally:
            context.close()
            browser.close()

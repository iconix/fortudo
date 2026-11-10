"""Repair uses real independent IndexedDB copies and the real contract checks."""

import pytest
from playwright.sync_api import expect, sync_playwright

from tests.e2e.helpers import BASE_URL, REPO_ROOT, launch_e2e_page


def test_repair_reports_inactivity_and_retry_waits_on_a_small_screen(app_server):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, viewport={"width": 390, "height": 844},
            context_options={"service_workers": "block"},
        )
        try:
            page.goto(BASE_URL)
            page.clock.install()
            page.evaluate("""async () => {
                const {initializeRecoveryUI} = await import('/js/recovery-ui.js');
                const controller = new AbortController();
                window.recoveryReloads = 0;
                const ui = initializeRecoveryUI({signal:controller.signal,
                    notify:()=>{},onChange:()=>{},reload:()=>window.recoveryReloads++,
                    openSession:async ({onProgress}) => {
                        window.reportRepairProgress = onProgress;
                        return {list:async()=>[], close:async()=>{},
                            service:{preserve:async()=>({_id:'recovery-progress'}),
                                rebuild:()=>new Promise(resolve=>window.finishRepair=resolve)}};
                    }
                });
                await ui.open();
            }""")
            page.get_by_role("button", name="Repair this room", exact=True).click()
            page.evaluate("reportRepairProgress({phase:'downloading',completed:10})")
            dialog = page.get_by_role("dialog")
            expect(dialog).to_contain_text("10 records received")
            page.clock.fast_forward(31000)
            expect(dialog.locator(".recovery-stall")).to_be_empty()
            page.clock.fast_forward(88000)
            expect(dialog.locator(".recovery-stall")).to_be_empty()
            page.clock.fast_forward(1000)
            expect(dialog).to_contain_text("Still waiting for a response. Your original copy is kept.")
            page.evaluate("reportRepairProgress({phase:'retrying',delay:4000,status:429})")
            expect(dialog).to_contain_text("Cloud is busy. Retrying in 4 seconds")
            page.clock.fast_forward(4000)
            expect(dialog).to_contain_text("Retrying cloud request")
            page.evaluate("reportRepairProgress({phase:'retry-settled'})")
            expect(dialog.locator(".recovery-retry")).to_be_empty()
            page.evaluate("reportRepairProgress({phase:'comparing-cloud'})")
            expect(dialog).to_contain_text("Comparing the refreshed copy with the cloud")
            expect(dialog.locator(".recovery-stall")).to_be_empty()
            assert dialog.evaluate("node => node.scrollWidth <= node.clientWidth")
            page.evaluate("finishRepair()")
            page.wait_for_function("window.recoveryReloads === 1")
        finally:
            context.close()
            browser.close()


def retain_local_cloud_handles(page):
    """Model HTTP close semantics for the IndexedDB stand-in used as a cloud.

    Closing one IndexedDB adapter handle can close another handle's cached
    connection in the same page. HTTP PouchDB handles do not share that lifecycle.
    Real source/archive/staged handles retain their actual close behavior.
    """
    page.context.add_init_script("""(() => {
        let constructor;
        Object.defineProperty(window, 'PouchDB', {configurable:true,
            get:()=>constructor,
            set:Original => {
                function FixturePouchDB(name, options) {
                    const db = new Original(name, options);
                    if (/^(incident|recovery|denial)-cloud\\//.test(name))
                        db.close = async () => {};
                    return db;
                }
                FixturePouchDB.prototype = Original.prototype;
                Object.setPrototypeOf(FixturePouchDB, Original);
                constructor = FixturePouchDB;
            }
        });
    })();""")


@pytest.mark.parametrize("malformed", [False, True], ids=["legacy-cloud", "unreadable-cloud"])
def test_incident_deletions_preserved_with_legacy_or_unreadable_cloud(app_server, malformed):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, viewport={"width": 390, "height": 844},
            context_options={"service_workers": "block"},
        )
        retain_local_cloud_handles(page)
        try:
            context.route("**/js/config.js", lambda route: route.fulfill(
                content_type="application/javascript",
                body="export const COUCHDB_URL = 'incident-cloud';",
            ))
            page.goto(BASE_URL)
            page.evaluate("""async malformed => {
                const {buildDocumentContractDesignDoc, applyWriterContract} =
                    await import('/js/document-contract.js');
                const source = new PouchDB('fortudo-incident-room');
                const markers = Array.from({length:12}, (_,i) => ({
                    _id:`deleted-${Math.min(i,10)}`, _rev:`2-branch${i}`, _deleted:true,
                    ...(i>=10 ? {writerContract:{version:1}} : {})
                }));
                await source.bulkDocs(markers, {new_edits:false});
                const cloud = new PouchDB('incident-cloud/fortudo-incident-room');
                await cloud.put(buildDocumentContractDesignDoc());
                const task = {_id:'task-cloud',docType:'task',type:'unscheduled',
                    description:'Cloud work',status:'incomplete',estDuration:15};
                await cloud.put(malformed ? applyWriterContract({...task,description:{bad:'field'}}) : task);
                await cloud.bulkDocs([
                    {_id:'cloud-deleted',_rev:'2-old',_deleted:true},
                    {_id:'cloud-conflict',_rev:'1-a',docType:'task',type:'unscheduled',description:'Branch A',status:'incomplete',priority:'medium',estDuration:15,
                        _attachments:{note:{content_type:'text/plain',data:'aGVsbG8='}}},
                    {_id:'cloud-conflict',_rev:'1-b',docType:'task',type:'unscheduled',description:'Branch B',status:'incomplete',priority:'medium',estDuration:15}
                ], {new_edits:false});
                await source.close(); await cloud.close();
                localStorage.setItem('fortudo-active-room','incident-room');
            }""", malformed)
            page.reload()
            expect(page.locator("#sync-status-text")).to_have_text("Recovery required")
            page.get_by_role("button", name="Recover changes", exact=True).click()
            expect(page.get_by_role("dialog")).to_contain_text(
                "10 local deletions cannot be synced safely"
            )
            page.evaluate("""() => {
                window.repairPhases = [];
                new MutationObserver(() => {
                    const status = document.querySelector('.recovery-progress');
                    if (status) window.repairPhases.push(status.textContent);
                }).observe(document.querySelector('dialog'), {subtree:true,childList:true});
            }""")
            page.get_by_role("button", name="Repair this room", exact=True).click()
            if malformed:
                dialog = page.get_by_role("dialog")
                expect(dialog).to_contain_text("Repair couldn’t finish")
                expect(dialog.get_by_role("alert")).to_contain_text("task whose description")
                expect(dialog).to_contain_text(
                    "Stopped while checking that cloud records can be read."
                )
                expect(dialog).to_have_attribute("data-recovery-stage", "error")
                error = dialog.locator(".recovery-error[role=alert]")
                expect(error).to_contain_text("Stopped while checking that cloud records can be read.")
                assert error.evaluate("node => getComputedStyle(node).borderTopStyle") == "solid"
                assert error.evaluate("node => getComputedStyle(node).backgroundColor") != "rgba(0, 0, 0, 0)"
                phases = page.evaluate("window.repairPhases")
                assert any("Downloading cloud records" in phase for phase in phases)
                assert any("records received" in phase for phase in phases)
                with page.expect_download() as download:
                    dialog.get_by_role("button", name="Download saved copy", exact=True).click()
                assert download.value.suggested_filename.endswith(".json")
                expect(error).to_contain_text("Stopped while checking that cloud records can be read.")
                expect(error).to_contain_text("task whose description")
                assert page.evaluate("localStorage.getItem('fortudo-recovery-route:fortudo-incident-room')") is None
            else:
                expect(page.locator("#unscheduled-task-list")).to_contain_text("Cloud work", timeout=20000)
                expect(page.locator("#add-task-btn")).to_be_enabled(timeout=15000)
                expect(page.locator('[data-task-id="task-cloud"] .priority-badge')).to_contain_text("Medium Priority")
                # The app may close its own archive/source handles while resuming
                # review. Inspect persisted data from an independent page so the
                # fixture does not race the adapter's shared connection cache.
                inspection = context.new_page()
                inspection.route("**/recovery-inspection.html", lambda route: route.fulfill(
                    content_type="text/html",
                    body='<script src="/vendor/pouchdb/pouchdb.min.js"></script>',
                ))
                inspection.goto(f"{BASE_URL}/recovery-inspection.html")
                result = inspection.evaluate("""async () => {
                    const {getRecoveryRoute, RECOVERY_ARCHIVE_DATABASE} =
                        await import('/js/guided-recovery.js');
                    const route = getRecoveryRoute('fortudo-incident-room');
                    const archive = new PouchDB(RECOVERY_ARCHIVE_DATABASE);
                    const original = new PouchDB('fortudo-incident-room');
                    const saved = await archive.get(route.archiveId);
                    const changes = await original.changes({since:0,style:'all_docs'});
                    const db = new PouchDB(route.databaseName);
                    const a = await db.get('cloud-conflict',{rev:'1-a',attachments:true});
                    const b = await db.get('cloud-conflict',{rev:'1-b'});
                    const missing = await db.allDocs({keys:saved.bundle.documents.map(d=>d._id)});
                    const priorityPersisted = Object.hasOwn(await db.get('task-cloud'),'priority');
                    await original.close(); await archive.close(); await db.close();
                    return {archived:saved.bundle.documents.length,
                        originalLeaves:changes.results.reduce((n,r)=>n+r.changes.length,0),
                        omitted:missing.rows.every(r=>r.error==='not_found'),
                        attachment:a._attachments.note.data,otherBranch:b.description,
                        priorityPersisted};
                }""")
                assert result == {"archived": 12, "originalLeaves": 12, "omitted": True,
                                  "attachment": "aGVsbG8=", "otherBranch": "Branch B", "priorityPersisted": False}
        finally:
            context.close()
            browser.close()


def test_old_inferred_denial_rechecks_and_unblocks_room_without_repair(app_server):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, context_options={"service_workers": "block"},
        )
        retain_local_cloud_handles(page)
        try:
            context.route("**/js/config.js", lambda route: route.fulfill(
                content_type="application/javascript",
                body="export const COUCHDB_URL = 'denial-cloud';",
            ))
            page.goto(BASE_URL)
            page.evaluate("""async () => {
                const {buildDocumentContractDesignDoc, applyWriterContract} =
                    await import('/js/document-contract.js');
                const source = new PouchDB('fortudo-denial-room');
                const result = await source.put(applyWriterContract({
                    _id:'task-pending', docType:'task', type:'unscheduled',
                    description:'My pending work', status:'incomplete',
                    priority:'medium', estDuration:15
                }));
                await source.put({
                    _id:'_local/fortudo-document-contract-denials', formatVersion:1,
                    identities:[`task-pending@${result.rev}`]
                });
                const cloud = new PouchDB('denial-cloud/fortudo-denial-room');
                await cloud.put(buildDocumentContractDesignDoc());
                await source.close(); await cloud.close();
                localStorage.setItem('fortudo-active-room', 'denial-room');
            }""")
            page.reload()
            expect(page.locator("#add-task-btn")).to_be_enabled(timeout=15000)
            expect(page.locator("#unscheduled-task-list")).to_contain_text("My pending work")
            assert page.evaluate("""async () => {
                const {getDb} = await import('/js/storage.js');
                return (await getDb().get('task-pending')).description;
            }""") == "My pending work"
            assert page.evaluate("localStorage.getItem('fortudo-recovery-route:fortudo-denial-room')") is None
        finally:
            context.close()
            browser.close()


@pytest.mark.parametrize("width", [1280, 390, 320])
def test_guided_repair_survives_reload_and_recovers_only_reviewed_changes(app_server, width):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, viewport={"width": width, "height": 900},
            context_options={"service_workers": "block"},
        )
        retain_local_cloud_handles(page)
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

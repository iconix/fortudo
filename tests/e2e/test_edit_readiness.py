"""Startup editing works independently of cloud transport, with safety blocks intact."""

import pytest
from playwright.sync_api import expect, sync_playwright

from tests.e2e.helpers import BASE_URL, REPO_ROOT, launch_e2e_page


@pytest.mark.parametrize(
    "state,message",
    [
        ("compatible", None),
        ("update-required", "Update Fortudo to edit this room."),
        ("validator-mismatch", "This room needs a sync configuration fix"),
        ("recovery-required", "Editing is paused to protect your local changes."),
        ("audit-error", "We could not verify your local changes."),
        ("preparation-error", "Tasks could not finish loading."),
    ],
)
def test_startup_draft_and_safe_local_editing(app_server, state, message):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright, context_options={"service_workers": "block"})
        try:
            page.route(
                "**/js/config.js",
                lambda route: route.fulfill(
                    content_type="application/javascript",
                    body="export const COUCHDB_URL = 'https://sync.invalid';",
                ),
            )
            # Hold compatibility checks, then hold replication separately. Real local
            # storage, migrations, write guards, form handlers, and rendering still run.
            page.route(
                "**/js/sync-contract.js",
                lambda route: route.fulfill(
                    content_type="application/javascript",
                    body="""
                        export { enumerateCurrentLocalLeaves } from './sync-contract.js?original';
                        export async function inspectRemoteDocumentContract() {
                            if (!window.testContractState) {
                                await new Promise(resolve => { window.releaseContract = resolve; });
                            }
                            const state = window.testContractState;
                            const compatible = ['compatible', 'recovery-required', 'audit-error', 'preparation-error'].includes(state);
                            return { state: compatible ? 'compatible' : state, compatible, contractRevision: '1-test' };
                        }
                        export async function auditLocalDivergence() {
                            if (window.holdRetryAudit) {
                                await new Promise(resolve => { window.finishRetryAudit = resolve; });
                            }
                            return { state: window.testContractState === 'preparation-error' ? 'compatible' : window.testContractState, eligible: [], remotePresent: [], recoveryRequired: [] };
                        }
                        export async function findRemoteMissingLeaves() { return []; }
                    """,
                ),
            )
            if state == "preparation-error":
                storage_source = (REPO_ROOT / "public/js/storage.js").read_text(encoding="utf-8")
                storage_source = storage_source.replace(
                    "await migrateDocTypes();",
                    """if (window.forceStartupError) {
                        if (window.holdStartupRetry) {
                            await new Promise(resolve => { window.finishStartupRetry = resolve; });
                        }
                        throw new Error('simulated startup failure');
                    } await migrateDocTypes();""",
                )
                page.route("**/js/storage.js", lambda route: route.fulfill(
                    content_type="application/javascript", body=storage_source
                ))
            page.goto(BASE_URL)
            page.locator("#room-code-input").fill("startup-editing")
            page.locator('#room-entry-form button[type="submit"]').click()
            page.wait_for_function("typeof window.releaseContract === 'function'")
            expect(page.locator("#edit-readiness")).to_have_count(0)
            expect(page.locator("#edit-readiness-help")).to_have_count(0)
            expect(page.locator("#add-task-btn")).to_have_text("Loading…")
            page.locator("#sync-status-indicator").click()
            expect(page.locator('[data-toast-key="manual-sync"]')).to_contain_text("Tasks are still loading.")
            description = page.locator('#task-form input[name="description"]')
            description.fill("Draft during startup")
            page.locator('label:has(#unscheduled)').click()
            page.locator("#add-task-btn").click(force=True)
            expect(description).to_have_value("Draft during startup")
            expect(page.locator("#custom-alert-modal")).to_be_hidden()
            assert page.locator("#unscheduled-task-list .task-card").count() == 0

            page.reload()
            page.wait_for_function("typeof window.releaseContract === 'function'")
            expect(description).to_have_value("Draft during startup")
            expect(page.locator('#unscheduled')).to_be_checked()
            expect(page.locator("#add-task-btn")).to_have_text("Loading…")

            page.evaluate(
                """async state => {
                    window.testContractState = state;
                    window.forceStartupError = state === 'preparation-error';
                    const { getDb } = await import('/js/storage.js');
                    getDb().replicate.to = () => new Promise(resolve => { window.finishPush = resolve; });
                    getDb().replicate.from = async () => ({ docs_written: 0 });
                    window.releaseContract();
                }""",
                state,
            )
            expect(description).to_have_value("Draft during startup")
            if state == "compatible":
                page.wait_for_function("typeof window.finishPush === 'function'")
                expect(page.locator("#sync-status-text")).to_have_text("Syncing")
                expect(page.locator("#add-task-btn")).to_contain_text("Add Task")
                expect(page.locator("#add-task-btn")).to_be_enabled()
                page.locator("#add-task-btn").click(force=True)
                expect(page.locator("#unscheduled-task-list")).to_contain_text("Draft during startup")
                expect(description).to_have_value("")
                assert page.evaluate("sessionStorage.getItem('fortudo-task-draft:startup-editing')") is None
                page.screenshot(path="test_screenshots/edit-readiness.png", full_page=True)
            else:
                expect(page.get_by_text(message, exact=False)).to_be_visible()
                expect(page.locator("#add-task-btn")).to_be_disabled()
                page.locator("#add-task-btn").click(force=True)
                expect(description).to_have_value("Draft during startup")
                assert page.locator("#unscheduled-task-list .task-card").count() == 0
                blocked = page.evaluate(
                    """async () => {
                        const { putTask } = await import('/js/storage.js');
                        try {
                            await putTask({ id: 'blocked-direct-write', type: 'unscheduled' });
                            return false;
                        } catch (error) { return error.message.startsWith('Persistence blocked:'); }
                    }"""
                )
                assert blocked, "The storage safety guard must block writes independently of the UI"
                toast = page.locator('[data-toast-key="task-edit-readiness"]')
                if state == "validator-mismatch":
                    expect(toast.locator("button")).to_have_count(0)
                    page.locator("#sync-status-indicator").click()
                    expect(page.locator('[data-toast-key="manual-sync"]')).to_contain_text("blocked by this room’s configuration")
                elif state == "audit-error":
                    page.evaluate("window.holdRetryAudit = true")
                    toast.get_by_role("button", name="Retry check", exact=True).click()
                    expect(toast).to_have_text("Checking local changes…")
                    page.wait_for_function("typeof window.finishRetryAudit === 'function'")
                    page.evaluate("window.holdRetryAudit = false; window.finishRetryAudit()")
                    expect(toast).to_contain_text("The check failed again.")
                    expect(page.locator("#add-task-btn")).to_be_disabled()
                    page.evaluate("window.holdRetryAudit = true; window.finishRetryAudit = null")
                    page.locator("#sync-status-indicator").click()
                    expect(toast).to_have_text("Checking local changes…")
                    expect(page.locator("#sync-status-text")).to_have_text("Syncing")
                    expect(page.locator("#sync-status-indicator")).to_be_disabled()
                    page.wait_for_function("typeof window.finishRetryAudit === 'function'")
                    page.evaluate("window.holdRetryAudit = false; window.finishRetryAudit()")
                    expect(toast).to_contain_text("The check failed again.")
                    expect(page.locator("#sync-status-text")).to_have_text("Sync check failed")
                    page.evaluate(
                        """async () => {
                            window.testContractState = 'compatible';
                            const { getDb } = await import('/js/storage.js');
                            getDb().replicate.to = async () => ({ docs_written: 0 });
                        }"""
                    )
                    toast.get_by_role("button", name="Retry check", exact=True).click()
                    expect(toast).to_contain_text("Check passed. You can edit tasks again.")
                    expect(page.locator("#add-task-btn")).to_be_enabled()
                    page.locator("#sync-status-indicator").click()
                    manual_toast = page.locator('[data-toast-key="manual-sync"]')
                    expect(manual_toast).to_have_text("Sync complete.")
                elif state == "preparation-error":
                    startup_toast = page.locator('[data-toast-key="storage-preparation-error"]')
                    page.evaluate("window.holdStartupRetry = true")
                    page.locator("#sync-status-indicator").click()
                    expect(startup_toast).to_have_text("Retrying startup…")
                    expect(page.locator("#sync-status-indicator")).to_be_disabled()
                    page.wait_for_function("typeof window.finishStartupRetry === 'function'")
                    page.evaluate("window.holdStartupRetry = false; window.finishStartupRetry()")
                    expect(startup_toast).to_contain_text("Tasks still could not load.")
                    expect(description).to_have_value("Draft during startup")
                    page.evaluate("window.forceStartupError = false")
                    startup_toast.get_by_role("button", name="Retry", exact=True).click()
                    expect(startup_toast).to_contain_text("Tasks loaded. You can edit tasks again.")
                    expect(page.locator("#add-task-btn")).to_be_enabled()
        finally:
            context.close()
            browser.close()


def test_initial_suggested_time_after_early_draft(app_server):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright, context_options={"service_workers": "block"})
        try:
            source = (REPO_ROOT / "public/js/app.js").read_text(encoding="utf-8")
            source = source.replace(
                "await loadAppState({ readOnly: Boolean(deferredStoragePreparation) });",
                "await new Promise(resolve => { window.releaseInitialLocalRead = resolve; }); await loadAppState({ readOnly: Boolean(deferredStoragePreparation) });",
            )
            page.route("**/js/app.js", lambda route: route.fulfill(content_type="application/javascript", body=source))
            page.route("**/js/config.js", lambda route: route.fulfill(content_type="application/javascript", body="export const COUCHDB_URL = null;"))
            page.goto(BASE_URL)
            page.locator("#room-code-input").fill("early-draft-repro")
            page.locator('#room-entry-form button[type="submit"]').click()
            page.wait_for_function("typeof window.releaseInitialLocalRead === 'function'")
            start = page.locator('#task-form input[name="start-time"]')
            expect(start).to_have_value("")
            page.locator('#task-form input[name="description"]').fill("Only the description was touched")
            page.evaluate("window.releaseInitialLocalRead()")
            expect(page.locator("#add-task-btn")).to_have_attribute("aria-disabled", "false")
            expect(start).not_to_have_value("")
        finally:
            context.close()
            browser.close()

from itertools import permutations

import pytest
from playwright.sync_api import sync_playwright

from tests.e2e.helpers import BASE_URL, launch_e2e_page


SCHEDULES = [
    steps for steps in permutations(("recreate", "debounce", "finish"))
    if steps.index("recreate") < steps.index("debounce")
]


@pytest.mark.parametrize(
    ("steps", "interrupt_retry"),
    [(steps, False) for steps in SCHEDULES] + [(("recreate", "debounce", "finish"), True)],
    ids=["-".join(steps) for steps in SCHEDULES] + ["interrupted-follow-up"],
)
def test_recreated_revision_after_sync(app_server, steps, interrupt_retry):
    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(
            playwright, context_options={"service_workers": "block"}
        )
        try:
            page.goto(BASE_URL)
            page.evaluate("""async (interruptRetry) => {
                const sync = await import('/js/sync-manager.js');
                const {applyWriterContract, buildDocumentContractDesignDoc} =
                    await import('/js/document-contract.js');
                const local = new PouchDB('local-recreation');
                const remote = new PouchDB('remote-recreation');
                await remote.put(buildDocumentContractDesignDoc());
                const task = applyWriterContract({
                    _id: 'expired', docType: 'task', type: 'unscheduled', description: 'Recreated'
                });
                const initial = await local.put(task);
                const deleted = await local.remove(initial.id, initial.rev);
                sync.initSync(local, remote.name, {remoteDb: remote});
                await sync.waitForSyncPreflight();

                const started = Promise.withResolvers();
                const resume = Promise.withResolvers();
                const push = local.replicate.to.bind(local.replicate);
                local.replicate.to = (...args) => {
                    local.replicate.to = interruptRetry
                        ? () => Promise.reject(new Error('Follow-up interrupted'))
                        : push;
                    started.resolve();
                    return resume.promise.then(() => push(...args));
                };
                const syncing = sync.triggerSync();
                await Promise.race([started.promise, syncing.then(() => {
                    throw new Error('Initial push did not start: ' + sync.getSyncStatus());
                })]);
                let revision;
                let fireDebounce;
                window.scenario = {
                    async recreate() {
                        const saved = await local.put({...task, _rev: deleted.rev});
                        revision = saved.rev;
                        sync.registerExpectedLocalRevision(saved.id, saved.rev);
                        const setTimer = window.setTimeout;
                        try {
                            window.setTimeout = (callback) => { fireDebounce = callback; };
                            sync.debouncedSync();
                        } finally {
                            window.setTimeout = setTimer;
                        }
                    },
                    debounce() {
                        void fireDebounce();
                    },
                    async finish() {
                        resume.resolve();
                        await syncing;
                    },
                    async outcome() {
                        await sync.waitForIdleSync();
                        const cloud = (await remote.allDocs({keys: [task._id]})).rows[0];
                        return {
                            uploaded: cloud.value?.rev === revision,
                            absent: cloud.error === 'not_found',
                            saved: (await local.get(task._id))._rev === revision,
                            keptDeletion: (await local.get(task._id, {rev: deleted.rev}))._deleted,
                            status: sync.getSyncStatus()
                        };
                    }
                };
            }""", interrupt_retry)
            for step in steps:
                page.evaluate("step => window.scenario[step]()", step)
            assert page.evaluate("window.scenario.outcome()") == {
                "uploaded": not interrupt_retry,
                "absent": interrupt_retry,
                "saved": True,
                "keptDeletion": True,
                "status": "error" if interrupt_retry else "synced",
            }
        finally:
            context.close()
            browser.close()

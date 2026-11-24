/** @jest-environment node */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;
const PouchDB = require('pouchdb');
const { JSDOM } = require('jsdom');
PouchDB.plugin(require('pouchdb-adapter-memory'));

import { initializeRecoveryUI } from '../public/js/recovery-ui.js';
import { createGuidedRecovery } from '../public/js/guided-recovery.js';
import { createSyncFetch } from '../public/js/sync-transport.js';
import { buildDocumentContractDesignDoc } from '../public/js/document-contract.js';

test('a successful retried cloud audit clears feedback before later audit batches finish', async () => {
    const dom = new JSDOM('<body></body>', { url: 'https://example.invalid/' });
    global.window = dom.window;
    global.document = dom.window.document;
    const names = new Set();
    const makeDatabase = (name) => {
        names.add(name);
        return new PouchDB(name, { adapter: 'memory' });
    };
    const logicalName = `retry-progress-${Date.now()}`;
    const source = makeDatabase(logicalName);
    const remote = makeDatabase(`${logicalName}-cloud`);
    const archive = makeDatabase(`${logicalName}-archive`);
    const controller = new dom.window.AbortController();
    let progress;
    let finish;
    const complete = new Promise((resolve) => {
        finish = resolve;
    });
    try {
        await source.put({ _id: 'local', type: 'unscheduled', description: 'Saved local work' });
        await remote.put(buildDocumentContractDesignDoc());
        await remote.bulkDocs(
            Array.from({ length: 250 }, (_, index) => ({
                _id: `task-${index}`,
                type: 'unscheduled',
                description: 'Cloud work'
            }))
        );
        const revsDiff = remote.revsDiff.bind(remote);
        let attempts = 0;
        const retry = jest.fn((event) => progress({ phase: 'retrying', ...event }));
        const fetch = createSyncFetch(
            async (_url, options) => {
                if (++attempts === 1) return Response.json({}, { status: 429 });
                return Response.json(await revsDiff(JSON.parse(options.body)));
            },
            {
                onRetry: retry,
                onRetrySettled: (event) => progress({ phase: 'retry-settled', ...event })
            }
        );
        const batches = [];
        remote.revsDiff = async (request) => {
            const response = await fetch('https://example.invalid/db/_revs_diff', {
                method: 'POST',
                body: JSON.stringify(request)
            });
            batches.push({
                count: Object.keys(request).length,
                phase: document.querySelector('.recovery-progress').textContent,
                retry: document.querySelector('.recovery-retry').textContent
            });
            return response.json();
        };
        const service = createGuidedRecovery({
            source,
            remote,
            archive,
            logicalName,
            makeDatabase,
            routeStorage: dom.window.localStorage,
            digest: async (value) =>
                require('crypto').createHash('sha256').update(value).digest('hex'),
            onProgress: (event) => progress(event)
        });
        const ui = initializeRecoveryUI({
            signal: controller.signal,
            notify: jest.fn(),
            onChange: jest.fn(),
            reload: finish,
            openSession: async ({ onProgress }) => {
                progress = onProgress;
                return { list: async () => [], close: async () => {}, service };
            }
        });
        await ui.open();
        document.querySelector('[data-action="repair"]').click();
        await complete;
        expect(retry).toHaveBeenCalledTimes(1);
        expect(attempts).toBe(4);
        expect(batches.map((batch) => batch.count)).toEqual([100, 100, 50]);
        expect(
            batches.every((batch) => batch.phase.includes('Comparing') && batch.retry === '')
        ).toBe(true);
    } finally {
        controller.abort();
        await Promise.all(
            [...names].map((name) => new PouchDB(name, { adapter: 'memory' }).destroy())
        );
        dom.window.close();
        delete global.window;
        delete global.document;
    }
}, 15000);

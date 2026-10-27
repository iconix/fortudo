/** @jest-environment node */

const { readFileSync } = require('fs');
const { join } = require('path');
const { runInNewContext } = require('vm');

function remoteWith(fetch) {
    const sandbox = {
        setTimeout,
        clearTimeout,
        setImmediate,
        clearImmediate,
        Headers,
        Response,
        AbortController,
        URL,
        URLSearchParams,
        Blob,
        TextEncoder,
        TextDecoder,
        atob,
        btoa,
        crypto: require('crypto').webcrypto,
        fetch,
        console: { log() {}, warn() {}, error() {} },
        navigator: { userAgent: 'regression-test' }
    };
    sandbox.self = sandbox;
    sandbox.window = sandbox;
    runInNewContext(
        readFileSync(join(__dirname, '../public/vendor/pouchdb/pouchdb.min.js'), 'utf8'),
        sandbox
    );
    return new sandbox.PouchDB('https://test.invalid/db', { skip_setup: true, fetch });
}

describe('vendored PouchDB bulk capability detection', () => {
    test.each([429, 500, 502, 503, 504, 401, 403])(
        'does not turn HTTP %s into individual reads',
        async (status) => {
            const fetch = jest
                .fn()
                .mockImplementation(async () => Response.json({ error: 'failure' }, { status }));
            const remote = remoteWith(fetch);
            const options = { docs: [{ id: 'task-one', rev: '1-a' }], revs: true };
            await expect(remote.bulkGet(options)).rejects.toMatchObject({ status });
            fetch.mockImplementation(async () => Response.json({ results: [] }));
            await remote.bulkGet(options);
            expect(fetch).toHaveBeenCalledTimes(2);
            expect(fetch.mock.calls.every(([url]) => url.includes('/_bulk_get'))).toBe(true);
        }
    );

    test('does not cache an opaque CORS/network failure as unsupported', async () => {
        const fetch = jest
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockImplementation(async () => Response.json({ results: [] }));
        const remote = remoteWith(fetch);
        const options = { docs: [{ id: 'task-one', rev: '1-a' }] };
        await expect(remote.bulkGet(options)).rejects.toThrow('Failed to fetch');
        await remote.bulkGet(options);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls.every(([url]) => url.includes('/_bulk_get'))).toBe(true);
    });

    test.each([404, 405, 501])(
        'retains the legacy fallback for unsupported HTTP %s',
        async (status) => {
            const fetch = jest
                .fn()
                .mockImplementation(async (url) =>
                    url.includes('/_bulk_get')
                        ? Response.json({ error: 'unsupported' }, { status })
                        : Response.json([{ ok: { _id: 'task-one', _rev: '1-a' } }])
                );
            const remote = remoteWith(fetch);
            const result = await remote.bulkGet({ docs: [{ id: 'task-one', rev: '1-a' }] });
            expect(result.results[0].docs[0].ok._id).toBe('task-one');
            expect(fetch).toHaveBeenCalledTimes(2);
        }
    );
});

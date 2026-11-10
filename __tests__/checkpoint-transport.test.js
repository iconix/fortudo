/** @jest-environment node */
import { createSyncFetch } from '../public/js/sync-transport.js';

const url = 'https://example.invalid/db/_local/checkpoint';
const checkpoint = {
    _id: '_local/checkpoint',
    _rev: '0-1',
    version: 1,
    replicator: 'pouchdb',
    session_id: 'session',
    last_seq: 125,
    history: [{ session_id: 'session', last_seq: 125 }]
};
const options = { method: 'PUT', body: JSON.stringify(checkpoint) };
// Actual dat-411 checkpoint PUT starts on November 10: eleven acknowledgements,
// then a CORS-hidden HTTP 429 at 951 ms. No bulk uploads/downloads in this window.
const capturedOffsets = [0, 90, 170, 295, 379, 467, 544, 613, 736, 820, 880, 951];

describe('checkpoint write safety and pacing', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('paces the captured burst with headroom below ten writes per sliding second', async () => {
        const starts = [];
        const fetch = jest.fn(async () => {
            starts.push(performance.now());
            return Response.json({ ok: true }, { status: 201 });
        });
        const syncFetch = createSyncFetch(fetch);
        const requests = capturedOffsets.map((offset) =>
            new Promise((resolve) => setTimeout(resolve, offset)).then(() =>
                syncFetch(url, options)
            )
        );
        await jest.runAllTimersAsync();
        expect((await Promise.all(requests)).every((response) => response.status === 201)).toBe(
            true
        );
        expect(starts).toHaveLength(12);
        for (const start of starts) {
            expect(
                starts.filter((time) => time > start - 1000 && time <= start).length
            ).toBeLessThanOrEqual(5);
        }
        expect(starts[11] - starts[0]).toBeGreaterThanOrEqual(2200);
    });

    test('retries explicit checkpoint 429 with Retry-After and preserves the exact request', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValueOnce(
                new Response('', { status: 429, headers: { 'Retry-After': '2' } })
            )
            .mockResolvedValue(Response.json({ ok: true }, { status: 201 }));
        const request = createSyncFetch(fetch)(url, options);
        await jest.advanceTimersByTimeAsync(1999);
        expect(fetch).toHaveBeenCalledTimes(1);
        await jest.runAllTimersAsync();
        expect((await request).status).toBe(201);
        expect(fetch.mock.calls[1]).toEqual([url, options]);
    });

    test('bounds explicit checkpoint throttle retries and returns failure', async () => {
        const fetch = jest.fn(async () => new Response('', { status: 429 }));
        const request = createSyncFetch(fetch)(url, options);
        const rejected = expect(request).rejects.toThrow('Checkpoint write is still rate-limited');
        await jest.runAllTimersAsync();
        await rejected;
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    test('confirms an applied checkpoint after a lost acknowledgement without replaying PUT', async () => {
        const fetch = jest
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValue(Response.json({ ...checkpoint, _rev: '0-2' }));
        const request = createSyncFetch(fetch)(url, options);
        await jest.runAllTimersAsync();
        const response = await request;
        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ ok: true, id: checkpoint._id, rev: '0-2' });
        expect(fetch.mock.calls.map(([, request]) => request.method)).toEqual(['PUT', 'GET']);
    });

    test('confirmation preserves credentials and removes the write body', async () => {
        const requestOptions = {
            ...options,
            credentials: 'include',
            headers: { Authorization: 'fixture' }
        };
        const fetch = jest
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValue(Response.json({ ...checkpoint, _rev: '0-2' }));
        await createSyncFetch(fetch)(url, requestOptions);
        expect(fetch.mock.calls[1][1]).toEqual({
            ...requestOptions,
            method: 'GET',
            body: undefined
        });
    });

    test('an abort during confirmation cannot become an acknowledgement', async () => {
        const controller = new AbortController();
        const fetch = jest
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockImplementation(async () => {
                controller.abort();
                return Response.json({ ...checkpoint, _rev: '0-2' });
            });
        await expect(
            createSyncFetch(fetch, { signal: controller.signal })(url, options)
        ).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('unexpected checkpoint failures do not poison the pacing queue', async () => {
        const fetch = jest
            .fn()
            .mockRejectedValueOnce(new Error('unexpected'))
            .mockResolvedValue(Response.json({ ok: true }, { status: 201 }));
        const syncFetch = createSyncFetch(fetch);
        await expect(syncFetch(url, options)).rejects.toThrow('unexpected');
        const next = syncFetch(url, options);
        await jest.runAllTimersAsync();
        expect((await next).status).toBe(201);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test.each([
        'missing',
        'different-sequence',
        'different-session',
        'different-history',
        'invalid',
        'read-failure'
    ])(
        'does not replay an ambiguous write or claim success when confirmation is %s',
        async (variant) => {
            const error = new TypeError('Failed to fetch');
            const stored = { ...checkpoint, _rev: '0-2' };
            if (variant === 'different-sequence') stored.last_seq = 126;
            if (variant === 'different-session') stored.session_id = 'other';
            if (variant === 'different-history') stored.history = [];
            if (variant === 'invalid') delete stored._rev;
            const fetch = jest
                .fn()
                .mockRejectedValueOnce(error)
                .mockImplementation(async () => {
                    if (variant === 'read-failure') throw new TypeError('Read failed');
                    return variant === 'missing'
                        ? new Response('', { status: 404 })
                        : Response.json(stored);
                });
            const request = createSyncFetch(fetch)(url, options);
            const rejected = expect(request).rejects.toBe(error);
            await jest.runAllTimersAsync();
            await rejected;
            expect(fetch.mock.calls.filter(([, request]) => request.method === 'PUT')).toHaveLength(
                1
            );
        }
    );

    test.each([401, 403, 409, 502, 503, 504])(
        'does not replay checkpoint HTTP %s',
        async (status) => {
            const fetch = jest.fn(async () => new Response('', { status }));
            expect((await createSyncFetch(fetch)(url, options)).status).toBe(status);
            expect(fetch).toHaveBeenCalledTimes(1);
        }
    );

    test.each(['{}', '{', JSON.stringify({ ...checkpoint, _id: '_local/other' })])(
        'does not retry arbitrary local-document writes (%s)',
        async (body) => {
            const fetch = jest.fn(async () => new Response('', { status: 429 }));
            expect((await createSyncFetch(fetch)(url, { method: 'PUT', body })).status).toBe(429);
            expect(fetch).toHaveBeenCalledTimes(1);
        }
    );

    test('cancels queued writes without poisoning the queue or blocking reads', async () => {
        const fetch = jest.fn(async () => Response.json({ ok: true }, { status: 201 }));
        const syncFetch = createSyncFetch(fetch);
        await syncFetch(url, options);
        const controller = new AbortController();
        const pending = syncFetch(url, { ...options, signal: controller.signal });
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await jest.advanceTimersByTimeAsync(0);
        await syncFetch('https://example.invalid/db/_changes');
        controller.abort();
        await rejected;
        const next = syncFetch(url, options);
        await jest.runAllTimersAsync();
        expect((await next).status).toBe(201);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    test('cancels checkpoint backoff before any retry or confirmation', async () => {
        const controller = new AbortController();
        const fetch = jest.fn(async () => new Response('', { status: 429 }));
        const pending = createSyncFetch(fetch, { signal: controller.signal })(url, options);
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await jest.advanceTimersByTimeAsync(0);
        controller.abort();
        await rejected;
        await jest.runAllTimersAsync();
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

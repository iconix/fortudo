/** @jest-environment node */

import { createSyncFetch, SYNC_REPLICATION_OPTIONS } from '../public/js/sync-transport.js';

describe('bounded sync reads', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('spaces consecutive bulk reads even when every response succeeds', async () => {
        const fetch = jest.fn().mockImplementation(async () => Response.json({ results: [] }));
        const syncFetch = createSyncFetch(fetch);
        const options = {
            method: 'POST',
            body: JSON.stringify({ docs: Array.from({ length: 10 }, (_, id) => ({ id })) })
        };
        const first = syncFetch('https://example.invalid/db/_bulk_get', options);
        const second = syncFetch('https://example.invalid/db/_bulk_get', options);
        await jest.advanceTimersByTimeAsync(0);
        expect(fetch).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(1000);
        expect(fetch).toHaveBeenCalledTimes(1);
        await jest.runAllTimersAsync();
        expect((await first).status).toBe(200);
        expect((await second).status).toBe(200);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[1][1]).toEqual(options);
    });

    test('cancels a queued bulk read without sending it or blocking metadata reads', async () => {
        const fetch = jest.fn().mockImplementation(async () => Response.json({ results: [] }));
        const controller = new AbortController();
        const syncFetch = createSyncFetch(fetch, { signal: controller.signal });
        await syncFetch('https://example.invalid/db/_bulk_get', { method: 'POST' });
        const queued = syncFetch('https://example.invalid/db/_bulk_get', { method: 'POST' });
        const rejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
        await jest.advanceTimersByTimeAsync(0);
        expect((await syncFetch('https://example.invalid/db/_design/contract')).status).toBe(200);
        controller.abort();
        await rejected;
        await jest.runAllTimersAsync();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('a failed bulk read does not poison the queue for a later request', async () => {
        const fetch = jest
            .fn()
            .mockRejectedValueOnce(new Error('unexpected'))
            .mockResolvedValue(new Response('{}'));
        const syncFetch = createSyncFetch(fetch);
        await expect(
            syncFetch('https://example.invalid/db/_bulk_get', { method: 'POST' })
        ).rejects.toThrow('unexpected');
        const next = syncFetch('https://example.invalid/db/_bulk_get?revs=true', {
            method: 'POST'
        });
        await jest.advanceTimersByTimeAsync(1000);
        expect(fetch).toHaveBeenCalledTimes(1);
        await jest.runAllTimersAsync();
        expect((await next).status).toBe(200);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('a cancelled queued request does not stop later requests on the same handle', async () => {
        const fetch = jest.fn().mockImplementation(async () => Response.json({ results: [] }));
        const syncFetch = createSyncFetch(fetch);
        await syncFetch('https://example.invalid/db/_bulk_get', { method: 'POST' });
        const controller = new AbortController();
        const cancelled = syncFetch('https://example.invalid/db/_bulk_get', {
            method: 'POST',
            signal: controller.signal
        });
        const rejected = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
        await jest.advanceTimersByTimeAsync(0);
        controller.abort();
        await rejected;
        const next = syncFetch('https://example.invalid/db/_bulk_get', { method: 'POST' });
        await jest.runAllTimersAsync();
        expect((await next).status).toBe(200);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('retries throttled bulk reads with backoff and preserves the request', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValueOnce(new Response('', { status: 429 }))
            .mockResolvedValue(new Response('{}'));
        const options = {
            method: 'POST',
            body: '{"docs":[]}',
            headers: { Authorization: 'private' }
        };
        const request = createSyncFetch(fetch)('https://example.invalid/db/_bulk_get', options);
        await jest.advanceTimersByTimeAsync(999);
        expect(fetch).toHaveBeenCalledTimes(1);
        await jest.runAllTimersAsync();
        expect((await request).status).toBe(200);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[1][1]).toEqual(options);
    });

    test.each([429, 502, 503, 504])('bounds attempts for HTTP %s', async (status) => {
        const fetch = jest.fn().mockImplementation(async () => new Response('', { status }));
        const request = createSyncFetch(fetch)('https://example.invalid/db/_changes');
        await jest.runAllTimersAsync();
        expect((await request).status).toBe(status);
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    test('bounds CORS-like failures without downgrading the request', async () => {
        const error = new TypeError('Failed to fetch');
        const fetch = jest.fn().mockRejectedValue(error);
        const request = createSyncFetch(fetch)('https://example.invalid/db/_bulk_get', {
            method: 'POST'
        });
        const rejected = expect(request).rejects.toBe(error);
        await jest.runAllTimersAsync();
        await rejected;
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    test.each([400, 401, 403, 404, 405, 409, 501])('does not retry HTTP %s', async (status) => {
        const fetch = jest.fn().mockResolvedValue(new Response('', { status }));
        expect(
            (
                await createSyncFetch(fetch)('https://example.invalid/db/_bulk_get', {
                    method: 'POST'
                })
            ).status
        ).toBe(status);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test.each(['PUT', 'DELETE', 'POST'])('never blindly retries a %s write', async (method) => {
        const fetch = jest.fn().mockResolvedValue(new Response('', { status: 429 }));
        await createSyncFetch(fetch)('https://example.invalid/db/_bulk_docs', { method });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test.each(['_revs_diff', '_all_docs'])('retries read-only POST %s', async (endpoint) => {
        const fetch = jest
            .fn()
            .mockResolvedValueOnce(new Response('', { status: 429 }))
            .mockResolvedValue(new Response('{}'));
        const request = createSyncFetch(fetch)(`https://example.invalid/db/${endpoint}`, {
            method: 'POST'
        });
        await jest.runAllTimersAsync();
        await request;
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test.each(['seconds', 'date'])('honors Retry-After %s', async (format) => {
        jest.setSystemTime(new Date('2026-10-26T12:00:00Z'));
        const value = format === 'seconds' ? '2' : new Date(Date.now() + 2000).toUTCString();
        const fetch = jest
            .fn()
            .mockResolvedValueOnce(
                new Response('', { status: 429, headers: { 'Retry-After': value } })
            )
            .mockResolvedValue(new Response('{}'));
        const request = createSyncFetch(fetch)('https://example.invalid/db');
        await jest.advanceTimersByTimeAsync(1500);
        expect(fetch).toHaveBeenCalledTimes(1);
        await jest.runAllTimersAsync();
        await request;
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('caps server delays and falls back for invalid Retry-After values', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValueOnce(
                new Response('', { status: 429, headers: { 'Retry-After': '999999' } })
            )
            .mockResolvedValueOnce(
                new Response('', { status: 429, headers: { 'Retry-After': 'invalid' } })
            )
            .mockResolvedValue(new Response('{}'));
        const request = createSyncFetch(fetch)('https://example.invalid/db');
        await jest.advanceTimersByTimeAsync(29999);
        expect(fetch).toHaveBeenCalledTimes(1);
        await jest.runAllTimersAsync();
        await request;
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    test('cancels a pending retry when the room closes', async () => {
        const controller = new AbortController();
        const fetch = jest.fn().mockResolvedValue(new Response('', { status: 429 }));
        const request = createSyncFetch(fetch, { signal: controller.signal })(
            'https://example.invalid/db'
        );
        const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
        await jest.advanceTimersByTimeAsync(0);
        controller.abort();
        await rejected;
        await jest.runAllTimersAsync();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('does not start requests for a cancelled room or retry programming errors', async () => {
        const controller = new AbortController();
        controller.abort();
        const fetch = jest.fn();
        await expect(
            createSyncFetch(fetch, { signal: controller.signal })('https://example.invalid/db')
        ).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetch).not.toHaveBeenCalled();
        fetch.mockRejectedValue(new Error('unexpected'));
        await expect(createSyncFetch(fetch)('https://example.invalid/db')).rejects.toThrow(
            'unexpected'
        );
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('uses small batches without enabling unlimited replication retries', () => {
        expect(SYNC_REPLICATION_OPTIONS).toEqual({
            batch_size: 10,
            batches_limit: 1,
            retry: false
        });
    });

    test('respects both request and room cancellation signals', async () => {
        const room = new AbortController();
        const request = new AbortController();
        const fetch = jest.fn().mockResolvedValue(new Response('{}'));
        await createSyncFetch(fetch, { signal: room.signal })('https://example.invalid/db', {
            signal: request.signal
        });
        const combined = fetch.mock.calls[0][1].signal;
        request.abort();
        expect(combined.aborted).toBe(true);
    });

    test('handles cancellation while a throttled response is arriving', async () => {
        const controller = new AbortController();
        const fetch = jest.fn().mockImplementation(async () => {
            controller.abort();
            return new Response('', { status: 429 });
        });
        await expect(
            createSyncFetch(fetch, { signal: controller.signal })('https://example.invalid/db')
        ).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('still retries when an unread response body cannot be cancelled', async () => {
        const fetch = jest
            .fn()
            .mockResolvedValueOnce({
                status: 429,
                headers: new Headers(),
                body: {
                    cancel: async () => {
                        throw new Error('stream already consumed');
                    }
                }
            })
            .mockResolvedValue(new Response('{}'));
        const request = createSyncFetch(fetch)('https://example.invalid/db');
        await jest.runAllTimersAsync();
        await request;
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});

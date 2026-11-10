/** @jest-environment node */

import { createSyncFetch, SYNC_REPLICATION_OPTIONS } from '../public/js/sync-transport.js';

describe('bounded sync reads', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test.each([429, 'network'])(
        'reports a bounded retry wait for %s without exposing request data',
        async (failure) => {
            const onRetry = jest.fn();
            const fetch = jest
                .fn()
                .mockImplementationOnce(() => {
                    if (failure === 'network') throw new TypeError('Failed to fetch');
                    return Promise.resolve(Response.json({}, { status: failure }));
                })
                .mockResolvedValue(Response.json({ ok: true }));
            const result = createSyncFetch(fetch, { onRetry })(
                'https://example.invalid/db/_changes'
            );
            await jest.runAllTimersAsync();
            expect((await result).ok).toBe(true);
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry).toHaveBeenCalledWith({
                retryId: expect.any(Number),
                delay: expect.any(Number),
                attempt: 1,
                status: failure === 'network' ? null : 429
            });
        }
    );

    test.each(['success', 'terminal', 'exhausted', 'abort'])(
        'settles retry feedback once after %s',
        async (outcome) => {
            const controller = new AbortController();
            const onRetry = jest.fn();
            const onRetrySettled = jest.fn();
            const fetch = jest.fn().mockResolvedValueOnce(Response.json({}, { status: 429 }));
            if (outcome === 'exhausted') fetch.mockRejectedValue(new TypeError('Failed to fetch'));
            else
                fetch.mockResolvedValue(
                    Response.json({}, { status: outcome === 'terminal' ? 403 : 200 })
                );
            const request = createSyncFetch(fetch, {
                signal: controller.signal,
                onRetry,
                onRetrySettled
            })('https://example.invalid/db/_revs_diff', { method: 'POST', body: '{}' });
            const settled = request.then(
                (value) => ({ value }),
                (error) => ({ error })
            );
            await jest.advanceTimersByTimeAsync(0);
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetrySettled).not.toHaveBeenCalled();
            if (outcome === 'abort') controller.abort();
            await jest.runAllTimersAsync();
            const result = await settled;
            if (['exhausted', 'abort'].includes(outcome)) expect(result.error).toBeDefined();
            else expect(result.value.status).toBe(outcome === 'terminal' ? 403 : 200);
            expect(onRetrySettled).toHaveBeenCalledTimes(1);
            expect(onRetrySettled).toHaveBeenCalledWith({
                retryId: onRetry.mock.calls[0][0].retryId
            });
            expect(new Set(onRetry.mock.calls.map(([event]) => event.retryId)).size).toBe(1);
        }
    );

    test('gives concurrent retried requests distinct lifecycle IDs', async () => {
        const onRetry = jest.fn();
        const onRetrySettled = jest.fn();
        const calls = new Map();
        const fetch = jest.fn(async (url) => {
            const count = (calls.get(url) || 0) + 1;
            calls.set(url, count);
            return Response.json({}, { status: count === 1 ? 429 : 200 });
        });
        const syncFetch = createSyncFetch(fetch, { onRetry, onRetrySettled });
        const requests = Promise.all([
            syncFetch('https://example.invalid/db/a'),
            syncFetch('https://example.invalid/db/b')
        ]);
        await jest.runAllTimersAsync();
        await requests;
        expect(onRetrySettled).toHaveBeenCalledTimes(2);
        expect(new Set(onRetry.mock.calls.map(([event]) => event.retryId)).size).toBe(2);
        expect(onRetrySettled.mock.calls.map(([event]) => event.retryId).sort()).toEqual(
            onRetry.mock.calls.map(([event]) => event.retryId).sort()
        );
    });

    test('splits conflict leaves by revision count and reassembles every branch by ID', async () => {
        const docs = Array.from({ length: 30 }, (_, index) => ({
            id: `task-${Math.floor(index / 3)}`,
            rev: `1-${index}`
        }));
        const options = {
            method: 'POST',
            headers: { Authorization: 'test' },
            body: JSON.stringify({ docs, attachments: true })
        };
        const calls = [];
        const fetch = jest.fn(async (url, request) => {
            const body = JSON.parse(request.body);
            calls.push(body.docs);
            if (body.docs.length > 20)
                return Response.json({ error: 'too_many_requests' }, { status: 429 });
            expect(body.attachments).toBe(true);
            expect(url).toBe('https://example.invalid/db/_bulk_get?revs=true');
            expect(request.headers).toEqual(options.headers);
            return Response.json(
                {
                    results: body.docs.map((doc) => ({
                        id: doc.id,
                        docs: [{ ok: { _id: doc.id, _rev: doc.rev } }]
                    }))
                },
                {
                    headers: {
                        'X-Test': 'kept',
                        'Content-Length': '123',
                        'Content-Encoding': 'gzip'
                    }
                }
            );
        });
        const promise = createSyncFetch(fetch)(
            'https://example.invalid/db/_bulk_get?revs=true',
            options
        );
        await jest.runAllTimersAsync();
        const response = await promise;
        expect(response.status).toBe(200);
        expect(calls.map((batch) => batch.length)).toEqual([10, 10, 10]);
        expect(calls.flat()).toEqual(docs);
        expect(response.headers.get('X-Test')).toBe('kept');
        expect(response.headers.get('Content-Length')).toBeNull();
        expect(response.headers.get('Content-Encoding')).toBeNull();
        const result = await response.json();
        expect(result.results).toHaveLength(10);
        expect(result.results.flatMap((row) => row.docs.map((doc) => doc.ok._rev))).toEqual(
            docs.map((doc) => doc.rev)
        );
        expect(JSON.parse(options.body).docs).toEqual(docs);
    });

    test('retries only the failed chunk and retains per-revision errors', async () => {
        const docs = Array.from({ length: 25 }, (_, index) => ({
            id: `task-${index}`,
            rev: '1-a'
        }));
        const sizes = [];
        const fetch = jest.fn(async (url, options) => {
            const batch = JSON.parse(options.body).docs;
            sizes.push(batch.length);
            if (sizes.length === 2) return Response.json({}, { status: 429 });
            return Response.json({
                results: batch.map((doc) => ({
                    id: doc.id,
                    docs: [{ error: { id: doc.id, rev: doc.rev, error: 'not_found' } }]
                }))
            });
        });
        const promise = createSyncFetch(fetch)('https://example.invalid/db/_bulk_get', {
            method: 'POST',
            body: JSON.stringify({ docs })
        });
        await jest.runAllTimersAsync();
        const result = await (await promise).json();
        expect(sizes).toEqual([10, 10, 10, 5]);
        expect(result.results).toHaveLength(25);
        expect(result.results.every((row) => row.docs[0].error.error === 'not_found')).toBe(true);
    });

    test('does not return partial success when a later chunk exhausts its retry budget', async () => {
        const sizes = [];
        const fetch = jest.fn(async (url, options) => {
            const docs = JSON.parse(options.body).docs;
            sizes.push(docs.length);
            return sizes.length === 1
                ? Response.json({
                      results: docs.map((doc) => ({ id: doc.id, docs: [{ ok: { _id: doc.id } }] }))
                  })
                : Response.json({ error: 'throttled' }, { status: 429 });
        });
        const promise = createSyncFetch(fetch)('https://example.invalid/db/_bulk_get', {
            method: 'POST',
            body: JSON.stringify({
                docs: Array.from({ length: 25 }, (_, id) => ({ id: String(id), rev: '1-a' }))
            })
        });
        await jest.runAllTimersAsync();
        expect((await promise).status).toBe(429);
        expect(sizes).toEqual([10, 10, 10, 10, 10]);
    });

    test('cancels the remainder of a split read after the first response', async () => {
        const controller = new AbortController();
        const fetch = jest.fn(async (url, options) => {
            const docs = JSON.parse(options.body).docs;
            controller.abort();
            return Response.json({
                results: docs.map((doc) => ({ id: doc.id, docs: [{ ok: doc }] }))
            });
        });
        const promise = createSyncFetch(fetch, { signal: controller.signal })(
            'https://example.invalid/db/_bulk_get',
            {
                method: 'POST',
                body: JSON.stringify({
                    docs: Array.from({ length: 21 }, (_, id) => ({ id: String(id), rev: '1-a' }))
                })
            }
        );
        const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
        await jest.runAllTimersAsync();
        await rejected;
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetch.mock.calls[0][1].body).docs).toHaveLength(10);
    });

    test.each([{ results: {} }, { results: [{ id: 'bad', docs: {} }] }, { results: [null] }])(
        'rejects malformed successful chunk responses instead of synthesizing completeness: %j',
        async (payload) => {
            const fetch = jest.fn(async () => Response.json(payload));
            const promise = createSyncFetch(fetch)('https://example.invalid/db/_bulk_get', {
                method: 'POST',
                body: JSON.stringify({
                    docs: Array.from({ length: 11 }, (_, id) => ({ id: String(id), rev: '1-a' }))
                })
            });
            const rejected = expect(promise).rejects.toThrow('Invalid bulk-read response.');
            await jest.runAllTimersAsync();
            await rejected;
            expect(fetch).toHaveBeenCalledTimes(1);
        }
    );

    test.each(['not-json', '{', '{"other":[]}'])(
        'preserves endpoint handling for body %s',
        async (body) => {
            const fetch = jest.fn(async () => new Response('', { status: 400 }));
            const options = { method: 'POST', body };
            const response = await createSyncFetch(fetch)(
                'https://example.invalid/db/_bulk_get',
                options
            );
            expect(response.status).toBe(400);
            expect(fetch).toHaveBeenCalledWith('https://example.invalid/db/_bulk_get', options);
        }
    );

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

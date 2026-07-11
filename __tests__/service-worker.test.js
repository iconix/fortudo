import fs from 'fs';
import vm from 'vm';

const serviceWorkerSource = fs.readFileSync('public/sw.js', 'utf8');

function deferred() {
    let resolve;
    const promise = new Promise((promiseResolve) => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
}

function createWorkerHarness({ cacheKeys = [], fetchImpl = jest.fn() } = {}) {
    const listeners = {};
    const cache = {
        add: jest.fn().mockResolvedValue(undefined),
        addAll: jest.fn().mockResolvedValue(undefined),
        put: jest.fn().mockResolvedValue(undefined)
    };
    const caches = {
        delete: jest.fn().mockResolvedValue(true),
        keys: jest.fn().mockResolvedValue(cacheKeys),
        match: jest.fn(),
        open: jest.fn().mockResolvedValue(cache)
    };
    const self = {
        addEventListener: jest.fn((type, handler) => {
            listeners[type] = handler;
        }),
        clients: { claim: jest.fn().mockResolvedValue(undefined) },
        location: { origin: 'http://localhost' },
        skipWaiting: jest.fn()
    };
    class WorkerRequest {
        constructor(url, options = {}) {
            this.url = url;
            this.cache = options.cache;
        }
    }

    vm.runInNewContext(serviceWorkerSource, {
        PRECACHE_URLS: [],
        PRECACHE_VERSION: 'current',
        Promise,
        Request: WorkerRequest,
        Set,
        URL,
        caches,
        fetch: fetchImpl,
        importScripts: jest.fn(),
        self
    });

    return { cache, caches, listeners, self };
}

function dispatchConfigFetch(harness) {
    const request = { mode: 'same-origin', url: 'http://localhost/js/config.js' };
    let responsePromise;
    harness.listeners.fetch({
        request,
        respondWith(promise) {
            responsePromise = promise;
        }
    });
    return { request, responsePromise };
}

describe('Fortudo service worker', () => {
    test('activate deletes obsolete Fortudo shells but preserves unrelated caches', async () => {
        const harness = createWorkerHarness({
            cacheKeys: ['fortudo-shell-current', 'fortudo-shell-old', 'pouchdb-room-data']
        });
        let activation;

        harness.listeners.activate({ waitUntil: (promise) => (activation = promise) });
        await activation;

        expect(harness.caches.delete).toHaveBeenCalledTimes(1);
        expect(harness.caches.delete).toHaveBeenCalledWith('fortudo-shell-old');
        expect(harness.caches.delete).not.toHaveBeenCalledWith('pouchdb-room-data');
    });

    test('successful config fetch waits for the cache write before resolving', async () => {
        const cacheWrite = deferred();
        const response = { clone: jest.fn(() => ({ body: 'copy' })), ok: true };
        const harness = createWorkerHarness({ fetchImpl: jest.fn().mockResolvedValue(response) });
        harness.cache.put.mockReturnValue(cacheWrite.promise);
        const { request, responsePromise } = dispatchConfigFetch(harness);
        let settled = false;
        responsePromise.then(() => {
            settled = true;
        });

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(harness.cache.put).toHaveBeenCalledWith(request, { body: 'copy' });
        expect(settled).toBe(false);

        cacheWrite.resolve();
        await expect(responsePromise).resolves.toBe(response);
    });

    test('non-ok config response does not overwrite the cached config', async () => {
        const response = { clone: jest.fn(), ok: false };
        const harness = createWorkerHarness({ fetchImpl: jest.fn().mockResolvedValue(response) });
        const { responsePromise } = dispatchConfigFetch(harness);

        await expect(responsePromise).resolves.toBe(response);

        expect(response.clone).not.toHaveBeenCalled();
        expect(harness.cache.put).not.toHaveBeenCalled();
    });

    test('successful config fetch remains fresh when cache persistence fails', async () => {
        const response = { clone: jest.fn(() => ({ body: 'copy' })), ok: true };
        const harness = createWorkerHarness({ fetchImpl: jest.fn().mockResolvedValue(response) });
        harness.cache.put.mockRejectedValue(new Error('cache unavailable'));
        const { responsePromise } = dispatchConfigFetch(harness);

        await expect(responsePromise).resolves.toBe(response);
    });

    test('config network failure falls back to the cached config', async () => {
        const cachedResponse = { body: 'cached config' };
        const harness = createWorkerHarness({
            fetchImpl: jest.fn().mockRejectedValue(new Error('offline'))
        });
        harness.caches.match.mockResolvedValue(cachedResponse);
        const { request, responsePromise } = dispatchConfigFetch(harness);

        await expect(responsePromise).resolves.toBe(cachedResponse);
        expect(harness.caches.match).toHaveBeenCalledWith(request);
    });
});

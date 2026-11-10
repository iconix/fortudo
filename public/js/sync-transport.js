// Leave headroom within the measured 20-read/sec instance allowance. The transport
// also spaces bulk reads; batches_limit alone does not limit sustained throughput.
export const SYNC_REPLICATION_OPTIONS = Object.freeze({
    batch_size: 10,
    batches_limit: 1,
    retry: false
});

const MAX_RETRIES = 3;
const MAX_DELAY_MS = 30000;
const BULK_READ_INTERVAL_MS = 1100;
const MAX_BULK_READ_REVISIONS = 10;
const CHECKPOINT_WRITE_INTERVAL_MS = 200;
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);

function waitForRetry(delay, signal) {
    return new Promise((resolve, reject) => {
        const finish = () => {
            signal?.removeEventListener('abort', abort);
            resolve();
        };
        const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            reject(signal.reason);
        };
        const timer = setTimeout(finish, delay);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
    });
}

function createPacedFetch(fetchImplementation, interval) {
    let tail = Promise.resolve();
    let nextRequestAt = 0;

    return (url, options) => {
        const request = tail.then(async () => {
            options.signal?.throwIfAborted();
            const delay = nextRequestAt - performance.now();
            if (delay > 0) await waitForRetry(delay, options.signal);
            options.signal?.throwIfAborted();
            try {
                return await fetchImplementation(url, options);
            } finally {
                // Wait from completion so a slow request cannot bunch up with the
                // next one. Include failed attempts in the same pacing budget.
                nextRequestAt = performance.now() + interval;
            }
        });
        tail = request.catch(() => {});
        return request;
    };
}

function checkpointDocument(url, options) {
    if (options.method?.toUpperCase() !== 'PUT' || typeof options.body !== 'string') return null;
    try {
        const path = new URL(url).pathname;
        const match = path.match(/\/_local\/([^/]+)$/);
        const document = JSON.parse(options.body);
        return match &&
            document?._id === `_local/${decodeURIComponent(match[1])}` &&
            document.version === 1 &&
            document.replicator === 'pouchdb' &&
            typeof document.session_id === 'string' &&
            document.session_id.length > 0 &&
            Object.prototype.hasOwnProperty.call(document, 'last_seq') &&
            Array.isArray(document.history)
            ? document
            : null;
    } catch {
        return null;
    }
}

/** Pace bulk reads/checkpoints; retry reads and explicitly rejected checkpoint writes only. */
export function createSyncFetch(fetchImplementation, { signal } = {}) {
    const fetchBulkRead = createPacedFetch(fetchImplementation, BULK_READ_INTERVAL_MS);
    // Five writes/sec leaves headroom under the observed ten-write/sec allowance.
    // Each remote handle has its own queue; this is not an account-wide limit.
    const fetchCheckpointWrite = createPacedFetch(
        fetchImplementation,
        CHECKPOINT_WRITE_INTERVAL_MS
    );

    return async function syncFetch(url, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const isBulkRead = method === 'POST' && /\/_bulk_get(?:\?|$)/.test(url);
        const checkpoint = checkpointDocument(url, options);
        const canRetry =
            Boolean(checkpoint) ||
            method === 'GET' ||
            method === 'HEAD' ||
            (method === 'POST' && /\/(?:_bulk_get|_revs_diff|_all_docs)(?:\?|$)/.test(url));
        const requestSignal =
            signal && options.signal
                ? AbortSignal.any([signal, options.signal])
                : signal || options.signal;
        const requestOptions = requestSignal ? { ...options, signal: requestSignal } : options;
        if (isBulkRead && typeof options.body === 'string') {
            let body;
            try {
                body = JSON.parse(options.body);
            } catch {
                // Preserve the endpoint's handling of malformed/non-JSON bodies.
            }
            if (Array.isArray(body?.docs) && body.docs.length > MAX_BULK_READ_REVISIONS) {
                // Replication batch_size counts change rows, not conflict leaves.
                // Split by requested revisions and use the same pacing/retry queue
                // for each chunk. Never expose a partially successful response.
                const results = new Map();
                let lastResponse;
                for (let index = 0; index < body.docs.length; index += MAX_BULK_READ_REVISIONS) {
                    const response = await syncFetch(url, {
                        ...requestOptions,
                        body: JSON.stringify({
                            ...body,
                            docs: body.docs.slice(index, index + MAX_BULK_READ_REVISIONS)
                        })
                    });
                    if (!response.ok) return response;
                    const payload = await response.json();
                    if (!Array.isArray(payload?.results))
                        throw new Error('Invalid bulk-read response.');
                    for (const row of payload.results) {
                        if (typeof row?.id !== 'string' || !Array.isArray(row.docs))
                            throw new Error('Invalid bulk-read response.');
                        const existing = results.get(row.id);
                        if (existing) existing.docs.push(...row.docs);
                        else results.set(row.id, { ...row, docs: [...row.docs] });
                    }
                    lastResponse = response;
                }
                const headers = new Headers(lastResponse.headers);
                headers.delete('Content-Length');
                headers.delete('Content-Encoding');
                return new Response(JSON.stringify({ results: [...results.values()] }), {
                    status: lastResponse.status,
                    statusText: lastResponse.statusText,
                    headers
                });
            }
        }
        for (let attempt = 0; ; attempt += 1) {
            requestSignal?.throwIfAborted();
            let response;
            try {
                response = await (isBulkRead
                    ? fetchBulkRead(url, requestOptions)
                    : checkpoint
                      ? fetchCheckpointWrite(url, requestOptions)
                      : fetchImplementation(url, requestOptions));
                // Only a visible 429 establishes that the checkpoint write was
                // rejected. Gateway failures can hide a successfully applied PUT.
                if (checkpoint && response.status !== 429) return response;
                if (!TRANSIENT_STATUSES.has(response.status)) return response;
            } catch (error) {
                if (checkpoint && error instanceof TypeError) {
                    // A CORS-hidden failure has an ambiguous outcome. Confirm the
                    // exact checkpoint, never replay a potentially applied write or
                    // overwrite another session's checkpoint/history.
                    try {
                        const confirmed = await syncFetch(url, {
                            ...requestOptions,
                            method: 'GET',
                            body: undefined
                        });
                        if (confirmed.ok) {
                            const stored = await confirmed.json();
                            if (
                                typeof stored?._rev === 'string' &&
                                Object.keys(checkpoint)
                                    .filter((field) => field !== '_rev')
                                    .every(
                                        (field) =>
                                            JSON.stringify(stored[field]) ===
                                            JSON.stringify(checkpoint[field])
                                    )
                            ) {
                                requestSignal?.throwIfAborted();
                                return Response.json(
                                    { ok: true, id: stored._id, rev: stored._rev },
                                    { status: 201 }
                                );
                            }
                        }
                    } catch {
                        // Failed confirmation cannot establish write success.
                    }
                    requestSignal?.throwIfAborted();
                    throw error;
                }
                // Browsers hide a CORS-blocked 429 behind TypeError. Do not claim
                // every such error is throttling, but give reads the same finite budget.
                if (!(error instanceof TypeError) || !canRetry || attempt === MAX_RETRIES) {
                    throw error;
                }
            }
            if (checkpoint && attempt === MAX_RETRIES) {
                // PouchDB treats any source-checkpoint 4xx as read-only access and
                // silently disables that checkpoint. Exhausted throttling must
                // remain a replication failure, not permission to skip it.
                await response.body?.cancel().catch(() => {});
                throw new Error('Checkpoint write is still rate-limited. Retry sync.');
            }
            if (!canRetry || attempt === MAX_RETRIES) return response;
            const retryAfter = response?.headers.get('Retry-After');
            const serverDelay = retryAfter
                ? /^\d+(?:\.\d+)?$/.test(retryAfter)
                    ? Number(retryAfter) * 1000
                    : Date.parse(retryAfter) - Date.now()
                : NaN;
            const delay = Math.min(
                MAX_DELAY_MS,
                Math.max(
                    1000 * 2 ** attempt + Math.floor(Math.random() * 250),
                    Number.isFinite(serverDelay) ? serverDelay : 0
                )
            );
            await response?.body?.cancel().catch(() => {});
            await waitForRetry(delay, requestSignal);
        }
    };
}

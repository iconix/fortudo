// Keep the read burst small; batches_limit limits queued batches, not requests/second.
export const SYNC_REPLICATION_OPTIONS = Object.freeze({
    batch_size: 20,
    batches_limit: 1,
    retry: false
});

const MAX_RETRIES = 3;
const MAX_DELAY_MS = 30000;
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

/** Retry only safe reads, with a finite budget and cancellation for the room session. */
export function createSyncFetch(fetchImplementation, { signal } = {}) {
    return async (url, options = {}) => {
        const method = (options.method || 'GET').toUpperCase();
        const canRetry =
            method === 'GET' ||
            method === 'HEAD' ||
            (method === 'POST' && /\/(?:_bulk_get|_revs_diff|_all_docs)(?:\?|$)/.test(url));
        const requestSignal =
            signal && options.signal
                ? AbortSignal.any([signal, options.signal])
                : signal || options.signal;
        const requestOptions = requestSignal ? { ...options, signal: requestSignal } : options;
        for (let attempt = 0; ; attempt += 1) {
            requestSignal?.throwIfAborted();
            let response;
            try {
                response = await fetchImplementation(url, requestOptions);
                if (!TRANSIENT_STATUSES.has(response.status)) return response;
            } catch (error) {
                // Browsers hide a CORS-blocked 429 behind TypeError. Do not claim
                // every such error is throttling, but give reads the same finite budget.
                if (!(error instanceof TypeError) || !canRetry || attempt === MAX_RETRIES) {
                    throw error;
                }
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

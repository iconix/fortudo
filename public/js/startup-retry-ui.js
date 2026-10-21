/** Show startup retry progress and outcomes without bypassing storage preparation. */
export function createStartupRetry({ signal, notify, retry, readState, enqueue, requestRetry }) {
    let inFlight = false;
    let attemptedRetry = false;
    const toastKey = 'storage-preparation-error';

    function showFailure() {
        if (signal.aborted) return;
        notify(
            attemptedRetry
                ? 'Tasks still could not load. Your draft is kept in this tab. Try again, or reload Fortudo if this continues.'
                : 'Tasks could not finish loading. Your task draft is kept in this tab. Retry to continue.',
            {
                theme: 'rose',
                dedupeKey: toastKey,
                action: { label: 'Retry', onClick: requestRetry || retryStartup }
            }
        );
    }

    async function retryStartup() {
        if (inFlight || signal.aborted) return;
        inFlight = true;
        attemptedRetry = true;
        notify('Retrying startup…', { theme: 'sky', dedupeKey: toastKey, duration: 30000 });
        try {
            const loaded = await enqueue(() => {
                if (signal.aborted) return;
                return retry();
            });
            if (signal.aborted) return;
            if (loaded !== true) {
                showFailure();
                return;
            }
            const state = readState();
            notify(state.allowed ? 'Tasks loaded. You can edit tasks again.' : state.message, {
                theme: state.allowed ? 'teal' : 'rose',
                dedupeKey: toastKey
            });
        } catch {
            showFailure();
        } finally {
            inFlight = false;
        }
    }

    return { showFailure, retry: retryStartup };
}

const RESULTS = {
    'replica-replaced':
        'This room was repaired in another tab. Reload to use its current local copy.',
    synced: 'Sync complete.',
    unsynced: 'Sync finished, but some changes are still waiting to sync.',
    offline: 'Sync could not connect. Check your connection and try again.',
    error: 'Sync failed again. Check your connection and try again.',
    'validator-mismatch':
        'Sync is still blocked by this room’s configuration. The setup needs to be fixed.',
    'audit-error':
        'Sync checks still could not verify your local changes. Try again, or reload Fortudo if this continues.',
    'update-required': 'Sync is still blocked. Reload Fortudo to update this room.',
    'update-required-available': 'Sync is still blocked. Reload Fortudo to update this room.',
    'recovery-required':
        'Sync is still blocked. Use the recovery message to preserve your local changes.',
    unprovisioned: 'The cloud room is still unavailable. Its sync setup needs attention.'
};

/** Give sync-badge clicks visible feedback without changing background sync notifications. */
export function initializeManualSync({
    signal,
    notify,
    triggerSync,
    getSyncStatus,
    isPreparing,
    renderStatus,
    retryStartup,
    retryAudit
}) {
    const button = document.getElementById('sync-status-indicator');
    let inFlight = false;
    const options = { dedupeKey: 'manual-sync' };
    signal.addEventListener('abort', () => button?.removeAttribute('aria-busy'), { once: true });

    async function requestSync() {
        if (inFlight || signal.aborted) return;
        const currentStatus = getSyncStatus?.();
        const retryOperation =
            currentStatus === 'preparation-error'
                ? retryStartup
                : currentStatus === 'audit-error'
                  ? retryAudit
                  : null;
        if (currentStatus !== 'preparation-error' && isPreparing()) {
            notify('Tasks are still loading. Sync will be available when startup finishes.', {
                ...options,
                theme: 'sky'
            });
            return;
        }
        if (currentStatus === 'idle') {
            notify('Cloud sync is not configured for this room.', { ...options, theme: 'slate' });
            return;
        }
        inFlight = true;
        button?.setAttribute('aria-busy', 'true');
        renderStatus?.('syncing');
        try {
            if (retryOperation) {
                await retryOperation();
                return;
            }
            notify('Checking sync…', { ...options, theme: 'sky', duration: 30000 });
            await triggerSync();
            if (signal.aborted) return;
            const status = getSyncStatus?.();
            notify(
                RESULTS[status] ||
                    'Sync checks finished. See the sync badge for the current status.',
                {
                    ...options,
                    theme: status === 'synced' ? 'teal' : 'amber'
                }
            );
        } catch {
            if (!signal.aborted)
                notify('Sync could not finish. Please try again.', { ...options, theme: 'rose' });
        } finally {
            inFlight = false;
            if (!signal.aborted) {
                button?.removeAttribute('aria-busy');
                renderStatus?.(getSyncStatus?.());
            }
        }
    }

    button?.addEventListener('click', requestSync, { signal });
    return requestSync;
}

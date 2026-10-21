import { initializeManualSync } from '../public/js/manual-sync-ui.js';

describe('manual sync feedback', () => {
    let abort;
    let notify;
    let sync;
    let status;
    let preparing;
    let button;
    let renderStatus;
    let retryStartup;
    let retryAudit;
    let requestRetry;

    beforeEach(() => {
        abort = new AbortController();
        notify = jest.fn();
        sync = jest.fn().mockResolvedValue(undefined);
        status = 'error';
        preparing = false;
        document.body.innerHTML = '<button id="sync-status-indicator">Sync</button>';
        button = document.getElementById('sync-status-indicator');
        renderStatus = jest.fn();
        retryStartup = jest.fn().mockResolvedValue(undefined);
        retryAudit = jest.fn().mockResolvedValue(undefined);
        requestRetry = initializeManualSync({
            signal: abort.signal,
            notify,
            triggerSync: sync,
            getSyncStatus: () => status,
            isPreparing: () => preparing,
            renderStatus,
            retryStartup,
            retryAudit
        });
    });

    afterEach(() => abort.abort());

    test('shows progress, ignores duplicate clicks, and reports a repeated failure', async () => {
        let finish;
        sync.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        button.click();
        button.click();
        expect(sync).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenLastCalledWith('Checking sync…', expect.any(Object));
        expect(button.getAttribute('aria-busy')).toBe('true');
        expect(renderStatus).toHaveBeenLastCalledWith('syncing');
        finish();
        await Promise.resolve();
        expect(notify).toHaveBeenLastCalledWith(
            expect.stringMatching(/failed again/i),
            expect.any(Object)
        );
        expect(button.hasAttribute('aria-busy')).toBe(false);
        expect(renderStatus).toHaveBeenLastCalledWith('error');
    });

    test.each([
        ['synced', /sync complete/i],
        ['offline', /connect/i],
        ['validator-mismatch', /configuration/i],
        ['audit-error', /verify/i],
        ['update-required', /reload/i],
        ['update-required-available', /reload/i],
        ['recovery-required', /recovery/i],
        ['unprovisioned', /cloud room/i],
        ['unsynced', /waiting/i],
        ['missing-validator', /badge/i]
    ])('explains the %s result', async (result, message) => {
        sync.mockImplementation(async () => {
            status = result;
        });
        button.click();
        await Promise.resolve();
        expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(message), expect.any(Object));
    });

    test.each(['loading', 'local'])('explains why %s cannot start a manual sync', (state) => {
        preparing = state === 'loading';
        status =
            state === 'startup-error'
                ? 'preparation-error'
                : state === 'local'
                  ? 'idle'
                  : 'checking';
        button.click();
        expect(sync).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith(
            expect.stringMatching(
                state === 'startup-error'
                    ? /retry.*startup/i
                    : state === 'local'
                      ? /not configured/i
                      : /loading/i
            ),
            expect.any(Object)
        );
    });

    test.each(['preparation-error', 'audit-error'])(
        'badge and toast requests share one guarded %s retry',
        async (state) => {
            status = state;
            preparing = state === 'preparation-error';
            const retry = preparing ? retryStartup : retryAudit;
            let finish;
            retry.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    })
            );
            button.click();
            await requestRetry();
            expect(retry).toHaveBeenCalledTimes(1);
            expect(sync).not.toHaveBeenCalled();
            expect(button.getAttribute('aria-busy')).toBe('true');
            finish();
            await Promise.resolve();
            expect(button.hasAttribute('aria-busy')).toBe(false);
        }
    );

    test('handles rejection and avoids stale results after leaving the room', async () => {
        sync.mockRejectedValueOnce(new Error('private diagnostic'));
        button.click();
        await Promise.resolve();
        expect(notify).toHaveBeenLastCalledWith(
            'Sync could not finish. Please try again.',
            expect.any(Object)
        );
        sync.mockImplementationOnce(async () => {
            abort.abort();
        });
        button.click();
        await Promise.resolve();
        expect(notify).toHaveBeenLastCalledWith('Checking sync…', expect.any(Object));
        expect(button.hasAttribute('aria-busy')).toBe(false);
        sync.mockClear();
        button.click();
        expect(sync).not.toHaveBeenCalled();
    });

    test('tolerates a missing badge', () => {
        document.body.innerHTML = '';
        expect(() =>
            initializeManualSync({
                signal: abort.signal,
                notify,
                triggerSync: sync,
                getSyncStatus: () => status,
                isPreparing: () => false
            })
        ).not.toThrow();
    });

    test('an old room retry cannot clear the new room busy state', async () => {
        let finish;
        sync.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        const operation = requestRetry();
        abort.abort();
        expect(button.hasAttribute('aria-busy')).toBe(false);
        button.setAttribute('aria-busy', 'true');
        finish();
        await operation;
        expect(button.getAttribute('aria-busy')).toBe('true');
    });
});

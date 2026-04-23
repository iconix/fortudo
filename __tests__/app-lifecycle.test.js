/**
 * @jest-environment jsdom
 */

import { createRoomSessionLifecycle } from '../public/js/app-lifecycle.js';

describe('app room/session lifecycle', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-21T23:59:58'));
        document.body.innerHTML = '<div id="sync-status-text"></div>';
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function createLifecycle(overrides = {}) {
        const deps = {
            loadAppState: jest.fn(async () => {}),
            refreshUI: jest.fn(),
            getActivitiesEnabled: jest.fn(() => true),
            syncRestoredRunningTimer: jest.fn(),
            getTaskState: jest.fn(() => []),
            refreshActiveTaskColor: jest.fn(),
            refreshCurrentGapHighlight: jest.fn(),
            refreshStartTimeField: jest.fn(),
            getRunningActivity: jest.fn(() => null),
            stopTimerAt: jest.fn(async () => ({ success: true })),
            syncTimerFormState: jest.fn(),
            refreshTaskDisplays: jest.fn(),
            onSyncStatusChange: jest.fn(() => jest.fn()),
            updateSyncStatusUI: jest.fn(),
            triggerSync: jest.fn(async () => {}),
            logger: {
                error: jest.fn()
            },
            ...overrides
        };

        return {
            deps,
            lifecycle: createRoomSessionLifecycle(deps)
        };
    }

    test('dedupes overlapping storage refreshes and re-syncs restored timer state', async () => {
        let resolveLoadAppState;
        const pendingLoadAppState = new Promise((resolve) => {
            resolveLoadAppState = resolve;
        });
        const { deps, lifecycle } = createLifecycle({
            loadAppState: jest.fn(() => pendingLoadAppState)
        });

        const firstRefresh = lifecycle.refreshFromStorage();
        const secondRefresh = lifecycle.refreshFromStorage();

        expect(deps.loadAppState).toHaveBeenCalledTimes(1);

        resolveLoadAppState();
        await firstRefresh;
        await secondRefresh;

        expect(deps.refreshUI).toHaveBeenCalledTimes(1);
        expect(deps.syncRestoredRunningTimer).toHaveBeenCalledWith(true);
        expect(deps.refreshActiveTaskColor).toHaveBeenCalledWith([]);
        expect(deps.refreshCurrentGapHighlight).toHaveBeenCalledTimes(1);
    });

    test('wires sync status updates and refreshes after sync completion', async () => {
        let syncStatusCallback;
        const unsubscribe = jest.fn();
        const { deps, lifecycle } = createLifecycle({
            onSyncStatusChange: jest.fn((callback) => {
                syncStatusCallback = callback;
                return unsubscribe;
            })
        });

        const abortController = new AbortController();
        lifecycle.start({ signal: abortController.signal });

        deps.loadAppState.mockClear();
        syncStatusCallback('synced');
        await Promise.resolve();
        await Promise.resolve();

        expect(deps.updateSyncStatusUI).toHaveBeenCalledWith('synced');
        expect(deps.loadAppState).toHaveBeenCalledTimes(1);

        lifecycle.stop();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    test('refreshes from storage on visibility changes and triggers sync on focus', async () => {
        const { deps, lifecycle } = createLifecycle();
        const abortController = new AbortController();

        lifecycle.start({ signal: abortController.signal });

        deps.loadAppState.mockClear();
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
        await Promise.resolve();

        expect(deps.loadAppState).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new Event('focus'));
        await Promise.resolve();

        expect(deps.triggerSync).toHaveBeenCalledWith({ respectCooldown: true });
    });

    test('runs the clock tick loop and stops a running timer at midnight', async () => {
        const currentTime = new Date('2026-04-21T23:59:59');
        jest.setSystemTime(currentTime);
        const expectedBoundary = new Date('2026-04-22T00:00:00');
        expectedBoundary.setHours(0, 0, 0, 0);

        const { deps, lifecycle } = createLifecycle({
            getRunningActivity: jest.fn(() => ({
                description: 'Running timer',
                startDateTime: '2026-04-21T23:30:00.000Z'
            }))
        });
        const abortController = new AbortController();

        lifecycle.start({ signal: abortController.signal });
        deps.loadAppState.mockClear();
        deps.refreshUI.mockClear();
        deps.syncRestoredRunningTimer.mockClear();
        deps.syncTimerFormState.mockClear();
        deps.refreshTaskDisplays.mockClear();

        jest.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();

        expect(deps.stopTimerAt).toHaveBeenCalledWith(expectedBoundary.toISOString());
        expect(deps.loadAppState).toHaveBeenCalledTimes(1);
        expect(deps.refreshUI).toHaveBeenCalledTimes(1);
        expect(deps.syncRestoredRunningTimer).toHaveBeenCalledWith(true);
        expect(deps.syncTimerFormState).not.toHaveBeenCalled();
        expect(deps.refreshTaskDisplays).not.toHaveBeenCalled();
        expect(deps.refreshStartTimeField).toHaveBeenCalledTimes(1);
    });
});

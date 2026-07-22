/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/sync-contract.js', () => ({
    inspectRemoteDocumentContract: jest.fn(),
    auditLocalDivergence: jest.fn(),
    findRemoteMissingLeaves: jest.fn()
}));

import {
    auditLocalDivergence,
    findRemoteMissingLeaves,
    inspectRemoteDocumentContract
} from '../public/js/sync-contract.js';

import {
    initSync,
    triggerSync,
    teardownSync,
    onSyncStatusChange,
    onSyncDataChange,
    getSyncStatus,
    debouncedSync,
    waitForSyncPreflight
} from '../public/js/sync-manager.js';

async function waitForCallCount(mock, count) {
    for (let attempt = 0; attempt < 20 && mock.mock.calls.length < count; attempt += 1) {
        await Promise.resolve();
    }
    expect(mock).toHaveBeenCalledTimes(count);
}

describe('Sync Manager', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        window.PouchDB = jest.fn(() => ({}));
        inspectRemoteDocumentContract.mockResolvedValue({
            state: 'compatible',
            compatible: true,
            contractRevision: '1-contract'
        });
        auditLocalDivergence.mockResolvedValue({
            state: 'compatible',
            remotePresent: [],
            eligible: [],
            recoveryRequired: [],
            designLeaves: [],
            updateSequence: 1
        });
        findRemoteMissingLeaves.mockResolvedValue([]);
    });

    afterEach(() => {
        teardownSync();
        jest.restoreAllMocks();
        jest.useRealTimers();
        delete window.PouchDB;
    });

    describe('getSyncStatus', () => {
        test('returns "idle" before initialization', () => {
            expect(getSyncStatus()).toBe('idle');
        });

        test('returns "idle" after initSync', () => {
            initSync({}, 'http://localhost:5984/test');
            expect(getSyncStatus()).toBe('idle');
        });
    });

    describe('onSyncStatusChange', () => {
        test('registers a callback and returns unsubscribe function', () => {
            const callback = jest.fn();
            const unsubscribe = onSyncStatusChange(callback);
            expect(typeof unsubscribe).toBe('function');
            unsubscribe();
        });

        test('callback is invoked when status changes via triggerSync', async () => {
            const callback = jest.fn();
            onSyncStatusChange(callback);

            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://localhost:5984/test');
            await triggerSync();

            expect(callback).toHaveBeenCalledWith('syncing');
            expect(callback).toHaveBeenCalledWith('synced');
        });

        test('unsubscribed callback is not invoked', async () => {
            const callback = jest.fn();
            const unsubscribe = onSyncStatusChange(callback);
            unsubscribe();

            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://localhost:5984/test');
            await triggerSync();

            expect(callback).not.toHaveBeenCalled();
        });

        test('callback errors are caught and do not propagate', async () => {
            const badCallback = jest.fn(() => {
                throw new Error('callback error');
            });
            const goodCallback = jest.fn();
            onSyncStatusChange(badCallback);
            onSyncStatusChange(goodCallback);

            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://localhost:5984/test');
            await triggerSync();

            // Bad callback threw, but good callback still received updates
            expect(goodCallback).toHaveBeenCalledWith('syncing');
            expect(goodCallback).toHaveBeenCalledWith('synced');
        });
    });

    describe('onSyncDataChange', () => {
        test('notifies listeners only when pull replication writes local documents', async () => {
            const callback = jest.fn();
            onSyncDataChange(callback);
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest
                        .fn()
                        .mockResolvedValueOnce({ docs_written: 0 })
                        .mockResolvedValueOnce({ docs_written: 2 })
                }
            };
            initSync(mockDb, 'http://localhost:5984/test');

            await triggerSync();
            expect(callback).not.toHaveBeenCalled();

            await triggerSync();
            expect(callback).toHaveBeenCalledTimes(1);
        });

        test('returns an unsubscribe function', async () => {
            const callback = jest.fn();
            const unsubscribe = onSyncDataChange(callback);
            unsubscribe();
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({ docs_written: 1 })
                }
            };
            initSync(mockDb, 'http://localhost:5984/test');

            await triggerSync();

            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('triggerSync', () => {
        test('does nothing when no remote URL configured', async () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, null);
            await triggerSync();
            expect(mockDb.replicate.to).not.toHaveBeenCalled();
            expect(mockDb.replicate.from).not.toHaveBeenCalled();
            expect(getSyncStatus()).toBe('idle');
        });

        test('does nothing when no local db', async () => {
            initSync(null, 'http://localhost:5984/test');
            await triggerSync();
            expect(getSyncStatus()).toBe('idle');
        });

        test('performs bidirectional sync and sets status to synced', async () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            await triggerSync();

            expect(mockDb.replicate.to).toHaveBeenCalledWith('http://remote:5984/db');
            expect(mockDb.replicate.from).toHaveBeenCalledWith('http://remote:5984/db');
            expect(getSyncStatus()).toBe('synced');
        });

        test('sets status to error when replication fails', async () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockRejectedValue(new Error('network error')),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            await triggerSync();

            expect(getSyncStatus()).toBe('error');
        });

        test('sets status to offline when replication fails while the browser is offline', async () => {
            const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
            const mockDb = {
                replicate: {
                    to: jest.fn().mockRejectedValue(new Error('network error')),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            try {
                initSync(mockDb, 'http://remote:5984/db');
                await triggerSync();

                expect(getSyncStatus()).toBe('offline');
            } finally {
                if (originalOnLine) {
                    Object.defineProperty(navigator, 'onLine', originalOnLine);
                } else {
                    delete navigator.onLine;
                }
            }
        });

        test('keeps error status when replication fails while the browser is online', async () => {
            const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
            const mockDb = {
                replicate: {
                    to: jest.fn().mockRejectedValue(new Error('server error')),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            try {
                initSync(mockDb, 'http://remote:5984/db');
                await triggerSync();

                expect(getSyncStatus()).toBe('error');
            } finally {
                if (originalOnLine) {
                    Object.defineProperty(navigator, 'onLine', originalOnLine);
                } else {
                    delete navigator.onLine;
                }
            }
        });

        test('sets status to error when pull fails', async () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockRejectedValue(new Error('pull error'))
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            await triggerSync();

            expect(getSyncStatus()).toBe('error');
        });

        test('does not start another sync while one is in flight', async () => {
            let resolveFirstSync;
            const firstSyncPromise = new Promise((resolve) => {
                resolveFirstSync = resolve;
            });
            const mockDb = {
                replicate: {
                    to: jest.fn().mockImplementation(() => firstSyncPromise),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            initSync(mockDb, 'http://remote:5984/db');
            await waitForSyncPreflight();

            const firstTrigger = triggerSync();
            const secondTrigger = triggerSync();

            await waitForCallCount(mockDb.replicate.to, 1);

            resolveFirstSync({});
            await firstTrigger;
            await secondTrigger;
        });

        test('retries once when reconnect arrives during an in-flight sync that fails', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            let rejectFirstSync;
            const firstSyncPromise = new Promise((resolve, reject) => {
                rejectFirstSync = reject;
            });
            const mockDb = {
                replicate: {
                    to: jest
                        .fn()
                        .mockImplementationOnce(() => firstSyncPromise)
                        .mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            initSync(mockDb, 'http://remote:5984/db');
            await waitForSyncPreflight();
            const firstTrigger = triggerSync();
            const reconnectTrigger = triggerSync({
                respectCooldown: false,
                retryAfterInFlightFailure: true
            });
            const duplicateReconnectTrigger = triggerSync({
                respectCooldown: false,
                retryAfterInFlightFailure: true
            });

            rejectFirstSync(new Error('offline during reconnect'));
            await firstTrigger;
            await reconnectTrigger;
            await duplicateReconnectTrigger;

            expect(mockDb.replicate.to).toHaveBeenCalledTimes(2);
            expect(mockDb.replicate.from).toHaveBeenCalledTimes(1);
            expect(getSyncStatus()).toBe('synced');
            consoleErrorSpy.mockRestore();
        });

        test('does not retry when reconnect coalesces with an in-flight sync that succeeds', async () => {
            let resolveFirstSync;
            const firstSyncPromise = new Promise((resolve) => {
                resolveFirstSync = resolve;
            });
            const mockDb = {
                replicate: {
                    to: jest.fn().mockImplementation(() => firstSyncPromise),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            initSync(mockDb, 'http://remote:5984/db');
            await waitForSyncPreflight();
            const firstTrigger = triggerSync();
            const reconnectTrigger = triggerSync({
                respectCooldown: false,
                retryAfterInFlightFailure: true
            });

            resolveFirstSync({});
            await firstTrigger;
            await reconnectTrigger;

            expect(mockDb.replicate.to).toHaveBeenCalledTimes(1);
            expect(mockDb.replicate.from).toHaveBeenCalledTimes(1);
            expect(getSyncStatus()).toBe('synced');
        });

        test('does not queue another retry when reconnect fires during the follow-up attempt', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            let rejectFirstSync;
            let rejectRetrySync;
            const firstSyncPromise = new Promise((resolve, reject) => {
                rejectFirstSync = reject;
            });
            const retrySyncPromise = new Promise((resolve, reject) => {
                rejectRetrySync = reject;
            });
            const mockDb = {
                replicate: {
                    to: jest
                        .fn()
                        .mockImplementationOnce(() => firstSyncPromise)
                        .mockImplementationOnce(() => retrySyncPromise)
                        .mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            initSync(mockDb, 'http://remote:5984/db');
            await waitForSyncPreflight();
            const firstTrigger = triggerSync();
            triggerSync({ respectCooldown: false, retryAfterInFlightFailure: true });

            rejectFirstSync(new Error('original attempt failed'));
            await waitForCallCount(mockDb.replicate.to, 2);

            triggerSync({ respectCooldown: false, retryAfterInFlightFailure: true });
            rejectRetrySync(new Error('follow-up attempt failed'));
            await firstTrigger;

            expect(mockDb.replicate.to).toHaveBeenCalledTimes(2);
            expect(getSyncStatus()).toBe('error');
            consoleErrorSpy.mockRestore();
        });

        test('a stale session retry cannot clear the active session retry guard', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => {});
            let rejectAOriginal;
            let resolveARetry;
            const aOriginal = new Promise((resolve, reject) => {
                rejectAOriginal = reject;
            });
            const aRetry = new Promise((resolve) => {
                resolveARetry = resolve;
            });
            const dbA = {
                replicate: {
                    to: jest
                        .fn()
                        .mockImplementationOnce(() => aOriginal)
                        .mockImplementationOnce(() => aRetry),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            initSync(dbA, 'http://remote:5984/a');
            await waitForSyncPreflight();
            const sessionATrigger = triggerSync();
            triggerSync({ respectCooldown: false, retryAfterInFlightFailure: true });
            rejectAOriginal(new Error('session A original failed'));
            await waitForCallCount(dbA.replicate.to, 2);

            let rejectBOriginal;
            let rejectBRetry;
            const bOriginal = new Promise((resolve, reject) => {
                rejectBOriginal = reject;
            });
            const bRetry = new Promise((resolve, reject) => {
                rejectBRetry = reject;
            });
            const dbB = {
                replicate: {
                    to: jest
                        .fn()
                        .mockImplementationOnce(() => bOriginal)
                        .mockImplementationOnce(() => bRetry)
                        .mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            initSync(dbB, 'http://remote:5984/b');
            await waitForSyncPreflight();
            const sessionBTrigger = triggerSync();
            triggerSync({ respectCooldown: false, retryAfterInFlightFailure: true });
            rejectBOriginal(new Error('session B original failed'));
            await waitForCallCount(dbB.replicate.to, 2);

            resolveARetry({});
            await sessionATrigger;

            triggerSync({ respectCooldown: false, retryAfterInFlightFailure: true });
            rejectBRetry(new Error('session B retry failed'));
            await sessionBTrigger;

            expect(dbB.replicate.to).toHaveBeenCalledTimes(2);
            expect(getSyncStatus()).toBe('error');
        });

        test('respects cooldown for resume-triggered syncs', async () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            initSync(mockDb, 'http://remote:5984/db');

            await triggerSync({ respectCooldown: true });
            await triggerSync({ respectCooldown: true });

            expect(mockDb.replicate.to).toHaveBeenCalledTimes(1);

            jest.setSystemTime(new Date(Date.now() + 15001));
            await triggerSync({ respectCooldown: true });

            expect(mockDb.replicate.to).toHaveBeenCalledTimes(2);
        });

        test('continues an in-flight sync against the db and remote captured at start', async () => {
            let resolveFirstPush;
            const firstPushPromise = new Promise((resolve) => {
                resolveFirstPush = resolve;
            });

            const firstDb = {
                replicate: {
                    to: jest.fn().mockImplementation(() => firstPushPromise),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            const secondDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            initSync(firstDb, 'http://remote:5984/alpha');
            await waitForSyncPreflight();
            const firstTrigger = triggerSync();
            await waitForCallCount(firstDb.replicate.to, 1);

            initSync(secondDb, 'http://remote:5984/beta');
            resolveFirstPush({});
            await firstTrigger;

            expect(firstDb.replicate.from).toHaveBeenCalledWith('http://remote:5984/alpha');
            expect(secondDb.replicate.from).not.toHaveBeenCalled();
        });

        test('ignores stale sync failures after reinitialization', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            let rejectFirstPush;
            const firstPushPromise = new Promise((resolve, reject) => {
                rejectFirstPush = reject;
            });

            const firstDb = {
                replicate: {
                    to: jest.fn().mockImplementation(() => firstPushPromise),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            const secondDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };

            initSync(firstDb, 'http://remote:5984/alpha');
            await waitForSyncPreflight();
            const staleTrigger = triggerSync();
            staleTrigger.catch(() => {});
            await waitForCallCount(firstDb.replicate.to, 1);

            initSync(secondDb, 'http://remote:5984/beta');
            rejectFirstPush(new Error('database is closed'));
            await staleTrigger;
            await triggerSync();

            expect(getSyncStatus()).toBe('synced');
            expect(consoleErrorSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('Sync error:')
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe('debouncedSync', () => {
        test('sets status to unsynced immediately', () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            debouncedSync();
            expect(getSyncStatus()).toBe('unsynced');
        });

        test('triggers sync after debounce delay', async () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            await waitForSyncPreflight();
            debouncedSync();

            expect(mockDb.replicate.to).not.toHaveBeenCalled();

            jest.advanceTimersByTime(2000);
            await waitForCallCount(mockDb.replicate.to, 1);

            expect(mockDb.replicate.to).toHaveBeenCalledWith('http://remote:5984/db');
        });

        test('resets debounce timer on rapid calls', async () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            await waitForSyncPreflight();

            debouncedSync();
            jest.advanceTimersByTime(1500);
            debouncedSync(); // Reset the timer
            jest.advanceTimersByTime(1500);

            // Should not have synced yet (3000ms total, but timer was reset at 1500ms)
            expect(mockDb.replicate.to).not.toHaveBeenCalled();

            jest.advanceTimersByTime(500);
            await waitForCallCount(mockDb.replicate.to, 1);

            // Now 2000ms since last debouncedSync call
            expect(mockDb.replicate.to).toHaveBeenCalledTimes(1);
        });
    });

    describe('teardownSync', () => {
        test('resets status to idle', () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            debouncedSync();
            expect(getSyncStatus()).toBe('unsynced');

            teardownSync();
            expect(getSyncStatus()).toBe('idle');
        });

        test('clears pending debounce timer', () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            debouncedSync();
            teardownSync();

            jest.advanceTimersByTime(5000);

            // Sync should not have been triggered after teardown
            expect(mockDb.replicate.to).not.toHaveBeenCalled();
        });

        test('clears all status callbacks', async () => {
            const callback = jest.fn();
            onSyncStatusChange(callback);
            teardownSync();

            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            await triggerSync();

            expect(callback).not.toHaveBeenCalled();
        });
    });
});

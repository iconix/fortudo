/**
 * @jest-environment jsdom
 */

import {
    initSync,
    triggerSync,
    teardownSync,
    onSyncStatusChange,
    getSyncStatus,
    debouncedSync
} from '../public/js/sync-manager.js';

describe('Sync Manager', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        teardownSync();
        jest.useRealTimers();
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

        test('triggers sync after debounce delay', () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');
            debouncedSync();

            expect(mockDb.replicate.to).not.toHaveBeenCalled();

            jest.advanceTimersByTime(2000);

            expect(mockDb.replicate.to).toHaveBeenCalledWith('http://remote:5984/db');
        });

        test('resets debounce timer on rapid calls', () => {
            const mockDb = {
                replicate: {
                    to: jest.fn().mockResolvedValue({}),
                    from: jest.fn().mockResolvedValue({})
                }
            };
            initSync(mockDb, 'http://remote:5984/db');

            debouncedSync();
            jest.advanceTimersByTime(1500);
            debouncedSync(); // Reset the timer
            jest.advanceTimersByTime(1500);

            // Should not have synced yet (3000ms total, but timer was reset at 1500ms)
            expect(mockDb.replicate.to).not.toHaveBeenCalled();

            jest.advanceTimersByTime(500);

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

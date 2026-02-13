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
    afterEach(() => {
        teardownSync();
    });

    describe('getSyncStatus', () => {
        test('returns "idle" before initialization', () => {
            expect(getSyncStatus()).toBe('idle');
        });
    });

    describe('onSyncStatusChange', () => {
        test('registers a callback', () => {
            const callback = jest.fn();
            const unsubscribe = onSyncStatusChange(callback);
            expect(typeof unsubscribe).toBe('function');
            unsubscribe();
        });
    });

    describe('initSync', () => {
        test('stores remote URL for later sync', () => {
            const mockDb = {};
            initSync(mockDb, 'http://localhost:5984/fortudo-test');
            expect(getSyncStatus()).toBe('idle');
        });
    });

    describe('triggerSync', () => {
        test('does nothing when no remote URL configured', async () => {
            const mockDb = { replicate: { to: jest.fn(), from: jest.fn() } };
            initSync(mockDb, null);
            await triggerSync();
            expect(mockDb.replicate.to).not.toHaveBeenCalled();
        });
    });

    describe('debouncedSync', () => {
        test('is a function', () => {
            expect(typeof debouncedSync).toBe('function');
        });
    });
});

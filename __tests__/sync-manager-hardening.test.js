/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/sync-contract.js', () => ({
    inspectRemoteDocumentContract: jest.fn(),
    auditLocalDivergence: jest.fn()
}));

import { auditLocalDivergence, inspectRemoteDocumentContract } from '../public/js/sync-contract.js';
import {
    assertPersistenceAllowed,
    getSyncStatus,
    initSync,
    invalidateSyncAudit,
    teardownSync,
    triggerSync,
    waitForSyncPreflight
} from '../public/js/sync-manager.js';

function compatible(revision = '1-contract') {
    return { state: 'compatible', compatible: true, contractRevision: revision };
}

function safeAudit(overrides = {}) {
    return {
        state: 'compatible',
        remotePresent: [],
        eligible: [],
        recoveryRequired: [],
        designLeaves: [],
        updateSequence: 1,
        ...overrides
    };
}

function localDb(pushResult = {}, pullResult = {}) {
    return {
        replicate: {
            to: jest.fn().mockResolvedValue(pushResult),
            from: jest.fn().mockResolvedValue(pullResult)
        }
    };
}

describe('sync pre-push hardening', () => {
    beforeEach(() => {
        inspectRemoteDocumentContract.mockReset();
        auditLocalDivergence.mockReset();
    });

    afterEach(() => {
        teardownSync();
        jest.restoreAllMocks();
    });

    test('does not enable replication when startup audit requires recovery', async () => {
        const db = localDb();
        inspectRemoteDocumentContract.mockResolvedValue(compatible());
        auditLocalDivergence.mockResolvedValue(
            safeAudit({
                state: 'recovery-required',
                recoveryRequired: [{ id: 'task-old', revision: '2-a' }]
            })
        );

        initSync(db, 'https://redacted.invalid/db', { remoteDb: {} });
        await waitForSyncPreflight();
        await triggerSync();

        expect(getSyncStatus()).toBe('recovery-required');
        expect(db.replicate.to).not.toHaveBeenCalled();
        expect(() => assertPersistenceAllowed()).toThrow('recovery-required');
    });

    test('fails closed when a configured remote handle cannot be constructed', async () => {
        const db = localDb();

        initSync(db, 'https://redacted.invalid/db');
        await triggerSync();

        expect(getSyncStatus()).toBe('audit-error');
        expect(db.replicate.to).not.toHaveBeenCalled();
        expect(() => assertPersistenceAllowed()).toThrow('audit-error');
    });

    test('offline revsDiff allows local persistence but never pushes', async () => {
        const db = localDb();
        inspectRemoteDocumentContract.mockResolvedValue(compatible());
        auditLocalDivergence.mockResolvedValue(safeAudit({ state: 'offline' }));

        initSync(db, 'https://redacted.invalid/db', { remoteDb: {} });
        await waitForSyncPreflight();
        await triggerSync();

        expect(getSyncStatus()).toBe('offline');
        expect(db.replicate.to).not.toHaveBeenCalled();
        expect(() => assertPersistenceAllowed()).not.toThrow();
    });

    test('an unprovisioned remote stays local-only without blocking local persistence', async () => {
        const db = localDb();
        inspectRemoteDocumentContract.mockResolvedValue({
            state: 'unprovisioned',
            compatible: false,
            contractRevision: null
        });

        initSync(db, 'https://redacted.invalid/db', { remoteDb: {} });
        await waitForSyncPreflight();
        await triggerSync();

        expect(getSyncStatus()).toBe('unprovisioned');
        expect(db.replicate.to).not.toHaveBeenCalled();
        expect(() => assertPersistenceAllowed()).not.toThrow();
    });

    test('a remote contract revision change invalidates and reruns the full audit', async () => {
        const db = localDb();
        inspectRemoteDocumentContract
            .mockResolvedValueOnce(compatible('1-a'))
            .mockResolvedValueOnce(compatible('2-b'))
            .mockResolvedValue(compatible('2-b'));
        auditLocalDivergence.mockResolvedValue(safeAudit());

        initSync(db, 'https://redacted.invalid/db', { remoteDb: {} });
        await waitForSyncPreflight();
        await triggerSync();

        expect(auditLocalDivergence).toHaveBeenCalledTimes(2);
        expect(db.replicate.to).toHaveBeenCalledTimes(1);
    });

    test('unexpected local revisions invalidate the generation before every push', async () => {
        const db = localDb();
        inspectRemoteDocumentContract.mockResolvedValue(compatible());
        auditLocalDivergence.mockResolvedValue(safeAudit());

        initSync(db, 'https://redacted.invalid/db', { remoteDb: {} });
        await waitForSyncPreflight();
        invalidateSyncAudit();
        await triggerSync();

        expect(auditLocalDivergence).toHaveBeenCalledTimes(2);
        expect(db.replicate.to).toHaveBeenCalledTimes(1);
    });

    test('mixed push failures are not described as atomic and force recovery after pull', async () => {
        const db = localDb(
            {
                ok: false,
                doc_write_failures: 1,
                errors: [{ id: 'task-denied', rev: '2-denied', name: 'forbidden' }]
            },
            { docs_written: 1 }
        );
        inspectRemoteDocumentContract.mockResolvedValue(compatible());
        auditLocalDivergence
            .mockResolvedValueOnce(
                safeAudit({ eligible: [{ id: 'task-denied', revision: '2-denied' }] })
            )
            .mockResolvedValue(
                safeAudit({
                    state: 'recovery-required',
                    recoveryRequired: [
                        { id: 'task-denied', revision: '2-denied', code: 'remote-denied' }
                    ]
                })
            );

        initSync(db, 'https://redacted.invalid/db', { remoteDb: {} });
        await waitForSyncPreflight();
        await triggerSync();

        expect(db.replicate.to).toHaveBeenCalledTimes(1);
        expect(db.replicate.from).toHaveBeenCalledTimes(1);
        expect(getSyncStatus()).toBe('recovery-required');
        expect(() => assertPersistenceAllowed()).toThrow('recovery-required');
    });

    test('a newer contract requests a service-worker update and blocks writes', async () => {
        const update = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: { getRegistration: jest.fn().mockResolvedValue({ update, waiting: null }) }
        });
        inspectRemoteDocumentContract.mockResolvedValue({
            state: 'update-required',
            compatible: false,
            contractRevision: '2-new'
        });
        const db = localDb();

        initSync(db, 'https://redacted.invalid/db', { remoteDb: {} });
        await waitForSyncPreflight();

        expect(update).toHaveBeenCalledTimes(1);
        expect(getSyncStatus()).toBe('update-required');
        expect(() => assertPersistenceAllowed()).toThrow('update-required');
    });
});

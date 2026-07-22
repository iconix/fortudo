/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

import {
    applyWriterContract,
    buildDocumentContractDesignDoc
} from '../public/js/document-contract.js';
import { auditLocalDivergence, inspectRemoteDocumentContract } from '../public/js/sync-contract.js';

let counter = 0;

function database(label) {
    return new PouchDB(`${label}-${counter++}-${Date.now()}`, { adapter: 'memory' });
}

async function contractedRemote() {
    const db = database('remote');
    await db.put(buildDocumentContractDesignDoc());
    return db;
}

async function destroyAll(...databases) {
    await Promise.all(databases.filter(Boolean).map((db) => db.destroy()));
}

describe('remote document contract inspection', () => {
    test('distinguishes missing, compatible, newer, corrupt, and partitioned validators', async () => {
        const missing = database('missing');
        const compatible = await contractedRemote();
        const newer = database('newer');
        const corrupt = database('corrupt');
        const partitioned = {
            info: jest.fn().mockResolvedValue({
                db_name: 'partitioned',
                props: { partitioned: true }
            })
        };
        await newer.put({
            ...buildDocumentContractDesignDoc(),
            fortudoDocumentContract: { version: 2, checksum: 'a'.repeat(64) }
        });
        await corrupt.put({
            ...buildDocumentContractDesignDoc(),
            fortudoDocumentContract: { version: 1, checksum: 'b'.repeat(64) }
        });

        await expect(inspectRemoteDocumentContract(missing)).resolves.toMatchObject({
            state: 'missing-validator',
            compatible: true
        });
        await expect(inspectRemoteDocumentContract(compatible)).resolves.toMatchObject({
            state: 'compatible',
            compatible: true
        });
        await expect(inspectRemoteDocumentContract(newer)).resolves.toMatchObject({
            state: 'update-required',
            compatible: false
        });
        await expect(inspectRemoteDocumentContract(corrupt)).resolves.toMatchObject({
            state: 'validator-mismatch',
            compatible: false
        });
        await expect(inspectRemoteDocumentContract(partitioned)).resolves.toMatchObject({
            state: 'validator-mismatch',
            compatible: false
        });

        await destroyAll(missing, compatible, newer, corrupt);
    });

    test('classifies an absent remote database without exposing its URL', async () => {
        const remote = {
            info: jest
                .fn()
                .mockRejectedValue(Object.assign(new Error('secret-url'), { status: 404 }))
        };
        await expect(inspectRemoteDocumentContract(remote)).resolves.toEqual({
            state: 'unprovisioned',
            compatible: false,
            contractRevision: null
        });
    });
});

describe('local divergence audit', () => {
    test('grandfathers remote-present legacy leaves without false positives', async () => {
        const local = database('local');
        const remote = await contractedRemote();
        const legacy = { _id: 'task-legacy', docType: 'task', category: 'work/deep' };
        await local.put(legacy);
        await remote.put(legacy);

        const result = await auditLocalDivergence(local, remote);
        expect(result.state).toBe('compatible');
        expect(result.remotePresent).toHaveLength(1);
        expect(result.eligible).toHaveLength(0);
        expect(result.recoveryRequired).toHaveLength(0);
        await destroyAll(local, remote);
    });

    test('classifies remote-missing valid and invalid leaves before push', async () => {
        const local = database('local');
        const remote = await contractedRemote();
        await local.put(applyWriterContract({ _id: 'task-valid', docType: 'task' }));
        await local.put({ _id: 'task-legacy', docType: 'task' });

        const result = await auditLocalDivergence(local, remote);
        expect(result.state).toBe('recovery-required');
        expect(result.eligible.map((leaf) => leaf.id)).toEqual(['task-valid']);
        expect(result.recoveryRequired).toEqual([
            expect.objectContaining({ id: 'task-legacy', code: 'FDC_CONTRACT_VERSION' })
        ]);
        await destroyAll(local, remote);
    });

    test('audits mixed live, deleted, conflicting, and exempt design leaves', async () => {
        const local = database('local');
        const remote = await contractedRemote();
        const live = applyWriterContract({ _id: 'task-live', docType: 'task' });
        await local.put(live);
        const deletion = await local.put(
            applyWriterContract({ _id: 'task-deleted', docType: 'task' })
        );
        await local.put(
            applyWriterContract({
                _id: 'task-deleted',
                _rev: deletion.rev,
                _deleted: true
            })
        );
        await local.bulkDocs(
            [
                applyWriterContract({ _id: 'task-conflict', _rev: '1-a', docType: 'task' }),
                { _id: 'task-conflict', _rev: '1-b', docType: 'task' }
            ],
            { new_edits: false }
        );
        await local.put({ _id: '_design/local-only', views: {} });

        const result = await auditLocalDivergence(local, remote);
        expect(result.designLeaves).toHaveLength(1);
        expect(result.eligible.map((leaf) => leaf.id)).toEqual(
            expect.arrayContaining(['task-live', 'task-deleted', 'task-conflict'])
        );
        expect(result.recoveryRequired).toEqual([
            expect.objectContaining({ id: 'task-conflict', revision: '1-b' })
        ]);
        await destroyAll(local, remote);
    });

    test('treats revsDiff network failure as offline/unknown and performs no unsafe classification', async () => {
        const local = database('local');
        await local.put(applyWriterContract({ _id: 'task-valid', docType: 'task' }));
        const remote = {
            revsDiff: jest.fn().mockRejectedValue(new Error('private endpoint'))
        };

        await expect(auditLocalDivergence(local, remote)).resolves.toMatchObject({
            state: 'offline',
            remotePresent: [],
            eligible: [],
            recoveryRequired: []
        });
        await local.destroy();
    });

    test('discards unstable reads, bounds retries, and fails closed', async () => {
        const leaves = [
            {
                id: 'task-1',
                revision: '1-a',
                document: applyWriterContract({ _id: 'task-1', _rev: '1-a', docType: 'task' })
            }
        ];
        let sequence = 0;
        const local = {
            info: jest.fn().mockImplementation(() => Promise.resolve({ update_seq: sequence++ })),
            changes: jest.fn().mockResolvedValue({
                results: [{ id: 'task-1', changes: [{ rev: '1-a' }] }]
            }),
            get: jest.fn().mockResolvedValue(leaves[0].document)
        };
        const remote = {
            revsDiff: jest.fn().mockResolvedValue({ 'task-1': { missing: ['1-a'] } })
        };

        await expect(auditLocalDivergence(local, remote, { maxRetries: 2 })).resolves.toEqual(
            expect.objectContaining({ state: 'audit-error', code: 'local-state-unstable' })
        );
        expect(local.changes).toHaveBeenCalledTimes(2);
    });

    test('a previously denied but locally valid leaf requires recovery', async () => {
        const local = database('local');
        const remote = await contractedRemote();
        const result = await local.put(
            applyWriterContract({ _id: 'task-denied', docType: 'task' })
        );

        const audit = await auditLocalDivergence(local, remote, {
            rejectedLeaves: new Set([`task-denied@${result.rev}`])
        });
        expect(audit.state).toBe('recovery-required');
        expect(audit.recoveryRequired).toEqual([
            expect.objectContaining({ id: 'task-denied', code: 'remote-denied' })
        ]);
        await destroyAll(local, remote);
    });
});

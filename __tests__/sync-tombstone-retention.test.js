/** @jest-environment jsdom */

// Regression coverage for deletion-marker expiry through the production audit and sync path.
// All databases use a dedicated memdown adapter: no HTTP or filesystem database access.
const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;
const PouchDB = require('pouchdb');
const LevelPouch = require('pouchdb-adapter-leveldb-core');
const memdown = require('memdown');

import {
    applyWriterContract,
    buildDocumentContractDesignDoc
} from '../public/js/document-contract.js';
import { auditLocalDivergence, enumerateCurrentLocalLeaves } from '../public/js/sync-contract.js';
import { SYNC_REPLICATION_OPTIONS } from '../public/js/sync-transport.js';
import {
    initSync,
    triggerSync,
    teardownSync,
    waitForSyncPreflight,
    getSyncStatus,
    isPersistenceAllowed,
    registerExpectedLocalRevision,
    debouncedSync
} from '../public/js/sync-manager.js';

const engines = new Map();
function RetentionDown(name) {
    const engine = memdown(name);
    engines.set(name, engine);
    return engine;
}
function RetentionMemory(options, callback) {
    LevelPouch.call(this, { ...options, db: RetentionDown }, callback);
}
RetentionMemory.valid = () => true;
RetentionMemory.use_prefix = false;
PouchDB.adapter('retention-memory', RetentionMemory);

let counter = 0;
let databases = [];
function database() {
    const db = new PouchDB(`retention-fixture-${counter++}`, { adapter: 'retention-memory' });
    databases.push(db);
    return db;
}

async function rawEntries(engine) {
    const iterator = engine.iterator({ keyAsBuffer: false, valueAsBuffer: false });
    const entries = [];
    try {
        for (;;) {
            const item = await new Promise((resolve, reject) => {
                iterator.next((error, key, value) =>
                    error ? reject(error) : resolve({ key, value })
                );
            });
            if (item.key === undefined) return entries;
            entries.push(item);
        }
    } finally {
        await new Promise((resolve, reject) =>
            iterator.end((error) => (error ? reject(error) : resolve()))
        );
    }
}

// Model Cloudant's externally visible removal of a fully deleted ID. The memory
// adapter has no purge API. Remove only this fixture ID's metadata and sequence
// bodies, preserving database UUID, sequence counter, and real PouchDB checkpoints.
// This does not emulate Cloudant's scheduler, age calculation, or internal storage.
async function expireFixtureTombstone(db, id) {
    expect(db.adapter).toBe('retention-memory');
    expect(db.name).toMatch(/^retention-fixture-/);
    const { leaves } = await enumerateCurrentLocalLeaves(db);
    const matching = leaves.filter((leaf) => leaf.id === id);
    expect(matching.length).toBeGreaterThan(0);
    expect(matching.every((leaf) => leaf.document._deleted === true)).toBe(true);
    const engine = engines.get(db.name);
    const before = await rawEntries(engine);
    const removed = before.filter(
        ({ key, value }) =>
            key === `\xffdocument-store\xff${id}` ||
            (key.startsWith('\xffby-sequence\xff') && JSON.parse(value)._id === id)
    );
    expect(removed.length).toBeGreaterThan(1);
    await new Promise((resolve, reject) =>
        engine.batch(
            removed.map(({ key }) => ({ type: 'del', key })),
            {},
            (error) => (error ? reject(error) : resolve())
        )
    );
    expect(await rawEntries(engine)).toEqual(before.filter((entry) => !removed.includes(entry)));
}

async function regularlySyncedFixture({ contracted = false } = {}) {
    const local = database();
    const remote = database();
    await remote.put(buildDocumentContractDesignDoc());
    await remote.put(
        applyWriterContract({
            _id: 'keep',
            docType: 'task',
            type: 'unscheduled',
            description: 'Synthetic retained work',
            _attachments: { note: { content_type: 'text/plain', data: 'a2VlcA==' } }
        })
    );
    const live = await remote.put(
        applyWriterContract({
            _id: 'expired',
            docType: 'task',
            type: 'unscheduled',
            description: 'Synthetic old task'
        })
    );
    const deleted = await remote.put({
        _id: live.id,
        _rev: live.rev,
        _deleted: true,
        ...(contracted ? { writerContract: { version: 1 } } : {})
    });
    for (let round = 0; round < 3; round += 1) {
        await local.replicate.from(remote, { ...SYNC_REPLICATION_OPTIONS });
        const push = await local.replicate.to(remote, { ...SYNC_REPLICATION_OPTIONS });
        expect(push.docs_written).toBe(0);
        expect((await auditLocalDivergence(local, remote)).state).toBe('compatible');
    }
    const remoteIdentity = await remote.id();
    const remoteSequence = (await remote.info()).update_seq;
    await expireFixtureTombstone(remote, 'expired');
    expect(await remote.id()).toBe(remoteIdentity);
    expect((await remote.info()).update_seq).toBe(remoteSequence);
    expect((await remote.changes({ since: 0, doc_ids: ['expired'] })).results).toEqual([]);
    await expect(remote.get('expired', { rev: deleted.rev })).rejects.toMatchObject({
        status: 404
    });
    expect(await remote.revsDiff({ expired: [deleted.rev] })).toEqual({
        expired: { missing: [deleted.rev] }
    });
    expect((await local.get('expired', { rev: deleted.rev }))._deleted).toBe(true);
    return { local, remote, deleted };
}

afterEach(async () => {
    teardownSync();
    jest.restoreAllMocks();
    await Promise.all(databases.map((db) => db.destroy()));
    databases = [];
    engines.clear();
});

describe('cloud deletion-marker expiry with regular synchronization', () => {
    test('a legacy deletion stays preserved without blocking editing', async () => {
        const { local, remote } = await regularlySyncedFixture();
        expect(
            (await local.replicate.to(remote, { ...SYNC_REPLICATION_OPTIONS })).docs_written
        ).toBe(0);
        expect(
            (await local.replicate.from(remote, { ...SYNC_REPLICATION_OPTIONS })).docs_written
        ).toBe(0);
        const audit = await auditLocalDivergence(local, remote);
        expect(audit.state).toBe('compatible');
        expect(audit.obsoleteDeletions).toEqual([expect.objectContaining({ id: 'expired' })]);
        initSync(local, 'memory-fixture', { remoteDb: remote });
        await waitForSyncPreflight();
        await triggerSync();
        expect(getSyncStatus()).toBe('synced');
        expect(isPersistenceAllowed()).toBe(true);
        expect((await remote.allDocs({ keys: ['expired'] })).rows[0].error).toBe('not_found');
    });

    test('a contracted expired deletion is not uploaded again', async () => {
        const { local, remote, deleted } = await regularlySyncedFixture({ contracted: true });
        expect(
            (await local.replicate.to(remote, { ...SYNC_REPLICATION_OPTIONS })).docs_written
        ).toBe(0);
        expect((await auditLocalDivergence(local, remote)).eligible).toEqual([]);
        initSync(local, 'memory-fixture', { remoteDb: remote });
        await waitForSyncPreflight();
        await triggerSync();
        expect(getSyncStatus()).toBe('synced');
        expect(await remote.revsDiff({ expired: [deleted.rev] })).toEqual({
            expired: { missing: [deleted.rev] }
        });
    });
});

async function productionAudit(local, remote, options = {}) {
    const audit = await auditLocalDivergence(local, remote, options);
    return {
        audit,
        settledIds: [...new Set((audit.obsoleteDeletions || []).map((leaf) => leaf.id))]
    };
}

async function productionPush(local, remote) {
    teardownSync();
    const results = [];
    const to = local.replicate.to.bind(local.replicate);
    const spy = jest.spyOn(local.replicate, 'to').mockImplementation((...args) => {
        const operation = to(...args);
        operation.on('complete', (result) => results.push(result));
        return operation;
    });
    try {
        initSync(local, 'memory-fixture', { remoteDb: remote });
        await waitForSyncPreflight();
        await triggerSync();
        return {
            docs_written: results.reduce((sum, result) => sum + result.docs_written, 0),
            status: getSyncStatus()
        };
    } finally {
        spy.mockRestore();
    }
}

describe('deletion-absence safeguards with real replication', () => {
    test.each([false, true])(
        'retries an in-flight recreation after its debounce coalesces (retry fails=%s)',
        async (retryFails) => {
            const { local, remote, deleted } = await regularlySyncedFixture();
            initSync(local, 'memory-fixture', { remoteDb: remote });
            await waitForSyncPreflight();
            let started;
            let release;
            const hasStarted = new Promise((resolve) => {
                started = resolve;
            });
            const to = local.replicate.to.bind(local.replicate);
            const pushes = jest.spyOn(local.replicate, 'to').mockImplementationOnce((...args) => {
                started();
                return new Promise((resolve) => {
                    release = () => resolve(to(...args));
                });
            });
            if (retryFails) pushes.mockRejectedValueOnce(new Error('Follow-up interrupted'));
            const syncing = triggerSync();
            await hasStarted;
            const recreated = await local.put(
                applyWriterContract({
                    _id: 'expired',
                    _rev: deleted.rev,
                    docType: 'task',
                    type: 'unscheduled',
                    description: 'Recreated during a slow push'
                })
            );
            registerExpectedLocalRevision(recreated.id, recreated.rev);
            debouncedSync();
            // Let the real two-second debounce fire while the first push is held.
            await new Promise((resolve) => setTimeout(resolve, 2200));
            expect(pushes).toHaveBeenCalledTimes(1);
            release();
            await syncing;
            expect(pushes).toHaveBeenCalledTimes(2);
            expect(pushes.mock.calls[0][1].query_params).toEqual({
                excludedDeletionIds: ['expired']
            });
            expect(pushes.mock.calls[1][1].query_params).toBeUndefined();
            if (retryFails) {
                expect(getSyncStatus()).toBe('error');
                expect((await remote.allDocs({ keys: ['expired'] })).rows[0].error).toBe(
                    'not_found'
                );
            } else {
                expect(getSyncStatus()).toBe('synced');
                expect((await remote.get('expired'))._rev).toBe(recreated.rev);
            }
            expect((await local.get('expired'))._rev).toBe(recreated.rev);
            expect((await local.get('expired', { rev: deleted.rev }))._deleted).toBe(true);
        }
    );

    test('a known local recreation invalidates its cached deletion exclusion before pushing', async () => {
        const { local, remote, deleted } = await regularlySyncedFixture();
        initSync(local, 'memory-fixture', { remoteDb: remote });
        await waitForSyncPreflight();
        const recreated = await local.put(
            applyWriterContract({
                _id: 'expired',
                _rev: deleted.rev,
                docType: 'task',
                description: 'New local work'
            })
        );
        registerExpectedLocalRevision(recreated.id, recreated.rev);
        await new Promise(setImmediate);
        await triggerSync();
        expect(getSyncStatus()).toBe('synced');
        expect((await remote.get('expired'))._rev).toBe(recreated.rev);
    });
    test('the real fresh-checkpoint retry excludes obsolete IDs while uploading pending work', async () => {
        const { local, remote, deleted } = await regularlySyncedFixture();
        await local.put(applyWriterContract({ _id: 'pending', docType: 'task' }));
        // Reproduce a checkpoint-skipped pending write without changing any real
        // checkpoint: the first attempt reports no writes; the retry is real PouchDB.
        const push = jest.spyOn(local.replicate, 'to').mockResolvedValueOnce({
            ok: true,
            docs_written: 0
        });
        initSync(local, 'memory-fixture', { remoteDb: remote });
        await waitForSyncPreflight();
        await triggerSync();
        expect(getSyncStatus()).toBe('synced');
        expect(push).toHaveBeenCalledTimes(2);
        for (const [, options] of push.mock.calls) {
            expect(options.query_params).toEqual({ excludedDeletionIds: ['expired'] });
            expect(options.filter({ _id: 'expired' }, { query: options.query_params })).toBe(false);
            expect(options.filter({ _id: 'pending' }, { query: options.query_params })).toBe(true);
        }
        expect(push.mock.calls[1][1]).toMatchObject({ checkpoint: false, doc_ids: ['pending'] });
        expect((await remote.get('pending')).docType).toBe('task');
        expect((await remote.allDocs({ keys: ['expired'] })).rows[0].error).toBe('not_found');
        expect((await local.get('expired', { rev: deleted.rev }))._deleted).toBe(true);
    });

    test('an interrupted push can retry without uploading the obsolete deletion', async () => {
        const { local, remote } = await regularlySyncedFixture();
        await local.put(applyWriterContract({ _id: 'pending', docType: 'task' }));
        jest.spyOn(local.replicate, 'to').mockRejectedValueOnce(new Error('Interrupted'));
        initSync(local, 'memory-fixture', { remoteDb: remote });
        await waitForSyncPreflight();
        await triggerSync();
        expect(getSyncStatus()).toBe('error');
        await triggerSync();
        expect(getSyncStatus()).toBe('synced');
        expect((await remote.get('pending')).docType).toBe('task');
        expect((await remote.allDocs({ keys: ['expired'] })).rows[0].error).toBe('not_found');
    });

    test('whole-ID absence lookups are bounded to the configured audit batch size', async () => {
        const local = database();
        const remote = database();
        await local.bulkDocs(
            Array.from({ length: 205 }, (_, index) => ({
                _id: `deleted-${index}`,
                _rev: '1-deleted',
                _deleted: true
            })),
            { new_edits: false }
        );
        const reads = jest.spyOn(remote, 'allDocs');
        const audit = await auditLocalDivergence(local, remote, { batchSize: 50 });
        expect(audit.state).toBe('compatible');
        expect(audit.obsoleteDeletions).toHaveLength(205);
        expect(reads.mock.calls.map(([options]) => options.keys.length)).toEqual([
            50, 50, 50, 50, 5
        ]);
    });
    test.each([false, true])(
        'preserves expired history and pending live work (contracted=%s)',
        async (contracted) => {
            const { local, remote, deleted } = await regularlySyncedFixture({ contracted });
            const pending = await local.put(
                applyWriterContract({
                    _id: 'new-work',
                    docType: 'task',
                    type: 'unscheduled',
                    description: 'Unsynced work'
                })
            );
            const before = await local.get('expired', { rev: deleted.rev, revs: true });
            const decision = await productionAudit(local, remote);
            expect(decision.settledIds).toEqual(['expired']);
            expect(decision.audit.state).toBe('compatible');
            expect(decision.audit.eligible.map((leaf) => leaf.id)).toEqual(['new-work']);
            expect((await productionPush(local, remote)).docs_written).toBe(1);
            expect((await productionPush(local, remote)).docs_written).toBe(0);
            expect((await remote.allDocs({ keys: ['expired'] })).rows[0].error).toBe('not_found');
            expect((await remote.get('new-work'))._rev).toBe(pending.rev);
            expect(await local.get('expired', { rev: deleted.rev, revs: true })).toEqual(before);
            expect((await remote.get('keep', { attachments: true }))._attachments.note.data).toBe(
                'a2VlcA=='
            );
        }
    );

    test('an absent ID needs no deletion replay even without historical cloud-confirmation evidence', async () => {
        const local = database();
        const remote = database();
        const first = await local.put({ _id: 'never-synced', description: 'Synthetic' });
        await local.remove(first.id, first.rev);
        const result = await productionAudit(local, remote);
        expect(result.settledIds).toEqual(['never-synced']);
        expect(result.audit.state).toBe('compatible');
        expect((await productionPush(local, remote)).docs_written).toBe(0);
    });

    test('a deletion against a live cloud record still requires the existing contract checks', async () => {
        const { local, remote } = await regularlySyncedFixture();
        await remote.put(
            applyWriterContract({
                _id: 'expired',
                docType: 'task',
                type: 'unscheduled',
                description: 'Live again'
            })
        );
        const result = await productionAudit(local, remote);
        expect(result.settledIds).toEqual([]);
        expect(result.audit.state).toBe('recovery-required');
        expect((await remote.get('expired')).description).toBe('Live again');
    });

    test('a live local conflict prevents exclusion of its entire ID', async () => {
        const { local, remote } = await regularlySyncedFixture();
        await local.bulkDocs(
            [
                applyWriterContract({
                    _id: 'expired',
                    _rev: '1-livebranch',
                    docType: 'task',
                    type: 'unscheduled',
                    description: 'Preserve conflict'
                })
            ],
            { new_edits: false }
        );
        const result = await productionAudit(local, remote);
        expect(result.settledIds).toEqual([]);
        expect(result.audit.state).toBe('recovery-required');
        expect(result.audit.eligible.some((leaf) => leaf.revision === '1-livebranch')).toBe(true);
    });

    test('a network failure cannot establish cloud absence', async () => {
        const { local, remote } = await regularlySyncedFixture();
        jest.spyOn(remote, 'allDocs').mockRejectedValue(new Error('Network unavailable'));
        expect((await productionAudit(local, remote)).audit.state).toBe('offline');
    });

    test('a persisted server denial cannot become a satisfied deletion', async () => {
        const { local, remote, deleted } = await regularlySyncedFixture({ contracted: true });
        const result = await productionAudit(local, remote, {
            rejectedLeaves: new Set([`expired@${deleted.rev}`])
        });
        expect(result.settledIds).toEqual([]);
        expect(result.audit.recoveryRequired[0].code).toBe('remote-denied');
    });

    test('another cloud tombstone is distinguished from an entirely absent cloud ID', async () => {
        const { local, remote } = await regularlySyncedFixture();
        const live = await remote.put({ _id: 'expired' });
        await remote.remove(live.id, live.rev);
        const result = await productionAudit(local, remote);
        expect(result.settledIds).toEqual([]);
        expect(result.audit.state).toBe('recovery-required');
    });

    test('all deleted conflict branches remain preserved when the absent ID is excluded', async () => {
        const { local, remote } = await regularlySyncedFixture();
        await local.bulkDocs([{ _id: 'expired', _rev: '1-deletedbranch', _deleted: true }], {
            new_edits: false
        });
        const before = await enumerateCurrentLocalLeaves(local);
        expect(before.leaves.filter((leaf) => leaf.id === 'expired')).toHaveLength(2);
        const result = await productionAudit(local, remote);
        expect(result.settledIds).toEqual(['expired']);
        await productionPush(local, remote);
        expect((await enumerateCurrentLocalLeaves(local)).leaves).toEqual(before.leaves);
        expect((await remote.allDocs({ keys: ['expired'] })).rows[0].error).toBe('not_found');
    });

    test('a cloud recreation after comparison is not deleted by the proposed push', async () => {
        const { local, remote } = await regularlySyncedFixture();
        const result = await productionAudit(local, remote);
        expect(result.settledIds).toEqual(['expired']);
        initSync(local, 'memory-fixture', { remoteDb: remote });
        await waitForSyncPreflight();
        const recreated = await remote.put(
            applyWriterContract({
                _id: 'expired',
                docType: 'task',
                type: 'unscheduled',
                description: 'Concurrent cloud work'
            })
        );
        await triggerSync();
        expect((await remote.get('expired'))._rev).toBe(recreated.rev);
        await local.replicate.from(remote, { ...SYNC_REPLICATION_OPTIONS });
        expect((await local.get('expired')).description).toBe('Concurrent cloud work');
        // The old local deletion is still preserved, now conservatively reviewed
        // against a live cloud branch instead of automatically replayed.
        expect((await productionAudit(local, remote)).audit.state).toBe('recovery-required');
    });

    test('a malformed absence response cannot settle the deletion', async () => {
        const { local, remote } = await regularlySyncedFixture();
        jest.spyOn(remote, 'allDocs').mockResolvedValue({ rows: [] });
        expect((await productionAudit(local, remote)).audit.state).toBe('offline');
    });

    test.each([
        { key: 'wrong-id', error: 'not_found' },
        { key: 'expired', error: 'forbidden' },
        { key: 'expired' },
        { key: 'expired', error: 'not_found', value: { rev: '1-conflictingresponse' } }
    ])('an ambiguous per-ID response is not proof of absence: %j', async (row) => {
        const { local, remote } = await regularlySyncedFixture({ contracted: true });
        jest.spyOn(remote, 'allDocs').mockResolvedValue({ rows: [row] });
        expect((await productionAudit(local, remote)).audit.state).toBe('offline');
    });

    test('a failed revision comparison stays offline instead of settling any deletion', async () => {
        const { local, remote } = await regularlySyncedFixture();
        jest.spyOn(remote, 'revsDiff').mockRejectedValue(new Error('Network unavailable'));
        const result = await productionAudit(local, remote);
        expect(result.audit.state).toBe('offline');
        expect(result.settledIds).toEqual([]);
    });

    test('a local change during cloud comparison invalidates the proposed decision', async () => {
        const { local, remote } = await regularlySyncedFixture();
        const allDocs = remote.allDocs.bind(remote);
        let change = 0;
        jest.spyOn(remote, 'allDocs').mockImplementation(async (options) => {
            await local.put(
                applyWriterContract({
                    _id: `late-work-${change++}`,
                    docType: 'task',
                    type: 'unscheduled'
                })
            );
            return allDocs(options);
        });
        expect((await productionAudit(local, remote, { maxRetries: 2 })).audit).toMatchObject({
            state: 'audit-error',
            code: 'local-state-unstable'
        });
    });

    test('changing exclusion scope gives a recreated local task a usable checkpoint', async () => {
        const { local, remote, deleted } = await regularlySyncedFixture();
        await productionPush(local, remote);
        const restored = await local.put(
            applyWriterContract({
                _id: 'expired',
                _rev: deleted.rev,
                docType: 'task',
                type: 'unscheduled',
                description: 'Explicitly recreated work'
            })
        );
        const result = await productionAudit(local, remote);
        expect(result.settledIds).toEqual([]);
        expect(result.audit.eligible).toEqual([
            expect.objectContaining({ revision: restored.rev })
        ]);
        expect((await productionPush(local, remote)).docs_written).toBe(1);
        expect((await remote.get('expired')).description).toBe('Explicitly recreated work');
    });
});

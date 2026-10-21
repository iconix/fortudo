const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

import {
    buildLocalRecoveryBundle,
    canonicalJson,
    verifyLocalRecoveryBundle
} from '../public/js/local-recovery.js';
import {
    buildDocumentContractDesignDoc,
    applyWriterContract
} from '../public/js/document-contract.js';
import { createGuidedRecovery, getRecoveryRoute } from '../public/js/guided-recovery.js';

const digest = async (value) => require('crypto').createHash('sha256').update(value).digest('hex');
let serial = 0;

describe('guided recovery with real local databases', () => {
    let source,
        remote,
        archive,
        databases,
        service,
        activate,
        routeStorage,
        logicalName,
        makeDatabase;
    beforeEach(async () => {
        databases = [];
        makeDatabase = (name) => {
            const database = new PouchDB(name, { adapter: 'memory' });
            databases.push(database);
            return database;
        };
        logicalName = `repair-test-${serial++}-${Date.now()}`;
        source = makeDatabase(logicalName);
        remote = makeDatabase(`${logicalName}-cloud`);
        archive = makeDatabase(`${logicalName}-archive`);
        await remote.put(buildDocumentContractDesignDoc());
        routeStorage = localStorage;
        routeStorage.clear();
        activate = jest.fn();
        service = createGuidedRecovery({
            source,
            remote,
            archive,
            logicalName,
            makeDatabase,
            routeStorage,
            digest,
            assertCurrent: jest.fn(),
            onActivate: activate
        });
        await source.put({
            _id: 'task-local',
            docType: 'task',
            type: 'unscheduled',
            description: 'Unsynced work',
            status: 'incomplete'
        });
        await remote.put(
            applyWriterContract({
                _id: 'task-cloud',
                docType: 'task',
                type: 'unscheduled',
                description: 'Cloud work'
            })
        );
    });
    afterEach(async () => {
        await Promise.all(
            [...new Set(databases.map((database) => database.name))].map((name) =>
                new PouchDB(name, { adapter: 'memory' }).destroy()
            )
        );
    });

    test.each([
        { priority: 42 },
        { priority: 'urgent' },
        { estDuration: -1 },
        { estDuration: '15' },
        { status: 'unknown' }
    ])('rejects malformed task fields without losing the saved original: %j', async (fields) => {
        const original = await source.get('task-local');
        await source.put({ ...original, ...fields });
        const saved = await service.preserve();
        await service.rebuild(saved._id);
        const database = makeDatabase(getRecoveryRoute(logicalName).databaseName);
        const [entry] = await service.review(saved._id, database);
        await expect(service.restore(saved._id, entry, database, entry.proposed)).rejects.toThrow(
            /before restoring/i
        );
        await expect(database.get('task-local')).rejects.toMatchObject({ status: 404 });
        expect((await service.load(saved._id)).bundle.documents).toContainEqual(
            expect.objectContaining(fields)
        );
        await service.restore(saved._id, entry, database, {
            ...entry.proposed,
            priority: 'medium',
            estDuration: 15,
            status: 'incomplete'
        });
        expect(await database.get('task-local')).toMatchObject({
            priority: 'medium',
            estDuration: 15
        });
    });

    test('rejects an old archive from a different replica even when update sequences match', async () => {
        await source.put({ _id: 'old-one', type: 'unscheduled', description: 'Old one' });
        await source.put({ _id: 'old-two', type: 'unscheduled', description: 'Old two' });
        const old = await service.preserve();
        const fresh = await service.preserve();
        await service.rebuild(fresh._id);
        const route = getRecoveryRoute(logicalName);
        const active = makeDatabase(route.databaseName);
        await active.put(
            applyWriterContract({
                _id: 'new-offline',
                docType: 'task',
                type: 'unscheduled',
                description: 'New offline work',
                status: 'incomplete',
                priority: 'medium',
                estDuration: 0
            })
        );
        expect((await active.info()).update_seq).toBe(old.bundle.manifest.localUpdateSequence);
        const next = createGuidedRecovery({
            source: active,
            remote,
            archive,
            logicalName,
            makeDatabase,
            routeStorage,
            digest
        });
        await expect(next.rebuild(old._id)).rejects.toThrow(/earlier local copy/i);
        expect(getRecoveryRoute(logicalName)).toEqual(route);
        expect((await active.get('new-offline')).description).toBe('New offline work');
        const currentArchive = await next.preserve();
        await next.rebuild(currentArchive._id);
        const rebuilt = makeDatabase(getRecoveryRoute(logicalName).databaseName);
        expect((await next.review(currentArchive._id, rebuilt)).map((entry) => entry.id)).toContain(
            'new-offline'
        );
    });

    test('checks every body, identity and manifest before trusting an archive', async () => {
        const bundle = await buildLocalRecoveryBundle(source, {}, { digest });
        await expect(verifyLocalRecoveryBundle(bundle, { digest })).resolves.toBe(true);
        bundle.documents[0].description = 'corrupt';
        await expect(verifyLocalRecoveryBundle(bundle, { digest })).rejects.toThrow(
            /recovery copy/i
        );
    });

    test('archives and verifies locally before switching to a checked cloud replica, preserving the source', async () => {
        const saved = await service.preserve();
        const readback = await service.load(saved._id);
        expect(readback.bundle.documents[0].description).toBe('Unsynced work');
        await service.rebuild(saved._id);
        const route = getRecoveryRoute(logicalName, routeStorage);
        expect(route.archiveId).toBe(saved._id);
        expect(activate).toHaveBeenCalledTimes(1);
        expect((await source.get('task-local')).description).toBe('Unsynced work');
        const rebuilt = new PouchDB(route.databaseName, { adapter: 'memory' });
        expect((await rebuilt.get('task-cloud')).description).toBe('Cloud work');
        await expect(rebuilt.get('task-local')).rejects.toMatchObject({ status: 404 });
    });

    test('failed cloud pull or corrupt archive never activates or destroys the original', async () => {
        const saved = await service.preserve();
        jest.spyOn(remote, 'info').mockRejectedValue(new Error('offline'));
        await expect(service.rebuild(saved._id)).rejects.toThrow();
        expect(activate).not.toHaveBeenCalled();
        expect(getRecoveryRoute(logicalName, routeStorage)).toBeNull();
        expect((await source.info()).doc_count).toBe(1);
        const corrupt = await archive.get(saved._id);
        corrupt.bundle.documents[0].description = 'changed';
        await archive.put(corrupt);
        await expect(service.load(saved._id)).rejects.toThrow(/recovery copy/i);
    });

    test('refuses activation if local data changed since the copy was saved', async () => {
        const saved = await service.preserve();
        await source.put({ _id: 'late-write' });
        await expect(service.rebuild(saved._id)).rejects.toThrow(/changes/i);
        expect(activate).not.toHaveBeenCalled();
    });

    test('reviews differences and restores legacy work as a current-contract edit only once', async () => {
        const saved = await service.preserve();
        await service.rebuild(saved._id);
        const rebuilt = new PouchDB(getRecoveryRoute(logicalName, routeStorage).databaseName, {
            adapter: 'memory'
        });
        const entries = await service.review(saved._id, rebuilt);
        expect(entries).toHaveLength(1);
        expect(entries[0].local.description).toBe('Unsynced work');
        await service.restore(saved._id, entries[0], rebuilt, entries[0].proposed);
        expect((await rebuilt.get('task-local')).writerContract.version).toBe(1);
        expect(await service.review(saved._id, rebuilt)).toEqual([]);
    });

    test('requires fresh review before overwriting a changed current record', async () => {
        const saved = await service.preserve();
        const entry = (await service.review(saved._id, remote))[0];
        await remote.put(
            applyWriterContract({
                _id: entry.id,
                docType: 'task',
                type: 'unscheduled',
                description: 'New elsewhere'
            })
        );
        await expect(service.restore(saved._id, entry, remote, entry.proposed)).rejects.toThrow(
            /changed/i
        );
        expect((await remote.get(entry.id)).description).toBe('New elsewhere');
    });

    test('keeps explicit decisions across reload and never alters the current record', async () => {
        const saved = await service.preserve();
        const entry = (await service.review(saved._id, remote))[0];
        await service.keep(saved._id, entry);
        expect(await service.review(saved._id, remote)).toEqual([]);
        await expect(remote.get(entry.id)).rejects.toMatchObject({ status: 404 });
    });

    test.each(['format', 'count', 'identity', 'duplicate', 'manifest'])(
        'rejects a recovery bundle with invalid %s',
        async (fault) => {
            const bundle = await buildLocalRecoveryBundle(source, {}, { digest });
            if (fault === 'format') bundle.format = 'unknown';
            if (fault === 'count') bundle.manifest.leafCount = 100;
            if (fault === 'identity') bundle.manifest.leaves[0].id = 'wrong';
            if (fault === 'duplicate') {
                bundle.documents.push(bundle.documents[0]);
                bundle.manifest.leaves.push(bundle.manifest.leaves[0]);
                bundle.manifest.leafCount = 2;
            }
            if (fault === 'manifest') bundle.manifest.createdAt = 'corrupt';
            if (['count', 'identity', 'duplicate'].includes(fault))
                bundle.manifestChecksum = await digest(canonicalJson(bundle.manifest));
            await expect(verifyLocalRecoveryBundle(bundle, { digest })).rejects.toThrow(
                /recovery copy/i
            );
        }
    );

    test('fails closed for damaged or cross-room routing metadata', () => {
        localStorage.setItem(
            `fortudo-recovery-route:${logicalName}`,
            JSON.stringify({ archiveId: 'recovery-x', databaseName: 'another-room' })
        );
        expect(() => getRecoveryRoute(logicalName)).toThrow(/invalid/i);
    });

    test('never rebuilds when independent archive storage fails', async () => {
        jest.spyOn(archive, 'put').mockRejectedValue(new Error('quota'));
        await expect(service.preserve()).rejects.toThrow('quota');
        expect(activate).not.toHaveBeenCalled();
    });

    test('refuses archives belonging to another room', async () => {
        const saved = await service.preserve();
        await archive.put({ ...saved, logicalName: 'another-room' });
        await expect(service.load(saved._id)).rejects.toThrow(/another room/i);
    });

    test('blocks unsafe cloud contents and retains originals', async () => {
        await remote.put({ _id: 'bad-cloud', docType: 'task' });
        const saved = await service.preserve();
        await expect(service.rebuild(saved._id)).rejects.toThrow(/cannot safely use/i);
        expect(activate).not.toHaveBeenCalled();
    });

    test('blocks incompatible or missing cloud service', async () => {
        const saved = await service.preserve();
        const contract = await remote.get('_design/fortudo-document-contract');
        await remote.put({ ...contract, fortudoDocumentContract: { version: 999 } });
        await expect(service.rebuild(saved._id)).rejects.toThrow(/safety checks/i);
        const offline = createGuidedRecovery({
            source,
            remote: null,
            archive,
            logicalName,
            makeDatabase,
            digest
        });
        await expect(offline.rebuild(saved._id)).rejects.toThrow(/connect/i);
    });

    test('a failed route save leaves both source and archive available', async () => {
        const failing = createGuidedRecovery({
            source,
            remote,
            archive,
            logicalName,
            makeDatabase,
            digest,
            routeStorage: {
                getItem: () => null,
                setItem: () => {
                    throw new Error('quota');
                }
            }
        });
        const saved = await failing.preserve();
        await expect(failing.rebuild(saved._id)).rejects.toThrow('quota');
        expect((await failing.load(saved._id)).bundle.documents).toHaveLength(1);
        expect((await source.info()).doc_count).toBe(1);
    });

    test('restores a reviewed deletion with a new valid tombstone, and can retain conflict leaves', async () => {
        const original = await source.get('task-local');
        await source.remove(original);
        await remote.put(applyWriterContract({ ...original, _rev: undefined }));
        const saved = await service.preserve();
        const entries = await service.review(saved._id, remote);
        expect(entries[0].local._deleted).toBe(true);
        await service.restore(saved._id, entries[0], remote, entries[0].proposed);
        await expect(remote.get('task-local')).rejects.toMatchObject({ status: 404 });
        expect(await service.review(saved._id, remote)).toEqual([]);
    });

    test('maps legacy categories to cloud identity and merges taxonomy without discarding cloud rows', async () => {
        const cloudTaxonomy = applyWriterContract({
            _id: 'config-categories',
            docType: 'config',
            schemaVersion: '3.5',
            identityVersion: 1,
            groups: [
                {
                    id: 'group-1',
                    key: 'work',
                    legacyKeys: ['work'],
                    status: 'active',
                    archivedAt: null
                }
            ],
            categories: [
                {
                    id: 'cat-1',
                    key: 'renamed',
                    legacyKeys: ['renamed', 'old'],
                    groupKey: 'work',
                    groupId: 'group-1',
                    status: 'active',
                    archivedAt: null
                }
            ]
        });
        await remote.put(cloudTaxonomy);
        const task = await source.get('task-local');
        await source.put({ ...task, category: 'old' });
        await source.put({
            _id: 'config-categories',
            docType: 'config',
            schemaVersion: '3.5',
            groups: [{ key: 'work', label: 'My work' }],
            categories: [{ key: 'old', groupKey: 'work', label: 'Saved label' }]
        });
        const saved = await service.preserve();
        const entries = await service.review(saved._id, remote);
        const taskEntry = entries.find((entry) => entry.id === 'task-local');
        expect(taskEntry.proposed).toMatchObject({
            category: 'renamed',
            categoryId: 'cat-1',
            categoryIdentityVersion: 1
        });
        const taxonomyEntry = entries.find((entry) => entry.id === 'config-categories');
        expect(taxonomyEntry.proposed.categories[0]).toMatchObject({
            id: 'cat-1',
            key: 'renamed',
            label: 'Saved label'
        });
        await service.restore(saved._id, taxonomyEntry, remote, taxonomyEntry.proposed);
        await service.restore(saved._id, taskEntry, remote, taskEntry.proposed);
    });

    test('explains unavailable categories and rejects edited references or invalid task data', async () => {
        const task = await source.get('task-local');
        await source.put({ ...task, category: 'gone' });
        const saved = await service.preserve();
        const entry = (await service.review(saved._id, remote))[0];
        expect(entry.warnings[0]).toMatch(/unavailable/i);
        expect(entry.proposed.category).toBeNull();
        await expect(
            service.restore(saved._id, entry, remote, { ...entry.proposed, _id: 'changed-id' })
        ).rejects.toThrow(/ID/i);
        await expect(
            service.restore(saved._id, entry, remote, { ...entry.proposed, description: '' })
        ).rejects.toThrow(/description/i);
        await expect(
            service.restore(saved._id, entry, remote, {
                ...entry.proposed,
                category: 'fake',
                categoryId: 'fake',
                categoryIdentityVersion: 1
            })
        ).rejects.toThrow(/category/i);
        await expect(
            service.restore(saved._id, entry, remote, {
                ...entry.proposed,
                type: 'scheduled',
                duration: -1
            })
        ).rejects.toThrow(/duration/i);
    });

    test('does not bypass active write blocks when restoring', async () => {
        const blocked = createGuidedRecovery({
            source,
            remote,
            archive,
            logicalName,
            makeDatabase,
            digest,
            assertWritable: () => {
                throw new Error('Update required');
            }
        });
        const saved = await blocked.preserve();
        const entry = (await blocked.review(saved._id, remote))[0];
        await expect(blocked.restore(saved._id, entry, remote, entry.proposed)).rejects.toThrow(
            'Update required'
        );
    });

    test('also archives late writes from an old tab before review', async () => {
        const saved = await service.preserve();
        await service.rebuild(saved._id);
        await source.put({
            _id: 'unsched-late',
            type: 'unscheduled',
            description: 'A write already in flight'
        });
        const rebuilt = new PouchDB(getRecoveryRoute(logicalName).databaseName, {
            adapter: 'memory'
        });
        const entries = await service.review(saved._id, rebuilt);
        expect(entries.map((entry) => entry.id)).toContain('unsched-late');
        const readback = await service.load(saved._id);
        expect(readback.supplements).toHaveLength(1);
        await expect(verifyLocalRecoveryBundle(readback.supplements[0], { digest })).resolves.toBe(
            true
        );
    });

    test('a kept change can be reviewed again without replaying restored records', async () => {
        const saved = await service.preserve();
        const entry = (await service.review(saved._id, remote))[0];
        await service.keep(saved._id, entry);
        await service.reconsider(saved._id);
        expect(await service.review(saved._id, remote)).toHaveLength(1);
        await service.restore(saved._id, entry, remote, entry.proposed);
        await service.reconsider(saved._id);
        expect(await service.review(saved._id, remote)).toEqual([]);
    });

    test.each(['source-write', 'contract-change', 'denied', 'audit-offline'])(
        'retains the original when %s happens during the cloud rebuild',
        async (fault) => {
            const guarded = createGuidedRecovery({
                source,
                remote,
                archive,
                logicalName,
                digest,
                onActivate: activate,
                makeDatabase: (name) => {
                    const staged = makeDatabase(name);
                    const pull = staged.replicate.from.bind(staged.replicate);
                    staged.replicate.from = async (cloud) => {
                        const result = await pull(cloud);
                        if (fault === 'source-write') await source.put({ _id: 'late-during-pull' });
                        if (fault === 'contract-change') {
                            const design = await remote.get('_design/fortudo-document-contract');
                            await remote.put({
                                ...design,
                                fortudoDocumentContract: { version: 999 }
                            });
                        }
                        if (fault === 'denied') result.errors = [{ message: 'private detail' }];
                        if (fault === 'audit-offline')
                            jest.spyOn(remote, 'revsDiff').mockRejectedValue(new Error('offline'));
                        return result;
                    };
                    return staged;
                }
            });
            const saved = await guarded.preserve();
            await expect(guarded.rebuild(saved._id)).rejects.toThrow();
            expect(activate).not.toHaveBeenCalled();
            expect((await source.get('task-local')).description).toBe('Unsynced work');
            expect((await guarded.load(saved._id)).bundle.documents).toHaveLength(1);
        }
    );
});

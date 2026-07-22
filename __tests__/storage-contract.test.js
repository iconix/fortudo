/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));
window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(() => Promise.resolve()),
    debouncedSync: jest.fn(),
    registerExpectedLocalRevision: jest.fn(),
    assertPersistenceAllowed: jest.fn(),
    waitForIdleSync: jest.fn(() => Promise.resolve()),
    teardownSync: jest.fn()
}));

import {
    deleteActivity,
    deleteConfig,
    deleteTask,
    deleteTasks,
    destroyStorage,
    getDb,
    initStorage,
    loadConfig,
    putActivity,
    putConfig,
    putTask,
    putTasks,
    resolveConfigConflicts
} from '../public/js/storage.js';
import { registerExpectedLocalRevision } from '../public/js/sync-manager.js';

let counter = 0;

async function openRoom() {
    await initStorage(`contract-${counter++}-${Date.now()}`, { adapter: 'memory' });
    return getDb();
}

async function deletedLeaf(db, id) {
    const row = (await db.allDocs({ keys: [id] })).rows[0];
    return db.get(id, { rev: row.value.rev, revs: true });
}

afterEach(async () => {
    await destroyStorage();
    registerExpectedLocalRevision.mockClear();
});

describe('storage document contract coverage', () => {
    test.each([
        ['task', putTask, { id: 'task-1', type: 'unscheduled' }],
        ['activity', putActivity, { id: 'activity-1', description: 'Focus' }],
        ['config', putConfig, { id: 'config-1', enabled: true }]
    ])(
        'single %s writes are contracted and loads strip metadata',
        async (docType, write, value) => {
            const db = await openRoom();
            await write(value);
            const stored = await db.get(value.id);

            expect(stored).toMatchObject({
                docType,
                category: null,
                categoryId: null,
                categoryIdentityVersion: null,
                writerContract: { version: 1, categoryReference: null }
            });
            expect(registerExpectedLocalRevision).toHaveBeenCalledWith(value.id, stored._rev);

            if (docType === 'config') {
                await expect(loadConfig(value.id)).resolves.not.toHaveProperty('writerContract');
            }
        }
    );

    test('categorized bulk writes carry an exact redundant witness', async () => {
        const db = await openRoom();
        await putTasks([
            {
                id: 'task-1',
                type: 'scheduled',
                category: 'work/meetings',
                categoryId: '0dfac102-30f3-56d9-86c0-c3b414aeaf6e',
                categoryIdentityVersion: 1
            }
        ]);

        const stored = await db.get('task-1');
        expect(stored.writerContract.categoryReference).toEqual({
            key: stored.category,
            id: stored.categoryId,
            identityVersion: stored.categoryIdentityVersion
        });
        expect(registerExpectedLocalRevision).toHaveBeenCalledWith('task-1', stored._rev);
    });

    test.each([
        ['single task', () => putTask({ id: 'task-1' }), () => deleteTask('task-1'), 'task-1'],
        [
            'single activity',
            () => putActivity({ id: 'activity-1' }),
            () => deleteActivity('activity-1'),
            'activity-1'
        ],
        [
            'single config',
            () => putConfig({ id: 'config-1' }),
            () => deleteConfig('config-1'),
            'config-1'
        ],
        [
            'bulk task',
            () => putTasks([{ id: 'task-bulk' }]),
            () => deleteTasks(['task-bulk']),
            'task-bulk'
        ]
    ])('%s deletions create versioned tombstones', async (_label, create, remove, id) => {
        const db = await openRoom();
        await create();
        await remove();
        await expect(deletedLeaf(db, id)).resolves.toMatchObject({
            _id: id,
            _deleted: true,
            writerContract: { version: 1 }
        });
    });

    test('conflict winner successors and losing tombstones are contracted', async () => {
        const db = await openRoom();
        await db.bulkDocs(
            [
                {
                    _id: 'config-conflicted',
                    _rev: '1-a',
                    docType: 'config',
                    category: null,
                    categoryId: null,
                    categoryIdentityVersion: null,
                    writerContract: { version: 1, categoryReference: null },
                    value: 'a'
                },
                {
                    _id: 'config-conflicted',
                    _rev: '1-b',
                    docType: 'config',
                    category: null,
                    categoryId: null,
                    categoryIdentityVersion: null,
                    writerContract: { version: 1, categoryReference: null },
                    value: 'b'
                }
            ],
            { new_edits: false }
        );

        await resolveConfigConflicts('config-conflicted');
        const winner = await db.get('config-conflicted', { conflicts: true });
        expect(winner.writerContract).toEqual({ version: 1, categoryReference: null });
        expect(winner._conflicts).toBeUndefined();
    });
});

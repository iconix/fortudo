/**
 * @jest-environment jsdom
 */

// PouchDB/memdown requires setImmediate which jsdom doesn't provide
const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

// Set up window.PouchDB before importing storage
window.PouchDB = PouchDB;

// Prevent sync-manager from triggering real sync operations in tests
jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn()
}));

import {
    initStorage,
    migrateDocTypes,
    loadTasks,
    getDb,
    destroyStorage
} from '../public/js/storage.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `migration-room-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('migrateDocTypes', () => {
    test('adds docType "task" to legacy docs and leaves other docs untouched', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        const db = getDb();
        await db.bulkDocs([
            {
                _id: 'legacy-task',
                type: 'scheduled',
                description: 'Legacy task'
            },
            {
                _id: 'existing-task',
                docType: 'task',
                type: 'unscheduled',
                description: 'Already migrated'
            },
            {
                _id: 'activity-doc',
                docType: 'activity',
                description: 'Activity data'
            },
            {
                _id: 'config-doc',
                docType: 'config',
                description: 'Config data'
            },
            {
                _id: 'falsy-doc',
                docType: '',
                description: 'Handled falsy docType'
            },
            {
                _id: '_design/legacy',
                views: {
                    all: {
                        map(doc) {
                            emit(doc._id);
                        }
                    }
                }
            }
        ]);

        await migrateDocTypes();

        const migrated = await db.get('legacy-task');
        expect(migrated.docType).toBe('task');

        const already = await db.get('existing-task');
        expect(already.docType).toBe('task');

        const activity = await db.get('activity-doc');
        expect(activity.docType).toBe('activity');

        const config = await db.get('config-doc');
        expect(config.docType).toBe('config');

        const falsy = await db.get('falsy-doc');
        expect(falsy.docType).toBe('');

        const designDoc = await db.get('_design/legacy');
        expect(designDoc.docType).toBeUndefined();
    });

    test('is idempotent and does not create new revisions for already migrated docs', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        const db = getDb();
        await db.bulkDocs([
            {
                _id: 'legacy-task',
                type: 'scheduled',
                description: 'Legacy task'
            }
        ]);

        await migrateDocTypes();
        const first = await db.get('legacy-task');
        const firstRev = first._rev;

        await migrateDocTypes();
        const second = await db.get('legacy-task');
        expect(second._rev).toBe(firstRev);
    });

    test('migrated docs are still returned by loadTasks', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        const db = getDb();
        await db.bulkDocs([
            {
                _id: 'legacy-task',
                type: 'scheduled',
                description: 'Legacy task'
            }
        ]);

        await migrateDocTypes();
        const tasks = await loadTasks();
        const migrated = tasks.find((task) => task.id === 'legacy-task');
        expect(migrated).toEqual(expect.objectContaining({ docType: 'task' }));
    });
});

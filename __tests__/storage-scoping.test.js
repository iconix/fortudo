/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn()
}));

import {
    initStorage,
    loadTasks,
    saveTasks,
    getDb,
    destroyStorage
} from '../public/js/storage.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `test-room-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

const insertMixedDocs = async () => {
    const db = getDb();
    await db.bulkDocs([
        {
            _id: 'task-doc',
            docType: 'task',
            type: 'scheduled',
            description: 'Doc type task'
        },
        {
            _id: 'legacy-task',
            type: 'unscheduled',
            description: 'Legacy task without docType'
        },
        {
            _id: 'activity-doc',
            docType: 'activity',
            description: 'Activity doc'
        },
        {
            _id: 'config-doc',
            docType: 'config',
            description: 'Config doc'
        },
        {
            _id: 'falsy-doc',
            docType: '',
            description: 'Doc with falsy docType'
        }
    ]);
};

describe('Storage scoping', () => {
    test('loadTasks only returns task docs (docType "task" or no docType)', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await insertMixedDocs();
        const tasks = await loadTasks();
        expect(tasks).toHaveLength(2);
        const ids = tasks.map((t) => t.id).sort();
        expect(ids).toEqual(['legacy-task', 'task-doc']);
        expect(tasks.some((t) => t.id === 'falsy-doc')).toBe(false);
    });

    test('saveTasks only deletes task docs and preserves other docTypes', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await insertMixedDocs();

        await saveTasks([
            {
                id: 'replacement',
                type: 'scheduled',
                description: 'Replacement task',
                status: 'incomplete'
            }
        ]);

        const tasks = await loadTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].id).toBe('replacement');

        const db = getDb();
        await expect(db.get('activity-doc')).resolves.toHaveProperty('docType', 'activity');
        await expect(db.get('config-doc')).resolves.toHaveProperty('docType', 'config');
        await expect(db.get('falsy-doc')).resolves.toHaveProperty('docType', '');

        await expect(db.get('task-doc')).rejects.toHaveProperty('status', 404);
        await expect(db.get('legacy-task')).rejects.toHaveProperty('status', 404);
    });
});

/**
 * @jest-environment jsdom
 */

// PouchDB/memdown relies on setImmediate, which jsdom lacks
const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn(),
    waitForIdleSync: jest.fn(() => Promise.resolve()),
    teardownSync: jest.fn()
}));

import {
    initStorage,
    destroyStorage,
    putConfig,
    loadConfig,
    deleteConfig,
    saveTasks,
    putTask,
    getDb
} from '../public/js/storage.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `config-room-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('Storage - config docs', () => {
    test('putConfig persists config and loadConfig returns normalized doc without internals', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        const configPayload = {
            id: 'config-categories',
            docType: 'config',
            categories: ['work', 'personal']
        };
        await putConfig(configPayload);

        const loaded = await loadConfig('config-categories');
        expect(loaded).not.toBeNull();
        expect(loaded).toMatchObject({
            id: 'config-categories',
            docType: 'config',
            categories: ['work', 'personal']
        });
        expect(loaded).not.toHaveProperty('_id');
        expect(loaded).not.toHaveProperty('_rev');
    });

    test('loadConfig returns null when config is missing or docType is not config', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });

        const missing = await loadConfig('missing-config');
        expect(missing).toBeNull();

        await putTask({
            id: 'config-categories',
            type: 'unscheduled',
            description: 'I am not a config',
            status: 'incomplete'
        });
        const wrongType = await loadConfig('config-categories');
        expect(wrongType).toBeNull();
    });

    test('loadConfig rethrows non-404 storage errors', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });

        const db = getDb();
        const storageError = Object.assign(new Error('boom'), { status: 500 });
        const getSpy = jest.spyOn(db, 'get').mockRejectedValueOnce(storageError);

        await expect(loadConfig('config-categories')).rejects.toThrow('boom');

        getSpy.mockRestore();
    });

    test('putConfig updates existing config using revision tracking', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: 'config-categories', categories: ['A'] });
        await putConfig({ id: 'config-categories', categories: ['A', 'B'] });

        const loaded = await loadConfig('config-categories');
        expect(loaded).not.toBeNull();
        expect(loaded.categories).toEqual(['A', 'B']);
        expect(loaded.id).toBe('config-categories');
    });

    test('config docs survive saveTasks bulk replace', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: 'config-categories', categories: ['survive'] });
        await saveTasks([]);

        const loaded = await loadConfig('config-categories');
        expect(loaded).not.toBeNull();
        expect(loaded.categories).toEqual(['survive']);
    });

    describe('deleteConfig', () => {
        test('deletes a config document by ID', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putConfig({ id: 'config-test-delete', someSetting: true });

            const before = await loadConfig('config-test-delete');
            expect(before).not.toBeNull();
            expect(before.someSetting).toBe(true);

            await deleteConfig('config-test-delete');

            const after = await loadConfig('config-test-delete');
            expect(after).toBeNull();
        });

        test('succeeds silently when config does not exist', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });

            await expect(deleteConfig('config-nonexistent')).resolves.toBeUndefined();
        });

        test('does not affect other config documents', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putConfig({ id: 'config-keep', value: 'keep' });
            await putConfig({ id: 'config-remove', value: 'remove' });

            await deleteConfig('config-remove');

            const kept = await loadConfig('config-keep');
            expect(kept).not.toBeNull();
            expect(kept.value).toBe('keep');

            const removed = await loadConfig('config-remove');
            expect(removed).toBeNull();
        });
    });
});

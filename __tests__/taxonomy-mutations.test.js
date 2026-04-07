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
    debouncedSync: jest.fn(),
    waitForIdleSync: jest.fn(() => Promise.resolve()),
    teardownSync: jest.fn(),
    triggerSync: jest.fn(() => Promise.resolve()),
    onSyncStatusChange: jest.fn()
}));

import { initStorage, destroyStorage, putTask } from '../public/js/storage.js';
import { COLOR_FAMILIES } from '../public/js/category-colors.js';
import { loadTaxonomy } from '../public/js/taxonomy/taxonomy-store.js';
import { getGroupByKey, getCategoryByKey } from '../public/js/taxonomy/taxonomy-selectors.js';
import {
    addGroup,
    updateGroup,
    deleteGroup,
    addCategory,
    updateCategory,
    deleteCategory
} from '../public/js/taxonomy/taxonomy-mutations.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `taxonomy-mutations-${testDbCounter++}-${Date.now()}`;
}

async function initAndLoadTaxonomy() {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadTaxonomy();
}

afterEach(async () => {
    await destroyStorage();
});

describe('taxonomy-mutations', () => {
    test('updateGroup cascades family changes only to linked children', async () => {
        await initAndLoadTaxonomy();

        await updateCategory('work/deep', { color: '#22c55e' });
        await updateGroup('work', { colorFamily: 'amber' });

        expect(getGroupByKey('work').colorFamily).toBe('amber');
        expect(getCategoryByKey('work/deep').color).toBe('#22c55e');
        expect(COLOR_FAMILIES.amber).toContain(getCategoryByKey('work/meetings').color);
    });

    test('deleteGroup blocks when tasks reference the group key', async () => {
        await initAndLoadTaxonomy();
        await putTask({
            id: 'task-break-reference',
            type: 'unscheduled',
            description: 'Break task',
            status: 'incomplete',
            category: 'break'
        });

        await expect(deleteGroup('break')).rejects.toThrow('referenced by tasks');
    });

    test('editing a child color back into the family relinks the child', async () => {
        await initAndLoadTaxonomy();

        await updateCategory('work/deep', { color: '#22c55e' });
        await updateCategory('work/deep', { color: COLOR_FAMILIES.blue[0] });

        expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(true);
    });

    test('addGroup, addCategory, and deleteCategory keep persisted taxonomy writable', async () => {
        await initAndLoadTaxonomy();

        await addGroup({ label: 'Health', colorFamily: 'green' });
        await addCategory({ groupKey: 'health', label: 'Exercise' });

        expect(getGroupByKey('health')).not.toBeNull();
        expect(getCategoryByKey('health/exercise')).not.toBeNull();

        await deleteCategory('health/exercise');

        expect(getCategoryByKey('health/exercise')).toBeNull();
    });
});

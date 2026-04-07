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
    test('addGroup slugifies labels, persists, and rejects collisions', async () => {
        await initAndLoadTaxonomy();

        await addGroup({ label: 'Deep Focus', colorFamily: 'amber' });

        expect(getGroupByKey('deep-focus')).toMatchObject({
            key: 'deep-focus',
            label: 'Deep Focus',
            colorFamily: 'amber'
        });

        await expect(addGroup({ label: 'Deep Focus', colorFamily: 'blue' })).rejects.toThrow(
            'already exists'
        );
    });

    test('group mutations validate input, update labels, and allow safe deletion', async () => {
        await initAndLoadTaxonomy();

        await expect(addGroup({ label: '   ' })).rejects.toThrow('Group label is required');
        await expect(updateGroup('missing', { label: 'Nope' })).rejects.toThrow('not found');

        await addGroup({ label: 'Errands', colorFamily: 'rose' });
        await updateGroup('errands', { label: 'Errands And Life' });

        expect(getGroupByKey('errands').label).toBe('Errands And Life');

        await deleteGroup('errands');
        expect(getGroupByKey('errands')).toBeNull();
    });

    test('updateGroup cascades family changes only to linked children', async () => {
        await initAndLoadTaxonomy();

        await updateCategory('work/deep', { color: '#22c55e' });
        await updateGroup('work', { colorFamily: 'amber' });

        expect(getGroupByKey('work').colorFamily).toBe('amber');
        expect(getCategoryByKey('work/deep').color).toBe('#22c55e');
        expect(COLOR_FAMILIES.amber).toContain(getCategoryByKey('work/meetings').color);
    });

    test('deleteGroup blocks when child categories still belong to it', async () => {
        await initAndLoadTaxonomy();

        await expect(deleteGroup('work')).rejects.toThrow('still has child categories');
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

    test('addCategory validates inputs and can create compatibility groups', async () => {
        await initAndLoadTaxonomy();

        await expect(addCategory({ groupKey: 'work', label: '   ' })).rejects.toThrow(
            'Category label is required'
        );
        await expect(addCategory({ label: 'Errands' })).rejects.toThrow(
            'Category group is required'
        );
        await expect(addCategory({ groupKey: 'missing', label: 'Errands' })).rejects.toThrow(
            'Group "missing" not found'
        );

        await addCategory({
            groupKey: 'health',
            label: 'Exercise',
            color: '#10b981',
            allowCreateGroup: true
        });

        expect(getGroupByKey('health')).toMatchObject({
            key: 'health',
            label: 'Health'
        });
        expect(getCategoryByKey('health/exercise')).toMatchObject({
            groupKey: 'health',
            color: '#10b981'
        });
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

    test('category mutations validate lookup failures and block deleting referenced keys', async () => {
        await initAndLoadTaxonomy();

        await expect(updateCategory('missing', { label: 'Nope' })).rejects.toThrow('not found');
        await expect(deleteCategory('missing')).rejects.toThrow('not found');

        await putTask({
            id: 'task-category-reference',
            type: 'unscheduled',
            description: 'Deep work task',
            status: 'incomplete',
            category: 'work/deep'
        });

        await expect(deleteCategory('work/deep')).rejects.toThrow('referenced by tasks');
    });
});

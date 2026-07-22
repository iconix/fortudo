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

import {
    initStorage,
    destroyStorage,
    putTask,
    putActivity,
    putConfig
} from '../public/js/storage.js';
import { COLOR_FAMILIES } from '../public/js/category-colors.js';
import { loadTaxonomy } from '../public/js/taxonomy/taxonomy-store.js';
import { getGroupByKey, getCategoryByKey } from '../public/js/taxonomy/taxonomy-selectors.js';
import {
    addGroup,
    updateGroup,
    deleteGroup,
    archiveGroup,
    restoreGroup,
    archiveAndCreateGroupReplacement,
    addCategory,
    updateCategory,
    deleteCategory,
    archiveCategory,
    restoreCategory,
    archiveAndCreateCategoryReplacement
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
    test('addGroup uses opaque compatibility keys and rejects active label collisions', async () => {
        await initAndLoadTaxonomy();

        const group = await addGroup({ label: 'Deep Focus', colorFamily: 'amber' });

        expect(group).toMatchObject({
            id: expect.stringMatching(/^[0-9a-f-]{36}$/),
            key: expect.stringMatching(/^g-[0-9a-f-]{36}$/),
            label: 'Deep Focus',
            colorFamily: 'amber',
            legacyKeys: [group.key],
            status: 'active',
            archivedAt: null
        });
        expect(group.key).toBe(`g-${group.id}`);
        expect(getGroupByKey(group.key)).toMatchObject({ id: group.id });

        await expect(addGroup({ label: 'deep focus', colorFamily: 'blue' })).rejects.toThrow(
            'already exists'
        );
    });

    test('group mutations validate input, update labels, and allow safe deletion', async () => {
        await initAndLoadTaxonomy();

        await expect(addGroup({ label: '   ' })).rejects.toThrow('Group label is required');
        await expect(updateGroup('missing', { label: 'Nope' })).rejects.toThrow('not found');

        const group = await addGroup({ label: 'Errands', colorFamily: 'rose' });
        await updateGroup(group.key, { label: 'Errands And Life' });

        expect(getGroupByKey(group.key)).toMatchObject({
            id: group.id,
            key: group.key,
            label: 'Errands And Life'
        });

        await deleteGroup(group.key);
        expect(getGroupByKey(group.key)).toBeNull();
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
        const category = getGroupByKey('break');
        await putTask({
            id: 'task-break-reference',
            type: 'unscheduled',
            description: 'Break task',
            status: 'incomplete',
            category: category.key,
            categoryId: category.id,
            categoryIdentityVersion: 1
        });

        await expect(deleteGroup('break')).rejects.toThrow('referenced by tasks');
    });

    test('active labels are case-insensitively unique and archived labels are locked', async () => {
        await initAndLoadTaxonomy();

        await expect(addGroup({ label: 'work', colorFamily: 'amber' })).rejects.toThrow(
            'already exists'
        );
        await archiveGroup('work', '2026-07-21T12:00:00.000Z');
        await expect(updateGroup('work', { label: 'Renamed' })).rejects.toThrow(
            'Archived group labels are locked'
        );

        const replacement = await addGroup({ label: 'Work', colorFamily: 'amber' });
        expect(replacement.key).not.toBe('work');
        await expect(restoreGroup('work')).rejects.toThrow('already exists');
    });

    test('archive-and-create group replacement preserves the old identity', async () => {
        await initAndLoadTaxonomy();
        const original = getGroupByKey('personal');

        const replacement = await archiveAndCreateGroupReplacement('personal', {
            label: 'Life',
            colorFamily: 'amber'
        });

        expect(getGroupByKey('personal')).toMatchObject({
            id: original.id,
            label: 'Personal',
            status: 'archived'
        });
        expect(replacement).toMatchObject({
            label: 'Life',
            colorFamily: 'amber',
            status: 'active'
        });
        expect(replacement.id).not.toBe(original.id);
        expect(replacement.key).toBe(`g-${replacement.id}`);
    });

    test('editing a child color back into the family relinks the child', async () => {
        await initAndLoadTaxonomy();

        await updateCategory('work/deep', { color: '#22c55e' });
        await updateCategory('work/deep', { color: COLOR_FAMILIES.blue[0] });

        expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(true);
    });

    test('updateCategory can deliberately relink a custom child to its group family', async () => {
        await initAndLoadTaxonomy();

        await updateCategory('work/deep', { color: '#22c55e' });
        await updateCategory('work/deep', { linkToGroupFamily: true });

        expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(true);
        expect(COLOR_FAMILIES.blue).toContain(getCategoryByKey('work/deep').color);
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
        await expect(
            addCategory({
                groupKey: 'health',
                label: 'Exercise',
                color: '#10b981',
                allowCreateGroup: true
            })
        ).rejects.toThrow('Group label is required');

        const category = await addCategory({
            groupKey: 'health',
            groupLabel: 'Health',
            label: 'Exercise',
            color: '#10b981',
            allowCreateGroup: true
        });

        const compatibilityGroup = getGroupByKey(category.groupKey);
        expect(compatibilityGroup).toMatchObject({
            key: expect.stringMatching(/^g-[0-9a-f-]{36}$/),
            label: 'Health'
        });
        expect(category).toMatchObject({
            key: expect.stringMatching(/\/c-[0-9a-f-]{36}$/),
            groupKey: compatibilityGroup.key,
            color: '#10b981'
        });
    });

    test('addGroup, addCategory, and deleteCategory keep persisted taxonomy writable', async () => {
        await initAndLoadTaxonomy();

        const group = await addGroup({ label: 'Health', colorFamily: 'green' });
        const category = await addCategory({ groupKey: group.key, label: 'Exercise' });

        expect(getGroupByKey(group.key)).not.toBeNull();
        expect(getCategoryByKey(category.key)).not.toBeNull();

        await deleteCategory(category.key);

        expect(getCategoryByKey(category.key)).toBeNull();
    });

    test('category mutations validate lookup failures and block deleting referenced keys', async () => {
        await initAndLoadTaxonomy();

        await expect(updateCategory('missing', { label: 'Nope' })).rejects.toThrow('not found');
        await expect(deleteCategory('missing')).rejects.toThrow('not found');

        const category = getCategoryByKey('work/deep');
        await putTask({
            id: 'task-category-reference',
            type: 'unscheduled',
            description: 'Deep work task',
            status: 'incomplete',
            category: category.key,
            categoryId: category.id,
            categoryIdentityVersion: 1
        });

        await expect(deleteCategory('work/deep')).rejects.toThrow('referenced by tasks');
    });

    test('hard deletion checks activities and the running timer by opaque identity', async () => {
        await initAndLoadTaxonomy();
        const category = getCategoryByKey('work/meetings');
        await putActivity({
            id: 'activity-reference',
            description: 'Private activity',
            startDateTime: '2026-07-21T09:00:00.000Z',
            endDateTime: '2026-07-21T09:30:00.000Z',
            duration: 30,
            category: category.key,
            categoryId: category.id,
            categoryIdentityVersion: 1
        });

        await expect(deleteCategory(category.key)).rejects.toThrow('referenced by activities');

        await putConfig({
            id: 'config-running-activity',
            activityId: 'activity-running',
            category: 'work/comms',
            categoryId: getCategoryByKey('work/comms').id,
            categoryIdentityVersion: 1
        });
        await expect(deleteCategory('work/comms')).rejects.toThrow('running timer');
    });

    test('archived categories remain resolvable, lock labels, and can be restored', async () => {
        await initAndLoadTaxonomy();

        await archiveCategory('work/deep', '2026-07-21T12:00:00.000Z');
        expect(getCategoryByKey('work/deep')).toMatchObject({
            status: 'archived',
            archivedAt: '2026-07-21T12:00:00.000Z'
        });
        await expect(updateCategory('work/deep', { label: 'Changed meaning' })).rejects.toThrow(
            'Archived category labels are locked'
        );

        await restoreCategory('work/deep');
        expect(getCategoryByKey('work/deep')).toMatchObject({
            status: 'active',
            archivedAt: null
        });
    });

    test('archive-and-create replacement preserves the old identity and creates a new one', async () => {
        await initAndLoadTaxonomy();
        const original = getCategoryByKey('work/deep');

        const replacement = await archiveAndCreateCategoryReplacement('work/deep', {
            label: 'Strategy',
            color: '#22c55e'
        });

        expect(getCategoryByKey('work/deep')).toMatchObject({
            id: original.id,
            label: original.label,
            status: 'archived'
        });
        expect(replacement).toMatchObject({
            label: 'Strategy',
            groupId: original.groupId,
            status: 'active'
        });
        expect(replacement.id).not.toBe(original.id);
        expect(replacement.key).not.toBe(original.key);
    });
});

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
    loadConfig,
    putConfig,
    putTask
} from '../public/js/storage.js';
import { COLOR_FAMILIES } from '../public/js/category-colors.js';
import {
    TAXONOMY_CONFIG_ID,
    TAXONOMY_SCHEMA_VERSION,
    loadCategories,
    getCategories,
    getCategoryGroups,
    getGroupByKey,
    getCategoryByKey,
    resolveCategoryKey,
    getSelectableCategoryOptions,
    addGroup,
    updateGroup,
    deleteGroup,
    addCategory,
    updateCategory,
    deleteCategory,
    renderCategoryBadge
} from '../public/js/category-manager.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `cat-room-${testDbCounter++}-${Date.now()}`;
}

async function initAndLoadCategories() {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadCategories();
}

afterEach(async () => {
    await destroyStorage();
});

describe('category-manager', () => {
    test('seeds split taxonomy defaults for missing config doc', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await loadCategories();

        const taxonomy = getCategories();
        expect(taxonomy.groups.map((group) => group.key)).toEqual(['work', 'personal', 'break']);
        expect(taxonomy.categories.map((category) => category.key)).toEqual([
            'work/deep',
            'work/meetings',
            'work/comms',
            'work/admin'
        ]);

        const config = await loadConfig(TAXONOMY_CONFIG_ID);
        expect(config).not.toBeNull();
        expect(config.schemaVersion).toBe(TAXONOMY_SCHEMA_VERSION);
        expect(config.groups).toHaveLength(3);
        expect(config.categories).toHaveLength(4);
    });

    test('loads existing schemaVersion 3.5 config as-is even when arrays are empty', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({
            id: TAXONOMY_CONFIG_ID,
            schemaVersion: '3.5',
            groups: [],
            categories: []
        });
        await loadCategories();

        expect(getCategories().groups).toEqual([]);
        expect(getCategories().categories).toEqual([]);
    });

    test('treats malformed schemaVersion 3.5 docs with missing arrays as empty arrays', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({
            id: TAXONOMY_CONFIG_ID,
            schemaVersion: '3.5'
        });
        await loadCategories();

        expect(getCategories()).toEqual({ groups: [], categories: [] });
    });

    test('reseeds canonical defaults for legacy docs with missing or empty categories', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: TAXONOMY_CONFIG_ID, categories: [] });
        await loadCategories();

        expect(getCategories().groups.map((group) => group.key)).toEqual([
            'work',
            'personal',
            'break'
        ]);
        expect(getCategories().categories.map((category) => category.key)).toEqual([
            'work/deep',
            'work/meetings',
            'work/comms',
            'work/admin'
        ]);
    });

    test('migrates legacy standalone rows where key equals group into group records', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({
            id: TAXONOMY_CONFIG_ID,
            categories: [
                { key: 'personal', label: 'Personal', color: '#ec4899', group: 'personal' },
                { key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' }
            ]
        });
        await loadCategories();

        expect(getGroupByKey('personal')?.label).toBe('Personal');
        expect(getCategoryByKey('personal')).toBeNull();
        expect(getCategoryByKey('work/deep')?.groupKey).toBe('work');
    });

    test('normalizes malformed schemaVersion 3.5 rows and drops orphan child records', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({
            id: TAXONOMY_CONFIG_ID,
            schemaVersion: '3.5',
            groups: [{ key: ' errands ', color: COLOR_FAMILIES.rose[1] }, { key: 'misc' }],
            categories: [
                { key: 'errands/bills', groupKey: 'errands', color: COLOR_FAMILIES.rose[3] },
                { key: 'misc/notes', groupKey: 'misc' },
                { key: 'orphan/task', groupKey: 'missing' }
            ]
        });
        await loadCategories();

        expect(getGroupByKey('errands')).toMatchObject({
            label: 'Errands',
            colorFamily: 'rose',
            color: COLOR_FAMILIES.rose[1]
        });
        expect(getGroupByKey('misc')).toMatchObject({
            label: 'Misc',
            colorFamily: 'blue'
        });
        expect(getCategoryByKey('misc/notes')).toMatchObject({
            label: 'Notes',
            isLinkedToGroupFamily: true
        });
        expect(getCategoryByKey('misc/notes').color).toBe(getGroupByKey('misc').color);
        expect(getCategoryByKey('orphan/task')).toBeNull();
    });

    test('migrates legacy groups by inferring family from child colors when no standalone row exists', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({
            id: TAXONOMY_CONFIG_ID,
            categories: [
                {
                    key: 'hobby/paint',
                    label: 'Paint',
                    color: COLOR_FAMILIES.rose[0],
                    group: 'hobby'
                }
            ]
        });
        await loadCategories();

        expect(getGroupByKey('hobby')).toMatchObject({
            label: 'Hobby',
            colorFamily: 'rose'
        });
        expect(getCategoryByKey('hobby/paint').isLinkedToGroupFamily).toBe(true);
    });

    test('getGroupByKey returns null for unknown groups', async () => {
        await initAndLoadCategories();

        expect(getGroupByKey('missing')).toBeNull();
    });

    test('resolveCategoryKey returns group metadata for group keys and child metadata for child keys', async () => {
        await initAndLoadCategories();

        expect(resolveCategoryKey('work').kind).toBe('group');
        expect(resolveCategoryKey('work/deep').kind).toBe('category');
        expect(resolveCategoryKey('missing')).toBeNull();
    });

    test('getSelectableCategoryOptions returns groups followed by indented children', async () => {
        await initAndLoadCategories();

        const options = getSelectableCategoryOptions();
        expect(options[0]).toEqual({ value: 'work', label: 'Work', indentLevel: 0 });
        expect(
            options.some((entry) => entry.value === 'work/deep' && entry.indentLevel === 1)
        ).toBe(true);
        expect(options.find((entry) => entry.value === 'personal')).toEqual({
            value: 'personal',
            label: 'Personal',
            indentLevel: 0
        });
    });

    test('getCategoryGroups includes zero-child groups for legacy consumers', async () => {
        await initAndLoadCategories();

        const groups = getCategoryGroups();

        expect(groups.personal).toEqual([
            expect.objectContaining({
                key: 'personal',
                label: 'Personal',
                group: 'personal',
                groupKey: 'personal',
                isStandaloneGroup: true
            })
        ]);
        expect(groups.break).toEqual([
            expect.objectContaining({
                key: 'break',
                label: 'Break',
                group: 'break',
                groupKey: 'break',
                isStandaloneGroup: true
            })
        ]);
    });

    test('addGroup slugifies the label, persists schema v3.5, and rejects collisions', async () => {
        await initAndLoadCategories();

        await addGroup({ label: 'Deep Focus', colorFamily: 'amber' });

        expect(getGroupByKey('deep-focus')).toMatchObject({
            key: 'deep-focus',
            label: 'Deep Focus',
            colorFamily: 'amber'
        });

        const config = await loadConfig(TAXONOMY_CONFIG_ID);
        expect(config.schemaVersion).toBe('3.5');
        expect(config.groups.some((group) => group.key === 'deep-focus')).toBe(true);

        await expect(addGroup({ label: 'Deep Focus', colorFamily: 'blue' })).rejects.toThrow(
            'already exists'
        );
    });

    test('group CRUD validates input, updates labels, and allows safe deletion', async () => {
        await initAndLoadCategories();

        await expect(addGroup({ label: '   ' })).rejects.toThrow('Group label is required');
        await expect(updateGroup('missing', { label: 'Nope' })).rejects.toThrow('not found');

        await addGroup({ label: 'Errands', colorFamily: 'rose' });
        await updateGroup('errands', { label: 'Errands And Life' });

        expect(getGroupByKey('errands').label).toBe('Errands And Life');

        await deleteGroup('errands');
        expect(getGroupByKey('errands')).toBeNull();
    });

    test('addCategory creates a linked child under an existing group', async () => {
        await initAndLoadCategories();

        await addCategory({ groupKey: 'personal', label: 'Errands' });

        const category = getCategoryByKey('personal/errands');
        expect(category).toMatchObject({
            key: 'personal/errands',
            label: 'Errands',
            groupKey: 'personal',
            isLinkedToGroupFamily: true
        });
        expect(COLOR_FAMILIES.rose).toContain(category.color);
    });

    test('category CRUD validates input and allows deleting unreferenced children', async () => {
        await initAndLoadCategories();

        await expect(addCategory({ groupKey: 'work', label: '   ' })).rejects.toThrow(
            'Category label is required'
        );
        await expect(addCategory({ label: 'Errands' })).rejects.toThrow(
            'Category group is required'
        );
        await expect(addCategory({ groupKey: 'missing', label: 'Errands' })).rejects.toThrow(
            'Group "missing" not found'
        );
        await expect(updateCategory('missing', { label: 'Nope' })).rejects.toThrow('not found');
        await expect(deleteCategory('missing')).rejects.toThrow('not found');

        await addCategory({ groupKey: 'personal', label: 'Errands' });
        await deleteCategory('personal/errands');

        expect(getCategoryByKey('personal/errands')).toBeNull();
    });

    test('updateGroup family cascades only to linked children', async () => {
        await initAndLoadCategories();

        const linkedBefore = getCategoryByKey('work/deep').color;
        await updateCategory('work/deep', { color: '#22c55e' });
        await updateGroup('work', { colorFamily: 'amber' });

        expect(getGroupByKey('work').colorFamily).toBe('amber');
        expect(getCategoryByKey('work/meetings').color).not.toBe(linkedBefore);
        expect(getCategoryByKey('work/deep').color).toBe('#22c55e');
    });

    test('editing an unlinked child back into the family re-links it', async () => {
        await initAndLoadCategories();

        await updateCategory('work/deep', { color: '#22c55e' });
        await updateCategory('work/deep', { color: COLOR_FAMILIES.blue[0] });

        expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(true);
    });

    test('deleteGroup blocks when a child category still belongs to it', async () => {
        await initAndLoadCategories();

        await expect(deleteGroup('work')).rejects.toThrow('still has child categories');
    });

    test('deleteGroup blocks when tasks reference the group key', async () => {
        await initAndLoadCategories();
        await putTask({
            id: 'task-break-reference',
            type: 'unscheduled',
            description: 'Break task',
            status: 'incomplete',
            category: 'break'
        });

        await expect(deleteGroup('break')).rejects.toThrow('referenced by tasks');
    });

    test('deleteCategory blocks when tasks reference the key', async () => {
        await initAndLoadCategories();
        await putTask({
            id: 'task-category-reference',
            type: 'unscheduled',
            description: 'Deep work task',
            status: 'incomplete',
            category: 'work/deep'
        });

        await expect(deleteCategory('work/deep')).rejects.toThrow('referenced by tasks');
    });

    test('renderCategoryBadge resolves both group and child keys', async () => {
        await initAndLoadCategories();

        expect(renderCategoryBadge(null)).toBe('');
        expect(renderCategoryBadge('work')).toContain('Work');
        expect(renderCategoryBadge('work/deep')).toContain('Deep Work');
        expect(renderCategoryBadge('missing')).toBe('');
    });
});

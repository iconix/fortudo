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

import { initStorage, destroyStorage, loadConfig } from '../public/js/storage.js';
import {
    loadCategories,
    getCategories,
    getCategoryByKey,
    getCategoryGroups,
    addCategory,
    updateCategory,
    deleteCategory,
    renderCategoryBadge,
    DEFAULT_CATEGORIES
} from '../public/js/category-manager.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `cat-room-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('category-manager', () => {
    describe('loadCategories', () => {
        test('seeds default categories when config doc does not exist', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const categories = getCategories();
            expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
            expect(categories[0].key).toBe('work/deep');

            const config = await loadConfig('config-categories');
            expect(config).not.toBeNull();
            expect(config.categories).toHaveLength(DEFAULT_CATEGORIES.length);
        });

        test('loads existing categories from config doc without overwriting', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });

            const { putConfig } = await import('../public/js/storage.js');
            await putConfig({
                id: 'config-categories',
                categories: [
                    { key: 'custom/one', label: 'Custom', color: '#ff0000', group: 'custom' }
                ]
            });

            await loadCategories();
            const categories = getCategories();
            expect(categories).toHaveLength(1);
            expect(categories[0].key).toBe('custom/one');
        });
    });

    describe('getCategoryByKey', () => {
        test('returns the category matching the key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const category = getCategoryByKey('work/deep');
            expect(category).not.toBeNull();
            expect(category.label).toBe('Deep Work');
        });

        test('returns null for unknown key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            expect(getCategoryByKey('nonexistent')).toBeNull();
        });
    });

    describe('getCategoryGroups', () => {
        test('returns categories grouped by group field', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const groups = getCategoryGroups();
            expect(groups).toHaveProperty('work');
            expect(groups).toHaveProperty('personal');
            expect(groups).toHaveProperty('break');
            expect(groups.work.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('addCategory', () => {
        test('adds a new category and persists', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const initialCount = getCategories().length;
            await addCategory({
                key: 'health/exercise',
                label: 'Exercise',
                color: '#10b981',
                group: 'health'
            });

            expect(getCategories()).toHaveLength(initialCount + 1);
            expect(getCategoryByKey('health/exercise')).not.toBeNull();

            const config = await loadConfig('config-categories');
            expect(config.categories).toHaveLength(initialCount + 1);
        });

        test('rejects duplicate key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            await expect(
                addCategory({ key: 'work/deep', label: 'Dup', color: '#000', group: 'work' })
            ).rejects.toThrow('already exists');
        });
    });

    describe('updateCategory', () => {
        test('updates label and color by key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            await updateCategory('work/deep', { label: 'Focus Time', color: '#0000ff' });

            const updated = getCategoryByKey('work/deep');
            expect(updated.label).toBe('Focus Time');
            expect(updated.color).toBe('#0000ff');
        });

        test('throws for unknown key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            await expect(updateCategory('nonexistent', { label: 'X' })).rejects.toThrow(
                'not found'
            );
        });
    });

    describe('renderCategoryBadge', () => {
        test('returns empty string for null or undefined key', () => {
            expect(renderCategoryBadge(null)).toBe('');
            expect(renderCategoryBadge(undefined)).toBe('');
        });

        test('returns empty string for unknown key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            expect(renderCategoryBadge('nonexistent')).toBe('');
        });

        test('returns HTML badge with label and color for valid key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const badge = renderCategoryBadge('work/deep');
            expect(badge).toContain('Deep Work');
            expect(badge).toContain('#0ea5e9');
            expect(badge).toContain('category-badge');
        });
    });

    describe('deleteCategory', () => {
        test('removes category by key and persists', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const initialCount = getCategories().length;
            await deleteCategory('break');

            expect(getCategories()).toHaveLength(initialCount - 1);
            expect(getCategoryByKey('break')).toBeNull();
        });

        test('throws for unknown key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            await expect(deleteCategory('nonexistent')).rejects.toThrow('not found');
        });
    });
});

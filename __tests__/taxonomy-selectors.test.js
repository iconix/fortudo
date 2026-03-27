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

import { initStorage, destroyStorage } from '../public/js/storage.js';
import { loadCategories } from '../public/js/category-manager.js';
import {
    resolveCategoryKey,
    getSelectableCategoryOptions,
    getCategoryBadgeData
} from '../public/js/taxonomy/taxonomy-selectors.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `taxonomy-selectors-${testDbCounter++}-${Date.now()}`;
}

async function initAndLoadTaxonomy() {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadCategories();
}

afterEach(async () => {
    await destroyStorage();
});

describe('taxonomy-selectors', () => {
    test('resolveCategoryKey distinguishes group keys from child keys', async () => {
        await initAndLoadTaxonomy();

        expect(resolveCategoryKey('work')).toMatchObject({
            kind: 'group',
            record: expect.objectContaining({ key: 'work', label: 'Work' })
        });
        expect(resolveCategoryKey('work/deep')).toMatchObject({
            kind: 'category',
            record: expect.objectContaining({ key: 'work/deep', groupKey: 'work' })
        });
        expect(resolveCategoryKey('missing')).toBeNull();
    });

    test('getSelectableCategoryOptions returns groups followed by indented children', async () => {
        await initAndLoadTaxonomy();

        expect(getSelectableCategoryOptions()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ value: 'work', indentLevel: 0 }),
                expect.objectContaining({ value: 'work/deep', indentLevel: 1 }),
                expect.objectContaining({ value: 'personal', indentLevel: 0 })
            ])
        );
    });

    test('getCategoryBadgeData returns badge data for group and child keys', async () => {
        await initAndLoadTaxonomy();

        expect(getCategoryBadgeData('work')).toMatchObject({
            kind: 'group',
            label: 'Work'
        });
        expect(getCategoryBadgeData('work/deep')).toMatchObject({
            kind: 'category',
            label: 'Deep Work'
        });
        expect(getCategoryBadgeData('missing')).toBeNull();
    });
});

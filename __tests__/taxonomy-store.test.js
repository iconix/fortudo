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

import { initStorage, destroyStorage, loadConfig, putConfig } from '../public/js/storage.js';
import { COLOR_FAMILIES } from '../public/js/category-colors.js';
import {
    loadTaxonomy,
    getTaxonomyState,
    TAXONOMY_CONFIG_ID
} from '../public/js/taxonomy/taxonomy-store.js';
import { getGroupByKey, getCategoryByKey } from '../public/js/taxonomy/taxonomy-selectors.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `taxonomy-store-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('taxonomy-store', () => {
    test('loadTaxonomy seeds defaults when config doc is missing', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });

        await loadTaxonomy();

        expect(getTaxonomyState().groups.map((group) => group.key)).toEqual([
            'work',
            'personal',
            'break'
        ]);
        expect(getTaxonomyState().categories.map((category) => category.key)).toEqual([
            'work/deep',
            'work/meetings',
            'work/comms',
            'work/admin'
        ]);

        const config = await loadConfig(TAXONOMY_CONFIG_ID);
        expect(config).not.toBeNull();
        expect(config.groups).toHaveLength(3);
        expect(config.categories).toHaveLength(4);
    });

    test('loadTaxonomy preserves empty schemaVersion 3.5 arrays', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({
            id: TAXONOMY_CONFIG_ID,
            schemaVersion: '3.5',
            groups: [],
            categories: []
        });

        await loadTaxonomy();

        expect(getTaxonomyState()).toEqual({ groups: [], categories: [] });
    });

    test('loadTaxonomy migrates legacy rows into split group/category records', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({
            id: TAXONOMY_CONFIG_ID,
            categories: [
                { key: 'personal', label: 'Personal', color: '#ec4899', group: 'personal' },
                { key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' }
            ]
        });

        await loadTaxonomy();

        expect(getTaxonomyState().groups).toEqual(
            expect.arrayContaining([expect.objectContaining({ key: 'personal' })])
        );
        expect(getTaxonomyState().categories).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: 'work/deep', groupKey: 'work' })
            ])
        );
    });

    test('loadTaxonomy treats malformed schemaVersion 3.5 docs with missing arrays as empty arrays', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({
            id: TAXONOMY_CONFIG_ID,
            schemaVersion: '3.5'
        });

        await loadTaxonomy();

        expect(getTaxonomyState()).toEqual({ groups: [], categories: [] });
    });

    test('loadTaxonomy reseeds defaults for legacy docs with missing or empty categories', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: TAXONOMY_CONFIG_ID, categories: [] });

        await loadTaxonomy();

        expect(getTaxonomyState().groups.map((group) => group.key)).toEqual([
            'work',
            'personal',
            'break'
        ]);
        expect(getTaxonomyState().categories.map((category) => category.key)).toEqual([
            'work/deep',
            'work/meetings',
            'work/comms',
            'work/admin'
        ]);
    });

    test('loadTaxonomy normalizes malformed schemaVersion 3.5 rows and drops orphan child records', async () => {
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

        await loadTaxonomy();

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

    test('loadTaxonomy infers group family from child colors when no standalone legacy row exists', async () => {
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

        await loadTaxonomy();

        expect(getGroupByKey('hobby')).toMatchObject({
            label: 'Hobby',
            colorFamily: 'rose'
        });
        expect(getCategoryByKey('hobby/paint')).toMatchObject({
            groupKey: 'hobby',
            isLinkedToGroupFamily: true
        });
    });
});

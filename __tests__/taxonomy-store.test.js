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

import { initStorage, destroyStorage, putConfig } from '../public/js/storage.js';
import {
    loadTaxonomy,
    getTaxonomyState,
    TAXONOMY_CONFIG_ID
} from '../public/js/taxonomy/taxonomy-store.js';

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
});

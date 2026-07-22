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
    teardownSync: jest.fn()
}));

import { destroyStorage, getDb, initStorage, putConfig } from '../public/js/storage.js';
import {
    getMutableTaxonomyState,
    getTaxonomyState,
    loadTaxonomy,
    persistTaxonomyState,
    replaceTaxonomyState,
    TAXONOMY_CONFIG_ID
} from '../public/js/taxonomy/taxonomy-store.js';
import {
    archiveCategory,
    archiveGroup,
    restoreCategory,
    restoreGroup,
    updateCategory,
    updateGroup
} from '../public/js/taxonomy/taxonomy-mutations.js';

const GROUP_ID = '3930ae01-aef6-5c5f-8db3-d91be139ea84';
const CATEGORY_ID = '9c52c0e9-c389-54e1-927f-52c16b13de99';
let counter = 0;

function sourceTaxonomy() {
    return {
        id: TAXONOMY_CONFIG_ID,
        schemaVersion: '3.5',
        identityVersion: 1,
        futureRoot: { nested: ['root', { flag: true }] },
        groups: [
            {
                id: GROUP_ID,
                key: 'work',
                legacyKeys: ['work'],
                label: 'Work',
                colorFamily: 'blue',
                color: '#0ea5e9',
                status: 'active',
                archivedAt: null,
                futureGroup: { owner: 'remote', number: 7 }
            }
        ],
        categories: [
            {
                id: CATEGORY_ID,
                key: 'work/meetings',
                legacyKeys: ['work/meetings'],
                label: 'Comms',
                groupKey: 'work',
                groupId: GROUP_ID,
                color: '#38bdf8',
                isLinkedToGroupFamily: true,
                status: 'active',
                archivedAt: null,
                futureCategory: { list: [1, 2, 3] }
            }
        ]
    };
}

async function storedTaxonomy() {
    return getDb().get(TAXONOMY_CONFIG_ID);
}

beforeEach(async () => {
    await initStorage(`lossless-${counter++}-${Date.now()}`, { adapter: 'memory' });
    await putConfig(sourceTaxonomy());
    await loadTaxonomy();
});

afterEach(async () => {
    await destroyStorage();
});

describe('lossless taxonomy persistence', () => {
    test('preserves unknown root and row JSON across edits, recoloring, archive, and restore', async () => {
        await updateGroup('work', { label: 'Work life', colorFamily: 'rose' });
        await updateCategory('work/meetings', { color: '#a855f7' });
        await archiveCategory('work/meetings', '2026-07-21T12:00:00.000Z');
        await restoreCategory('work/meetings');
        await archiveGroup('work', '2026-07-21T12:01:00.000Z');
        await restoreGroup('work');

        const stored = await storedTaxonomy();
        expect(stored.futureRoot).toEqual({ nested: ['root', { flag: true }] });
        expect(stored.groups[0].futureGroup).toEqual({ owner: 'remote', number: 7 });
        expect(stored.categories[0].futureCategory).toEqual({ list: [1, 2, 3] });
        expect(stored.groups[0]).toMatchObject({ label: 'Work life', status: 'active' });
        expect(stored.categories[0]).toMatchObject({ color: '#a855f7', status: 'active' });
    });

    test('extensions follow immutable ids during a parent-key transition', async () => {
        const state = getMutableTaxonomyState();
        state.groups[0].legacyKeys.push(state.groups[0].key, 'professional');
        state.groups[0].key = 'professional';
        state.categories[0].groupKey = 'professional';
        await persistTaxonomyState();

        const stored = await storedTaxonomy();
        expect(stored.groups[0]).toMatchObject({
            id: GROUP_ID,
            key: 'professional',
            futureGroup: { owner: 'remote', number: 7 }
        });
        expect(stored.categories[0]).toMatchObject({
            id: CATEGORY_ID,
            groupKey: 'professional',
            futureCategory: { list: [1, 2, 3] }
        });
    });

    test('replacement state resets extensions instead of leaking them to a new winner', async () => {
        replaceTaxonomyState(getTaxonomyState());
        await persistTaxonomyState();

        const stored = await storedTaxonomy();
        expect(stored.futureRoot).toBeUndefined();
        expect(stored.groups[0].futureGroup).toBeUndefined();
        expect(stored.categories[0].futureCategory).toBeUndefined();
    });
});

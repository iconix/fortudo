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
import { loadTaxonomy } from '../public/js/taxonomy/taxonomy-store.js';
import {
    resolveCategoryKey,
    resolveCategoryReference,
    getSelectableCategoryOptions,
    getCategoryBadgeData,
    renderCategoryBadge
} from '../public/js/taxonomy/taxonomy-selectors.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `taxonomy-selectors-${testDbCounter++}-${Date.now()}`;
}

async function initAndLoadTaxonomy() {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadTaxonomy();
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

    test('new-entry options exclude archived records while existing assignments retain them', async () => {
        await initAndLoadTaxonomy();
        const { archiveCategory } = await import('../public/js/taxonomy/taxonomy-mutations.js');
        await archiveCategory('work/deep', '2026-07-21T12:00:00.000Z');

        expect(getSelectableCategoryOptions().map((option) => option.value)).not.toContain(
            'work/deep'
        );
        expect(
            getSelectableCategoryOptions({ category: 'work/deep' }).map((option) => option.value)
        ).toContain('work/deep');
    });

    test('an archived parent exposes only the existing selected assignment', async () => {
        await initAndLoadTaxonomy();
        const { archiveGroup } = await import('../public/js/taxonomy/taxonomy-mutations.js');
        await archiveGroup('work', '2026-07-21T12:00:00.000Z');

        const selectedGroupOptions = getSelectableCategoryOptions({ category: 'work' });
        expect(selectedGroupOptions.map((option) => option.value)).toContain('work');
        expect(selectedGroupOptions.map((option) => option.value)).not.toContain('work/deep');

        const selectedChildOptions = getSelectableCategoryOptions({ category: 'work/deep' });
        expect(selectedChildOptions.map((option) => option.value)).toEqual(
            expect.arrayContaining(['work', 'work/deep'])
        );
        expect(selectedChildOptions.map((option) => option.value)).not.toContain('work/admin');
    });

    test('resolveCategoryReference maps legacy-only references and marks them for repair', async () => {
        await initAndLoadTaxonomy();

        expect(resolveCategoryReference({ category: 'work/meetings' })).toMatchObject({
            kind: 'category',
            record: {
                id: '9c52c0e9-c389-54e1-927f-52c16b13de99',
                key: 'work/meetings',
                label: 'Comms'
            },
            needsRepair: true,
            integrityIssue: null,
            repairedFields: {
                category: 'work/meetings',
                categoryId: '9c52c0e9-c389-54e1-927f-52c16b13de99',
                categoryIdentityVersion: 1
            }
        });
    });

    test('consistent dual references resolve by opaque identity', async () => {
        await initAndLoadTaxonomy();

        expect(
            resolveCategoryReference({
                category: 'work/meetings',
                categoryId: '9c52c0e9-c389-54e1-927f-52c16b13de99',
                categoryIdentityVersion: 1
            })
        ).toMatchObject({
            record: { label: 'Comms' },
            resolution: 'id',
            needsRepair: false,
            integrityIssue: null
        });
    });

    test('valid legacy keys win mismatches and produce safe repair fields', async () => {
        await initAndLoadTaxonomy();

        expect(
            resolveCategoryReference({
                category: 'work/meetings',
                categoryId: '0dfac102-30f3-56d9-86c0-c3b414aeaf6e',
                categoryIdentityVersion: 1
            })
        ).toMatchObject({
            record: { key: 'work/meetings', label: 'Comms' },
            resolution: 'legacy-mismatch',
            needsRepair: true,
            integrityIssue: 'category-mismatch',
            repairedFields: {
                categoryId: '9c52c0e9-c389-54e1-927f-52c16b13de99'
            }
        });
    });

    test('unknown opaque identities never generate labels from ID text', async () => {
        await initAndLoadTaxonomy();

        const unknown = resolveCategoryReference({
            categoryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            categoryIdentityVersion: 1
        });
        expect(unknown).toMatchObject({
            record: null,
            label: 'Unknown category',
            integrityIssue: 'unknown-category',
            needsRepair: false
        });
        expect(renderCategoryBadge({ categoryId: 'work/secret-looking-id' })).toContain(
            'Unknown category'
        );
        expect(renderCategoryBadge({ categoryId: 'work/secret-looking-id' })).not.toContain(
            'Secret Looking Id'
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

    test('renderCategoryBadge returns empty string for null or unknown keys', async () => {
        await initAndLoadTaxonomy();

        expect(renderCategoryBadge(null)).toBe('');
        expect(renderCategoryBadge('missing')).toBe('');
    });

    test('renderCategoryBadge renders group keys with label and dark theme styling', async () => {
        await initAndLoadTaxonomy();

        const badge = renderCategoryBadge('work');
        expect(badge).toContain('Work');
        expect(badge).toContain('color: #e2e8f0');
        expect(badge).toContain('background-color: rgba(15, 23, 42, 0.9)');
    });

    test('renderCategoryBadge renders child category keys with child label', async () => {
        await initAndLoadTaxonomy();

        const badge = renderCategoryBadge('work/deep');
        expect(badge).toContain('Deep Work');
        expect(badge).toContain('color: #e2e8f0');
    });

    test('renderCategoryBadge escapes HTML in labels', async () => {
        await initAndLoadTaxonomy();

        const { addGroup } = await import('../public/js/taxonomy/taxonomy-mutations.js');
        const group = await addGroup({
            label: '<script>alert("xss")</script>',
            colorFamily: 'gray'
        });

        const badge = renderCategoryBadge(group.key);
        expect(badge).not.toContain('<script>');
        expect(badge).toContain('&lt;script&gt;');
    });
});

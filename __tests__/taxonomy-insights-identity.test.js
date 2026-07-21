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
import { buildInsightsModel } from '../public/js/activities/insights-model.js';
import { buildTrendModel } from '../public/js/activities/insights-trends.js';
import { summarizeActivitiesByParentGroup } from '../public/js/activities/summary.js';

let roomCounter = 0;

function activity(overrides = {}) {
    return {
        id: `activity-${roomCounter++}`,
        docType: 'activity',
        description: 'Identity test',
        startDateTime: '2026-07-21T09:00:00.000Z',
        endDateTime: '2026-07-21T09:15:00.000Z',
        duration: 15,
        source: 'manual',
        ...overrides
    };
}

beforeEach(async () => {
    await initStorage(`taxonomy-insights-${roomCounter++}`, { adapter: 'memory' });
    await loadTaxonomy();
});

afterEach(async () => {
    await destroyStorage();
});

test('summaries group legacy-only and ID-only references by resolved opaque identity', () => {
    const rows = [
        activity({ category: 'work/meetings' }),
        activity({
            category: null,
            categoryId: '9c52c0e9-c389-54e1-927f-52c16b13de99',
            categoryIdentityVersion: 1
        })
    ];

    expect(summarizeActivitiesByParentGroup(rows)).toEqual([
        expect.objectContaining({
            key: '3930ae01-aef6-5c5f-8db3-d91be139ea84',
            label: 'Work',
            duration: 30,
            count: 2
        })
    ]);
});

test('unknown opaque IDs display a fixed label and produce a data-integrity issue', () => {
    const unknownId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const row = activity({
        category: null,
        categoryId: unknownId,
        categoryIdentityVersion: 1
    });
    const model = buildInsightsModel({
        activities: [row],
        now: new Date('2026-07-21T12:00:00.000Z'),
        selectedDate: '2026-07-21'
    });
    const trend = buildTrendModel({
        activities: [row],
        dateRange: { startDate: '2026-07-21', endDate: '2026-07-21' }
    });

    expect(model.actualBlocks[0].categoryMeta).toMatchObject({
        label: 'Unknown category',
        isIntegrityIssue: true
    });
    expect(model.issues).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                type: 'unknown-category',
                activityId: row.id
            })
        ])
    );
    expect(trend.categoryTotals[0].label).toBe('Unknown category');
    expect(JSON.stringify({ model, trend })).not.toContain('Aaaaaaaa Bbbb 4ccc');
});

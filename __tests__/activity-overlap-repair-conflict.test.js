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
    assertPersistenceAllowed: jest.fn(),
    registerExpectedLocalRevision: jest.fn()
}));

import {
    getActivityOverlapTruncationPreviewForDate,
    loadActivitiesState,
    resetActivityState,
    truncateActivityOverlapsForDate
} from '../public/js/activities/manager.js';
import { applyWriterContract } from '../public/js/document-contract.js';
import { destroyStorage, getDb, initStorage, putActivity } from '../public/js/storage.js';
import { timeToDateTime } from '../public/js/utils.js';

let roomCounter = 0;

function iso(time) {
    return timeToDateTime(time, '2026-04-07');
}

function contractedActivity(overrides) {
    return applyWriterContract({
        _id: 'conflicted-timer',
        docType: 'activity',
        description: 'Original timer',
        category: null,
        categoryId: null,
        categoryIdentityVersion: null,
        startDateTime: iso('09:00'),
        source: 'timer',
        sourceTaskId: null,
        ...overrides
    });
}

afterEach(async () => {
    resetActivityState();
    await destroyStorage();
});

test('repair updates the current timer winner while preserving its corroborating losing leaf', async () => {
    await initStorage(`overlap-conflict-${roomCounter++}-${Date.now()}`, {
        adapter: 'memory'
    });
    const database = getDb();
    const losingRevision = '1-00000000000000000000000000000000';
    const winningRevision = '1-ffffffffffffffffffffffffffffffff';
    const shortEnd = new Date(new Date(iso('09:00')).getTime() + 1549 * 1000).toISOString();
    const nextStart = new Date(new Date(shortEnd).getTime() + 43).toISOString();

    await database.bulkDocs(
        [
            contractedActivity({
                _rev: losingRevision,
                endDateTime: shortEnd,
                duration: 26
            }),
            contractedActivity({
                _rev: winningRevision,
                endDateTime: timeToDateTime('00:00', '2026-04-08'),
                duration: 900
            })
        ],
        { new_edits: false }
    );
    await putActivity({
        id: 'next-timer',
        docType: 'activity',
        description: 'Next timer',
        category: null,
        categoryId: null,
        categoryIdentityVersion: null,
        startDateTime: nextStart,
        endDateTime: new Date(new Date(nextStart).getTime() + 8 * 60000).toISOString(),
        duration: 8,
        source: 'timer',
        sourceTaskId: null
    });

    await loadActivitiesState();
    const preview = getActivityOverlapTruncationPreviewForDate('2026-04-07');
    const result = await truncateActivityOverlapsForDate('2026-04-07', preview);

    expect(result).toEqual({
        success: true,
        truncatedCount: 1,
        truncatedActivityIds: ['conflicted-timer']
    });
    const repairedWinner = await database.get('conflicted-timer', { conflicts: true });
    expect(repairedWinner._rev).toMatch(/^2-/);
    expect(repairedWinner.endDateTime).toBe(nextStart);
    expect(repairedWinner.duration).toBe(26);
    expect(repairedWinner._conflicts).toEqual([losingRevision]);

    const preservedLeaf = await database.get('conflicted-timer', { rev: losingRevision });
    expect(preservedLeaf.endDateTime).toBe(shortEnd);
    expect(preservedLeaf.duration).toBe(26);
});

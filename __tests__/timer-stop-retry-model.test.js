/** @jest-environment jsdom */
import { setImmediate } from 'timers';
import {
    getActivityState,
    getRunningActivity,
    loadActivitiesState,
    loadRunningActivity,
    resetActivityState,
    stopTimerAt
} from '../public/js/activities/manager.js';
import { destroyStorage, getDb, initStorage, putConfig } from '../public/js/storage.js';
import { RUNNING_ACTIVITY_CONFIG_ID } from '../public/js/activities/running-activity-repository.js';

global.setImmediate = setImmediate;
window.PouchDB = require('pouchdb').plugin(require('pouchdb-adapter-memory'));

const start = '2026-04-09T10:00:00.000Z';
const end = '2026-04-09T10:30:00.000Z';
const cases = [];
for (const legacy of [false, true]) {
    const faults = ['none', 'save-activity', 'clear-timer'];
    if (legacy) faults.push('save-config');
    for (const fault of faults) {
        for (const reload of [false, true]) {
            cases.push({ legacy, fault, reload });
        }
    }
}

afterEach(async () => {
    jest.restoreAllMocks();
    resetActivityState();
    await destroyStorage();
});

test.each(cases)(
    'concurrent stops, legacy=$legacy, failure=$fault, reload=$reload',
    async ({ legacy, fault, reload }) => {
        await initStorage(`timer-stop-${legacy}-${fault}-${reload}`, { adapter: 'memory' });
        await putConfig({
            id: RUNNING_ACTIVITY_CONFIG_ID,
            ...(legacy ? {} : { activityId: 'activity-current' }),
            description: 'Working',
            category: null,
            source: 'timer',
            sourceTaskId: null,
            startDateTime: start
        });
        await loadRunningActivity();
        const db = getDb();
        const put = db.put.bind(db);
        const interruption = new Error('Room write interrupted');
        const trap = jest.spyOn(db, 'put').mockImplementation(async (doc, ...args) => {
            const step = doc._deleted
                ? 'clear-timer'
                : doc.docType === 'activity'
                  ? 'save-activity'
                  : 'save-config';
            if (step === fault) throw interruption;
            return put(doc, ...args);
        });

        const [first, concurrent] = await Promise.allSettled([stopTimerAt(end), stopTimerAt(end)]);
        if (fault === 'none') {
            expect(first).toMatchObject({ status: 'fulfilled', value: { success: true } });
        } else {
            expect(first).toMatchObject({ status: 'rejected', reason: interruption });
        }
        trap.mockRestore();
        if (reload) {
            resetActivityState();
            await loadActivitiesState();
            await loadRunningActivity();
        }
        const retryEnd = '2026-04-09T10:45:00.000Z';
        expect((await stopTimerAt(retryEnd)).success).toBe(fault !== 'none');

        const docs = (await db.allDocs({ include_docs: true })).rows.map((row) => row.doc);
        expect(docs.filter((doc) => doc._id === RUNNING_ACTIVITY_CONFIG_ID)).toHaveLength(0);
        const completed = docs.filter((doc) => doc.docType === 'activity');
        expect(completed).toHaveLength(1);
        expect(completed[0]).toMatchObject({
            description: 'Working',
            startDateTime: start,
            endDateTime: fault === 'save-config' || fault === 'save-activity' ? retryEnd : end,
            duration: fault === 'save-config' || fault === 'save-activity' ? 45 : 30
        });
        expect(getActivityState().map((activity) => activity.id)).toEqual([completed[0]._id]);
        expect(getRunningActivity()).toBeNull();
        expect(concurrent).toMatchObject({ status: 'fulfilled', value: { success: false } });
    }
);

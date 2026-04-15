/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/storage.js', () => ({
    putActivity: jest.fn(() => Promise.resolve()),
    loadActivities: jest.fn(() => Promise.resolve([])),
    deleteActivity: jest.fn(() => Promise.resolve())
}));

import * as activityManager from '../public/js/activities/manager.js';
import {
    addActivity,
    getActivityState,
    getActivityById,
    getTodaysActivities,
    getSuggestedActivityStartTime,
    loadActivitiesState,
    removeActivity,
    editActivity,
    resetActivityState,
    updateActivityState,
    createActivityFromTask
} from '../public/js/activities/manager.js';
import { putActivity, loadActivities, deleteActivity } from '../public/js/storage.js';
import { extractTimeFromDateTime } from '../public/js/utils.js';

describe('activity manager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
    });

    describe('addActivity', () => {
        test('creates activity with generated id and stores it', async () => {
            const result = await addActivity({
                description: 'Deep work session',
                category: 'work/deep',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            expect(result.success).toBe(true);
            expect(result.activity.id).toMatch(/^activity-/);
            expect(result.activity.description).toBe('Deep work session');
            expect(result.activity.docType).toBe('activity');
            expect(putActivity).toHaveBeenCalledWith(result.activity);
            expect(getActivityState()).toContainEqual(result.activity);
        });

        test('rejects activity with empty description', async () => {
            const result = await addActivity({
                description: '',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            expect(result.success).toBe(false);
            expect(result.reason).toMatch(/description/i);
            expect(putActivity).not.toHaveBeenCalled();
        });

        test('rounds manual zero-duration activity payloads up to one minute', async () => {
            const result = await addActivity({
                description: 'Test',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:00:00.000Z',
                duration: 0,
                source: 'manual',
                sourceTaskId: null
            });

            expect(result.success).toBe(true);
            expect(result.activity.duration).toBe(1);
            expect(result.activity.endDateTime).toBe('2026-04-07T09:01:00.000Z');
        });

        test('rounds sub-minute completed activities up to one minute at the shared addActivity seam', async () => {
            const result = await addActivity({
                description: 'Instant stop',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:00:00.000Z',
                duration: 0,
                source: 'timer',
                sourceTaskId: null
            });

            expect(result.success).toBe(true);
            expect(result.activity.duration).toBe(1);
            expect(result.activity.endDateTime).toBe('2026-04-07T09:01:00.000Z');
            expect(putActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    source: 'timer',
                    duration: 1,
                    endDateTime: '2026-04-07T09:01:00.000Z'
                })
            );
        });

        test('rejects activity with missing times', async () => {
            const result = await addActivity({
                description: 'Test',
                duration: 30,
                source: 'manual',
                sourceTaskId: null
            });

            expect(result.success).toBe(false);
            expect(result.reason).toMatch(/start and end/i);
        });
    });

    describe('getActivityById', () => {
        test('returns activity when found', async () => {
            const { activity } = await addActivity({
                description: 'Test',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            expect(getActivityById(activity.id)).toEqual(activity);
        });

        test('returns null when not found', () => {
            expect(getActivityById('activity-missing')).toBeNull();
        });
    });

    describe('state management', () => {
        test('updateActivityState normalizes defaults and sorts by start time', () => {
            const state = updateActivityState([
                {
                    id: 'activity-2',
                    description: 'Later',
                    startDateTime: '2026-04-07T10:00:00.000Z',
                    endDateTime: '2026-04-07T10:30:00.000Z',
                    duration: 30
                },
                {
                    id: 'activity-1',
                    description: 'Earlier',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:30:00.000Z',
                    duration: 30
                }
            ]);

            expect(state.map((activity) => activity.id)).toEqual(['activity-1', 'activity-2']);
            expect(state[0]).toEqual(
                expect.objectContaining({
                    docType: 'activity',
                    category: null,
                    source: 'manual',
                    sourceTaskId: null
                })
            );
        });

        test('getActivityState returns clones instead of mutable internal references', async () => {
            await addActivity({
                description: 'Original',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const state = getActivityState();
            state[0].description = 'Mutated externally';

            expect(getActivityState()[0].description).toBe('Original');
        });
    });

    describe('getTodaysActivities', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('returns only activities from today in reverse chronological end-time order', async () => {
            await addActivity({
                description: 'Yesterday',
                startDateTime: '2026-04-06T09:00:00.000Z',
                endDateTime: '2026-04-06T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });
            await addActivity({
                description: 'Today later',
                startDateTime: '2026-04-07T14:00:00.000Z',
                endDateTime: '2026-04-07T15:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });
            await addActivity({
                description: 'Today earlier',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const todays = getTodaysActivities();

            expect(todays).toHaveLength(2);
            expect(todays[0].description).toBe('Today later');
            expect(todays[1].description).toBe('Today earlier');
        });

        test('suggested activity start time uses the latest end time even when list order is reversed', () => {
            updateActivityState([
                {
                    id: 'activity-1',
                    description: 'Earlier',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:45:00.000Z',
                    duration: 45,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-2',
                    description: 'Latest end',
                    startDateTime: '2026-04-07T09:30:00.000Z',
                    endDateTime: '2026-04-07T10:30:00.000Z',
                    duration: 60,
                    source: 'auto',
                    sourceTaskId: 'sched-1'
                }
            ]);

            expect(getSuggestedActivityStartTime()).toBe(
                extractTimeFromDateTime(new Date('2026-04-07T10:30:00.000Z'))
            );
        });

        test('returns the latest activity end time as the suggested activity start time', async () => {
            await addActivity({
                description: 'Earlier',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:45:00.000Z',
                duration: 45,
                source: 'manual',
                sourceTaskId: null
            });
            await addActivity({
                description: 'Later',
                startDateTime: '2026-04-07T10:00:00.000Z',
                endDateTime: '2026-04-07T10:30:00.000Z',
                duration: 30,
                source: 'auto',
                sourceTaskId: 'sched-1'
            });

            expect(getSuggestedActivityStartTime()).toBe(
                extractTimeFromDateTime(new Date('2026-04-07T10:30:00.000Z'))
            );
        });

        test('falls back to null when there are no activities for today', () => {
            updateActivityState([
                {
                    id: 'activity-yesterday',
                    description: 'Yesterday',
                    startDateTime: '2026-04-06T09:00:00.000Z',
                    endDateTime: '2026-04-06T10:00:00.000Z',
                    duration: 60,
                    source: 'manual',
                    sourceTaskId: null
                }
            ]);

            expect(getSuggestedActivityStartTime()).toBeNull();
        });
    });

    describe('removeActivity', () => {
        test('removes activity from state and storage', async () => {
            const { activity } = await addActivity({
                description: 'To remove',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const result = await removeActivity(activity.id);

            expect(result.success).toBe(true);
            expect(deleteActivity).toHaveBeenCalledWith(activity.id);
            expect(getActivityById(activity.id)).toBeNull();
        });

        test('returns failure for nonexistent activity', async () => {
            const result = await removeActivity('activity-fake');

            expect(result.success).toBe(false);
        });
    });

    describe('editActivity', () => {
        test('updates editable fields and persists', async () => {
            const { activity } = await addActivity({
                description: 'Original',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const result = await editActivity(activity.id, {
                description: 'Updated',
                duration: 90,
                endDateTime: '2026-04-07T10:30:00.000Z'
            });

            expect(result.success).toBe(true);
            expect(result.activity.description).toBe('Updated');
            expect(result.activity.duration).toBe(90);
            expect(putActivity).toHaveBeenCalledWith(result.activity);
        });

        test('allows edit of auto-logged activity while preserving provenance fields', async () => {
            const { activity } = await addActivity({
                description: 'Auto',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'auto',
                sourceTaskId: 'sched-123'
            });

            const result = await editActivity(activity.id, {
                description: 'Changed',
                duration: 75,
                endDateTime: '2026-04-07T10:15:00.000Z'
            });

            expect(result.success).toBe(true);
            expect(result.activity.description).toBe('Changed');
            expect(result.activity.duration).toBe(75);
            expect(result.activity.source).toBe('auto');
            expect(result.activity.sourceTaskId).toBe('sched-123');
        });

        test('rejects edit when trimmed description becomes empty', async () => {
            const { activity } = await addActivity({
                description: 'Original',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const result = await editActivity(activity.id, { description: '   ' });

            expect(result.success).toBe(false);
            expect(result.reason).toMatch(/description/i);
        });

        test('rejects edit when duration becomes zero', async () => {
            const { activity } = await addActivity({
                description: 'Original',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const result = await editActivity(activity.id, { duration: 0 });

            expect(result.success).toBe(false);
            expect(result.reason).toMatch(/duration/i);
        });

        test('preserves the existing description when edit updates omit it', async () => {
            const { activity } = await addActivity({
                description: 'Original',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const result = await editActivity(activity.id, { duration: 90 });

            expect(result.success).toBe(true);
            expect(result.activity.description).toBe('Original');
            expect(result.activity.duration).toBe(90);
        });
    });

    describe('loadActivitiesState', () => {
        test('populates state from storage', async () => {
            loadActivities.mockResolvedValueOnce([
                {
                    id: 'activity-1',
                    docType: 'activity',
                    description: 'Stored',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T10:00:00.000Z',
                    duration: 60,
                    source: 'manual',
                    sourceTaskId: null
                }
            ]);

            await loadActivitiesState();

            expect(getActivityState()).toHaveLength(1);
            expect(getActivityState()[0].description).toBe('Stored');
        });

        test('falls back to empty state when loader is not a function', async () => {
            updateActivityState([
                {
                    id: 'activity-1',
                    description: 'Stored',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T10:00:00.000Z',
                    duration: 60
                }
            ]);

            const result = await loadActivitiesState(null);

            expect(result).toEqual([]);
            expect(getActivityState()).toEqual([]);
        });

        test('normalizes non-array storage responses to empty state', async () => {
            const result = await loadActivitiesState(async () => null);

            expect(result).toEqual([]);
            expect(getActivityState()).toEqual([]);
        });

        test('exports only the canonical activity CRUD and loading names', () => {
            expect(activityManager.loadActivitiesState).toBe(loadActivitiesState);
            expect(activityManager.editActivity).toBe(editActivity);
            expect(activityManager.removeActivity).toBe(removeActivity);
            expect(activityManager.loadActivityState).toBeUndefined();
            expect(activityManager.updateActivity).toBeUndefined();
            expect(activityManager.deleteActivity).toBeUndefined();
        });
    });

    describe('createActivityFromTask', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('maps a scheduled task into auto activity data', () => {
            const activity = createActivityFromTask({
                id: 'sched-1',
                description: 'Standup',
                category: 'work/meetings',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:30:00.000Z',
                duration: 30
            });

            expect(activity).toEqual({
                description: 'Standup',
                category: 'work/meetings',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:30:00.000Z',
                duration: 30,
                source: 'auto',
                sourceTaskId: 'sched-1'
            });
        });

        test('defaults missing category and id to null', () => {
            const activity = createActivityFromTask({
                description: 'Standup',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:30:00.000Z',
                duration: 30
            });

            expect(activity.category).toBeNull();
            expect(activity.sourceTaskId).toBeNull();
        });

        test('shifts auto-log times when a task is completed before its planned start', () => {
            jest.setSystemTime(new Date('2026-04-07T09:00:00.000Z'));

            const activity = createActivityFromTask({
                id: 'sched-2',
                description: 'Deep work',
                category: 'work/deep',
                startDateTime: '2026-04-07T10:00:00.000Z',
                endDateTime: '2026-04-07T11:00:00.000Z',
                duration: 60
            });

            expect(activity.startDateTime).toBe('2026-04-07T08:00:00.000Z');
            expect(activity.endDateTime).toBe('2026-04-07T09:00:00.000Z');
            expect(activity.duration).toBe(60);
        });
    });
});

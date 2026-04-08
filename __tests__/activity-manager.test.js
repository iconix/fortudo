/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/storage.js', () => ({
    putActivity: jest.fn(() => Promise.resolve()),
    loadActivities: jest.fn(() => Promise.resolve([])),
    deleteActivity: jest.fn(() => Promise.resolve())
}));

import {
    addActivity,
    getActivityState,
    getActivityById,
    getTodaysActivities,
    loadActivitiesState,
    loadActivityState,
    removeActivity,
    editActivity,
    updateActivity,
    deleteActivity as deleteActivityAlias,
    resetActivityState,
    updateActivityState,
    createActivityFromTask
} from '../public/js/activities/manager.js';
import { putActivity, loadActivities, deleteActivity } from '../public/js/storage.js';

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

        test('rejects activity with zero duration', async () => {
            const result = await addActivity({
                description: 'Test',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:00:00.000Z',
                duration: 0,
                source: 'manual',
                sourceTaskId: null
            });

            expect(result.success).toBe(false);
            expect(result.reason).toMatch(/duration/i);
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

        test('returns only activities from today sorted by start time', async () => {
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
            expect(todays[0].description).toBe('Today earlier');
            expect(todays[1].description).toBe('Today later');
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

        test('rejects edit of auto-logged activity', async () => {
            const { activity } = await addActivity({
                description: 'Auto',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'auto',
                sourceTaskId: 'sched-123'
            });

            const result = await editActivity(activity.id, { description: 'Changed' });

            expect(result.success).toBe(false);
            expect(result.reason).toMatch(/auto/i);
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

        test('loadActivityState aliases loadActivitiesState', async () => {
            const result = await loadActivityState(async () => [
                {
                    id: 'activity-1',
                    description: 'Stored',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T10:00:00.000Z',
                    duration: 60
                }
            ]);

            expect(result).toHaveLength(1);
            expect(getActivityState()[0].id).toBe('activity-1');
        });
    });

    describe('aliases', () => {
        test('updateActivity proxies to editActivity', async () => {
            const { activity } = await addActivity({
                description: 'Original',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const result = await updateActivity(activity.id, { description: 'Updated' });

            expect(result.success).toBe(true);
            expect(result.activity.description).toBe('Updated');
        });

        test('deleteActivity proxies to removeActivity', async () => {
            const { activity } = await addActivity({
                description: 'To remove',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const result = await deleteActivityAlias(activity.id);

            expect(result.success).toBe(true);
            expect(getActivityById(activity.id)).toBeNull();
        });
    });

    describe('createActivityFromTask', () => {
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
    });
});

/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/storage.js', () => ({
    putActivity: jest.fn(() => Promise.resolve()),
    deleteActivity: jest.fn(() => Promise.resolve()),
    putConfig: jest.fn(() => Promise.resolve()),
    loadConfig: jest.fn(() => Promise.resolve(null)),
    deleteConfig: jest.fn(() => Promise.resolve())
}));

import {
    loadRunningActivity,
    getRunningActivity,
    startTimer,
    stopTimer,
    stopTimerAt,
    updateRunningActivity,
    resetActivityState,
    getActivityState
} from '../public/js/activities/manager.js';
import { putConfig, loadConfig, deleteConfig, putActivity } from '../public/js/storage.js';

const RUNNING_ACTIVITY_CONFIG_ID = 'config-running-activity';

describe('Timer state primitives', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
    });

    describe('getRunningActivity', () => {
        test('returns null when no timer is running', () => {
            expect(getRunningActivity()).toBeNull();
        });

        test('returns a clone, not the internal reference', async () => {
            await startTimer({ description: 'Test' });

            const first = getRunningActivity();
            const second = getRunningActivity();

            expect(first).toEqual(second);
            expect(first).not.toBe(second);
        });
    });

    describe('loadRunningActivity', () => {
        test('loads running activity from PouchDB config doc', async () => {
            loadConfig.mockResolvedValueOnce({
                id: RUNNING_ACTIVITY_CONFIG_ID,
                description: 'Working on feature',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            await loadRunningActivity();

            const running = getRunningActivity();
            expect(running).not.toBeNull();
            expect(running.description).toBe('Working on feature');
            expect(running.category).toBe('work/deep');
            expect(running.startDateTime).toBe('2026-04-09T10:00:00.000Z');
        });

        test('sets null when no config doc exists', async () => {
            loadConfig.mockResolvedValueOnce(null);

            await loadRunningActivity();

            expect(getRunningActivity()).toBeNull();
        });
    });

    describe('resetActivityState', () => {
        test('clears running timer state', async () => {
            await startTimer({ description: 'Active timer' });
            expect(getRunningActivity()).not.toBeNull();

            resetActivityState();

            expect(getRunningActivity()).toBeNull();
        });
    });
});

describe('startTimer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T14:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('creates a running activity with correct fields', async () => {
        const result = await startTimer({
            description: 'Deep work session',
            category: 'work/deep'
        });

        expect(result.success).toBe(true);
        expect(result.runningActivity.description).toBe('Deep work session');
        expect(result.runningActivity.category).toBe('work/deep');
        expect(result.runningActivity.startDateTime).toBe('2026-04-09T14:00:00.000Z');
    });

    test('persists config doc to PouchDB', async () => {
        await startTimer({ description: 'Test', category: null });

        expect(putConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                id: RUNNING_ACTIVITY_CONFIG_ID,
                description: 'Test',
                category: null,
                startDateTime: '2026-04-09T14:00:00.000Z'
            })
        );
    });

    test('updates in-memory cache', async () => {
        await startTimer({ description: 'Cached' });

        const running = getRunningActivity();
        expect(running.description).toBe('Cached');
    });

    test('trims description whitespace', async () => {
        const result = await startTimer({ description: '  padded  ' });

        expect(result.runningActivity.description).toBe('padded');
    });

    test('rejects empty description', async () => {
        const result = await startTimer({ description: '' });

        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/description/i);
        expect(putConfig).not.toHaveBeenCalled();
    });

    test('rejects when timer is already running', async () => {
        await startTimer({ description: 'First' });
        jest.clearAllMocks();

        const result = await startTimer({ description: 'Second' });

        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/already running/i);
        expect(putConfig).not.toHaveBeenCalled();
    });

    test('defaults category to null when not provided', async () => {
        const result = await startTimer({ description: 'No cat' });

        expect(result.runningActivity.category).toBeNull();
    });
});

describe('stopTimer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('creates an activity from the running timer', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Working', category: 'work/deep' });

        jest.setSystemTime(new Date('2026-04-09T11:30:00.000Z'));
        const result = await stopTimer();

        expect(result.success).toBe(true);
        expect(result.activity.description).toBe('Working');
        expect(result.activity.category).toBe('work/deep');
        expect(result.activity.source).toBe('timer');
        expect(result.activity.sourceTaskId).toBeNull();
        expect(result.activity.startDateTime).toBe('2026-04-09T10:00:00.000Z');
        expect(result.activity.endDateTime).toBe('2026-04-09T11:30:00.000Z');
        expect(result.activity.duration).toBe(90);
    });

    test('persists the created activity', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Persist me' });
        jest.clearAllMocks();

        jest.setSystemTime(new Date('2026-04-09T10:30:00.000Z'));
        await stopTimer();

        expect(putActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                description: 'Persist me',
                duration: 30,
                source: 'timer'
            })
        );
    });

    test('deletes the config doc', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Test' });
        jest.clearAllMocks();

        jest.setSystemTime(new Date('2026-04-09T10:30:00.000Z'));
        await stopTimer();

        expect(deleteConfig).toHaveBeenCalledWith(RUNNING_ACTIVITY_CONFIG_ID);
    });

    test('clears the in-memory cache', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Test' });

        jest.setSystemTime(new Date('2026-04-09T10:05:00.000Z'));
        await stopTimer();

        expect(getRunningActivity()).toBeNull();
    });

    test('adds the created activity to state', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Stateful timer' });

        jest.setSystemTime(new Date('2026-04-09T10:05:00.000Z'));
        await stopTimer();

        expect(getActivityState()).toEqual([
            expect.objectContaining({
                description: 'Stateful timer',
                duration: 5,
                source: 'timer'
            })
        ]);
    });

    test('returns failure when no timer is running', async () => {
        const result = await stopTimer();

        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/no timer/i);
    });

    test('handles zero-duration timer', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Quick' });

        const result = await stopTimer();

        expect(result.success).toBe(true);
        expect(result.activity.duration).toBe(0);
    });
});

describe('stopTimerAt', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('stops timer at a specific endDateTime', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Working' });

        jest.setSystemTime(new Date('2026-04-09T11:00:00.000Z'));
        const result = await stopTimerAt('2026-04-09T10:45:00.000Z');

        expect(result.success).toBe(true);
        expect(result.activity.endDateTime).toBe('2026-04-09T10:45:00.000Z');
        expect(result.activity.duration).toBe(45);
    });

    test('clamps to zero duration when endDateTime is before startDateTime', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:30:00.000Z'));
        await startTimer({ description: 'Late start' });

        jest.setSystemTime(new Date('2026-04-09T11:00:00.000Z'));
        const result = await stopTimerAt('2026-04-09T10:00:00.000Z');

        expect(result.success).toBe(true);
        expect(result.activity.duration).toBe(0);
        expect(result.activity.startDateTime).toBe('2026-04-09T10:30:00.000Z');
        expect(result.activity.endDateTime).toBe('2026-04-09T10:30:00.000Z');
    });

    test('returns failure when no timer is running', async () => {
        const result = await stopTimerAt('2026-04-09T10:00:00.000Z');

        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/no timer/i);
    });
});

describe('updateRunningActivity', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('updates description on running timer', async () => {
        await startTimer({ description: 'Original' });
        jest.clearAllMocks();

        const result = await updateRunningActivity({ description: 'Updated' });

        expect(result.success).toBe(true);
        expect(result.runningActivity.description).toBe('Updated');
        expect(getRunningActivity().description).toBe('Updated');
        expect(putConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                id: RUNNING_ACTIVITY_CONFIG_ID,
                description: 'Updated'
            })
        );
    });

    test('updates category on running timer', async () => {
        await startTimer({ description: 'Test', category: 'work/deep' });

        const result = await updateRunningActivity({ category: 'work/meetings' });

        expect(result.runningActivity.category).toBe('work/meetings');
    });

    test('updates startDateTime for backdating', async () => {
        await startTimer({ description: 'Forgot to start' });

        const result = await updateRunningActivity({
            startDateTime: '2026-04-09T09:30:00.000Z'
        });

        expect(result.runningActivity.startDateTime).toBe('2026-04-09T09:30:00.000Z');
    });

    test('trims updated description whitespace', async () => {
        await startTimer({ description: 'Original' });

        const result = await updateRunningActivity({ description: '  Updated  ' });

        expect(result.success).toBe(true);
        expect(result.runningActivity.description).toBe('Updated');
    });

    test('rejects empty description', async () => {
        await startTimer({ description: 'Valid' });

        const result = await updateRunningActivity({ description: '' });

        expect(result.success).toBe(false);
        expect(getRunningActivity().description).toBe('Valid');
    });

    test('returns failure when no timer is running', async () => {
        const result = await updateRunningActivity({ description: 'No timer' });

        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/no timer/i);
    });
});

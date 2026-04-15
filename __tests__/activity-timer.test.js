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

jest.mock('../public/js/activities/running-activity-repository.js', () => ({
    loadRunningActivityConfig: jest.fn(() => Promise.resolve(null)),
    saveRunningActivityConfig: jest.fn(() => Promise.resolve()),
    deleteRunningActivityConfig: jest.fn(() => Promise.resolve())
}));

jest.mock('../public/js/tasks/manager.js', () => ({
    consumeUnscheduledTask: jest.fn(() => ({ success: true }))
}));

import {
    loadRunningActivity,
    getRunningActivity,
    startTimer,
    startTimerReplacingCurrent,
    stopTimer,
    stopTimerAt,
    updateRunningActivity,
    resetActivityState,
    getActivityState
} from '../public/js/activities/manager.js';
import { putActivity } from '../public/js/storage.js';
import {
    loadRunningActivityConfig,
    saveRunningActivityConfig,
    deleteRunningActivityConfig
} from '../public/js/activities/running-activity-repository.js';
import { consumeUnscheduledTask } from '../public/js/tasks/manager.js';

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
            loadRunningActivityConfig.mockResolvedValueOnce({
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
            loadRunningActivityConfig.mockResolvedValueOnce(null);

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

        expect(saveRunningActivityConfig).toHaveBeenCalledWith({
            description: 'Test',
            category: null,
            startDateTime: '2026-04-09T14:00:00.000Z',
            source: 'timer',
            sourceTaskId: null
        });
    });

    test('persists linked source task provenance on the running timer config', async () => {
        await startTimer({
            description: 'Inbox zero',
            category: 'break/admin',
            source: 'auto',
            sourceTaskId: 'unsched-42'
        });

        expect(saveRunningActivityConfig).toHaveBeenCalledWith({
            description: 'Inbox zero',
            category: 'break/admin',
            startDateTime: '2026-04-09T14:00:00.000Z',
            source: 'auto',
            sourceTaskId: 'unsched-42'
        });
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
        expect(saveRunningActivityConfig).not.toHaveBeenCalled();
    });

    test('rejects when timer is already running', async () => {
        await startTimer({ description: 'First' });
        jest.clearAllMocks();

        const result = await startTimer({ description: 'Second' });

        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/already running/i);
        expect(saveRunningActivityConfig).not.toHaveBeenCalled();
    });

    test('defaults category to null when not provided', async () => {
        const result = await startTimer({ description: 'No cat' });

        expect(result.runningActivity.category).toBeNull();
    });

    test('defaults provenance to a plain timer when not started from a task', async () => {
        const result = await startTimer({ description: 'No source task' });

        expect(result.runningActivity.source).toBe('timer');
        expect(result.runningActivity.sourceTaskId).toBeNull();
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

    test('consumes a linked unscheduled task and preserves auto provenance when timer stops', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({
            description: 'Inbox cleanup',
            category: 'break/admin',
            source: 'auto',
            sourceTaskId: 'unsched-99'
        });
        jest.clearAllMocks();

        jest.setSystemTime(new Date('2026-04-09T10:12:00.000Z'));
        const result = await stopTimer();

        expect(result.success).toBe(true);
        expect(result.activity.source).toBe('auto');
        expect(result.activity.sourceTaskId).toBe('unsched-99');
        expect(consumeUnscheduledTask).toHaveBeenCalledWith('unsched-99');
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

        expect(deleteRunningActivityConfig).toHaveBeenCalled();
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

    test('rounds sub-minute completed timers up to one minute', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Quick' });

        const result = await stopTimer();

        expect(result.success).toBe(true);
        expect(result.activity.duration).toBe(1);
        expect(result.activity.endDateTime).toBe('2026-04-09T10:01:00.000Z');
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

    test('clamps invalid timer end times to a one-minute completed activity', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:30:00.000Z'));
        await startTimer({ description: 'Late start' });

        jest.setSystemTime(new Date('2026-04-09T11:00:00.000Z'));
        const result = await stopTimerAt('2026-04-09T10:00:00.000Z');

        expect(result.success).toBe(true);
        expect(result.activity.duration).toBe(1);
        expect(result.activity.startDateTime).toBe('2026-04-09T10:30:00.000Z');
        expect(result.activity.endDateTime).toBe('2026-04-09T10:31:00.000Z');
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
        expect(saveRunningActivityConfig).toHaveBeenCalledWith({
            description: 'Updated',
            category: null,
            startDateTime: '2026-04-09T10:00:00.000Z',
            source: 'timer',
            sourceTaskId: null
        });
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

describe('startTimerReplacingCurrent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('starts a new timer without stopping when none is running', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));

        const result = await startTimerReplacingCurrent({ description: 'First timer' });

        expect(result).toEqual({
            success: true,
            runningActivity: {
                description: 'First timer',
                category: null,
                startDateTime: '2026-04-09T10:00:00.000Z',
                source: 'timer',
                sourceTaskId: null
            },
            stoppedActivity: null
        });
    });

    test('stops the current timer before starting the next one', async () => {
        jest.setSystemTime(new Date('2026-04-09T09:30:00.000Z'));
        await startTimer({ description: 'Current timer' });

        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        const result = await startTimerReplacingCurrent({ description: 'Next timer' });

        expect(result.success).toBe(true);
        expect(result.stoppedActivity).toEqual(
            expect.objectContaining({
                description: 'Current timer',
                duration: 30,
                source: 'timer'
            })
        );
        expect(result.runningActivity).toEqual({
            description: 'Next timer',
            category: null,
            startDateTime: '2026-04-09T10:00:00.000Z',
            source: 'timer',
            sourceTaskId: null
        });
    });

    test('returns the stopped activity when replacement start fails after stopping', async () => {
        jest.setSystemTime(new Date('2026-04-09T09:30:00.000Z'));
        await startTimer({ description: 'Current timer' });

        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        const result = await startTimerReplacingCurrent({ description: '' });

        expect(result).toEqual({
            success: false,
            reason: 'Description is required to start a timer.',
            stoppedActivity: expect.objectContaining({
                description: 'Current timer',
                duration: 30,
                source: 'timer'
            })
        });
    });
});

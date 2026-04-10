/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/activities/manager.js', () => ({
    addActivity: jest.fn(),
    editActivity: jest.fn(),
    removeActivity: jest.fn(),
    startTimerReplacingCurrent: jest.fn(),
    stopTimer: jest.fn()
}));

jest.mock('../public/js/app-coordinator.js', () => ({
    onActivityCreated: jest.fn(),
    onActivityEdited: jest.fn(),
    onActivityDeleted: jest.fn()
}));

jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn()
}));

jest.mock('../public/js/toast-manager.js', () => ({
    showToast: jest.fn()
}));

import {
    handleAddActivity,
    handleEditActivity,
    handleDeleteActivity,
    handleSaveActivityEdit,
    handleStartTimer,
    handleStopTimer,
    createActivityCallbacks
} from '../public/js/activities/handlers.js';
import {
    addActivity,
    editActivity,
    removeActivity,
    startTimerReplacingCurrent,
    stopTimer
} from '../public/js/activities/manager.js';
import {
    onActivityCreated,
    onActivityEdited,
    onActivityDeleted
} from '../public/js/app-coordinator.js';
import { showAlert } from '../public/js/modal-manager.js';
import { showToast } from '../public/js/toast-manager.js';

describe('activity handlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('handleAddActivity routes success through coordinator and toast', async () => {
        addActivity.mockResolvedValue({
            success: true,
            activity: { id: 'activity-1', description: 'Deep work' }
        });

        await expect(
            handleAddActivity({
                description: 'Deep work',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                category: null,
                source: 'manual',
                sourceTaskId: null
            })
        ).resolves.toEqual({
            success: true,
            activity: { id: 'activity-1', description: 'Deep work' }
        });

        expect(onActivityCreated).toHaveBeenCalledWith({
            activity: { id: 'activity-1', description: 'Deep work' }
        });
        expect(showToast).toHaveBeenCalledWith('Activity logged.', { theme: 'sky' });
    });

    test('handleAddActivity shows alert on validation failure and returns it', async () => {
        addActivity.mockResolvedValue({
            success: false,
            reason: 'Activity description is required.'
        });

        await expect(handleAddActivity({})).resolves.toEqual({
            success: false,
            reason: 'Activity description is required.'
        });

        expect(showAlert).toHaveBeenCalledWith('Activity description is required.', 'sky');
        expect(onActivityCreated).not.toHaveBeenCalled();
    });

    test('handleAddActivity catches storage rejections and returns fallback failure', async () => {
        addActivity.mockRejectedValue(new Error('disk full'));

        await expect(
            handleAddActivity({
                description: 'Deep work',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60
            })
        ).resolves.toEqual({
            success: false,
            reason: 'Could not log activity.'
        });

        expect(showAlert).toHaveBeenCalledWith('Could not log activity.', 'sky');
        expect(onActivityCreated).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });

    test('handleAddActivity returns early when payload resolves to null', async () => {
        await expect(handleAddActivity(null)).resolves.toBeUndefined();

        expect(addActivity).not.toHaveBeenCalled();
        expect(showAlert).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });

    test('handleEditActivity routes success through coordinator and toast', async () => {
        editActivity.mockResolvedValue({
            success: true,
            activity: { id: 'activity-1', description: 'Updated work' }
        });

        await expect(
            handleEditActivity('activity-1', { description: 'Updated work' })
        ).resolves.toEqual({
            success: true,
            activity: { id: 'activity-1', description: 'Updated work' }
        });

        expect(editActivity).toHaveBeenCalledWith('activity-1', { description: 'Updated work' });
        expect(onActivityEdited).toHaveBeenCalledWith({
            activity: { id: 'activity-1', description: 'Updated work' }
        });
        expect(showToast).toHaveBeenCalledWith('Activity updated.', { theme: 'sky' });
    });

    test('handleEditActivity shows fallback alert message on failure without reason', async () => {
        editActivity.mockResolvedValue({
            success: false
        });

        await expect(
            handleEditActivity('activity-1', { description: 'Updated work' })
        ).resolves.toEqual({
            success: false,
            reason: 'Could not update activity.'
        });

        expect(showAlert).toHaveBeenCalledWith('Could not update activity.', 'sky');
        expect(onActivityEdited).not.toHaveBeenCalled();
    });

    test('handleEditActivity catches storage rejections and returns fallback failure', async () => {
        editActivity.mockRejectedValue(new Error('write failed'));

        await expect(
            handleEditActivity('activity-1', { description: 'Updated work' })
        ).resolves.toEqual({
            success: false,
            reason: 'Could not update activity.'
        });

        expect(showAlert).toHaveBeenCalledWith('Could not update activity.', 'sky');
        expect(onActivityEdited).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });

    test('handleSaveActivityEdit proxies to edit flow', async () => {
        editActivity.mockResolvedValue({
            success: true,
            activity: { id: 'activity-1', description: 'Updated work' }
        });

        await handleSaveActivityEdit('activity-1', { description: 'Updated work' });

        expect(editActivity).toHaveBeenCalledWith(
            'activity-1',
            expect.objectContaining({ description: 'Updated work' })
        );
    });

    test('handleDeleteActivity routes success through coordinator and toast', async () => {
        removeActivity.mockResolvedValue({
            success: true,
            activity: { id: 'activity-1', description: 'Deep work' }
        });

        await expect(handleDeleteActivity('activity-1')).resolves.toEqual({
            success: true,
            activity: { id: 'activity-1', description: 'Deep work' }
        });

        expect(removeActivity).toHaveBeenCalledWith('activity-1');
        expect(onActivityDeleted).toHaveBeenCalledWith({
            activity: { id: 'activity-1', description: 'Deep work' }
        });
        expect(showToast).toHaveBeenCalledWith('Activity deleted.', { theme: 'sky' });
    });

    test('handleDeleteActivity shows fallback alert message on failure without reason', async () => {
        removeActivity.mockResolvedValue({
            success: false
        });

        await expect(handleDeleteActivity('activity-1')).resolves.toEqual({
            success: false,
            reason: 'Could not delete activity.'
        });

        expect(showAlert).toHaveBeenCalledWith('Could not delete activity.', 'sky');
        expect(onActivityDeleted).not.toHaveBeenCalled();
    });

    test('handleDeleteActivity catches storage rejections and returns fallback failure', async () => {
        removeActivity.mockRejectedValue(new Error('delete failed'));

        await expect(handleDeleteActivity('activity-1')).resolves.toEqual({
            success: false,
            reason: 'Could not delete activity.'
        });

        expect(showAlert).toHaveBeenCalledWith('Could not delete activity.', 'sky');
        expect(onActivityDeleted).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });

    test('createActivityCallbacks exposes handler references', () => {
        expect(createActivityCallbacks()).toEqual({
            onAddActivity: handleAddActivity,
            onEditActivity: handleEditActivity,
            onDeleteActivity: handleDeleteActivity,
            onSaveActivityEdit: handleSaveActivityEdit
        });
    });

    test('handleStartTimer starts a timer and shows a toast', async () => {
        startTimerReplacingCurrent.mockResolvedValue({
            success: true,
            runningActivity: {
                description: 'Focus block',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            },
            stoppedActivity: null
        });

        const result = await handleStartTimer({
            description: 'Focus block',
            category: 'work/deep'
        });

        expect(startTimerReplacingCurrent).toHaveBeenCalledWith({
            description: 'Focus block',
            category: 'work/deep'
        });
        expect(result.success).toBe(true);
        expect(showToast).toHaveBeenCalledWith('Timer started.', { theme: 'sky' });
        expect(onActivityCreated).not.toHaveBeenCalled();
    });

    test('handleStartTimer auto-stops an existing timer before starting a new one', async () => {
        startTimerReplacingCurrent.mockResolvedValueOnce({
            success: true,
            stoppedActivity: { id: 'activity-1', description: 'Current timer', duration: 30 },
            runningActivity: {
                description: 'Next timer',
                startDateTime: '2026-04-09T10:00:00.000Z'
            }
        });

        const result = await handleStartTimer({ description: 'Next timer', category: null });

        expect(onActivityCreated).toHaveBeenCalledWith({
            activity: { id: 'activity-1', description: 'Current timer', duration: 30 }
        });
        expect(startTimerReplacingCurrent).toHaveBeenCalledWith({
            description: 'Next timer',
            category: null
        });
        expect(result.success).toBe(true);
    });

    test('handleStartTimer stops when auto-stop fails', async () => {
        startTimerReplacingCurrent.mockResolvedValueOnce({
            success: false,
            reason: 'Could not stop timer.'
        });

        const result = await handleStartTimer({ description: 'Next timer' });

        expect(result).toEqual({
            success: false,
            reason: 'Could not stop timer.'
        });
        expect(startTimerReplacingCurrent).toHaveBeenCalledWith({ description: 'Next timer' });
    });

    test('handleStartTimer still emits the stopped activity when replacement start fails', async () => {
        startTimerReplacingCurrent.mockResolvedValueOnce({
            success: false,
            reason: 'Description is required to start a timer.',
            stoppedActivity: { id: 'activity-9', description: 'Stopped timer', duration: 15 }
        });

        const result = await handleStartTimer({ description: '' });

        expect(result).toEqual({
            success: false,
            reason: 'Description is required to start a timer.'
        });
        expect(onActivityCreated).toHaveBeenCalledWith({
            activity: { id: 'activity-9', description: 'Stopped timer', duration: 15 }
        });
        expect(showAlert).toHaveBeenCalledWith('Description is required to start a timer.', 'sky');
    });

    test('handleStopTimer emits coordinator + toast on success', async () => {
        stopTimer.mockResolvedValueOnce({
            success: true,
            activity: { id: 'activity-stop-1', description: 'Stopped timer' }
        });

        const result = await handleStopTimer();

        expect(stopTimer).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(onActivityCreated).toHaveBeenCalledWith({
            activity: { id: 'activity-stop-1', description: 'Stopped timer' }
        });
        expect(showToast).toHaveBeenCalledWith('Timer stopped.', { theme: 'sky' });
    });

    test('handleStopTimer shows alert on stop failure', async () => {
        stopTimer.mockResolvedValueOnce({
            success: false,
            reason: 'No timer is currently running.'
        });

        const result = await handleStopTimer();

        expect(result).toEqual({
            success: false,
            reason: 'No timer is currently running.'
        });
        expect(showAlert).toHaveBeenCalledWith('No timer is currently running.', 'sky');
    });
});

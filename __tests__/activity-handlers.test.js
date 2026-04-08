/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/activities/manager.js', () => ({
    addActivity: jest.fn(),
    editActivity: jest.fn(),
    removeActivity: jest.fn()
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
    createActivityCallbacks
} from '../public/js/activities/handlers.js';
import { addActivity, editActivity, removeActivity } from '../public/js/activities/manager.js';
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
});

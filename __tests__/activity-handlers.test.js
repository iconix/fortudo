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

        await handleAddActivity({
            description: 'Deep work',
            startDateTime: '2026-04-07T09:00:00.000Z',
            endDateTime: '2026-04-07T10:00:00.000Z',
            duration: 60,
            category: null,
            source: 'manual',
            sourceTaskId: null
        });

        expect(onActivityCreated).toHaveBeenCalledWith({
            activity: { id: 'activity-1', description: 'Deep work' }
        });
        expect(showToast).toHaveBeenCalledWith('Activity logged.', { theme: 'sky' });
    });

    test('handleAddActivity shows alert on failure', async () => {
        addActivity.mockResolvedValue({
            success: false,
            reason: 'Activity description is required.'
        });

        await handleAddActivity({});

        expect(showAlert).toHaveBeenCalledWith('Activity description is required.', 'sky');
        expect(onActivityCreated).not.toHaveBeenCalled();
    });

    test('handleAddActivity returns early when payload resolves to null', async () => {
        await handleAddActivity(null);

        expect(addActivity).not.toHaveBeenCalled();
        expect(showAlert).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });

    test('handleEditActivity routes success through coordinator and toast', async () => {
        editActivity.mockResolvedValue({
            success: true,
            activity: { id: 'activity-1', description: 'Updated work' }
        });

        await handleEditActivity('activity-1', { description: 'Updated work' });

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

        await handleEditActivity('activity-1', { description: 'Updated work' });

        expect(showAlert).toHaveBeenCalledWith('Could not update activity.', 'sky');
        expect(onActivityEdited).not.toHaveBeenCalled();
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

        await handleDeleteActivity('activity-1');

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

        await handleDeleteActivity('activity-1');

        expect(showAlert).toHaveBeenCalledWith('Could not delete activity.', 'sky');
        expect(onActivityDeleted).not.toHaveBeenCalled();
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

/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/dom-renderer.js', () => ({
    refreshUI: jest.fn(),
    updateStartTimeField: jest.fn()
}));

jest.mock('../public/js/activities/manager.js', () => ({
    addActivity: jest.fn(() => Promise.resolve()),
    createActivityFromTask: jest.fn((task) => ({
        id: 'activity-from-task',
        docType: 'activity',
        description: task.description,
        source: 'auto',
        sourceTaskId: task.id
    }))
}));

jest.mock('../public/js/settings-manager.js', () => ({
    isActivitiesEnabled: jest.fn(() => false)
}));

jest.mock('../public/js/tasks/scheduled-renderer.js', () => ({
    triggerConfettiAnimation: jest.fn(),
    refreshActiveTaskColor: jest.fn(),
    refreshCurrentGapHighlight: jest.fn()
}));

jest.mock('../public/js/tasks/manager.js', () => ({
    getSuggestedStartTime: jest.fn(() => '10:00'),
    getTaskState: jest.fn(() => [])
}));

import * as appCoordinator from '../public/js/app-coordinator.js';
import { addActivity, createActivityFromTask } from '../public/js/activities/manager.js';
import { refreshUI, updateStartTimeField } from '../public/js/dom-renderer.js';
import { isActivitiesEnabled } from '../public/js/settings-manager.js';
import { triggerConfettiAnimation } from '../public/js/tasks/scheduled-renderer.js';

describe('app-coordinator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isActivitiesEnabled.mockReturnValue(false);
    });

    test('onTaskCompleted refreshes UI and triggers confetti for scheduled tasks without directly updating start time', () => {
        isActivitiesEnabled.mockReturnValue(false);
        appCoordinator.onTaskCompleted({ task: { id: 'task-1', type: 'scheduled' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(triggerConfettiAnimation).toHaveBeenCalledWith('task-1');
        expect(createActivityFromTask).not.toHaveBeenCalled();
        expect(addActivity).not.toHaveBeenCalled();
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskCompleted skips confetti and start-time updates for unscheduled tasks', () => {
        isActivitiesEnabled.mockReturnValue(true);
        appCoordinator.onTaskCompleted({ task: { id: 'task-2', type: 'unscheduled' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(triggerConfettiAnimation).not.toHaveBeenCalled();
        expect(createActivityFromTask).not.toHaveBeenCalled();
        expect(addActivity).not.toHaveBeenCalled();
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskCreated refreshes UI without directly updating start time', () => {
        appCoordinator.onTaskCreated({ task: { id: 'task-3', type: 'scheduled' } });
        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskEdited refreshes UI without directly updating start time', () => {
        appCoordinator.onTaskEdited({ task: { id: 'task-5', type: 'scheduled' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskScheduled refreshes UI without directly updating start time', () => {
        appCoordinator.onTaskScheduled({ task: { id: 'task-6', type: 'scheduled' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskUnscheduled refreshes UI without directly updating start time', () => {
        appCoordinator.onTaskUnscheduled({ task: { id: 'task-7', type: 'unscheduled' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskDeleted refreshes UI without directly updating start time', () => {
        appCoordinator.onTaskDeleted({ task: { id: 'task-8', type: 'scheduled' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onActivityCreated refreshes UI when given an activity', () => {
        appCoordinator.onActivityCreated({ activity: { id: 'activity-1' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
    });

    test('onActivityEdited refreshes UI when given an activity', () => {
        appCoordinator.onActivityEdited({ activity: { id: 'activity-2' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
    });

    test('onActivityDeleted refreshes UI when given an activity', () => {
        appCoordinator.onActivityDeleted({ activity: { id: 'activity-3' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
    });

    test('onTaskCompleted auto-logs scheduled tasks when activities are enabled', () => {
        isActivitiesEnabled.mockReturnValue(true);

        const task = { id: 'task-9', type: 'scheduled', description: 'Write notes' };
        appCoordinator.onTaskCompleted({ task });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(triggerConfettiAnimation).toHaveBeenCalledWith('task-9');
        expect(createActivityFromTask).toHaveBeenCalledWith(task);
        expect(addActivity).toHaveBeenCalledWith({
            id: 'activity-from-task',
            docType: 'activity',
            description: 'Write notes',
            source: 'auto',
            sourceTaskId: 'task-9'
        });
    });

    test('onTaskCompleted tolerates auto-log persistence failures', async () => {
        isActivitiesEnabled.mockReturnValue(true);
        addActivity.mockRejectedValueOnce(new Error('storage failed'));

        appCoordinator.onTaskCompleted({
            task: { id: 'task-9b', type: 'scheduled', description: 'Write notes' }
        });

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(triggerConfettiAnimation).toHaveBeenCalledWith('task-9b');
        expect(createActivityFromTask).toHaveBeenCalled();
        expect(addActivity).toHaveBeenCalled();
    });

    test('onTaskCompleted does not auto-log scheduled tasks when activities are disabled', () => {
        isActivitiesEnabled.mockReturnValue(false);

        appCoordinator.onTaskCompleted({ task: { id: 'task-10', type: 'scheduled' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(triggerConfettiAnimation).toHaveBeenCalledWith('task-10');
        expect(createActivityFromTask).not.toHaveBeenCalled();
        expect(addActivity).not.toHaveBeenCalled();
    });

    test('onTaskCompleted ignores missing task payloads', () => {
        appCoordinator.onTaskCompleted({ task: null });

        expect(refreshUI).not.toHaveBeenCalled();
        expect(triggerConfettiAnimation).not.toHaveBeenCalled();
        expect(createActivityFromTask).not.toHaveBeenCalled();
        expect(addActivity).not.toHaveBeenCalled();
    });

    test('onActivityCreated ignores missing activity payloads', () => {
        appCoordinator.onActivityCreated({ activity: null });

        expect(refreshUI).not.toHaveBeenCalled();
    });

    test('onScheduledTasksCleared refreshes UI without directly updating start time', () => {
        appCoordinator.onScheduledTasksCleared();

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onCompletedTasksCleared refreshes UI without directly updating start time', () => {
        appCoordinator.onCompletedTasksCleared();

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onAllTasksCleared refreshes UI without directly updating start time', () => {
        appCoordinator.onAllTasksCleared();

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('does not expose the old generic coordinator surface', () => {
        expect(appCoordinator.onTaskAdded).toBeUndefined();
        expect(appCoordinator.onTaskUpdated).toBeUndefined();
        expect(appCoordinator.onTasksCleared).toBeUndefined();
        expect(appCoordinator.onDayChanged).toBeUndefined();
    });
});

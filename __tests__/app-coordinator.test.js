/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/dom-renderer.js', () => ({
    refreshUI: jest.fn(),
    updateStartTimeField: jest.fn()
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
import { refreshUI, updateStartTimeField } from '../public/js/dom-renderer.js';
import { triggerConfettiAnimation } from '../public/js/tasks/scheduled-renderer.js';

describe('app-coordinator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('onTaskCompleted refreshes UI and triggers confetti for scheduled tasks without directly updating start time', () => {
        appCoordinator.onTaskCompleted({ task: { id: 'task-1', type: 'scheduled' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(triggerConfettiAnimation).toHaveBeenCalledWith('task-1');
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskCompleted skips confetti and start-time updates for unscheduled tasks', () => {
        appCoordinator.onTaskCompleted({ task: { id: 'task-2', type: 'unscheduled' } });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(triggerConfettiAnimation).not.toHaveBeenCalled();
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

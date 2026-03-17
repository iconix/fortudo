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

import {
    onTaskCompleted,
    onTaskAdded,
    onTaskUpdated,
    onTaskDeleted,
    onTasksCleared,
    onDayChanged
} from '../public/js/app-coordinator.js';
import { refreshUI, updateStartTimeField } from '../public/js/dom-renderer.js';
import { triggerConfettiAnimation } from '../public/js/tasks/scheduled-renderer.js';

describe('app-coordinator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('onTaskCompleted refreshes UI and triggers confetti for scheduled tasks without directly updating start time', () => {
        onTaskCompleted({ id: 'task-1', type: 'scheduled' });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(triggerConfettiAnimation).toHaveBeenCalledWith('task-1');
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskCompleted skips confetti and start-time updates for unscheduled tasks', () => {
        onTaskCompleted({ id: 'task-2', type: 'unscheduled' });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(triggerConfettiAnimation).not.toHaveBeenCalled();
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskAdded refreshes UI without directly updating start time for either task type', () => {
        onTaskAdded({ id: 'task-3', type: 'scheduled' });
        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();

        jest.clearAllMocks();

        onTaskAdded({ id: 'task-4', type: 'unscheduled' });
        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskUpdated refreshes UI without directly updating start time', () => {
        onTaskUpdated({ id: 'task-5', type: 'scheduled' });

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTaskDeleted refreshes UI without directly updating start time', () => {
        onTaskDeleted('task-6');

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onTasksCleared refreshes UI without directly updating start time', () => {
        onTasksCleared('all');

        expect(refreshUI).toHaveBeenCalledTimes(1);
        expect(updateStartTimeField).not.toHaveBeenCalled();
    });

    test('onDayChanged is callable and does not throw', () => {
        expect(() => onDayChanged()).not.toThrow();
    });
});

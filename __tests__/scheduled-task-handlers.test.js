/**
 * @jest-environment jsdom
 */

import {
    handleCompleteTask,
    handleLockTask,
    handleEditTask,
    handleDeleteTask,
    handleUnscheduleTask,
    handleSaveTaskEdit,
    handleCancelEdit,
    handleGapClick,
    createScheduledTaskCallbacks
} from '../public/js/handlers/scheduled-task-handlers.js';
import { updateTaskState, getTaskState, getTaskById } from '../public/js/task-manager.js';
import { createTaskWithDateTime } from './test-utils.js';

// Mock storage
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    loadTasksFromStorage: jest.fn(() => [])
}));

// Mock modal-manager
jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn(),
    askConfirmation: jest.fn(() => Promise.resolve(false)),
    showScheduleModal: jest.fn(),
    showGapTaskPicker: jest.fn(),
    hideGapTaskPicker: jest.fn(),
    initializeModalEventListeners: jest.fn()
}));

// Mock dom-handler
jest.mock('../public/js/dom-handler.js', () => ({
    refreshUI: jest.fn(),
    renderTasks: jest.fn(),
    renderUnscheduledTasks: jest.fn(),
    updateStartTimeField: jest.fn(),
    getCurrentTimeElement: jest.fn(() => null),
    initializePageEventListeners: jest.fn(),
    initializeTaskTypeToggle: jest.fn(),
    startRealTimeClock: jest.fn(),
    initializeUnscheduledTaskListEventListeners: jest.fn(),
    initializeScheduledTaskListEventListeners: jest.fn(),
    initializeDragAndDropUnscheduled: jest.fn(),
    refreshStartTimeField: jest.fn(),
    disableStartTimeAutoUpdate: jest.fn(),
    getDeleteAllButtonElement: jest.fn(),
    getClearOptionsDropdownTriggerButtonElement: jest.fn(),
    getClearTasksDropdownMenuElement: jest.fn(),
    getClearScheduledOptionElement: jest.fn(),
    getClearCompletedOptionElement: jest.fn(),
    toggleClearTasksDropdown: jest.fn(),
    closeClearTasksDropdown: jest.fn(),
    resetEventDelegation: jest.fn()
}));

// Mock scheduled-task-renderer
jest.mock('../public/js/scheduled-task-renderer.js', () => ({
    triggerConfettiAnimation: jest.fn(),
    refreshActiveTaskColor: jest.fn(),
    renderTasks: jest.fn(() => null),
    getScheduledTaskListElement: jest.fn()
}));

// Mock form-utils
jest.mock('../public/js/form-utils.js', () => ({
    extractTaskFormData: jest.fn(),
    getTaskFormElement: jest.fn(),
    focusTaskDescriptionInput: jest.fn(),
    populateUnscheduledTaskInlineEditForm: jest.fn(),
    getUnscheduledTaskInlineFormData: jest.fn()
}));

import { refreshUI } from '../public/js/dom-handler.js';
import { showAlert, showGapTaskPicker, showScheduleModal } from '../public/js/modal-manager.js';

describe('Scheduled Task Handlers', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="current-time">12:00 PM</div>
            <div id="scheduled-task-list"></div>
            <div id="unscheduled-task-list"></div>
            <form id="task-form">
                <input type="text" name="description" />
                <input type="time" name="start-time" />
            </form>
        `;
        updateTaskState([]);
        jest.clearAllMocks();
    });

    describe('createScheduledTaskCallbacks', () => {
        test('returns object with all expected callback properties', () => {
            const callbacks = createScheduledTaskCallbacks();
            expect(callbacks).toHaveProperty('onCompleteTask');
            expect(callbacks).toHaveProperty('onLockTask');
            expect(callbacks).toHaveProperty('onEditTask');
            expect(callbacks).toHaveProperty('onDeleteTask');
            expect(callbacks).toHaveProperty('onUnscheduleTask');
            expect(callbacks).toHaveProperty('onSaveTaskEdit');
            expect(callbacks).toHaveProperty('onCancelEdit');
        });

        test('callback functions are the handler functions', () => {
            const callbacks = createScheduledTaskCallbacks();
            expect(callbacks.onCompleteTask).toBe(handleCompleteTask);
            expect(callbacks.onLockTask).toBe(handleLockTask);
            expect(callbacks.onEditTask).toBe(handleEditTask);
            expect(callbacks.onDeleteTask).toBe(handleDeleteTask);
            expect(callbacks.onUnscheduleTask).toBe(handleUnscheduleTask);
            expect(callbacks.onSaveTaskEdit).toBe(handleSaveTaskEdit);
            expect(callbacks.onCancelEdit).toBe(handleCancelEdit);
        });
    });

    describe('handleLockTask', () => {
        test('toggles lock state and calls refreshUI', () => {
            const task = createTaskWithDateTime({
                description: 'Lock Test',
                startTime: '09:00',
                duration: 60
            });
            updateTaskState([task]);

            handleLockTask(task.id, 0);

            expect(getTaskById(task.id).locked).toBe(true);
            expect(refreshUI).toHaveBeenCalled();
        });

        test('shows alert on failure', () => {
            handleLockTask('nonexistent', 0);
            expect(showAlert).toHaveBeenCalled();
        });
    });

    describe('handleEditTask', () => {
        test('sets task to editing mode and calls refreshUI', () => {
            const task = createTaskWithDateTime({
                description: 'Edit Test',
                startTime: '09:00',
                duration: 60
            });
            updateTaskState([task]);

            handleEditTask(task.id, 0);

            expect(getTaskById(task.id).editing).toBe(true);
            expect(refreshUI).toHaveBeenCalled();
        });

        test('does nothing for non-existent task', () => {
            handleEditTask('nonexistent', 0);
            expect(refreshUI).not.toHaveBeenCalled();
        });
    });

    describe('handleDeleteTask', () => {
        test('triggers confirmation on first click', () => {
            const task = createTaskWithDateTime({
                description: 'Delete Test',
                startTime: '09:00',
                duration: 60
            });
            updateTaskState([task]);

            handleDeleteTask(task.id, 0);

            // First click triggers confirmation, task should still exist
            expect(getTaskState()).toHaveLength(1);
            expect(refreshUI).toHaveBeenCalled();
        });

        test('deletes task on confirmed click', () => {
            const task = createTaskWithDateTime({
                description: 'Delete Test',
                startTime: '09:00',
                duration: 60,
                confirmingDelete: true
            });
            updateTaskState([task]);

            handleDeleteTask(task.id, 0);

            expect(getTaskState()).toHaveLength(0);
            expect(refreshUI).toHaveBeenCalled();
        });
    });

    describe('handleUnscheduleTask', () => {
        test('converts scheduled task to unscheduled', () => {
            const task = createTaskWithDateTime({
                description: 'Unschedule Test',
                startTime: '09:00',
                duration: 60
            });
            updateTaskState([task]);

            handleUnscheduleTask(task.id, 0);

            const updated = getTaskById(task.id);
            expect(updated.type).toBe('unscheduled');
            expect(refreshUI).toHaveBeenCalled();
        });

        test('shows alert for non-existent task', () => {
            handleUnscheduleTask('nonexistent', 0);
            expect(showAlert).toHaveBeenCalled();
        });
    });

    describe('handleCancelEdit', () => {
        test('cancels editing and calls refreshUI', () => {
            const task = createTaskWithDateTime({
                description: 'Cancel Test',
                startTime: '09:00',
                duration: 60,
                editing: true
            });
            updateTaskState([task]);

            handleCancelEdit(task.id, 0);

            expect(getTaskById(task.id).editing).toBe(false);
            expect(refreshUI).toHaveBeenCalled();
        });

        test('does nothing for non-existent task', () => {
            handleCancelEdit('nonexistent', 0);
            expect(refreshUI).not.toHaveBeenCalled();
        });
    });

    describe('handleGapClick', () => {
        function createUnscheduledTask(overrides = {}) {
            return {
                id: `unsched-${Date.now()}-${Math.random()}`,
                type: 'unscheduled',
                description: 'Test Unscheduled',
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                priority: 'medium',
                estDuration: 30,
                isEditingInline: false,
                ...overrides
            };
        }

        test('shows gap task picker with incomplete unscheduled tasks', () => {
            const task1 = createUnscheduledTask({ description: 'Task A' });
            const task2 = createUnscheduledTask({ description: 'Task B' });
            const completedTask = createUnscheduledTask({
                description: 'Done',
                status: 'completed'
            });
            updateTaskState([task1, task2, completedTask]);

            handleGapClick('2025-01-15T11:00:00.000Z', '2025-01-15T12:00:00.000Z', 60);

            expect(showGapTaskPicker).toHaveBeenCalledWith(
                '2025-01-15T11:00:00.000Z',
                '2025-01-15T12:00:00.000Z',
                60,
                expect.arrayContaining([
                    expect.objectContaining({ description: 'Task A' }),
                    expect.objectContaining({ description: 'Task B' })
                ]),
                expect.any(Function)
            );
            // Completed task should be filtered out
            const passedTasks = showGapTaskPicker.mock.calls[0][3];
            expect(passedTasks).toHaveLength(2);
            expect(passedTasks.every((t) => t.status !== 'completed')).toBe(true);
        });

        test('shows alert when no unscheduled tasks exist', () => {
            updateTaskState([]);

            handleGapClick('2025-01-15T11:00:00.000Z', '2025-01-15T12:00:00.000Z', 60);

            expect(showAlert).toHaveBeenCalledWith('No unscheduled tasks to schedule.', 'teal');
            expect(showGapTaskPicker).not.toHaveBeenCalled();
        });

        test('shows alert when only completed unscheduled tasks exist', () => {
            const completedTask = createUnscheduledTask({ status: 'completed' });
            updateTaskState([completedTask]);

            handleGapClick('2025-01-15T11:00:00.000Z', '2025-01-15T12:00:00.000Z', 60);

            expect(showAlert).toHaveBeenCalledWith('No unscheduled tasks to schedule.', 'teal');
            expect(showGapTaskPicker).not.toHaveBeenCalled();
        });

        test('onTaskSelected callback opens schedule modal with gap start time', () => {
            const task = createUnscheduledTask({
                description: 'My Task',
                estDuration: 45
            });
            updateTaskState([task]);

            handleGapClick('2025-01-15T11:00:00.000Z', '2025-01-15T12:00:00.000Z', 60);

            // Get the onTaskSelected callback that was passed to showGapTaskPicker
            const onTaskSelected = showGapTaskPicker.mock.calls[0][4];

            // Simulate user selecting a task
            onTaskSelected(task.id, '11:00');

            expect(showScheduleModal).toHaveBeenCalledWith('My Task', '45m', task.id, '11:00');
        });

        test('createScheduledTaskCallbacks includes onGapClick', () => {
            const callbacks = createScheduledTaskCallbacks();
            expect(callbacks).toHaveProperty('onGapClick');
            expect(callbacks.onGapClick).toBe(handleGapClick);
        });
    });
});

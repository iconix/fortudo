/**
 * @jest-environment jsdom
 */

import {
    handleScheduleUnscheduledTask,
    handleEditUnscheduledTask,
    handleDeleteUnscheduledTask,
    handleCancelUnscheduledTaskEdit,
    handleToggleCompleteUnscheduledTask,
    createUnscheduledTaskCallbacks
} from '../public/js/handlers/unscheduled-task-handlers.js';
import { updateTaskState, getTaskState, getTaskById } from '../public/js/task-manager.js';

// Mock storage
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    putTask: jest.fn(),
    deleteTask: jest.fn(),
    loadTasks: jest.fn(() => [])
}));

// Mock modal-manager
jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn(),
    askConfirmation: jest.fn(() => Promise.resolve(false)),
    showScheduleModal: jest.fn(),
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
import { showAlert, showScheduleModal } from '../public/js/modal-manager.js';

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

describe('Unscheduled Task Handlers', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="scheduled-task-list"></div>
            <div id="unscheduled-task-list"></div>
            <form id="task-form">
                <input type="text" name="description" />
            </form>
        `;
        updateTaskState([]);
        jest.clearAllMocks();
    });

    describe('createUnscheduledTaskCallbacks', () => {
        test('returns object with all expected callback properties', () => {
            const callbacks = createUnscheduledTaskCallbacks();
            expect(callbacks).toHaveProperty('onScheduleUnscheduledTask');
            expect(callbacks).toHaveProperty('onEditUnscheduledTask');
            expect(callbacks).toHaveProperty('onDeleteUnscheduledTask');
            expect(callbacks).toHaveProperty('onConfirmScheduleTask');
            expect(callbacks).toHaveProperty('onSaveUnscheduledTaskEdit');
            expect(callbacks).toHaveProperty('onCancelUnscheduledTaskEdit');
            expect(callbacks).toHaveProperty('onToggleCompleteUnscheduledTask');
        });
    });

    describe('handleScheduleUnscheduledTask', () => {
        test('shows schedule modal for incomplete task', () => {
            const task = createUnscheduledTask();
            updateTaskState([task]);

            handleScheduleUnscheduledTask(task.id);

            expect(showScheduleModal).toHaveBeenCalled();
        });

        test('shows alert for completed task', () => {
            const task = createUnscheduledTask({ status: 'completed' });
            updateTaskState([task]);

            handleScheduleUnscheduledTask(task.id);

            expect(showAlert).toHaveBeenCalledWith(
                'This task is already completed and cannot be scheduled.',
                'indigo'
            );
            expect(showScheduleModal).not.toHaveBeenCalled();
        });

        test('logs error for non-existent task', () => {
            handleScheduleUnscheduledTask('nonexistent');
            expect(showScheduleModal).not.toHaveBeenCalled();
        });
    });

    describe('handleEditUnscheduledTask', () => {
        test('toggles editing mode on', () => {
            const task = createUnscheduledTask();
            updateTaskState([task]);

            handleEditUnscheduledTask(task.id);

            expect(getTaskById(task.id).isEditingInline).toBe(true);
            expect(refreshUI).toHaveBeenCalled();
        });

        test('toggles editing mode off when already editing', () => {
            const task = createUnscheduledTask({ isEditingInline: true });
            updateTaskState([task]);

            handleEditUnscheduledTask(task.id);

            expect(getTaskById(task.id).isEditingInline).toBe(false);
            expect(refreshUI).toHaveBeenCalled();
        });

        test('clears other tasks editing state', () => {
            const task1 = createUnscheduledTask({ isEditingInline: true });
            const task2 = createUnscheduledTask();
            updateTaskState([task1, task2]);

            handleEditUnscheduledTask(task2.id);

            expect(getTaskById(task1.id).isEditingInline).toBe(false);
            expect(getTaskById(task2.id).isEditingInline).toBe(true);
        });
    });

    describe('handleDeleteUnscheduledTask', () => {
        test('triggers delete confirmation on first click', async () => {
            const task = createUnscheduledTask();
            updateTaskState([task]);

            await handleDeleteUnscheduledTask(task.id);

            // First click triggers confirmation, task should still exist
            expect(getTaskState()).toHaveLength(1);
            expect(refreshUI).toHaveBeenCalled();
        });
    });

    describe('handleCancelUnscheduledTaskEdit', () => {
        test('cancels editing and refreshes UI', () => {
            const task = createUnscheduledTask({ isEditingInline: true });
            updateTaskState([task]);

            handleCancelUnscheduledTaskEdit(task.id);

            expect(getTaskById(task.id).isEditingInline).toBe(false);
            expect(refreshUI).toHaveBeenCalled();
        });

        test('does nothing if task is not editing', () => {
            const task = createUnscheduledTask({ isEditingInline: false });
            updateTaskState([task]);

            handleCancelUnscheduledTaskEdit(task.id);
            expect(refreshUI).not.toHaveBeenCalled();
        });
    });

    describe('handleToggleCompleteUnscheduledTask', () => {
        test('toggles completion and refreshes UI', () => {
            const task = createUnscheduledTask();
            updateTaskState([task]);

            handleToggleCompleteUnscheduledTask(task.id);

            expect(getTaskById(task.id).status).toBe('completed');
            expect(refreshUI).toHaveBeenCalled();
        });

        test('shows alert on failure', () => {
            handleToggleCompleteUnscheduledTask('nonexistent');
            expect(showAlert).toHaveBeenCalled();
        });
    });
});

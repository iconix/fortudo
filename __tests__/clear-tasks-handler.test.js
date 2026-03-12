/**
 * @jest-environment jsdom
 */

import { initializeClearTasksHandlers } from '../public/js/handlers/clear-tasks-handler.js';
import { updateTaskState, getTaskState } from '../public/js/task-manager.js';
import { createTaskWithDateTime } from './test-utils.js';

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
    askConfirmation: jest.fn(() => Promise.resolve(true)),
    showScheduleModal: jest.fn(),
    initializeModalEventListeners: jest.fn()
}));

// Mock dom-renderer — all jest.fn() inline, referenced via imports after
jest.mock('../public/js/dom-renderer.js', () => ({
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
    getClearAllOptionElement: jest.fn(),
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

import { showAlert, askConfirmation } from '../public/js/modal-manager.js';
import {
    renderTasks,
    renderUnscheduledTasks,
    updateStartTimeField,
    toggleClearTasksDropdown,
    closeClearTasksDropdown,
    getDeleteAllButtonElement,
    getClearOptionsDropdownTriggerButtonElement,
    getClearTasksDropdownMenuElement,
    getClearAllOptionElement,
    getClearCompletedOptionElement
} from '../public/js/dom-renderer.js';

describe('Clear Tasks Handler', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="scheduled-task-list"></div>
            <div id="unscheduled-task-list"></div>
            <form id="task-form">
                <input type="text" name="description" />
            </form>
            <button id="delete-all">Clear Schedule</button>
            <button id="clear-options-dropdown-trigger-btn">▾</button>
            <div id="clear-tasks-dropdown" class="hidden">
                <a id="clear-completed-tasks-option" href="#">Clear Completed</a>
                <a id="clear-all-tasks-option" href="#">Clear All</a>
            </div>
        `;

        updateTaskState([]);
        jest.clearAllMocks();

        // Configure mock implementations to return actual DOM elements after clearAllMocks
        getDeleteAllButtonElement.mockReturnValue(document.getElementById('delete-all'));
        getClearOptionsDropdownTriggerButtonElement.mockReturnValue(
            document.getElementById('clear-options-dropdown-trigger-btn')
        );
        getClearTasksDropdownMenuElement.mockReturnValue(
            document.getElementById('clear-tasks-dropdown')
        );
        getClearAllOptionElement.mockReturnValue(document.getElementById('clear-all-tasks-option'));
        getClearCompletedOptionElement.mockReturnValue(
            document.getElementById('clear-completed-tasks-option')
        );
    });

    describe('initializeClearTasksHandlers', () => {
        test('attaches event listeners without errors', () => {
            expect(() => initializeClearTasksHandlers()).not.toThrow();
        });

        test('main clear button shows alert when no scheduled tasks', async () => {
            initializeClearTasksHandlers();
            const deleteAllBtn = document.getElementById('delete-all');
            deleteAllBtn.click();
            await new Promise((r) => setTimeout(r, 0));

            expect(showAlert).toHaveBeenCalledWith(
                'There are no scheduled tasks to clear.',
                'teal'
            );
        });

        test('main clear button clears scheduled tasks when confirmed', async () => {
            const task = createTaskWithDateTime({
                description: 'Delete Me',
                startTime: '09:00',
                duration: 60
            });
            updateTaskState([task]);

            initializeClearTasksHandlers();
            const deleteAllBtn = document.getElementById('delete-all');
            deleteAllBtn.click();
            await new Promise((r) => setTimeout(r, 0));

            expect(askConfirmation).toHaveBeenCalled();
            expect(getTaskState()).toHaveLength(0);
            expect(renderTasks).not.toHaveBeenCalledWith([]);
            expect(renderUnscheduledTasks).not.toHaveBeenCalledWith([]);
            expect(updateStartTimeField).toHaveBeenCalledWith(expect.any(String), true);
        });

        test('clear all dropdown option deletes all tasks when confirmed', async () => {
            const task = createTaskWithDateTime({
                description: 'Delete Me',
                startTime: '09:00',
                duration: 60
            });
            updateTaskState([task]);

            initializeClearTasksHandlers();
            const clearAllOption = document.getElementById('clear-all-tasks-option');
            clearAllOption.click();
            await new Promise((r) => setTimeout(r, 0));

            expect(askConfirmation).toHaveBeenCalled();
            expect(getTaskState()).toHaveLength(0);
            expect(renderTasks).toHaveBeenCalledWith([]);
            expect(renderUnscheduledTasks).toHaveBeenCalledWith([]);
            expect(closeClearTasksDropdown).toHaveBeenCalled();
        });

        test('dropdown trigger toggles dropdown', () => {
            initializeClearTasksHandlers();
            const triggerBtn = document.getElementById('clear-options-dropdown-trigger-btn');
            triggerBtn.click();

            expect(toggleClearTasksDropdown).toHaveBeenCalled();
        });

        test('dropdown lists Clear Completed before Clear All', () => {
            const dropdown = document.getElementById('clear-tasks-dropdown');
            const optionIds = Array.from(dropdown.querySelectorAll('a')).map((el) => el.id);

            expect(optionIds).toEqual(['clear-completed-tasks-option', 'clear-all-tasks-option']);
        });

        test('clear completed option shows alert when no completed tasks', async () => {
            initializeClearTasksHandlers();
            const clearCompleted = document.getElementById('clear-completed-tasks-option');
            clearCompleted.click();
            await new Promise((r) => setTimeout(r, 0));

            expect(showAlert).toHaveBeenCalledWith(
                'There are no completed tasks to clear.',
                'indigo'
            );
            expect(closeClearTasksDropdown).toHaveBeenCalled();
        });
    });
});

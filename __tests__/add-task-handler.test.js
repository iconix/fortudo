/**
 * @jest-environment jsdom
 */

import { handleAddTaskProcess } from '../public/js/handlers/add-task-handler.js';
import { updateTaskState, getTaskState } from '../public/js/task-manager.js';

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
    initializeTaskTypeToggle: jest.fn(),
    getCurrentTimeElement: jest.fn(() => null),
    initializePageEventListeners: jest.fn(),
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
import { showAlert } from '../public/js/modal-manager.js';
import { focusTaskDescriptionInput } from '../public/js/form-utils.js';

describe('Add Task Handler', () => {
    let mockFormElement;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="scheduled-task-list"></div>
            <div id="unscheduled-task-list"></div>
            <form id="task-form">
                <input type="text" name="description" />
                <input type="radio" name="task-type" value="scheduled" checked />
                <input type="radio" name="task-type" value="unscheduled" />
                <input type="time" name="start-time" />
                <input type="number" name="duration-hours" value="1" />
                <input type="number" name="duration-minutes" value="0" />
            </form>
        `;
        mockFormElement = document.getElementById('task-form');
        updateTaskState([]);
        jest.clearAllMocks();
    });

    describe('handleAddTaskProcess', () => {
        test('adds a scheduled task successfully', async () => {
            const taskData = {
                description: 'New Scheduled Task',
                startTime: '09:00',
                duration: 60,
                taskType: 'scheduled'
            };

            await handleAddTaskProcess(mockFormElement, taskData);

            const tasks = getTaskState();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].description).toBe('New Scheduled Task');
            expect(tasks[0].type).toBe('scheduled');
            expect(refreshUI).toHaveBeenCalled();
            expect(focusTaskDescriptionInput).toHaveBeenCalled();
        });

        test('adds an unscheduled task successfully', async () => {
            const taskData = {
                description: 'New Unscheduled Task',
                taskType: 'unscheduled',
                priority: 'high',
                estDuration: 30
            };

            await handleAddTaskProcess(mockFormElement, taskData);

            const tasks = getTaskState();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].description).toBe('New Unscheduled Task');
            expect(tasks[0].type).toBe('unscheduled');
            expect(refreshUI).toHaveBeenCalled();
        });

        test('shows alert for invalid task data', async () => {
            const taskData = {
                description: '',
                startTime: '09:00',
                duration: 60,
                taskType: 'scheduled'
            };

            await handleAddTaskProcess(mockFormElement, taskData);

            expect(showAlert).toHaveBeenCalled();
            expect(focusTaskDescriptionInput).toHaveBeenCalled();
        });

        test('shows alert for negative-duration task', async () => {
            const taskData = {
                description: 'Negative Duration',
                startTime: '09:00',
                duration: -10,
                taskType: 'scheduled'
            };

            await handleAddTaskProcess(mockFormElement, taskData);

            expect(showAlert).toHaveBeenCalled();
        });

        test('calls refreshUI after operation', async () => {
            const taskData = {
                description: 'Refresh Test',
                startTime: '10:00',
                duration: 30,
                taskType: 'scheduled'
            };

            await handleAddTaskProcess(mockFormElement, taskData);

            expect(refreshUI).toHaveBeenCalled();
        });
    });
});

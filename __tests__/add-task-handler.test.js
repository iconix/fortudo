/**
 * @jest-environment jsdom
 */

import { handleAddTaskProcess } from '../public/js/tasks/add-handler.js';
import { updateTaskState, getTaskState } from '../public/js/tasks/manager.js';
import * as taskManager from '../public/js/tasks/manager.js';

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

// Mock dom-renderer
jest.mock('../public/js/dom-renderer.js', () => ({
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
    getClearScheduleButtonElement: jest.fn(),
    getClearOptionsDropdownTriggerButtonElement: jest.fn(),
    getClearTasksDropdownMenuElement: jest.fn(),
    getClearCompletedOptionElement: jest.fn(),
    toggleClearTasksDropdown: jest.fn(),
    closeClearTasksDropdown: jest.fn(),
    resetEventDelegation: jest.fn()
}));

// Mock scheduled-task-renderer
jest.mock('../public/js/tasks/scheduled-renderer.js', () => ({
    triggerConfettiAnimation: jest.fn(),
    refreshActiveTaskColor: jest.fn(),
    renderTasks: jest.fn(() => null),
    getScheduledTaskListElement: jest.fn()
}));

jest.mock('../public/js/toast-manager.js', () => ({
    showToast: jest.fn()
}));

jest.mock('../public/js/app-coordinator.js', () => ({
    onTaskCreated: jest.fn()
}));

// Mock form-utils
jest.mock('../public/js/tasks/form-utils.js', () => ({
    extractTaskFormData: jest.fn(),
    getTaskFormElement: jest.fn(),
    focusTaskDescriptionInput: jest.fn(),
    resetTaskFormPreviewState: jest.fn(),
    populateUnscheduledTaskInlineEditForm: jest.fn(),
    getUnscheduledTaskInlineFormData: jest.fn()
}));

import { refreshUI } from '../public/js/dom-renderer.js';
import { showAlert } from '../public/js/modal-manager.js';
import { showToast } from '../public/js/toast-manager.js';
import {
    focusTaskDescriptionInput,
    resetTaskFormPreviewState
} from '../public/js/tasks/form-utils.js';
import { onTaskCreated } from '../public/js/app-coordinator.js';

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
                <span id="end-time-hint"></span>
                <span id="overlap-warning"></span>
                <button id="add-task-btn" type="submit">Add Task</button>
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
            expect(onTaskCreated).toHaveBeenCalledWith({ task: tasks[0] });
            expect(focusTaskDescriptionInput).toHaveBeenCalled();
            expect(resetTaskFormPreviewState).toHaveBeenCalled();
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
            expect(onTaskCreated).toHaveBeenCalledWith({ task: tasks[0] });
        });

        test('shows toast when addTask returns success message', async () => {
            const taskData = {
                description: 'Message Task',
                taskType: 'unscheduled',
                priority: 'high',
                estDuration: 30
            };

            jest.spyOn(taskManager, 'addTask').mockReturnValueOnce({
                success: true,
                message: 'Task added successfully.'
            });

            await handleAddTaskProcess(mockFormElement, taskData);

            expect(showToast).toHaveBeenCalledWith('Task added successfully.', {
                theme: 'indigo'
            });
        });

        test('shows toast when addTask returns auto-rescheduled message', async () => {
            const taskData = {
                description: 'Auto Rescheduled Task',
                startTime: '10:00',
                duration: 30,
                taskType: 'scheduled'
            };

            jest.spyOn(taskManager, 'addTask').mockReturnValueOnce({
                success: true,
                autoRescheduledMessage: 'Task auto-rescheduled.'
            });

            await handleAddTaskProcess(mockFormElement, taskData);

            expect(showToast).toHaveBeenCalledWith('Task auto-rescheduled.', {
                theme: 'teal'
            });
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

        test('calls coordinator on successful operation', async () => {
            const taskData = {
                description: 'Refresh Test',
                startTime: '10:00',
                duration: 30,
                taskType: 'scheduled'
            };

            await handleAddTaskProcess(mockFormElement, taskData);

            expect(onTaskCreated).toHaveBeenCalled();
            expect(refreshUI).not.toHaveBeenCalled();
        });

        test('clears stale preview state after successful reschedule-confirmed add', async () => {
            updateTaskState([
                {
                    id: 'existing-task',
                    description: 'Existing Task',
                    type: 'scheduled',
                    startDateTime: '2026-03-11T20:00:00.000Z',
                    endDateTime: '2026-03-11T21:00:00.000Z',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false,
                    locked: false
                }
            ]);

            const taskData = {
                description: 'Overlapping Task',
                startTime: '21:30',
                duration: 60,
                taskType: 'scheduled'
            };

            document.getElementById('end-time-hint').textContent = '3:08 PM';
            document.getElementById('overlap-warning').textContent =
                'overlaps "call gift" (2:19 PM - 2:49 PM)';
            document.getElementById('add-task-btn').innerHTML = 'Reschedule';

            await handleAddTaskProcess(mockFormElement, taskData, { reschedulePreApproved: true });

            expect(resetTaskFormPreviewState).toHaveBeenCalledWith({
                hintElement: document.getElementById('end-time-hint'),
                warningElement: document.getElementById('overlap-warning'),
                buttonElement: document.getElementById('add-task-btn')
            });
        });
    });
});

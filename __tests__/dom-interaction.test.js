/**
 * @jest-environment jsdom
 */

// This file contains tests for DOM interactions in dom-handler.js
// These tests focus on UI elements and event handlers, ensuring callbacks are invoked.

import {
    renderDateTime,
    renderTasks,
    updateStartTimeField,
    initializePageEventListeners,
    getTaskFormElement,
    focusTaskDescriptionInput,
    showAlert,
    askConfirmation
    // Import specific DOM element references if needed for direct checks, though usually not
    // taskForm as dfTaskForm, // Example if needed
} from '../public/js/dom-handler.js';
import { convertTo12HourTime } from '../public/js/utils.js'; // For verifying rendered output format

describe('DOM Handler Interaction Tests', () => {
    let mockAppCallbacks;
    let mockTaskEventCallbacks;
    let alertSpy;
    let confirmSpy;

    beforeEach(() => {
        // Set up a complete HTML structure that matches the actual app
        document.body.innerHTML = `
            <div class="container">
                <div class="header">
                    <div id="current-time"></div>
                    <div id="current-date"></div>
                </div>
                <form id="task-form">
                    <div class="form-group">
                        <input type="text" name="description" placeholder="Task description" required />
                    </div>
                    <div class="form-group">
                        <input type="time" name="start-time" required />
                    </div>
                    <div class="form-group">
                        <input type="number" name="duration-hours" min="0" value="1" />
                        <input type="number" name="duration-minutes" min="0" max="59" value="0" />
                    </div>
                    <button type="submit">Add Task</button>
                </form>
                <div id="task-list" class="task-list"></div>
                <button id="delete-all" class="btn-delete-all">Delete All Tasks</button>
            </div>
        `;

        // Mock callbacks
        mockAppCallbacks = {
            onTaskFormSubmit: jest.fn(),
            onDeleteAllTasks: jest.fn(),
            onGlobalClick: jest.fn()
        };

        mockTaskEventCallbacks = {
            onCompleteTask: jest.fn(),
            onEditTask: jest.fn(),
            onDeleteTask: jest.fn(),
            onSaveTaskEdit: jest.fn(),
            onCancelEdit: jest.fn()
        };

        alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);

        // Get references to form and delete button
        const taskForm = /** @type {HTMLFormElement|null} */ (document.getElementById('task-form'));
        const deleteAllBtn = /** @type {HTMLButtonElement|null} */ (
            document.getElementById('delete-all')
        );
        // Initialize event listeners with mock callbacks and correct arguments
        initializePageEventListeners(mockAppCallbacks, taskForm, deleteAllBtn);

        // Ensure all required elements exist
        expect(taskForm).not.toBeNull();
        expect(document.getElementById('task-list')).not.toBeNull();
        expect(deleteAllBtn).not.toBeNull();
        expect(document.getElementById('current-time')).not.toBeNull();
        expect(document.getElementById('current-date')).not.toBeNull();
    });

    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    describe('renderDateTime', () => {
        test('updates time and date elements correctly', () => {
            const fixedDate = new Date(2023, 0, 1, 10, 0); // Jan 1, 2023, 10:00:00
            jest.useFakeTimers().setSystemTime(fixedDate);

            renderDateTime();

            const timeElement = document.getElementById('current-time');
            const dateElement = document.getElementById('current-date');

            if (!timeElement || !dateElement) {
                throw new Error('Time or date element not found');
            }

            expect(timeElement.textContent).toBe(
                fixedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
            expect(dateElement.textContent).toBe(
                fixedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
            );

            jest.useRealTimers();
        });
    });

    describe('updateStartTimeField', () => {
        test('sets start time input if empty', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            startTimeInput.value = ''; // Ensure it's empty
            updateStartTimeField('10:30');
            expect(startTimeInput.value).toBe('10:30');
        });

        test('does not overwrite existing start time input', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            startTimeInput.value = '09:00';
            updateStartTimeField('10:30');
            expect(startTimeInput.value).toBe('09:00');
        });

        test('overwrites existing start time input when forceUpdate is true', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            startTimeInput.value = '09:00';
            updateStartTimeField('10:30', true);
            expect(startTimeInput.value).toBe('10:30');
        });

        test('sets start time input when empty and forceUpdate is true', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            startTimeInput.value = '';
            updateStartTimeField('10:30', true);
            expect(startTimeInput.value).toBe('10:30');
        });

        test('does nothing when form is not found', () => {
            // Remove the form temporarily
            const form = /** @type {HTMLFormElement|null} */ (document.getElementById('task-form'));
            if (form) form.remove();

            // Should not throw an error
            expect(() => updateStartTimeField('10:30')).not.toThrow();
            expect(() => updateStartTimeField('10:30', true)).not.toThrow();
        });
    });

    describe('showAlert and askConfirmation', () => {
        test('showAlert calls window.alert', () => {
            showAlert('Test Alert');
            expect(alertSpy).toHaveBeenCalledWith('Test Alert');
        });

        test('askConfirmation calls window.confirm and returns its value', () => {
            confirmSpy.mockReturnValueOnce(true);
            expect(askConfirmation('Test Confirmation')).toBe(true);
            expect(confirmSpy).toHaveBeenCalledWith('Test Confirmation');

            confirmSpy.mockReturnValueOnce(false);
            expect(askConfirmation('Test Confirmation 2')).toBe(false);
        });
    });

    describe('renderTasks', () => {
        const sampleTasks = [
            {
                description: 'Task 1',
                startTime: '09:00',
                endTime: '10:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            },
            {
                description: 'Task 2',
                startTime: '10:30',
                endTime: '11:00',
                duration: 30,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            },
            {
                description: 'Task 3',
                startTime: '11:30',
                endTime: '12:00',
                duration: 30,
                status: 'incomplete',
                editing: true,
                confirmingDelete: false
            }
        ];

        test('renders tasks correctly (view and edit modes)', () => {
            renderTasks(sampleTasks, mockTaskEventCallbacks);
            const taskListElement = document.getElementById('task-list');
            if (!taskListElement) {
                throw new Error('Task list element not found');
            }

            expect(taskListElement.children.length).toBe(sampleTasks.length);

            // Check Task 1 (view mode)
            const task1Element = taskListElement.querySelector('#view-task-0');
            if (!task1Element) {
                throw new Error('Task 1 element not found');
            }
            const task1Text = task1Element.textContent || '';
            expect(task1Text).toContain('Task 1');
            expect(task1Text).toContain(convertTo12HourTime('09:00'));

            // Check Task 2 (view mode, completed)
            const task2Element = taskListElement.querySelector('#view-task-1');
            if (!task2Element) {
                throw new Error('Task 2 element not found');
            }
            const task2Text = task2Element.textContent || '';
            expect(task2Text).toContain('Task 2');
            const lineThrough = task2Element.querySelector('.line-through');
            expect(lineThrough).not.toBeNull();
            const checkboxIcon = task2Element.querySelector('.checkbox i');
            expect(checkboxIcon?.classList.contains('fa-check-square')).toBe(true);

            // Check Task 3 (edit mode)
            const task3Form = taskListElement.querySelector('#edit-task-2');
            if (!task3Form) {
                throw new Error('Task 3 form not found');
            }
            const descriptionInput = task3Form.querySelector('input[name="description"]');
            if (!(descriptionInput instanceof HTMLInputElement)) {
                throw new Error('Description input not found or not an input element');
            }
            expect(descriptionInput.value).toBe('Task 3');
        });

        test('attaches event listeners for view mode tasks', () => {
            renderTasks([sampleTasks[0]], mockTaskEventCallbacks); // Only Task 1 (view mode)

            const task1Element = document.getElementById('view-task-0');
            if (!task1Element) {
                throw new Error('Task 1 element not found');
            }

            const checkbox = task1Element.querySelector('.checkbox');
            if (!checkbox) {
                throw new Error('Checkbox not found');
            }
            checkbox.dispatchEvent(new Event('click'));
            expect(mockTaskEventCallbacks.onCompleteTask).toHaveBeenCalledWith(0);

            const editButton = task1Element.querySelector('.btn-edit');
            if (!editButton) {
                throw new Error('Edit button not found');
            }
            editButton.dispatchEvent(new Event('click'));
            expect(mockTaskEventCallbacks.onEditTask).toHaveBeenCalledWith(0);

            const deleteButton = task1Element.querySelector('.btn-delete');
            if (!deleteButton) {
                throw new Error('Delete button not found');
            }
            deleteButton.dispatchEvent(new Event('click'));
            expect(mockTaskEventCallbacks.onDeleteTask).toHaveBeenCalledWith(0);
        });

        test('attaches event listeners for edit mode tasks', () => {
            renderTasks([sampleTasks[2]], mockTaskEventCallbacks);
            const task3Form = document.getElementById('edit-task-0');
            if (!task3Form) {
                throw new Error('Task 3 form not found');
            }

            task3Form.dispatchEvent(new Event('submit'));
            expect(mockTaskEventCallbacks.onSaveTaskEdit).toHaveBeenCalledWith(
                0,
                expect.any(FormData)
            );

            const cancelButton = task3Form.querySelector('.btn-edit-cancel');
            if (!cancelButton) {
                throw new Error('Cancel button not found');
            }
            cancelButton.dispatchEvent(new Event('click'));
            expect(mockTaskEventCallbacks.onCancelEdit).toHaveBeenCalledWith(0);
        });
    });

    describe('initializePageEventListeners', () => {
        test('task form submission calls onTaskFormSubmit', () => {
            const taskFormElement = getTaskFormElement();
            if (!taskFormElement) {
                throw new Error('Task form element not found');
            }
            taskFormElement.dispatchEvent(new Event('submit'));
            expect(mockAppCallbacks.onTaskFormSubmit).toHaveBeenCalledWith(expect.any(FormData));
        });

        test('delete all button click calls onDeleteAllTasks', () => {
            const deleteAllBtn = document.getElementById('delete-all');
            if (!deleteAllBtn) {
                throw new Error('Delete all button not found');
            }
            deleteAllBtn.dispatchEvent(new Event('click'));
            expect(mockAppCallbacks.onDeleteAllTasks).toHaveBeenCalled();
        });

        test('global click calls onGlobalClick', () => {
            document.dispatchEvent(new Event('click'));
            expect(mockAppCallbacks.onGlobalClick).toHaveBeenCalled();
        });
    });

    describe('focusTaskDescriptionInput', () => {
        test('focuses on the task description input', () => {
            const descriptionInput = document.querySelector('#task-form input[name="description"]');
            if (!(descriptionInput instanceof HTMLInputElement)) {
                throw new Error('Description input not found or not an input element');
            }
            const focusSpy = jest.spyOn(descriptionInput, 'focus');
            focusTaskDescriptionInput();
            expect(focusSpy).toHaveBeenCalled();
            focusSpy.mockRestore();
        });
    });
});

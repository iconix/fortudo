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
    askConfirmation,
    // Import specific DOM element references if needed for direct checks, though usually not
    // taskForm as dfTaskForm, // Example if needed
} from '../public/js/dom-handler.js';
import { convertTo12HourTime, calculateHoursAndMinutes } from '../public/js/utils.js'; // For verifying rendered output format

describe('DOM Handler Interaction Tests', () => {
    let mockAppCallbacks;
    let mockTaskEventCallbacks;
    let alertSpy;
    let confirmSpy;

    beforeEach(() => {
        // Set up complete HTML structure with all required classes and attributes
        document.body.innerHTML = `
            <div id="current-time"></div>
            <div id="current-date"></div>
            <form id="task-form">
                <input name="description" type="text" required />
                <input name="start-time" type="time" required />
                <input name="duration-hours" type="number" min="0" value="0" />
                <input name="duration-minutes" type="number" min="0" max="59" value="0" />
                <button type="submit">Add Task</button>
            </form>
            <div id="task-list"></div>
            <button id="delete-all" class="btn-delete-all">Delete All</button>
        `;

        // Mock callbacks
        mockAppCallbacks = {
            onTaskFormSubmit: jest.fn(),
            onDeleteAllTasks: jest.fn(),
            onGlobalClick: jest.fn(),
        };

        mockTaskEventCallbacks = {
            onCompleteTask: jest.fn(),
            onEditTask: jest.fn(),
            onDeleteTask: jest.fn(),
            onSaveTaskEdit: jest.fn(),
            onCancelEdit: jest.fn(),
        };

        alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);

        // Initialize event listeners with mock callbacks
        initializePageEventListeners(mockAppCallbacks);
    });

    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = ''; // Clean up DOM
    });

    describe('renderDateTime', () => {
        test('updates time and date elements correctly', () => {
            const fixedDate = new Date(2023, 0, 1, 10, 0); // Jan 1, 2023, 10:00:00
            const dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => fixedDate);

            try {
                renderDateTime();

                const timeElement = document.getElementById('current-time');
                const dateElement = document.getElementById('current-date');

                // Assert elements exist before using them
                expect(timeElement).not.toBeNull();
                expect(dateElement).not.toBeNull();

                if (timeElement && dateElement) {
                    expect(timeElement.textContent).toBe(fixedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                    expect(dateElement.textContent).toBe(fixedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
                }
            } finally {
                dateSpy.mockRestore();
            }
        });
    });

    describe('updateStartTimeField', () => {
        test('sets start time input if empty', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            expect(startTimeInput).not.toBeNull();
            expect(startTimeInput instanceof HTMLInputElement).toBe(true);

            if (startTimeInput instanceof HTMLInputElement) {
                startTimeInput.value = ''; // Ensure it's empty
                updateStartTimeField('10:30');
                expect(startTimeInput.value).toBe('10:30');
            }
        });

        test('does not overwrite existing start time input', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            expect(startTimeInput).not.toBeNull();
            expect(startTimeInput instanceof HTMLInputElement).toBe(true);

            if (startTimeInput instanceof HTMLInputElement) {
                startTimeInput.value = '09:00';
                updateStartTimeField('10:30');
                expect(startTimeInput.value).toBe('09:00');
            }
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
            { description: 'Task 1', startTime: '09:00', endTime: '10:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false },
            { description: 'Task 2', startTime: '10:30', endTime: '11:00', duration: 30, status: 'completed', editing: false, confirmingDelete: false },
            { description: 'Task 3', startTime: '11:30', endTime: '12:00', duration: 30, status: 'incomplete', editing: true, confirmingDelete: false },
        ];

        beforeEach(() => {
            // Ensure task list is empty before each test
            const taskList = document.getElementById('task-list');
            expect(taskList).not.toBeNull();
            if (taskList) {
                taskList.innerHTML = '';
            }
        });

        test('renders tasks correctly (view and edit modes)', () => {
            renderTasks(sampleTasks, mockTaskEventCallbacks);
            const taskListElement = document.getElementById('task-list');
            expect(taskListElement).not.toBeNull();

            if (taskListElement) {
                // Check that tasks were rendered
                expect(taskListElement.children.length).toBe(sampleTasks.length);

                // Check Task 1 (view mode)
                const task1Element = taskListElement.querySelector('#view-task-0');
                expect(task1Element).not.toBeNull();
                if (task1Element) {
                    expect(task1Element.textContent).toContain('Task 1');
                    expect(task1Element.textContent).toContain(convertTo12HourTime('09:00'));
                }

                // Check Task 2 (view mode, completed)
                const task2Element = taskListElement.querySelector('#view-task-1');
                expect(task2Element).not.toBeNull();
                if (task2Element) {
                    expect(task2Element.textContent).toContain('Task 2');
                    const lineThrough = task2Element.querySelector('.line-through');
                    expect(lineThrough).not.toBeNull();
                    const checkbox = task2Element.querySelector('.checkbox i');
                    expect(checkbox).not.toBeNull();
                    if (checkbox) {
                        expect(checkbox.classList.contains('fa-check-square')).toBe(true);
                    }
                }

                // Check Task 3 (edit mode)
                const task3Form = taskListElement.querySelector('#edit-task-2');
                expect(task3Form).not.toBeNull();
                if (task3Form) {
                    const descriptionInput = task3Form.querySelector('input[name="description"]');
                    expect(descriptionInput).not.toBeNull();
                    if (descriptionInput instanceof HTMLInputElement) {
                        expect(descriptionInput.value).toBe('Task 3');
                    }
                }
            }
        });

        test('attaches event listeners for view mode tasks', () => {
            renderTasks([sampleTasks[0]], mockTaskEventCallbacks); // Only Task 1 (view mode)

            const task1Element = document.getElementById('view-task-0');
            expect(task1Element).not.toBeNull();

            if (task1Element) {
                // Test checkbox click
                const checkbox = task1Element.querySelector('.checkbox');
                expect(checkbox).not.toBeNull();
                if (checkbox) {
                    checkbox.dispatchEvent(new Event('click', { bubbles: true }));
                    expect(mockTaskEventCallbacks.onCompleteTask).toHaveBeenCalledWith(0);
                }

                // Test edit button click
                const editButton = task1Element.querySelector('.btn-edit');
                expect(editButton).not.toBeNull();
                if (editButton) {
                    editButton.dispatchEvent(new Event('click', { bubbles: true }));
                    expect(mockTaskEventCallbacks.onEditTask).toHaveBeenCalledWith(0);
                }

                // Test delete button click
                const deleteButton = task1Element.querySelector('.btn-delete');
                expect(deleteButton).not.toBeNull();
                if (deleteButton) {
                    deleteButton.dispatchEvent(new Event('click', { bubbles: true }));
                    expect(mockTaskEventCallbacks.onDeleteTask).toHaveBeenCalledWith(0);
                }
            }
        });

        test('attaches event listeners for edit mode tasks', () => {
            renderTasks([sampleTasks[2]], mockTaskEventCallbacks); // Only Task 3 (edit mode)

            const task3Form = document.getElementById('edit-task-2');
            expect(task3Form).not.toBeNull();

            if (task3Form) {
                // Test form submission
                task3Form.dispatchEvent(new Event('submit', { bubbles: true }));
                expect(mockTaskEventCallbacks.onSaveTaskEdit).toHaveBeenCalledWith(2, expect.any(FormData));

                // Test cancel button click
                const cancelButton = task3Form.querySelector('.btn-edit-cancel');
                expect(cancelButton).not.toBeNull();
                if (cancelButton) {
                    cancelButton.dispatchEvent(new Event('click', { bubbles: true }));
                    expect(mockTaskEventCallbacks.onCancelEdit).toHaveBeenCalledWith(2);
                }
            }
        });
    });

    describe('initializePageEventListeners', () => {
        test('task form submission calls onTaskFormSubmit', () => {
            const taskFormElement = getTaskFormElement();
            expect(taskFormElement).not.toBeNull();

            if (taskFormElement) {
                taskFormElement.dispatchEvent(new Event('submit', { bubbles: true }));
                expect(mockAppCallbacks.onTaskFormSubmit).toHaveBeenCalledWith(expect.any(FormData));
            }
        });

        test('delete all button click calls onDeleteAllTasks', () => {
            const deleteAllBtn = document.getElementById('delete-all');
            expect(deleteAllBtn).not.toBeNull();

            if (deleteAllBtn) {
                deleteAllBtn.dispatchEvent(new Event('click', { bubbles: true }));
                expect(mockAppCallbacks.onDeleteAllTasks).toHaveBeenCalled();
            }
        });

        test('global click calls onGlobalClick', () => {
            document.dispatchEvent(new Event('click', { bubbles: true }));
            expect(mockAppCallbacks.onGlobalClick).toHaveBeenCalled();
        });
    });

    describe('focusTaskDescriptionInput', () => {
        test('focuses on the task description input', () => {
            const descriptionInput = document.querySelector('#task-form input[name="description"]');
            expect(descriptionInput).not.toBeNull();
            expect(descriptionInput instanceof HTMLInputElement).toBe(true);

            if (descriptionInput instanceof HTMLInputElement) {
                descriptionInput.focus = jest.fn(); // Mock focus
                focusTaskDescriptionInput();
                expect(descriptionInput.focus).toHaveBeenCalled();
            }
        });
    });
});
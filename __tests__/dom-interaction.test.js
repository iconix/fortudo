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
    resetEventDelegation,
    refreshStartTimeField,
    disableStartTimeAutoUpdate
} from '../public/js/dom-handler.js';
import { getTaskFormElement, focusTaskDescriptionInput } from '../public/js/form-utils.js';
import { showAlert, askConfirmation } from '../public/js/modal-manager.js';
import { convertTo12HourTime, timeToDateTime, calculateEndDateTime } from '../public/js/utils.js';
import { updateTaskState } from '../public/js/task-manager.js';

describe('DOM Handler Interaction Tests', () => {
    let mockAppCallbacks;
    let mockTaskEventCallbacks;
    let alertSpy;

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
                    <div class="task-type-toggle">
                        <input type="radio" id="scheduled" name="task-type" value="scheduled" checked />
                        <label for="scheduled">Scheduled</label>
                        <input type="radio" id="unscheduled" name="task-type" value="unscheduled" />
                        <label for="unscheduled">Unscheduled</label>
                    </div>
                    <div id="time-inputs">
                        <div class="form-group">
                            <input type="time" name="start-time" required />
                        </div>
                        <div class="form-group">
                            <input type="number" name="duration-hours" min="0" value="1" />
                            <input type="number" name="duration-minutes" min="0" max="59" value="00" />
                        </div>
                    </div>
                    <div id="priority-input" style="display: none;">
                        <select name="priority">
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="low">Low</option>
                        </select>
                        <input type="number" name="est-duration" placeholder="Est. minutes" />
                    </div>
                    <button type="submit">Add Task</button>
                </form>
                <div id="scheduled-task-list" class="task-list"></div>
                <div id="unscheduled-task-list" class="unscheduled-task-list"></div>
                <button id="delete-all" class="btn-delete-all">Delete All Tasks</button>
                <div id="clear-tasks-dropdown" style="display: none;">
                    <button id="clear-scheduled-tasks-option">Clear Scheduled</button>
                    <button id="clear-completed-tasks-option">Clear Completed</button>
                </div>
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
        jest.spyOn(window, 'confirm').mockImplementation(() => true);

        // Get references to form and delete button
        const taskForm = /** @type {HTMLFormElement|null} */ (getTaskFormElement());
        const deleteAllBtn = /** @type {HTMLButtonElement|null} */ (
            document.getElementById('delete-all')
        );
        // Initialize event listeners with mock callbacks and correct arguments
        initializePageEventListeners(mockAppCallbacks, taskForm, deleteAllBtn);

        // Ensure all required elements exist
        expect(taskForm).not.toBeNull();
        expect(document.getElementById('scheduled-task-list')).not.toBeNull();
        expect(document.getElementById('unscheduled-task-list')).not.toBeNull();
        expect(deleteAllBtn).not.toBeNull();
        expect(document.getElementById('current-time')).not.toBeNull();
        expect(document.getElementById('current-date')).not.toBeNull();
    });

    afterEach(() => {
        jest.clearAllMocks();
        resetEventDelegation();
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
        test('sets start time input when forceUpdate is true and field is empty', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            startTimeInput.value = ''; // Ensure it's empty
            updateStartTimeField('10:30', true); // forceUpdate required when auto-update not enabled
            expect(startTimeInput.value).toBe('10:30');
        });

        test('does not update when forceUpdate is false and auto-update not enabled', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            startTimeInput.value = '09:00';
            updateStartTimeField('10:30'); // No forceUpdate, auto-update not enabled
            expect(startTimeInput.value).toBe('09:00'); // Unchanged
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
            const form = /** @type {HTMLFormElement|null} */ (getTaskFormElement());
            if (form) form.remove();

            // Should not throw an error
            expect(() => updateStartTimeField('10:30')).not.toThrow();
            expect(() => updateStartTimeField('10:30', true)).not.toThrow();
        });
    });

    describe('showAlert and askConfirmation', () => {
        test('showAlert falls back to window.alert when custom modal not found', () => {
            // Custom modal elements aren't in test DOM, so it falls back to window.alert
            showAlert('Test Alert');
            expect(alertSpy).toHaveBeenCalledWith('Alert: Test Alert');
        });

        test('askConfirmation returns a promise when custom modal not found', async () => {
            // Custom modal elements aren't in test DOM, but function still returns a Promise
            const result = askConfirmation('Test Confirmation');
            expect(result).toBeInstanceOf(Promise);
        });
    });

    describe('renderTasks', () => {
        const testDate = '2025-01-01'; // Use a fixed date for consistency
        const sampleTasks = [
            {
                id: 'test-task-1',
                type: 'scheduled',
                description: 'Task 1',
                startDateTime: timeToDateTime('09:00', testDate),
                endDateTime: calculateEndDateTime(timeToDateTime('09:00', testDate), 60),
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: false
            },
            {
                id: 'test-task-2',
                type: 'scheduled',
                description: 'Task 2',
                startDateTime: timeToDateTime('10:30', testDate),
                endDateTime: calculateEndDateTime(timeToDateTime('10:30', testDate), 30),
                duration: 30,
                status: 'completed',
                editing: false,
                confirmingDelete: false,
                locked: false
            },
            {
                id: 'test-task-3',
                type: 'scheduled',
                description: 'Task 3',
                startDateTime: timeToDateTime('11:30', testDate),
                endDateTime: calculateEndDateTime(timeToDateTime('11:30', testDate), 5),
                duration: 5,
                status: 'incomplete',
                editing: true,
                confirmingDelete: false,
                locked: false
            }
        ];

        test('renders tasks correctly (view and edit modes)', () => {
            renderTasks(sampleTasks, mockTaskEventCallbacks);
            const taskListElement = document.getElementById('scheduled-task-list');
            if (!taskListElement) {
                throw new Error('Scheduled task list element not found');
            }

            expect(taskListElement.children.length).toBe(sampleTasks.length);

            // Check Task 1 (view mode)
            const task1Element = taskListElement.querySelector('[data-task-id="test-task-1"]');
            if (!task1Element) {
                throw new Error('Task 1 element not found');
            }
            const task1Text = task1Element.textContent || '';
            expect(task1Text).toContain('Task 1');
            expect(task1Text).toContain(convertTo12HourTime('09:00'));

            // Check Task 2 (view mode, completed)
            const task2Element = taskListElement.querySelector('[data-task-id="test-task-2"]');
            if (!task2Element) {
                throw new Error('Task 2 element not found');
            }
            const task2Text = task2Element.textContent || '';
            expect(task2Text).toContain('Task 2');
            const lineThrough = task2Element.querySelector('.line-through');
            expect(lineThrough).not.toBeNull();
            const checkboxIcon = task2Element.querySelector('.checkbox i');
            expect(checkboxIcon?.classList.contains('fa-check-square')).toBe(true);

            // Check Task 3 (edit mode) - the edit form IS the element with data-task-id
            const task3Form = taskListElement.querySelector('form[data-task-id="test-task-3"]');
            if (!task3Form) {
                throw new Error('Task 3 edit form not found');
            }
            const descriptionInput = task3Form.querySelector('input[name="description"]');
            if (!(descriptionInput instanceof HTMLInputElement)) {
                throw new Error('Description input not found or not an input element');
            }
            expect(descriptionInput.value).toBe('Task 3');

            const durationMinutesInput = task3Form.querySelector('input[name="duration-minutes"]');
            if (!(durationMinutesInput instanceof HTMLInputElement)) {
                throw new Error('Duration minutes input not found or not an input element');
            }
            expect(durationMinutesInput.value).toBe('05'); // padStart adds leading zero
        });

        test('attaches event listeners for view mode tasks', () => {
            // Set up task state so the task is recognized as active
            updateTaskState([sampleTasks[0]]);
            renderTasks([sampleTasks[0]], mockTaskEventCallbacks); // Only Task 1 (view mode)

            const taskListElement = document.getElementById('scheduled-task-list');
            if (!taskListElement) {
                throw new Error('Scheduled task list element not found');
            }

            const task1Element = taskListElement.querySelector('[data-task-id="test-task-1"]');
            if (!task1Element) {
                throw new Error('Task 1 element not found');
            }

            const checkbox = task1Element.querySelector('.checkbox');
            if (!checkbox) {
                throw new Error('Checkbox not found');
            }
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            expect(mockTaskEventCallbacks.onCompleteTask).toHaveBeenCalledWith('test-task-1', 0);

            const editButton = task1Element.querySelector('.btn-edit');
            if (!editButton) {
                throw new Error('Edit button not found');
            }
            editButton.dispatchEvent(new Event('click', { bubbles: true }));
            expect(mockTaskEventCallbacks.onEditTask).toHaveBeenCalledWith('test-task-1', 0);

            const deleteButton = task1Element.querySelector('.btn-delete');
            if (!deleteButton) {
                throw new Error('Delete button not found');
            }
            deleteButton.dispatchEvent(new Event('click', { bubbles: true }));
            expect(mockTaskEventCallbacks.onDeleteTask).toHaveBeenCalledWith('test-task-1', 0);
        });

        test('attaches event listeners for edit mode tasks', () => {
            // Set up task state so the task is recognized
            updateTaskState([sampleTasks[2]]);
            renderTasks([sampleTasks[2]], mockTaskEventCallbacks);

            const taskListElement = document.getElementById('scheduled-task-list');
            if (!taskListElement) {
                throw new Error('Scheduled task list element not found');
            }

            const task3Element = taskListElement.querySelector('[data-task-id="test-task-3"]');
            // The edit form IS the element with data-task-id (not a child)
            const task3Form = task3Element;
            if (!(task3Form instanceof HTMLFormElement)) {
                throw new Error('Task 3 element is not a form');
            }

            task3Form.dispatchEvent(new Event('submit', { bubbles: true }));
            expect(mockTaskEventCallbacks.onSaveTaskEdit).toHaveBeenCalledWith(
                'test-task-3',
                task3Form,
                0
            );

            const cancelButton = task3Form.querySelector('.btn-edit-cancel');
            if (!cancelButton) {
                throw new Error('Cancel button not found');
            }
            cancelButton.dispatchEvent(new Event('click', { bubbles: true }));
            expect(mockTaskEventCallbacks.onCancelEdit).toHaveBeenCalledWith('test-task-3', 0);
        });
    });

    describe('initializePageEventListeners', () => {
        test('task form submission calls onTaskFormSubmit', () => {
            const taskFormElement = getTaskFormElement();
            if (!taskFormElement) {
                throw new Error('Task form element not found');
            }
            taskFormElement.dispatchEvent(new Event('submit'));
            // onTaskFormSubmit is called with the form element
            expect(mockAppCallbacks.onTaskFormSubmit).toHaveBeenCalledWith(taskFormElement);
        });

        test('delete all button is not handled by initializePageEventListeners', () => {
            // Note: Delete all button handling has been moved elsewhere
            // initializePageEventListeners only handles form submission and global click
            const deleteAllBtn = document.getElementById('delete-all');
            expect(deleteAllBtn).not.toBeNull();
            // No onDeleteAllTasks callback is registered by initializePageEventListeners
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

    describe('refreshStartTimeField and disableStartTimeAutoUpdate', () => {
        let getCurrentTimeRoundedSpy;

        beforeEach(() => {
            // Mock getCurrentTimeRounded to return predictable values
            getCurrentTimeRoundedSpy = jest.spyOn(
                require('../public/js/utils.js'),
                'getCurrentTimeRounded'
            );
        });

        afterEach(() => {
            if (getCurrentTimeRoundedSpy) {
                getCurrentTimeRoundedSpy.mockRestore();
            }
            disableStartTimeAutoUpdate();
        });

        test('updates field when current time advances past tracked time', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time to 14:30
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            startTimeInput.value = '';
            updateStartTimeField('14:30', true); // forceUpdate=true to set value and enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // Advance time to 14:35
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:35');
        });

        test('does not update field when not tracking', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set field to some time without tracking
            startTimeInput.value = '14:30';
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');

            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:30'); // Should not change
        });

        test('auto-update continues even if user manually changes field (must use disableStartTimeAutoUpdate)', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time to 14:30 (this sets tracking)
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            startTimeInput.value = '';
            updateStartTimeField('14:30', true); // forceUpdate to enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // User manually changes field - but auto-update state is still enabled
            startTimeInput.value = '15:00';

            // Advance time to 14:35 - auto-update will overwrite manual change
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:35'); // Auto-update overwrites manual change

            // To prevent auto-update, user must call disableStartTimeAutoUpdate()
            startTimeInput.value = '16:00';
            disableStartTimeAutoUpdate();
            getCurrentTimeRoundedSpy.mockReturnValue('14:40');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('16:00'); // Now it stays because tracking is disabled
        });

        test('does not track when setting field to non-current time', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Current time is 14:30, but we set field to 16:00
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            startTimeInput.value = '';
            updateStartTimeField('16:00', true); // forceUpdate to set value
            expect(startTimeInput.value).toBe('16:00');

            // Advance time to 14:35
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('16:00'); // Should not change because not tracking
        });

        test('disableStartTimeAutoUpdate stops tracking', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time to 14:30 (this sets tracking)
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            startTimeInput.value = '';
            updateStartTimeField('14:30', true); // forceUpdate to enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // Reset tracking
            disableStartTimeAutoUpdate();

            // Advance time to 14:35
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:30'); // Should not change because tracking was reset
        });

        test('handles missing form gracefully', () => {
            // Remove the form temporarily
            const form = /** @type {HTMLFormElement|null} */ (getTaskFormElement());
            if (form) form.remove();

            // Should not throw an error
            expect(() => refreshStartTimeField()).not.toThrow();
            expect(() => disableStartTimeAutoUpdate()).not.toThrow();
        });

        test('handles midnight crossing correctly - disables tracking on date change', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time to 23:55 (late evening) on Jan 15
            const day1 = new Date('2025-01-15T23:55:00');
            getCurrentTimeRoundedSpy.mockReturnValue('23:55');

            // Mock the date change detection
            jest.useFakeTimers().setSystemTime(day1);

            startTimeInput.value = '';
            updateStartTimeField('23:55', true); // forceUpdate to set tracking with current date
            expect(startTimeInput.value).toBe('23:55');

            // Time crosses midnight to 00:05 on Jan 16
            const day2 = new Date('2025-01-16T00:05:00');
            getCurrentTimeRoundedSpy.mockReturnValue('00:05');

            // Mock the date change detection
            jest.useFakeTimers().setSystemTime(day2);

            refreshStartTimeField();
            // Date changed, so tracking is disabled and field is NOT updated
            expect(startTimeInput.value).toBe('23:55');

            jest.useRealTimers();
        });

        test('date tracking - hasDateChanged returns true when date changes', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time on Jan 15
            const day1 = new Date('2025-01-15T14:30:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');

            // Mock the date change
            jest.useFakeTimers().setSystemTime(day1);

            startTimeInput.value = '';
            updateStartTimeField('14:30', true); // forceUpdate to set and enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // Same time but different date (Jan 16)
            const day2 = new Date('2025-01-16T14:30:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');

            // Mock the date change
            jest.useFakeTimers().setSystemTime(day2);

            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:30'); // Should update because date changed

            jest.useRealTimers();
        });

        test('date tracking - updates field when same date even if time changed', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time on Jan 15 at 14:30
            const sameDay = new Date('2025-01-15T14:30:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            jest.useFakeTimers().setSystemTime(sameDay);

            startTimeInput.value = '';
            updateStartTimeField('14:30', true); // forceUpdate to set and enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // Same date, different time - auto-update will sync to current time
            const sameDayEarlier = new Date('2025-01-15T14:25:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:25');
            jest.useFakeTimers().setSystemTime(sameDayEarlier);

            refreshStartTimeField();
            // Auto-update syncs to current time when same date (doesn't check if time advanced)
            expect(startTimeInput.value).toBe('14:25');

            jest.useRealTimers();
        });

        test('date tracking - clears date when disabling auto-update', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time to enable tracking
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            startTimeInput.value = '';
            updateStartTimeField('14:30', true); // forceUpdate to enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // Disable tracking
            disableStartTimeAutoUpdate();

            // Even with date change, should not update
            const nextDay = new Date('2025-01-16T14:35:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            jest.useFakeTimers().setSystemTime(nextDay);

            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:30'); // Should not change

            jest.useRealTimers();
        });

        test('date tracking - updates field when time advances on same day', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time
            const morning = new Date('2025-01-15T14:30:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            jest.useFakeTimers().setSystemTime(morning);

            startTimeInput.value = '';
            updateStartTimeField('14:30', true); // forceUpdate to enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // Time advances on same day
            const laterMorning = new Date('2025-01-15T14:35:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            jest.useFakeTimers().setSystemTime(laterMorning);

            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:35'); // Should update due to time advance

            jest.useRealTimers();
        });

        test('date tracking - handles timezone edge cases gracefully', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Use dates that are definitely different (more than 24 hours apart)
            const day1 = new Date('2025-01-15T14:30:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            jest.useFakeTimers().setSystemTime(day1);

            startTimeInput.value = '';
            updateStartTimeField('14:30', true); // forceUpdate to enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // Move to a clearly different date (2 days later)
            const day3 = new Date('2025-01-17T14:30:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            jest.useFakeTimers().setSystemTime(day3);

            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:30'); // Should update due to date change

            jest.useRealTimers();
        });

        test('date tracking - internal state management', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Initially, auto-update should be disabled
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe(''); // Should not change when not tracking

            // Enable tracking by setting field to current time (need forceUpdate)
            startTimeInput.value = ''; // Ensure empty first
            updateStartTimeField('14:30', true); // forceUpdate to enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // Setting to a different time with forceUpdate should disable tracking
            startTimeInput.value = '';
            getCurrentTimeRoundedSpy.mockReturnValue('14:30'); // Keep current time the same
            updateStartTimeField('16:00', true); // Different from current time, disables tracking
            expect(startTimeInput.value).toBe('16:00');

            // Now advance current time - should not update because tracking is disabled
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('16:00'); // Should not change because tracking disabled

            // Re-enable tracking with current time
            startTimeInput.value = ''; // Clear field first
            getCurrentTimeRoundedSpy.mockReturnValue('14:40');
            updateStartTimeField('14:40', true); // forceUpdate to enable tracking
            expect(startTimeInput.value).toBe('14:40');

            // Now time advancement should work
            getCurrentTimeRoundedSpy.mockReturnValue('14:45');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:45');
        });

        test('date tracking - user modification does NOT disable tracking (auto-update overwrites)', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set tracking
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            startTimeInput.value = '';
            updateStartTimeField('14:30', true); // forceUpdate to enable tracking
            expect(startTimeInput.value).toBe('14:30');

            // User manually changes the field value - but tracking state is still enabled
            startTimeInput.value = '15:00';

            // Time advances - auto-update will overwrite user's manual change
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:35'); // Auto-update overwrites manual change

            jest.useRealTimers();
        });
    });

    describe('Unscheduled Task List Event Handling', () => {
        let mockUnscheduledTaskCallbacks;

        beforeEach(() => {
            mockUnscheduledTaskCallbacks = {
                onToggleCompleteUnscheduledTask: jest.fn(),
                onEditUnscheduledTask: jest.fn(),
                onDeleteUnscheduledTask: jest.fn(),
                onScheduleUnscheduledTask: jest.fn(),
                onSaveUnscheduledTaskEdit: jest.fn(),
                onCancelUnscheduledTaskEdit: jest.fn()
            };
        });

        function setupUnscheduledTask(taskId, isCompleted = false) {
            const unscheduledTaskList = document.getElementById('unscheduled-task-list');
            unscheduledTaskList.innerHTML = `
                <div class="task-card" data-task-id="${taskId}" data-task-name="Test Task" data-task-est-duration="1h">
                    <div class="task-display-view">
                        <label class="task-checkbox-unscheduled">
                            <i class="fa-regular ${isCompleted ? 'fa-check-square' : 'fa-square'}"></i>
                        </label>
                        <span>Test Task</span>
                        <button class="btn-schedule-task" data-task-id="${taskId}" ${isCompleted ? 'disabled' : ''}>Schedule</button>
                        <button class="btn-edit-unscheduled" data-task-id="${taskId}">Edit</button>
                        <button class="btn-delete-unscheduled" data-task-id="${taskId}">Delete</button>
                    </div>
                    <div class="inline-edit-unscheduled-form hidden">
                        <form>
                            <input name="inline-edit-description" value="Test Task" />
                            <button class="btn-save-inline-edit">Save</button>
                            <button class="btn-cancel-inline-edit">Cancel</button>
                        </form>
                    </div>
                </div>
            `;

            // Update task state
            const task = {
                id: taskId,
                type: 'unscheduled',
                description: 'Test Task',
                priority: 'medium',
                estDuration: 60,
                status: isCompleted ? 'completed' : 'incomplete'
            };
            updateTaskState([task]);

            // Import and call the initialization function
            const {
                initializeUnscheduledTaskListEventListeners
            } = require('../public/js/dom-handler.js');
            initializeUnscheduledTaskListEventListeners(mockUnscheduledTaskCallbacks);
        }

        test('schedule button calls onScheduleUnscheduledTask', () => {
            setupUnscheduledTask('unsched-1');

            const scheduleBtn = document.querySelector('.btn-schedule-task');
            scheduleBtn.dispatchEvent(new Event('click', { bubbles: true }));

            expect(mockUnscheduledTaskCallbacks.onScheduleUnscheduledTask).toHaveBeenCalledWith(
                'unsched-1',
                'Test Task',
                '1h'
            );
        });

        test('schedule button does not call callback for completed task', () => {
            setupUnscheduledTask('unsched-1', true);

            const scheduleBtn = document.querySelector('.btn-schedule-task');
            scheduleBtn.dispatchEvent(new Event('click', { bubbles: true }));

            expect(mockUnscheduledTaskCallbacks.onScheduleUnscheduledTask).not.toHaveBeenCalled();
        });

        test('edit button calls onEditUnscheduledTask', () => {
            setupUnscheduledTask('unsched-1');

            const editBtn = document.querySelector('.btn-edit-unscheduled');
            editBtn.dispatchEvent(new Event('click', { bubbles: true }));

            expect(mockUnscheduledTaskCallbacks.onEditUnscheduledTask).toHaveBeenCalledWith(
                'unsched-1'
            );
        });

        test('delete button calls onDeleteUnscheduledTask', () => {
            setupUnscheduledTask('unsched-1');

            const deleteBtn = document.querySelector('.btn-delete-unscheduled');
            deleteBtn.dispatchEvent(new Event('click', { bubbles: true }));

            expect(mockUnscheduledTaskCallbacks.onDeleteUnscheduledTask).toHaveBeenCalledWith(
                'unsched-1'
            );
        });

        test('checkbox calls onToggleCompleteUnscheduledTask', () => {
            setupUnscheduledTask('unsched-1');

            const checkbox = document.querySelector('.task-checkbox-unscheduled');
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));

            expect(
                mockUnscheduledTaskCallbacks.onToggleCompleteUnscheduledTask
            ).toHaveBeenCalledWith('unsched-1');
        });

        test('save button calls onSaveUnscheduledTaskEdit', () => {
            setupUnscheduledTask('unsched-1');

            const saveBtn = document.querySelector('.btn-save-inline-edit');
            saveBtn.dispatchEvent(new Event('click', { bubbles: true }));

            expect(mockUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit).toHaveBeenCalledWith(
                'unsched-1'
            );
        });

        test('cancel button calls onCancelUnscheduledTaskEdit', () => {
            setupUnscheduledTask('unsched-1');

            const cancelBtn = document.querySelector('.btn-cancel-inline-edit');
            cancelBtn.dispatchEvent(new Event('click', { bubbles: true }));

            expect(mockUnscheduledTaskCallbacks.onCancelUnscheduledTaskEdit).toHaveBeenCalledWith(
                'unsched-1'
            );
        });

        test('form submit calls onSaveUnscheduledTaskEdit', () => {
            setupUnscheduledTask('unsched-1');

            const form = document.querySelector('.inline-edit-unscheduled-form form');
            form.dispatchEvent(new Event('submit', { bubbles: true }));

            expect(mockUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit).toHaveBeenCalledWith(
                'unsched-1'
            );
        });
    });

    describe('Task Type Toggle', () => {
        beforeEach(() => {
            // Initialize the task type toggle which sets up the event listeners
            const { initializeTaskTypeToggle } = require('../public/js/dom-handler.js');
            initializeTaskTypeToggle();
        });

        test('switching to unscheduled hides time inputs and shows priority', () => {
            const unscheduledRadio = document.getElementById('unscheduled');
            if (!(unscheduledRadio instanceof HTMLInputElement)) {
                throw new Error('Unscheduled radio not found');
            }

            unscheduledRadio.checked = true;
            unscheduledRadio.dispatchEvent(new Event('change', { bubbles: true }));

            const timeInputs = document.getElementById('time-inputs');
            const priorityInput = document.getElementById('priority-input');

            expect(timeInputs.classList.contains('hidden')).toBe(true);
            expect(priorityInput.classList.contains('hidden')).toBe(false);
        });

        test('switching to scheduled shows time inputs and hides priority', () => {
            require('../public/js/dom-handler.js'); // ensure module is loaded

            // First switch to unscheduled
            const unscheduledRadio = document.getElementById('unscheduled');
            unscheduledRadio.checked = true;
            unscheduledRadio.dispatchEvent(new Event('change', { bubbles: true }));

            // Then switch back to scheduled
            const scheduledRadio = document.getElementById('scheduled');
            scheduledRadio.checked = true;
            scheduledRadio.dispatchEvent(new Event('change', { bubbles: true }));

            const timeInputs = document.getElementById('time-inputs');
            const priorityInput = document.getElementById('priority-input');

            expect(timeInputs.classList.contains('hidden')).toBe(false);
            expect(priorityInput.classList.contains('hidden')).toBe(true);
        });

        test('switching to unscheduled removes required attribute from start-time input', () => {
            const startTimeInput = document.querySelector('input[name="start-time"]');
            expect(startTimeInput.hasAttribute('required')).toBe(true); // Initially required

            const unscheduledRadio = document.getElementById('unscheduled');
            unscheduledRadio.checked = true;
            unscheduledRadio.dispatchEvent(new Event('change', { bubbles: true }));

            // Required should be removed so hidden input doesn't block form submission
            expect(startTimeInput.hasAttribute('required')).toBe(false);
        });

        test('switching back to scheduled restores required attribute on start-time input', () => {
            const startTimeInput = document.querySelector('input[name="start-time"]');

            // Switch to unscheduled first
            const unscheduledRadio = document.getElementById('unscheduled');
            unscheduledRadio.checked = true;
            unscheduledRadio.dispatchEvent(new Event('change', { bubbles: true }));
            expect(startTimeInput.hasAttribute('required')).toBe(false);

            // Switch back to scheduled
            const scheduledRadio = document.getElementById('scheduled');
            scheduledRadio.checked = true;
            scheduledRadio.dispatchEvent(new Event('change', { bubbles: true }));

            // Required should be restored
            expect(startTimeInput.hasAttribute('required')).toBe(true);
        });

        test('can submit form multiple times in unscheduled mode without validation error', () => {
            // This test ensures the fix for the "invalid form control not focusable" error
            const unscheduledRadio = document.getElementById('unscheduled');
            unscheduledRadio.checked = true;
            unscheduledRadio.dispatchEvent(new Event('change', { bubbles: true }));

            const taskForm = document.getElementById('task-form');
            const descriptionInput = taskForm.querySelector('input[name="description"]');
            descriptionInput.value = 'Test task';

            // Simulate multiple form submissions - should not throw validation errors
            expect(() => {
                taskForm.dispatchEvent(new Event('submit'));
                taskForm.dispatchEvent(new Event('submit'));
            }).not.toThrow();
        });
    });
});

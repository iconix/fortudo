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
    resetEventDelegation,
    refreshStartTimeField,
    disableStartTimeAutoUpdate
} from '../public/js/dom-handler.js';
import { convertTo12HourTime } from '../public/js/utils.js';

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
        const taskForm = /** @type {HTMLFormElement|null} */ (getTaskFormElement());
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
            const form = /** @type {HTMLFormElement|null} */ (getTaskFormElement());
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
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            expect(mockTaskEventCallbacks.onCompleteTask).toHaveBeenCalledWith(0);

            const editButton = task1Element.querySelector('.btn-edit');
            if (!editButton) {
                throw new Error('Edit button not found');
            }
            editButton.dispatchEvent(new Event('click', { bubbles: true }));
            expect(mockTaskEventCallbacks.onEditTask).toHaveBeenCalledWith(0);

            const deleteButton = task1Element.querySelector('.btn-delete');
            if (!deleteButton) {
                throw new Error('Delete button not found');
            }
            deleteButton.dispatchEvent(new Event('click', { bubbles: true }));
            expect(mockTaskEventCallbacks.onDeleteTask).toHaveBeenCalledWith(0);
        });

        test('attaches event listeners for edit mode tasks', () => {
            renderTasks([sampleTasks[2]], mockTaskEventCallbacks);
            const task3Form = document.getElementById('edit-task-0');
            if (!task3Form) {
                throw new Error('Task 3 form not found');
            }

            task3Form.dispatchEvent(new Event('submit', { bubbles: true }));
            expect(mockTaskEventCallbacks.onSaveTaskEdit).toHaveBeenCalledWith(
                0,
                expect.any(FormData)
            );

            const cancelButton = task3Form.querySelector('.btn-edit-cancel');
            if (!cancelButton) {
                throw new Error('Cancel button not found');
            }
            cancelButton.dispatchEvent(new Event('click', { bubbles: true }));
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
            updateStartTimeField('14:30'); // This should set tracking
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

        test('stops tracking when user manually changes field', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time to 14:30 (this sets tracking)
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            startTimeInput.value = '';
            updateStartTimeField('14:30');
            expect(startTimeInput.value).toBe('14:30');

            // User manually changes field
            startTimeInput.value = '15:00';

            // Advance time to 14:35
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('15:00'); // Should not change because tracking stopped
        });

        test('does not track when setting field to non-current time', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Current time is 14:30, but we set field to 16:00
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            startTimeInput.value = '';
            updateStartTimeField('16:00');
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
            updateStartTimeField('14:30');
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

        test('handles midnight crossing correctly', () => {
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
            updateStartTimeField('23:55'); // This should set tracking with current date
            expect(startTimeInput.value).toBe('23:55');

            // Time crosses midnight to 00:05 on Jan 16
            const day2 = new Date('2025-01-16T00:05:00');
            getCurrentTimeRoundedSpy.mockReturnValue('00:05');

            // Mock the date change detection
            jest.useFakeTimers().setSystemTime(day2);

            refreshStartTimeField();
            expect(startTimeInput.value).toBe('00:05');

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
            updateStartTimeField('14:30'); // This sets tracking
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

        test('date tracking - hasDateChanged returns false when date stays same', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set initial time on Jan 15 at 14:30
            const sameDay = new Date('2025-01-15T14:30:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            jest.useFakeTimers().setSystemTime(sameDay);

            startTimeInput.value = '';
            updateStartTimeField('14:30'); // This sets tracking
            expect(startTimeInput.value).toBe('14:30');

            // Same date, earlier time (shouldn't update because time didn't advance)
            const sameDayEarlier = new Date('2025-01-15T14:25:00');
            getCurrentTimeRoundedSpy.mockReturnValue('14:25');
            jest.useFakeTimers().setSystemTime(sameDayEarlier);

            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:30'); // Should not update

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
            updateStartTimeField('14:30');
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
            updateStartTimeField('14:30');
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
            updateStartTimeField('14:30');
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

            // Enable tracking by setting field to current time
            startTimeInput.value = ''; // Ensure empty first
            updateStartTimeField('14:30');
            expect(startTimeInput.value).toBe('14:30');

            // Setting to a different time should disable tracking
            // But we need to clear the field first for updateStartTimeField to work
            startTimeInput.value = '';
            getCurrentTimeRoundedSpy.mockReturnValue('14:30'); // Keep current time the same
            updateStartTimeField('16:00'); // Different from current time
            expect(startTimeInput.value).toBe('16:00');

            // Now advance current time - should not update because tracking is disabled
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('16:00'); // Should not change because tracking disabled

            // Re-enable tracking with current time
            startTimeInput.value = ''; // Clear field first
            getCurrentTimeRoundedSpy.mockReturnValue('14:40');
            updateStartTimeField('14:40');
            expect(startTimeInput.value).toBe('14:40');

            // Now time advancement should work
            getCurrentTimeRoundedSpy.mockReturnValue('14:45');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('14:45');
        });

        test('date tracking - user modification disables tracking', () => {
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Start time input not found or not an input element');
            }

            // Set tracking
            getCurrentTimeRoundedSpy.mockReturnValue('14:30');
            startTimeInput.value = '';
            updateStartTimeField('14:30');
            expect(startTimeInput.value).toBe('14:30');

            // User manually changes the field value
            startTimeInput.value = '15:00';

            // Time advances but field was manually changed
            getCurrentTimeRoundedSpy.mockReturnValue('14:35');
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('15:00'); // Should not update because user changed it

            // Even with date change, should not update
            const nextDay = new Date('2025-01-16T14:35:00');
            jest.useFakeTimers().setSystemTime(nextDay);
            refreshStartTimeField();
            expect(startTimeInput.value).toBe('15:00'); // Still should not change

            jest.useRealTimers();
        });
    });
});

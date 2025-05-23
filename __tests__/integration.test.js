/**
 * @jest-environment jsdom
 */

// This file contains integration tests for fortudo
// These tests focus on multiple components working together

// Import common test setup & new modules
const { setupIntegrationTestEnvironment } = require('./test-utils');
import { saveTasks } from '../public/js/storage.js';
import { calculateHoursAndMinutes, convertTo12HourTime } from '../public/js/utils.js'; // For assertions

const mockSaveTasks = jest.fn();
jest.mock('../public/js/storage.js', () => ({
    saveTasks: (...args) => mockSaveTasks(...args)
}));

// Helper function to fill and submit the main task form
async function addTaskDOM(description, startTime, durationHours, durationMinutes) {
    const form = document.getElementById('task-form');
    if (!form) throw new Error('Task form not found');

    const descriptionInput = form.querySelector('input[name="description"]');
    const startTimeInput = form.querySelector('input[name="start-time"]');
    const durationHoursInput = form.querySelector('input[name="duration-hours"]');
    const durationMinutesInput = form.querySelector('input[name="duration-minutes"]');

    if (!descriptionInput || !startTimeInput || !durationHoursInput || !durationMinutesInput) {
        throw new Error('Required form inputs not found');
    }

    // Ensure inputs are HTMLInputElement instances
    if (!(descriptionInput instanceof HTMLInputElement) ||
        !(startTimeInput instanceof HTMLInputElement) ||
        !(durationHoursInput instanceof HTMLInputElement) ||
        !(durationMinutesInput instanceof HTMLInputElement)) {
        throw new Error('Form inputs must be HTMLInputElement instances');
    }

    descriptionInput.value = description;
    startTimeInput.value = startTime;
    durationHoursInput.value = durationHours.toString();
    durationMinutesInput.value = durationMinutes.toString();

    // Ensure the form has the required classes and attributes
    form.classList.add('task-form');
    descriptionInput.classList.add('task-description');
    startTimeInput.classList.add('task-start-time');
    durationHoursInput.classList.add('task-duration-hours');
    durationMinutesInput.classList.add('task-duration-minutes');

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    // Wait for microtasks (e.g., promises in event handlers) to resolve
    await new Promise(resolve => setTimeout(resolve, 0));
}

// Helper function to parse rendered tasks from the DOM
function getRenderedTasksDOM() {
    const taskElements = document.querySelectorAll('#task-list > div[id^="view-task-"]');
    return Array.from(taskElements).map(taskElement => {
        const descriptionEl = taskElement.querySelector('.task-description');
        const timeEl = taskElement.querySelector('.task-time');
        const checkbox = taskElement.querySelector('.checkbox');
        const editButton = taskElement.querySelector('.btn-edit');
        const deleteButton = taskElement.querySelector('.btn-delete');

        const description = descriptionEl ? descriptionEl.textContent : '';
        const timeText = timeEl ? timeEl.textContent || '' : ''; // e.g., "9:00 AM – 10:00 AM (1h)"

        // Extract start, end, and duration from timeText
        let startTime12 = '', endTime12 = '', durationText = '';
        const match = timeText.match(/(.*) – (.*) \((.*)\)/);
        if (match) {
            startTime12 = match[1];
            endTime12 = match[2];
            durationText = match[3];
        }

        // Check if checkbox is an HTMLInputElement
        const isCompleted = checkbox instanceof HTMLInputElement ? checkbox.checked : false;

        return {
            description,
            startTime12, // In 12-hour format as rendered
            endTime12,   // In 12-hour format as rendered
            durationText,
            isCompleted,
            isEditing: taskElement.querySelector('.edit-task-form') !== null,
            isConfirmingDelete: deleteButton ? deleteButton.classList.contains('confirming') : false,
        };
    });
}

// Helper to click edit button and fill/submit the edit form
async function updateTaskDOM(index, newDescription, newStartTime, newDurationHours, newDurationMinutes) {
    const editButton = document.querySelector(`#view-task-${index} .btn-edit`);
    if (!editButton) throw new Error(`Edit button for task ${index} not found`);
    editButton.dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0)); // Allow DOM to update with edit form

    const editForm = document.getElementById(`edit-task-${index}`);
    if (!editForm) throw new Error(`Edit form for task ${index} not found`);

    const descriptionInput = editForm.querySelector('input[name="description"]');
    const startTimeInput = editForm.querySelector('input[name="start-time"]');
    const durationHoursInput = editForm.querySelector('input[name="duration-hours"]');
    const durationMinutesInput = editForm.querySelector('input[name="duration-minutes"]');

    if (!descriptionInput || !startTimeInput || !durationHoursInput || !durationMinutesInput) {
        throw new Error('Required edit form inputs not found');
    }

    // Ensure inputs are HTMLInputElement instances
    if (!(descriptionInput instanceof HTMLInputElement) ||
        !(startTimeInput instanceof HTMLInputElement) ||
        !(durationHoursInput instanceof HTMLInputElement) ||
        !(durationMinutesInput instanceof HTMLInputElement)) {
        throw new Error('Form inputs must be HTMLInputElement instances');
    }

    // Ensure the form has the required classes and attributes
    editForm.classList.add('edit-task-form');
    descriptionInput.classList.add('task-description');
    startTimeInput.classList.add('task-start-time');
    durationHoursInput.classList.add('task-duration-hours');
    durationMinutesInput.classList.add('task-duration-minutes');

    descriptionInput.value = newDescription;
    startTimeInput.value = newStartTime;
    durationHoursInput.value = newDurationHours.toString();
    durationMinutesInput.value = newDurationMinutes.toString();

    editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
}


describe('Integration Tests via DOM Interaction', () => {
    beforeEach(async () => {
        // Set up a fresh DOM and app instance for each test
        await setupIntegrationTestEnvironment();
    });

    afterEach(() => {
        jest.clearAllMocks();
        mockSaveTasks.mockReset();
        // localStorage is typically cleared by setupMockLocalStorage in setupIntegrationTestEnvironment
    });

    describe('Auto-rescheduling Tests', () => {
        test('handles cascading rescheduling of multiple tasks when updating a task', async () => {
            window.confirm = jest.fn().mockReturnValue(true); // Auto-confirm any overlap dialogs

            await addTaskDOM('First Task', '09:00', 1, 0);  // 09:00 - 10:00
            await addTaskDOM('Second Task', '10:00', 1, 0); // 10:00 - 11:00
            await addTaskDOM('Third Task', '11:00', 1, 0);  // 11:00 - 12:00
            expect(mockSaveTasks).toHaveBeenCalledTimes(3);

            // Update the first task to overlap with the second, causing a cascade
            // Original: First Task 09:00 - 10:00 (60min)
            // Update:   First Task 09:00 - 10:30 (90min)
            await updateTaskDOM(0, 'First Task Updated', '09:00', 1, 30);
            expect(mockSaveTasks).toHaveBeenCalledTimes(3 + 1); // 1 more for the update

            const renderedTasks = getRenderedTasksDOM();
            expect(renderedTasks.length).toBe(3);

            // Task 1 (updated): 09:00 - 10:30
            expect(renderedTasks[0].description).toBe('First Task Updated');
            expect(renderedTasks[0].startTime12).toBe(convertTo12HourTime('09:00'));
            expect(renderedTasks[0].endTime12).toBe(convertTo12HourTime('10:30'));
            expect(renderedTasks[0].durationText).toBe(calculateHoursAndMinutes(90));

            // Task 2 (pushed back): 10:30 - 11:30
            expect(renderedTasks[1].description).toBe('Second Task');
            expect(renderedTasks[1].startTime12).toBe(convertTo12HourTime('10:30'));
            expect(renderedTasks[1].endTime12).toBe(convertTo12HourTime('11:30'));
            expect(renderedTasks[1].durationText).toBe(calculateHoursAndMinutes(60));

            // Task 3 (pushed back): 11:30 - 12:30
            expect(renderedTasks[2].description).toBe('Third Task');
            expect(renderedTasks[2].startTime12).toBe(convertTo12HourTime('11:30'));
            expect(renderedTasks[2].endTime12).toBe(convertTo12HourTime('12:30'));
            expect(renderedTasks[2].durationText).toBe(calculateHoursAndMinutes(60));

            expect(window.confirm).toHaveBeenCalled(); // Overlap confirmation by app.js
        });

        test('preserves task order and cascades rescheduling through subsequent tasks after late completion', async () => {
            window.confirm = jest.fn().mockReturnValue(true);

            await addTaskDOM('Task A', '09:00', 0, 30); // 09:00 - 09:30
            await addTaskDOM('Task B', '10:00', 1, 0);  // 10:00 - 11:00
            await addTaskDOM('Task C', '13:00', 0, 15); // 13:00 - 13:15
            expect(mockSaveTasks).toHaveBeenCalledTimes(3);

            let tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Task A');
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:00'));
            expect(tasks[1].description).toBe('Task B');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('10:00'));
            expect(tasks[2].description).toBe('Task C');
            expect(tasks[2].startTime12).toBe(convertTo12HourTime('13:00'));

            // Add Task D that conflicts with Task A and B (if A wasn't there)
            await addTaskDOM('Task D', '09:00', 1, 0); // 09:00 - 10:00
            expect(mockSaveTasks).toHaveBeenCalledTimes(4);

            tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(4);
            // Expected: D (09:00-10:00), A (10:00-10:30), B (10:30-11:30), C (13:00-13:15)
            expect(tasks[0].description).toBe('Task D');
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:00'));
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('10:00'));

            expect(tasks[1].description).toBe('Task A');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('10:00'));
            expect(tasks[1].endTime12).toBe(convertTo12HourTime('10:30'));

            expect(tasks[2].description).toBe('Task B');
            expect(tasks[2].startTime12).toBe(convertTo12HourTime('10:30'));
            expect(tasks[2].endTime12).toBe(convertTo12HourTime('11:30'));

            expect(tasks[3].description).toBe('Task C'); // Should be unaffected by initial add of D
            expect(tasks[3].startTime12).toBe(convertTo12HourTime('13:00'));

            // Simulate completing Task D (index 0) late at 1:00 PM (13:00)
            const timeElement = document.getElementById('current-time');
            if (!timeElement) throw new Error('Current time element not found');
            timeElement.textContent = '1:00 PM'; // Set current time for completion

            const taskDCheckbox = document.querySelector('#view-task-0 .checkbox');
            if (!taskDCheckbox) throw new Error('Task D checkbox not found');
            taskDCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0)); // allow async operations to settle

            // Expected: D (09:00-13:00, completed), A (13:00-13:30), B (13:30-14:30), C (14:30-14:45)
            tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Task D');
            expect(tasks[0].isCompleted).toBe(true);
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:00'));
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('13:00'));
            expect(tasks[0].durationText).toBe(calculateHoursAndMinutes(240)); // 4 hours

            expect(tasks[1].description).toBe('Task A');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('13:00'));
            expect(tasks[1].endTime12).toBe(convertTo12HourTime('13:30'));

            expect(tasks[2].description).toBe('Task B');
            expect(tasks[2].startTime12).toBe(convertTo12HourTime('13:30'));
            expect(tasks[2].endTime12).toBe(convertTo12HourTime('14:30'));

            expect(tasks[3].description).toBe('Task C');
            expect(tasks[3].startTime12).toBe(convertTo12HourTime('14:30'));
            expect(tasks[3].endTime12).toBe(convertTo12HourTime('14:45'));
        });

        test('only reschedules affected tasks when a task is completed late', async () => {
            window.confirm = jest.fn().mockReturnValue(true);

            await addTaskDOM('Task A', '09:00', 1, 0);  // 09:00 - 10:00
            await addTaskDOM('Task B', '11:00', 0, 30); // 11:00 - 11:30
            await addTaskDOM('Task C', '13:00', 1, 0);  // 13:00 - 14:00
            expect(mockSaveTasks).toHaveBeenCalledTimes(3);

            // Simulate current time of 12:30 PM for late completion of Task A
            const timeElement = document.getElementById('current-time');
            if (!timeElement) throw new Error('Current time element not found');
            timeElement.textContent = '12:30 PM';

            // Complete Task A (index 0)
            const taskACheckbox = document.querySelector('#view-task-0 .checkbox');
            if (!taskACheckbox) throw new Error('Task A checkbox not found');
            taskACheckbox.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));

            const tasks = getRenderedTasksDOM();
            // Expected: A (09:00-12:30, completed), B (12:30-13:00), C (13:00-14:00, unchanged initially by A's completion, but then pushed by B)
            // Actually, C should be pushed by B if B is pushed by A.
            // A: 09:00 - 12:30 (duration 3h 30m = 210m)
            // B: 12:30 - 13:00 (duration 30m)
            // C: 13:00 - 14:00 (duration 60m) -> this is fine if B ends at 13:00

            expect(tasks[0].description).toBe('Task A');
            expect(tasks[0].isCompleted).toBe(true);
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:00'));
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('12:30'));
            expect(tasks[0].durationText).toBe(calculateHoursAndMinutes(210));

            expect(tasks[1].description).toBe('Task B');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('12:30'));
            expect(tasks[1].endTime12).toBe(convertTo12HourTime('13:00'));

            expect(tasks[2].description).toBe('Task C');
            // Task C's start time should remain 13:00 if Task B now ends at 13:00
            expect(tasks[2].startTime12).toBe(convertTo12HourTime('13:00'));
            expect(tasks[2].endTime12).toBe(convertTo12HourTime('14:00'));
        });

        test('reschedules subsequent tasks when a task duration is increased', async () => {
            window.confirm = jest.fn().mockReturnValue(true); // For overlap confirmation

            await addTaskDOM('Task 1', '09:00', 1, 0); // 09:00 - 10:00
            await addTaskDOM('Task 2', '10:00', 1, 0); // 10:00 - 11:00
            expect(mockSaveTasks).toHaveBeenCalledTimes(2);

            // Update Task 1 to be 09:00 - 10:30 (90 min)
            await updateTaskDOM(0, 'Task 1 Updated', '09:00', 1, 30);
            expect(mockSaveTasks).toHaveBeenCalledTimes(3);

            const tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Task 1 Updated');
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('10:30'));

            expect(tasks[1].description).toBe('Task 2');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('10:30')); // Pushed back
            expect(tasks[1].endTime12).toBe(convertTo12HourTime('11:30'));
        });
    });

    describe('Complete Task Workflow', () => {
        test('task workflow: add, update, complete, delete', async () => {
            window.confirm = jest.fn().mockReturnValue(true); // Auto-confirm any dialogs

            // 1. Add a new task
            await addTaskDOM('Task Workflow Test', '09:00', 1, 0);
            expect(mockSaveTasks).toHaveBeenCalledTimes(1);
            let tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(1);
            expect(tasks[0].description).toBe('Task Workflow Test');
            expect(tasks[0].isCompleted).toBe(false);

            // 2. Update the task
            await updateTaskDOM(0, 'Updated Task', '09:30', 1, 0); // 09:30 - 10:30
            expect(mockSaveTasks).toHaveBeenCalledTimes(2);
            tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Updated Task');
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:30'));

            // 3. Complete the task
            const timeElement = document.getElementById('current-time');
            if (!timeElement) throw new Error('Current time element not found');
            timeElement.textContent = '10:15 AM'; // Current time for completion

            const taskCheckbox = document.querySelector('#view-task-0 .checkbox');
            if (!taskCheckbox) throw new Error('Task checkbox not found');
            taskCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockSaveTasks).toHaveBeenCalledTimes(3);

            tasks = getRenderedTasksDOM();
            expect(tasks[0].isCompleted).toBe(true);
            // Check if end time was adjusted (original end 10:30, completed 10:15)
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('10:15'));

            // 4. Delete the task
            let deleteButton = document.querySelector('#view-task-0 .btn-delete');
            if (!deleteButton) throw new Error('Delete button not found');
            deleteButton.dispatchEvent(new Event('click', { bubbles: true })); // First click
            await new Promise(resolve => setTimeout(resolve, 0));

            tasks = getRenderedTasksDOM();
            expect(tasks[0].isConfirmingDelete).toBe(true); // Check confirm state in DOM

            deleteButton = document.querySelector(`#view-task-0 .btn-delete`);
            if (!deleteButton) throw new Error('Delete button not found after confirmation');
            deleteButton.dispatchEvent(new Event('click', { bubbles: true })); // Second click
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(mockSaveTasks).toHaveBeenCalledTimes(5);

            tasks = getRenderedTasksDOM();
            expect(tasks.find(t => t.description === 'Task Workflow Test')).toBeUndefined();
        });
    });

    describe('Edge Case Tests', () => {
        test('does not reschedule completed tasks when adding a new overlapping task', async () => {
            window.confirm = jest.fn().mockReturnValue(true);

            await addTaskDOM('Completed Task', '09:00', 1, 0); // 09:00 - 10:00
            // Manually mark as completed for this test setup
            const taskCheckbox = document.querySelector('#view-task-0 .checkbox');
            if (!taskCheckbox) throw new Error('Task checkbox not found');
            taskCheckbox.dispatchEvent(new Event('click', { bubbles: true })); // Simulate click to complete
            await new Promise(resolve => setTimeout(resolve, 0)); // Wait for re-render and save

            let tasks = getRenderedTasksDOM();
            expect(tasks[0].isCompleted).toBe(true);
            const saveCountBeforeNewTask = mockSaveTasks.mock.calls.length;

            await addTaskDOM('New Task', '09:30', 1, 0); // 09:30 - 10:30 (overlaps completed)
            expect(mockSaveTasks).toHaveBeenCalledTimes(saveCountBeforeNewTask + 1);

            tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Completed Task');
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:00')); // Should not change
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('10:00'));   // Should not change

            expect(tasks[1].description).toBe('New Task');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('09:30')); // Added as is
        });

        test('skips tasks being edited during rescheduling', async () => {
            window.confirm = jest.fn().mockReturnValue(true);

            await addTaskDOM('Task 1', '09:00', 1, 0); // 09:00 - 10:00
            await addTaskDOM('Task 2 (Editing)', '10:00', 1, 0); // 10:00 - 11:00
            await addTaskDOM('Task 3', '11:00', 1, 0); // 11:00 - 12:00

            // Manually trigger edit mode for Task 2 (index 1) via DOM
            const editButtonTask2 = document.querySelector('#view-task-1 .btn-edit');
            if (!editButtonTask2) throw new Error('Edit button for Task 2 not found');
            editButtonTask2.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0)); // allow edit form to render

            const saveCountBeforeUpdate = mockSaveTasks.mock.calls.length;

            // Update Task 1 to overlap with Task 2 (which is editing)
            // Task 1 new duration: 1h 30m (09:00 - 10:30)
            await updateTaskDOM(0, 'Task 1 Updated', '09:00', 1, 30);
            expect(mockSaveTasks).toHaveBeenCalledTimes(saveCountBeforeUpdate + 1);

            const tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Task 1 Updated');
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('10:30'));

            // Task 2 (editing) should remain unchanged because it was in edit mode during reschedule
            // Its visual representation will be an edit form, so getRenderedTasksDOM won't find it as a "view" task.
            // We need to check the DOM for the edit form of task 2.
            const task2EditForm = document.getElementById('edit-task-1');
            if (!task2EditForm) throw new Error('Task 2 edit form not found');

            const startTimeInput = task2EditForm.querySelector('input[name="start-time"]');
            if (!startTimeInput || !(startTimeInput instanceof HTMLInputElement)) {
                throw new Error('Task 2 start time input not found or not an input element');
            }
            expect(startTimeInput.value).toBe('10:00');

            // Task 3 should be pushed by Task 1 (Updated)
            const task3 = tasks.find(t => t.description === 'Task 3');
            if (!task3) throw new Error('Task 3 not found in rendered tasks');
            expect(task3.startTime12).toBe(convertTo12HourTime('10:30'));
        });
    });
});
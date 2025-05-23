/**
 * @jest-environment jsdom
 */

// Mock storage BEFORE any imports to ensure the mock is set up correctly
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    loadTasks: jest.fn(() => [])
})); // Mock storage to check saveTasks calls

// This file contains integration tests for fortudo
// These tests focus on multiple components working together

const { setupIntegrationTestEnvironment } = require('./test-utils');
import { saveTasks } from '../public/js/storage.js';
import { calculateHoursAndMinutes, convertTo12HourTime } from '../public/js/utils.js'; // For assertions

// Helper function to fill and submit the main task form
async function addTaskDOM(description, startTime, durationHours, durationMinutes) {
    const form = document.getElementById('task-form');
    if (!form) throw new Error('Task form not found');

    const descriptionInput = form.querySelector('input[name="description"]');
    const startTimeInput = form.querySelector('input[name="start-time"]');
    const durationHoursInput = form.querySelector('input[name="duration-hours"]');
    const durationMinutesInput = form.querySelector('input[name="duration-minutes"]');

    if (!(descriptionInput instanceof HTMLInputElement)) throw new Error('Description input not found');
    if (!(startTimeInput instanceof HTMLInputElement)) throw new Error('Start time input not found');
    if (!(durationHoursInput instanceof HTMLInputElement)) throw new Error('Duration hours input not found');
    if (!(durationMinutesInput instanceof HTMLInputElement)) throw new Error('Duration minutes input not found');

    descriptionInput.value = description;
    startTimeInput.value = startTime;
    durationHoursInput.value = durationHours.toString();
    durationMinutesInput.value = durationMinutes.toString();

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    // wait for microtasks (e.g., promises in event handlers) to resolve
    await new Promise(resolve => setTimeout(resolve, 0));
}

// Helper function to parse rendered tasks from the DOM
function getRenderedTasksDOM() {
    const taskElements = document.querySelectorAll('#task-list > div[id^="view-task-"]');
    return Array.from(taskElements).map(taskElement => {
        // Based on renderViewTaskHTML structure:
        // <div class="flex items-center space-x-4">
        //   <label>...</label>
        //   <input>...</input>
        //   <div class="...">
        //     <div class="...">${task.description}</div>
        //     <div class="...">${time and duration}</div>
        //   </div>
        // </div>

        const contentDiv = taskElement.querySelector('.flex.items-center.space-x-4 > div:last-child');
        if (!contentDiv) {
            console.warn('Could not find content div for task element:', taskElement);
            return { description: '', startTime12: '', endTime12: '', durationText: '', isCompleted: false, isEditing: false, isConfirmingDelete: false };
        }

        const descriptionDiv = contentDiv.querySelector('div:first-child');
        const timeDiv = contentDiv.querySelector('div:last-child');

        const description = descriptionDiv ? descriptionDiv.textContent?.trim() || '' : '';
        const timeText = timeDiv ? timeDiv.textContent?.trim() || '' : ''; // e.g., "9:00 AM – 10:00 AM (1h)"

        // Extract start, end, and duration from timeText
        // Handle both regular dash (–) and HTML entity (&ndash;)
        let startTime12 = '', endTime12 = '', durationText = '';
        const match = timeText.match(/(.*?)\s*[–—-]\s*(.*?)\s*\((.*?)\)/);
        if (match) {
            startTime12 = match[1].trim();
            endTime12 = match[2].trim();
            durationText = match[3].trim();
        }

        return {
            description,
            startTime12, // In 12-hour format as rendered
            endTime12,   // In 12-hour format as rendered
            durationText,
            isCompleted: taskElement.querySelector('.line-through') !== null,
            isEditing: false, // This helper won't see edit forms directly unless enhanced
            isConfirmingDelete: taskElement.querySelector('.fa-check-circle') !== null,
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

    if (!(descriptionInput instanceof HTMLInputElement)) throw new Error('Edit description input not found');
    if (!(startTimeInput instanceof HTMLInputElement)) throw new Error('Edit start time input not found');
    if (!(durationHoursInput instanceof HTMLInputElement)) throw new Error('Edit duration hours input not found');
    if (!(durationMinutesInput instanceof HTMLInputElement)) throw new Error('Edit duration minutes input not found');

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
        // Clear the initial saveTasks call that happens during app setup (setTasks call in app.js)
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Auto-rescheduling Tests', () => {
        test('handles cascading rescheduling of multiple tasks when updating a task', async () => {
            window.confirm = jest.fn().mockReturnValue(true); // Auto-confirm any overlap dialogs

            // Initial setup: Add 3 tasks
            await addTaskDOM('First Task', '09:00', 1, 0);  // Task 0: 09:00 - 10:00 -> saveTasks #1
            await addTaskDOM('Second Task', '10:00', 1, 0); // Task 1: 10:00 - 11:00 -> saveTasks #2
            await addTaskDOM('Third Task', '11:00', 1, 0);  // Task 2: 11:00 - 12:00 -> saveTasks #3
            expect(saveTasks).toHaveBeenCalledTimes(3);
            jest.clearAllMocks();

            // Update the first task (index 0) to overlap with the second, causing a cascade
            // Original: First Task 09:00 - 10:00 (60min)
            // Update:   First Task 09:00 - 10:30 (90min)
            await updateTaskDOM(0, 'First Task Updated', '09:00', 1, 30); // -> saveTasks #1 (for this step)
            expect(saveTasks).toHaveBeenCalledTimes(1);

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

            // TODO: expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('overlap'));
        });

        test('preserves task order and cascades rescheduling through subsequent tasks after late completion', async () => {
            // setup window.confirm mock to always return true for any confirmation dialogs
            // this is essential because addTask and autoReschedule ask for confirmation
            window.confirm = jest.fn().mockReturnValue(true);

            await addTaskDOM('Task A', '09:00', 0, 30);
            await addTaskDOM('Task B', '10:00', 1, 0);
            await addTaskDOM('Task C', '13:00', 0, 15);
            expect(saveTasks).toHaveBeenCalledTimes(3);
            jest.clearAllMocks();

            let tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Task A');
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:00'));
            expect(tasks[1].description).toBe('Task B');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('10:00'));
            expect(tasks[2].description).toBe('Task C');
            expect(tasks[2].startTime12).toBe(convertTo12HourTime('13:00'));

            await addTaskDOM('Task D', '09:00', 1, 0);
            expect(saveTasks).toHaveBeenCalledTimes(1);
            jest.clearAllMocks();

            tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(4);
            expect(tasks[0].description).toBe('Task D');
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:00'));
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('10:00'));

            expect(tasks[1].description).toBe('Task A');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('10:00'));
            expect(tasks[1].endTime12).toBe(convertTo12HourTime('10:30'));

            expect(tasks[2].description).toBe('Task B');
            expect(tasks[2].startTime12).toBe(convertTo12HourTime('10:30'));
            expect(tasks[2].endTime12).toBe(convertTo12HourTime('11:30'));

            expect(tasks[3].description).toBe('Task C');
            expect(tasks[3].startTime12).toBe(convertTo12HourTime('13:00'));

            const timeElement = document.getElementById('current-time');
            if (!timeElement) throw new Error('Current time element not found');
            timeElement.textContent = '1:00 PM';

            const taskDCheckbox = document.querySelector('#view-task-0 .checkbox');
            if (!taskDCheckbox) throw new Error('Task D checkbox not found');
            taskDCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(saveTasks).toHaveBeenCalledTimes(1);
            jest.clearAllMocks();

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

            await addTaskDOM('Task A', '09:00', 1, 0);
            await addTaskDOM('Task B', '11:00', 0, 30);
            await addTaskDOM('Task C', '13:00', 1, 0);
            expect(saveTasks).toHaveBeenCalledTimes(3);
            jest.clearAllMocks();

            const timeElement = document.getElementById('current-time');
            if (!timeElement) throw new Error('Current time element not found');
            timeElement.textContent = '12:30 PM';

            const taskACheckbox = document.querySelector('#view-task-0 .checkbox');
            if (!taskACheckbox) throw new Error('Task A checkbox not found');
            taskACheckbox.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(saveTasks).toHaveBeenCalledTimes(1);

            const tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Task A');
            expect(tasks[0].isCompleted).toBe(true);
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:00'));
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('12:30'));
            expect(tasks[0].durationText).toBe(calculateHoursAndMinutes(210));

            expect(tasks[1].description).toBe('Task B');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('12:30'));
            expect(tasks[1].endTime12).toBe(convertTo12HourTime('13:00'));

            expect(tasks[2].description).toBe('Task C');
            expect(tasks[2].startTime12).toBe(convertTo12HourTime('13:00'));
            expect(tasks[2].endTime12).toBe(convertTo12HourTime('14:00'));
        });

        test('reschedules subsequent tasks when a task duration is increased', async () => {
            window.confirm = jest.fn().mockReturnValue(true); // For overlap confirmation

            await addTaskDOM('Task 1', '09:00', 1, 0);
            await addTaskDOM('Task 2', '10:00', 1, 0);
            expect(saveTasks).toHaveBeenCalledTimes(2);
            jest.clearAllMocks();

            await updateTaskDOM(0, 'Task 1 Updated', '09:00', 1, 30);
            expect(saveTasks).toHaveBeenCalledTimes(1);

            const tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Task 1 Updated');
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('10:30'));

            expect(tasks[1].description).toBe('Task 2');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('10:30'));
            expect(tasks[1].endTime12).toBe(convertTo12HourTime('11:30'));
        });
    });

    describe('Complete Task Workflow', () => {
        test('task workflow: add, update, complete, delete', async () => {
            window.confirm = jest.fn().mockReturnValue(true); // Auto-confirm any dialogs

            await addTaskDOM('Task Workflow Test', '09:00', 1, 0);
            expect(saveTasks).toHaveBeenCalledTimes(1);
            let tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(1);
            expect(tasks[0].description).toBe('Task Workflow Test');
            expect(tasks[0].isCompleted).toBe(false);

            await updateTaskDOM(0, 'Updated Task', '09:30', 1, 0);
            expect(saveTasks).toHaveBeenCalledTimes(2);
            tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Updated Task');
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:30'));

            const timeElement = document.getElementById('current-time');
            if (!timeElement) throw new Error('Current time element not found');
            timeElement.textContent = '10:15 AM';

            const taskCheckbox = document.querySelector('#view-task-0 .checkbox');
            if (!taskCheckbox) throw new Error('Task checkbox not found');
            taskCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(saveTasks).toHaveBeenCalledTimes(3);

            tasks = getRenderedTasksDOM();
            expect(tasks[0].isCompleted).toBe(true);
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('10:15'));

            await addTaskDOM('To Delete', '14:00', 0, 30);
            expect(saveTasks).toHaveBeenCalledTimes(4);
            tasks = getRenderedTasksDOM();
            const deleteIndex = tasks.findIndex(t => t.description === 'To Delete');

            let deleteButton = document.querySelector(`#view-task-${deleteIndex} .btn-delete`);
            if (!deleteButton) throw new Error('Delete button not found');
            deleteButton.dispatchEvent(new Event('click', { bubbles: true }));

            // Wait for a brief moment to allow JSDOM to process the re-render
            await new Promise(resolve => setTimeout(resolve, 250)); // 250ms delay

            const deleteButtonAfterClick = document.querySelector(`#view-task-${deleteIndex} .btn-delete`);
            if (!deleteButtonAfterClick) throw new Error('Delete button not found after delay');
            const iconElement = deleteButtonAfterClick.querySelector('i.fa-check-circle');
            expect(iconElement).not.toBeNull();

            deleteButton = document.querySelector(`#view-task-${deleteIndex} .btn-delete`);
            if (!deleteButton) throw new Error('Delete button not found');
            deleteButton.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(saveTasks).toHaveBeenCalledTimes(5);

            tasks = getRenderedTasksDOM();
            expect(tasks.find(t => t.description === 'To Delete')).toBeUndefined();
        });
    });

    describe('Edge Case Tests', () => {
        test('does not reschedule completed tasks when adding a new overlapping task', async () => {
            window.confirm = jest.fn().mockReturnValue(true);

            await addTaskDOM('Completed Task', '09:00', 1, 0);

            const timeElement = document.getElementById('current-time');
            if (!timeElement) throw new Error('Current time element not found');
            timeElement.textContent = '10:00 AM';

            await new Promise(resolve => setTimeout(resolve, 0));
            const taskCheckbox = document.querySelector('#view-task-0 .checkbox');
            expect(taskCheckbox).not.toBeNull();
            if (!taskCheckbox) throw new Error('Task checkbox not found');
            taskCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));

            let tasks = getRenderedTasksDOM();
            expect(tasks[0].isCompleted).toBe(true);
            const saveCountBeforeNewTask = jest.mocked(saveTasks).mock.calls.length;

            await addTaskDOM('New Task', '09:30', 1, 0);
            expect(saveTasks).toHaveBeenCalledTimes(saveCountBeforeNewTask + 1);

            tasks = getRenderedTasksDOM();
            expect(tasks[0].description).toBe('Completed Task');
            expect(tasks[0].startTime12).toBe(convertTo12HourTime('09:00'));
            expect(tasks[0].endTime12).toBe(convertTo12HourTime('10:00'));

            expect(tasks[1].description).toBe('New Task');
            expect(tasks[1].startTime12).toBe(convertTo12HourTime('09:30'));
        });

        test('skips tasks being edited during rescheduling', async () => {
            window.confirm = jest.fn().mockReturnValue(true);

            await addTaskDOM('Task 1', '09:00', 1, 0);
            await addTaskDOM('Task 2 (Editing)', '10:00', 1, 0);
            await addTaskDOM('Task 3', '11:00', 1, 0);
            await new Promise(resolve => setTimeout(resolve, 0));

            const editButtonTask2 = document.querySelector('#view-task-1 .btn-edit');
            expect(editButtonTask2).not.toBeNull();
            if (!editButtonTask2) throw new Error('Edit button for Task 2 not found');
            editButtonTask2.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));

            const task2EditForm = document.getElementById('edit-task-1');
            expect(task2EditForm).not.toBeNull();
            if (!task2EditForm) throw new Error('Edit form for Task 2 not found after clicking edit');

            const timeElement = document.getElementById('current-time');
            if (!timeElement) throw new Error('Current time element not found');
            timeElement.textContent = '10:30 AM';

            const task1Checkbox = document.querySelector('#view-task-0 .checkbox');
            if (!task1Checkbox) throw new Error('Task 1 checkbox not found');
            task1Checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));

            const allEditForms = document.querySelectorAll('form[id^="edit-task-"]');
            let task2EditFormAfterReschedule = null;

            for (const form of allEditForms) {
                const descriptionInput = form.querySelector('input[name="description"]');
                if (descriptionInput instanceof HTMLInputElement && descriptionInput.value.includes('Task 2 (Editing)')) {
                    task2EditFormAfterReschedule = form;
                    break;
                }
            }

            expect(task2EditFormAfterReschedule).not.toBeNull();
            if (!task2EditFormAfterReschedule) throw new Error('Edit form for Task 2 not found after reschedule');

            const startTimeInput = task2EditFormAfterReschedule.querySelector('input[name="start-time"]');
            if (!(startTimeInput instanceof HTMLInputElement)) throw new Error('Start time input not found in edit form');
            expect(startTimeInput.value).toBe('10:00');

            const tasks = getRenderedTasksDOM();
            const task3 = tasks.find(t => t.description === 'Task 3');
            if (!task3) throw new Error('Task 3 not found in rendered tasks');
            expect(task3.startTime12).toBe(convertTo12HourTime('11:00'));
        });
    });
});

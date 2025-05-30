import {
    calculateMinutes,
    timeToDateTime,
    calculateEndDateTime,
    extractDateFromDateTime
} from '../public/js/utils.js';

/**
 * @typedef {Object} Task
 * @property {string} description - Task description
 * @property {string} startDateTime - Start date and time in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)
 * @property {string} endDateTime - End date and time in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)
 * @property {number} duration - Duration in minutes
 * @property {string} status - Task status ("incomplete" or "completed")
 * @property {boolean} editing - Whether task is being edited
 * @property {boolean} confirmingDelete - Whether delete is being confirmed
 */

/**
 * Sets up the DOM for testing fortudo
 */
function setupDOM() {
    document.body.innerHTML = `
    <div id="task-list"></div>
    <form id="task-form">
      <input type="text" name="description" required>
      <input type="time" name="start-time" required>
      <input type="number" name="duration-hours" min="0">
      <input type="number" name="duration-minutes" min="0" max="59">
      <button type="submit">Add</button>
    </form>
    <div id="current-time"></div>
    <div id="current-date"></div>
    <button id="delete-all">Clear Tasks</button>
  `;
}

/**
 * Sets up the testing environment (DOM, localStorage, global mocks) and
 * dynamically imports and initializes the main application module `public/js/app.js`.
 * @returns {Promise<void>} A promise that resolves when the environment is set up and app.js is initialized.
 */
async function setupIntegrationTestEnvironment() {
    setupDOM();
    setupMockLocalStorage();

    // Dynamically import the main app module.
    await import('../public/js/app.js');

    // Manually trigger DOMContentLoaded since it fired before our DOM setup.
    // This ensures app.js sets up its event listeners with our test DOM.
    const domContentLoadedEvent = new Event('DOMContentLoaded', {
        bubbles: true,
        cancelable: true
    });
    document.dispatchEvent(domContentLoadedEvent);

    // Wait a short moment for any async operations within app.js's DOMContentLoaded if necessary,
    await new Promise((resolve) => setTimeout(resolve, 0)); // Ensures microtask queue is flushed.
}

// Definitions for localStorage mocks and helpers
let mockLocalStorageStore = {};

const localStorageMock = {
    getItem: jest.fn((key) => mockLocalStorageStore[key] || null),
    setItem: jest.fn((key, value) => {
        mockLocalStorageStore[key] = String(value);
    }),
    clear: jest.fn(() => {
        mockLocalStorageStore = {};
    }),
    removeItem: jest.fn((key) => {
        delete mockLocalStorageStore[key];
    }),
    get length() {
        return Object.keys(mockLocalStorageStore).length;
    },
    key: jest.fn((index) => Object.keys(mockLocalStorageStore)[index] || null)
};

function setupMockLocalStorage() {
    Object.defineProperty(window, 'localStorage', {
        value: localStorageMock,
        writable: true,
        configurable: true
    });
    localStorageMock.clear();
}

function clearLocalStorage() {
    localStorageMock.clear();
}

// DOM Interaction Helpers (minimal viable set, can be expanded)
async function addTaskDOM(description, startTime, durationHours = '0', durationMinutes = '30') {
    const form = document.getElementById('task-form');
    if (!form) throw new Error('Task form not found');

    // Use querySelector with name attributes instead of getElementById
    const descInput = form.querySelector('input[name="description"]');
    const startTimeInput = form.querySelector('input[name="start-time"]');
    const durationHoursInput = form.querySelector('input[name="duration-hours"]');
    const durationMinutesInput = form.querySelector('input[name="duration-minutes"]');

    if (descInput && descInput instanceof HTMLInputElement) descInput.value = description;
    if (startTimeInput && startTimeInput instanceof HTMLInputElement)
        startTimeInput.value = startTime;
    if (durationHoursInput && durationHoursInput instanceof HTMLInputElement)
        durationHoursInput.value = durationHours;
    if (durationMinutesInput && durationMinutesInput instanceof HTMLInputElement)
        durationMinutesInput.value = durationMinutes;

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0)); // Allow DOM updates
}

function getRenderedTasksDOM() {
    // The actual app renders tasks as div elements with id="view-task-{index}" and form elements with id="edit-task-{index}"
    const taskItems = document.querySelectorAll('#task-list > div, #task-list > form');
    return Array.from(taskItems).map((item, _index) => {
        // Check if this is an edit form
        if (item.tagName === 'FORM' && item.id.startsWith('edit-task-')) {
            const descInput = item.querySelector('input[name="description"]');
            return {
                description:
                    descInput && descInput instanceof HTMLInputElement ? descInput.value : '',
                startTime12: null, // Edit forms don't show formatted time
                endTime12: null,
                isCompleted: false,
                isEditing: true
            };
        }

        // This is a view task div
        // The structure is: div#view-task-X > div.flex.items-center.space-x-4 > div (third child containing text) > div (description), div (time)
        const contentContainer = item.querySelector('.flex.items-center.space-x-4');
        if (!contentContainer) {
            return {
                description: '',
                startTime12: null,
                endTime12: null,
                isCompleted: false,
                isEditing: false
            };
        }

        // Find the text container (third child after label and input)
        const textContainer = contentContainer.children[2]; // label, input, text div
        const checkbox = item.querySelector('input[type="checkbox"]');

        let description = '';
        let startTime12 = null;
        let endTime12 = null;

        if (textContainer && textContainer.children.length >= 2) {
            const descDiv = textContainer.children[0];
            const timeDiv = textContainer.children[1];

            if (descDiv && descDiv.textContent) {
                description = descDiv.textContent.trim();
            }

            if (timeDiv && timeDiv.textContent) {
                // Extract time from format like "9:00 AM – 10:00 AM (1 h)"
                const timeMatch = timeDiv.textContent.match(
                    /(\d{1,2}:\d{2} (?:AM|PM))\s*[–-]\s*(\d{1,2}:\d{2} (?:AM|PM))/
                );
                if (timeMatch) {
                    startTime12 = timeMatch[1];
                    endTime12 = timeMatch[2];
                }
            }
        }

        return {
            description,
            startTime12,
            endTime12,
            isCompleted:
                checkbox && checkbox instanceof HTMLInputElement ? checkbox.checked : false,
            isEditing: false
        };
    });
}

async function updateTaskDOM(taskIndex, data) {
    const editButtons = document.querySelectorAll('#task-list .btn-edit');
    if (taskIndex < 0 || taskIndex >= editButtons.length)
        throw new Error(`Edit button for task index ${taskIndex} not found or out of bounds.`);
    const editButton = editButtons[taskIndex];
    if (editButton instanceof HTMLElement) {
        editButton.dispatchEvent(new Event('click', { bubbles: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    const editForm = document.getElementById(`edit-task-${taskIndex}`);
    if (!editForm) throw new Error(`Edit form for task ${taskIndex} not found.`);

    if (data.description !== undefined) {
        const descInput = editForm.querySelector('input[name="description"]');
        if (descInput && descInput instanceof HTMLInputElement) descInput.value = data.description;
    }
    if (data.startTime !== undefined) {
        const startTimeInput = editForm.querySelector('input[name="start-time"]');
        if (startTimeInput && startTimeInput instanceof HTMLInputElement)
            startTimeInput.value = data.startTime;
    }
    if (data.durationHours !== undefined) {
        // The actual app uses input[type="number"] not select elements
        const durationHoursInput = editForm.querySelector('input[name="duration-hours"]');
        if (durationHoursInput && durationHoursInput instanceof HTMLInputElement)
            durationHoursInput.value = data.durationHours;
    }
    if (data.durationMinutes !== undefined) {
        // The actual app uses input[type="number"] not select elements
        const durationMinutesInput = editForm.querySelector('input[name="duration-minutes"]');
        if (durationMinutesInput && durationMinutesInput instanceof HTMLInputElement)
            durationMinutesInput.value = data.durationMinutes;
    }

    // Submit the form to trigger the save
    editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function setCurrentTimeInDOM(time12h) {
    const currentTimeDiv = document.getElementById('current-time');
    if (currentTimeDiv) currentTimeDiv.textContent = time12h;
}

async function clickCompleteCheckbox(taskIndex) {
    // The actual app uses label elements with .checkbox class that trigger completion
    const checkboxLabels = document.querySelectorAll('#task-list .checkbox');
    if (taskIndex < 0 || taskIndex >= checkboxLabels.length)
        throw new Error(`Checkbox for task index ${taskIndex} not found or out of bounds.`);
    const checkboxLabel = checkboxLabels[taskIndex];
    if (checkboxLabel instanceof HTMLElement) {
        checkboxLabel.dispatchEvent(new Event('click', { bubbles: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
}

async function clickDeleteAllButton() {
    const button = document.getElementById('delete-all');
    if (!button) throw new Error(`Delete All button not found.`);
    if (button instanceof HTMLElement) {
        button.dispatchEvent(new Event('click', { bubbles: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function getEditFormForTask(index) {
    return document.getElementById(`edit-task-${index}`);
}

/**
 * Calculate duration properly for tasks that may cross midnight
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format
 * @returns {number} - Duration in minutes (always positive)
 */
function calculateDurationMidnightAware(startTime, endTime) {
    const startMinutes = calculateMinutes(startTime);
    const endMinutes = calculateMinutes(endTime);

    // If end time is less than start time, task crosses midnight
    if (endMinutes < startMinutes) {
        // Task crosses midnight: add 24 hours to end time
        return endMinutes + 24 * 60 - startMinutes;
    } else {
        // Normal task on same day
        return endMinutes - startMinutes;
    }
}

/**
 * Helper function to create a task with DateTime fields from legacy time data
 * @param {Object} params - Task parameters
 * @param {string} params.description - Task description
 * @param {string} params.startTime - Start time in HH:MM format
 * @param {number} params.duration - Duration in minutes
 * @param {string} [params.status] - Task status (defaults to 'incomplete')
 * @param {boolean} [params.editing] - Whether task is being edited (defaults to false)
 * @param {boolean} [params.confirmingDelete] - Whether delete is being confirmed (defaults to false)
 * @param {string} [params.date] - Date in YYYY-MM-DD format (defaults to today)
 * @returns {Object} Task object with DateTime fields
 */
function createTaskWithDateTime({
    description,
    startTime,
    duration,
    status = 'incomplete',
    editing = false,
    confirmingDelete = false,
    date
}) {
    if (!date) {
        date = extractDateFromDateTime(new Date()); // Today in YYYY-MM-DD format
    }

    const startDateTime = timeToDateTime(startTime, date);
    const endDateTime = calculateEndDateTime(startDateTime, duration);

    return {
        description,
        startDateTime,
        endDateTime,
        duration,
        status,
        editing,
        confirmingDelete
    };
}

export {
    createTaskWithDateTime,
    calculateDurationMidnightAware,
    setupIntegrationTestEnvironment,
    addTaskDOM,
    updateTaskDOM,
    getRenderedTasksDOM,
    clearLocalStorage,
    clickCompleteCheckbox,
    clickDeleteAllButton,
    getEditFormForTask,
    setCurrentTimeInDOM
};

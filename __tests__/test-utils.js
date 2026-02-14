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
    <div id="room-entry-screen" class="hidden">
      <form id="room-entry-form">
        <input type="text" id="room-code-input" />
        <button type="button" id="generate-room-btn"></button>
        <button type="submit">Enter Room</button>
      </form>
      <div id="saved-rooms-list" class="hidden">
        <div id="saved-rooms-buttons"></div>
      </div>
    </div>
    <div id="main-app" class="hidden">
    <div class="container">
      <div class="header">
        <div id="current-time"></div>
        <div id="current-date"></div>
        <span id="room-code-badge"><span id="room-code-display"></span></span>
        <span id="sync-status-indicator">
          <i id="sync-status-icon"></i>
          <span id="sync-status-text"></span>
        </span>
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
            <input type="number" name="duration-minutes" min="0" max="59" value="0" />
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

      <!-- Schedule Modal for unscheduled tasks -->
      <div id="schedule-modal" class="hidden">
        <div class="modal-content">
          <h2>Schedule Task</h2>
          <p>Task: <span id="schedule-modal-task-name"></span></p>
          <p>Duration: <span id="schedule-modal-duration"></span></p>
          <form id="schedule-modal-form">
            <input type="time" name="modal-start-time" required />
            <input type="number" name="modal-duration-hours" min="0" value="0" />
            <input type="number" name="modal-duration-minutes" min="0" max="59" value="0" />
            <button type="submit">Schedule</button>
            <button type="button" id="cancel-schedule-modal">Cancel</button>
          </form>
          <button id="close-schedule-modal">Close</button>
        </div>
      </div>

      <!-- Custom Confirm Modal - intentionally mismatched button IDs to trigger window.confirm fallback in tests -->
      <div id="custom-confirm-modal" class="hidden">
        <div class="modal-content">
          <h2 id="custom-confirm-title"></h2>
          <p id="custom-confirm-message"></p>
          <button id="custom-confirm-ok">OK</button>
          <button id="custom-confirm-cancel">Cancel</button>
        </div>
      </div>
    </div>
    </div>
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

    // Set a default room code so app.js skips the room entry screen
    localStorageMock.setItem('fortudo-active-room', 'test-room');

    // Dynamically import the main app module.
    await import('../public/js/app.js');

    // Manually trigger DOMContentLoaded since it fired before our DOM setup.
    // This ensures app.js sets up its event listeners with our test DOM.
    const domContentLoadedEvent = new Event('DOMContentLoaded', {
        bubbles: true,
        cancelable: true
    });
    document.dispatchEvent(domContentLoadedEvent);

    // Wait for async operations within app.js's DOMContentLoaded (initStorage, loadTasks).
    await new Promise((resolve) => setTimeout(resolve, 50));
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
    // The refactored app now uses data-task-id instead of index-based IDs
    // Tasks are in #scheduled-task-list, structured as divs with data-task-id attribute
    const taskItems = document.querySelectorAll('#scheduled-task-list > div[data-task-id]');
    return Array.from(taskItems).map((item) => {
        const taskId = item.getAttribute('data-task-id');

        // Check if this task is in edit mode (has edit form visible)
        const editForm = item.querySelector('form.edit-task-form');
        if (editForm && editForm.style.display !== 'none') {
            const descInput = editForm.querySelector('input[name="description"]');
            return {
                id: taskId,
                description:
                    descInput && descInput instanceof HTMLInputElement ? descInput.value : '',
                startTime12: null, // Edit forms don't show formatted time
                endTime12: null,
                isCompleted: false,
                isEditing: true
            };
        }

        // This is a view mode task
        // Extract task info from the rendered HTML
        // The description is in a div with font-medium class that contains the task description
        const descriptionElement = item.querySelector('.font-medium:not(.celebration-container *)');
        const checkbox = item.querySelector('input[type="checkbox"], .checkbox');

        let description = '';
        let startTime12 = null;
        let endTime12 = null;

        if (descriptionElement) {
            description = descriptionElement.textContent?.trim() || '';

            // Remove "locked" badge text if present
            description = description.replace(/\s*🔒\s*Locked\s*/g, '').trim();
        }

        // Extract times from format like "9:00 AM – 10:00 AM (1h)" using ndash
        const allText = item.textContent || '';
        const timeMatch = allText.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)/);
        if (timeMatch) {
            startTime12 = timeMatch[1];
            endTime12 = timeMatch[2];
        }

        if (!description) {
            // Fallback: extract from text content, skipping celebration emojis
            const textContent = item.textContent || '';
            const celebrationEmojis = ['🎉', '🌟', '✨', '🎊', '🏆', '💫', '💪🏾'];
            const isCelebrationLine = (line) =>
                celebrationEmojis.some((emoji) => line.includes(emoji)) &&
                line.replace(/\s/g, '').length < 15;
            const lines = textContent
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l && !isCelebrationLine(l));
            if (lines.length > 0) {
                // First substantial line is usually the description
                description =
                    lines.find(
                        (l) =>
                            l &&
                            !l.match(/^\d{1,2}:\d{2}\s*[AP]M/) &&
                            l !== 'Edit' &&
                            l !== 'Delete'
                    ) || '';
            }
        }

        let isCompleted = false;
        if (checkbox) {
            if (checkbox instanceof HTMLInputElement) {
                isCompleted = checkbox.checked;
            } else {
                // It's a div.checkbox, check for fa-check-square icon
                const icon = checkbox.querySelector('i');
                isCompleted = icon?.classList.contains('fa-check-square') || false;
            }
        }

        return {
            id: taskId,
            description,
            startTime12,
            endTime12,
            isCompleted,
            isEditing: false
        };
    });
}

async function updateTaskDOM(taskIndex, data) {
    const editButtons = document.querySelectorAll('#scheduled-task-list .btn-edit');
    if (taskIndex < 0 || taskIndex >= editButtons.length)
        throw new Error(`Edit button for task index ${taskIndex} not found or out of bounds.`);
    const editButton = editButtons[taskIndex];
    if (editButton instanceof HTMLElement) {
        editButton.dispatchEvent(new Event('click', { bubbles: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Find edit form by data-task-index attribute instead of ID
    const editForm = document.querySelector(`form[data-task-index="${taskIndex}"]`);
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
    // The actual app uses div.checkbox elements that trigger completion
    const checkboxLabels = document.querySelectorAll('#scheduled-task-list .checkbox');
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
    return document.querySelector(`form[data-task-index="${index}"]`);
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
    locked = false,
    id = null,
    date
}) {
    if (!date) {
        date = extractDateFromDateTime(new Date()); // Today in YYYY-MM-DD format
    }

    const startDateTime = timeToDateTime(startTime, date);
    const endDateTime = calculateEndDateTime(startDateTime, duration);

    return {
        id: id || `test-task-${Date.now()}-${Math.random()}`,
        type: 'scheduled',
        description,
        startDateTime,
        endDateTime,
        duration,
        status,
        editing,
        confirmingDelete,
        locked
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

// Dummy test to satisfy Jest's requirement that test files contain at least one test
describe('test-utils', () => {
    it('exports utility functions', () => {
        expect(typeof setupIntegrationTestEnvironment).toBe('function');
        expect(typeof setupDOM).toBe('function');
        expect(typeof setupMockLocalStorage).toBe('function');
    });
});

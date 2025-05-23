/**
 * @typedef {Object} Task
 * @property {string} description - Task description
 * @property {string} startTime - Start time in 24-hour format (HH:MM)
 * @property {string} endTime - End time in 24-hour format (HH:MM)
 * @property {number} duration - Duration in minutes
 * @property {string} status - Task status ("incomplete" or "completed")
 * @property {boolean} editing - Whether task is being edited
 * @property {boolean} confirmingDelete - Whether delete is being confirmed
 */


/**
 * @typedef {Object} FortudoTestingInterface - This is what `public/js/app.js` should expose on `window.fortudo` for tests.
 * @property {() => Array<Task>} tasks - Getter for current tasks from task-manager.
 * @property {Object} tm - Direct access to task-manager module's functions.
 * @property {Object} dom - Direct access to dom-handler module's functions.
 * @property {Object} utils - Direct access to utils module's functions.
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

  // Remove the default confirm mock since individual tests need to control this
  // window.alert = jest.fn();
  // window.confirm = jest.fn().mockReturnValue(true);

  // Dynamically import the main app module.
  // This ensures app.js runs its DOMContentLoaded listener after DOM is set up.
  // Note: Jest needs to be configured for ES Modules.
  // TODO: if not already, ensure "transform: {'^.+\\.jsx?$': 'babel-jest'}" or similar in jest.config.js
  // TODO: and babelrc/babel.config.js is set up for ESM.
  await import('../public/js/app.js');

  // Since DOMContentLoaded has already fired when we import app.js, we need to manually trigger it
  // so that app.js sets up its event listeners
  const domContentLoadedEvent = new Event('DOMContentLoaded', {
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(domContentLoadedEvent);

  // Wait a short moment for any async operations within app.js's DOMContentLoaded if necessary,
  await new Promise(resolve => setTimeout(resolve, 0)); // Ensures microtask queue is flushed.
}

// Definitions for localStorage mocks and helpers
let mockLocalStorageStore = {};

const localStorageMock = {
    getItem: jest.fn(key => mockLocalStorageStore[key] || null),
    setItem: jest.fn((key, value) => {
        mockLocalStorageStore[key] = String(value);
    }),
    clear: jest.fn(() => {
        mockLocalStorageStore = {};
    }),
    removeItem: jest.fn(key => {
        delete mockLocalStorageStore[key];
    }),
    get length() {
        return Object.keys(mockLocalStorageStore).length;
    },
    key: jest.fn(index => Object.keys(mockLocalStorageStore)[index] || null)
};

function setupMockLocalStorage() {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
  localStorageMock.clear();
}

function clearLocalStorage() {
    localStorageMock.clear();
}

function saveTasksToLocalStorage(tasks) {
    localStorageMock.setItem('tasks', JSON.stringify(tasks));
}

function getTaskDataFromLocalStorage() {
    const tasksJson = localStorageMock.getItem('tasks');
    return tasksJson ? JSON.parse(tasksJson) : [];
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
    if (startTimeInput && startTimeInput instanceof HTMLInputElement) startTimeInput.value = startTime;
    if (durationHoursInput && durationHoursInput instanceof HTMLInputElement) durationHoursInput.value = durationHours;
    if (durationMinutesInput && durationMinutesInput instanceof HTMLInputElement) durationMinutesInput.value = durationMinutes;

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0)); // Allow DOM updates
}

function getRenderedTasksDOM() {
    // The actual app renders tasks as div elements with id="view-task-{index}" and form elements with id="edit-task-{index}"
    const taskItems = document.querySelectorAll('#task-list > div, #task-list > form');
    return Array.from(taskItems).map((item, index) => {
        // Check if this is an edit form
        if (item.tagName === 'FORM' && item.id.startsWith('edit-task-')) {
            const descInput = item.querySelector('input[name="description"]');
            return {
                description: descInput && descInput instanceof HTMLInputElement ? descInput.value : '',
                startTime12: null, // Edit forms don't show formatted time
                endTime12: null,
                isCompleted: false,
                isEditing: true,
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
                isEditing: false,
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
                const timeMatch = timeDiv.textContent.match(/(\d{1,2}:\d{2} (?:AM|PM))\s*[–-]\s*(\d{1,2}:\d{2} (?:AM|PM))/);
                if (timeMatch) {
                    startTime12 = timeMatch[1];
                    endTime12 = timeMatch[2];
                }
            }
        }

        return {
            description: description,
            startTime12: startTime12,
            endTime12: endTime12,
            isCompleted: checkbox && checkbox instanceof HTMLInputElement ? checkbox.checked : false,
            isEditing: false,
        };
    });
}

async function updateTaskDOM(taskIndex, data) {
    const editButtons = document.querySelectorAll('#task-list .btn-edit');
    if (taskIndex < 0 || taskIndex >= editButtons.length) throw new Error(`Edit button for task index ${taskIndex} not found or out of bounds.`);
    const editButton = editButtons[taskIndex];
    if (editButton instanceof HTMLElement) editButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const editForm = document.getElementById(`edit-task-${taskIndex}`);
    if (!editForm) throw new Error(`Edit form for task ${taskIndex} not found.`);

    if (data.description !== undefined) {
        const descInput = editForm.querySelector('input[name="description"]');
        if (descInput && descInput instanceof HTMLInputElement) descInput.value = data.description;
    }
    if (data.startTime !== undefined) {
        const startTimeInput = editForm.querySelector('input[name="start-time"]');
        if (startTimeInput && startTimeInput instanceof HTMLInputElement) startTimeInput.value = data.startTime;
    }
    if (data.durationHours !== undefined) {
        // The actual app uses input[type="number"] not select elements
        const durationHoursInput = editForm.querySelector('input[name="duration-hours"]');
        if (durationHoursInput && durationHoursInput instanceof HTMLInputElement) durationHoursInput.value = data.durationHours;
    }
    if (data.durationMinutes !== undefined) {
        // The actual app uses input[type="number"] not select elements
        const durationMinutesInput = editForm.querySelector('input[name="duration-minutes"]');
        if (durationMinutesInput && durationMinutesInput instanceof HTMLInputElement) durationMinutesInput.value = data.durationMinutes;
    }

    // Look for the correct save button class name
    const saveButton = editForm.querySelector('.btn-save-edit') || editForm.querySelector('button[type="submit"]');
    if (!saveButton) throw new Error(`Save button for edit form ${taskIndex} not found.`);
    if (saveButton instanceof HTMLElement) saveButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function setCurrentTimeInDOM(time12h) {
    const currentTimeDiv = document.getElementById('current-time');
    if (currentTimeDiv) currentTimeDiv.textContent = time12h;
}

async function clickCompleteCheckbox(taskIndex) {
    // The actual app uses label elements with .checkbox class that trigger completion
    const checkboxLabels = document.querySelectorAll('#task-list .checkbox');
    if (taskIndex < 0 || taskIndex >= checkboxLabels.length) throw new Error(`Checkbox for task index ${taskIndex} not found or out of bounds.`);
    const checkboxLabel = checkboxLabels[taskIndex];
    if (checkboxLabel instanceof HTMLElement) checkboxLabel.click(); // Click the label, not the hidden checkbox
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function clickDeleteAllButton() {
    const button = document.getElementById('delete-all');
    if (!button) throw new Error(`Delete All button not found.`);
    if (button instanceof HTMLElement) button.click();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function getEditFormForTask(index) {
    return document.getElementById(`edit-task-${index}`);
}

function getTaskFormElement() {
    return document.getElementById('task-form');
}

async function clickSaveButtonOnEditForm(taskIndex) {
    const editForm = getEditFormForTask(taskIndex);
    if (!editForm) throw new Error(`Edit form for task ${taskIndex} not found.`);
    const saveButton = editForm.querySelector('.btn-save');
    if (!saveButton) throw new Error(`Save button for task ${taskIndex} not found.`);
    if (saveButton instanceof HTMLElement) saveButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function clickCancelButtonOnEditForm(taskIndex) {
    const editForm = getEditFormForTask(taskIndex);
    if (!editForm) throw new Error(`Edit form for task ${taskIndex} not found.`);
    const cancelButton = editForm.querySelector('.btn-cancel');
    if (!cancelButton) throw new Error(`Cancel button for task ${taskIndex} not found.`);
    if (cancelButton instanceof HTMLElement) cancelButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function clickEditButtonForTask(taskIndex) {
    const taskItems = document.querySelectorAll('#task-list li');
    if (taskIndex < 0 || taskIndex >= taskItems.length) throw new Error(`Task item for index ${taskIndex} not found.`);
    const taskItem = taskItems[taskIndex];
    const editButton = taskItem.querySelector('.btn-edit');
    if (!editButton) throw new Error(`Edit button for task ${taskIndex} not found.`);
    if (editButton instanceof HTMLElement) editButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
}

module.exports = {
  setupIntegrationTestEnvironment,
  setupMockLocalStorage,
  setupDOM,
  clearLocalStorage,
  saveTasksToLocalStorage,
  getTaskDataFromLocalStorage,
  addTaskDOM,
  getRenderedTasksDOM,
  updateTaskDOM,
  setCurrentTimeInDOM,
  clickCompleteCheckbox,
  clickDeleteAllButton,
  getEditFormForTask,
  getTaskFormElement,
  clickSaveButtonOnEditForm,
  clickCancelButtonOnEditForm,
  clickEditButtonForTask,
};

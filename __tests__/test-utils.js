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

// No need to import JSDOM as it's already configured by Jest

// The old mockESModules function is removed as Jest now handles ES module imports
// and test files will import directly from '../public/js/utils.js' or other modules.

/**
 * @typedef {Object} FortudoTestingInterface - This is what `public/js/app.js` should expose on `window.fortudo` for tests.
 * @property {() => Array<Task>} tasks - Getter for current tasks from task-manager.
 * @property {Object} tm - Direct access to task-manager module's functions.
 * @property {Object} dom - Direct access to dom-handler module's functions.
 * @property {Object} utils - Direct access to utils module's functions.
 */


// The old setupMockLocalStorage function was removed.
// The new one (defined later in the file, around line 124 in previous listings) will be used.

/**
 * Sets up the DOM for testing fortudo
 */
function setupDOM() {
  // Set up DOM elements that fortudo needs
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

  window.alert = jest.fn();
  window.confirm = jest.fn().mockReturnValue(true);

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
    const descInput = document.getElementById('task-description');
    const startTimeInput = document.getElementById('task-start-time');
    const durationHoursSelect = document.getElementById('task-duration-hours');
    const durationMinutesSelect = document.getElementById('task-duration-minutes');
    const form = document.getElementById('task-form');

    if (descInput) descInput.value = description;
    if (startTimeInput) startTimeInput.value = startTime;
    if (durationHoursSelect) durationHoursSelect.value = durationHours;
    if (durationMinutesSelect) durationMinutesSelect.value = durationMinutes;
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    
    await new Promise(resolve => setTimeout(resolve, 0)); // Allow DOM updates
}

function getRenderedTasksDOM() {
    const taskItems = document.querySelectorAll('#task-list li');
    return Array.from(taskItems).map(li => {
        const descriptionElem = li.querySelector('.task-description');
        const timeElem = li.querySelector('.task-time');
        let startTime12 = null;
        let endTime12 = null;
        if (timeElem && timeElem.textContent) {
            const timeMatch = timeElem.textContent.match(/(\d{1,2}:\d{2} (?:AM|PM)) - (\d{1,2}:\d{2} (?:AM|PM))/);
            if (timeMatch) {
                startTime12 = timeMatch[1];
                endTime12 = timeMatch[2];
            }
        }
        const checkbox = li.querySelector('input[type="checkbox"]');
        return {
            description: descriptionElem ? descriptionElem.textContent.trim() : '',
            startTime12: startTime12,
            endTime12: endTime12,
            isCompleted: checkbox ? checkbox.checked : false,
            isEditing: !!li.querySelector('form[id^="edit-task-"]'),
        };
    });
}

async function updateTaskDOM(taskIndex, data) {
    const editButtons = document.querySelectorAll('#task-list .btn-edit');
    if (taskIndex < 0 || taskIndex >= editButtons.length) throw new Error(`Edit button for task index ${taskIndex} not found or out of bounds.`);
    editButtons[taskIndex].click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const editForm = document.getElementById(`edit-task-${taskIndex}`);
    if (!editForm) throw new Error(`Edit form for task ${taskIndex} not found.`);

    if (data.description !== undefined) editForm.querySelector('input[name="description"]').value = data.description;
    if (data.startTime !== undefined) editForm.querySelector('input[name="start-time"]').value = data.startTime;
    if (data.durationHours !== undefined) editForm.querySelector('select[name="duration-hours"]').value = data.durationHours;
    if (data.durationMinutes !== undefined) editForm.querySelector('select[name="duration-minutes"]').value = data.durationMinutes;
    
    const saveButton = editForm.querySelector('.btn-save');
    if (!saveButton) throw new Error(`Save button for edit form ${taskIndex} not found.`);
    saveButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function setCurrentTimeInDOM(time12h) { 
    const currentTimeDiv = document.getElementById('current-time');
    if (currentTimeDiv) currentTimeDiv.textContent = time12h;
}

async function clickCompleteCheckbox(taskIndex) {
    const checkboxes = document.querySelectorAll('#task-list li input[type="checkbox"]');
    if (taskIndex < 0 || taskIndex >= checkboxes.length) throw new Error(`Checkbox for task index ${taskIndex} not found or out of bounds.`);
    const checkbox = checkboxes[taskIndex];
    checkbox.checked = !checkbox.checked; 
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function clickDeleteAllButton() {
    const button = document.getElementById('delete-all');
    if (!button) throw new Error(`Delete All button not found.`);
    button.click();
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
    saveButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function clickCancelButtonOnEditForm(taskIndex) {
    const editForm = getEditFormForTask(taskIndex);
    if (!editForm) throw new Error(`Edit form for task ${taskIndex} not found.`);
    const cancelButton = editForm.querySelector('.btn-cancel');
    if (!cancelButton) throw new Error(`Cancel button for task ${taskIndex} not found.`);
    cancelButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
}

async function clickEditButtonForTask(taskIndex) {
    const taskItems = document.querySelectorAll('#task-list li');
    if (taskIndex < 0 || taskIndex >= taskItems.length) throw new Error(`Task item for index ${taskIndex} not found.`);
    const taskItem = taskItems[taskIndex];
    const editButton = taskItem.querySelector('.btn-edit');
    if (!editButton) throw new Error(`Edit button for task ${taskIndex} not found.`);
    editButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
}

module.exports = {
  setupIntegrationTestEnvironment,
  setupMockLocalStorage, // This function is defined above
  setupDOM,
  clearLocalStorage, // This function is defined above
  saveTasksToLocalStorage, // This function is defined above
  getTaskDataFromLocalStorage, // This function is defined above
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
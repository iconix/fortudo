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


/**
 * Sets up mock localStorage for testing.
 * @returns {Object} Mock localStorage object
 */
function setupMockLocalStorage() {
  let store = {};
  const localStorageMock = {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = String(value);
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    })
  };

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
  });

  return localStorageMock;
}

/**
 * Sets up the DOM for testing fortudo
 */
function setupDOM() {
  // Set up DOM elements that fortudo needs
  document.body.innerHTML = `
    <div id="task-list" class="task-list"></div>
    <form id="task-form" class="task-form">
      <input type="text" name="description" class="task-description" required>
      <input type="time" name="start-time" class="task-start-time" required>
      <input type="number" name="duration-hours" class="task-duration-hours" min="0" value="0">
      <input type="number" name="duration-minutes" class="task-duration-minutes" min="0" max="59" value="0">
      <button type="submit" class="add-task-btn">Add</button>
    </form>
    <div id="current-time" class="current-time"></div>
    <div id="current-date" class="current-date"></div>
    <button id="delete-all" class="delete-all-btn">Clear Tasks</button>
  `;

  // Add required event listeners
  const taskForm = document.getElementById('task-form');
  const deleteAllBtn = document.getElementById('delete-all');
  const taskList = document.getElementById('task-list');

  if (taskForm) {
    taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      // The actual handler will be added by app.js
    });
  }

  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // The actual handler will be added by app.js
    });
  }

  if (taskList) {
    // Add event delegation for task list
    taskList.addEventListener('click', (e) => {
      // The actual handlers will be added by app.js
    });
  }
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
  // if not already, ensure "transform: {'^.+\\.jsx?$': 'babel-jest'}" or similar in jest.config.js
  // and babelrc/babel.config.js is set up for ESM.
  await import('../public/js/app.js');

  // public/js/app.js should now have populated window.fortudo
  // Wait a short moment for any async operations within app.js's DOMContentLoaded if necessary,
  // though ideally, app.js setup for window.fortudo is synchronous after imports.
  await new Promise(resolve => setTimeout(resolve, 0)); // Ensures microtask queue is flushed.

  // This function no longer checks for or returns window.fortudo.
  // The app.js module, when imported, will execute and set up its event listeners.
}

module.exports = {
  setupIntegrationTestEnvironment, // Renamed function
  setupMockLocalStorage,
  setupDOM
  // isFortudoReady is no longer needed or exported
};
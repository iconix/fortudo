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

module.exports = {
  setupIntegrationTestEnvironment,
  setupMockLocalStorage,
  setupDOM
};
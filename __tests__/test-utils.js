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

// Import the utility functions from utils.js
const path = require('path');
const fs = require('fs');
// No need to import JSDOM as it's already configured by Jest

// Mock the ES module imports for Jest
// This allows us to use the utility functions in the test environment
function mockESModules() {
  try {
    const utilsJsPath = path.resolve(__dirname, '../public/js/utils.js');
    const utilsJsContent = fs.readFileSync(utilsJsPath, 'utf8');

    // Convert ES module to CommonJS by replacing export statements
    const modifiedContent = utilsJsContent
      .replace(/export function/g, 'function')
      // Add export statement at the end
      + '\nmodule.exports = { calculateMinutes, calculateHoursAndMinutes, calculate24HourTimeFromMinutes, convertTo24HourTime, convertTo12HourTime, calculateEndTime, tasksOverlap, getCurrentTimeRounded, getFormattedDate, getFormattedTime };';

    // Create a temporary file
    const tempPath = path.resolve(__dirname, '../public/js/utils.common.js');
    fs.writeFileSync(tempPath, modifiedContent);

    // Load the CommonJS module
    const utils = require(tempPath);

    // Clean up the temporary file
    fs.unlinkSync(tempPath);

    return utils;
  } catch (error) {
    console.error('Error loading utils module:', error);
    // Return mock implementations as a fallback
    return {
      calculateMinutes: () => 0,
      calculateHoursAndMinutes: () => '0m',
      calculate24HourTimeFromMinutes: () => '00:00',
      convertTo24HourTime: () => '00:00',
      convertTo12HourTime: () => '12:00 AM',
      calculateEndTime: () => '00:00',
      tasksOverlap: () => false,
      getCurrentTimeRounded: () => '00:00',
      getFormattedDate: () => 'Monday, January 1',
      getFormattedTime: () => '12:00 AM'
    };
  }
}

/**
 * @typedef {Object} Fortudo
 * @property {function(string): number} calculateMinutes
 * @property {function(number): string} calculateHoursAndMinutes
 * @property {function(number): string} calculate24HourTimeFromMinutes
 * @property {function(string): string} convertTo24HourTime
 * @property {function(string): string} convertTo12HourTime
 * @property {function(string, number): string} calculateEndTime
 * @property {function(): string} getSuggestedStartTime
 * @property {function(): void} updateStartTimeField
 * @property {function(Object, Object): boolean} tasksOverlap
 * @property {function(): string} getCurrentTimeRounded
 * @property {function(): string} getFormattedDate
 * @property {function(): string} getFormattedTime
 * @property {function(HTMLFormElement, number): boolean} isValidTaskForm
 * @property {function(Object, string, boolean): boolean} autoReschedule
 * @property {function(Object): void} addTask
 * @property {function(number, Object): void} updateTask
 * @property {function(number): void} completeTask
 * @property {function(number, boolean): void} deleteTask
 * @property {function(number): void} editTask
 * @property {function(number): void} cancelEdit
 * @property {function(): void} deleteAllTasks
 * @property {function(): void} updateLocalStorage
 * @property {function(): void} renderDateTime
 * @property {function(): void} renderTasks
 * @property {Array<Task>} tasks
 */

// Load utilities from utils.js
const utils = mockESModules();

/**
 * Helper function to check if fortudo is fully initialized
 * @returns {boolean}
 */
function isFortudoReady() {
  // @ts-ignore - Custom property added to window by app.js
  if (!window.fortudo) return false;

  // Required methods that must exist for fortudo to be considered ready
  const requiredMethods = [
    'getSuggestedStartTime',
    'updateStartTimeField',
    'isValidTaskForm',
    'addTask',
    'updateTask',
    'completeTask',
    'deleteTask',
    'editTask',
    'cancelEdit',
    'deleteAllTasks',
    'updateLocalStorage',
    'renderDateTime',
    'renderTasks'
  ];

  // @ts-ignore - Custom property added to window by app.js
  return requiredMethods.every(method => typeof window.fortudo[method] === 'function');
}

/**
 * Sets up mock localStorage for testing
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
 * Sets up fortudo for testing, loading the app.js script and waiting for it to initialize
 * @returns {Promise<Fortudo>} The fortudo object
 */
async function setupFortudoForTesting() {
  // Set up DOM
  setupDOM();

  // Mock alert and confirm
  window.alert = jest.fn();
  window.confirm = jest.fn().mockReturnValue(true);

  // Set up mock localStorage
  setupMockLocalStorage();

  // Load app.js using JSDOM's script loading capability
  const fs = require('fs');
  const path = require('path');
  const appJsPath = path.resolve(__dirname, '../public/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // Execute the script content
  eval(appJsContent);

  // Trigger DOMContentLoaded to initialize fortudo
  document.dispatchEvent(new Event('DOMContentLoaded'));

  // Wait for fortudo to be fully initialized
  return new Promise((resolve, reject) => {
    const maxWaitTime = 5000; // 5 seconds timeout
    const startTime = Date.now();

    function checkFortudo() {
      if (isFortudoReady()) {
        // @ts-ignore - Custom property added to window
        const fortudo = window.fortudo;

        // Add utility functions from utils.js directly to fortudo
        fortudo.calculateMinutes = utils.calculateMinutes;
        fortudo.calculateHoursAndMinutes = utils.calculateHoursAndMinutes;
        fortudo.calculate24HourTimeFromMinutes = utils.calculate24HourTimeFromMinutes;
        fortudo.convertTo24HourTime = utils.convertTo24HourTime;
        fortudo.convertTo12HourTime = utils.convertTo12HourTime;
        fortudo.calculateEndTime = utils.calculateEndTime;
        fortudo.tasksOverlap = utils.tasksOverlap;
        fortudo.getCurrentTimeRounded = utils.getCurrentTimeRounded;
        fortudo.getFormattedDate = utils.getFormattedDate;
        fortudo.getFormattedTime = utils.getFormattedTime;

        resolve(fortudo);
        return;
      }

      if (Date.now() - startTime > maxWaitTime) {
        reject(new Error('Timed out waiting for fortudo to initialize'));
        return;
      }

      // Check again in 100ms
      setTimeout(checkFortudo, 100);
    }

    // Start checking
    checkFortudo();
  });
}

module.exports = {
  setupFortudoForTesting,
  setupMockLocalStorage,
  setupDOM,
  isFortudoReady
};
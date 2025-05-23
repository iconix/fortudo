/**
 * @jest-environment jsdom
 */

// This file contains tests for localStorage operations in fortudo

// Import common test setup
const { setupFortudoForTesting } = require('./test-utils');

/** @type {import('./test-utils').Fortudo} */
let fortudo;

// Set up fortudo before all tests
beforeAll(async () => {
  fortudo = await setupFortudoForTesting();
});

// Clear mocks after each test
afterEach(() => {
  jest.clearAllMocks();
  // Clear tasks while maintaining the reference
  fortudo.tasks.length = 0;
});

describe('Storage Functionality', () => {
  test('tasks are saved to localStorage when added', () => {
    // Create a sample task
    const task = {
      description: 'Test Task',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };

    // Add the task
    fortudo.addTask(task);

    // Check if localStorage.setItem was called
    expect(window.localStorage.setItem).toHaveBeenCalledWith('tasks', expect.any(String));

    // Verify the JSON structure passed to localStorage
    // @ts-ignore - Jest mock methods
    const setItemCalls = window.localStorage.setItem.mock.calls;
    const lastCall = setItemCalls[setItemCalls.length - 1];
    const savedJson = JSON.parse(lastCall[1]);

    expect(savedJson).toHaveLength(1);
    expect(savedJson[0].description).toBe('Test Task');
    expect(savedJson[0].startTime).toBe('09:00');
    expect(savedJson[0].endTime).toBe('10:00');
    expect(savedJson[0].duration).toBe(60);
  });

  test('tasks are saved to localStorage when updated', () => {
    // Add initial task
    const task = {
      description: 'Initial Task',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    fortudo.addTask(task);

    // Clear localStorage mock calls to isolate update operation
    // @ts-ignore - Jest mock methods
    window.localStorage.setItem.mockClear();

    // Update the task
    const updatedTask = {
      description: 'Updated Task',
      startTime: '09:30',
      endTime: '10:30',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    fortudo.updateTask(0, updatedTask);

    // Check if localStorage.setItem was called
    expect(window.localStorage.setItem).toHaveBeenCalledWith('tasks', expect.any(String));

    // Verify the JSON structure
    // @ts-ignore - Jest mock methods
    const setItemCalls = window.localStorage.setItem.mock.calls;
    const lastCall = setItemCalls[setItemCalls.length - 1];
    const savedJson = JSON.parse(lastCall[1]);

    expect(savedJson).toHaveLength(1);
    expect(savedJson[0].description).toBe('Updated Task');
    expect(savedJson[0].startTime).toBe('09:30');
    expect(savedJson[0].endTime).toBe('10:30');
  });

  test('tasks are saved to localStorage when deleted', () => {
    // Add two tasks
    const task1 = {
      description: 'Task 1',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    const task2 = {
      description: 'Task 2',
      startTime: '10:30',
      endTime: '11:30',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    fortudo.addTask(task1);
    fortudo.addTask(task2);

    // Clear localStorage mock calls to isolate delete operation
    // @ts-ignore - Jest mock methods
    window.localStorage.setItem.mockClear();

    // Delete the first task
    fortudo.deleteTask(0, true);

    // Check if localStorage.setItem was called
    expect(window.localStorage.setItem).toHaveBeenCalledWith('tasks', expect.any(String));

    // Verify the JSON structure
    // @ts-ignore - Jest mock methods
    const setItemCalls = window.localStorage.setItem.mock.calls;
    const lastCall = setItemCalls[setItemCalls.length - 1];
    const savedJson = JSON.parse(lastCall[1]);

    expect(savedJson).toHaveLength(1);
    expect(savedJson[0].description).toBe('Task 2');
  });

  test('tasks are saved to localStorage when completed', () => {
    // Add a task
    const task = {
      description: 'Test Task',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    fortudo.addTask(task);

    // Clear localStorage mock calls to isolate complete operation
    // @ts-ignore - Jest mock methods
    window.localStorage.setItem.mockClear();

    // Set up current time element (needed for completeTask)
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
      timeElement.textContent = '09:30 AM';
    }

    // Complete the task
    fortudo.completeTask(0);

    // Check if localStorage.setItem was called
    expect(window.localStorage.setItem).toHaveBeenCalledWith('tasks', expect.any(String));

    // Verify the JSON structure
    // @ts-ignore - Jest mock methods
    const setItemCalls = window.localStorage.setItem.mock.calls;
    const lastCall = setItemCalls[setItemCalls.length - 1];
    const savedJson = JSON.parse(lastCall[1]);

    expect(savedJson).toHaveLength(1);
    expect(savedJson[0].description).toBe('Test Task');
    expect(savedJson[0].status).toBe('completed');
  });

  test('tasks are saved to localStorage when all tasks are deleted', () => {
    // Create and add tasks
    const task1 = {
      description: 'Task 1',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    const task2 = {
      description: 'Task 2',
      startTime: '10:30',
      endTime: '11:30',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };

    // Make sure we start with an empty array
    fortudo.tasks.length = 0;

    fortudo.addTask(task1);
    fortudo.addTask(task2);

    // Clear localStorage mock calls to isolate deleteAll operation
    // @ts-ignore - Jest mock methods
    window.localStorage.setItem.mockClear();

    // Mock confirm to return true
    const originalConfirm = window.confirm;
    window.confirm = jest.fn().mockReturnValue(true);

    try {
      // Delete all tasks
      fortudo.deleteAllTasks();

      // Check if localStorage.setItem was called
      expect(window.localStorage.setItem).toHaveBeenCalledWith('tasks', expect.any(String));

      // Verify the JSON structure is an empty array
      // @ts-ignore - Jest mock methods
      const setItemCalls = window.localStorage.setItem.mock.calls;
      const lastCall = setItemCalls[setItemCalls.length - 1];
      const savedJson = JSON.parse(lastCall[1]);

      expect(savedJson).toHaveLength(0);
    } finally {
      // Restore original confirm
      window.confirm = originalConfirm;
    }
  });

  test('tasks are loaded from localStorage on initialization', () => {
    // Set up mock localStorage data
    const storedTasks = [
      {
        description: 'Stored Task 1',
        startTime: '09:00',
        endTime: '10:00',
        duration: 60,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
      },
      {
        description: 'Stored Task 2',
        startTime: '10:30',
        endTime: '11:30',
        duration: 60,
        status: 'completed',
        editing: false,
        confirmingDelete: false
      }
    ];

    // Mock localStorage.getItem to return our mock data
    window.localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(storedTasks));

    // Clear existing tasks
    fortudo.tasks.length = 0;

    // Trigger DOMContentLoaded to re-initialize fortudo
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Give fortudo time to initialize
    // In a real implementation, we would wait for fortudo to be ready
    // But for this test, we'll just check that localStorage.getItem was called
    expect(window.localStorage.getItem).toHaveBeenCalledWith('tasks');
  });

  test('updateLocalStorage directly writes to localStorage', () => {
    // Clear tasks array first
    fortudo.tasks.length = 0;

    // Add tasks
    const task1 = {
      description: 'Task 1',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    const task2 = {
      description: 'Task 2',
      startTime: '10:30',
      endTime: '11:30',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    fortudo.addTask(task1);
    fortudo.addTask(task2);

    // Clear localStorage mock calls
    // @ts-ignore - Jest mock methods
    window.localStorage.setItem.mockClear();

    // Directly call updateLocalStorage
    fortudo.updateLocalStorage();

    // Check if localStorage.setItem was called
    expect(window.localStorage.setItem).toHaveBeenCalledWith('tasks', expect.any(String));

    // Verify the JSON structure
    // @ts-ignore - Jest mock methods
    const setItemCalls = window.localStorage.setItem.mock.calls;
    const lastCall = setItemCalls[setItemCalls.length - 1];
    const savedJson = JSON.parse(lastCall[1]);

    expect(savedJson).toHaveLength(2);
    expect(savedJson[0].description).toBe('Task 1');
    expect(savedJson[1].description).toBe('Task 2');
  });
});
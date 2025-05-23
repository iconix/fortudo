/**
 * @jest-environment jsdom
 */

// This file contains tests for task management operations in fortudo
// These tests focus on task CRUD operations and validation

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

describe('Task Management Functions', () => {
  test('tasksOverlap correctly identifies overlapping tasks', () => {
    // Same time period
    const task1 = { startTime: '09:00', endTime: '10:00' };
    const task2 = { startTime: '09:00', endTime: '10:00' };
    expect(fortudo.tasksOverlap(task1, task2)).toBe(true);

    // Partial overlap (task2 starts during task1)
    const task3 = { startTime: '09:00', endTime: '10:00' };
    const task4 = { startTime: '09:30', endTime: '10:30' };
    expect(fortudo.tasksOverlap(task3, task4)).toBe(true);

    // Partial overlap (task2 ends during task1)
    const task5 = { startTime: '09:30', endTime: '10:30' };
    const task6 = { startTime: '09:00', endTime: '10:00' };
    expect(fortudo.tasksOverlap(task5, task6)).toBe(true);

    // Task2 completely inside task1
    const task7 = { startTime: '09:00', endTime: '11:00' };
    const task8 = { startTime: '09:30', endTime: '10:30' };
    expect(fortudo.tasksOverlap(task7, task8)).toBe(true);

    // Task1 completely inside task2
    const task9 = { startTime: '09:30', endTime: '10:30' };
    const task10 = { startTime: '09:00', endTime: '11:00' };
    expect(fortudo.tasksOverlap(task9, task10)).toBe(true);

    // No overlap
    const task11 = { startTime: '09:00', endTime: '10:00' };
    const task12 = { startTime: '10:00', endTime: '11:00' };
    expect(fortudo.tasksOverlap(task11, task12)).toBe(false);
  });

  test('isValidTaskForm validates form data correctly', () => {
    // Create a mock form
    const form = /** @type {HTMLFormElement} */(document.getElementById('task-form'));

    // Test valid form with positive duration
    Object.defineProperty(form, 'checkValidity', {
      value: jest.fn().mockReturnValue(true)
    });
    expect(fortudo.isValidTaskForm(form, 30)).toBe(true);
    expect(form.checkValidity).toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();

    // Test invalid form
    // @ts-ignore
    form.checkValidity.mockReturnValue(false);
    expect(fortudo.isValidTaskForm(form, 30)).toBe(false);

    // Test valid form with zero duration
    // @ts-ignore
    form.checkValidity.mockReturnValue(true);
    expect(fortudo.isValidTaskForm(form, 0)).toBe(false);
    expect(window.alert).toHaveBeenCalledWith('Please enter a valid duration for your task.');
  });

  test('addTask adds a task to the tasks array', () => {
    // Create a task
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

    // Verify task was added
    expect(fortudo.tasks.length).toBe(1);
    expect(fortudo.tasks[0].description).toBe('Test Task');
    expect(fortudo.tasks[0].startTime).toBe('09:00');
    expect(fortudo.tasks[0].endTime).toBe('10:00');
    expect(fortudo.tasks[0].duration).toBe(60);
    expect(fortudo.tasks[0].status).toBe('incomplete');
  });

  test('updateTask updates an existing task', () => {
    // Create and add an initial task
    const initialTask = {
      description: 'Initial Task',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    fortudo.addTask(initialTask);

    // Create updated task data
    const updatedTask = {
      description: 'Updated Task',
      startTime: '10:00',
      endTime: '11:30',
      duration: 90,
      status: 'incomplete',
      editing: true, // This should be set to false after update
      confirmingDelete: false
    };

    // Update the task
    fortudo.updateTask(0, updatedTask);

    // Verify task was updated
    expect(fortudo.tasks.length).toBe(1);
    expect(fortudo.tasks[0].description).toBe('Updated Task');
    expect(fortudo.tasks[0].startTime).toBe('10:00');
    expect(fortudo.tasks[0].endTime).toBe('11:30');
    expect(fortudo.tasks[0].duration).toBe(90);
    expect(fortudo.tasks[0].editing).toBe(false); // Should be set to false
  });

  test('completeTask marks a task as completed', () => {
    // Create and add a task
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

    // Complete the task
    fortudo.completeTask(0);

    // Verify task was marked as completed
    expect(fortudo.tasks[0].status).toBe('completed');
  });

  test('deleteTask removes a task when confirmed', () => {
    // Create and add two tasks
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
      startTime: '10:00',
      endTime: '11:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    fortudo.addTask(task1);
    fortudo.addTask(task2);

    // Delete the first task with confirmation
    fortudo.deleteTask(0, true);

    // Verify task was deleted
    expect(fortudo.tasks.length).toBe(1);
    expect(fortudo.tasks[0].description).toBe('Task 2');
  });

  test('deleteTask sets confirmingDelete flag when not confirmed', () => {
    // Create and add a task
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

    // Call deleteTask without confirmation
    fortudo.deleteTask(0, false);

    // Verify confirmingDelete flag was set
    expect(fortudo.tasks[0].confirmingDelete).toBe(true);
    expect(fortudo.tasks.length).toBe(1); // Task still exists
  });

  test('editTask sets editing flag', () => {
    // Create and add a task
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

    // Edit the task
    fortudo.editTask(0);

    // Verify editing flag was set
    expect(fortudo.tasks[0].editing).toBe(true);
  });

  test('cancelEdit clears editing flag', () => {
    // Create and add a task with editing flag set
    const task = {
      description: 'Test Task',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: true,
      confirmingDelete: false
    };
    fortudo.addTask(task);

    // Cancel the edit
    fortudo.cancelEdit(0);

    // Verify editing flag was cleared
    expect(fortudo.tasks[0].editing).toBe(false);
  });

  test('deleteAllTasks removes all tasks when confirmed', () => {
    // Create and add multiple tasks
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
      startTime: '10:00',
      endTime: '11:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    fortudo.addTask(task1);
    fortudo.addTask(task2);

    // Mock window.confirm to return true
    window.confirm = jest.fn().mockReturnValue(true);

    // Call deleteAllTasks
    fortudo.deleteAllTasks();

    // Verify all tasks were deleted
    expect(fortudo.tasks.length).toBe(0);
    expect(window.confirm).toHaveBeenCalled();
  });

  test('deleteAllTasks does not remove tasks when not confirmed', () => {
    // Create and add a task
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

    // Ensure we start with exactly one task
    expect(fortudo.tasks.length).toBe(1);

    // Mock window.confirm to return false
    const originalConfirm = window.confirm;
    window.confirm = jest.fn().mockReturnValue(false);

    try {
      // Call deleteAllTasks
      fortudo.deleteAllTasks();

      // Verify tasks were not deleted
      expect(fortudo.tasks.length).toBe(1);
      expect(window.confirm).toHaveBeenCalled();
    } finally {
      // Restore original confirm
      window.confirm = originalConfirm;
    }
  });

  test('prevents creating tasks with zero duration', () => {
    // Create a mock form with a pre-defined checkValidity method
    const mockForm = {
      checkValidity: jest.fn().mockReturnValue(true)
    };

    // Use the mock form directly, with forced type coercion for test purposes
    // @ts-ignore - Using a simplified mock instead of a full HTMLFormElement
    const result = fortudo.isValidTaskForm(mockForm, 0);

    // Verify the behavior
    expect(result).toBe(false);

    // Verify alert was called with appropriate message
    expect(window.alert).toHaveBeenCalledWith('Please enter a valid duration for your task.');
  });
});
/**
 * @jest-environment jsdom
 */

// This file contains integration tests for fortudo
// These tests focus on multiple components working together

// Import common test setup
const { setupFortudoForTesting } = require('./test-utils');
// Mock storage.js specifically for saveTasks behavior in these integration tests
// setupFortudoForTesting already mocks localStorage, but task-manager uses saveTasks.
import { saveTasks } from '../public/js/storage.js';
jest.mock('../public/js/storage.js');


/** @type {import('./test-utils').Fortudo} */
let fortudo;

// Set up fortudo before all tests
beforeAll(async () => {
  fortudo = await setupFortudoForTesting();
});

// Clear mocks and reset tasks after each test
afterEach(() => {
  jest.clearAllMocks();
  // Clear tasks by re-setting them in the task manager via the app's interface if possible,
  // or directly if the test setup allows for it.
  // For now, fortudo.tasks.length = 0 will clear the array that task-manager also references via getTasks()
  // if window.fortudo.tasks is properly linked to taskManager.getTasks() in app.js.
  if (fortudo && fortudo.tm && typeof fortudo.tm.setTasks === 'function') {
    fortudo.tm.setTasks([]); // Prefer using the task manager's own reset mechanism
  } else if (fortudo && fortudo.tasks) {
     fortudo.tasks.length = 0; // Fallback if direct task manager access isn't set up on fortudo
  }
  saveTasks.mockClear(); // Clear saveTasks mock calls
});

describe('Auto-rescheduling Tests', () => {
  test('handles cascading rescheduling of multiple tasks', () => {
    // Add sequential tasks
    const task1 = {
      description: 'First Task',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };

    const task2 = {
      description: 'Second Task',
      startTime: '10:00',
      endTime: '11:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };

    const task3 = {
      description: 'Third Task',
      startTime: '11:00',
      endTime: '12:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };

    // Add tasks
    fortudo.addTask(task1);
    fortudo.addTask(task2);
    fortudo.addTask(task3);

    // This test is trying to mock autoReschedule on the fortudo object.
    // However, autoReschedule is now an internal function within task-manager.js,
    // and app.js calls specific task manager functions like addTask, updateTask.
    // The integration test should verify the outcome of these actions rather than mocking autoReschedule directly on fortudo.
    // For this phase, we'll adapt it to check the side-effects (tasks reordering, saveTasks calls).

    // Mock confirm to always return true for UI interactions handled by app.js
    window.confirm = jest.fn().mockReturnValue(true);

    // Add tasks
    fortudo.addTask(task1);
    fortudo.addTask(task2);
    fortudo.addTask(task3);
    expect(saveTasks).toHaveBeenCalledTimes(3); // Once for each addTask

    // Create an updated task that will cause a cascade
    const updatedTask1Data = {
      description: task1.description, // Keep description
      startTime: task1.startTime,   // Keep original start time
      duration: 90                  // New duration
    };
    // updateTask is now called from app.js, which calls taskManager.updateTask
    // taskManager.updateTask internally calls autoReschedule.
    fortudo.updateTask(0, updatedTask1Data); // updateTask on fortudo should map to taskManager.updateTask

    // Verify tasks are rescheduled and saveTasks was called
    // Task 1: 09:00 - 10:30 (duration 90)
    // Task 2: 10:30 - 11:30 (pushed back)
    // Task 3: 11:30 - 12:30 (pushed back)
    const tasks = fortudo.tasks; // Assuming fortudo.tasks is linked to getTasks()
    expect(tasks[0].description).toBe('First Task');
    expect(tasks[0].startTime).toBe('09:00');
    expect(tasks[0].endTime).toBe('10:30');
    expect(tasks[0].duration).toBe(90);

    expect(tasks[1].description).toBe('Second Task');
    expect(tasks[1].startTime).toBe('10:30');
    expect(tasks[1].endTime).toBe('11:30');

    expect(tasks[2].description).toBe('Third Task');
    expect(tasks[2].startTime).toBe('11:30');
    expect(tasks[2].endTime).toBe('12:30');

    expect(saveTasks).toHaveBeenCalledTimes(3 + 1); // 3 from addTask, 1 from updateTask
    expect(window.confirm).toHaveBeenCalled(); // app.js calls confirm for overlap
  });

  test('preserves task order and cascades rescheduling through subsequent tasks after late completion', () => {
    // Setup window.confirm mock to always return true for any confirmation dialogs
    // This is essential because addTask and autoReschedule ask for confirmation
    window.confirm = jest.fn().mockReturnValue(true);

    // Mocking of renderTasks and updateLocalStorage is not needed here
    // as we are testing the logic including calls to saveTasks (which replaced updateLocalStorage)

    // Initial tasks
    const taskA = {
        description: 'Task A',
        startTime: '09:00',
        endTime: '09:30',
        duration: 30,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
    };

    const taskB = {
        description: 'Task B',
        startTime: '10:00',
        endTime: '11:00',
        duration: 60,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
    };

    const taskC = {
        description: 'Task C',
        startTime: '13:00',
        endTime: '13:15',
        duration: 15,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
    };

    fortudo.addTask(taskA);
    fortudo.addTask(taskB);
    fortudo.addTask(taskC);
    expect(saveTasks).toHaveBeenCalledTimes(3);


    // Verify initial task positions
    expect(fortudo.tasks[0].description).toBe('Task A');
    expect(fortudo.tasks[0].startTime).toBe('09:00');
    expect(fortudo.tasks[0].endTime).toBe('09:30');

    expect(fortudo.tasks[1].description).toBe('Task B');
    expect(fortudo.tasks[1].startTime).toBe('10:00');
    expect(fortudo.tasks[1].endTime).toBe('11:00');

    expect(fortudo.tasks[2].description).toBe('Task C');
    expect(fortudo.tasks[2].startTime).toBe('13:00');
    expect(fortudo.tasks[2].endTime).toBe('13:15');

    // Create Task D that will conflict with Task A
    const taskD = {
        description: 'Task D',
        startTime: '09:00',
        endTime: '10:00',
        duration: 60,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
    };

    // This should trigger autoReschedule within taskManager, called by app.js
    fortudo.addTask(taskD);
    expect(saveTasks).toHaveBeenCalledTimes(3 + 1); // 1 more call for taskD

    // Verify tasks have been rescheduled correctly after adding Task D
    // Tasks should be sorted by startTime, so after rescheduling:
    // - Task D: 9am-10am (index 0)
    // - Task A: 10am-10:30am (index 1)
    // - Task B: 10:30am-11:30am (index 2)
    // - Task C: 13:00-13:15 (index 3) - should not be affected by Task D yet

    // Verify tasks are in expected state after all additions and autoRescheduling
    expect(fortudo.tasks.length).toBe(4);

    expect(fortudo.tasks[0].description).toBe('Task D');
    expect(fortudo.tasks[0].startTime).toBe('09:00');
    expect(fortudo.tasks[0].endTime).toBe('10:00');

    expect(fortudo.tasks[1].description).toBe('Task A');
    expect(fortudo.tasks[1].startTime).toBe('10:00');
    expect(fortudo.tasks[1].endTime).toBe('10:30');

    expect(fortudo.tasks[2].description).toBe('Task B');
    expect(fortudo.tasks[2].startTime).toBe('10:30');
    expect(fortudo.tasks[2].endTime).toBe('11:30');

    expect(fortudo.tasks[3].description).toBe('Task C');
    expect(fortudo.tasks[3].startTime).toBe('13:00');
    expect(fortudo.tasks[3].endTime).toBe('13:15');

    // Now simulate completing Task D at 1:00pm (later than scheduled)

    // 1. First, we need to add the current-time element with 1:00pm
    let currentTime = '1:00 PM';
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.textContent = currentTime;
    } else {
        const div = document.createElement('div');
        div.id = 'current-time';
        div.textContent = currentTime;
        document.body.appendChild(div);
    }

    // 2. Complete Task D (index 0)
    // This should trigger another reschedule due to the late completion
    fortudo.completeTask(0);

    // 3. Verify tasks have been rescheduled correctly after late completion
    // Expected results:
    // - Task D: 9am-1:00pm (completed, end time adjusted - index 0)
    // - Task A: 1:00pm-1:30pm (moved later - index 1)
    // - Task B: 1:30pm-2:30pm (moved later - index 2)
    // - Task C: 2:30pm-2:45pm (moved later, not overlapping Task D but maintaining order - index 3)

    expect(fortudo.tasks[0].description).toBe('Task D');
    expect(fortudo.tasks[0].status).toBe('completed');
    expect(fortudo.tasks[0].startTime).toBe('09:00');
    expect(fortudo.tasks[0].endTime).toBe('13:00');     // End time should be adjusted to actual completion time
    expect(fortudo.tasks[0].duration).toBe(240);        // Duration should now be 4 hours

    expect(fortudo.tasks[1].description).toBe('Task A');
    expect(fortudo.tasks[1].startTime).toBe('13:00');
    expect(fortudo.tasks[1].endTime).toBe('13:30');

    expect(fortudo.tasks[2].description).toBe('Task B');
    expect(fortudo.tasks[2].startTime).toBe('13:30');
    expect(fortudo.tasks[2].endTime).toBe('14:30');

    expect(fortudo.tasks[3].description).toBe('Task C');
    expect(fortudo.tasks[3].startTime).toBe('14:30');
    expect(fortudo.tasks[3].endTime).toBe('14:45');

    // No need to restore renderTasks/updateLocalStorage as they weren't mocked for this version of the test
  });

  test('only reschedules affected tasks when a task is completed late', () => {
    // Setup window.confirm mock to always return true for any confirmation dialogs
    window.confirm = jest.fn().mockReturnValue(true);

    // No need to mock renderTasks or updateLocalStorage here

    // Initial tasks with specified schedule:
    // Task A: 09:00-10:00
    // Task B: 11:00-11:30
    // Task C: 13:00-14:00
    const taskA = {
        description: 'Task A',
        startTime: '09:00',
        endTime: '10:00',
        duration: 60,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
    };

    const taskB = {
        description: 'Task B',
        startTime: '11:00',
        endTime: '11:30',
        duration: 30,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
    };

    const taskC = {
        description: 'Task C',
        startTime: '13:00',
        endTime: '14:00',
        duration: 60,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
    };

    // Add tasks to the system
    fortudo.addTask(taskA);
    fortudo.addTask(taskB);
    fortudo.addTask(taskC);
    expect(saveTasks).toHaveBeenCalledTimes(3);

    // Verify initial task positions
    expect(fortudo.tasks[0].description).toBe('Task A');
    expect(fortudo.tasks[0].startTime).toBe('09:00');
    expect(fortudo.tasks[0].endTime).toBe('10:00');

    expect(fortudo.tasks[1].description).toBe('Task B');
    expect(fortudo.tasks[1].startTime).toBe('11:00');
    expect(fortudo.tasks[1].endTime).toBe('11:30');

    expect(fortudo.tasks[2].description).toBe('Task C');
    expect(fortudo.tasks[2].startTime).toBe('13:00');
    expect(fortudo.tasks[2].endTime).toBe('14:00');

    // Simulate current time of 12:30 PM (for late completion of Task A)
    const currentTime = '12:30 PM';
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.textContent = currentTime;
    } else {
        const div = document.createElement('div');
        div.id = 'current-time';
        div.textContent = currentTime;
        document.body.appendChild(div);
    }

    // Complete Task A (index 0) at 12:30 PM (later than scheduled)
    // This should trigger rescheduling of Task B but not Task C
    fortudo.completeTask(0);

    // Verify tasks have been rescheduled correctly after late completion
    // Expected results:
    // - Task A: 9am-12:30pm (completed, end time adjusted - index 0)
    // - Task B: 12:30pm-1:00pm (moved later - index 1)
    // - Task C: 1:00pm-2:00pm (unchanged - index 2)

    expect(fortudo.tasks[0].description).toBe('Task A');
    expect(fortudo.tasks[0].status).toBe('completed');
    expect(fortudo.tasks[0].startTime).toBe('09:00');
    expect(fortudo.tasks[0].endTime).toBe('12:30');     // End time should be adjusted to actual completion time
    expect(fortudo.tasks[0].duration).toBe(210);        // Duration should now be 3.5 hours (210 minutes)

    expect(fortudo.tasks[1].description).toBe('Task B');
    expect(fortudo.tasks[1].startTime).toBe('12:30');   // Rescheduled to start after Task A completion
    expect(fortudo.tasks[1].endTime).toBe('13:00');     // Still 30 minutes duration
    expect(fortudo.tasks[1].duration).toBe(30);         // Duration unchanged

    expect(fortudo.tasks[2].description).toBe('Task C');
    expect(fortudo.tasks[2].startTime).toBe('13:00');   // Remains unchanged
    expect(fortudo.tasks[2].endTime).toBe('14:00');     // Remains unchanged
    expect(fortudo.tasks[2].duration).toBe(60);         // Duration unchanged

    // No need to restore renderTasks/updateLocalStorage
  });

  test('reschedules subsequent tasks when a task duration is increased', () => {
    // Add sequential tasks
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

    // Add tasks
    fortudo.addTask(task1);
    fortudo.addTask(task2);

    // Mock confirm to return true
    window.confirm = jest.fn().mockReturnValue(true);

    // Update task1 as being edited with longer duration
    task1.editing = true;

    const updatedTask1 = {
      ...task1,
      endTime: '10:30',
      duration: 90,
      editing: false
    };

    fortudo.updateTask(0, updatedTask1); // This should call taskManager.updateTask
    expect(saveTasks).toHaveBeenCalledTimes(2 + 1); // 2 addTask, 1 updateTask

    // Verify task2 was pushed back
    expect(fortudo.tasks[1].startTime).toBe('10:30');
    expect(fortudo.tasks[1].endTime).toBe('11:30');
  });
});

describe('Complete Task Workflow', () => {
  test('task workflow: add, update, complete, delete', () => {
    // No need to mock renderTasks or updateLocalStorage here
    // window.confirm will be used by app.js for completion confirmation if needed.
    window.confirm = jest.fn().mockReturnValue(true); // Assume user confirms any dialogs

    // 1. Add a new task
    const task = {
      description: 'Task Workflow Test',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };
    fortudo.addTask(task);
    expect(saveTasks).toHaveBeenCalledTimes(1);

    // Verify task was added
    expect(fortudo.tasks.length).toBe(1);
    expect(fortudo.tasks[0].description).toBe('Task Workflow Test');
    expect(fortudo.tasks[0].status).toBe('incomplete');

    // 2. Update the task
    const updatedTask = {
      ...task,
      description: 'Updated Task',
      startTime: '09:30',
      endTime: '10:30',
      duration: 60
    };
    fortudo.updateTask(0, updatedTask);
    expect(saveTasks).toHaveBeenCalledTimes(1 + 1);

    // Verify task was updated
    expect(fortudo.tasks[0].description).toBe('Updated Task');
    expect(fortudo.tasks[0].startTime).toBe('09:30');

    // 3. Complete the task
    // Set current time
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
      timeElement.textContent = '10:15 AM';
    } else {
      const div = document.createElement('div');
      div.id = 'current-time';
      div.textContent = '10:15 AM';
      document.body.appendChild(div);
    }

    fortudo.completeTask(0); // app.js calls taskManager.completeTask
    expect(saveTasks).toHaveBeenCalledTimes(1 + 1 + 1);

    // Verify task was completed
    expect(fortudo.tasks[0].status).toBe('completed');

    // 4. Delete the task
    fortudo.deleteTask(0, true); // app.js calls taskManager.deleteTask
    expect(saveTasks).toHaveBeenCalledTimes(1 + 1 + 1 + 1);

    // Verify task was deleted
    expect(fortudo.tasks.length).toBe(0);
  });
});

describe('Edge Case Tests', () => {
  test('does not reschedule completed tasks', () => {
    // Add a completed task
    const completedTask = {
      description: 'Completed Task',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'completed', // Task is already completed
      editing: false,
      confirmingDelete: false
    };

    // Add an incomplete task with potential overlap
    const newTask = {
      description: 'New Task',
      startTime: '09:30',
      endTime: '10:30',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };

    fortudo.addTask(completedTask);

    // Mock confirm to return true
    window.confirm = jest.fn().mockReturnValue(true);

    fortudo.addTask(newTask); // This will call taskManager.addTask
    expect(saveTasks).toHaveBeenCalledTimes(1 + 1);


    // Verify completed task remains unchanged because autoReschedule in task-manager skips completed tasks.
    expect(fortudo.tasks[0].description).toBe('Completed Task');
    expect(fortudo.tasks[0].startTime).toBe('09:00');
    expect(fortudo.tasks[0].endTime).toBe('10:00');

    // Verify new task remains as is, since it's ok to overlap with completed tasks
    expect(fortudo.tasks[1].startTime).toBe('09:30');
    expect(fortudo.tasks[1].endTime).toBe('10:30');
  });

  test('skips tasks being edited during rescheduling', () => {
    // Add sequential tasks with the middle task being edited
    const task1 = {
      description: 'First Task',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };

    const task2 = {
      description: 'Second Task',
      startTime: '10:00',
      endTime: '11:00',
      duration: 60,
      status: 'incomplete',
      editing: true, // Task is being edited
      confirmingDelete: false
    };

    const task3 = {
      description: 'Third Task',
      startTime: '11:00',
      endTime: '12:00',
      duration: 60,
      status: 'incomplete',
      editing: false,
      confirmingDelete: false
    };

    // Add tasks
    fortudo.addTask(task1);
    fortudo.addTask(task2);
    fortudo.addTask(task3);

    // This test was trying to mock autoReschedule on the fortudo object.
    // The actual autoReschedule logic is in task-manager.js and is not directly mockable from here
    // when testing through app.js integration.
    // The behavior is that task-manager's autoReschedule should ignore tasks that are being edited.
    // We can test this by attempting an operation that would normally reschedule task2.

    // Add tasks
    fortudo.addTask(task1); // saveTasks #1
    fortudo.addTask(task2); // saveTasks #2 - task2.editing is true
    fortudo.addTask(task3); // saveTasks #3
    saveTasks.mockClear(); // Clear after setup

    // Attempt to update task1 to overlap with task2.
    // Since task2.editing is true, it should not be rescheduled.
    // Task3, however, should be rescheduled if task1's new end time overlaps with it.
    const updatedTask1Data = {
        description: task1.description,
        startTime: task1.startTime, // 09:00
        duration: 150 // New duration: 2.5 hours, so ends at 11:30
    };

    window.confirm = jest.fn().mockReturnValue(true); // For app.js confirmation
    fortudo.updateTask(0, updatedTask1Data); // This will call app.js -> taskManager.updateTask -> autoReschedule
    expect(saveTasks).toHaveBeenCalledTimes(1);


    const tasks = fortudo.tasks;
    expect(tasks[0].description).toBe('First Task'); // Updated Task 1
    expect(tasks[0].endTime).toBe('11:30');

    expect(tasks[1].description).toBe('Second Task'); // Task 2 (editing)
    expect(tasks[1].startTime).toBe('10:00'); // Should remain unchanged as it's editing
    expect(tasks[1].endTime).toBe('11:00');

    expect(tasks[2].description).toBe('Third Task'); // Task 3
    // If Task 1 (ends 11:30) overlaps Task 2 (starts 10:00, ends 11:00, but editing)
    // and also overlaps Task 3 (orig 11:00-12:00), Task 3 should be pushed by Task 1.
    // However, task-manager's autoReschedule currently has a simple filter `!task.editing`.
    // If task1 overlaps task2 (editing), task2 is filtered out.
    // Then task1 is compared with task3. If task1 (09:00-11:30) overlaps task3 (11:00-12:00), task3 is moved.
    expect(tasks[2].startTime).toBe('11:30'); // Pushed by the new end time of Task 1
    expect(tasks[2].endTime).toBe('12:30');
  });
});
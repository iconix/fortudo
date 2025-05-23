/**
 * @jest-environment jsdom
 */

// This file contains tests for task management operations in task-manager.js
// These tests focus on task CRUD operations, validation, and internal logic like auto-rescheduling.

import {
    getTasks,
    setTasks,
    addTask,
    updateTask,
    completeTask,
    deleteTask,
    editTask,
    cancelEdit,
    deleteAllTasks,
    isValidTaskData,
    getSuggestedStartTime,
    autoReschedule // autoReschedule is also tested via addTask/updateTask
} from '../public/js/task-manager.js';
import { saveTasks } from '../public/js/storage.js';
import { tasksOverlap, calculateEndTime } from '../public/js/utils.js'; // tasksOverlap is used in one test directly

// Mock the storage module
jest.mock('../public/js/storage.js');

describe('Task Management Functions (task-manager.js)', () => {
    beforeEach(() => {
        setTasks([]); // Reset tasks before each test
        saveTasks.mockClear(); // Clear mock usage counts
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test for tasksOverlap is kept as it was, but using the direct import
    test('tasksOverlap correctly identifies overlapping tasks', () => {
        const task1 = { startTime: '09:00', endTime: '10:00' };
        const task2 = { startTime: '09:00', endTime: '10:00' };
        expect(tasksOverlap(task1, task2)).toBe(true);

        const task3 = { startTime: '09:00', endTime: '10:00' };
        const task4 = { startTime: '09:30', endTime: '10:30' };
        expect(tasksOverlap(task3, task4)).toBe(true);

        const task5 = { startTime: '09:30', endTime: '10:30' };
        const task6 = { startTime: '09:00', endTime: '10:00' };
        expect(tasksOverlap(task5, task6)).toBe(true);

        const task7 = { startTime: '09:00', endTime: '11:00' };
        const task8 = { startTime: '09:30', endTime: '10:30' };
        expect(tasksOverlap(task7, task8)).toBe(true);

        const task9 = { startTime: '09:30', endTime: '10:30' };
        const task10 = { startTime: '09:00', endTime: '11:00' };
        expect(tasksOverlap(task9, task10)).toBe(true);

        const task11 = { startTime: '09:00', endTime: '10:00' };
        const task12 = { startTime: '10:00', endTime: '11:00' }; // Adjacent, not overlapping
        expect(tasksOverlap(task11, task12)).toBe(false);
    });

    describe('isValidTaskData', () => {
        test('should return valid for correct data', () => {
            expect(isValidTaskData('Test Task', 30)).toEqual({ isValid: true });
        });

        test('should return invalid if description is empty', () => {
            expect(isValidTaskData('', 30)).toEqual({ isValid: false, reason: "Description cannot be empty." });
            expect(isValidTaskData('   ', 30)).toEqual({ isValid: false, reason: "Description cannot be empty." });
        });

        test('should return invalid if duration is zero or negative', () => {
            expect(isValidTaskData('Test Task', 0)).toEqual({ isValid: false, reason: "Duration must be a positive number." });
            expect(isValidTaskData('Test Task', -10)).toEqual({ isValid: false, reason: "Duration must be a positive number." });
        });
         test('should return invalid if duration is NaN', () => {
            expect(isValidTaskData('Test Task', NaN)).toEqual({ isValid: false, reason: "Duration must be a positive number." });
        });
    });

    describe('addTask', () => {
        test('should add a valid task and save', () => {
            const taskData = { description: 'New Task', startTime: '09:00', duration: 60 };
            const result = addTask(taskData);
            expect(result.success).toBe(true);
            expect(result.task).toMatchObject(taskData);
            expect(getTasks().length).toBe(1);
            expect(getTasks()[0].description).toBe('New Task');
            expect(saveTasks).toHaveBeenCalledWith(getTasks());
        });

        test('should not add an invalid task', () => {
            const taskData = { description: '', startTime: '09:00', duration: 0 };
            const result = addTask(taskData);
            expect(result.success).toBe(false);
            expect(result.reason).toBeDefined();
            expect(getTasks().length).toBe(0);
            expect(saveTasks).not.toHaveBeenCalled();
        });
    });

    describe('updateTask', () => {
        beforeEach(() => {
            // Add an initial task for update tests
            addTask({ description: 'Initial Task', startTime: '09:00', duration: 60 });
            saveTasks.mockClear(); // Clear after initial addTask
        });

        test('should update an existing task and save', () => {
            const updatedData = { description: 'Updated Task', startTime: '10:00', duration: 30 };
            const result = updateTask(0, updatedData);
            expect(result.success).toBe(true);
            const tasks = getTasks();
            expect(tasks[0].description).toBe('Updated Task');
            expect(tasks[0].startTime).toBe('10:00');
            expect(tasks[0].duration).toBe(30);
            expect(tasks[0].editing).toBe(false);
            expect(saveTasks).toHaveBeenCalledWith(tasks);
        });

        test('should not update with invalid data', () => {
            const updatedData = { description: '', startTime: '10:00', duration: 0 };
            const result = updateTask(0, updatedData);
            expect(result.success).toBe(false);
            expect(result.reason).toBeDefined();
            const tasks = getTasks();
            expect(tasks[0].description).toBe('Initial Task'); // Should not have changed
            expect(saveTasks).not.toHaveBeenCalled();
        });

        test('should return error for invalid index', () => {
            const result = updateTask(5, { description: 'Task', startTime: '10:00', duration: 30 });
            expect(result.success).toBe(false);
            expect(result.reason).toBe("Invalid task index.");
        });
    });

    describe('completeTask', () => {
        beforeEach(() => {
            addTask({ description: 'Test Task', startTime: '09:00', duration: 60 }); // endTime '10:00'
            saveTasks.mockClear();
        });

        test('should mark a task as completed and save', () => {
            const result = completeTask(0);
            expect(result.success).toBe(true);
            expect(getTasks()[0].status).toBe('completed');
            expect(saveTasks).toHaveBeenCalledWith(getTasks());
        });

        test('should adjust endTime if completed late and save', () => {
            const currentTime = '10:30'; // Task ends at 10:00
            const result = completeTask(0, currentTime);
            expect(result.success).toBe(true);
            expect(result.requiresConfirmation).toBe(true); // Indicates UI should confirm
            expect(result.confirmationType).toBe('COMPLETE_LATE');
            expect(getTasks()[0].status).toBe('completed');
            expect(getTasks()[0].endTime).toBe(currentTime);
            expect(getTasks()[0].duration).toBe(90); // 09:00 to 10:30
            expect(saveTasks).toHaveBeenCalledTimes(1); // autoReschedule might call it again if there were overlaps
        });
         test('should adjust endTime if completed early and save', () => {
            const currentTime = '09:30'; // Task ends at 10:00, started at 09:00
            const result = completeTask(0, currentTime);
            expect(result.success).toBe(true);
            expect(getTasks()[0].status).toBe('completed');
            expect(getTasks()[0].endTime).toBe(currentTime);
            expect(getTasks()[0].duration).toBe(30); // 09:00 to 09:30
            expect(saveTasks).toHaveBeenCalledWith(getTasks());
        });
    });

    describe('deleteTask', () => {
        beforeEach(() => {
            addTask({ description: 'Task 1', startTime: '09:00', duration: 60 });
            addTask({ description: 'Task 2', startTime: '10:00', duration: 60 });
            saveTasks.mockClear();
        });

        test('should remove a task if confirmed and save', () => {
            const result = deleteTask(0, true);
            expect(result.success).toBe(true);
            expect(getTasks().length).toBe(1);
            expect(getTasks()[0].description).toBe('Task 2');
            expect(saveTasks).toHaveBeenCalledWith(getTasks());
        });

        test('should require confirmation if not confirmed, and set flag', () => {
            const result = deleteTask(0, false);
            expect(result.success).toBe(false);
            expect(result.requiresConfirmation).toBe(true);
            expect(getTasks().length).toBe(2); // Task still exists
            expect(getTasks()[0].confirmingDelete).toBe(true);
            expect(saveTasks).not.toHaveBeenCalled(); // Not saved yet
        });
    });

    describe('editTask / cancelEdit', () => {
        beforeEach(() => {
            addTask({ description: 'Test Task', startTime: '09:00', duration: 60 });
            saveTasks.mockClear();
        });

        test('editTask should set editing flag and clear confirmingDelete', () => {
            getTasks()[0].confirmingDelete = true; // Set it first
            const result = editTask(0);
            expect(result.success).toBe(true);
            expect(getTasks()[0].editing).toBe(true);
            expect(getTasks()[0].confirmingDelete).toBe(false);
            expect(saveTasks).not.toHaveBeenCalled(); // UI state change only
        });

        test('cancelEdit should clear editing flag', () => {
            getTasks()[0].editing = true; // Set it first
            const result = cancelEdit(0);
            expect(result.success).toBe(true);
            expect(getTasks()[0].editing).toBe(false);
            expect(saveTasks).not.toHaveBeenCalled(); // UI state change only
        });
    });

    describe('deleteAllTasks', () => {
        beforeEach(() => {
            addTask({ description: 'Task 1', startTime: '09:00', duration: 60 });
            addTask({ description: 'Task 2', startTime: '10:00', duration: 60 });
            saveTasks.mockClear();
        });

        test('should remove all tasks if confirmed and save', () => {
            const result = deleteAllTasks(true);
            expect(result.success).toBe(true);
            expect(getTasks().length).toBe(0);
            expect(saveTasks).toHaveBeenCalledWith([]);
        });

        test('should require confirmation if not confirmed (and tasks exist)', () => {
            const result = deleteAllTasks(false);
            expect(result.success).toBe(false);
            expect(result.requiresConfirmation).toBe(true);
            expect(getTasks().length).toBe(2); // Tasks still exist
            expect(saveTasks).not.toHaveBeenCalled();
        });

        test('should do nothing and return success if no tasks and confirmed', () => {
            setTasks([]); // Clear tasks
            saveTasks.mockClear();
            const result = deleteAllTasks(true);
            expect(result.success).toBe(true);
            expect(getTasks().length).toBe(0);
            expect(saveTasks).toHaveBeenCalledWith([]); // Saves empty array
        });
         test('should do nothing and return success if no tasks and not confirmed', () => {
            setTasks([]);
            saveTasks.mockClear();
            const result = deleteAllTasks(false); // If no tasks, no confirmation needed
            expect(result.success).toBe(true); // Or should be {success: false, requiresConfirmation: false}? Current logic is true.
            expect(getTasks().length).toBe(0);
            expect(saveTasks).not.toHaveBeenCalled();
        });
    });

    describe('autoReschedule', () => {
        test('should reschedule overlapping tasks', () => {
            const task1 = { description: 'Task 1', startTime: '09:00', duration: 60 }; // Ends 10:00
            const task2 = { description: 'Task 2', startTime: '09:30', duration: 60 }; // Ends 10:30 (overlaps T1)
            const task3 = { description: 'Task 3', startTime: '09:45', duration: 30 }; // Ends 10:15 (overlaps T1 & potentially T2)
            setTasks([
                { ...task1, endTime: calculateEndTime(task1.startTime, task1.duration), status: 'incomplete', editing: false, confirmingDelete: false },
                { ...task2, endTime: calculateEndTime(task2.startTime, task2.duration), status: 'incomplete', editing: false, confirmingDelete: false },
                { ...task3, endTime: calculateEndTime(task3.startTime, task3.duration), status: 'incomplete', editing: false, confirmingDelete: false },
            ]);
            
            // Simulate adding a new task that overlaps
            const newTaskData = { description: 'New Task', startTime: '09:15', duration: 30 }; // Ends 09:45
            addTask(newTaskData); // This will call autoReschedule internally

            const tasks = getTasks();
            // Expected order: New Task (09:15-09:45), Task 1 (09:45-10:45), Task 2 (10:45-11:45), Task 3 (11:45-12:15)
            expect(tasks.find(t => t.description === 'New Task').startTime).toBe('09:15');
            expect(tasks.find(t => t.description === 'New Task').endTime).toBe('09:45');

            expect(tasks.find(t => t.description === 'Task 1').startTime).toBe('09:45');
            expect(tasks.find(t => t.description === 'Task 1').endTime).toBe('10:45');
            
            expect(tasks.find(t => t.description === 'Task 2').startTime).toBe('10:45');
            expect(tasks.find(t => t.description === 'Task 2').endTime).toBe('11:45');

            expect(tasks.find(t => t.description === 'Task 3').startTime).toBe('11:45');
            expect(tasks.find(t => t.description === 'Task 3').endTime).toBe('12:15');
            expect(saveTasks).toHaveBeenCalled();
        });
    });
});
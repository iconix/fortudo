/**
 * @jest-environment jsdom
 */

// This file contains tests for task management operations in task-manager.js
// These tests focus on task CRUD operations, validation, and internal logic like auto-rescheduling.

import {
    getTaskState,
    updateTaskState,
    addTask,
    updateTask,
    completeTask,
    deleteTask,
    editTask,
    cancelEdit,
    deleteAllTasks,
    isValidTaskData,
    checkOverlap,
    performReschedule,
    confirmAddTaskAndReschedule,
    confirmUpdateTaskAndReschedule,
    confirmCompleteLate,
    getSuggestedStartTime,
    tasksOverlap
} from '../public/js/task-manager.js';
import { calculateEndTime, calculateMinutes } from '../public/js/utils.js';

// Mock the storage module
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn()
}));

// Import the mocked saveTasks
import { saveTasks } from '../public/js/storage.js';

const mockSaveTasks = jest.mocked(saveTasks);

describe('Task Management Functions (task-manager.js)', () => {
    beforeEach(() => {
        updateTaskState([]);
        mockSaveTasks.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('tasksOverlap utility', () => {
        test('tasksOverlap correctly identifies overlapping tasks', () => {
            // Helper to create minimal task objects for overlap testing
            const createTaskForOverlap = (startTime, endTime) => ({
                description: 'Test Task',
                startTime,
                endTime,
                duration: calculateMinutes(endTime) - calculateMinutes(startTime),
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });

            const task1 = createTaskForOverlap('09:00', '10:00');
            const task2 = createTaskForOverlap('09:00', '10:00'); // Full overlap
            expect(tasksOverlap(task1, task2)).toBe(true);

            const task3 = createTaskForOverlap('09:00', '10:00');
            const task4 = createTaskForOverlap('09:30', '10:30'); // Partial overlap (task4 starts during task3)
            expect(tasksOverlap(task3, task4)).toBe(true);

            const task5 = createTaskForOverlap('09:30', '10:30');
            const task6 = createTaskForOverlap('09:00', '10:00'); // Partial overlap (task5 starts during task6)
            expect(tasksOverlap(task5, task6)).toBe(true);

            const task7 = createTaskForOverlap('09:00', '11:00');
            const task8 = createTaskForOverlap('09:30', '10:30'); // Task8 contained within Task7
            expect(tasksOverlap(task7, task8)).toBe(true);

            const task9 = createTaskForOverlap('09:30', '10:30');
            const task10 = createTaskForOverlap('09:00', '11:00'); // Task9 contained within Task10
            expect(tasksOverlap(task9, task10)).toBe(true);

            const task11 = createTaskForOverlap('09:00', '10:00');
            const task12 = createTaskForOverlap('10:00', '11:00'); // Adjacent, not overlapping
            expect(tasksOverlap(task11, task12)).toBe(false);

            const task13 = createTaskForOverlap('09:00', '10:00');
            const task14 = createTaskForOverlap('10:01', '11:00'); // Not overlapping
            expect(tasksOverlap(task13, task14)).toBe(false);

            const task15 = createTaskForOverlap('09:00', '10:00');
            const task16 = createTaskForOverlap('08:00', '09:00'); // Adjacent, not overlapping
            expect(tasksOverlap(task15, task16)).toBe(false);
        });
    });

    describe('Midnight Crossing Time Handling (tasksOverlap)', () => {
        // Helper to create minimal task objects for overlap testing
        const createTaskForOverlap = (startTime, endTime) => ({
            description: 'Test Task',
            startTime,
            endTime,
            duration: calculateMinutes(endTime) - calculateMinutes(startTime),
            status: 'incomplete',
            editing: false,
            confirmingDelete: false
        });

        test('handles times that cross midnight correctly', () => {
            const lateNightTask = createTaskForOverlap('23:00', '00:30');
            const earlyMorningTask = createTaskForOverlap('00:15', '01:00');
            expect(tasksOverlap(lateNightTask, earlyMorningTask)).toBe(true);

            const eveningTask = createTaskForOverlap('22:00', '00:00');
            const morningTask = createTaskForOverlap('00:00', '02:00');
            expect(tasksOverlap(eveningTask, morningTask)).toBe(false);
        });

        test('handles complex midnight-crossing task overlaps correctly', () => {
            const longEveningTask = createTaskForOverlap('20:00', '02:00');
            const midnightTask = createTaskForOverlap('23:30', '00:30');
            expect(tasksOverlap(longEveningTask, midnightTask)).toBe(true);

            const multiDayTask = createTaskForOverlap('22:00', '08:00');
            const morningTask = createTaskForOverlap('07:00', '08:30');
            expect(tasksOverlap(multiDayTask, morningTask)).toBe(true);

            const mondayTask = createTaskForOverlap('23:00', '00:30');
            const tuesdayEveningTask = createTaskForOverlap('20:00', '22:00');
            expect(tasksOverlap(mondayTask, tuesdayEveningTask)).toBe(false);
        });
    });

    describe('isValidTaskData', () => {
        test('should return valid for correct data', () => {
            expect(isValidTaskData('Test Task', 30)).toEqual({ isValid: true });
        });

        test('should return invalid if description is empty', () => {
            expect(isValidTaskData('', 30)).toEqual({
                isValid: false,
                reason: 'Description cannot be empty.'
            });
            expect(isValidTaskData('   ', 30)).toEqual({
                isValid: false,
                reason: 'Description cannot be empty.'
            });
        });

        test('should return invalid if duration is zero or negative', () => {
            expect(isValidTaskData('Test Task', 0)).toEqual({
                isValid: false,
                reason: 'Duration must be a positive number.'
            });
            expect(isValidTaskData('Test Task', -10)).toEqual({
                isValid: false,
                reason: 'Duration must be a positive number.'
            });
        });
        test('should return invalid if duration is NaN', () => {
            expect(isValidTaskData('Test Task', NaN)).toEqual({
                isValid: false,
                reason: 'Duration must be a positive number.'
            });
        });
    });

    describe('checkOverlap', () => {
        // Helper to create mock tasks for checkOverlap tests
        const createMockTask = (
            desc,
            startTime,
            duration,
            status = 'incomplete',
            editing = false
        ) => ({
            description: desc,
            startTime,
            duration,
            endTime: calculateEndTime(startTime, duration),
            status,
            editing,
            confirmingDelete: false
        });

        let existingTasks;

        beforeEach(() => {
            updateTaskState([]);
            existingTasks = [
                createMockTask('T1', '09:00', 60), // 09:00 - 10:00
                createMockTask('T2', '10:00', 60), // 10:00 - 11:00
                createMockTask('T3 Completed', '11:00', 60, 'completed'), // 11:00 - 12:00
                createMockTask('T4 Editing', '12:00', 60, 'incomplete', true) // 12:00 - 13:00
            ];
        });

        test('should return empty array if no tasks overlap', () => {
            const newTask = createMockTask('New', '08:00', 30); // 08:00 - 08:30
            expect(checkOverlap(newTask, existingTasks)).toEqual([]);
        });

        test('should identify full overlap', () => {
            const newTask = createMockTask('New', '09:00', 60); // Overlaps T1
            expect(checkOverlap(newTask, existingTasks).map((t) => t.description)).toEqual(['T1']);
        });

        test('should identify partial overlap (starts before, ends during)', () => {
            const newTask = createMockTask('New', '08:30', 60); // 08:30 - 09:30 (overlaps T1)
            expect(checkOverlap(newTask, existingTasks).map((t) => t.description)).toEqual(['T1']);
        });

        test('should identify partial overlap (starts during, ends after)', () => {
            const newTask = createMockTask('New', '09:30', 60); // 09:30 - 10:30 (overlaps T1 and T2)
            const overlaps = checkOverlap(newTask, existingTasks);
            expect(overlaps.map((t) => t.description).sort()).toEqual(['T1', 'T2'].sort());
        });

        test('should identify when new task is contained within an existing task', () => {
            const newTask = createMockTask('New', '09:15', 30); // 09:15 - 09:45 (contained in T1)
            expect(checkOverlap(newTask, existingTasks).map((t) => t.description)).toEqual(['T1']);
        });

        test('should identify when new task contains an existing task', () => {
            const newTask = createMockTask('New', '08:00', 180); // 08:00 - 11:00 (contains T1 and T2)
            const overlaps = checkOverlap(newTask, existingTasks);
            expect(overlaps.map((t) => t.description).sort()).toEqual(['T1', 'T2'].sort());
        });

        test('should not consider completed tasks for overlap', () => {
            const newTask = createMockTask('New', '11:00', 60); // Same time as T3 Completed
            expect(checkOverlap(newTask, existingTasks)).toEqual([]);
        });

        test('should not consider tasks being edited for overlap', () => {
            const newTask = createMockTask('New', '12:00', 60); // Same time as T4 Editing
            expect(checkOverlap(newTask, existingTasks)).toEqual([]);
        });

        test('should handle adjacent tasks correctly (no overlap)', () => {
            const newTask = createMockTask('New', '08:00', 60); // 08:00 - 09:00 (adjacent to T1)
            expect(checkOverlap(newTask, existingTasks)).toEqual([]);
            const newTask2 = createMockTask('New2', '13:00', 60); // 13:00 - 14:00 (adjacent to T4 Editing, but T4 is ignored)
            expect(checkOverlap(newTask2, existingTasks)).toEqual([]);
        });
        test('should not overlap with itself (if accidentally included in existingTasks)', () => {
            const newTask = createMockTask('New', '09:00', 60);
            const tasksWithSelf = [...existingTasks, newTask];
            expect(checkOverlap(newTask, tasksWithSelf).map((t) => t.description)).toEqual(['T1']);
        });

        // Optimization-specific tests for checkOverlap
        test('should correctly detect overlaps with cached time values', () => {
            // Create tasks with known time values
            const task1 = {
                description: 'Task 1',
                startTime: '09:00',
                endTime: '10:30',
                duration: 90,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                _startMinutes: 540, // Pre-cached
                _endMinutes: 630
            };

            const task2 = {
                description: 'Task 2',
                startTime: '10:00',
                endTime: '11:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                _startMinutes: 600, // Pre-cached
                _endMinutes: 660
            };

            const overlaps = checkOverlap(task1, [task2]);
            expect(overlaps).toHaveLength(1);
            expect(overlaps[0].description).toBe('Task 2');
        });

        test('should handle tasks without cached values by generating them', () => {
            const task1 = {
                description: 'Task 1',
                startTime: '09:00',
                endTime: '10:30',
                duration: 90,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
                // No cached values
            };

            const task2 = {
                description: 'Task 2',
                startTime: '10:00',
                endTime: '11:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
                // No cached values
            };

            const overlaps = checkOverlap(task1, [task2]);
            expect(overlaps).toHaveLength(1);
            expect(overlaps[0].description).toBe('Task 2');

            // Verify cached values were generated
            expect(task1._startMinutes).toBe(540);
            expect(task1._endMinutes).toBe(630);
            expect(task2._startMinutes).toBe(600);
            expect(task2._endMinutes).toBe(660);
        });

        test('should handle tasks with inherited stale cached values', () => {
            // Create a task with stale cached values (simulating spread operator copying)
            const originalTask = {
                description: 'Original',
                startTime: '09:00',
                endTime: '10:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                _startMinutes: 540, // Correct for 09:00
                _endMinutes: 600 // Correct for 10:00
            };

            // Create a modified task with stale cached values
            const modifiedTask = {
                ...originalTask,
                startTime: '10:00', // Changed time
                endTime: '11:00', // Changed time
                _startMinutes: 540, // Stale - still shows 09:00
                _endMinutes: 600 // Stale - still shows 10:00
            };

            // Verify the task initially has stale cached values
            expect(modifiedTask._startMinutes).toBe(540); // Stale value
            expect(modifiedTask._endMinutes).toBe(600); // Stale value

            // Test overlap detection with another task
            const otherTask = {
                description: 'Other',
                startTime: '10:30',
                endTime: '11:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };

            const overlaps = checkOverlap(modifiedTask, [otherTask]);

            // Should detect overlap correctly despite initially stale cached values
            expect(overlaps).toHaveLength(1);
            expect(overlaps[0].description).toBe('Other');

            // Verify cached values were corrected during the checkOverlap call
            expect(modifiedTask._startMinutes).toBe(600); // 10:00 - corrected
            expect(modifiedTask._endMinutes).toBe(660); // 11:00 - corrected
        });

        test('should handle midnight crossing with cached values', () => {
            const lateTask = {
                description: 'Late Task',
                startTime: '23:30',
                endTime: '01:00', // Crosses midnight
                duration: 90,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };

            const earlyTask = {
                description: 'Early Task',
                startTime: '00:30',
                endTime: '01:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };

            const overlaps = checkOverlap(lateTask, [earlyTask]);
            expect(overlaps).toHaveLength(1);
            expect(overlaps[0].description).toBe('Early Task');

            // Verify cached values are correct for midnight crossing
            expect(lateTask._startMinutes).toBe(1410); // 23:30 = 23.5 * 60 = 1410
            expect(lateTask._endMinutes).toBe(60); // 01:00 = 1 * 60 = 60
            expect(earlyTask._startMinutes).toBe(30); // 00:30 = 0.5 * 60 = 30
            expect(earlyTask._endMinutes).toBe(90); // 01:30 = 1.5 * 60 = 90
        });
    });

    describe('Time Cache Management', () => {
        test('should add cached time values to new tasks', () => {
            const result = addTask({
                description: 'Test Task',
                startTime: '09:00',
                duration: 60
            });

            expect(result.success).toBe(true);
            const tasks = getTaskState();
            const task = tasks[0];

            // Verify cached time values are present
            expect(task._startMinutes).toBe(540); // 09:00 = 9 * 60 = 540
            expect(task._endMinutes).toBe(600); // 10:00 = 10 * 60 = 600
        });

        test('should invalidate and regenerate cached time values when task is updated', () => {
            // Add initial task
            addTask({
                description: 'Test Task',
                startTime: '09:00',
                duration: 60
            });

            const tasks = getTaskState();
            const originalTask = tasks[0];

            // Verify initial cached values
            expect(originalTask._startMinutes).toBe(540); // 09:00
            expect(originalTask._endMinutes).toBe(600); // 10:00

            // Update the task
            updateTask(0, {
                startTime: '10:00',
                duration: 90
            });

            const updatedTasks = getTaskState();
            const updatedTask = updatedTasks[0];

            // Verify cached values were updated
            expect(updatedTask._startMinutes).toBe(600); // 10:00 = 10 * 60 = 600
            expect(updatedTask._endMinutes).toBe(690); // 11:30 = 11.5 * 60 = 690
        });

        test('should handle tasks loaded from storage without cached values', () => {
            // Simulate loading tasks from storage (without cached values)
            const tasksFromStorage = [
                {
                    description: 'Loaded Task',
                    startTime: '09:00',
                    endTime: '10:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                    // No _startMinutes or _endMinutes
                }
            ];

            updateTaskState(tasksFromStorage);
            const tasks = getTaskState();
            const task = tasks[0];

            // Verify cached values were added during updateTaskState
            expect(task._startMinutes).toBe(540); // 09:00
            expect(task._endMinutes).toBe(600); // 10:00
        });
    });

    describe('Sorted Tasks Caching', () => {
        test('should maintain sort order when accessing tasks multiple times', () => {
            // Add tasks in non-sorted order
            addTask({ description: 'Task C', startTime: '11:00', duration: 60 });
            addTask({ description: 'Task A', startTime: '09:00', duration: 60 });
            addTask({ description: 'Task B', startTime: '10:00', duration: 60 });

            const tasks1 = getTaskState();
            const tasks2 = getTaskState();

            // Verify tasks are sorted consistently
            expect(tasks1[0].description).toBe('Task A'); // 09:00
            expect(tasks1[1].description).toBe('Task B'); // 10:00
            expect(tasks1[2].description).toBe('Task C'); // 11:00

            expect(tasks2[0].description).toBe('Task A');
            expect(tasks2[1].description).toBe('Task B');
            expect(tasks2[2].description).toBe('Task C');
        });

        test('should update sort order when tasks are modified', () => {
            // Add tasks
            addTask({ description: 'Task A', startTime: '09:00', duration: 60 });
            addTask({ description: 'Task B', startTime: '10:00', duration: 60 });

            let tasks = getTaskState();
            expect(tasks[0].description).toBe('Task A'); // 09:00
            expect(tasks[1].description).toBe('Task B'); // 10:00

            // Update Task A to start later than Task B
            updateTask(0, { startTime: '11:00' });

            tasks = getTaskState();
            expect(tasks[0].description).toBe('Task B'); // 10:00
            expect(tasks[1].description).toBe('Task A'); // 11:00 (moved)
        });
    });

    describe('performReschedule', () => {
        // Helper to create mock tasks for these tests
        const createTask = (id, startTime, duration, status = 'incomplete', editing = false) => ({
            description: `Task ${id}`,
            startTime,
            duration,
            endTime: calculateEndTime(startTime, duration),
            status,
            editing,
            confirmingDelete: false
        });

        beforeEach(() => {
            updateTaskState([]);
            mockSaveTasks.mockClear();
        });

        test('should not shift any tasks if no subsequent tasks exist', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            updateTaskState([taskA]);
            performReschedule(taskA);
            expect(getTaskState()[0].startTime).toBe('09:00');
            expect(getTaskState()[0].endTime).toBe('10:00');
        });

        test('should shift a single subsequent overlapping task', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            const taskB = createTask('B', '09:30', 30); // Original: 09:30 - 10:00
            updateTaskState([taskA, taskB]);

            // Simulate taskA was just updated/added, potentially causing overlap
            performReschedule(taskA);

            const tasks = getTaskState();
            const taskAResult = tasks.find((t) => t.description === 'Task A');
            const taskBResult = tasks.find((t) => t.description === 'Task B');

            expect(taskAResult).toBeDefined();
            expect(taskBResult).toBeDefined();

            if (taskAResult && taskBResult) {
                expect(taskAResult.startTime).toBe('09:00');
                expect(taskAResult.endTime).toBe('10:00');
                expect(taskBResult.startTime).toBe('10:00'); // Shifted
                expect(taskBResult.endTime).toBe('10:30');
            }
        });

        test('should perform cascading reschedule for multiple tasks', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            const taskB = createTask('B', '09:30', 30); // Original: 09:30 - 10:00
            const taskC = createTask('C', '09:45', 30); // Original: 09:45 - 10:15
            updateTaskState([taskA, taskB, taskC]);
            performReschedule(taskA); // taskA's change causes cascade

            const tasks = getTaskState();
            const taskAResult = tasks.find((t) => t.description === 'Task A');
            const taskBResult = tasks.find((t) => t.description === 'Task B');
            const taskCResult = tasks.find((t) => t.description === 'Task C');

            expect(taskAResult).toBeDefined();
            expect(taskBResult).toBeDefined();
            expect(taskCResult).toBeDefined();

            if (taskAResult && taskBResult && taskCResult) {
                expect(taskAResult.endTime).toBe('10:00');
                expect(taskBResult.startTime).toBe('10:00'); // Shifted by A
                expect(taskBResult.endTime).toBe('10:30');
                expect(taskCResult.startTime).toBe('10:30'); // Shifted by B
                expect(taskCResult.endTime).toBe('11:00');
            }
        });

        test('should not shift completed tasks', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            const taskB_completed = createTask('B_completed', '09:30', 30, 'completed'); // Original: 09:30 - 10:00
            updateTaskState([taskA, taskB_completed]);
            performReschedule(taskA);

            expect(taskB_completed.startTime).toBe('09:30'); // Should not change
            expect(taskB_completed.endTime).toBe('10:00');
        });

        test('should not shift tasks currently being edited by the user', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            const taskC_editing = createTask('C_editing', '09:45', 30, 'incomplete', true); // Original: 09:45 - 10:15
            updateTaskState([taskA, taskC_editing]);
            performReschedule(taskA);

            expect(taskC_editing.startTime).toBe('09:45'); // Should not change
            expect(taskC_editing.endTime).toBe('10:15');
        });

        test('taskThatChanged maintains its properties correctly', () => {
            const taskA = createTask('A', '09:00', 60); // Ends 10:00
            const taskB = createTask('B', '10:00', 30); // Starts 10:00
            updateTaskState([taskA, taskB]);

            // Update taskA to overlap with B
            taskA.duration = 90; // Now 09:00 - 10:30
            taskA.endTime = calculateEndTime(taskA.startTime, taskA.duration);

            performReschedule(taskA);

            expect(taskA.startTime).toBe('09:00');
            expect(taskA.endTime).toBe('10:30');

            const tasks = getTaskState();
            const taskBResult = tasks.find((t) => t.description === 'Task B');
            expect(taskBResult).toBeDefined();

            if (taskBResult) {
                expect(taskBResult.startTime).toBe('10:30');
                expect(taskBResult.endTime).toBe('11:00');
            }
        });
        test('should correctly restore editing state of taskThatChanged', () => {
            const taskA_editing = createTask('A_editing', '09:00', 60, 'incomplete', true);
            const taskB = createTask('B', '09:30', 30);
            updateTaskState([taskA_editing, taskB]);

            performReschedule(taskA_editing);
            expect(taskA_editing.editing).toBe(true); // Should be restored

            const tasks = getTaskState();
            const taskBResult = tasks.find((t) => t.description === 'Task B');
            expect(taskBResult).toBeDefined();

            if (taskBResult) {
                expect(taskBResult.startTime).toBe('10:00');
            }
        });
    });

    describe('addTask', () => {
        beforeEach(() => {
            updateTaskState([]);
            mockSaveTasks.mockClear();
        });

        test('should add a task, call performReschedule, sort, and save when no overlap occurs', () => {
            addTask({ description: 'Task 1', startTime: '10:00', duration: 60 }); // 10:00 - 11:00
            const taskData = { description: 'Task 2', startTime: '09:00', duration: 30 }; // 09:00 - 09:30
            const result = addTask(taskData);

            expect(result.success).toBe(true);
            expect(result.task).toBeDefined();
            const tasks = getTaskState();
            expect(tasks.length).toBe(2);
            expect(tasks[0].description).toBe('Task 2'); // Sorted
            expect(tasks[1].description).toBe('Task 1');
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
            // performReschedule effect: If Task 1 was 09:00-10:00 and Task 2 was 09:30-10:30, Task 2 would be shifted.
            // Here, no shift needed for Task 1 by Task 2.
        });

        test('should require confirmation if adding a task creates an overlap', () => {
            addTask({ description: 'Existing Task', startTime: '09:00', duration: 60 }); // 09:00 - 10:00
            mockSaveTasks.mockClear();

            const taskData = { description: 'Overlapping Task', startTime: '09:30', duration: 60 };
            const result = addTask(taskData);

            expect(result.success).toBe(false);
            expect(result.requiresConfirmation).toBe(true);
            expect(result.confirmationType).toBe('RESCHEDULE_ADD');
            expect(result.taskData).toEqual(taskData);
            expect(result.reason).toBeDefined();
            expect(getTaskState().length).toBe(1); // Original task still there
            expect(getTaskState()[0].description).toBe('Existing Task');
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });

        test('should not add an invalid task and not save', () => {
            const result = addTask({ description: '', startTime: '10:00', duration: 0 });
            expect(result.success).toBe(false);
            expect(result.reason).toBe('Description cannot be empty.');
            expect(getTaskState().length).toBe(0);
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });

    describe('confirmAddTaskAndReschedule', () => {
        beforeEach(() => {
            updateTaskState([
                {
                    description: 'Existing Task 1',
                    startTime: '09:00',
                    endTime: '10:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                }
            ]);
            mockSaveTasks.mockClear();
        });

        test('should add the task, reschedule, sort, and save', () => {
            const taskData = { description: 'New Task', startTime: '09:30', duration: 60 }; // Will overlap Existing Task 1
            const result = confirmAddTaskAndReschedule(taskData);

            expect(result.success).toBe(true);
            expect(result.task).toBeDefined();
            const tasks = getTaskState();
            expect(tasks.length).toBe(2);

            const newTaskInList = tasks.find((t) => t.description === 'New Task');
            const existingTaskInList = tasks.find((t) => t.description === 'Existing Task 1');

            expect(newTaskInList).toBeDefined();
            expect(existingTaskInList).toBeDefined();

            if (newTaskInList && existingTaskInList) {
                expect(newTaskInList).toMatchObject(taskData); // New task added
                expect(existingTaskInList.startTime).toBe('10:30'); // Existing task shifted by performReschedule
                expect(existingTaskInList.endTime).toBe('11:30');
            }
            expect(tasks[0].description).toBe('New Task'); // Sorted
            expect(tasks[1].description).toBe('Existing Task 1');
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
        });
    });

    describe('updateTask', () => {
        beforeEach(() => {
            updateTaskState([
                {
                    description: 'Task 1',
                    startTime: '09:00',
                    endTime: '10:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                },
                {
                    description: 'Task 2',
                    startTime: '10:00',
                    endTime: '11:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                }
            ]);
            mockSaveTasks.mockClear();
        });

        test('should update a task, call performReschedule, sort, and save if no overlap occurs', () => {
            const updatedData = { description: 'Task 1 Updated', startTime: '09:00', duration: 30 }; // Ends 09:30
            const result = updateTask(0, updatedData);

            expect(result.success).toBe(true);
            expect(result.task).toBeDefined();
            const tasks = getTaskState();
            expect(tasks[0].description).toBe('Task 1 Updated');
            expect(tasks[0].endTime).toBe('09:30');
            expect(tasks[1].description).toBe('Task 2'); // Task 2 remains, no reschedule needed for it in this case
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
        });

        test('should require confirmation if updating a task creates an overlap', () => {
            const updatedData = { description: 'Task 1 Updated', startTime: '09:30', duration: 60 }; // Now 09:30 - 10:30, overlaps Task 2
            const result = updateTask(0, updatedData);

            expect(result.success).toBe(false);
            expect(result.requiresConfirmation).toBe(true);
            expect(result.confirmationType).toBe('RESCHEDULE_UPDATE');
            expect(result.taskIndex).toBe(0);
            expect(result.updatedData).toEqual(updatedData);
            expect(result.reason).toBeDefined();

            const tasks = getTaskState();
            expect(tasks[0].description).toBe('Task 1'); // Unchanged
            expect(tasks[0].startTime).toBe('09:00');
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });

        test('should not update with invalid data', () => {
            const result = updateTask(0, { description: '', duration: 0 });
            expect(result.success).toBe(false);
            expect(result.reason).toBeDefined(); // e.g., "Description cannot be empty."
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });

        test('should return error for invalid index', () => {
            const result = updateTask(5, { description: 'Valid Desc', duration: 30 });
            expect(result.success).toBe(false);
            expect(result.reason).toBe('Invalid task index.');
        });
    });

    describe('confirmUpdateTaskAndReschedule', () => {
        let task1, task2, task3;
        beforeEach(() => {
            task1 = {
                description: 'Task 1',
                startTime: '09:00',
                endTime: '10:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            task2 = {
                description: 'Task 2',
                startTime: '10:00',
                endTime: '11:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            task3 = {
                description: 'Task 3',
                startTime: '11:00',
                endTime: '12:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([task1, task2, task3]);
            mockSaveTasks.mockClear();
        });

        test('should update the task, reschedule subsequent tasks, sort, and save', () => {
            // Update Task 1 to overlap Task 2
            const updatedDataForT1 = {
                description: 'Task 1 Extended',
                startTime: '09:00',
                duration: 90
            }; // New end time: 10:30
            const result = confirmUpdateTaskAndReschedule(0, updatedDataForT1);

            expect(result.success).toBe(true);
            const tasks = getTaskState();
            const updatedT1 = tasks.find((t) => t.description === 'Task 1 Extended');
            const shiftedT2 = tasks.find((t) => t.description === 'Task 2');
            const shiftedT3 = tasks.find((t) => t.description === 'Task 3');

            expect(updatedT1).toBeDefined();
            expect(shiftedT2).toBeDefined();
            expect(shiftedT3).toBeDefined();

            if (updatedT1 && shiftedT2 && shiftedT3) {
                expect(updatedT1.endTime).toBe('10:30');
                expect(shiftedT2.startTime).toBe('10:30'); // Shifted
                expect(shiftedT2.endTime).toBe('11:30');
                expect(shiftedT3.startTime).toBe('11:30'); // Shifted
                expect(shiftedT3.endTime).toBe('12:30');
            }
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
            expect(tasks[0].description).toBe('Task 1 Extended'); // Should remain sorted or re-sorted
        });
    });

    describe('completeTask', () => {
        beforeEach(() => {
            updateTaskState([
                {
                    description: 'Test Task',
                    startTime: '09:00',
                    endTime: '10:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                },
                {
                    description: 'Another Task',
                    startTime: '10:00',
                    endTime: '11:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                }
            ]);
            mockSaveTasks.mockClear();
        });

        test('should mark a task as completed on time and save', () => {
            const result = completeTask(0); // Complete 'Test Task'
            expect(result.success).toBe(true);
            const tasks = getTaskState();
            expect(tasks[0].status).toBe('completed');
            expect(tasks[0].endTime).toBe('10:00'); // Original end time
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
        });

        test('should adjust endTime and duration if completed early, and save', () => {
            const currentTime = '09:30'; // Task ends at 10:00, started at 09:00
            const result = completeTask(0, currentTime);
            expect(result.success).toBe(true);
            const tasks = getTaskState();
            expect(tasks[0].status).toBe('completed');
            expect(tasks[0].endTime).toBe(currentTime);
            expect(tasks[0].duration).toBe(30); // 09:00 to 09:30
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
        });

        test('should return requiresConfirmation if completed late, task not modified yet', () => {
            const currentTime = '10:30'; // Original end time 10:00
            const result = completeTask(0, currentTime);

            expect(result.success).toBe(true);
            expect(result.requiresConfirmation).toBe(true);
            expect(result.confirmationType).toBe('COMPLETE_LATE');
            expect(result.task).toBeDefined();

            if (result.task) {
                expect(result.task.description).toBe('Test Task'); // original task details
            }
            expect(result.oldEndTime).toBe('10:00');
            expect(result.newEndTime).toBe('10:30');
            expect(result.newDuration).toBe(90);

            const tasks = getTaskState();
            expect(tasks[0].status).toBe('incomplete'); // Not yet completed
            expect(tasks[0].endTime).toBe('10:00'); // Not yet changed
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
        test('should handle invalid index gracefully', () => {
            const result = completeTask(5, '10:00');
            expect(result.success).toBe(false);
            expect(result.reason).toBe('Invalid task index.');
        });
    });

    describe('confirmCompleteLate', () => {
        let task1, task2;
        beforeEach(() => {
            task1 = {
                description: 'Task A',
                startTime: '09:00',
                endTime: '10:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            task2 = {
                description: 'Task B',
                startTime: '10:00',
                endTime: '10:30',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([task1, task2]);
            mockSaveTasks.mockClear();
        });

        test('should update task status, time, duration, reschedule, sort, and save', () => {
            const newEndTime = '10:15'; // Original was 10:00
            const newDuration = 75; // Original was 60
            const result = confirmCompleteLate(0, newEndTime, newDuration);

            expect(result.success).toBe(true);
            const tasks = getTaskState();
            const completedTask = tasks.find((t) => t.description === 'Task A');
            const subsequentTask = tasks.find((t) => t.description === 'Task B');

            expect(completedTask).toBeDefined();
            expect(subsequentTask).toBeDefined();

            if (completedTask && subsequentTask) {
                expect(completedTask.status).toBe('completed');
                expect(completedTask.endTime).toBe(newEndTime);
                expect(completedTask.duration).toBe(newDuration);
                expect(completedTask.editing).toBe(false); // Should be reset if it was true for performReschedule

                expect(subsequentTask.startTime).toBe('10:15'); // Rescheduled
                expect(subsequentTask.endTime).toBe('10:45');
            }
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
        });

        test('should handle invalid index', () => {
            const result = confirmCompleteLate(5, '10:00', 60);
            expect(result.success).toBe(false);
            expect(result.reason).toBe('Invalid task index.');
        });
    });

    describe('deleteTask', () => {
        beforeEach(() => {
            addTask({ description: 'Task 1', startTime: '09:00', duration: 60 });
            addTask({ description: 'Task 2', startTime: '10:00', duration: 60 });
            mockSaveTasks.mockClear();
        });

        test('should remove a task if confirmed and save', () => {
            const result = deleteTask(0, true);
            expect(result.success).toBe(true);
            expect(getTaskState().length).toBe(1);
            expect(getTaskState()[0].description).toBe('Task 2');
            expect(mockSaveTasks).toHaveBeenCalledWith(getTaskState());
        });

        test('should require confirmation if not confirmed, and set flag', () => {
            const result = deleteTask(0, false);
            expect(result.success).toBe(false);
            expect(result.requiresConfirmation).toBe(true);
            expect(getTaskState().length).toBe(2); // Task still exists
            expect(getTaskState()[0].confirmingDelete).toBe(true);
            expect(mockSaveTasks).not.toHaveBeenCalled(); // Not saved yet
        });
    });

    describe('editTask / cancelEdit', () => {
        beforeEach(() => {
            addTask({ description: 'Test Task', startTime: '09:00', duration: 60 });
            mockSaveTasks.mockClear();
        });

        test('editTask should set editing flag and clear confirmingDelete', () => {
            getTaskState()[0].confirmingDelete = true; // Set it first
            const result = editTask(0);
            expect(result.success).toBe(true);
            expect(getTaskState()[0].editing).toBe(true);
            expect(getTaskState()[0].confirmingDelete).toBe(false);
            expect(mockSaveTasks).not.toHaveBeenCalled(); // UI state change only
        });

        test('cancelEdit should clear editing flag', () => {
            getTaskState()[0].editing = true; // Set it first
            const result = cancelEdit(0);
            expect(result.success).toBe(true);
            expect(getTaskState()[0].editing).toBe(false);
            expect(mockSaveTasks).not.toHaveBeenCalled(); // UI state change only
        });
    });

    describe('deleteAllTasks', () => {
        beforeEach(() => {
            addTask({ description: 'Task 1', startTime: '09:00', duration: 60 });
            addTask({ description: 'Task 2', startTime: '10:00', duration: 60 });
            mockSaveTasks.mockClear();
        });

        test('should delete all tasks and return success result', () => {
            const result = deleteAllTasks();
            expect(result.success).toBe(true);
            expect(result.tasksDeleted).toBe(2);
            expect(result.message).toBe('All tasks deleted successfully.');
            expect(getTaskState().length).toBe(0);
            expect(mockSaveTasks).toHaveBeenCalledWith([]);
        });

        test('should return success if no tasks to delete', () => {
            updateTaskState([]);
            mockSaveTasks.mockClear();

            const result = deleteAllTasks();
            expect(result.success).toBe(true);
            expect(result.tasksDeleted).toBe(0);
            expect(getTaskState().length).toBe(0);
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });

    // Old autoReschedule tests are removed. Its functionality is tested
    // via addTask, updateTask, confirmCompleteLate, etc., and performReschedule.

    describe('getSuggestedStartTime', () => {
        let dateSpy;

        beforeEach(() => {
            // Mock current time to 14:32 (2:32 PM) which rounds up to 14:35
            const fixedDate = new Date('2023-01-01T14:32:00');
            dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => fixedDate);
        });

        afterEach(() => {
            if (dateSpy) {
                dateSpy.mockRestore();
            }
        });

        test('should return current time rounded up when no tasks exist', () => {
            updateTaskState([]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // 14:32 rounded up to nearest 5 minutes
        });

        test('should return current time rounded up when no incomplete tasks exist (only completed)', () => {
            const completedTask = {
                description: 'Completed Task',
                startTime: '14:00',
                endTime: '15:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([completedTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // Current time rounded up
        });

        test('should return current time rounded up when filling a gap (tasks exist before current time)', () => {
            const task1 = {
                description: 'Morning Task',
                startTime: '09:00',
                endTime: '10:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            const task2 = {
                description: 'Evening Task',
                startTime: '16:00',
                endTime: '17:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([task1, task2]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // Current time slot (14:35) is free and there's a task before it (morning task)
        });

        test('should return end time of latest task when planning ahead (no tasks before current time)', () => {
            const task1 = {
                description: 'Future Task 1',
                startTime: '16:00',
                endTime: '17:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            const task2 = {
                description: 'Future Task 2',
                startTime: '18:00',
                endTime: '19:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([task1, task2]);
            const result = getSuggestedStartTime();
            expect(result).toBe('19:00'); // No tasks before current time (14:35), so continue planning from latest task
        });

        test('should return end time of latest task when current time slot is occupied', () => {
            const task1 = {
                description: 'Current Task',
                startTime: '14:00',
                endTime: '15:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            const task2 = {
                description: 'Later Task',
                startTime: '15:30',
                endTime: '16:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([task1, task2]);
            const result = getSuggestedStartTime();
            expect(result).toBe('16:30'); // End time of latest task (task2)
        });

        test('should handle task that spans current time (current time falls within task)', () => {
            const spanningTask = {
                description: 'Long Task',
                startTime: '14:00',
                endTime: '16:00',
                duration: 120,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([spanningTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('16:00'); // End time of the spanning task
        });

        test('should handle tasks that cross midnight - current time in first part', () => {
            // Mock current time to 23:32 (11:32 PM) which rounds up to 23:35
            dateSpy.mockRestore();
            const lateDate = new Date('2023-01-01T23:32:00');
            dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => lateDate);

            const midnightTask = {
                description: 'Midnight Task',
                startTime: '23:00',
                endTime: '01:00', // Crosses midnight
                duration: 120,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([midnightTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('01:00'); // End time of midnight-crossing task
        });

        test('should handle tasks that cross midnight - current time in second part', () => {
            // Mock current time to 00:32 (12:32 AM) which rounds up to 00:35
            dateSpy.mockRestore();
            const earlyDate = new Date('2023-01-02T00:32:00');
            dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => earlyDate);

            const midnightTask = {
                description: 'Midnight Task',
                startTime: '23:00',
                endTime: '01:00', // Crosses midnight
                duration: 120,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([midnightTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('01:00'); // End time of midnight-crossing task
        });

        test('should consider completed tasks when determining gap-filling vs planning ahead', () => {
            const completedTask = {
                description: 'Completed Task',
                startTime: '14:00',
                endTime: '15:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            };
            const incompleteTask = {
                description: 'Future Task',
                startTime: '16:00',
                endTime: '17:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([completedTask, incompleteTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // Completed task counts as existing task before current time, so fill the gap
        });

        test('should ignore completed tasks for conflict detection but consider them for gap-filling', () => {
            const completedTaskAtCurrentTime = {
                description: 'Completed Task at Current Time',
                startTime: '14:30',
                endTime: '15:30',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            };
            const futureTask = {
                description: 'Future Task',
                startTime: '16:00',
                endTime: '17:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([completedTaskAtCurrentTime, futureTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // Current time is free (completed task doesn't conflict) and there's a task before it, so fill the gap
        });

        test('should return end time of chronologically latest task when multiple tasks exist', () => {
            const task1 = {
                description: 'Early Task',
                startTime: '09:00',
                endTime: '10:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            const task2 = {
                description: 'Current Conflicting Task',
                startTime: '14:30',
                endTime: '15:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            const task3 = {
                description: 'Latest Task',
                startTime: '16:00',
                endTime: '17:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([task1, task2, task3]);
            const result = getSuggestedStartTime();
            expect(result).toBe('17:00'); // End time of chronologically latest task (task3)
        });

        test('should handle edge case where current time exactly matches task start time', () => {
            // Mock current time to 14:30 (already rounded)
            dateSpy.mockRestore();
            const exactDate = new Date('2023-01-01T14:30:00');
            dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => exactDate);

            const exactTask = {
                description: 'Exact Start Task',
                startTime: '14:30',
                endTime: '15:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([exactTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('15:30'); // End time of the conflicting task
        });

        test('should handle edge case where current time exactly matches task end time', () => {
            // Mock current time to 15:00 (already rounded)
            dateSpy.mockRestore();
            const exactEndDate = new Date('2023-01-01T15:00:00');
            dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => exactEndDate);

            const endingTask = {
                description: 'Ending Task',
                startTime: '14:00',
                endTime: '15:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([endingTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('15:00'); // Current time is free and there's a task before it, so fill the gap
        });

        test('should handle mixed scenario with completed and incomplete tasks before current time', () => {
            const completedTask = {
                description: 'Completed Morning Task',
                startTime: '09:00',
                endTime: '10:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            };
            const incompleteTask = {
                description: 'Incomplete Morning Task',
                startTime: '11:00',
                endTime: '12:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            const futureTask = {
                description: 'Future Task',
                startTime: '16:00',
                endTime: '17:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([completedTask, incompleteTask, futureTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // There are tasks (both completed and incomplete) before current time, so fill the gap
        });

        test('should handle scenario where all tasks are in the future (planning mode)', () => {
            const futureTask1 = {
                description: 'Future Task 1',
                startTime: '15:00',
                endTime: '16:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            const futureTask2 = {
                description: 'Future Task 2',
                startTime: '17:00',
                endTime: '18:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([futureTask1, futureTask2]);
            const result = getSuggestedStartTime();
            expect(result).toBe('18:00'); // No tasks before current time (14:35), so continue planning from latest
        });
    });

    describe('Performance Characteristics', () => {
        test('should handle large numbers of tasks efficiently', () => {
            const startTime = performance.now();

            // Create 100 tasks
            const tasks = [];
            for (let i = 0; i < 100; i++) {
                const hour = 9 + Math.floor(i / 10);
                const minute = (i % 10) * 6; // 0, 6, 12, 18, 24, 30, 36, 42, 48, 54
                const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

                tasks.push({
                    description: `Task ${i}`,
                    startTime: timeStr,
                    endTime: calculateEndTime(timeStr, 30),
                    duration: 30,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                });
            }

            updateTaskState(tasks);

            // Perform multiple operations that would trigger sorting and overlap detection
            for (let i = 0; i < 10; i++) {
                getTaskState(); // Should use cached sorting

                // Test overlap detection
                const testTask = {
                    description: 'Test',
                    startTime: '10:00',
                    endTime: '10:30',
                    duration: 30,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                };
                checkOverlap(testTask, getTaskState());
            }

            const endTime = performance.now();
            const duration = endTime - startTime;

            // Should complete in reasonable time (less than 100ms for 100 tasks)
            expect(duration).toBeLessThan(100);
        });

        test('should maintain cached values during reschedule operations', () => {
            // Add initial tasks
            addTask({ description: 'Task A', startTime: '09:00', duration: 60 });
            addTask({ description: 'Task B', startTime: '09:30', duration: 60 });
            addTask({ description: 'Task C', startTime: '10:00', duration: 60 });

            const tasks = getTaskState();
            const taskA = tasks[0];

            // Modify Task A to trigger reschedule
            taskA.duration = 120; // Extend to 2 hours
            taskA.endTime = calculateEndTime(taskA.startTime, taskA.duration);

            performReschedule(taskA);

            // Verify all tasks have cached values after reschedule
            const updatedTasks = getTaskState();
            updatedTasks.forEach((task) => {
                expect(task._startMinutes).toBeDefined();
                expect(task._endMinutes).toBeDefined();
                expect(typeof task._startMinutes).toBe('number');
                expect(typeof task._endMinutes).toBe('number');
            });
        });
    });
});

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
    performReschedule,
    confirmAddTaskAndReschedule,
    confirmUpdateTaskAndReschedule,
    confirmCompleteLate,
    adjustAndCompleteTask,
    truncateCompletedTask,
    getSuggestedStartTime,
    getTaskById,
    getTaskIndex,
    setTaskInlineEditing,
    resetAllInlineEditingFlags
} from '../public/js/task-manager.js';
import { isValidTaskData } from '../public/js/task-validators.js';
import { checkOverlap, tasksOverlap } from '../public/js/reschedule-engine.js';
import {
    calculateEndDateTime,
    extractDateFromDateTime,
    extractTimeFromDateTime,
    timeToDateTime
} from '../public/js/utils.js';
const { createTaskWithDateTime, calculateDurationMidnightAware } = require('./test-utils.js');

// Mock the storage module
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    loadTasks: jest.fn(() => [])
}));

// Import the mocked saveTasks
import { saveTasks } from '../public/js/storage.js';

const mockSaveTasks = jest.mocked(saveTasks);

// Mock localStorage before any other imports
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

describe('Task Management Functions (task-manager.js)', () => {
    beforeEach(() => {
        updateTaskState([]);
        mockSaveTasks.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Create a task object for testing with proper DateTime fields
     * @param {string} startTime - Start time in HH:MM format
     * @param {string} endTime - End time in HH:MM format
     * @param {string} description - Task description (optional, defaults to 'Test Task')
     * @returns {Object} - Task object for testing
     */
    function createTaskWithTimes(startTime, endTime, description = 'Test Task') {
        const today = extractDateFromDateTime(new Date()); // Get today's date in YYYY-MM-DD format
        const duration = calculateDurationMidnightAware(startTime, endTime);
        const startDateTime = timeToDateTime(startTime, today);
        const endDateTime = calculateEndDateTime(startDateTime, duration);

        return {
            id: `test-task-${Date.now()}-${Math.random()}`,
            type: 'scheduled',
            description,
            startDateTime,
            endDateTime,
            duration,
            status: 'incomplete',
            editing: false,
            confirmingDelete: false,
            locked: false
        };
    }

    describe('tasksOverlap', () => {
        test('tasksOverlap correctly identifies overlapping tasks', () => {
            const task1 = createTaskWithTimes('09:00', '10:00');
            const task2 = createTaskWithTimes('09:00', '10:00'); // Full overlap
            expect(tasksOverlap(task1, task2)).toBe(true);

            const task3 = createTaskWithTimes('09:00', '10:00');
            const task4 = createTaskWithTimes('09:30', '10:30'); // Partial overlap (task4 starts during task3)
            expect(tasksOverlap(task3, task4)).toBe(true);

            const task5 = createTaskWithTimes('09:30', '10:30');
            const task6 = createTaskWithTimes('09:00', '10:00'); // Partial overlap (task5 starts during task6)
            expect(tasksOverlap(task5, task6)).toBe(true);

            const task7 = createTaskWithTimes('09:00', '11:00');
            const task8 = createTaskWithTimes('09:30', '10:30'); // Task8 contained within Task7
            expect(tasksOverlap(task7, task8)).toBe(true);

            const task9 = createTaskWithTimes('09:30', '10:30');
            const task10 = createTaskWithTimes('09:00', '11:00'); // Task9 contained within Task10
            expect(tasksOverlap(task9, task10)).toBe(true);

            const task11 = createTaskWithTimes('09:00', '10:00');
            const task12 = createTaskWithTimes('10:00', '11:00'); // Adjacent, not overlapping
            expect(tasksOverlap(task11, task12)).toBe(false);

            const task13 = createTaskWithTimes('09:00', '10:00');
            const task14 = createTaskWithTimes('10:01', '11:00'); // Not overlapping
            expect(tasksOverlap(task13, task14)).toBe(false);

            const task15 = createTaskWithTimes('09:00', '10:00');
            const task16 = createTaskWithTimes('08:00', '09:00'); // Adjacent, not overlapping
            expect(tasksOverlap(task15, task16)).toBe(false);
        });
    });

    describe('Midnight Crossing Time Handling (tasksOverlap)', () => {
        test('handles times that cross midnight correctly', () => {
            const lateNightTask = createTaskWithTimes('23:00', '00:30'); // Ends next day

            const dateForEarlyMorningTask = new Date();
            dateForEarlyMorningTask.setDate(dateForEarlyMorningTask.getDate() + 1); // next day

            const earlyMorningTask = createTaskWithDateTime({
                description: 'Early Morning Task',
                startTime: '00:15',
                duration: 45, // 00:15 to 01:00
                date: extractDateFromDateTime(dateForEarlyMorningTask)
            });
            expect(tasksOverlap(lateNightTask, earlyMorningTask)).toBe(true);

            const eveningTask = createTaskWithTimes('22:00', '00:00'); // Ends at midnight
            const morningTask = createTaskWithDateTime({
                // Starts at midnight on the NEXT day
                description: 'Morning Task',
                startTime: '00:00',
                duration: 120, // 00:00 to 02:00
                date: extractDateFromDateTime(dateForEarlyMorningTask) // Use next day's date
            });
            expect(tasksOverlap(eveningTask, morningTask)).toBe(false); // Should be false if on different days like this
        });

        test('handles complex midnight-crossing task overlaps correctly', () => {
            const longEveningTask = createTaskWithTimes('20:00', '02:00'); // Spans 20:00 to 02:00 next day

            const dateForNextDay = new Date();
            dateForNextDay.setDate(dateForNextDay.getDate() + 1);

            const midnightTask = createTaskWithDateTime({
                description: 'Midnight Task',
                startTime: '23:30', // On first day
                duration: 60 // 23:30 to 00:30 next day
                // This task will naturally cross into the same day as longEveningTask's end
            });
            expect(tasksOverlap(longEveningTask, midnightTask)).toBe(true);

            const multiDayTask = createTaskWithTimes('22:00', '08:00'); // Spans 22:00 day1 to 08:00 day2

            const morningTask = createTaskWithDateTime({
                description: 'Morning Task',
                startTime: '07:00', // on day 2
                duration: 90, // 07:00 to 08:30 on day 2
                date: extractDateFromDateTime(dateForNextDay)
            });
            expect(tasksOverlap(multiDayTask, morningTask)).toBe(true);

            const day1Task = createTaskWithTimes('23:00', '00:30'); // Day 1 23:00 to Day 2 00:30

            const dateForDay2Evening = new Date();
            dateForDay2Evening.setDate(dateForDay2Evening.getDate() + 1); // Next day

            const day2EveningTask = createTaskWithDateTime({
                description: 'Day 2 Evening Task',
                startTime: '20:00', // Day 2 20:00
                duration: 120, // Day 2 20:00 to 22:00
                date: extractDateFromDateTime(dateForDay2Evening)
            });
            // day1Task ends Day 2 00:30. day2EveningTask starts Day 2 20:00. No overlap.
            expect(tasksOverlap(day1Task, day2EveningTask)).toBe(false);
        });
    });

    describe('isValidTaskData', () => {
        test('should return valid for correct scheduled task data', () => {
            expect(isValidTaskData('Test Task', 'scheduled', 30, '09:00')).toEqual({
                isValid: true
            });
        });

        test('should return valid for correct unscheduled task data', () => {
            expect(isValidTaskData('Test Task', 'unscheduled', undefined, undefined, 30)).toEqual({
                isValid: true
            });
        });

        test('should return invalid if description is empty', () => {
            expect(isValidTaskData('', 'scheduled', 30, '09:00')).toEqual({
                isValid: false,
                reason: 'Task description is required.'
            });
            expect(isValidTaskData('   ', 'scheduled', 30, '09:00')).toEqual({
                isValid: false,
                reason: 'Task description is required.'
            });
        });

        test('should return invalid if taskType is missing or invalid', () => {
            expect(isValidTaskData('Test Task', null, 30, '09:00')).toEqual({
                isValid: false,
                reason: 'Invalid task type.'
            });
            expect(isValidTaskData('Test Task', 'invalid-type', 30, '09:00')).toEqual({
                isValid: false,
                reason: 'Invalid task type.'
            });
        });

        test('should allow zero duration and reject negative duration for scheduled tasks', () => {
            // Zero duration is valid (e.g., milestone tasks)
            expect(isValidTaskData('Test Task', 'scheduled', 0, '09:00')).toEqual({
                isValid: true
            });
            // Negative duration is invalid
            expect(isValidTaskData('Test Task', 'scheduled', -10, '09:00')).toEqual({
                isValid: false,
                reason: 'Duration must be a non-negative number for scheduled tasks.'
            });
        });

        test('should return invalid if scheduled task duration is NaN', () => {
            expect(isValidTaskData('Test Task', 'scheduled', NaN, '09:00')).toEqual({
                isValid: false,
                reason: 'Duration must be a non-negative number for scheduled tasks.'
            });
        });

        test('should return invalid if scheduled task is missing start time', () => {
            expect(isValidTaskData('Test Task', 'scheduled', 30, '')).toEqual({
                isValid: false,
                reason: 'Start time is required for scheduled tasks.'
            });
        });

        test('should return invalid if scheduled task has invalid time format', () => {
            // Hours > 23 are invalid
            expect(isValidTaskData('Test Task', 'scheduled', 30, '25:00')).toEqual({
                isValid: false,
                reason: 'Invalid start time format. Use HH:MM format.'
            });
            // Minutes > 59 are invalid
            expect(isValidTaskData('Test Task', 'scheduled', 30, '12:60')).toEqual({
                isValid: false,
                reason: 'Invalid start time format. Use HH:MM format.'
            });
            // Invalid format (missing colon)
            expect(isValidTaskData('Test Task', 'scheduled', 30, '1200')).toEqual({
                isValid: false,
                reason: 'Invalid start time format. Use HH:MM format.'
            });
        });

        test('should return invalid if unscheduled task has invalid estimated duration', () => {
            expect(isValidTaskData('Test Task', 'unscheduled', undefined, undefined, -10)).toEqual({
                isValid: false,
                reason: 'Estimated duration must be a non-negative number for unscheduled tasks.'
            });
            expect(isValidTaskData('Test Task', 'unscheduled', undefined, undefined, NaN)).toEqual({
                isValid: false,
                reason: 'Estimated duration must be a non-negative number for unscheduled tasks.'
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
        ) => {
            return createTaskWithDateTime({
                description: desc,
                startTime,
                duration,
                status,
                editing
            });
        };

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
    });

    describe('Sorted Tasks Caching', () => {
        test('should maintain sort order when accessing tasks multiple times', () => {
            // Add tasks in non-sorted order (use _skipAdjustCheck to avoid adjust confirmation)
            addTask({
                taskType: 'scheduled',
                description: 'Task C',
                startTime: '11:00',
                duration: 60,
                _skipAdjustCheck: true
            });
            addTask({
                taskType: 'scheduled',
                description: 'Task A',
                startTime: '09:00',
                duration: 60,
                _skipAdjustCheck: true
            });
            addTask({
                taskType: 'scheduled',
                description: 'Task B',
                startTime: '10:00',
                duration: 60,
                _skipAdjustCheck: true
            });

            const tasks1 = getTaskState().filter((t) => t.type === 'scheduled');
            const tasks2 = getTaskState().filter((t) => t.type === 'scheduled');

            // Verify tasks are sorted consistently
            expect(tasks1[0].description).toBe('Task A'); // 09:00
            expect(tasks1[1].description).toBe('Task B'); // 10:00
            expect(tasks1[2].description).toBe('Task C'); // 11:00

            expect(tasks2[0].description).toBe('Task A');
            expect(tasks2[1].description).toBe('Task B');
            expect(tasks2[2].description).toBe('Task C');
        });

        test('should update sort order when tasks are modified', () => {
            // Add tasks (use _skipAdjustCheck to avoid adjust confirmation)
            addTask({
                taskType: 'scheduled',
                description: 'Task A',
                startTime: '09:00',
                duration: 60,
                _skipAdjustCheck: true
            });
            addTask({
                taskType: 'scheduled',
                description: 'Task B',
                startTime: '10:00',
                duration: 60,
                _skipAdjustCheck: true
            });

            let tasks = getTaskState().filter((t) => t.type === 'scheduled');
            expect(tasks[0].description).toBe('Task A'); // 09:00
            expect(tasks[1].description).toBe('Task B'); // 10:00

            // Update Task A to start later than Task B
            const taskAIndex = getTaskState().findIndex((t) => t.description === 'Task A');
            updateTask(taskAIndex, { startTime: '11:00', duration: 60 });

            tasks = getTaskState();
            expect(tasks[0].description).toBe('Task B'); // 10:00
            expect(tasks[1].description).toBe('Task A'); // 11:00 (moved)
        });
    });

    describe('performReschedule', () => {
        // Helper to create mock tasks for these tests
        const createTask = (id, startTime, duration, status = 'incomplete', editing = false) => {
            return createTaskWithDateTime({
                description: `Task ${id}`,
                startTime,
                duration,
                status,
                editing,
                confirmingDelete: false
            });
        };

        beforeEach(() => {
            updateTaskState([]);
            mockSaveTasks.mockClear();
        });

        test('should not shift any tasks if no subsequent tasks exist', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            updateTaskState([taskA]);
            performReschedule(taskA);
            expect(extractTimeFromDateTime(new Date(getTaskState()[0].startDateTime))).toBe(
                '09:00'
            );
            expect(extractTimeFromDateTime(new Date(getTaskState()[0].endDateTime))).toBe('10:00');
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
                expect(extractTimeFromDateTime(new Date(taskAResult.startDateTime))).toBe('09:00');
                expect(extractTimeFromDateTime(new Date(taskAResult.endDateTime))).toBe('10:00');
                expect(extractTimeFromDateTime(new Date(taskBResult.startDateTime))).toBe('10:00'); // Shifted
                expect(extractTimeFromDateTime(new Date(taskBResult.endDateTime))).toBe('10:30');
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
                expect(extractTimeFromDateTime(new Date(taskAResult.endDateTime))).toBe('10:00');
                expect(extractTimeFromDateTime(new Date(taskBResult.startDateTime))).toBe('10:00'); // Shifted by A
                expect(extractTimeFromDateTime(new Date(taskBResult.endDateTime))).toBe('10:30');
                expect(extractTimeFromDateTime(new Date(taskCResult.startDateTime))).toBe('10:30'); // Shifted by B
                expect(extractTimeFromDateTime(new Date(taskCResult.endDateTime))).toBe('11:00');
            }
        });

        test('should not shift completed tasks', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            const taskB_completed = createTask('B_completed', '09:30', 30, 'completed'); // Original: 09:30 - 10:00
            updateTaskState([taskA, taskB_completed]);
            performReschedule(taskA);

            expect(extractTimeFromDateTime(new Date(taskB_completed.startDateTime))).toBe('09:30'); // Should not change
            expect(extractTimeFromDateTime(new Date(taskB_completed.endDateTime))).toBe('10:00');
        });

        test('should not shift tasks currently being edited by the user', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            const taskC_editing = createTask('C_editing', '09:45', 30, 'incomplete', true); // Original: 09:45 - 10:15
            updateTaskState([taskA, taskC_editing]);
            performReschedule(taskA);

            expect(extractTimeFromDateTime(new Date(taskC_editing.startDateTime))).toBe('09:45'); // Should not change
            expect(extractTimeFromDateTime(new Date(taskC_editing.endDateTime))).toBe('10:15');
        });

        test('taskThatChanged maintains its properties correctly', () => {
            const taskA = createTask('A', '09:00', 60); // Ends 10:00
            const taskB = createTask('B', '10:00', 30); // Starts 10:00
            updateTaskState([taskA, taskB]);

            // Update taskA to overlap with B
            taskA.duration = 90; // Now 09:00 - 10:30
            taskA.endDateTime = calculateEndDateTime(taskA.startDateTime, taskA.duration);

            performReschedule(taskA);

            expect(extractTimeFromDateTime(new Date(taskA.startDateTime))).toBe('09:00');
            expect(extractTimeFromDateTime(new Date(taskA.endDateTime))).toBe('10:30');

            const tasks = getTaskState();
            const taskBResult = tasks.find((t) => t.description === 'Task B');
            expect(taskBResult).toBeDefined();

            if (taskBResult) {
                expect(extractTimeFromDateTime(new Date(taskBResult.startDateTime))).toBe('10:30');
                expect(extractTimeFromDateTime(new Date(taskBResult.endDateTime))).toBe('11:00');
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
                expect(extractTimeFromDateTime(new Date(taskBResult.startDateTime))).toBe('10:00');
            }
        });
    });

    describe('addTask', () => {
        beforeEach(() => {
            updateTaskState([]);
            mockSaveTasks.mockClear();
        });

        test('should add a task, call performReschedule, sort, and save when no overlap occurs', () => {
            addTask({
                taskType: 'scheduled',
                description: 'Task 1',
                startTime: '10:00',
                duration: 60
            }); // 10:00 - 11:00
            const taskData = {
                taskType: 'scheduled',
                description: 'Task 2',
                startTime: '09:00',
                duration: 30
            }; // 09:00 - 09:30
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
            addTask({
                taskType: 'scheduled',
                description: 'Existing Task',
                startTime: '09:00',
                duration: 60,
                _skipAdjustCheck: true
            }); // 09:00 - 10:00
            mockSaveTasks.mockClear();

            const taskData = {
                taskType: 'scheduled',
                description: 'Overlapping Task',
                startTime: '09:30',
                duration: 60,
                _skipAdjustCheck: true // Skip adjust check to test overlap behavior
            };
            const result = addTask(taskData);

            expect(result.success).toBe(false);
            expect(result.requiresConfirmation).toBe(true);
            expect(result.confirmationType).toBe('RESCHEDULE_OVERLAPS_UNLOCKED_OTHERS');
            expect(result.taskObjectToFinalize).toBeDefined();
            expect(result.reason).toBeDefined();
            expect(getTaskState().length).toBe(1); // Original task still there
            expect(getTaskState()[0].description).toBe('Existing Task');
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });

        test('should not add an invalid task and not save', () => {
            const result = addTask({
                taskType: 'scheduled',
                description: '',
                startTime: '10:00',
                duration: 0
            });
            expect(result.success).toBe(false);
            expect(result.reason).toBe('Task description is required.');
            expect(getTaskState().length).toBe(0);
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });

        test('should require confirmation when adding a task that overlaps a completed task', () => {
            // Scenario from user bug report:
            // User has a completed task from 16:00-17:29
            // User wants to add a new task in the middle (16:34-17:08)
            // System should detect the overlap and offer to truncate the completed task
            const completedTask = createTaskWithDateTime({
                description: 'Completed Notes Task',
                startTime: '16:00',
                duration: 89, // 16:00-17:29
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([completedTask]);
            mockSaveTasks.mockClear();

            // Add a new task that overlaps the completed task
            const result = addTask({
                taskType: 'scheduled',
                description: 'Break Task',
                startTime: '16:34',
                duration: 34 // 16:34-17:08
            });

            // Should require confirmation to truncate the completed task
            expect(result.requiresConfirmation).toBe(true);
            expect(result.confirmationType).toBe('TRUNCATE_COMPLETED_TASK');
            expect(result.completedTaskToTruncate).toBeDefined();
            expect(result.completedTaskToTruncate.description).toBe('Completed Notes Task');
            // Task should not be added yet
            expect(getTaskState().length).toBe(1);
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });

    describe('confirmAddTaskAndReschedule', () => {
        beforeEach(() => {
            updateTaskState([
                createTaskWithDateTime({
                    description: 'Existing Task 1',
                    startTime: '09:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                })
            ]);
            mockSaveTasks.mockClear();
        });

        test('should add the task, reschedule, sort, and save', () => {
            // Create the full task object as confirmAddTaskAndReschedule expects
            const taskObjectToFinalize = createTaskWithDateTime({
                description: 'New Task',
                startTime: '09:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });

            const result = confirmAddTaskAndReschedule({ taskObjectToFinalize });

            expect(result.success).toBe(true);
            expect(result.task).toBeDefined();
            const tasks = getTaskState();
            expect(tasks.length).toBe(2);

            const newTaskInList = tasks.find((t) => t.description === 'New Task');
            const existingTaskInList = tasks.find((t) => t.description === 'Existing Task 1');

            expect(newTaskInList).toBeDefined();
            expect(existingTaskInList).toBeDefined();

            if (newTaskInList && existingTaskInList) {
                expect(extractTimeFromDateTime(new Date(newTaskInList.startDateTime))).toBe(
                    '09:30'
                );

                expect(extractTimeFromDateTime(new Date(existingTaskInList.startDateTime))).toBe(
                    '10:30'
                ); // Existing task shifted by performReschedule
                expect(extractTimeFromDateTime(new Date(existingTaskInList.endDateTime))).toBe(
                    '11:30'
                );
            }
            expect(tasks[0].description).toBe('New Task'); // Sorted
            expect(tasks[1].description).toBe('Existing Task 1');
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
        });
    });

    describe('updateTask', () => {
        beforeEach(() => {
            updateTaskState([
                createTaskWithDateTime({
                    description: 'Task 1',
                    startTime: '09:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                }),
                createTaskWithDateTime({
                    description: 'Task 2',
                    startTime: '10:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                })
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
            expect(extractTimeFromDateTime(new Date(tasks[0].endDateTime))).toBe('09:30');
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
            expect(result.updatedTaskObject).toBeDefined();
            expect(result.updatedTaskObject.description).toBe('Task 1 Updated');
            expect(result.reason).toBeDefined();

            const tasks = getTaskState();
            expect(tasks[0].description).toBe('Task 1'); // Unchanged
            expect(extractTimeFromDateTime(new Date(tasks[0].startDateTime))).toBe('09:00');
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
            task1 = createTaskWithDateTime({
                description: 'Task 1',
                startTime: '09:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            task2 = createTaskWithDateTime({
                description: 'Task 2',
                startTime: '10:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            task3 = createTaskWithDateTime({
                description: 'Task 3',
                startTime: '11:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task1, task2, task3]);
            mockSaveTasks.mockClear();
        });

        test('should update the task, reschedule subsequent tasks, sort, and save', () => {
            // Update Task 1 to overlap Task 2
            // Create a full task object as confirmUpdateTaskAndReschedule expects
            const updatedTaskObject = createTaskWithDateTime({
                description: 'Task 1 Extended',
                startTime: '09:00',
                duration: 90, // New end time: 10:30
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            // Set the id to match the existing task
            updatedTaskObject.id = task1.id;

            const result = confirmUpdateTaskAndReschedule({ taskIndex: 0, updatedTaskObject });

            expect(result.success).toBe(true);
            const tasks = getTaskState();
            const updatedT1 = tasks.find((t) => t.description === 'Task 1 Extended');
            const shiftedT2 = tasks.find((t) => t.description === 'Task 2');
            const shiftedT3 = tasks.find((t) => t.description === 'Task 3');

            expect(updatedT1).toBeDefined();
            expect(shiftedT2).toBeDefined();
            expect(shiftedT3).toBeDefined();

            if (updatedT1 && shiftedT2 && shiftedT3) {
                expect(extractTimeFromDateTime(new Date(updatedT1.endDateTime))).toBe('10:30');
                expect(extractTimeFromDateTime(new Date(shiftedT2.startDateTime))).toBe('10:30'); // Shifted
                expect(extractTimeFromDateTime(new Date(shiftedT2.endDateTime))).toBe('11:30');
                expect(extractTimeFromDateTime(new Date(shiftedT3.startDateTime))).toBe('11:30'); // Shifted
                expect(extractTimeFromDateTime(new Date(shiftedT3.endDateTime))).toBe('12:30');
            }
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
            expect(tasks[0].description).toBe('Task 1 Extended'); // Should remain sorted or re-sorted
        });

        test('should update a locked task and reschedule overlapping unlocked tasks', () => {
            // Reproduce user bug: moving a locked task to overlap with unlocked tasks
            // Setup: 4 tasks, with task at 17:30 being locked
            const taskA = createTaskWithDateTime({
                description: 'Earlier Task',
                startTime: '15:00',
                duration: 60, // 15:00-16:00
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: false
            });
            const taskB = createTaskWithDateTime({
                description: 'Another Task',
                startTime: '16:00',
                duration: 60, // 16:00-17:00
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: false
            });
            const lockedTask = createTaskWithDateTime({
                description: 'Locked Task',
                startTime: '17:30',
                duration: 60, // 17:30-18:30
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: true
            });
            const taskC = createTaskWithDateTime({
                description: 'Last Task',
                startTime: '18:30',
                duration: 60, // 18:30-19:30
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: false
            });
            updateTaskState([taskA, taskB, lockedTask, taskC]);
            mockSaveTasks.mockClear();

            // User wants to move the locked task from 17:30 to 15:15
            // This should overlap with "Earlier Task" (15:00-16:00)
            const updateResult = updateTask(2, {
                description: 'Locked Task',
                taskType: 'scheduled',
                startTime: '15:15',
                duration: 60,
                locked: true
            });

            // Should require confirmation because it overlaps unlocked tasks
            expect(updateResult.requiresConfirmation).toBe(true);
            expect(updateResult.confirmationType).toBe('RESCHEDULE_UPDATE');
            expect(updateResult.taskIndex).toBe(2);
            expect(updateResult.updatedTaskObject).toBeDefined();

            // User confirms the reschedule
            const confirmResult = confirmUpdateTaskAndReschedule({
                taskIndex: updateResult.taskIndex,
                updatedTaskObject: updateResult.updatedTaskObject
            });

            // The confirmation should succeed
            expect(confirmResult.success).toBe(true);

            // Verify the locked task was updated to the new time
            const tasks = getTaskState();
            const movedLockedTask = tasks.find((t) => t.description === 'Locked Task');
            expect(movedLockedTask).toBeDefined();
            expect(extractTimeFromDateTime(new Date(movedLockedTask.startDateTime))).toBe('15:15');
            expect(extractTimeFromDateTime(new Date(movedLockedTask.endDateTime))).toBe('16:15');

            // Verify the overlapping unlocked tasks were rescheduled
            const earlierTask = tasks.find((t) => t.description === 'Earlier Task');
            expect(earlierTask).toBeDefined();
            // Earlier Task should have been pushed to after the locked task ends (16:15)
            expect(extractTimeFromDateTime(new Date(earlierTask.startDateTime))).toBe('16:15');
        });

        test('should resort task list after rescheduling pushes tasks past a locked task', () => {
            // Scenario: Completing a task late pushes another task past a locked task
            // The task list should be properly sorted after the reschedule
            //
            // Initial state:
            // - Task A: 09:00-10:00 (will complete late at 10:30)
            // - Task B: 10:00-11:00 (will be pushed, flows around locked)
            // - Locked Task: 11:00-12:00 (cannot move)
            // - Task C: 12:00-13:00 (will be pushed by Task B)
            //
            // After completing Task A at 10:30:
            // - Task A: 09:00-10:30 (completed late)
            // - Locked Task: 11:00-12:00 (unchanged)
            // - Task B: 12:00-13:00 (flowed around locked task)
            // - Task C: 13:00-14:00 (pushed by Task B)
            const taskA = createTaskWithDateTime({
                description: 'Task A',
                startTime: '09:00',
                duration: 60, // 09:00-10:00
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: false
            });
            const taskB = createTaskWithDateTime({
                description: 'Task B',
                startTime: '10:00',
                duration: 60, // 10:00-11:00
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: false
            });
            const lockedTask = createTaskWithDateTime({
                description: 'Locked Task',
                startTime: '11:00',
                duration: 60, // 11:00-12:00
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: true
            });
            const taskC = createTaskWithDateTime({
                description: 'Task C',
                startTime: '12:00',
                duration: 60, // 12:00-13:00
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: false
            });
            updateTaskState([taskA, taskB, lockedTask, taskC]);
            mockSaveTasks.mockClear();

            // Complete Task A late at 10:30 (30 mins past scheduled end)
            const completeResult = completeTask(0, '10:30');

            // Should require confirmation for late completion
            expect(completeResult.requiresConfirmation).toBe(true);
            expect(completeResult.confirmationType).toBe('COMPLETE_LATE');

            // Confirm the late completion with reschedule
            const confirmResult = confirmCompleteLate(
                0,
                completeResult.newEndTime,
                completeResult.newDuration
            );
            expect(confirmResult.success).toBe(true);

            // Get the updated task list
            const tasks = getTaskState();
            const scheduledTasks = tasks.filter((t) => t.type === 'scheduled');

            // Verify we still have 4 tasks
            expect(scheduledTasks.length).toBe(4);

            // Verify tasks are sorted by start time
            for (let i = 0; i < scheduledTasks.length - 1; i++) {
                const currentStart = new Date(scheduledTasks[i].startDateTime).getTime();
                const nextStart = new Date(scheduledTasks[i + 1].startDateTime).getTime();
                expect(currentStart).toBeLessThanOrEqual(nextStart);
            }

            // Verify specific task order after reschedule
            // Task A should be first (completed)
            expect(scheduledTasks[0].description).toBe('Task A');
            expect(scheduledTasks[0].status).toBe('completed');

            // Locked Task should be second (11:00-12:00, unchanged)
            expect(scheduledTasks[1].description).toBe('Locked Task');
            expect(extractTimeFromDateTime(new Date(scheduledTasks[1].startDateTime))).toBe(
                '11:00'
            );

            // Task B should be third (flowed around to 12:00)
            expect(scheduledTasks[2].description).toBe('Task B');
            expect(extractTimeFromDateTime(new Date(scheduledTasks[2].startDateTime))).toBe(
                '12:00'
            );

            // Task C should be fourth (pushed to 13:00)
            expect(scheduledTasks[3].description).toBe('Task C');
            expect(extractTimeFromDateTime(new Date(scheduledTasks[3].startDateTime))).toBe(
                '13:00'
            );
        });
    });

    describe('completeTask', () => {
        beforeEach(() => {
            updateTaskState([
                createTaskWithDateTime({
                    description: 'Test Task',
                    startTime: '09:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                }),
                createTaskWithDateTime({
                    description: 'Another Task',
                    startTime: '10:00',
                    duration: 60,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                })
            ]);
            mockSaveTasks.mockClear();
        });

        test('should mark a task as completed on time and save', () => {
            const result = completeTask(0); // Complete 'Test Task'
            expect(result.success).toBe(true);
            const tasks = getTaskState();
            expect(tasks[0].status).toBe('completed');
            expect(extractTimeFromDateTime(new Date(tasks[0].endDateTime))).toBe('10:00'); // Original end time
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
        });

        test('should adjust endTime and duration if completed early, and save', () => {
            const currentTime = '09:30'; // Task ends at 10:00, started at 09:00
            const result = completeTask(0, currentTime);
            expect(result.success).toBe(true);
            const tasks = getTaskState();
            expect(tasks[0].status).toBe('completed');
            expect(extractTimeFromDateTime(new Date(tasks[0].endDateTime))).toBe(currentTime);
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
            expect(extractTimeFromDateTime(new Date(tasks[0].endDateTime))).toBe('10:00'); // Not yet changed
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
            task1 = createTaskWithDateTime({
                description: 'Task A',
                startTime: '09:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            task2 = createTaskWithDateTime({
                description: 'Task B',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
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
                expect(extractTimeFromDateTime(new Date(completedTask.endDateTime))).toBe(
                    newEndTime
                );
                expect(completedTask.duration).toBe(newDuration);
                expect(completedTask.editing).toBe(false); // Should be reset if it was true for performReschedule

                expect(extractTimeFromDateTime(new Date(subsequentTask.startDateTime))).toBe(
                    '10:15'
                ); // Rescheduled
                expect(extractTimeFromDateTime(new Date(subsequentTask.endDateTime))).toBe('10:45');
            }
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
        });

        test('should handle invalid index', () => {
            const result = confirmCompleteLate(5, '10:00', 60);
            expect(result.success).toBe(false);
            expect(result.reason).toBe('Invalid task index.');
        });
    });

    describe('adjustAndCompleteTask', () => {
        let task1, task2;
        beforeEach(() => {
            task1 = createTaskWithDateTime({
                description: 'Running Task',
                startTime: '09:00',
                duration: 60, // 09:00 - 10:00
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            task2 = createTaskWithDateTime({
                description: 'Later Task',
                startTime: '10:30',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task1, task2]);
            mockSaveTasks.mockClear();
        });

        test('truncates task end time and marks complete', () => {
            // Truncate from 10:00 to 09:30
            const today = extractDateFromDateTime(new Date());
            const newEndDateTime = timeToDateTime('09:30', today);

            const result = adjustAndCompleteTask(task1.id, newEndDateTime);

            expect(result.success).toBe(true);
            expect(result.wasExtended).toBe(false);
            expect(result.newDuration).toBe(30);

            const tasks = getTaskState();
            const updatedTask = tasks.find((t) => t.id === task1.id);
            expect(updatedTask.status).toBe('completed');
            expect(updatedTask.duration).toBe(30);
            expect(mockSaveTasks).toHaveBeenCalled();
        });

        test('extends task end time and marks complete', () => {
            // Extend from 10:00 to 10:15
            const today = extractDateFromDateTime(new Date());
            const newEndDateTime = timeToDateTime('10:15', today);

            const result = adjustAndCompleteTask(task1.id, newEndDateTime);

            expect(result.success).toBe(true);
            expect(result.wasExtended).toBe(true);
            expect(result.newDuration).toBe(75); // 09:00 to 10:15 = 75 min

            const tasks = getTaskState();
            const updatedTask = tasks.find((t) => t.id === task1.id);
            expect(updatedTask.status).toBe('completed');
            expect(updatedTask.duration).toBe(75);
        });

        test('calculates new duration correctly', () => {
            const today = extractDateFromDateTime(new Date());
            const newEndDateTime = timeToDateTime('09:45', today);

            const result = adjustAndCompleteTask(task1.id, newEndDateTime);

            expect(result.success).toBe(true);
            expect(result.newDuration).toBe(45); // 09:00 to 09:45 = 45 min
        });

        test('returns wasExtended=true when extending', () => {
            const today = extractDateFromDateTime(new Date());
            const newEndDateTime = timeToDateTime('11:00', today); // Beyond original 10:00

            const result = adjustAndCompleteTask(task1.id, newEndDateTime);

            expect(result.success).toBe(true);
            expect(result.wasExtended).toBe(true);
        });

        test('returns wasExtended=false when truncating', () => {
            const today = extractDateFromDateTime(new Date());
            const newEndDateTime = timeToDateTime('09:15', today); // Before original 10:00

            const result = adjustAndCompleteTask(task1.id, newEndDateTime);

            expect(result.success).toBe(true);
            expect(result.wasExtended).toBe(false);
        });

        test('returns error for non-existent task', () => {
            const today = extractDateFromDateTime(new Date());
            const newEndDateTime = timeToDateTime('09:30', today);

            const result = adjustAndCompleteTask('nonexistent-id', newEndDateTime);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('Task not found');
        });

        test('returns error when new end is before start', () => {
            const today = extractDateFromDateTime(new Date());
            const newEndDateTime = timeToDateTime('08:30', today); // Before task start 09:00

            const result = adjustAndCompleteTask(task1.id, newEndDateTime);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('New end time must be after start time');
        });

        test('clears editing flag when completing', () => {
            // Set editing flag
            task1.editing = true;
            updateTaskState([task1, task2]);

            const today = extractDateFromDateTime(new Date());
            const newEndDateTime = timeToDateTime('09:30', today);

            const result = adjustAndCompleteTask(task1.id, newEndDateTime);

            expect(result.success).toBe(true);
            const tasks = getTaskState();
            const updatedTask = tasks.find((t) => t.id === task1.id);
            expect(updatedTask.editing).toBe(false);
        });

        test('returns error for unscheduled task', () => {
            const unscheduledTask = {
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Test',
                priority: 'medium',
                estDuration: 30,
                status: 'incomplete'
            };
            updateTaskState([unscheduledTask]);

            const today = extractDateFromDateTime(new Date());
            const newEndDateTime = timeToDateTime('10:00', today);

            const result = adjustAndCompleteTask('unsched-1', newEndDateTime);

            expect(result.success).toBe(false);
            expect(result.reason).toBe('Only scheduled tasks can be adjusted');
        });
    });

    describe('deleteTask', () => {
        beforeEach(() => {
            addTask({
                taskType: 'scheduled',
                description: 'Task 1',
                startTime: '09:00',
                duration: 60,
                _skipAdjustCheck: true
            });
            addTask({
                taskType: 'scheduled',
                description: 'Task 2',
                startTime: '10:00',
                duration: 60,
                _skipAdjustCheck: true
            });
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
            addTask({
                taskType: 'scheduled',
                description: 'Test Task',
                startTime: '09:00',
                duration: 60,
                _skipAdjustCheck: true
            });
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
            addTask({
                taskType: 'scheduled',
                description: 'Task 1',
                startTime: '09:00',
                duration: 60,
                _skipAdjustCheck: true
            });
            addTask({
                taskType: 'scheduled',
                description: 'Task 2',
                startTime: '10:00',
                duration: 60,
                _skipAdjustCheck: true
            });
            mockSaveTasks.mockClear();
        });

        test('should delete all tasks and return success result', () => {
            const result = deleteAllTasks();
            expect(result.success).toBe(true);
            expect(result.tasksDeleted).toBe(2);
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
        let getCurrentTimeRoundedSpy;

        beforeEach(() => {
            // Mock getCurrentTimeRounded to return 14:35 (2:32 PM rounded up to 2:35 PM)
            getCurrentTimeRoundedSpy = jest
                .spyOn(require('../public/js/utils.js'), 'getCurrentTimeRounded')
                .mockReturnValue('14:35');
        });

        afterEach(() => {
            if (getCurrentTimeRoundedSpy) {
                getCurrentTimeRoundedSpy.mockRestore();
            }
        });

        test('should return current time rounded up when no tasks exist', () => {
            updateTaskState([]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // getCurrentTimeRounded() returns 14:35
        });

        test('should return current time rounded up when no incomplete tasks exist (only completed)', () => {
            const completedTask = createTaskWithDateTime({
                description: 'Completed Task',
                startTime: '14:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([completedTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // Current time rounded up
        });

        test('should return current time rounded up when filling a gap (tasks exist before current time)', () => {
            const task1 = createTaskWithDateTime({
                description: 'Morning Task',
                startTime: '09:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            const task2 = createTaskWithDateTime({
                description: 'Evening Task',
                startTime: '16:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task1, task2]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // Current time slot (14:35) is free and there's a task before it (morning task)
        });

        test('should return end time of latest task when planning ahead (no tasks before current time)', () => {
            const task1 = createTaskWithDateTime({
                description: 'Future Task 1',
                startTime: '16:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            const task2 = createTaskWithDateTime({
                description: 'Future Task 2',
                startTime: '18:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task1, task2]);
            const result = getSuggestedStartTime();
            expect(result).toBe('19:00'); // No tasks before current time (14:35), so continue planning from latest task
        });

        test('should return end time of latest task when current time slot is occupied', () => {
            const task1 = createTaskWithDateTime({
                description: 'Current Task',
                startTime: '14:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            const task2 = createTaskWithDateTime({
                description: 'Later Task',
                startTime: '15:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task1, task2]);
            const result = getSuggestedStartTime();
            expect(result).toBe('16:30'); // End time of latest task (task2)
        });

        test('should handle task that spans current time (current time falls within task)', () => {
            const spanningTask = createTaskWithDateTime({
                description: 'Long Task',
                startTime: '14:00',
                duration: 120,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([spanningTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('16:00'); // End time of the spanning task
        });

        test('should handle tasks that cross midnight - current time in first part', () => {
            // Mock current time to 23:35 (11:35 PM)
            getCurrentTimeRoundedSpy.mockReturnValue('23:35');

            const midnightTask = createTaskWithDateTime({
                description: 'Midnight Task',
                startTime: '23:00',
                duration: 120,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([midnightTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('01:00'); // End time of midnight-crossing task
        });

        test('should handle tasks that cross midnight - current time in second part', () => {
            // Mock current time to 00:35 (12:35 AM)
            getCurrentTimeRoundedSpy.mockReturnValue('00:35');

            const midnightTask = createTaskWithDateTime({
                description: 'Midnight Task',
                startTime: '23:00',
                duration: 120,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([midnightTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('01:00'); // End time of midnight-crossing task
        });

        test('should consider completed tasks when determining gap-filling vs planning ahead', () => {
            const completedTask = createTaskWithDateTime({
                description: 'Completed Task',
                startTime: '14:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });
            const incompleteTask = createTaskWithDateTime({
                description: 'Future Task',
                startTime: '16:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([completedTask, incompleteTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // Completed task counts as existing task before current time, so fill the gap
        });

        test('should ignore completed tasks for conflict detection but consider them for gap-filling', () => {
            const completedTaskAtCurrentTime = createTaskWithDateTime({
                description: 'Completed Task at Current Time',
                startTime: '14:30',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });
            const futureTask = createTaskWithDateTime({
                description: 'Future Task',
                startTime: '16:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([completedTaskAtCurrentTime, futureTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // Current time is free (completed task doesn't conflict) and there's a task before it, so fill the gap
        });

        test('should return end time of chronologically latest task when multiple tasks exist', () => {
            const task1 = createTaskWithDateTime({
                description: 'Early Task',
                startTime: '09:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            const task2 = createTaskWithDateTime({
                description: 'Current Conflicting Task',
                startTime: '14:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            const task3 = createTaskWithDateTime({
                description: 'Latest Task',
                startTime: '16:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task1, task2, task3]);
            const result = getSuggestedStartTime();
            expect(result).toBe('17:00'); // End time of chronologically latest task (task3)
        });

        test('should handle edge case where current time exactly matches task start time', () => {
            // Mock current time to 14:30 (already rounded)
            getCurrentTimeRoundedSpy.mockRestore();
            getCurrentTimeRoundedSpy = jest
                .spyOn(require('../public/js/utils.js'), 'getCurrentTimeRounded')
                .mockImplementation(() => '14:30');

            const exactTask = createTaskWithDateTime({
                description: 'Exact Start Task',
                startTime: '14:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([exactTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('15:30'); // End time of the conflicting task
        });

        test('should handle edge case where current time exactly matches task end time', () => {
            // Mock current time to 15:00 (already rounded)
            getCurrentTimeRoundedSpy.mockRestore();
            getCurrentTimeRoundedSpy = jest
                .spyOn(require('../public/js/utils.js'), 'getCurrentTimeRounded')
                .mockImplementation(() => '15:00');

            const endingTask = createTaskWithDateTime({
                description: 'Ending Task',
                startTime: '14:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([endingTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('15:00'); // Current time is free and there's a task before it, so fill the gap
        });

        test('should handle mixed scenario with completed and incomplete tasks before current time', () => {
            const completedTask = createTaskWithDateTime({
                description: 'Completed Morning Task',
                startTime: '09:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });
            const incompleteTask = createTaskWithDateTime({
                description: 'Incomplete Morning Task',
                startTime: '11:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            const futureTask = createTaskWithDateTime({
                description: 'Future Task',
                startTime: '16:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([completedTask, incompleteTask, futureTask]);
            const result = getSuggestedStartTime();
            expect(result).toBe('14:35'); // There are tasks (both completed and incomplete) before current time, so fill the gap
        });

        test('should handle scenario where all tasks are in the future (planning mode)', () => {
            const futureTask1 = createTaskWithDateTime({
                description: 'Future Task 1',
                startTime: '15:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            const futureTask2 = createTaskWithDateTime({
                description: 'Future Task 2',
                startTime: '17:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
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

                tasks.push(
                    createTaskWithDateTime({
                        description: `Task ${i}`,
                        startTime: timeStr,
                        duration: 30,
                        status: 'incomplete',
                        editing: false,
                        confirmingDelete: false
                    })
                );
            }

            updateTaskState(tasks);

            // Perform multiple operations that would trigger sorting and overlap detection
            for (let i = 0; i < 10; i++) {
                getTaskState(); // Should use cached sorting

                // Test overlap detection
                const testTask = createTaskWithDateTime({
                    description: 'Test',
                    startTime: '10:00',
                    duration: 30,
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                });
                checkOverlap(testTask, getTaskState());
            }

            const endTime = performance.now();
            const duration = endTime - startTime;

            // Should complete in reasonable time (less than 100ms for 100 tasks)
            expect(duration).toBeLessThan(100);
        });
    });

    describe('Unscheduled Task Sorting', () => {
        const { getSortedUnscheduledTasks } = require('../public/js/task-manager.js');

        function createUnscheduledTask(priority, estDuration, status = 'incomplete') {
            return {
                id: `unsched-${Date.now()}-${Math.random()}`,
                type: 'unscheduled',
                description: `Task ${priority} ${estDuration}`,
                priority,
                estDuration,
                status,
                isEditingInline: false
            };
        }

        test('sorts by completion status (incomplete first)', () => {
            const completed = createUnscheduledTask('high', 30, 'completed');
            const incomplete = createUnscheduledTask('low', 30, 'incomplete');
            updateTaskState([completed, incomplete]);

            const sorted = getSortedUnscheduledTasks();
            expect(sorted[0].status).toBe('incomplete');
            expect(sorted[1].status).toBe('completed');
        });

        test('sorts by priority (high > medium > low)', () => {
            const low = createUnscheduledTask('low', 30);
            const high = createUnscheduledTask('high', 30);
            const medium = createUnscheduledTask('medium', 30);
            updateTaskState([low, high, medium]);

            const sorted = getSortedUnscheduledTasks();
            expect(sorted[0].priority).toBe('high');
            expect(sorted[1].priority).toBe('medium');
            expect(sorted[2].priority).toBe('low');
        });

        test('sorts by duration within same priority (shorter first)', () => {
            const long = createUnscheduledTask('high', 120);
            const short = createUnscheduledTask('high', 30);
            const medium = createUnscheduledTask('high', 60);
            updateTaskState([long, short, medium]);

            const sorted = getSortedUnscheduledTasks();
            expect(sorted[0].estDuration).toBe(30);
            expect(sorted[1].estDuration).toBe(60);
            expect(sorted[2].estDuration).toBe(120);
        });

        test('handles null estDuration correctly', () => {
            const withDuration = createUnscheduledTask('high', 30);
            const withoutDuration = createUnscheduledTask('high', null);
            updateTaskState([withoutDuration, withDuration]);

            const sorted = getSortedUnscheduledTasks();
            // Tasks with duration should come before tasks without
            expect(sorted[0].estDuration).toBe(30);
            expect(sorted[1].estDuration).toBeNull();
        });

        test('handles both tasks having null estDuration', () => {
            const task1 = createUnscheduledTask('high', null);
            const task2 = createUnscheduledTask('high', null);
            updateTaskState([task1, task2]);

            const sorted = getSortedUnscheduledTasks();
            expect(sorted).toHaveLength(2);
            // Both have null duration, order should be stable
        });

        test('handles mix of priorities, durations, and statuses', () => {
            const completedHigh = createUnscheduledTask('high', 30, 'completed');
            const incompleteHigh = createUnscheduledTask('high', 60);
            const incompleteLow = createUnscheduledTask('low', 30);
            const incompleteMedium = createUnscheduledTask('medium', null);
            updateTaskState([completedHigh, incompleteHigh, incompleteLow, incompleteMedium]);

            const sorted = getSortedUnscheduledTasks();
            // First: incomplete high (60)
            expect(sorted[0].priority).toBe('high');
            expect(sorted[0].status).toBe('incomplete');
            // Second: incomplete medium (null)
            expect(sorted[1].priority).toBe('medium');
            // Third: incomplete low (30)
            expect(sorted[2].priority).toBe('low');
            // Last: completed high
            expect(sorted[3].status).toBe('completed');
        });
    });

    describe('Additional Branch Coverage', () => {
        const {
            scheduleUnscheduledTask,
            toggleUnscheduledTaskCompleteState,
            toggleLockState,
            unscheduleTask
        } = require('../public/js/task-manager.js');

        test('scheduleUnscheduledTask with invalid task id returns failure', () => {
            updateTaskState([]);
            const result = scheduleUnscheduledTask('nonexistent', '10:00', 60);
            expect(result.success).toBe(false);
        });

        test('toggleUnscheduledTaskCompleteState with invalid task id returns failure', () => {
            updateTaskState([]);
            const result = toggleUnscheduledTaskCompleteState('nonexistent');
            expect(result.success).toBe(false);
        });

        test('toggleUnscheduledTaskCompleteState toggles status', () => {
            const task = {
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Test',
                priority: 'medium',
                estDuration: 30,
                status: 'incomplete'
            };
            updateTaskState([task]);

            let result = toggleUnscheduledTaskCompleteState('unsched-1');
            expect(result.success).toBe(true);
            expect(getTaskState()[0].status).toBe('completed');

            result = toggleUnscheduledTaskCompleteState('unsched-1');
            expect(result.success).toBe(true);
            expect(getTaskState()[0].status).toBe('incomplete');
        });

        test('toggleLockState with invalid task id returns failure', () => {
            updateTaskState([]);
            const result = toggleLockState('nonexistent');
            expect(result.success).toBe(false);
        });

        test('toggleLockState toggles locked flag', () => {
            const task = createTaskWithDateTime({
                description: 'Test',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                locked: false
            });
            updateTaskState([task]);

            let result = toggleLockState(task.id);
            expect(result.success).toBe(true);
            expect(getTaskState()[0].locked).toBe(true);

            result = toggleLockState(task.id);
            expect(result.success).toBe(true);
            expect(getTaskState()[0].locked).toBe(false);
        });

        test('unscheduleTask with invalid task id returns failure', () => {
            updateTaskState([]);
            const result = unscheduleTask('nonexistent');
            expect(result.success).toBe(false);
        });

        test('unscheduleTask converts scheduled to unscheduled', () => {
            const task = createTaskWithDateTime({
                description: 'Test',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task]);

            const result = unscheduleTask(task.id);
            expect(result.success).toBe(true);

            const tasks = getTaskState();
            expect(tasks[0].type).toBe('unscheduled');
            expect(tasks[0].estDuration).toBe(30);
        });
    });

    describe('Reset Flags Functions', () => {
        const {
            resetAllConfirmingDeleteFlags,
            resetAllEditingFlags
        } = require('../public/js/task-manager.js');

        test('resetAllConfirmingDeleteFlags returns false when no flags to reset', () => {
            const task = createTaskWithDateTime({
                description: 'Test',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task]);

            const result = resetAllConfirmingDeleteFlags();
            expect(result).toBe(false);
        });

        test('resetAllConfirmingDeleteFlags returns true and resets flags', () => {
            const task = createTaskWithDateTime({
                description: 'Test',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: true
            });
            updateTaskState([task]);

            const result = resetAllConfirmingDeleteFlags();
            expect(result).toBe(true);
            expect(getTaskState()[0].confirmingDelete).toBe(false);
        });

        test('resetAllEditingFlags returns false when no flags to reset', () => {
            const task = createTaskWithDateTime({
                description: 'Test',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task]);

            const result = resetAllEditingFlags();
            expect(result).toBe(false);
        });

        test('resetAllEditingFlags returns true and resets flags', () => {
            const task = createTaskWithDateTime({
                description: 'Test',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: true,
                confirmingDelete: false
            });
            updateTaskState([task]);

            const result = resetAllEditingFlags();
            expect(result).toBe(true);
            expect(getTaskState()[0].editing).toBe(false);
        });
    });

    describe('Delete Functions Edge Cases', () => {
        const {
            deleteAllScheduledTasks,
            deleteCompletedTasks
        } = require('../public/js/task-manager.js');

        test('deleteAllScheduledTasks removes only scheduled tasks', () => {
            const scheduledTask = createTaskWithDateTime({
                description: 'Scheduled',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            const unscheduledTask = {
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Unscheduled',
                priority: 'medium',
                estDuration: 30,
                status: 'incomplete'
            };
            updateTaskState([scheduledTask, unscheduledTask]);

            const result = deleteAllScheduledTasks();
            expect(result.success).toBe(true);
            expect(result.tasksDeleted).toBe(1);

            const tasks = getTaskState();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].type).toBe('unscheduled');
        });

        test('deleteCompletedTasks removes completed tasks from both types', () => {
            const incompleteSched = createTaskWithDateTime({
                description: 'Incomplete Scheduled',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            const completedSched = createTaskWithDateTime({
                description: 'Completed Scheduled',
                startTime: '11:00',
                duration: 30,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });
            const completedUnsched = {
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Completed Unscheduled',
                priority: 'medium',
                estDuration: 30,
                status: 'completed'
            };
            updateTaskState([incompleteSched, completedSched, completedUnsched]);

            const result = deleteCompletedTasks();
            expect(result.success).toBe(true);
            expect(result.tasksDeleted).toBe(2);

            const tasks = getTaskState();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].status).toBe('incomplete');
        });

        test('deleteCompletedTasks returns zero deleted when no completed tasks', () => {
            const task = createTaskWithDateTime({
                description: 'Incomplete',
                startTime: '10:00',
                duration: 30,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([task]);

            const result = deleteCompletedTasks();
            expect(result.success).toBe(true);
            expect(result.tasksDeleted).toBe(0);
        });
    });

    describe('UpdateUnscheduledTask', () => {
        const { updateUnscheduledTask } = require('../public/js/task-manager.js');

        test('updates unscheduled task successfully', () => {
            const task = {
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Original',
                priority: 'low',
                estDuration: 30,
                status: 'incomplete',
                isEditingInline: true
            };
            updateTaskState([task]);

            const result = updateUnscheduledTask('unsched-1', {
                description: 'Updated',
                priority: 'high',
                estDuration: 60
            });

            expect(result.success).toBe(true);
            const tasks = getTaskState();
            expect(tasks[0].description).toBe('Updated');
            expect(tasks[0].priority).toBe('high');
            expect(tasks[0].estDuration).toBe(60);
        });

        test('returns failure for non-existent task', () => {
            updateTaskState([]);
            const result = updateUnscheduledTask('nonexistent', { description: 'Test' });
            expect(result.success).toBe(false);
        });
    });

    describe('DeleteUnscheduledTask', () => {
        const { deleteUnscheduledTask } = require('../public/js/task-manager.js');

        test('deletes an existing unscheduled task with confirmation', () => {
            const task = {
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Test',
                priority: 'medium',
                estDuration: 30,
                status: 'incomplete',
                confirmingDelete: true // Required for deletion
            };
            updateTaskState([task]);

            const result = deleteUnscheduledTask('unsched-1');
            expect(result.success).toBe(true);
            expect(getTaskState()).toHaveLength(0);
        });

        test('requires confirmation before deleting', () => {
            const task = {
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Test',
                priority: 'medium',
                estDuration: 30,
                status: 'incomplete',
                confirmingDelete: false
            };
            updateTaskState([task]);

            const result = deleteUnscheduledTask('unsched-1');
            expect(result.success).toBe(false);
            expect(result.requiresConfirmation).toBe(true);
        });

        test('returns error for non-existent task', () => {
            updateTaskState([]);
            const result = deleteUnscheduledTask('nonexistent');
            expect(result.success).toBe(false);
        });
    });

    describe('ReorderUnscheduledTask', () => {
        const { reorderUnscheduledTask } = require('../public/js/task-manager.js');

        test('reorders tasks correctly', () => {
            const task1 = {
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Task 1',
                priority: 'high',
                estDuration: 30,
                status: 'incomplete'
            };
            const task2 = {
                id: 'unsched-2',
                type: 'unscheduled',
                description: 'Task 2',
                priority: 'high',
                estDuration: 30,
                status: 'incomplete'
            };
            updateTaskState([task1, task2]);

            const result = reorderUnscheduledTask('unsched-2', 'unsched-1');
            expect(result.success).toBe(true);
        });

        test('returns error when tasks not found', () => {
            updateTaskState([]);
            const result = reorderUnscheduledTask('nonexistent1', 'nonexistent2');
            expect(result.success).toBe(false);
        });
    });

    describe('EditTask edge cases', () => {
        test('editTask with invalid index returns error object', () => {
            updateTaskState([]);
            const result = editTask(0);
            expect(result.success).toBe(false);
        });

        test('cancelEdit with invalid index returns error object', () => {
            updateTaskState([]);
            const result = cancelEdit(0);
            expect(result.success).toBe(false);
        });
    });

    describe('truncateCompletedTask', () => {
        test('successfully truncates a completed task', () => {
            const completedTask = createTaskWithDateTime({
                description: 'Completed Task',
                startTime: '10:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([completedTask]);

            // Truncate to end at 10:30 instead of 11:00
            const newEndDateTime = calculateEndDateTime(completedTask.startDateTime, 30);
            const result = truncateCompletedTask(completedTask.id, newEndDateTime);

            expect(result.success).toBe(true);
            expect(result.newDuration).toBe(30);
            expect(result.task.endDateTime).toBe(newEndDateTime);
        });

        test('returns error when task not found', () => {
            updateTaskState([]);
            const result = truncateCompletedTask('nonexistent', '2026-02-08T11:00:00.000Z');
            expect(result.success).toBe(false);
            expect(result.reason).toBe('Task not found');
        });

        test('returns error for unscheduled task', () => {
            const unscheduledTask = {
                id: 'unsched-1',
                description: 'Unscheduled Task',
                type: 'unscheduled',
                status: 'completed',
                editing: false,
                confirmingDelete: false
            };
            updateTaskState([unscheduledTask]);

            const result = truncateCompletedTask(unscheduledTask.id, '2026-02-08T11:00:00.000Z');
            expect(result.success).toBe(false);
            expect(result.reason).toBe('Only scheduled tasks can be truncated');
        });

        test('returns error for incomplete task', () => {
            const incompleteTask = createTaskWithDateTime({
                description: 'Incomplete Task',
                startTime: '10:00',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([incompleteTask]);

            const newEndDateTime = calculateEndDateTime(incompleteTask.startDateTime, 30);
            const result = truncateCompletedTask(incompleteTask.id, newEndDateTime);
            expect(result.success).toBe(false);
            expect(result.reason).toBe('Only completed tasks can be truncated');
        });

        test('returns error when new end time is before start time', () => {
            const completedTask = createTaskWithDateTime({
                description: 'Completed Task',
                startTime: '10:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });
            updateTaskState([completedTask]);

            // Try to set end time before start time
            const invalidEndTime = new Date(
                new Date(completedTask.startDateTime).getTime() - 30 * 60000
            ).toISOString();
            const result = truncateCompletedTask(completedTask.id, invalidEndTime);
            expect(result.success).toBe(false);
            expect(result.reason).toBe('New end time must be after start time');
        });
    });

    describe('getTaskState immutability', () => {
        test('returns a shallow copy, not the live array', () => {
            const task = createTaskWithTimes('09:00', '10:00', 'Immutability Test');
            updateTaskState([task]);

            const state1 = getTaskState();
            const state2 = getTaskState();
            expect(state1).not.toBe(state2);
            expect(state1).toEqual(state2);
        });

        test('pushing to returned array does not corrupt internal state', () => {
            const task = createTaskWithTimes('09:00', '10:00', 'Original');
            updateTaskState([task]);

            const state = getTaskState();
            state.push({ id: 'fake', description: 'Injected' });

            expect(getTaskState()).toHaveLength(1);
            expect(getTaskState()[0].description).toBe('Original');
        });

        test('splicing returned array does not remove from internal state', () => {
            const task1 = createTaskWithTimes('09:00', '10:00', 'Task A');
            const task2 = createTaskWithTimes('10:00', '11:00', 'Task B');
            updateTaskState([task1, task2]);

            const state = getTaskState();
            state.splice(0, 1);

            expect(getTaskState()).toHaveLength(2);
        });

        test('object references are preserved (read-through still works)', () => {
            const task = createTaskWithTimes('09:00', '10:00', 'Ref Test');
            updateTaskState([task]);

            const fromState = getTaskState()[0];
            expect(fromState).toBe(task);
        });
    });

    describe('getTaskById', () => {
        test('returns the task when found', () => {
            const task = createTaskWithTimes('09:00', '10:00', 'Find Me');
            updateTaskState([task]);

            const found = getTaskById(task.id);
            expect(found).not.toBeNull();
            expect(found.description).toBe('Find Me');
        });

        test('returns null when task not found', () => {
            updateTaskState([]);
            expect(getTaskById('nonexistent-id')).toBeNull();
        });

        test('returns the correct task among multiple', () => {
            const task1 = createTaskWithTimes('09:00', '10:00', 'First');
            const task2 = createTaskWithTimes('10:00', '11:00', 'Second');
            updateTaskState([task1, task2]);

            expect(getTaskById(task2.id).description).toBe('Second');
        });
    });

    describe('getTaskIndex', () => {
        test('returns the index when found', () => {
            const task1 = createTaskWithTimes('09:00', '10:00', 'First');
            const task2 = createTaskWithTimes('10:00', '11:00', 'Second');
            updateTaskState([task1, task2]);

            expect(getTaskIndex(task1.id)).toBe(0);
            expect(getTaskIndex(task2.id)).toBe(1);
        });

        test('returns -1 when task not found', () => {
            updateTaskState([]);
            expect(getTaskIndex('nonexistent-id')).toBe(-1);
        });
    });

    describe('setTaskInlineEditing', () => {
        test('sets editing flag on target task', () => {
            const task1 = {
                ...createTaskWithTimes('09:00', '10:00', 'Task A'),
                isEditingInline: false
            };
            const task2 = {
                ...createTaskWithTimes('10:00', '11:00', 'Task B'),
                isEditingInline: false
            };
            updateTaskState([task1, task2]);

            setTaskInlineEditing(task1.id, true);

            const state = getTaskState();
            expect(state[0].isEditingInline).toBe(true);
            expect(state[1].isEditingInline).toBe(false);
        });

        test('clears editing flag on other tasks', () => {
            const task1 = {
                ...createTaskWithTimes('09:00', '10:00', 'Task A'),
                isEditingInline: true
            };
            const task2 = {
                ...createTaskWithTimes('10:00', '11:00', 'Task B'),
                isEditingInline: false
            };
            updateTaskState([task1, task2]);

            setTaskInlineEditing(task2.id, true);

            const state = getTaskState();
            expect(state[0].isEditingInline).toBe(false);
            expect(state[1].isEditingInline).toBe(true);
        });

        test('sets editing to false on target task', () => {
            const task1 = {
                ...createTaskWithTimes('09:00', '10:00', 'Task A'),
                isEditingInline: true
            };
            updateTaskState([task1]);

            setTaskInlineEditing(task1.id, false);

            expect(getTaskState()[0].isEditingInline).toBe(false);
        });
    });

    describe('resetAllInlineEditingFlags', () => {
        test('resets all editing flags and returns true when flags were set', () => {
            const task1 = {
                ...createTaskWithTimes('09:00', '10:00', 'Task A'),
                isEditingInline: true
            };
            const task2 = {
                ...createTaskWithTimes('10:00', '11:00', 'Task B'),
                isEditingInline: true
            };
            updateTaskState([task1, task2]);

            const changed = resetAllInlineEditingFlags();

            expect(changed).toBe(true);
            expect(getTaskState()[0].isEditingInline).toBe(false);
            expect(getTaskState()[1].isEditingInline).toBe(false);
        });

        test('returns false when no flags were set', () => {
            const task1 = {
                ...createTaskWithTimes('09:00', '10:00', 'Task A'),
                isEditingInline: false
            };
            updateTaskState([task1]);

            const changed = resetAllInlineEditingFlags();
            expect(changed).toBe(false);
        });

        test('returns false when no tasks exist', () => {
            updateTaskState([]);
            expect(resetAllInlineEditingFlags()).toBe(false);
        });
    });
});

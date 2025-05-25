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
    checkOverlap,
    performReschedule,
    confirmAddTaskAndReschedule,
    confirmUpdateTaskAndReschedule,
    confirmCompleteLate,
    resetAllConfirmingDeleteFlags,
    resetAllEditingFlags,
    getSuggestedStartTime,
    getIsDeleteAllPendingConfirmation
} from '../public/js/task-manager.js';
import { tasksOverlap, calculateEndTime } from '../public/js/utils.js'; // tasksOverlap is used in one test directly

// Mock the storage module
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn()
}));

// Import the mocked saveTasks
import { saveTasks } from '../public/js/storage.js';

const mockSaveTasks = jest.mocked(saveTasks);

describe('Task Management Functions (task-manager.js)', () => {
    beforeEach(() => {
        setTasks([]);
        mockSaveTasks.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // This is a utility function, but good to have its tests here for context
    // if it's heavily used by task-manager logic being tested.
    describe('tasksOverlap utility', () => {
        test('tasksOverlap correctly identifies overlapping tasks', () => {
            const task1 = { startTime: '09:00', endTime: '10:00' };
            const task2 = { startTime: '09:00', endTime: '10:00' }; // Full overlap
            expect(tasksOverlap(task1, task2)).toBe(true);

            const task3 = { startTime: '09:00', endTime: '10:00' };
            const task4 = { startTime: '09:30', endTime: '10:30' }; // Partial overlap (task4 starts during task3)
            expect(tasksOverlap(task3, task4)).toBe(true);

            const task5 = { startTime: '09:30', endTime: '10:30' };
            const task6 = { startTime: '09:00', endTime: '10:00' }; // Partial overlap (task5 starts during task6)
            expect(tasksOverlap(task5, task6)).toBe(true);

            const task7 = { startTime: '09:00', endTime: '11:00' };
            const task8 = { startTime: '09:30', endTime: '10:30' }; // Task8 contained within Task7
            expect(tasksOverlap(task7, task8)).toBe(true);

            const task9 = { startTime: '09:30', endTime: '10:30' };
            const task10 = { startTime: '09:00', endTime: '11:00' }; // Task9 contained within Task10
            expect(tasksOverlap(task9, task10)).toBe(true);

            const task11 = { startTime: '09:00', endTime: '10:00' };
            const task12 = { startTime: '10:00', endTime: '11:00' }; // Adjacent, not overlapping
            expect(tasksOverlap(task11, task12)).toBe(false);

            const task13 = { startTime: '09:00', endTime: '10:00' };
            const task14 = { startTime: '10:01', endTime: '11:00' }; // Not overlapping
            expect(tasksOverlap(task13, task14)).toBe(false);

            const task15 = { startTime: '09:00', endTime: '10:00' };
            const task16 = { startTime: '08:00', endTime: '09:00' }; // Adjacent, not overlapping
            expect(tasksOverlap(task15, task16)).toBe(false);
        });
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

    describe('checkOverlap', () => {
        // Helper to create mock tasks for checkOverlap tests
        const createMockTask = (desc, startTime, duration, status = 'incomplete', editing = false) => ({
            description: desc,
            startTime,
            duration,
            endTime: calculateEndTime(startTime, duration),
            status,
            editing,
            confirmingDelete: false,
        });

        let existingTasks;

        beforeEach(() => {
            setTasks([]);
            existingTasks = [
                createMockTask('T1', '09:00', 60), // 09:00 - 10:00
                createMockTask('T2', '10:00', 60), // 10:00 - 11:00
                createMockTask('T3 Completed', '11:00', 60, 'completed'), // 11:00 - 12:00
                createMockTask('T4 Editing', '12:00', 60, 'incomplete', true), // 12:00 - 13:00
            ];
        });

        test('should return empty array if no tasks overlap', () => {
            const newTask = createMockTask('New', '08:00', 30); // 08:00 - 08:30
            expect(checkOverlap(newTask, existingTasks)).toEqual([]);
        });

        test('should identify full overlap', () => {
            const newTask = createMockTask('New', '09:00', 60); // Overlaps T1
            expect(checkOverlap(newTask, existingTasks).map(t => t.description)).toEqual(['T1']);
        });

        test('should identify partial overlap (starts before, ends during)', () => {
            const newTask = createMockTask('New', '08:30', 60); // 08:30 - 09:30 (overlaps T1)
            expect(checkOverlap(newTask, existingTasks).map(t => t.description)).toEqual(['T1']);
        });

        test('should identify partial overlap (starts during, ends after)', () => {
            const newTask = createMockTask('New', '09:30', 60); // 09:30 - 10:30 (overlaps T1 and T2)
            const overlaps = checkOverlap(newTask, existingTasks);
            expect(overlaps.map(t => t.description).sort()).toEqual(['T1', 'T2'].sort());
        });

        test('should identify when new task is contained within an existing task', () => {
            const newTask = createMockTask('New', '09:15', 30); // 09:15 - 09:45 (contained in T1)
            expect(checkOverlap(newTask, existingTasks).map(t => t.description)).toEqual(['T1']);
        });

        test('should identify when new task contains an existing task', () => {
            const newTask = createMockTask('New', '08:00', 180); // 08:00 - 11:00 (contains T1 and T2)
            const overlaps = checkOverlap(newTask, existingTasks);
            expect(overlaps.map(t => t.description).sort()).toEqual(['T1', 'T2'].sort());
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
            expect(checkOverlap(newTask, tasksWithSelf).map(t => t.description)).toEqual(['T1']);
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
            confirmingDelete: false,
        });

        beforeEach(() => {
            setTasks([]);
            mockSaveTasks.mockClear();
        });

        test('should not shift any tasks if no subsequent tasks exist', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            setTasks([taskA]);
            performReschedule(taskA, getTasks());
            expect(getTasks()[0].startTime).toBe('09:00');
            expect(getTasks()[0].endTime).toBe('10:00');
        });

        test('should shift a single subsequent overlapping task', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            const taskB = createTask('B', '09:30', 30); // Original: 09:30 - 10:00
            setTasks([taskA, taskB]);

            // Simulate taskA was just updated/added, potentially causing overlap
            performReschedule(taskA, getTasks());

            const tasks = getTasks();
            const taskAResult = tasks.find(t => t.description === 'Task A');
            const taskBResult = tasks.find(t => t.description === 'Task B');

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
            setTasks([taskA, taskB, taskC]);
            performReschedule(taskA, getTasks()); // taskA's change causes cascade

            const tasks = getTasks();
            const taskAResult = tasks.find(t => t.description === 'Task A');
            const taskBResult = tasks.find(t => t.description === 'Task B');
            const taskCResult = tasks.find(t => t.description === 'Task C');

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
            setTasks([taskA, taskB_completed]);
            performReschedule(taskA, getTasks());

            expect(taskB_completed.startTime).toBe('09:30'); // Should not change
            expect(taskB_completed.endTime).toBe('10:00');
        });

        test('should not shift tasks currently being edited by the user', () => {
            const taskA = createTask('A', '09:00', 60); // 09:00 - 10:00
            const taskC_editing = createTask('C_editing', '09:45', 30, 'incomplete', true); // Original: 09:45 - 10:15
            setTasks([taskA, taskC_editing]);
            performReschedule(taskA, getTasks());

            expect(taskC_editing.startTime).toBe('09:45'); // Should not change
            expect(taskC_editing.endTime).toBe('10:15');
        });

        test('taskThatChanged maintains its properties correctly', () => {
            const taskA = createTask('A', '09:00', 60); // Ends 10:00
            const taskB = createTask('B', '10:00', 30); // Starts 10:00
            setTasks([taskA, taskB]);

            // Update taskA to overlap with B
            taskA.duration = 90; // Now 09:00 - 10:30
            taskA.endTime = calculateEndTime(taskA.startTime, taskA.duration);

            performReschedule(taskA, getTasks());

            expect(taskA.startTime).toBe('09:00');
            expect(taskA.endTime).toBe('10:30');

            const tasks = getTasks();
            const taskBResult = tasks.find(t => t.description === 'Task B');
            expect(taskBResult).toBeDefined();

            if (taskBResult) {
                expect(taskBResult.startTime).toBe('10:30');
                expect(taskBResult.endTime).toBe('11:00');
            }
        });
         test('should correctly restore editing state of taskThatChanged', () => {
            const taskA_editing = createTask('A_editing', '09:00', 60, 'incomplete', true);
            const taskB = createTask('B', '09:30', 30);
            setTasks([taskA_editing, taskB]);

            performReschedule(taskA_editing, getTasks());
            expect(taskA_editing.editing).toBe(true); // Should be restored

            const tasks = getTasks();
            const taskBResult = tasks.find(t => t.description === 'Task B');
            expect(taskBResult).toBeDefined();

            if (taskBResult) {
                expect(taskBResult.startTime).toBe('10:00');
            }
        });
    });

    describe('addTask', () => {
        beforeEach(() => {
            setTasks([]);
            mockSaveTasks.mockClear();
        });

        test('should add a task, call performReschedule, sort, and save when no overlap occurs', () => {
            addTask({ description: 'Task 1', startTime: '10:00', duration: 60 }); // 10:00 - 11:00
            const taskData = { description: 'Task 2', startTime: '09:00', duration: 30 }; // 09:00 - 09:30
            const result = addTask(taskData);

            expect(result.success).toBe(true);
            expect(result.task).toBeDefined();
            const tasks = getTasks();
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
            expect(getTasks().length).toBe(1); // Original task still there
            expect(getTasks()[0].description).toBe('Existing Task');
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });

        test('should not add an invalid task and not save', () => {
            const result = addTask({ description: '', startTime: '10:00', duration: 0 });
            expect(result.success).toBe(false);
            expect(result.reason).toBe("Description cannot be empty.");
            expect(getTasks().length).toBe(0);
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });

    describe('confirmAddTaskAndReschedule', () => {
        beforeEach(() => {
            setTasks([
                { description: 'Existing Task 1', startTime: '09:00', endTime: '10:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false },
            ]);
            mockSaveTasks.mockClear();
        });

        test('should add the task, reschedule, sort, and save', () => {
            const taskData = { description: 'New Task', startTime: '09:30', duration: 60 }; // Will overlap Existing Task 1
            const result = confirmAddTaskAndReschedule(taskData);

            expect(result.success).toBe(true);
            expect(result.task).toBeDefined();
            const tasks = getTasks();
            expect(tasks.length).toBe(2);

            const newTaskInList = tasks.find(t => t.description === 'New Task');
            const existingTaskInList = tasks.find(t => t.description === 'Existing Task 1');

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
            setTasks([
                { description: 'Task 1', startTime: '09:00', endTime: '10:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false },
                { description: 'Task 2', startTime: '10:00', endTime: '11:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false }
            ]);
            mockSaveTasks.mockClear();
        });

        test('should update a task, call performReschedule, sort, and save if no overlap occurs', () => {
            const updatedData = { description: 'Task 1 Updated', startTime: '09:00', duration: 30 }; // Ends 09:30
            const result = updateTask(0, updatedData);

            expect(result.success).toBe(true);
            expect(result.task).toBeDefined();
            const tasks = getTasks();
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

            const tasks = getTasks();
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
            expect(result.reason).toBe("Invalid task index.");
        });
    });

    describe('confirmUpdateTaskAndReschedule', () => {
        let task1, task2, task3;
        beforeEach(() => {
            task1 = { description: 'Task 1', startTime: '09:00', endTime: '10:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false };
            task2 = { description: 'Task 2', startTime: '10:00', endTime: '11:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false };
            task3 = { description: 'Task 3', startTime: '11:00', endTime: '12:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false };
            setTasks([task1, task2, task3]);
            mockSaveTasks.mockClear();
        });

        test('should update the task, reschedule subsequent tasks, sort, and save', () => {
            // Update Task 1 to overlap Task 2
            const updatedDataForT1 = { description: 'Task 1 Extended', startTime: '09:00', duration: 90 }; // New end time: 10:30
            const result = confirmUpdateTaskAndReschedule(0, updatedDataForT1);

            expect(result.success).toBe(true);
            const tasks = getTasks();
            const updatedT1 = tasks.find(t => t.description === 'Task 1 Extended');
            const shiftedT2 = tasks.find(t => t.description === 'Task 2');
            const shiftedT3 = tasks.find(t => t.description === 'Task 3');

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
            setTasks([
                { description: 'Test Task', startTime: '09:00', endTime: '10:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false },
                { description: 'Another Task', startTime: '10:00', endTime: '11:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false }
            ]);
            mockSaveTasks.mockClear();
        });

        test('should mark a task as completed on time and save', () => {
            const result = completeTask(0); // Complete 'Test Task'
            expect(result.success).toBe(true);
            const tasks = getTasks();
            expect(tasks[0].status).toBe('completed');
            expect(tasks[0].endTime).toBe('10:00'); // Original end time
            expect(mockSaveTasks).toHaveBeenCalledWith(tasks);
        });

        test('should adjust endTime and duration if completed early, and save', () => {
            const currentTime = '09:30'; // Task ends at 10:00, started at 09:00
            const result = completeTask(0, currentTime);
            expect(result.success).toBe(true);
            const tasks = getTasks();
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

            const tasks = getTasks();
            expect(tasks[0].status).toBe('incomplete'); // Not yet completed
            expect(tasks[0].endTime).toBe('10:00');    // Not yet changed
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
         test('should handle invalid index gracefully', () => {
            const result = completeTask(5, '10:00');
            expect(result.success).toBe(false);
            expect(result.reason).toBe("Invalid task index.");
        });
    });

    describe('confirmCompleteLate', () => {
        let task1, task2;
        beforeEach(() => {
            task1 = { description: 'Task A', startTime: '09:00', endTime: '10:00', duration: 60, status: 'incomplete', editing: false, confirmingDelete: false };
            task2 = { description: 'Task B', startTime: '10:00', endTime: '10:30', duration: 30, status: 'incomplete', editing: false, confirmingDelete: false };
            setTasks([task1, task2]);
            mockSaveTasks.mockClear();
        });

        test('should update task status, time, duration, reschedule, sort, and save', () => {
            const newEndTime = '10:15'; // Original was 10:00
            const newDuration = 75;    // Original was 60
            const result = confirmCompleteLate(0, newEndTime, newDuration);

            expect(result.success).toBe(true);
            const tasks = getTasks();
            const completedTask = tasks.find(t => t.description === 'Task A');
            const subsequentTask = tasks.find(t => t.description === 'Task B');

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
            expect(result.reason).toBe("Invalid task index.");
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
            expect(getTasks().length).toBe(1);
            expect(getTasks()[0].description).toBe('Task 2');
            expect(mockSaveTasks).toHaveBeenCalledWith(getTasks());
        });

        test('should require confirmation if not confirmed, and set flag', () => {
            const result = deleteTask(0, false);
            expect(result.success).toBe(false);
            expect(result.requiresConfirmation).toBe(true);
            expect(getTasks().length).toBe(2); // Task still exists
            expect(getTasks()[0].confirmingDelete).toBe(true);
            expect(mockSaveTasks).not.toHaveBeenCalled(); // Not saved yet
        });
    });

    describe('editTask / cancelEdit', () => {
        beforeEach(() => {
            addTask({ description: 'Test Task', startTime: '09:00', duration: 60 });
            mockSaveTasks.mockClear();
        });

        test('editTask should set editing flag and clear confirmingDelete', () => {
            getTasks()[0].confirmingDelete = true; // Set it first
            const result = editTask(0);
            expect(result.success).toBe(true);
            expect(getTasks()[0].editing).toBe(true);
            expect(getTasks()[0].confirmingDelete).toBe(false);
            expect(mockSaveTasks).not.toHaveBeenCalled(); // UI state change only
        });

        test('cancelEdit should clear editing flag', () => {
            getTasks()[0].editing = true; // Set it first
            const result = cancelEdit(0);
            expect(result.success).toBe(true);
            expect(getTasks()[0].editing).toBe(false);
            expect(mockSaveTasks).not.toHaveBeenCalled(); // UI state change only
        });
    });

    describe('deleteAllTasks', () => {
        beforeEach(() => {
            addTask({ description: 'Task 1', startTime: '09:00', duration: 60 });
            addTask({ description: 'Task 2', startTime: '10:00', duration: 60 });
            mockSaveTasks.mockClear();
        });

        test('should remove all tasks if deleteAllTasks(true) is called after deleteAllTasks(false)', () => {
            deleteAllTasks(false); // Set pending confirmation
            expect(getIsDeleteAllPendingConfirmation()).toBe(true);
            mockSaveTasks.mockClear();
            const result = deleteAllTasks(true);
            expect(result.success).toBe(true);
            expect(getTasks().length).toBe(0);
            expect(mockSaveTasks).toHaveBeenCalledWith([]);
            // Check that the flag is reset after successful deletion
            expect(getIsDeleteAllPendingConfirmation()).toBe(false);
        });

        test('should remove all tasks if deleteAllTasks(true) is called directly', () => {
            const result = deleteAllTasks(true);
            expect(result.success).toBe(true);
            expect(getTasks().length).toBe(0);
            expect(mockSaveTasks).toHaveBeenCalledWith([]);
        });


        test('should require confirmation if deleteAllTasks(false) and tasks exist', () => {
            const result = deleteAllTasks(false);
            expect(result.success).toBe(false);
            expect(result.requiresConfirmation).toBe(true);
            expect(result.reason).toBe("Are you sure you want to delete all tasks?");
            expect(getTasks().length).toBe(2); // Tasks still exist
            expect(mockSaveTasks).not.toHaveBeenCalled();
            // Check that the isDeleteAllPendingConfirmation flag is set
            expect(getIsDeleteAllPendingConfirmation()).toBe(true);
        });

        test('should return success if no tasks to delete (even if confirmed=false)', () => {
            setTasks([]);
            mockSaveTasks.mockClear();
            const result = deleteAllTasks(false); // No tasks, so no confirmation needed.
            expect(result.success).toBe(true);
            expect(result.message).toBe("No tasks to delete.");
            expect(getTasks().length).toBe(0);
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
         test('should return success if no tasks to delete (confirmed=true)', () => {
            setTasks([]);
            mockSaveTasks.mockClear();
            const result = deleteAllTasks(true);
            expect(result.success).toBe(true);
            expect(result.message).toBe("No tasks to delete.");
            expect(getTasks().length).toBe(0);
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });

    // Old autoReschedule tests are removed. Its functionality is tested
    // via addTask, updateTask, confirmCompleteLate, etc., and performReschedule.
});
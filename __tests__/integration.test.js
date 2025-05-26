/**
 * @jest-environment jsdom
 */

// Integration tests for user confirmation flows and DOM interactions.

import {
    setupIntegrationTestEnvironment,
    addTaskDOM,
    updateTaskDOM,
    getRenderedTasksDOM,
    getTaskDataFromLocalStorage,
    saveTasksToLocalStorage,
    clearLocalStorage,
    clickCompleteCheckbox,
    clickDeleteAllButton,
    getTaskFormElement,
    getEditFormForTask,
    clickSaveButtonOnEditForm,
    clickCancelButtonOnEditForm,
    clickEditButtonForTask,
    setCurrentTimeInDOM
} from './test-utils.js';

import { setTasks } from '../public/js/task-manager.js';

// Mock storage.js to spy on saveTasks
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    loadTasks: jest.fn(() => []) // Start with no tasks loaded unless specified by a test
}));
import { saveTasks as mockSaveTasksInternal, loadTasks as mockLoadTasksInternal } from '../public/js/storage.js';

const mockSaveTasks = jest.mocked(mockSaveTasksInternal);
const mockLoadTasks = jest.mocked(mockLoadTasksInternal);


describe('User Confirmation Flows', () => {
    let alertSpy;
    let confirmSpy;

    beforeEach(async () => {
        // Reset DOM and app state
        document.body.innerHTML = '';
        clearLocalStorage();

        // Clear mocks
        jest.clearAllMocks();
        mockLoadTasks.mockReturnValue([]); // Default to loading no tasks

        // Reset task manager state to ensure no contamination between tests
        setTasks([]);

        // Ensure clean spy state - restore any existing spies first
        if (alertSpy) {
            alertSpy.mockRestore();
            alertSpy = undefined;
        }
        if (confirmSpy) {
            confirmSpy.mockRestore();
            confirmSpy = undefined;
        }
    });

    afterEach(() => {
        if (alertSpy) {
            alertSpy.mockRestore();
            alertSpy = undefined;
        }
        if (confirmSpy) {
            confirmSpy.mockRestore();
            confirmSpy = undefined;
        }
        clearLocalStorage();
    });

    describe('Add Task with Reschedule Confirmation', () => {
        const getInitialTask = () => ({ description: 'Initial Task', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false });

        const setupInitialStateAndApp = async () => {
            // Clear any existing DOM content first
            document.body.innerHTML = '';
            clearLocalStorage();

            // Get a fresh copy of the initial task for this test
            const initialTask = getInitialTask();

            // Set up the mock to return the initial task when loadTasks is called
            mockLoadTasks.mockReturnValue([initialTask]);

            // Set up the integration test environment (this will call loadTasks)
            await setupIntegrationTestEnvironment();

            // After the environment is set up, we need to manually ensure
            // the task manager state has the initial task, since the mock might not
            // have been called at the right time during app initialization
            setTasks([initialTask]);

            // Ensure any existing spies are cleaned up before creating new ones
            if (alertSpy) alertSpy.mockRestore();
            if (confirmSpy) confirmSpy.mockRestore();

            // Set up fresh spies after the environment is initialized
            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('User confirms reschedule: overlapping task added, initial task IS shifted (correct behavior)', async () => {
            await setupInitialStateAndApp();

            confirmSpy.mockReturnValueOnce(true);

            const overlappingTaskData = { description: 'Overlapping Task', startTime: '09:30', duration: 60 };
            await addTaskDOM(overlappingTaskData.description, overlappingTaskData.startTime, '1', '0');

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain("Adding this task may overlap");

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const initialTaskDOM = tasks.find(t => t.description === 'Initial Task');
            const overlappingTaskDOM = tasks.find(t => t.description === 'Overlapping Task');

            expect(initialTaskDOM).toBeDefined();
            if (initialTaskDOM) {
                // After reschedule, the initial task should be shifted to 10:30 AM - 11:30 AM
                expect(initialTaskDOM.startTime12).toBe('10:30 AM');
                expect(initialTaskDOM.endTime12).toBe('11:30 AM');
            }

            expect(overlappingTaskDOM).toBeDefined();
            if (overlappingTaskDOM) {
                // The overlapping task should take the 9:30 AM - 10:30 AM slot
                expect(overlappingTaskDOM.startTime12).toBe('9:30 AM');
                expect(overlappingTaskDOM.endTime12).toBe('10:30 AM');
            }

            expect(mockSaveTasks).toHaveBeenCalledTimes(1);
            const savedTasks = mockSaveTasks.mock.calls[0][0];
            expect(savedTasks.find(t=>t.description === 'Initial Task').startTime).toBe('10:30');
            expect(savedTasks.find(t=>t.description === 'Overlapping Task').endTime).toBe('10:30');
        });

        test('User denies reschedule: overlapping task not added', async () => {
            await setupInitialStateAndApp();

            confirmSpy.mockReturnValueOnce(false);

            const overlappingTaskData = { description: 'Overlapping Task', startTime: '09:30', duration: 60 };
            await addTaskDOM(overlappingTaskData.description, overlappingTaskData.startTime, '1', '0');

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(alertSpy).toHaveBeenCalledWith("Task not added to avoid rescheduling.");

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(1);
            expect(tasks[0].description).toBe('Initial Task');

            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });

    describe('Update Task with Reschedule Confirmation', () => {
        const getTaskAData = () => ({ description: 'Task A', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false });
        const getTaskBData = () => ({ description: 'Task B', startTime: '10:00', duration: 60, endTime: '11:00', status: 'incomplete', editing: false, confirmingDelete: false });

        const setupInitialStateAndApp = async () => {
            // Get fresh copies of the tasks for this test
            const taskAData = getTaskAData();
            const taskBData = getTaskBData();

            document.body.innerHTML = '';
            clearLocalStorage();
            mockLoadTasks.mockReturnValue([taskAData, taskBData]);
            await setupIntegrationTestEnvironment();

            // Ensure task manager state has the correct tasks
            setTasks([taskAData, taskBData]);

            // Ensure any existing spies are cleaned up before creating new ones
            if (alertSpy) alertSpy.mockRestore();
            if (confirmSpy) confirmSpy.mockRestore();

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('User confirms reschedule: Task A updated, Task B shifted', async () => {
            await setupInitialStateAndApp();
            confirmSpy.mockReturnValueOnce(true);

            await updateTaskDOM(0, { description: 'Task A Updated', startTime: '09:00', durationHours: '1', durationMinutes: '30' });

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain("Updating this task may overlap");

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const taskADOM = tasks.find(t => t.description === 'Task A Updated');
            const taskBDOM = tasks.find(t => t.description === 'Task B');

            expect(taskADOM).toBeDefined();
            if (taskADOM) {
                expect(taskADOM.startTime12).toBe('9:00 AM');
                expect(taskADOM.endTime12).toBe('10:30 AM');
            }

            expect(taskBDOM).toBeDefined();
            if (taskBDOM) {
                expect(taskBDOM.startTime12).toBe('10:30 AM');
                expect(taskBDOM.endTime12).toBe('11:30 AM');
            }

            expect(mockSaveTasks).toHaveBeenCalledTimes(1);
            const savedTasks = mockSaveTasks.mock.calls[0][0];
            expect(savedTasks.find(t => t.description === 'Task A Updated').endTime).toBe('10:30');
            expect(savedTasks.find(t => t.description === 'Task B').startTime).toBe('10:30');
        });

        test('User denies reschedule: Task A not updated, Task B unchanged', async () => {
            await setupInitialStateAndApp();
            confirmSpy.mockReturnValueOnce(false);

            await updateTaskDOM(0, { description: 'Task A Updated Attempt', startTime: '09:00', durationHours: '1', durationMinutes: '30' });

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(alertSpy).toHaveBeenCalledWith("Task update cancelled to avoid rescheduling.");

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const taskADOM = tasks.find(t => t.description === 'Task A');
            const taskBDOM = tasks.find(t => t.description === 'Task B');

            expect(taskADOM).toBeDefined();
            if (taskADOM) {
                expect(taskADOM.startTime12).toBe('9:00 AM');
                expect(taskADOM.endTime12).toBe('10:00 AM');
            }

            expect(taskBDOM).toBeDefined();
            if (taskBDOM) {
                expect(taskBDOM.startTime12).toBe('10:00 AM');
                expect(taskBDOM.endTime12).toBe('11:00 AM');
            }

            const editFormTaskA = getEditFormForTask(0);
            expect(editFormTaskA).toBeNull(); // Edit form should be removed from DOM when editing is cancelled

            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });

    describe('Complete Task Late with Schedule Update Confirmation', () => {
        const getTaskToComplete = () => ({ description: 'Task To Complete', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false });
        const getSubsequentTask = () => ({ description: 'Subsequent Task', startTime: '10:00', duration: 30, endTime: '10:30', status: 'incomplete', editing: false, confirmingDelete: false });

        const setupInitialStateAndApp = async (includeSubsequent = false) => {
            // Get fresh copies of the tasks for this test
            const taskToComplete = getTaskToComplete();
            const subsequentTask = getSubsequentTask();
            const initialTasks = includeSubsequent ? [taskToComplete, subsequentTask] : [taskToComplete];

            document.body.innerHTML = '';
            clearLocalStorage();
            mockLoadTasks.mockReturnValue(initialTasks);
            await setupIntegrationTestEnvironment();

            // Ensure task manager state has the correct tasks
            setTasks(initialTasks);

            // Ensure any existing spies are cleaned up before creating new ones
            if (alertSpy) alertSpy.mockRestore();
            if (confirmSpy) confirmSpy.mockRestore();

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('User confirms schedule update: Task completed late, time updated, subsequent task shifted', async () => {
            await setupInitialStateAndApp(true);
            setCurrentTimeInDOM('10:30 AM');
            confirmSpy.mockReturnValueOnce(true);

            await clickCompleteCheckbox(0);

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain("update your schedule to show you finished at 10:30 AM");

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const completedTaskDOM = tasks.find(t => t.description === 'Task To Complete');
            const subsequentTaskDOM = tasks.find(t => t.description === 'Subsequent Task');

            expect(completedTaskDOM).toBeDefined();
            if (completedTaskDOM) {
                expect(completedTaskDOM.isCompleted).toBe(true);
                expect(completedTaskDOM.endTime12).toBe('10:30 AM');
            }

            expect(subsequentTaskDOM).toBeDefined();
            if (subsequentTaskDOM) {
                expect(subsequentTaskDOM.startTime12).toBe('10:30 AM');
                expect(subsequentTaskDOM.endTime12).toBe('11:00 AM');
            }

            expect(mockSaveTasks).toHaveBeenCalledTimes(1);
            const savedTasks = mockSaveTasks.mock.calls[0][0];
            expect(savedTasks.find(t=>t.description === 'Task To Complete').endTime).toBe('10:30');
            expect(savedTasks.find(t=>t.description === 'Subsequent Task').startTime).toBe('10:30');
        });

        test('User denies schedule update: Task completed, original time preserved, subsequent task not shifted', async () => {
            await setupInitialStateAndApp(true);
            setCurrentTimeInDOM('10:30 AM');
            confirmSpy.mockReturnValueOnce(false);

            await clickCompleteCheckbox(0);

            expect(confirmSpy).toHaveBeenCalledTimes(1);

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const completedTaskDOM = tasks.find(t => t.description === 'Task To Complete');
            const subsequentTaskDOM = tasks.find(t => t.description === 'Subsequent Task');

            expect(completedTaskDOM).toBeDefined();
            if (completedTaskDOM) {
                expect(completedTaskDOM.isCompleted).toBe(true);
                expect(completedTaskDOM.endTime12).toBe('10:00 AM');
            }

            expect(subsequentTaskDOM).toBeDefined();
            if (subsequentTaskDOM) {
                expect(subsequentTaskDOM.startTime12).toBe('10:00 AM');
                expect(subsequentTaskDOM.endTime12).toBe('10:30 AM');
            }

            expect(mockSaveTasks).toHaveBeenCalledTimes(1);
            const savedTasks = mockSaveTasks.mock.calls[0][0];
            expect(savedTasks.find(t=>t.description === 'Task To Complete').status).toBe('completed');
            expect(savedTasks.find(t=>t.description === 'Task To Complete').endTime).toBe('10:00');
            expect(savedTasks.find(t=>t.description === 'Subsequent Task').startTime).toBe('10:00');
        });
    });

    describe('Delete All Tasks with Confirmation', () => {
        const setupInitialStateWithTasks = async () => {
            const tasksToLoad = [
                { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false },
                { description: 'Task 2', startTime: '10:00', duration: 30, endTime: '10:30', status: 'incomplete', editing: false, confirmingDelete: false }
            ];
            document.body.innerHTML = '';
            clearLocalStorage();
            mockLoadTasks.mockReturnValue(tasksToLoad);
            await setupIntegrationTestEnvironment();

            // Ensure task manager state has the correct tasks
            setTasks(tasksToLoad);

            // Ensure any existing spies are cleaned up before creating new ones
            if (alertSpy) alertSpy.mockRestore();
            if (confirmSpy) confirmSpy.mockRestore();

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('User confirms delete all: all tasks are removed', async () => {
            await setupInitialStateWithTasks();
            confirmSpy.mockReturnValueOnce(true);

            await clickDeleteAllButton();

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain("Are you sure you want to delete all tasks?");

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(0);

            expect(mockSaveTasks).toHaveBeenCalledTimes(1);
            expect(mockSaveTasks.mock.calls[0][0]).toEqual([]); // Saved an empty array
        });

        test('User denies delete all: tasks remain unchanged', async () => {
            await setupInitialStateWithTasks();
            confirmSpy.mockReturnValueOnce(false);

            await clickDeleteAllButton();

            expect(confirmSpy).toHaveBeenCalledTimes(1);

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2); // Tasks should still be there
            expect(tasks[0].description).toBe('Task 1');

            expect(mockSaveTasks).not.toHaveBeenCalled(); // No save because action was cancelled
        });

        test('Delete All button does nothing if no tasks exist', async () => {
            // No initial tasks setup, so localStorage is empty, mockLoadTasks returns [] by default
            await setupIntegrationTestEnvironment(); // Re-init with empty

            // Ensure any existing spies are cleaned up before creating new ones
            if (alertSpy) alertSpy.mockRestore();
            if (confirmSpy) confirmSpy.mockRestore();

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();

            await clickDeleteAllButton();

            expect(confirmSpy).not.toHaveBeenCalled(); // No confirmation needed if no tasks
            expect(alertSpy).toHaveBeenCalledWith("There are no tasks to delete.");
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });
});

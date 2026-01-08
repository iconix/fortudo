/**
 * @jest-environment jsdom
 */

// Integration tests for user confirmation flows and DOM interactions.

import {
    setupIntegrationTestEnvironment,
    addTaskDOM,
    updateTaskDOM,
    getRenderedTasksDOM,
    clearLocalStorage,
    clickCompleteCheckbox,
    clickDeleteAllButton,
    getEditFormForTask,
    setCurrentTimeInDOM,
    createTaskWithDateTime
} from './test-utils.js';

import { resetEventDelegation } from '../public/js/dom-handler.js';

import * as domHandler from '../public/js/dom-handler.js';

import { extractTimeFromDateTime } from '../public/js/utils.js';

// Mock storage.js to spy on saveTasks
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    loadTasksFromStorage: jest.fn(() => []) // Start with no tasks loaded unless specified by a test
}));
import {
    saveTasks as mockSaveTasksInternal,
    loadTasksFromStorage as mockLoadTasksFromStorageInternal
} from '../public/js/storage.js';

// Import task-manager after the mock since it depends on mock storage.js
import * as taskManager from '../public/js/task-manager.js';

const mockSaveTasks = jest.mocked(mockSaveTasksInternal);
const mockLoadTasksFromStorage = jest.mocked(mockLoadTasksFromStorageInternal);

describe('User Confirmation Flows', () => {
    let alertSpy;
    let confirmSpy;

    beforeEach(async () => {
        // Reset DOM and app state
        document.body.innerHTML = '';
        clearLocalStorage();

        // Reset event delegation state for clean tests
        resetEventDelegation();

        // Clear mocks
        jest.clearAllMocks();
        mockLoadTasksFromStorage.mockReturnValue([]); // Default to loading no tasks

        // Note: Removed updateTaskState call - let the app handle task loading naturally

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
        const getInitialTask = () => createTaskWithDateTime({
            description: 'Initial Task',
            startTime: '09:00',
            duration: 60,
            status: 'incomplete',
            editing: false,
            confirmingDelete: false,
            locked: false
        });

        const setupInitialStateAndApp = async () => {
            // Clear any existing DOM content first
            document.body.innerHTML = '';
            clearLocalStorage();

            // Get a fresh copy of the initial task for this test
            const initialTask = getInitialTask();

            // Set up the mock to return the initial task when loadTasks is called
            mockLoadTasksFromStorage.mockReturnValue([initialTask]);

            // Set up the integration test environment (this will call loadTasks)
            await setupIntegrationTestEnvironment();

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

            const overlappingTaskData = {
                description: 'Overlapping Task',
                duration: 60
            };
            const startTime = '09:30';
            await addTaskDOM(overlappingTaskData.description, startTime, '1', '0');

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain('will overlap other tasks');

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const initialTaskDOM = tasks.find((t) => t.description === 'Initial Task');
            const overlappingTaskDOM = tasks.find((t) => t.description === 'Overlapping Task');

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
            expect(
                extractTimeFromDateTime(
                    new Date(savedTasks.find((t) => t.description === 'Initial Task').startDateTime)
                )
            ).toBe('10:30');
            expect(
                extractTimeFromDateTime(
                    new Date(
                        savedTasks.find((t) => t.description === 'Overlapping Task').endDateTime
                    )
                )
            ).toBe('10:30');
        });

        test('User denies reschedule: overlapping task not added', async () => {
            await setupInitialStateAndApp();

            confirmSpy.mockReturnValueOnce(false);

            const overlappingTaskData = {
                description: 'Overlapping Task',
                duration: 60
            };
            const startTime = '09:30';
            await addTaskDOM(overlappingTaskData.description, startTime, '1', '0');

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(alertSpy).toHaveBeenCalledWith('Task not added to avoid rescheduling.');

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(1);
            expect(tasks[0].description).toBe('Initial Task');

            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });

    describe('Update Task with Reschedule Confirmation', () => {
        const getTaskAData = () => createTaskWithDateTime({
            description: 'Task A',
            startTime: '09:00',
            duration: 60,
            status: 'incomplete',
            editing: false,
            confirmingDelete: false,
            locked: false
        });
        const getTaskBData = () => createTaskWithDateTime({
            description: 'Task B',
            startTime: '10:00',
            duration: 60,
            status: 'incomplete',
            editing: false,
            confirmingDelete: false,
            locked: false
        });

        const setupInitialStateAndApp = async () => {
            // Get fresh copies of the tasks for this test
            const taskAData = getTaskAData();
            const taskBData = getTaskBData();

            document.body.innerHTML = '';
            clearLocalStorage();
            mockLoadTasksFromStorage.mockReturnValue([taskAData, taskBData]);
            await setupIntegrationTestEnvironment();

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

            await updateTaskDOM(0, {
                description: 'Task A Updated',
                startTime: '09:00',
                durationHours: '1',
                durationMinutes: '30'
            });

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain('Updating this task may overlap');

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const taskADOM = tasks.find((t) => t.description === 'Task A Updated');
            const taskBDOM = tasks.find((t) => t.description === 'Task B');

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
            expect(
                extractTimeFromDateTime(
                    new Date(savedTasks.find((t) => t.description === 'Task A Updated').endDateTime)
                )
            ).toBe('10:30');
            expect(
                extractTimeFromDateTime(
                    new Date(savedTasks.find((t) => t.description === 'Task B').startDateTime)
                )
            ).toBe('10:30');
        });

        test('User denies reschedule: Task A not updated, Task B unchanged', async () => {
            await setupInitialStateAndApp();
            confirmSpy.mockReturnValueOnce(false);

            await updateTaskDOM(0, {
                description: 'Task A Updated Attempt',
                startTime: '09:00',
                durationHours: '1',
                durationMinutes: '30'
            });

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(alertSpy).toHaveBeenCalledWith('Task not updated to avoid rescheduling.');

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const taskADOM = tasks.find((t) => t.description === 'Task A');
            const taskBDOM = tasks.find((t) => t.description === 'Task B');

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
        const getTaskToComplete = () => createTaskWithDateTime({
            description: 'Task To Complete',
            startTime: '09:00',
            duration: 60,
            status: 'incomplete',
            editing: false,
            confirmingDelete: false,
            locked: false
        });
        const getSubsequentTask = () => createTaskWithDateTime({
            description: 'Subsequent Task',
            startTime: '10:00',
            duration: 30,
            status: 'incomplete',
            editing: false,
            confirmingDelete: false,
            locked: false
        });

        const setupInitialStateAndApp = async (initialTasks = []) => {
            document.body.innerHTML = '';
            clearLocalStorage();

            // Set up the mock to return the initial tasks when loadTasks is called
            mockLoadTasksFromStorage.mockReturnValue(initialTasks);

            await setupIntegrationTestEnvironment();

            // Ensure any existing spies are cleaned up before creating new ones
            if (alertSpy) alertSpy.mockRestore();
            if (confirmSpy) confirmSpy.mockRestore();

            // Set up fresh spies after the environment is initialized
            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('User confirms schedule update: Task completed late, time updated, subsequent task shifted', async () => {
            await setupInitialStateAndApp([getTaskToComplete(), getSubsequentTask()]);
            setCurrentTimeInDOM('10:30 AM');
            confirmSpy.mockReturnValueOnce(true);

            await clickCompleteCheckbox(0);

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain(
                'Do you want to update your schedule to show you finished at 10:30 AM'
            );

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const completedTaskDOM = tasks.find((t) => t.description === 'Task To Complete');
            const subsequentTaskDOM = tasks.find((t) => t.description === 'Subsequent Task');

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
            expect(savedTasks.find((t) => t.description === 'Task To Complete').status).toBe(
                'completed'
            );
            expect(
                extractTimeFromDateTime(
                    new Date(
                        savedTasks.find((t) => t.description === 'Task To Complete').endDateTime
                    )
                )
            ).toBe('10:30');
            expect(
                extractTimeFromDateTime(
                    new Date(
                        savedTasks.find((t) => t.description === 'Subsequent Task').startDateTime
                    )
                )
            ).toBe('10:30');
        });

        test('User denies schedule update: Task completed, original time preserved, subsequent task not shifted', async () => {
            await setupInitialStateAndApp([getTaskToComplete(), getSubsequentTask()]);
            setCurrentTimeInDOM('10:30 AM');
            confirmSpy.mockReturnValueOnce(false);

            await clickCompleteCheckbox(0);

            expect(confirmSpy).toHaveBeenCalledTimes(1);

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2);

            const completedTaskDOM = tasks.find((t) => t.description === 'Task To Complete');
            const subsequentTaskDOM = tasks.find((t) => t.description === 'Subsequent Task');

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
            expect(savedTasks.find((t) => t.description === 'Task To Complete').status).toBe(
                'completed'
            );
            expect(
                extractTimeFromDateTime(
                    new Date(
                        savedTasks.find((t) => t.description === 'Task To Complete').endDateTime
                    )
                )
            ).toBe('10:00');
            expect(
                extractTimeFromDateTime(
                    new Date(
                        savedTasks.find((t) => t.description === 'Subsequent Task').startDateTime
                    )
                )
            ).toBe('10:00');
        });

        test('Start time field is force updated after confirming late completion with schedule change', async () => {
            await setupInitialStateAndApp([getTaskToComplete(), getSubsequentTask()]);

            // Mock specific utility functions instead of the entire Date system
            const mockCurrentTime = '10:30';
            const getCurrentTimeRoundedSpy = jest
                .spyOn(require('../public/js/utils.js'), 'getCurrentTimeRounded')
                .mockReturnValue(mockCurrentTime);

            setCurrentTimeInDOM('10:30 AM');
            confirmSpy.mockReturnValueOnce(true);

            // Set a specific value in the start time field before completing the task
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (startTimeInput instanceof HTMLInputElement) {
                startTimeInput.value = '08:00'; // Set to some arbitrary time
                expect(startTimeInput.value).toBe('08:00'); // Verify it's set
            }

            await clickCompleteCheckbox(0);

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain(
                'Do you want to update your schedule to show you finished at 10:30 AM'
            );

            // Verify start time field was force updated (should have changed from the original value)
            if (startTimeInput instanceof HTMLInputElement) {
                expect(startTimeInput.value).not.toBe('08:00'); // Should have changed from the original value
                expect(startTimeInput.value).toBeTruthy(); // Should have some value
                // The exact value will depend on getSuggestedStartTime(), but it should be a valid time format
                expect(startTimeInput.value).toMatch(/^\d{2}:\d{2}$/); // Should match HH:MM format
                // Since the subsequent task now starts at 10:30 and ends at 11:00,
                // the suggested start time should be 11:00
                expect(startTimeInput.value).toBe('11:00');
            }

            expect(mockSaveTasks).toHaveBeenCalledTimes(1);

            // Clean up the spy
            getCurrentTimeRoundedSpy.mockRestore();
        });
    });

    describe('Delete All Tasks with Confirmation', () => {
        const setupInitialStateAndApp = async (initialTasks = []) => {
            document.body.innerHTML = '';
            clearLocalStorage();

            // Set up the mock to return the initial tasks when loadTasks is called
            mockLoadTasksFromStorage.mockReturnValue(initialTasks);

            // Save tasks to localStorage for the app to load
            if (window.localStorage) {
                window.localStorage.setItem('tasks', JSON.stringify(initialTasks));
            }

            // Set up the integration test environment (this will call loadTasks)
            await setupIntegrationTestEnvironment();

            // Ensure any existing spies are cleaned up before creating new ones
            if (alertSpy) alertSpy.mockRestore();
            if (confirmSpy) confirmSpy.mockRestore();

            // Set up fresh spies after the environment is initialized
            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('User confirms delete all: all tasks are removed', async () => {
            await setupInitialStateAndApp([
                {
                    description: 'Task 1',
                    startTime: '09:00',
                    duration: 60,
                    endTime: '10:00',
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                },
                {
                    description: 'Task 2',
                    startTime: '10:00',
                    duration: 30,
                    endTime: '10:30',
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                }
            ]);
            confirmSpy.mockReturnValueOnce(true);

            await clickDeleteAllButton();

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain(
                'Are you sure you want to delete ALL tasks'
            );

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(0);

            expect(mockSaveTasks).toHaveBeenCalledTimes(1);
            expect(mockSaveTasks.mock.calls[0][0]).toEqual([]); // Saved an empty array
        });

        test('User denies delete all: tasks remain unchanged', async () => {
            await setupInitialStateAndApp([
                {
                    description: 'Task 1',
                    startTime: '09:00',
                    duration: 60,
                    endTime: '10:00',
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                },
                {
                    description: 'Task 2',
                    startTime: '10:00',
                    duration: 30,
                    endTime: '10:30',
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                }
            ]);
            confirmSpy.mockReturnValueOnce(false);

            await clickDeleteAllButton();

            expect(confirmSpy).toHaveBeenCalledTimes(1);

            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(2); // Tasks should still be there
            expect(tasks[0].description).toBe('Task 1');

            expect(mockSaveTasks).not.toHaveBeenCalled(); // No save because action was cancelled
        });

        test('Delete All button does nothing if no tasks exist', async () => {
            // No initial tasks setup, so localStorage is empty, mockLoadTasksFromStorage returns [] by default
            await setupIntegrationTestEnvironment(); // Re-init with empty

            // Ensure any existing spies are cleaned up before creating new ones
            if (alertSpy) alertSpy.mockRestore();
            if (confirmSpy) confirmSpy.mockRestore();

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true); // User confirms
            mockSaveTasks.mockClear();

            await clickDeleteAllButton();

            expect(confirmSpy).not.toHaveBeenCalled(); // No confirmation needed if no tasks
            expect(alertSpy).not.toHaveBeenCalled();
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });

        test('Start time field is reset after all tasks are deleted', async () => {
            await setupInitialStateAndApp([
                {
                    description: 'Task 1',
                    startTime: '09:00',
                    duration: 60,
                    endTime: '10:00',
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                },
                {
                    description: 'Task 2',
                    startTime: '10:00',
                    duration: 30,
                    endTime: '10:30',
                    status: 'incomplete',
                    editing: false,
                    confirmingDelete: false
                }
            ]);
            confirmSpy.mockReturnValueOnce(true);

            // Set a value in the start time field before deleting all tasks
            const startTimeInput = document.querySelector('#task-form input[name="start-time"]');
            if (startTimeInput instanceof HTMLInputElement) {
                startTimeInput.value = '15:30'; // Set to some arbitrary time
                expect(startTimeInput.value).toBe('15:30'); // Verify it's set
            }

            await clickDeleteAllButton();

            expect(confirmSpy).toHaveBeenCalledTimes(1);
            expect(confirmSpy.mock.calls[0][0]).toContain(
                'Are you sure you want to delete ALL tasks'
            );

            // Verify all tasks are deleted
            const tasks = getRenderedTasksDOM();
            expect(tasks.length).toBe(0);

            // Verify start time field is reset (should have changed from the original value)
            if (startTimeInput instanceof HTMLInputElement) {
                expect(startTimeInput.value).not.toBe('15:30'); // Should have changed from the original value
                expect(startTimeInput.value).toBeTruthy(); // Should have some value (current time rounded)
                // The exact value will depend on getCurrentTimeRounded(), but it should be a valid time format
                expect(startTimeInput.value).toMatch(/^\d{2}:\d{2}$/); // Should match HH:MM format
            }

            expect(mockSaveTasks).toHaveBeenCalledTimes(1);
            expect(mockSaveTasks.mock.calls[0][0]).toEqual([]); // Saved an empty array
        });
    });

    describe('Late Task Warning Feature', () => {
        const setupInitialStateAndApp = async (initialTasks = []) => {
            document.body.innerHTML = '';
            clearLocalStorage();

            // Set up the mock to return the initial tasks when loadTasks is called
            mockLoadTasksFromStorage.mockReturnValue(initialTasks);

            // Save tasks to localStorage for the app to load
            if (window.localStorage) {
                window.localStorage.setItem('tasks', JSON.stringify(initialTasks));
            }

            // Set up the integration test environment (this will call loadTasks)
            await setupIntegrationTestEnvironment();

            // Ensure any existing spies are cleaned up before creating new ones
            if (alertSpy) alertSpy.mockRestore();
            if (confirmSpy) confirmSpy.mockRestore();

            // Set up fresh spies after the environment is initialized
            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('Active task color changes from green to yellow when it becomes late', async () => {
            const date = '2023-01-01';
            const activeTask = createTaskWithDateTime({
                description: 'Active Task',
                startTime: '13:30',
                duration: 60,
                status: 'incomplete',
                editing: false,
                confirmingDelete: false,
                date
            });

            const completedTask = createTaskWithDateTime({
                description: 'Completed Task',
                startTime: '12:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false,
                date
            });

            await setupInitialStateAndApp([completedTask, activeTask]);

            // Get the active task element (should be the first incomplete task)
            // The active task should be at index 1 (after the completed task)
            const activeTaskElement = document.getElementById('view-task-1');
            expect(activeTaskElement).toBeTruthy();
            if (!activeTaskElement) return; // Type guard

            // Helper function to find task description and time divs with color classes
            const findColoredTaskDivs = () => {
                const taskDivs = activeTaskElement.querySelectorAll('div');
                const coloredDivs = [];
                for (const div of taskDivs) {
                    if (
                        div.classList.contains('text-green-500') ||
                        div.classList.contains('text-yellow-500')
                    ) {
                        coloredDivs.push(div);
                    }
                }
                return coloredDivs;
            };

            // PHASE 1: Use a date BEFORE the task end time (14:20 - task ended at 14:30)
            // Task should be green (on time)
            const beforeEndTime = new Date(`${date}T14:20:00`);

            // Update the active task color
            domHandler.refreshActiveTaskColor(taskManager.getTaskState(), beforeEndTime);

            // Find all colored divs and verify they are green
            let coloredDivs = findColoredTaskDivs();
            expect(coloredDivs.length).toBeGreaterThan(0); // Should have at least one colored div

            for (const div of coloredDivs) {
                expect(div.classList.contains('text-green-500')).toBe(true);
                expect(div.classList.contains('text-yellow-500')).toBe(false);
            }

            // PHASE 2: Use a date AFTER the task end time (14:40 - task ended at 14:30)
            // Task should be yellow (late)
            const afterEndTime = new Date(`${date}T14:40:00`);

            // Update the active task color again
            domHandler.refreshActiveTaskColor(taskManager.getTaskState(), afterEndTime);

            // Find all colored divs and verify they are now yellow
            coloredDivs = findColoredTaskDivs();
            expect(coloredDivs.length).toBeGreaterThan(0); // Should still have colored divs

            for (const div of coloredDivs) {
                expect(div.classList.contains('text-yellow-500')).toBe(true);
                expect(div.classList.contains('text-green-500')).toBe(false);
            }

            // PHASE 3: Use a date back BEFORE the task end time (14:20 - task ended at 14:30)
            // Task should be green again (back on time)
            const beforeEndTimeAgain = new Date(`${date}T14:20:00`);

            // Update the active task color one more time
            domHandler.refreshActiveTaskColor(taskManager.getTaskState(), beforeEndTimeAgain);

            // Find all colored divs and verify they are green again
            coloredDivs = findColoredTaskDivs();
            expect(coloredDivs.length).toBeGreaterThan(0); // Should still have colored divs

            for (const div of coloredDivs) {
                expect(div.classList.contains('text-green-500')).toBe(true);
                expect(div.classList.contains('text-yellow-500')).toBe(false);
            }
        });

        test('No active task styling when all tasks are completed', async () => {
            const completedTask1 = createTaskWithDateTime({
                description: 'Completed Task 1',
                startTime: '12:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });

            const completedTask2 = createTaskWithDateTime({
                description: 'Completed Task 2',
                startTime: '13:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });

            await setupInitialStateAndApp([completedTask1, completedTask2]);

            // Trigger the refreshActiveTaskColor function
            // Call the function with proper type checking
            if (
                'refreshActiveTaskColor' in domHandler &&
                typeof domHandler.refreshActiveTaskColor === 'function'
            ) {
                domHandler.refreshActiveTaskColor(taskManager.getTaskState());
            }

            // Verify no tasks have active styling
            const task1Element = document.getElementById('view-task-0');
            const task2Element = document.getElementById('view-task-1');

            if (task1Element) {
                const task1Divs = task1Element.querySelectorAll('div');
                for (const div of task1Divs) {
                    expect(div.classList.contains('text-green-500')).toBe(false);
                    expect(div.classList.contains('text-yellow-500')).toBe(false);
                }
            }

            if (task2Element) {
                const task2Divs = task2Element.querySelectorAll('div');
                for (const div of task2Divs) {
                    expect(div.classList.contains('text-green-500')).toBe(false);
                    expect(div.classList.contains('text-yellow-500')).toBe(false);
                }
            }
        });

        test('refreshActiveTaskColor handles completed tasks correctly', async () => {
            const completedTask1 = createTaskWithDateTime({
                description: 'Completed Task 1',
                startTime: '12:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });

            const completedTask2 = createTaskWithDateTime({
                description: 'Completed Task 2',
                startTime: '13:00',
                duration: 60,
                status: 'completed',
                editing: false,
                confirmingDelete: false
            });

            await setupInitialStateAndApp([completedTask1, completedTask2]);

            // Test that the refreshActiveTaskColor function works with no active tasks
            // Function should exist and be callable even with no active tasks
            expect(typeof domHandler.refreshActiveTaskColor).toBe('function');
            expect(() => {
                domHandler.refreshActiveTaskColor(taskManager.getTaskState());
            }).not.toThrow();

            // Verify completed tasks don't have active styling
            const task1Element = document.getElementById('view-task-0');
            const task2Element = document.getElementById('view-task-1');

            if (task1Element) {
                const task1Divs = task1Element.querySelectorAll('div');
                for (const div of task1Divs) {
                    expect(div.classList.contains('text-green-500')).toBe(false);
                    expect(div.classList.contains('text-yellow-500')).toBe(false);
                }
            }

            if (task2Element) {
                const task2Divs = task2Element.querySelectorAll('div');
                for (const div of task2Divs) {
                    expect(div.classList.contains('text-green-500')).toBe(false);
                    expect(div.classList.contains('text-yellow-500')).toBe(false);
                }
            }
        });
    });
});

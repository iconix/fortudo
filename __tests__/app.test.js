/**
 * @jest-environment jsdom
 */

import {
    setupIntegrationTestEnvironment,
    getRenderedTasksDOM,
    clearLocalStorage,
    createTaskWithDateTime
} from './test-utils.js';

import {
    updateTaskState,
    getTaskState,
    cancelEdit as cancelEditDirect
} from '../public/js/task-manager.js';
import { resetEventDelegation, renderTasks } from '../public/js/dom-handler.js';
import { getTaskFormElement } from '../public/js/form-utils.js';

// Mock storage.js to spy on saveTasks
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    loadTasksFromStorage: jest.fn(() => [])
}));
import {
    saveTasks as mockSaveTasksInternal,
    loadTasksFromStorage as mockLoadTasksFromStorageInternal
} from '../public/js/storage.js';

const mockSaveTasks = jest.mocked(mockSaveTasksInternal);
const mockLoadTasksFromStorage = jest.mocked(mockLoadTasksFromStorageInternal);

describe('App.js Callback Functions', () => {
    let alertSpy;
    let confirmSpy;
    let deleteTaskSpy;

    // Helper function to initialize the app with given tasks loaded from mock localStorage
    const setupAppWithTasks = async (tasks) => {
        // Set up the tasks in localStorage so the app will load them
        mockLoadTasksFromStorage.mockReturnValue(tasks);
        // Re-setup the integration environment to ensure proper event delegation
        await setupIntegrationTestEnvironment();
    };

    // Utility functions for DOM interactions
    const clickDeleteButton = async (taskIndex) => {
        // Find the task wrapper by index, then find the delete button inside it
        const taskWrapper = document.querySelector(`[data-task-index="${taskIndex}"]`);
        if (!taskWrapper) return false;

        const deleteButton = taskWrapper.querySelector('.btn-delete');
        if (deleteButton) {
            deleteButton.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 0));
            return true;
        }
        return false;
    };

    const clickCancelButton = async (taskIndex) => {
        // Find the edit form by looking for form with data-task-index attribute
        const editForm = document.querySelector(`form[data-task-index="${taskIndex}"]`);
        if (!editForm) return false;

        const cancelButton = editForm.querySelector('.btn-edit-cancel');
        if (cancelButton) {
            cancelButton.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 0));
            return true;
        }
        return false;
    };

    beforeEach(async () => {
        // Reset DOM and app state
        document.body.innerHTML = '';
        clearLocalStorage();
        jest.clearAllMocks();
        resetEventDelegation();
        mockLoadTasksFromStorage.mockReturnValue([]);
        updateTaskState([]);

        // Clean up any existing spies
        if (alertSpy) alertSpy.mockRestore();
        if (confirmSpy) confirmSpy.mockRestore();
        if (deleteTaskSpy) deleteTaskSpy.mockRestore();

        // Reset spy variables
        alertSpy = undefined;
        confirmSpy = undefined;
        deleteTaskSpy = undefined;
    });

    afterEach(() => {
        if (alertSpy) alertSpy.mockRestore();
        if (confirmSpy) confirmSpy.mockRestore();
        if (deleteTaskSpy) deleteTaskSpy.mockRestore();
        clearLocalStorage();
    });

    describe('onDeleteTask callback', () => {
        const setupTasksForDelete = async () => {
            const tasks = [
                createTaskWithDateTime({
                    description: 'Task 1',
                    startTime: '09:00',
                    duration: 60
                }),
                createTaskWithDateTime({
                    description: 'Task 2',
                    startTime: '10:00',
                    duration: 30
                })
            ];

            await setupAppWithTasks(tasks);

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('should show confirmation dialog when clicking delete button first time', async () => {
            await setupTasksForDelete();

            const clicked = await clickDeleteButton(0);
            expect(clicked).toBe(true);

            // Verify that the task is now in confirmingDelete state
            const tasks = getTaskState();
            expect(tasks[0].confirmingDelete).toBe(true);
            expect(tasks[1].confirmingDelete).toBe(false);

            // Verify UI reflects the confirmation state
            const renderedTasks = getRenderedTasksDOM();
            expect(renderedTasks).toHaveLength(2);

            // No task should be actually deleted yet
            expect(renderedTasks[0].description).toBe('Task 1');
            expect(renderedTasks[1].description).toBe('Task 2');
        });

        test('should delete task when clicking delete button while in confirmingDelete state', async () => {
            await setupTasksForDelete();

            // First click to set confirmingDelete = true
            await clickDeleteButton(0);

            // Second click should actually delete the task
            await clickDeleteButton(0);

            // Verify task was deleted
            const tasks = getTaskState();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].description).toBe('Task 2');

            // Verify DOM reflects the deletion
            const renderedTasks = getRenderedTasksDOM();
            expect(renderedTasks).toHaveLength(1);
            expect(renderedTasks[0].description).toBe('Task 2');

            // Verify saveTasks was called
            expect(mockSaveTasks).toHaveBeenCalled();
        });

        test('should show alert if delete operation fails', async () => {
            await setupTasksForDelete();

            // Mock deleteTask to fail
            deleteTaskSpy = jest
                .spyOn(require('../public/js/task-manager.js'), 'deleteTask')
                .mockReturnValue({
                    success: false,
                    requiresConfirmation: false,
                    reason: 'Delete failed for test'
                });

            await clickDeleteButton(0);

            expect(alertSpy).toHaveBeenCalledWith('Alert: Delete failed for test');
        });

        test('should handle non-existent task gracefully', async () => {
            await setupTasksForDelete();

            // Try to click delete button for non-existent task
            const clicked = await clickDeleteButton(999);
            expect(clicked).toBe(false); // Button should not exist

            // Tasks should remain unchanged
            const tasks = getTaskState();
            expect(tasks).toHaveLength(2);
            expect(tasks[0].description).toBe('Task 1');
            expect(tasks[1].description).toBe('Task 2');
        });
    });

    describe('onCancelEdit callback', () => {
        const setupTasksForEdit = async () => {
            const tasks = [
                createTaskWithDateTime({
                    description: 'Task 1',
                    startTime: '09:00',
                    duration: 60
                }),
                createTaskWithDateTime({
                    description: 'Task 2',
                    startTime: '10:00',
                    duration: 30,
                    editing: true
                })
            ];

            await setupAppWithTasks(tasks);

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('should cancel edit mode and revert to view mode', async () => {
            await setupTasksForEdit();

            // Verify second task is in edit mode initially
            let tasks = getTaskState();
            expect(tasks[1].editing).toBe(true);

            // Use the utility function to click cancel button
            const clicked = await clickCancelButton(1);
            expect(clicked).toBe(true);

            // Verify task is no longer in edit mode
            tasks = getTaskState();
            expect(tasks[1].editing).toBe(false);

            // Verify DOM updated to show view mode
            const renderedTasks = getRenderedTasksDOM();
            expect(renderedTasks[1].isEditing).toBe(false);
            expect(renderedTasks[1].description).toBe('Task 2');
        });

        test('should not affect other tasks when canceling edit', async () => {
            await setupTasksForEdit();

            // Set up multiple tasks in edit mode by updating internal state
            const tasks = getTaskState();
            tasks[0].editing = true; // Also set first task to editing
            updateTaskState(tasks); // Actually update the internal state

            // Re-render with proper callbacks
            const taskEventCallbacks = {
                onCompleteTask: () => {},
                onEditTask: () => {},
                onDeleteTask: () => {},
                onSaveTaskEdit: () => {},
                onCancelEdit: (taskId, index) => {
                    cancelEditDirect(index);
                    renderTasks(getTaskState(), taskEventCallbacks);
                }
            };
            renderTasks(getTaskState(), taskEventCallbacks);

            // Cancel edit for second task only
            await clickCancelButton(1);

            // Verify only second task exited edit mode
            const updatedTasks = getTaskState();
            expect(updatedTasks[0].editing).toBe(true); // Should still be editing
            expect(updatedTasks[1].editing).toBe(false); // Should no longer be editing
        });

        test('should handle canceling edit on non-editing task gracefully', async () => {
            await setupTasksForEdit();

            // Try to cancel edit on task that's not in edit mode
            const tasks = getTaskState();
            tasks[1].editing = false; // Make sure it's not in edit mode
            await setupAppWithTasks(tasks);

            // This should not cause any errors
            cancelEditDirect(1);

            // Tasks should remain unchanged
            const updatedTasks = getTaskState();
            expect(updatedTasks[0].editing).toBe(false);
            expect(updatedTasks[1].editing).toBe(false);
        });

        test('should not call saveTasks after canceling edit (editing is transient UI state)', async () => {
            await setupTasksForEdit();

            await clickCancelButton(1);

            // Verify saveTasks was NOT called since editing is a transient UI state
            expect(mockSaveTasks).not.toHaveBeenCalled();
        });
    });

    describe('onDeleteTask and onCancelEdit integration', () => {
        test('should not interfere with each other', async () => {
            const tasks = [
                createTaskWithDateTime({
                    description: 'Task 1',
                    startTime: '09:00',
                    duration: 60,
                    editing: true
                }),
                createTaskWithDateTime({
                    description: 'Task 2',
                    startTime: '10:00',
                    duration: 30
                })
            ];

            await setupAppWithTasks(tasks);

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            mockSaveTasks.mockClear();

            // Cancel edit on first task
            const cancelClicked = await clickCancelButton(0);
            expect(cancelClicked).toBe(true);

            // Verify first task exited edit mode
            let updatedTasks = getTaskState();
            expect(updatedTasks[0].editing).toBe(false);

            // Wait for any potential DOM updates
            await new Promise((resolve) => setTimeout(resolve, 10));

            // First click on delete button for second task - should set confirmingDelete to true
            const firstDeleteClick = await clickDeleteButton(1);
            expect(firstDeleteClick).toBe(true);

            // Verify confirmingDelete is set
            updatedTasks = getTaskState();
            expect(updatedTasks[1].confirmingDelete).toBe(true);

            // Wait for DOM update
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Second click - should actually delete the task
            const secondDeleteClick = await clickDeleteButton(1);
            expect(secondDeleteClick).toBe(true);

            // Verify second task was deleted
            updatedTasks = getTaskState();
            expect(updatedTasks).toHaveLength(1);
            expect(updatedTasks[0].description).toBe('Task 1');
            expect(updatedTasks[0].editing).toBe(false);
        });
    });

    describe('Additional Branch Coverage Tests', () => {
        describe('onCompleteTask callback coverage', () => {
            test('should handle user denying late completion confirmation (real app.js callback)', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false); // User denies
                mockSaveTasks.mockClear();

                // Mock the completeTask to return late completion scenario
                const completeTaskSpy = jest
                    .spyOn(require('../public/js/task-manager.js'), 'completeTask')
                    .mockReturnValueOnce({
                        success: true,
                        requiresConfirmation: true,
                        confirmationType: 'COMPLETE_LATE',
                        newEndTime: '11:00',
                        newDuration: 120
                    })
                    .mockReturnValueOnce({ success: true, task: tasks[0] }); // Second call when user denies

                // Set current time in DOM to trigger late completion
                const currentTimeElement = document.getElementById('current-time');
                if (currentTimeElement) {
                    currentTimeElement.textContent = '11:00 AM';
                }

                // Click the actual checkbox to trigger the real onCompleteTask callback
                const checkbox = document.querySelector('.checkbox');
                if (checkbox) {
                    checkbox.dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(completeTaskSpy).toHaveBeenCalledTimes(2); // First for late check, second when user denies
            });
        });

        describe('onDeleteTask edge cases', () => {
            test('should handle deleting non-existent task index (real app.js callback)', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    })
                ];

                await setupAppWithTasks(tasks);
                updateTaskState([]); // Set empty tasks to trigger the missing task branch

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                mockSaveTasks.mockClear();

                // Create a delete button manually and trigger it
                const deleteButton = document.createElement('button');
                deleteButton.classList.add('btn-delete');
                deleteButton.setAttribute('data-task-index', '0');
                document.body.appendChild(deleteButton);

                // Click the delete button - this should trigger the real onDeleteTask callback
                // which will find no task at index 0
                deleteButton.dispatchEvent(new Event('click'));
                await new Promise((resolve) => setTimeout(resolve, 10));

                // The callback should execute but not do anything since taskToDelete is undefined
            });
        });

        describe('onSaveTaskEdit branch coverage', () => {
            test('should handle user denying reschedule during task update (real app.js callback)', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60,
                        editing: true
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false); // User denies reschedule
                mockSaveTasks.mockClear();

                // Mock updateTask to require confirmation
                jest.spyOn(require('../public/js/task-manager.js'), 'updateTask').mockReturnValue({
                    success: false,
                    requiresConfirmation: true,
                    taskData: {
                        description: 'Updated Task',
                        startTime: '09:30',
                        duration: 120
                    },
                    originalIndex: 0,
                    reason: 'Would cause overlap'
                });

                // Find the edit form and submit it to trigger real onSaveTaskEdit
                const editForm = document.querySelector('form[data-task-index="0"]');
                if (editForm) {
                    // Fill out the form
                    const descInput = /** @type {HTMLInputElement} */ (
                        editForm.querySelector('input[name="description"]')
                    );
                    const startTimeInput = /** @type {HTMLInputElement} */ (
                        editForm.querySelector('input[name="start-time"]')
                    );
                    const durationHoursInput = /** @type {HTMLInputElement} */ (
                        editForm.querySelector('input[name="duration-hours"]')
                    );
                    const durationMinutesInput = /** @type {HTMLInputElement} */ (
                        editForm.querySelector('input[name="duration-minutes"]')
                    );

                    if (descInput) descInput.value = 'Updated Task';
                    if (startTimeInput) startTimeInput.value = '09:30';
                    if (durationHoursInput) durationHoursInput.value = '2';
                    if (durationMinutesInput) durationMinutesInput.value = '0';

                    // Submit the form to trigger the real callback
                    editForm.dispatchEvent(
                        new Event('submit', { bubbles: true, cancelable: true })
                    );
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(alertSpy).toHaveBeenCalledWith(
                    'Alert: Task operation cancelled to avoid overlap.'
                );
            });

            test('should handle update task failure', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60,
                        editing: true
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                mockSaveTasks.mockClear();

                // Mock updateTask to fail
                jest.spyOn(require('../public/js/task-manager.js'), 'updateTask').mockReturnValue({
                    success: false,
                    reason: 'Update failed'
                });

                // Submit the edit form to trigger the real callback
                const editForm = document.querySelector('form[data-task-index="0"]');
                if (editForm) {
                    const descInput = /** @type {HTMLInputElement} */ (
                        editForm.querySelector('input[name="description"]')
                    );
                    if (descInput) descInput.value = 'Updated Task';

                    editForm.dispatchEvent(
                        new Event('submit', { bubbles: true, cancelable: true })
                    );
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(alertSpy).toHaveBeenCalledWith('Alert: Update failed');
            });
        });

        describe('onTaskFormSubmit branch coverage', () => {
            test('should handle user denying reschedule during task add (real app.js callback)', async () => {
                await setupAppWithTasks([]);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false); // User denies reschedule
                mockSaveTasks.mockClear();

                // Mock addTask to require confirmation
                jest.spyOn(require('../public/js/task-manager.js'), 'addTask').mockReturnValue({
                    success: false,
                    requiresConfirmation: true,
                    confirmationType: 'RESCHEDULE_OVERLAPS_UNLOCKED_OTHERS',
                    reason: 'Would cause overlap',
                    taskObjectToFinalize: {
                        description: 'New Task',
                        startTime: '09:00',
                        duration: 60
                    },
                    reschedulePlan: []
                });

                // Fill out and submit the main task form
                const taskForm = getTaskFormElement();
                if (taskForm) {
                    const descInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="description"]')
                    );
                    const startTimeInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="start-time"]')
                    );
                    const durationHoursInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="duration-hours"]')
                    );
                    const durationMinutesInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="duration-minutes"]')
                    );

                    if (descInput) descInput.value = 'New Task';
                    if (startTimeInput) startTimeInput.value = '09:00';
                    if (durationHoursInput) durationHoursInput.value = '1';
                    if (durationMinutesInput) durationMinutesInput.value = '0';

                    taskForm.dispatchEvent(
                        new Event('submit', { bubbles: true, cancelable: true })
                    );
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(alertSpy).toHaveBeenCalledWith(
                    'Alert: Task not added as rescheduling of other tasks was declined.'
                );
            });

            test('should handle add task failure', async () => {
                await setupAppWithTasks([]);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                mockSaveTasks.mockClear();

                // Mock addTask to fail
                jest.spyOn(require('../public/js/task-manager.js'), 'addTask').mockReturnValue({
                    success: false,
                    reason: 'Add failed'
                });

                // Submit the task form with valid data
                const taskForm = getTaskFormElement();
                if (taskForm) {
                    const descInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="description"]')
                    );
                    const startTimeInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="start-time"]')
                    );
                    const durationHoursInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="duration-hours"]')
                    );
                    const durationMinutesInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="duration-minutes"]')
                    );

                    if (descInput) descInput.value = 'New Task';
                    if (startTimeInput) startTimeInput.value = '09:00';
                    if (durationHoursInput) durationHoursInput.value = '1';
                    if (durationMinutesInput) durationMinutesInput.value = '0';

                    taskForm.dispatchEvent(
                        new Event('submit', { bubbles: true, cancelable: true })
                    );
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(alertSpy).toHaveBeenCalledWith('Alert: Add failed');
            });
        });

        describe('ENTER key submits task form', () => {
            test('pressing ENTER in start-time input should submit the form', async () => {
                await setupAppWithTasks([]);

                mockSaveTasks.mockClear();
                let formSubmitted = false;

                // Spy on addTask to detect form submission
                const addTaskSpy = jest
                    .spyOn(require('../public/js/task-manager.js'), 'addTask')
                    .mockImplementation(() => {
                        formSubmitted = true;
                        return { success: true, task: {} };
                    });

                const taskForm = getTaskFormElement();
                if (taskForm) {
                    const descInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="description"]')
                    );
                    const startTimeInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="start-time"]')
                    );
                    const durationHoursInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="duration-hours"]')
                    );
                    const durationMinutesInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="duration-minutes"]')
                    );

                    if (descInput) descInput.value = 'Test Task';
                    if (startTimeInput) startTimeInput.value = '09:00';
                    if (durationHoursInput) durationHoursInput.value = '1';
                    if (durationMinutesInput) durationMinutesInput.value = '0';

                    // Press ENTER in the start-time input
                    if (startTimeInput) {
                        startTimeInput.dispatchEvent(
                            new KeyboardEvent('keydown', {
                                key: 'Enter',
                                code: 'Enter',
                                bubbles: true,
                                cancelable: true
                            })
                        );
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                }

                expect(formSubmitted).toBe(true);
                addTaskSpy.mockRestore();
            });

            test('pressing ENTER in duration-hours input should submit the form', async () => {
                await setupAppWithTasks([]);

                mockSaveTasks.mockClear();
                let formSubmitted = false;

                const addTaskSpy = jest
                    .spyOn(require('../public/js/task-manager.js'), 'addTask')
                    .mockImplementation(() => {
                        formSubmitted = true;
                        return { success: true, task: {} };
                    });

                const taskForm = getTaskFormElement();
                if (taskForm) {
                    const descInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="description"]')
                    );
                    const startTimeInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="start-time"]')
                    );
                    const durationHoursInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="duration-hours"]')
                    );
                    const durationMinutesInput = /** @type {HTMLInputElement} */ (
                        taskForm.querySelector('input[name="duration-minutes"]')
                    );

                    if (descInput) descInput.value = 'Test Task';
                    if (startTimeInput) startTimeInput.value = '09:00';
                    if (durationHoursInput) durationHoursInput.value = '1';
                    if (durationMinutesInput) durationMinutesInput.value = '0';

                    // Press ENTER in the duration-hours input
                    if (durationHoursInput) {
                        durationHoursInput.dispatchEvent(
                            new KeyboardEvent('keydown', {
                                key: 'Enter',
                                code: 'Enter',
                                bubbles: true,
                                cancelable: true
                            })
                        );
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                }

                expect(formSubmitted).toBe(true);
                addTaskSpy.mockRestore();
            });
        });

        describe('onDeleteAllTasks branch coverage', () => {
            test('should handle deleting all tasks when no tasks exist', async () => {
                await setupAppWithTasks([]);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true); // User confirms
                mockSaveTasks.mockClear();

                // Click the delete all button when no tasks exist
                const deleteAllButton = document.getElementById('delete-all');
                if (deleteAllButton) {
                    deleteAllButton.dispatchEvent(new Event('click'));
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(confirmSpy).not.toHaveBeenCalled(); // No confirmation needed if no tasks
                // App shows an alert when there are no tasks to delete
                expect(alertSpy).toHaveBeenCalledWith('Alert: There are no tasks to delete.');
            });

            test('should handle user denying delete all confirmation', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false); // User denies
                mockSaveTasks.mockClear();

                const deleteAllButton = document.getElementById('delete-all');
                if (deleteAllButton) {
                    deleteAllButton.dispatchEvent(new Event('click'));
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalledWith(
                    'Confirmation: Are you sure you want to delete ALL tasks (scheduled and unscheduled)? This action cannot be undone.'
                );
                expect(mockSaveTasks).not.toHaveBeenCalled(); // Should not save since user denied
            });

            test('should handle delete all failure with error', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true); // User confirms
                mockSaveTasks.mockClear();

                // Mock deleteAllTasks to fail
                jest.spyOn(
                    require('../public/js/task-manager.js'),
                    'deleteAllTasks'
                ).mockReturnValue({
                    success: false,
                    reason: 'Delete all failed'
                });

                const deleteAllButton = document.getElementById('delete-all');
                if (deleteAllButton) {
                    deleteAllButton.dispatchEvent(new Event('click'));
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalledWith(
                    'Confirmation: Are you sure you want to delete ALL tasks (scheduled and unscheduled)? This action cannot be undone.'
                );
                expect(alertSpy).toHaveBeenCalledWith('Alert: Delete all failed');
            });

            test('should call updateStartTimeField with forceUpdate=true after delete all', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true); // User confirms

                // Mock updateStartTimeField to verify it's called with forceUpdate=true
                const updateStartTimeFieldSpy = jest.spyOn(
                    require('../public/js/dom-handler.js'),
                    'updateStartTimeField'
                );

                // Mock deleteAllTasks to succeed
                const executeDeleteSpy = jest
                    .spyOn(require('../public/js/task-manager.js'), 'deleteAllTasks')
                    .mockReturnValue({
                        success: true,
                        tasksDeleted: 1
                    });

                mockSaveTasks.mockClear();

                const deleteAllButton = document.getElementById('delete-all');
                if (deleteAllButton) {
                    deleteAllButton.dispatchEvent(new Event('click'));
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }

                expect(confirmSpy).toHaveBeenCalledWith(
                    'Confirmation: Are you sure you want to delete ALL tasks (scheduled and unscheduled)? This action cannot be undone.'
                );
                expect(executeDeleteSpy).toHaveBeenCalledTimes(1);

                // Verify updateStartTimeField was called with forceUpdate=true
                expect(updateStartTimeFieldSpy).toHaveBeenCalledWith(expect.any(String), true);

                updateStartTimeFieldSpy.mockRestore();
                executeDeleteSpy.mockRestore();
            });
        });

        describe('onGlobalClick branch coverage', () => {
            test('should handle resetAllConfirmingDeleteFlags returning false', async () => {
                await setupAppWithTasks([]);

                // Mock resetAllConfirmingDeleteFlags to return false
                jest.spyOn(
                    require('../public/js/task-manager.js'),
                    'resetAllConfirmingDeleteFlags'
                ).mockReturnValue(false);

                // Click somewhere that's not a delete button to trigger global click
                const taskList = document.getElementById('task-list');
                if (taskList) {
                    taskList.dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            });

            test('should handle resetAllEditingFlags returning false', async () => {
                await setupAppWithTasks([]);

                // Mock both functions to return false
                jest.spyOn(
                    require('../public/js/task-manager.js'),
                    'resetAllConfirmingDeleteFlags'
                ).mockReturnValue(false);
                jest.spyOn(
                    require('../public/js/task-manager.js'),
                    'resetAllEditingFlags'
                ).mockReturnValue(false);

                // Click somewhere that triggers both reset calls
                const taskList = document.getElementById('task-list');
                if (taskList) {
                    taskList.dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            });

            test('should handle various click scenarios', async () => {
                await setupAppWithTasks([]);

                // Mock to return true to trigger needsRender
                jest.spyOn(
                    require('../public/js/task-manager.js'),
                    'resetAllConfirmingDeleteFlags'
                ).mockReturnValue(true);

                // Click on task list element
                const taskList = document.getElementById('task-list');
                if (taskList) {
                    taskList.dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            });
        });

        describe('DOM element error handling', () => {
            test('should handle missing DOM elements gracefully', async () => {
                // Set up console spy to check for error logs
                const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

                // Set up environment first
                await setupIntegrationTestEnvironment();

                // Then remove key DOM elements to test error handling
                const taskForm = getTaskFormElement();
                const deleteAllButton = document.getElementById('delete-all');
                const taskList = document.getElementById('scheduled-task-list');

                if (taskForm) {
                    taskForm.remove();
                }
                if (deleteAllButton) {
                    deleteAllButton.remove();
                }
                if (taskList) {
                    taskList.remove();
                }

                const tasks = [
                    createTaskWithDateTime({
                        description: 'Test Task',
                        startTime: '09:00',
                        duration: 60
                    })
                ];

                // Update task state and render with missing DOM elements
                updateTaskState(tasks);

                // Create mock callbacks to test rendering with missing elements
                const taskEventCallbacks = {
                    onCompleteTask: jest.fn(),
                    onEditTask: jest.fn(),
                    onDeleteTask: jest.fn(),
                    onSaveTaskEdit: jest.fn(),
                    onCancelEdit: jest.fn()
                };

                // Try to render tasks with missing task-list element
                // This should also trigger error logging
                renderTasks(getTaskState(), taskEventCallbacks);

                // Check that error logs were generated for missing elements
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Scheduled task list element not found.')
                );

                // Clean up
                consoleSpy.mockRestore();
            });
        });

        describe('Force update start time field scenarios', () => {
            let updateStartTimeFieldSpy;

            beforeEach(() => {
                updateStartTimeFieldSpy = jest.spyOn(
                    require('../public/js/dom-handler.js'),
                    'updateStartTimeField'
                );
            });

            afterEach(() => {
                if (updateStartTimeFieldSpy) {
                    updateStartTimeFieldSpy.mockRestore();
                }
            });

            test('should force update start time field after confirming late task completion', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    }),
                    createTaskWithDateTime({
                        description: 'Task 2',
                        startTime: '10:00',
                        duration: 30
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true); // User confirms late completion

                // Mock completeTask to return late completion scenario
                const completeTaskSpy = jest
                    .spyOn(require('../public/js/task-manager.js'), 'completeTask')
                    .mockReturnValue({
                        success: true,
                        requiresConfirmation: true,
                        confirmationType: 'COMPLETE_LATE',
                        newEndTime: '10:15',
                        newDuration: 75
                    });

                const confirmCompleteLate = jest
                    .spyOn(require('../public/js/task-manager.js'), 'confirmCompleteLate')
                    .mockReturnValue({ success: true });

                // Set current time in DOM to trigger late completion
                const currentTimeElement = document.getElementById('current-time');
                if (currentTimeElement) {
                    currentTimeElement.textContent = '10:15 AM';
                }

                updateStartTimeFieldSpy.mockClear();

                // Click the checkbox to complete the task
                const checkbox = document.querySelector('.checkbox');
                if (checkbox) {
                    checkbox.dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(confirmCompleteLate).toHaveBeenCalledWith(0, '10:15', 75);
                expect(updateStartTimeFieldSpy).toHaveBeenCalledWith(expect.any(String), true);

                completeTaskSpy.mockRestore();
                confirmCompleteLate.mockRestore();
            });

            test('should force update start time field after successful task deletion', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    }),
                    createTaskWithDateTime({
                        description: 'Task 2',
                        startTime: '10:00',
                        duration: 30
                    })
                ];

                await setupAppWithTasks(tasks);

                // Mock deleteTask to return success on second call (after confirmation)
                const deleteTaskSpy = jest
                    .spyOn(require('../public/js/task-manager.js'), 'deleteTask')
                    .mockReturnValueOnce({
                        success: false,
                        requiresConfirmation: true
                    })
                    .mockReturnValueOnce({
                        success: true
                    });

                updateStartTimeFieldSpy.mockClear();

                // Click delete button twice (once to confirm, once to actually delete)
                const deleteButtons = document.querySelectorAll('.btn-delete');
                if (deleteButtons[0]) {
                    deleteButtons[0].dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise((resolve) => setTimeout(resolve, 10));

                    // Click again to confirm deletion
                    const confirmDeleteButtons = document.querySelectorAll('.btn-delete');
                    if (confirmDeleteButtons[0]) {
                        confirmDeleteButtons[0].dispatchEvent(
                            new Event('click', { bubbles: true })
                        );
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                }

                expect(deleteTaskSpy).toHaveBeenCalledTimes(2);
                expect(updateStartTimeFieldSpy).toHaveBeenCalledWith(expect.any(String), true);

                deleteTaskSpy.mockRestore();
            });

            test('should force update start time field after confirming task update with rescheduling', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    }),
                    createTaskWithDateTime({
                        description: 'Task 2',
                        startTime: '10:00',
                        duration: 30
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true); // User confirms rescheduling

                // Mock updateTask to require confirmation
                const updateTaskSpy = jest
                    .spyOn(require('../public/js/task-manager.js'), 'updateTask')
                    .mockReturnValue({
                        success: false,
                        requiresConfirmation: true,
                        taskData: {
                            description: 'Updated Task',
                            startTime: '09:30',
                            duration: 120
                        },
                        originalIndex: 0,
                        reason: 'Updating this task may overlap with other tasks. Would you like to reschedule them?'
                    });

                const confirmUpdateTaskAndReschedule = jest
                    .spyOn(
                        require('../public/js/task-manager.js'),
                        'confirmUpdateTaskAndReschedule'
                    )
                    .mockReturnValue({ success: true });

                updateStartTimeFieldSpy.mockClear();

                // Start editing the first task
                const editButtons = document.querySelectorAll('.btn-edit');
                if (editButtons[0]) {
                    editButtons[0].dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise((resolve) => setTimeout(resolve, 10));

                    // Submit the edit form
                    const editForm = document.querySelector('form[data-task-index="0"]');
                    if (editForm) {
                        editForm.dispatchEvent(
                            new Event('submit', { bubbles: true, cancelable: true })
                        );
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(confirmUpdateTaskAndReschedule).toHaveBeenCalled();
                expect(updateStartTimeFieldSpy).toHaveBeenCalledWith(expect.any(String), true);

                updateTaskSpy.mockRestore();
                confirmUpdateTaskAndReschedule.mockRestore();
            });

            test('should force update start time field after confirming task addition with rescheduling', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true); // User confirms rescheduling

                // Mock addTask to require confirmation
                const addTaskSpy = jest
                    .spyOn(require('../public/js/task-manager.js'), 'addTask')
                    .mockReturnValue({
                        success: false,
                        requiresConfirmation: true,
                        confirmationType: 'RESCHEDULE_OVERLAPS_UNLOCKED_OTHERS',
                        taskObjectToFinalize: {
                            description: 'New Task',
                            startTime: '09:30',
                            duration: 60
                        },
                        reschedulePlan: [],
                        reason: 'Adding this task may overlap with existing tasks. Would you like to reschedule the other tasks?'
                    });

                const confirmAddTaskAndReschedule = jest
                    .spyOn(require('../public/js/task-manager.js'), 'confirmAddTaskAndReschedule')
                    .mockReturnValue({ success: true });

                updateStartTimeFieldSpy.mockClear();

                // Submit the main task form
                const taskForm = getTaskFormElement();
                if (taskForm) {
                    // Fill out the form
                    const descInput = taskForm.querySelector('input[name="description"]');
                    const startTimeInput = taskForm.querySelector('input[name="start-time"]');
                    const durationHoursInput = taskForm.querySelector(
                        'input[name="duration-hours"]'
                    );
                    const durationMinutesInput = taskForm.querySelector(
                        'input[name="duration-minutes"]'
                    );

                    if (descInput instanceof HTMLInputElement) descInput.value = 'New Task';
                    if (startTimeInput instanceof HTMLInputElement) startTimeInput.value = '09:30';
                    if (durationHoursInput instanceof HTMLInputElement)
                        durationHoursInput.value = '1';
                    if (durationMinutesInput instanceof HTMLInputElement)
                        durationMinutesInput.value = '0';

                    taskForm.dispatchEvent(
                        new Event('submit', { bubbles: true, cancelable: true })
                    );
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(confirmAddTaskAndReschedule).toHaveBeenCalled();
                expect(updateStartTimeFieldSpy).toHaveBeenCalledWith(expect.any(String), true);

                addTaskSpy.mockRestore();
                confirmAddTaskAndReschedule.mockRestore();
            });

            test('should not force update start time field when user denies rescheduling', async () => {
                const tasks = [
                    createTaskWithDateTime({
                        description: 'Task 1',
                        startTime: '09:00',
                        duration: 60
                    })
                ];

                await setupAppWithTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false); // User denies rescheduling

                // Mock addTask to require confirmation
                const addTaskSpy = jest
                    .spyOn(require('../public/js/task-manager.js'), 'addTask')
                    .mockReturnValue({
                        success: false,
                        requiresConfirmation: true,
                        confirmationType: 'RESCHEDULE_OVERLAPS_UNLOCKED_OTHERS',
                        taskObjectToFinalize: {
                            description: 'New Task',
                            startTime: '09:30',
                            duration: 60
                        },
                        reschedulePlan: [],
                        reason: 'Adding this task may overlap with existing tasks. Would you like to reschedule the other tasks?'
                    });

                updateStartTimeFieldSpy.mockClear();

                // Submit the main task form
                const taskForm = getTaskFormElement();
                if (taskForm) {
                    // Fill out the form
                    const descInput = taskForm.querySelector('input[name="description"]');
                    const startTimeInput = taskForm.querySelector('input[name="start-time"]');
                    const durationHoursInput = taskForm.querySelector(
                        'input[name="duration-hours"]'
                    );
                    const durationMinutesInput = taskForm.querySelector(
                        'input[name="duration-minutes"]'
                    );

                    if (descInput instanceof HTMLInputElement) descInput.value = 'New Task';
                    if (startTimeInput instanceof HTMLInputElement) startTimeInput.value = '09:30';
                    if (durationHoursInput instanceof HTMLInputElement)
                        durationHoursInput.value = '1';
                    if (durationMinutesInput instanceof HTMLInputElement)
                        durationMinutesInput.value = '0';

                    taskForm.dispatchEvent(
                        new Event('submit', { bubbles: true, cancelable: true })
                    );
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(alertSpy).toHaveBeenCalledWith(
                    'Alert: Task not added as rescheduling of other tasks was declined.'
                );

                // When user denies rescheduling, forceUpdate should NOT be called
                // The start time field may be updated normally but not with forceUpdate=true
                expect(updateStartTimeFieldSpy).not.toHaveBeenCalledWith(expect.any(String), true);

                addTaskSpy.mockRestore();
            });
        });
    });
});

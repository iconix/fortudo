/**
 * @jest-environment jsdom
 */

// Tests for app.js callback functions: onDeleteTask and onCancelEdit

import {
    setupIntegrationTestEnvironment,
    getRenderedTasksDOM,
    clearLocalStorage
} from './test-utils.js';

import {
    setTasks,
    getTasks,
    deleteTask as deleteTaskDirect,
    cancelEdit as cancelEditDirect
} from '../public/js/task-manager.js';

// Mock storage.js to spy on saveTasks
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    loadTasks: jest.fn(() => [])
}));
import { saveTasks as mockSaveTasksInternal, loadTasks as mockLoadTasksInternal } from '../public/js/storage.js';

const mockSaveTasks = jest.mocked(mockSaveTasksInternal);
const mockLoadTasks = jest.mocked(mockLoadTasksInternal);

describe('App.js Callback Functions', () => {
    let alertSpy;
    let confirmSpy;
    let deleteTaskSpy;

    // Utility functions for DOM interactions
    const clickDeleteButton = async (taskIndex) => {
        // Find delete button using proper selector (button with both classes and correct attribute)
        const deleteButton = document.querySelector(`button.btn-delete[data-task-index="${taskIndex}"]`);
        if (deleteButton) {
            deleteButton.dispatchEvent(new Event('click'));
            await new Promise(resolve => setTimeout(resolve, 0));
            return true;
        }
        return false;
    };

    const clickCancelButton = async (taskIndex) => {
        const editForm = document.getElementById(`edit-task-${taskIndex}`);
        if (!editForm) return false;

        const cancelButton = editForm.querySelector('.btn-edit-cancel');
        if (cancelButton) {
            cancelButton.dispatchEvent(new Event('click'));
            await new Promise(resolve => setTimeout(resolve, 0));
            return true;
        }
        return false;
    };

    beforeEach(async () => {
        // Reset DOM and app state
        document.body.innerHTML = '';
        clearLocalStorage();
        jest.clearAllMocks();
        mockLoadTasks.mockReturnValue([]);
        setTasks([]);

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
                { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false },
                { description: 'Task 2', startTime: '10:00', duration: 30, endTime: '10:30', status: 'incomplete', editing: false, confirmingDelete: false }
            ];

            mockLoadTasks.mockReturnValue(tasks);
            await setupIntegrationTestEnvironment();
            setTasks(tasks);

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('should show confirmation dialog when clicking delete button first time', async () => {
            await setupTasksForDelete();

            const clicked = await clickDeleteButton(0);
            expect(clicked).toBe(true);

            // Verify that the task is now in confirmingDelete state
            const tasks = getTasks();
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
            const tasks = getTasks();
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
            deleteTaskSpy = jest.spyOn(require('../public/js/task-manager.js'), 'deleteTask')
                .mockReturnValue({
                    success: false,
                    requiresConfirmation: false,
                    reason: 'Delete failed for test'
                });

            await clickDeleteButton(0);

            expect(alertSpy).toHaveBeenCalledWith('Delete failed for test');
        });

        test('should handle non-existent task gracefully', async () => {
            await setupTasksForDelete();

            // Try to click delete button for non-existent task
            const clicked = await clickDeleteButton(999);
            expect(clicked).toBe(false); // Button should not exist

            // Tasks should remain unchanged
            const tasks = getTasks();
            expect(tasks).toHaveLength(2);
            expect(tasks[0].description).toBe('Task 1');
            expect(tasks[1].description).toBe('Task 2');
        });
    });

    describe('onCancelEdit callback', () => {
        const setupTasksForEdit = async () => {
            const tasks = [
                { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false },
                { description: 'Task 2', startTime: '10:00', duration: 30, endTime: '10:30', status: 'incomplete', editing: true, confirmingDelete: false }
            ];

            mockLoadTasks.mockReturnValue(tasks);
            await setupIntegrationTestEnvironment();
            setTasks(tasks);

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            confirmSpy = jest.spyOn(window, 'confirm');
            mockSaveTasks.mockClear();
        };

        test('should cancel edit mode and revert to view mode', async () => {
            await setupTasksForEdit();

            // Verify second task is in edit mode initially
            let tasks = getTasks();
            expect(tasks[1].editing).toBe(true);

            // Use the utility function to click cancel button
            const clicked = await clickCancelButton(1);
            expect(clicked).toBe(true);

            // Verify task is no longer in edit mode
            tasks = getTasks();
            expect(tasks[1].editing).toBe(false);

            // Verify DOM updated to show view mode
            const renderedTasks = getRenderedTasksDOM();
            expect(renderedTasks[1].isEditing).toBe(false);
            expect(renderedTasks[1].description).toBe('Task 2');
        });

        test('should not affect other tasks when canceling edit', async () => {
            await setupTasksForEdit();

            // Set up multiple tasks in edit mode
            const tasks = getTasks();
            tasks[0].editing = true; // Also set first task to editing
            setTasks(tasks);

            // Cancel edit for second task only
            await clickCancelButton(1);

            // Verify only second task exited edit mode
            const updatedTasks = getTasks();
            expect(updatedTasks[0].editing).toBe(true);  // Should still be editing
            expect(updatedTasks[1].editing).toBe(false); // Should no longer be editing
        });

        test('should handle canceling edit on non-editing task gracefully', async () => {
            await setupTasksForEdit();

            // Try to cancel edit on task that's not in edit mode
            const tasks = getTasks();
            tasks[1].editing = false; // Make sure it's not in edit mode
            setTasks(tasks);

            // This should not cause any errors
            cancelEditDirect(1);

            // Tasks should remain unchanged
            const updatedTasks = getTasks();
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
                { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: true, confirmingDelete: false },
                { description: 'Task 2', startTime: '10:00', duration: 30, endTime: '10:30', status: 'incomplete', editing: false, confirmingDelete: false }
            ];

            mockLoadTasks.mockReturnValue(tasks);
            await setupIntegrationTestEnvironment();
            setTasks(tasks);

            alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
            mockSaveTasks.mockClear();

            // Cancel edit on first task
            const cancelClicked = await clickCancelButton(0);
            expect(cancelClicked).toBe(true);

            // Verify first task exited edit mode
            let updatedTasks = getTasks();
            expect(updatedTasks[0].editing).toBe(false);

            // Wait for any potential DOM updates
            await new Promise(resolve => setTimeout(resolve, 10));

            // First click on delete button for second task - should set confirmingDelete to true
            const firstDeleteClick = await clickDeleteButton(1);
            expect(firstDeleteClick).toBe(true);

            // Verify confirmingDelete is set
            updatedTasks = getTasks();
            expect(updatedTasks[1].confirmingDelete).toBe(true);

            // Wait for DOM update
            await new Promise(resolve => setTimeout(resolve, 10));

            // Second click - should actually delete the task
            const secondDeleteClick = await clickDeleteButton(1);
            expect(secondDeleteClick).toBe(true);

            // Verify second task was deleted
            updatedTasks = getTasks();
            expect(updatedTasks).toHaveLength(1);
            expect(updatedTasks[0].description).toBe('Task 1');
            expect(updatedTasks[0].editing).toBe(false);
        });
    });

    describe('Additional Branch Coverage Tests', () => {
        describe('onCompleteTask callback coverage', () => {
            test('should handle user denying late completion confirmation (real app.js callback)', async () => {
                const tasks = [
                    { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false }
                ];

                mockLoadTasks.mockReturnValue(tasks);
                await setupIntegrationTestEnvironment();
                setTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false); // User denies
                mockSaveTasks.mockClear();

                // Mock the completeTask to return late completion scenario
                const completeTaskSpy = jest.spyOn(require('../public/js/task-manager.js'), 'completeTask')
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
                    checkbox.dispatchEvent(new Event('click'));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(completeTaskSpy).toHaveBeenCalledTimes(2); // First for late check, second when user denies
            });
        });

        describe('onDeleteTask edge cases', () => {
            test('should handle deleting non-existent task index (real app.js callback)', async () => {
                const tasks = [
                    { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false }
                ];

                mockLoadTasks.mockReturnValue(tasks);
                await setupIntegrationTestEnvironment();
                setTasks([]);  // Set empty tasks to trigger the missing task branch

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
                await new Promise(resolve => setTimeout(resolve, 10));

                // The callback should execute but not do anything since taskToDelete is undefined
            });
        });

        describe('onSaveTaskEdit branch coverage', () => {
            test('should handle user denying reschedule during task update (real app.js callback)', async () => {
                const tasks = [
                    { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: true, confirmingDelete: false }
                ];

                mockLoadTasks.mockReturnValue(tasks);
                await setupIntegrationTestEnvironment();
                setTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false); // User denies reschedule
                mockSaveTasks.mockClear();

                // Mock updateTask to require confirmation
                jest.spyOn(require('../public/js/task-manager.js'), 'updateTask')
                    .mockReturnValue({
                        success: false,
                        requiresConfirmation: true,
                        confirmationType: 'RESCHEDULE_UPDATE',
                        reason: 'Would cause overlap',
                        taskIndex: 0,
                        updatedData: {}
                    });

                // Find the edit form and submit it to trigger real onSaveTaskEdit
                const editForm = document.getElementById('edit-task-0');
                if (editForm) {
                    // Fill out the form
                    const descInput = /** @type {HTMLInputElement} */ (editForm.querySelector('input[name="description"]'));
                    const startTimeInput = /** @type {HTMLInputElement} */ (editForm.querySelector('input[name="start-time"]'));
                    const durationHoursInput = /** @type {HTMLInputElement} */ (editForm.querySelector('input[name="duration-hours"]'));
                    const durationMinutesInput = /** @type {HTMLInputElement} */ (editForm.querySelector('input[name="duration-minutes"]'));

                    if (descInput) descInput.value = 'Updated Task';
                    if (startTimeInput) startTimeInput.value = '09:30';
                    if (durationHoursInput) durationHoursInput.value = '2';
                    if (durationMinutesInput) durationMinutesInput.value = '0';

                    // Submit the form to trigger the real callback
                    editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(alertSpy).toHaveBeenCalledWith("Task update cancelled to avoid rescheduling.");
            });

            test('should handle update task failure', async () => {
                const tasks = [
                    { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: true, confirmingDelete: false }
                ];

                mockLoadTasks.mockReturnValue(tasks);
                await setupIntegrationTestEnvironment();
                setTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                mockSaveTasks.mockClear();

                // Mock updateTask to fail
                jest.spyOn(require('../public/js/task-manager.js'), 'updateTask')
                    .mockReturnValue({
                        success: false,
                        reason: 'Update failed'
                    });

                // Submit the edit form to trigger the real callback
                const editForm = document.getElementById('edit-task-0');
                if (editForm) {
                    const descInput = /** @type {HTMLInputElement} */ (editForm.querySelector('input[name="description"]'));
                    if (descInput) descInput.value = 'Updated Task';

                    editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                expect(alertSpy).toHaveBeenCalledWith('Update failed');
            });
        });

        describe('onTaskFormSubmit branch coverage', () => {
            test('should handle user denying reschedule during task add (real app.js callback)', async () => {
                mockLoadTasks.mockReturnValue([]);
                await setupIntegrationTestEnvironment();
                setTasks([]);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false); // User denies reschedule
                mockSaveTasks.mockClear();

                // Mock addTask to require confirmation
                jest.spyOn(require('../public/js/task-manager.js'), 'addTask')
                    .mockReturnValue({
                        success: false,
                        requiresConfirmation: true,
                        confirmationType: 'RESCHEDULE_ADD',
                        reason: 'Would cause overlap'
                    });

                // Fill out and submit the main task form
                const taskForm = document.getElementById('task-form');
                if (taskForm) {
                    const descInput = /** @type {HTMLInputElement} */ (taskForm.querySelector('input[name="description"]'));
                    const startTimeInput = /** @type {HTMLInputElement} */ (taskForm.querySelector('input[name="start-time"]'));
                    const durationHoursInput = /** @type {HTMLInputElement} */ (taskForm.querySelector('input[name="duration-hours"]'));
                    const durationMinutesInput = /** @type {HTMLInputElement} */ (taskForm.querySelector('input[name="duration-minutes"]'));

                    if (descInput) descInput.value = 'New Task';
                    if (startTimeInput) startTimeInput.value = '09:00';
                    if (durationHoursInput) durationHoursInput.value = '1';
                    if (durationMinutesInput) durationMinutesInput.value = '0';

                    taskForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(alertSpy).toHaveBeenCalledWith("Task not added to avoid rescheduling.");
            });

            test('should handle add task failure', async () => {
                mockLoadTasks.mockReturnValue([]);
                await setupIntegrationTestEnvironment();
                setTasks([]);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                mockSaveTasks.mockClear();

                // Mock addTask to fail
                jest.spyOn(require('../public/js/task-manager.js'), 'addTask')
                    .mockReturnValue({
                        success: false,
                        reason: 'Add failed'
                    });

                // Submit the task form with valid data
                const taskForm = document.getElementById('task-form');
                if (taskForm) {
                    const descInput = /** @type {HTMLInputElement} */ (taskForm.querySelector('input[name="description"]'));
                    const startTimeInput = /** @type {HTMLInputElement} */ (taskForm.querySelector('input[name="start-time"]'));
                    const durationHoursInput = /** @type {HTMLInputElement} */ (taskForm.querySelector('input[name="duration-hours"]'));
                    const durationMinutesInput = /** @type {HTMLInputElement} */ (taskForm.querySelector('input[name="duration-minutes"]'));

                    if (descInput) descInput.value = 'New Task';
                    if (startTimeInput) startTimeInput.value = '09:00';
                    if (durationHoursInput) durationHoursInput.value = '1';
                    if (durationMinutesInput) durationMinutesInput.value = '0';

                    taskForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                expect(alertSpy).toHaveBeenCalledWith('Add failed');
            });
        });

        describe('onDeleteAllTasks branch coverage', () => {
            test('should handle deleting all tasks when no tasks exist', async () => {
                mockLoadTasks.mockReturnValue([]);
                await setupIntegrationTestEnvironment();
                setTasks([]);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                mockSaveTasks.mockClear();

                // Click the delete all button when no tasks exist
                const deleteAllButton = document.getElementById('delete-all');
                if (deleteAllButton) {
                    deleteAllButton.dispatchEvent(new Event('click'));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                expect(alertSpy).toHaveBeenCalledWith("There are no tasks to delete.");
            });

            test('should handle user denying delete all confirmation', async () => {
                const tasks = [
                    { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false }
                ];

                mockLoadTasks.mockReturnValue(tasks);
                await setupIntegrationTestEnvironment();
                setTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false); // User denies
                mockSaveTasks.mockClear();

                // Mock deleteAllTasks to require confirmation
                jest.spyOn(require('../public/js/task-manager.js'), 'deleteAllTasks')
                    .mockReturnValue({
                        success: false,
                        requiresConfirmation: true,
                        reason: 'Are you sure?'
                    });

                const deleteAllButton = document.getElementById('delete-all');
                if (deleteAllButton) {
                    deleteAllButton.dispatchEvent(new Event('click'));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
            });

            test('should handle delete all failure with error', async () => {
                const tasks = [
                    { description: 'Task 1', startTime: '09:00', duration: 60, endTime: '10:00', status: 'incomplete', editing: false, confirmingDelete: false }
                ];

                mockLoadTasks.mockReturnValue(tasks);
                await setupIntegrationTestEnvironment();
                setTasks(tasks);

                alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
                confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true); // User confirms
                mockSaveTasks.mockClear();

                // Mock deleteAllTasks to require confirmation first, then fail
                jest.spyOn(require('../public/js/task-manager.js'), 'deleteAllTasks')
                    .mockReturnValueOnce({
                        success: false,
                        requiresConfirmation: true,
                        reason: 'Are you sure?'
                    })
                    .mockReturnValueOnce({
                        success: false,
                        reason: 'Delete all failed',
                        requiresConfirmation: false
                    });

                const deleteAllButton = document.getElementById('delete-all');
                if (deleteAllButton) {
                    deleteAllButton.dispatchEvent(new Event('click'));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                expect(confirmSpy).toHaveBeenCalled();
                expect(alertSpy).toHaveBeenCalledWith('Delete all failed');
            });
        });

        describe('onGlobalClick branch coverage', () => {
            test('should handle resetAllConfirmingDeleteFlags returning false', async () => {
                mockLoadTasks.mockReturnValue([]);
                await setupIntegrationTestEnvironment();
                setTasks([]);

                // Mock resetAllConfirmingDeleteFlags to return false
                jest.spyOn(require('../public/js/task-manager.js'), 'resetAllConfirmingDeleteFlags')
                    .mockReturnValue(false);

                // Click somewhere that's not a delete button to trigger global click
                const taskList = document.getElementById('task-list');
                if (taskList) {
                    taskList.dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            });

            test('should handle resetAllEditingFlags returning false', async () => {
                mockLoadTasks.mockReturnValue([]);
                await setupIntegrationTestEnvironment();
                setTasks([]);

                // Mock both functions to return false
                jest.spyOn(require('../public/js/task-manager.js'), 'resetAllConfirmingDeleteFlags')
                    .mockReturnValue(false);
                jest.spyOn(require('../public/js/task-manager.js'), 'resetAllEditingFlags')
                    .mockReturnValue(false);

                // Click somewhere that triggers both reset calls
                const taskList = document.getElementById('task-list');
                if (taskList) {
                    taskList.dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            });

            test('should handle various click scenarios', async () => {
                mockLoadTasks.mockReturnValue([]);
                await setupIntegrationTestEnvironment();
                setTasks([]);

                // Mock to return true to trigger needsRender
                jest.spyOn(require('../public/js/task-manager.js'), 'resetAllConfirmingDeleteFlags')
                    .mockReturnValue(true);

                // Click on task list element
                const taskList = document.getElementById('task-list');
                if (taskList) {
                    taskList.dispatchEvent(new Event('click', { bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            });
        });

        describe('DOM element error handling', () => {
            test('should handle missing task form element', async () => {
                // Clear DOM and set up without task form
                document.body.innerHTML = `
                    <div id="task-list"></div>
                    <div id="current-time"></div>
                    <div id="current-date"></div>
                    <button id="delete-all">Clear Tasks</button>
                `;

                const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
                mockLoadTasks.mockReturnValue([]);

                // Import app.js to trigger the initialization
                await import('../public/js/app.js');

                // Manually trigger DOMContentLoaded to hit the error checking code
                const domContentLoadedEvent = new Event('DOMContentLoaded', {
                    bubbles: true,
                    cancelable: true
                });
                document.dispatchEvent(domContentLoadedEvent);
                await new Promise(resolve => setTimeout(resolve, 10));

                expect(consoleSpy).toHaveBeenCalledWith("[FORTUDO ERROR] CRITICAL: app.js could not find #task-form element.");
                consoleSpy.mockRestore();
            });

            test('should handle missing delete all button element', async () => {
                // Clear DOM and set up without delete all button
                document.body.innerHTML = `
                    <div id="task-list"></div>
                    <form id="task-form">
                        <input type="text" name="description" required>
                        <input type="time" name="start-time" required>
                        <input type="number" name="duration-hours" min="0">
                        <input type="number" name="duration-minutes" min="0" max="59">
                        <button type="submit">Add</button>
                    </form>
                    <div id="current-time"></div>
                    <div id="current-date"></div>
                `;

                const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
                mockLoadTasks.mockReturnValue([]);

                // Import app.js to trigger the initialization
                await import('../public/js/app.js');

                // Manually trigger DOMContentLoaded to hit the error checking code
                const domContentLoadedEvent = new Event('DOMContentLoaded', {
                    bubbles: true,
                    cancelable: true
                });
                document.dispatchEvent(domContentLoadedEvent);
                await new Promise(resolve => setTimeout(resolve, 10));

                expect(consoleSpy).toHaveBeenCalledWith("[FORTUDO ERROR] CRITICAL: app.js could not find #delete-all button.");
                consoleSpy.mockRestore();
            });
        });
    });
});
import {
    getTaskState,
    deleteAllTasks,
    deleteAllScheduledTasks,
    deleteCompletedTasks,
    getSuggestedStartTime
} from '../task-manager.js';
import { showAlert, askConfirmation } from '../modal-manager.js';
import {
    refreshUI,
    renderTasks,
    renderUnscheduledTasks,
    updateStartTimeField,
    getDeleteAllButtonElement,
    getClearOptionsDropdownTriggerButtonElement,
    getClearTasksDropdownMenuElement,
    getClearScheduledOptionElement,
    getClearCompletedOptionElement,
    toggleClearTasksDropdown,
    closeClearTasksDropdown
} from '../dom-handler.js';

/**
 * Initialize all clear/delete task button event listeners
 */
export function initializeClearTasksHandlers() {
    // "Clear All Tasks" button
    const deleteAllButton = getDeleteAllButtonElement();
    if (deleteAllButton) {
        deleteAllButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            const tasksExist = getTaskState().length > 0;
            if (!tasksExist) {
                showAlert('There are no tasks to delete.', 'red');
                return;
            }
            if (
                await askConfirmation(
                    'Are you sure you want to delete ALL tasks (scheduled and unscheduled)? This action cannot be undone.',
                    undefined,
                    'red'
                )
            ) {
                const result = deleteAllTasks();
                if (result.success) {
                    showAlert(result.message || 'All tasks have been deleted.', 'red');
                    renderTasks([]);
                    renderUnscheduledTasks([]);
                    updateStartTimeField(getSuggestedStartTime(), true);
                } else {
                    showAlert(result.reason || 'Failed to delete all tasks.', 'red');
                }
            }
        });
    }

    // Caret button (dropdown trigger)
    const clearOptionsTriggerButton = getClearOptionsDropdownTriggerButtonElement();
    if (clearOptionsTriggerButton) {
        clearOptionsTriggerButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleClearTasksDropdown();
        });
    }

    // "Clear Scheduled Tasks" dropdown option
    const clearScheduledOption = getClearScheduledOptionElement();
    if (clearScheduledOption) {
        clearScheduledOption.addEventListener('click', async (event) => {
            event.preventDefault();
            const scheduledTasksExist = getTaskState().some((task) => task.type === 'scheduled');
            if (!scheduledTasksExist) {
                showAlert('There are no scheduled tasks to clear.', 'teal');
                closeClearTasksDropdown();
                return;
            }

            if (
                await askConfirmation(
                    "Are you sure you want to clear all tasks from Today's Schedule? Unscheduled tasks will not be affected.",
                    undefined,
                    'teal'
                )
            ) {
                const result = deleteAllScheduledTasks();
                if (result.success) {
                    showAlert(result.message || 'All scheduled tasks have been cleared.', 'teal');
                    refreshUI();
                } else {
                    showAlert(result.reason || 'Failed to clear scheduled tasks.', 'red');
                }
            }
            closeClearTasksDropdown();
        });
    }

    // "Clear Completed Tasks" dropdown option
    const clearCompletedOption = getClearCompletedOptionElement();
    if (clearCompletedOption) {
        clearCompletedOption.addEventListener('click', async (event) => {
            event.preventDefault();
            const completedTasksExist = getTaskState().some((task) => task.status === 'completed');
            if (!completedTasksExist) {
                showAlert('There are no completed tasks to clear.', 'indigo');
                closeClearTasksDropdown();
                return;
            }

            if (
                await askConfirmation(
                    'Are you sure you want to clear all completed tasks? This will remove them from both scheduled and unscheduled lists.',
                    undefined,
                    'indigo'
                )
            ) {
                const result = deleteCompletedTasks();
                if (result.success) {
                    showAlert(result.message || 'All completed tasks have been cleared.', 'indigo');
                    refreshUI();
                } else {
                    showAlert(result.reason || 'Failed to clear completed tasks.', 'red');
                }
            }
            closeClearTasksDropdown();
        });
    }

    // Global click listener to close dropdown when clicking outside
    window.addEventListener('click', (event) => {
        const dropdownTrigger = getClearOptionsDropdownTriggerButtonElement();
        const dropdownMenu = getClearTasksDropdownMenuElement();
        const mainClearAllButton = getDeleteAllButtonElement();

        if (dropdownTrigger && dropdownMenu && mainClearAllButton) {
            const target = event.target;
            if (target instanceof Node) {
                const isClickInsideCaret = dropdownTrigger.contains(target);
                const isClickInsideMenu = dropdownMenu.contains(target);
                const isClickInsideMainButton = mainClearAllButton.contains(target);

                if (!isClickInsideCaret && !isClickInsideMenu && !isClickInsideMainButton) {
                    closeClearTasksDropdown();
                }
            } else {
                closeClearTasksDropdown();
            }
        }
    });
}

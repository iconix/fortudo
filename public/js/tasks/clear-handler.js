import {
    getTaskState,
    deleteAllTasks,
    deleteAllScheduledTasks,
    deleteCompletedTasks
} from './manager.js';
import { showAlert, askConfirmation } from '../modal-manager.js';
import { showToast } from '../toast-manager.js';
import {
    getClearScheduleButtonElement,
    getClearOptionsDropdownTriggerButtonElement,
    getClearTasksDropdownMenuElement,
    getClearAllOptionElement,
    getClearCompletedOptionElement,
    toggleClearTasksDropdown,
    closeClearTasksDropdown
} from '../dom-renderer.js';
import {
    onScheduledTasksCleared,
    onCompletedTasksCleared,
    onAllTasksCleared
} from '../app-coordinator.js';

/**
 * Initialize all clear/delete task button event listeners
 */
export function initializeClearTasksHandlers() {
    // Main button defaults to clearing scheduled tasks
    const clearScheduleButton = getClearScheduleButtonElement();
    if (clearScheduleButton) {
        clearScheduleButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            const scheduledTasksExist = getTaskState().some((task) => task.type === 'scheduled');
            if (!scheduledTasksExist) {
                showToast('There are no scheduled tasks to clear.', { theme: 'teal' });
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
                    showToast(result.message || 'All scheduled tasks have been cleared.', {
                        theme: 'rose'
                    });
                    onScheduledTasksCleared();
                } else {
                    showAlert(result.reason || 'Failed to clear scheduled tasks.', 'red');
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

    // "Clear All Tasks" dropdown option
    const clearAllOption = getClearAllOptionElement();
    if (clearAllOption) {
        clearAllOption.addEventListener('click', async (event) => {
            event.preventDefault();
            const tasksExist = getTaskState().length > 0;
            if (!tasksExist) {
                showToast('There are no tasks to delete.', { theme: 'rose' });
                closeClearTasksDropdown();
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
                    showToast(result.message || 'All tasks have been deleted.', { theme: 'rose' });
                    onAllTasksCleared();
                } else {
                    showAlert(result.reason || 'Failed to delete all tasks.', 'red');
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
                showToast('There are no completed tasks to clear.', { theme: 'indigo' });
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
                    showToast(result.message || 'All completed tasks have been cleared.', {
                        theme: 'rose'
                    });
                    onCompletedTasksCleared();
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
        const mainClearScheduleButton = getClearScheduleButtonElement();

        if (dropdownTrigger && dropdownMenu && mainClearScheduleButton) {
            const target = event.target;
            if (target instanceof Node) {
                const isClickInsideCaret = dropdownTrigger.contains(target);
                const isClickInsideMenu = dropdownMenu.contains(target);
                const isClickInsideMainButton = mainClearScheduleButton.contains(target);

                if (!isClickInsideCaret && !isClickInsideMenu && !isClickInsideMainButton) {
                    closeClearTasksDropdown();
                }
            } else {
                closeClearTasksDropdown();
            }
        }
    });
}

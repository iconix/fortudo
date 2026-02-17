import { logger, getCurrentTimeRounded } from './utils.js';
import { getTaskState, getSortedUnscheduledTasks, getSuggestedStartTime } from './task-manager.js';
import { isScheduledTask } from './task-validators.js';
import {
    getTaskFormElement,
    computeEndTimePreview,
    computeOverlapPreview,
    formatOverlapWarning
} from './form-utils.js';

// Import from new modules
import {
    renderTasks as renderScheduledTasks,
    getScheduledTaskListElement
} from './scheduled-task-renderer.js';

import {
    renderUnscheduledTasks as renderUnscheduledTasksBase,
    getUnscheduledTaskListElement
} from './unscheduled-task-renderer.js';

// Global event callbacks storage for event delegation
let globalScheduledTaskCallbacks = null;
let globalUnscheduledTaskCallbacks = null;

// Auto-update state for start time field
const startTimeAutoUpdate = {
    trackedTime: /** @type {string|null} */ (null),
    trackedDate: /** @type {string|null} */ (null),
    isEnabled() {
        return this.trackedTime !== null;
    },
    enable(timeValue, date = new Date()) {
        this.trackedTime = timeValue;
        this.trackedDate = date.toDateString();
    },
    disable() {
        this.trackedTime = null;
        this.trackedDate = null;
    },
    hasDateChanged(currentDate = new Date()) {
        return this.trackedDate && this.trackedDate !== currentDate.toDateString();
    }
};

// --- Rendering Functions ---

export function renderDateTime() {
    const now = new Date();
    const currentTimeElement = getCurrentTimeElement();
    const currentDateElement = getCurrentDateElement();
    if (currentTimeElement)
        currentTimeElement.textContent = now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    if (currentDateElement)
        currentDateElement.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
}

export function startRealTimeClock() {
    renderDateTime();
    setInterval(renderDateTime, 1000);
}

export function initializeTaskTypeToggle() {
    const scheduledRadio = document.getElementById('scheduled');
    const unscheduledRadio = document.getElementById('unscheduled');
    const timeInputs = document.getElementById('time-inputs');
    const priorityInput = document.getElementById('priority-input');
    const addTaskButton = document.querySelector('#task-form button[type="submit"]');
    const descriptionInput = document.querySelector('input[name="description"]');
    const startTimeInput = document.querySelector('input[name="start-time"]');

    if (
        scheduledRadio instanceof HTMLInputElement &&
        unscheduledRadio instanceof HTMLInputElement &&
        timeInputs instanceof HTMLElement &&
        priorityInput instanceof HTMLElement &&
        addTaskButton instanceof HTMLElement &&
        descriptionInput instanceof HTMLElement
    ) {
        const toggleVisibility = () => {
            if (scheduledRadio.checked) {
                timeInputs.classList.remove('hidden');
                priorityInput.classList.add('hidden');
                // Re-enable required on start-time when showing scheduled inputs
                if (startTimeInput) startTimeInput.setAttribute('required', '');
                addTaskButton.className =
                    'shrink-0 bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300 px-5 py-2.5 rounded-lg w-full sm:w-auto font-normal text-white transition-all duration-300 flex items-center justify-center';
                descriptionInput.className =
                    'bg-slate-700 p-2.5 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none transition-all';
            } else {
                timeInputs.classList.add('hidden');
                priorityInput.classList.remove('hidden');
                // Remove required from start-time when hiding scheduled inputs
                if (startTimeInput) startTimeInput.removeAttribute('required');
                addTaskButton.className =
                    'shrink-0 bg-gradient-to-r from-indigo-500 to-indigo-400 hover:from-indigo-400 hover:to-indigo-300 px-5 py-2.5 rounded-lg w-full sm:w-auto font-normal text-white transition-all duration-300 flex items-center justify-center';
                descriptionInput.className =
                    'bg-slate-700 p-2.5 rounded-lg w-full border border-slate-600 focus:border-indigo-400 focus:outline-none transition-all';
            }
        };

        scheduledRadio.addEventListener('change', toggleVisibility);
        unscheduledRadio.addEventListener('change', toggleVisibility);
        toggleVisibility(); // Initial call

        // Add page visibility change listener to re-sync form state when user returns to tab
        // This fixes mobile bug where radio button state and form UI can get out of sync
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Page became visible again, re-sync the form state
                toggleVisibility();
            }
        });

        // Also listen for focus events as additional safeguard for mobile browsers
        window.addEventListener('focus', () => {
            toggleVisibility();
        });
    } else {
        logger.error('DOM elements for task type toggle not found or not of expected types.');
    }
}

// --- Event Handlers ---

function handleScheduledTaskListClick(event) {
    if (!globalScheduledTaskCallbacks) {
        logger.warn('handleScheduledTaskListClick: globalScheduledTaskCallbacks not initialized');
        return;
    }
    const target = /** @type {HTMLElement} */ (event.target);

    // Check for gap click
    const gapElement = target.closest('.schedule-gap');
    if (gapElement instanceof HTMLElement && globalScheduledTaskCallbacks.onGapClick) {
        const gapStart = gapElement.dataset.gapStart;
        const gapEnd = gapElement.dataset.gapEnd;
        const durationMinutes = parseInt(gapElement.dataset.gapDuration, 10);
        if (gapStart && gapEnd && !isNaN(durationMinutes)) {
            globalScheduledTaskCallbacks.onGapClick(gapStart, gapEnd, durationMinutes);
        }
        return;
    }

    // Check for Cancel button first
    const cancelButtonElement = target.closest('.btn-edit-cancel');
    if (cancelButtonElement instanceof HTMLElement) {
        const cancelButton = /** @type {HTMLElement} */ (cancelButtonElement);
        event.preventDefault();
        const editFormElement = cancelButton.closest('form');
        if (
            editFormElement instanceof HTMLFormElement &&
            editFormElement.id &&
            editFormElement.id.startsWith('edit-task-')
        ) {
            const editForm = /** @type {HTMLFormElement} */ (editFormElement);
            const taskId = editForm.dataset.taskId;
            const taskIndexStr = cancelButton.dataset.taskIndex; // Index is on the button

            if (taskId && taskIndexStr !== undefined && globalScheduledTaskCallbacks.onCancelEdit) {
                globalScheduledTaskCallbacks.onCancelEdit(taskId, parseInt(taskIndexStr, 10));
            } else {
                logger.warn('Cancel button: taskId, taskIndexStr or onCancelEdit cb missing.', {
                    taskId,
                    taskIndexStr
                });
            }
        } else {
            logger.warn('Cancel button found, but not within an expected edit form.', {
                cancelButton
            });
        }
        return; // Processed cancel
    }

    // For other clicks (checkbox, edit pencil, delete button on view task)
    let taskElementContextSource = target.closest('.task-item'); // General task container if view mode
    if (!taskElementContextSource) {
        // If not in a .task-item, try any [data-task-id] (like the form itself)
        taskElementContextSource = target.closest('[data-task-id]');
    }

    if (!(taskElementContextSource instanceof HTMLElement)) {
        return; // Click was not on a recognized task-related element
    }
    const taskElementContext = /** @type {HTMLElement} */ (taskElementContextSource);

    const taskId = taskElementContext.dataset.taskId;
    const taskIndexStr = taskElementContext.dataset.taskIndex;

    if (!taskId || taskIndexStr === undefined) {
        logger.warn(
            'handleScheduledTaskListClick: Click on task-like element, but taskId or taskIndex missing.',
            { taskId, taskIndexStr, taskElementContext }
        );
        return;
    }

    const taskIndex = parseInt(taskIndexStr, 10);

    if (target.closest('.checkbox')) {
        event.preventDefault();
        // Get all tasks and find the first uncompleted one (active task)
        const allTasks = getTaskState().filter((t) => t.type === 'scheduled');
        const activeTask = allTasks.find((t) => t.status !== 'completed');

        // Only allow completion if this is the active task
        if (activeTask && activeTask.id === taskId && globalScheduledTaskCallbacks.onCompleteTask) {
            globalScheduledTaskCallbacks.onCompleteTask(taskId, taskIndex);
        } else {
            logger.warn('Attempted to complete a non-active task:', taskId);
        }
        return;
    }

    if (target.closest('.btn-edit')) {
        // "pencil" icon on view task
        event.preventDefault();
        if (globalScheduledTaskCallbacks.onEditTask) {
            globalScheduledTaskCallbacks.onEditTask(taskId, taskIndex);
        }
        return;
    }

    if (target.closest('.btn-lock')) {
        event.preventDefault();
        if (globalScheduledTaskCallbacks.onLockTask) {
            globalScheduledTaskCallbacks.onLockTask(taskId, taskIndex);
        }
        return;
    }

    if (target.closest('.btn-unschedule')) {
        event.preventDefault();
        if (globalScheduledTaskCallbacks.onUnscheduleTask) {
            globalScheduledTaskCallbacks.onUnscheduleTask(taskId, taskIndex);
        }
        return;
    }

    if (target.closest('.btn-delete')) {
        event.preventDefault();
        event.stopPropagation();
        if (globalScheduledTaskCallbacks.onDeleteTask) {
            globalScheduledTaskCallbacks.onDeleteTask(taskId, taskIndex);
        }
        return;
    }
}

function handleScheduledTaskListSubmit(event) {
    if (!globalScheduledTaskCallbacks) return;
    const targetForm = /** @type {HTMLFormElement} */ (event.target);
    if (targetForm.id && targetForm.id.startsWith('edit-task-')) {
        event.preventDefault();
        const taskId = targetForm.dataset.taskId;
        const taskIndexStr = targetForm.dataset.taskIndex;
        if (taskId && taskIndexStr !== undefined && globalScheduledTaskCallbacks.onSaveTaskEdit) {
            globalScheduledTaskCallbacks.onSaveTaskEdit(
                taskId,
                targetForm,
                parseInt(taskIndexStr, 10)
            );
        }
    }
}

const SAVE_BUTTON_DEFAULT_CLASSES =
    'btn-save-edit w-full sm:w-auto justify-center px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300';
const SAVE_BUTTON_OVERLAP_CLASSES =
    'btn-save-edit w-full sm:w-auto justify-center px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300';

function handleScheduledTaskListInput(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const editForm = target.closest('form[id^="edit-task-"]');
    if (!editForm) return;

    const startInput = editForm.querySelector('input[name="start-time"]');
    const hoursInput = editForm.querySelector('input[name="duration-hours"]');
    const minutesInput = editForm.querySelector('input[name="duration-minutes"]');
    if (
        !(startInput instanceof HTMLInputElement) ||
        !(hoursInput instanceof HTMLInputElement) ||
        !(minutesInput instanceof HTMLInputElement)
    )
        return;

    // End time hint
    const hintEl = editForm.querySelector('.edit-end-time-hint');
    if (hintEl) {
        const result = computeEndTimePreview(
            startInput.value,
            hoursInput.value,
            minutesInput.value
        );
        if (result) {
            hintEl.textContent = `\u25B8 ${result}`;
            hintEl.classList.remove('opacity-0');
        } else {
            hintEl.textContent = '';
            hintEl.classList.add('opacity-0');
        }
    }

    // Overlap warning
    const warningEl = editForm.querySelector('.edit-overlap-warning');
    const saveBtn = editForm.querySelector('.btn-save-edit');
    if (warningEl && saveBtn) {
        const excludeTaskId = editForm.dataset.taskId;
        const scheduledTasks = getTaskState().filter((t) => t.type === 'scheduled');
        const overlapResult = computeOverlapPreview(
            startInput.value,
            hoursInput.value,
            minutesInput.value,
            scheduledTasks,
            excludeTaskId
        );

        if (overlapResult && overlapResult.overlaps.length > 0) {
            warningEl.textContent = formatOverlapWarning(overlapResult.overlaps);
            saveBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i>Reschedule';
            saveBtn.className = SAVE_BUTTON_OVERLAP_CLASSES;
        } else {
            warningEl.textContent = '';
            saveBtn.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Save';
            saveBtn.className = SAVE_BUTTON_DEFAULT_CLASSES;
        }
    }
}

function handleUnscheduledTaskListClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const taskCard = /** @type {HTMLElement} */ (target.closest('.task-card'));

    if (!taskCard || !globalUnscheduledTaskCallbacks) return;

    const taskId = taskCard.dataset.taskId;

    if (target.closest('.btn-schedule-task')) {
        if (globalUnscheduledTaskCallbacks.onScheduleUnscheduledTask && taskId) {
            const taskName = taskCard.dataset.taskName || 'Task';
            const estDurationText = taskCard.dataset.taskEstDuration || 'N/A';
            const task = getTaskState().find((t) => t.id === taskId); // Check if task is completed
            if (task && task.status !== 'completed') {
                // Only schedule if not completed
                globalUnscheduledTaskCallbacks.onScheduleUnscheduledTask(
                    taskId,
                    taskName,
                    estDurationText
                );
            }
        }
    } else if (target.closest('.btn-edit-unscheduled')) {
        if (globalUnscheduledTaskCallbacks.onEditUnscheduledTask && taskId) {
            logger.debug(`Edit button clicked for unscheduled task: ${taskId}`);
            globalUnscheduledTaskCallbacks.onEditUnscheduledTask(taskId);
        }
    } else if (target.closest('.btn-delete-unscheduled')) {
        if (globalUnscheduledTaskCallbacks.onDeleteUnscheduledTask && taskId) {
            globalUnscheduledTaskCallbacks.onDeleteUnscheduledTask(taskId);
        }
    } else if (target.closest('.task-checkbox-unscheduled')) {
        if (globalUnscheduledTaskCallbacks.onToggleCompleteUnscheduledTask && taskId) {
            globalUnscheduledTaskCallbacks.onToggleCompleteUnscheduledTask(taskId);
        } else {
            logger.warn(
                'onToggleCompleteUnscheduledTask callback not found or taskId missing for unscheduled task checkbox.'
            );
        }
    } else if (target.closest('.btn-save-inline-edit')) {
        // Handle save from inline form
        if (globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit && taskId) {
            logger.debug(`Save inline edit button clicked for unscheduled task: ${taskId}`);
            globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit(taskId);
        }
    } else if (target.closest('.btn-cancel-inline-edit')) {
        // Handle cancel from inline form
        if (globalUnscheduledTaskCallbacks.onCancelUnscheduledTaskEdit && taskId) {
            logger.debug(`Cancel inline edit button clicked for unscheduled task: ${taskId}`);
            globalUnscheduledTaskCallbacks.onCancelUnscheduledTaskEdit(taskId);
        }
    }
}

function handleUnscheduledTaskListKeydown(event) {
    if (event.key !== 'Enter') return;
    if (!(event.target instanceof HTMLInputElement)) return;
    const form = event.target.closest('form');
    if (!form) return;
    const taskCard = /** @type {HTMLElement} */ (form.closest('.task-card'));
    if (!taskCard || !globalUnscheduledTaskCallbacks) return;

    event.preventDefault();
    const taskId = taskCard.dataset.taskId;
    if (taskId && globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit) {
        globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit(taskId);
    }
}

function handleUnscheduledTaskListSubmit(event) {
    event.preventDefault(); // Always prevent default form submission
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const taskCard = /** @type {HTMLElement} */ (form.closest('.task-card'));
    if (!taskCard || !globalUnscheduledTaskCallbacks) return;

    const taskId = taskCard.dataset.taskId;
    if (taskId && globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit) {
        globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit(taskId);
    }
}

// --- Event Listener Initialization ---

export function initializeScheduledTaskListEventListeners(eventCallbacks) {
    const taskListElement = getScheduledTaskListElement();
    if (!taskListElement) {
        logger.error('Scheduled task list element not found.');
        return;
    }
    taskListElement.removeEventListener('click', handleScheduledTaskListClick);
    taskListElement.removeEventListener('submit', handleScheduledTaskListSubmit);
    taskListElement.removeEventListener('input', handleScheduledTaskListInput);
    globalScheduledTaskCallbacks = eventCallbacks;
    taskListElement.addEventListener('click', handleScheduledTaskListClick);
    taskListElement.addEventListener('submit', handleScheduledTaskListSubmit);
    taskListElement.addEventListener('input', handleScheduledTaskListInput);
}

export function initializeUnscheduledTaskListEventListeners(callbacks) {
    globalUnscheduledTaskCallbacks = callbacks;
    const unscheduledTaskList = getUnscheduledTaskListElement();
    if (unscheduledTaskList) {
        // Remove existing listeners to prevent duplicates if re-initialized
        unscheduledTaskList.removeEventListener('click', handleUnscheduledTaskListClick);
        unscheduledTaskList.removeEventListener('submit', handleUnscheduledTaskListSubmit);
        unscheduledTaskList.removeEventListener('keydown', handleUnscheduledTaskListKeydown);
        unscheduledTaskList.addEventListener('click', handleUnscheduledTaskListClick);
        unscheduledTaskList.addEventListener('submit', handleUnscheduledTaskListSubmit);
        unscheduledTaskList.addEventListener('keydown', handleUnscheduledTaskListKeydown);
    } else {
        logger.error('Unscheduled task list element not found for event listeners.');
    }
}

export function initializeDragAndDropUnscheduled(callbacks) {
    const taskList = getUnscheduledTaskListElement();
    if (!taskList) return;

    let dragSrcEl = null;

    taskList.addEventListener('dragstart', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        target.style.opacity = '0.4';
        dragSrcEl = target;
        e.dataTransfer?.setData('text/html', target.innerHTML);
    });

    taskList.addEventListener('dragend', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        target.style.opacity = '1';
    });

    taskList.addEventListener('dragover', (e) => {
        e.preventDefault();
        return false;
    });

    taskList.addEventListener('dragenter', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        const taskCard = /** @type {HTMLElement} */ (target.closest('.task-card'));
        if (taskCard) {
            taskCard.classList.add('bg-gray-700');
        }
    });

    taskList.addEventListener('dragleave', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        const taskCard = /** @type {HTMLElement} */ (target.closest('.task-card'));
        if (taskCard) {
            taskCard.classList.remove('bg-gray-700');
        }
    });

    taskList.addEventListener('drop', (e) => {
        e.stopPropagation();
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        const taskCard = /** @type {HTMLElement} */ (target.closest('.task-card'));
        if (!taskCard || !dragSrcEl) return;

        taskCard.classList.remove('bg-gray-700');

        if (dragSrcEl !== taskCard) {
            const draggedTaskId = dragSrcEl.dataset.taskId;
            const targetTaskId = taskCard.dataset.taskId;
            if (draggedTaskId && targetTaskId && callbacks.onDropUnscheduledTask) {
                callbacks.onDropUnscheduledTask(draggedTaskId, targetTaskId);
            }
        }
    });
}

// --- Wrapper for Render Functions ---

export function renderTasks(tasksToRender, eventCallbacks) {
    const callbacks = eventCallbacks || globalScheduledTaskCallbacks;
    globalScheduledTaskCallbacks = renderScheduledTasks(
        tasksToRender,
        callbacks,
        initializeScheduledTaskListEventListeners,
        globalScheduledTaskCallbacks
    );
}

export function renderUnscheduledTasks(unscheduledTasks, eventCallbacks) {
    const callbacks = eventCallbacks || globalUnscheduledTaskCallbacks;
    renderUnscheduledTasksBase(unscheduledTasks, callbacks, (cb) => {
        globalUnscheduledTaskCallbacks = cb;
    });
}

/**
 * Re-render both task lists and update the start time field using stored state.
 * Convenience function that replaces repeated 3-line render boilerplate.
 */
export function refreshUI() {
    const tasks = getTaskState();
    renderTasks(tasks.filter(isScheduledTask));
    renderUnscheduledTasks(getSortedUnscheduledTasks());
    updateStartTimeField(getSuggestedStartTime(), true);
}

// --- Start Time Field Management ---

export function updateStartTimeField(suggestedTime /*: string */, forceUpdate = false) {
    logger.debug('updateStartTimeField called with:', { suggestedTime, forceUpdate });
    const taskForm = getTaskFormElement();
    if (!taskForm) {
        logger.warn('Task form not found in updateStartTimeField.');
        return;
    }
    const startTimeInput = taskForm.querySelector('input[name="start-time"]');

    if (startTimeInput instanceof HTMLInputElement) {
        const now = new Date(); // This is a Date object

        if (forceUpdate) {
            startTimeInput.value = suggestedTime;
            logger.debug('updateStartTimeField - FORCED value to:', startTimeInput.value);
            // If the forced suggestedTime is a "special" calculation (not just the current rounded time),
            // disable auto-update so it doesn't get immediately overwritten by refreshStartTimeField.
            if (suggestedTime !== getCurrentTimeRounded()) {
                startTimeAutoUpdate.disable();
                logger.debug(
                    'Start time field updated (forced with special value), auto-update disabled:',
                    suggestedTime
                );
            } else {
                startTimeAutoUpdate.enable(suggestedTime, now); // now is a Date object
                logger.debug(
                    'Start time field updated (forced with current time), auto-update enabled:',
                    suggestedTime
                );
            }
        } else if (startTimeAutoUpdate.isEnabled()) {
            if (startTimeAutoUpdate.hasDateChanged(now)) {
                // now is a Date object
                startTimeAutoUpdate.disable();
                logger.info('Start time auto-update disabled due to date change.');
            } else {
                startTimeInput.value = suggestedTime; // suggestedTime is a string like HH:MM
                logger.debug('Start time field updated (auto):', suggestedTime);
            }
        }
    } else {
        logger.warn(
            'Start time input not found or not an HTMLInputElement in updateStartTimeField.'
        );
    }
}

export function refreshStartTimeField() {
    if (startTimeAutoUpdate.isEnabled()) {
        const currentTimeString = getCurrentTimeRounded(); // This returns a string like HH:MM
        updateStartTimeField(currentTimeString, false);
    }
}

export function disableStartTimeAutoUpdate() {
    startTimeAutoUpdate.disable();
}

// --- Page Event Listeners ---

export function initializePageEventListeners(appCallbacks, taskFormElement) {
    if (!(taskFormElement instanceof HTMLFormElement)) {
        logger.error(
            'Task form element not found or not an HTMLFormElement for initializePageEventListeners.'
        );
    } else {
        taskFormElement.addEventListener('submit', (event) => {
            event.preventDefault(); // Prevent default form submission (page reload)
            if (appCallbacks && appCallbacks.onTaskFormSubmit) {
                appCallbacks.onTaskFormSubmit(taskFormElement);
            } else {
                logger.error(
                    'onTaskFormSubmit callback not provided to initializePageEventListeners'
                );
            }
        });
        logger.debug('Submit event listener added to task form.');

        // Allow ENTER key to submit from any input field (time/number inputs don't submit by default)
        taskFormElement.addEventListener('keydown', (event) => {
            if (
                event.key === 'Enter' &&
                event.target instanceof HTMLInputElement &&
                event.target.type !== 'submit'
            ) {
                event.preventDefault();
                taskFormElement.dispatchEvent(new Event('submit'));
            }
        });

        // Add listener to disable auto-update on manual input
        const startTimeInput = taskFormElement.querySelector('input[name="start-time"]');
        if (startTimeInput instanceof HTMLInputElement) {
            startTimeInput.addEventListener('input', () => {
                logger.debug('User manually changed start time input, disabling auto-update.');
                disableStartTimeAutoUpdate();
            });
        } else {
            logger.warn(
                'Start time input not found in task form for attaching input event listener during page init.'
            );
        }
    }

    // Optional: Global click listener to reset flags (from V1, consider if still needed for V2)
    document.addEventListener('click', (event) => {
        if (appCallbacks && appCallbacks.onGlobalClick) {
            appCallbacks.onGlobalClick(event);
        }
    });
}

// --- DOM Element Getters ---

export function getCurrentTimeElement() {
    return document.getElementById('current-time');
}

export function getCurrentDateElement() {
    return document.getElementById('current-date');
}

export function getDeleteAllButtonElement() {
    return document.getElementById('delete-all');
}

export function getClearOptionsDropdownTriggerButtonElement() {
    return document.getElementById('clear-options-dropdown-trigger-btn');
}

export function getClearTasksDropdownMenuElement() {
    return document.getElementById('clear-tasks-dropdown'); // This is the dropdown for the single "Clear Scheduled" option
}

export function getClearScheduledOptionElement() {
    return document.getElementById('clear-scheduled-tasks-option');
}

export function getClearCompletedOptionElement() {
    return document.getElementById('clear-completed-tasks-option');
}

export function toggleClearTasksDropdown() {
    const dropdown = getClearTasksDropdownMenuElement();
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

export function closeClearTasksDropdown() {
    const dropdown = getClearTasksDropdownMenuElement();
    if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
    }
}

export function resetEventDelegation() {
    logger.debug('Resetting global event callbacks.');
    globalScheduledTaskCallbacks = null;
    globalUnscheduledTaskCallbacks = null;
}

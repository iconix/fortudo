// Orchestrator: public/js/app.js
import {
    updateTaskState,
    getTaskState,
    resetAllConfirmingDeleteFlags,
    getSuggestedStartTime,
    getSortedUnscheduledTasks
} from './task-manager.js';
import { initializeModalEventListeners } from './modal-manager.js';
import {
    extractTaskFormData,
    getTaskFormElement,
    focusTaskDescriptionInput,
    setupEndTimeHint
} from './form-utils.js';
import { refreshActiveTaskColor, refreshCurrentGapHighlight } from './scheduled-task-renderer.js';
import {
    renderTasks,
    renderUnscheduledTasks,
    refreshUI,
    updateStartTimeField,
    initializePageEventListeners,
    refreshStartTimeField,
    initializeTaskTypeToggle,
    startRealTimeClock,
    initializeUnscheduledTaskListEventListeners
} from './dom-handler.js';
import { loadTasksFromStorage } from './storage.js';
import { logger } from './utils.js';
import { createScheduledTaskCallbacks } from './handlers/scheduled-task-handlers.js';
import { createUnscheduledTaskCallbacks } from './handlers/unscheduled-task-handlers.js';
import { handleAddTaskProcess } from './handlers/add-task-handler.js';
import { initializeClearTasksHandlers } from './handlers/clear-tasks-handler.js';

document.addEventListener('DOMContentLoaded', () => {
    // Load and initialize state
    const loadedTasks = loadTasksFromStorage();
    loadedTasks.forEach((task) => {
        if (Object.prototype.hasOwnProperty.call(task, 'isEditingInline')) {
            task.isEditingInline = false;
        }
    });
    updateTaskState(loadedTasks);

    // Create callback objects
    const scheduledTaskEventCallbacks = createScheduledTaskCallbacks();
    const unscheduledTaskEventCallbacks = createUnscheduledTaskCallbacks();

    const appCallbacks = {
        onTaskFormSubmit: async (formElement) => {
            const taskData = extractTaskFormData(formElement);
            if (!taskData) {
                focusTaskDescriptionInput();
                return;
            }
            await handleAddTaskProcess(formElement, taskData);
        },
        onGlobalClick: (event) => {
            const target = event.target;
            const taskElement = target.closest('.task-item, .unscheduled-task-item');
            const deleteButton = target.closest('.btn-delete, .btn-delete-unscheduled');

            if (!taskElement && !deleteButton) {
                const wasConfirming = resetAllConfirmingDeleteFlags();
                if (wasConfirming) {
                    refreshUI();
                }
            }
        }
    };

    // Initialize event listeners
    const taskFormElement = getTaskFormElement();
    if (!taskFormElement) logger.error('CRITICAL: app.js could not find #task-form element.');

    // Wire up end time hint for the add task form
    if (taskFormElement) {
        const startTimeInput = taskFormElement.querySelector('input[name="start-time"]');
        const hoursInput = taskFormElement.querySelector('input[name="duration-hours"]');
        const minutesInput = taskFormElement.querySelector('input[name="duration-minutes"]');
        const hintElement = document.getElementById('end-time-hint');
        if (startTimeInput && hoursInput && minutesInput && hintElement) {
            setupEndTimeHint(startTimeInput, hoursInput, minutesInput, hintElement);
        }
    }

    initializePageEventListeners(appCallbacks, taskFormElement);
    initializeTaskTypeToggle();
    startRealTimeClock();
    initializeUnscheduledTaskListEventListeners(unscheduledTaskEventCallbacks);
    initializeModalEventListeners(unscheduledTaskEventCallbacks);
    initializeClearTasksHandlers();

    // Initial render
    const allTasks = getTaskState();
    renderTasks(
        allTasks.filter((t) => t.type === 'scheduled'),
        scheduledTaskEventCallbacks
    );
    renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
    refreshActiveTaskColor(allTasks);
    refreshCurrentGapHighlight();

    const suggested = getSuggestedStartTime();
    logger.debug('DOMContentLoaded - getSuggestedStartTime() returned:', suggested);
    updateStartTimeField(suggested, true);

    focusTaskDescriptionInput();

    // Active task color refresh interval
    const activeTaskColorInterval = setInterval(() => {
        refreshActiveTaskColor(getTaskState());
        refreshCurrentGapHighlight();
        refreshStartTimeField();
    }, 1000);

    window.addEventListener('beforeunload', () => {
        clearInterval(activeTaskColorInterval);
    });
});

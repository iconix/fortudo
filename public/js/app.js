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
    setupEndTimeHint,
    setupOverlapWarning
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
import { initStorage, loadTasks } from './storage.js';
import { logger } from './utils.js';
import { createScheduledTaskCallbacks } from './handlers/scheduled-task-handlers.js';
import { createUnscheduledTaskCallbacks } from './handlers/unscheduled-task-handlers.js';
import { handleAddTaskProcess } from './handlers/add-task-handler.js';
import { initializeClearTasksHandlers } from './handlers/clear-tasks-handler.js';
import {
    showRoomEntryScreen,
    showMainApp,
    updateSyncStatusUI
} from './handlers/room-ui-handler.js';
import { getActiveRoom } from './room-manager.js';
import { onSyncStatusChange } from './sync-manager.js';

/**
 * Initialize storage and boot the main app UI.
 * @param {string} roomCode
 */
async function initAndBootApp(roomCode) {
    showMainApp(roomCode);

    // Initialize storage
    await initStorage(roomCode);

    // Load and initialize state
    const loadedTasks = await loadTasks();
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
            const overlapEl = document.getElementById('overlap-warning');
            const reschedulePreApproved = !!(overlapEl && overlapEl.textContent.trim());
            await handleAddTaskProcess(formElement, taskData, { reschedulePreApproved });
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

    // Wire up end time hint and overlap warning for the add task form
    if (taskFormElement) {
        const startTimeInput = taskFormElement.querySelector('input[name="start-time"]');
        const hoursInput = taskFormElement.querySelector('input[name="duration-hours"]');
        const minutesInput = taskFormElement.querySelector('input[name="duration-minutes"]');
        const hintElement = document.getElementById('end-time-hint');
        if (startTimeInput && hoursInput && minutesInput && hintElement) {
            setupEndTimeHint(startTimeInput, hoursInput, minutesInput, hintElement);
        }

        const overlapWarning = document.getElementById('overlap-warning');
        const addTaskBtn = document.getElementById('add-task-btn');
        if (startTimeInput && hoursInput && minutesInput && overlapWarning && addTaskBtn) {
            setupOverlapWarning(
                startTimeInput,
                hoursInput,
                minutesInput,
                overlapWarning,
                addTaskBtn,
                () => getTaskState().filter((t) => t.type === 'scheduled'),
                {
                    defaultButtonHTML: '<i class="fa-regular fa-plus mr-2"></i>Add Task',
                    defaultButtonClasses: addTaskBtn.className,
                    overlapButtonHTML:
                        '<i class="fa-solid fa-triangle-exclamation mr-2"></i>Reschedule',
                    overlapButtonClasses: addTaskBtn.className
                        .replace(/from-teal-500/g, 'from-amber-500')
                        .replace(/to-teal-400/g, 'to-amber-400')
                        .replace(/hover:from-teal-400/g, 'hover:from-amber-400')
                        .replace(/hover:to-teal-300/g, 'hover:to-amber-300')
                }
            );
        }
    }

    initializePageEventListeners(appCallbacks, taskFormElement);
    initializeTaskTypeToggle();
    startRealTimeClock();
    initializeUnscheduledTaskListEventListeners(unscheduledTaskEventCallbacks);
    initializeModalEventListeners(unscheduledTaskEventCallbacks);
    initializeClearTasksHandlers();

    // Wire up sync status indicator
    onSyncStatusChange((status) => {
        updateSyncStatusUI(status);
    });

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
    logger.debug('initAndBootApp - getSuggestedStartTime() returned:', suggested);
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
}

document.addEventListener('DOMContentLoaded', async () => {
    // Wire up room code badge click once (outside initAndBootApp to avoid accumulation)
    const roomCodeBadge = document.getElementById('room-code-badge');
    if (roomCodeBadge) {
        roomCodeBadge.addEventListener('click', () => {
            showRoomEntryScreen(initAndBootApp);
        });
    }

    const activeRoom = getActiveRoom();
    if (!activeRoom) {
        showRoomEntryScreen(initAndBootApp);
        return;
    }
    await initAndBootApp(activeRoom);
});

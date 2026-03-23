// Orchestrator: public/js/app.js
import {
    updateTaskState,
    getTaskState,
    resetAllConfirmingDeleteFlags,
    getSuggestedStartTime,
    getSortedUnscheduledTasks
} from './tasks/manager.js';
import { initializeModalEventListeners } from './modal-manager.js';
import {
    extractTaskFormData,
    populateCategoryDropdown,
    initializeCategoryDropdownListener,
    getTaskFormElement,
    focusTaskDescriptionInput,
    setupEndTimeHint,
    setupOverlapWarning
} from './tasks/form-utils.js';
import { refreshActiveTaskColor, refreshCurrentGapHighlight } from './tasks/scheduled-renderer.js';
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
} from './dom-renderer.js';
import { prepareStorage, loadTasks } from './storage.js';
import { loadCategories, getCategoryGroups } from './category-manager.js';
import { isActivitiesEnabled } from './settings-manager.js';
import { initializeSettingsModalListeners, renderSettingsContent } from './settings-renderer.js';
import { logger } from './utils.js';
import { createScheduledTaskCallbacks } from './tasks/scheduled-handlers.js';
import { createUnscheduledTaskCallbacks } from './tasks/unscheduled-handlers.js';
import { handleAddTaskProcess } from './tasks/add-handler.js';
import { initializeClearTasksHandlers } from './tasks/clear-handler.js';
import { showRoomEntryScreen, showMainApp, updateSyncStatusUI } from './room-renderer.js';
import { getActiveRoom } from './room-manager.js';
import { onSyncStatusChange, triggerSync } from './sync-manager.js';
import { COUCHDB_URL } from './config.js';

/** @type {AbortController|null} */
let appLifecycleAbortController = null;

/** @type {(() => void) | null} */
let unsubscribeSyncStatus = null;

/** @type {Promise<void> | null} */
let refreshFromStoragePromise = null;

/**
 * Use an isolated room code for preview deployments so they never touch prod data.
 * @param {string} roomCode
 * @returns {string}
 */
function getStorageRoomCode(roomCode) {
    const host = window.location.hostname || '';
    const isPreviewHost =
        (host.startsWith('fortudo--') && host.endsWith('.web.app')) ||
        (host.startsWith('fortudo--') && host.endsWith('.firebaseapp.com'));
    return isPreviewHost ? `preview-${roomCode}` : roomCode;
}

async function loadTasksIntoState() {
    const loadedTasks = await loadTasks();
    loadedTasks.forEach((task) => {
        if (Object.prototype.hasOwnProperty.call(task, 'isEditingInline')) {
            task.isEditingInline = false;
        }
    });
    updateTaskState(loadedTasks, { persist: false });
}

async function refreshFromStorage() {
    if (refreshFromStoragePromise) {
        return refreshFromStoragePromise;
    }

    refreshFromStoragePromise = (async () => {
        await loadTasksIntoState();
        refreshUI();
        refreshActiveTaskColor(getTaskState());
        refreshCurrentGapHighlight();
    })();

    try {
        await refreshFromStoragePromise;
    } finally {
        refreshFromStoragePromise = null;
    }
}

/**
 * Initialize storage and boot the main app UI.
 * @param {string} roomCode
 */
async function initAndBootApp(roomCode) {
    if (appLifecycleAbortController) {
        appLifecycleAbortController.abort();
    }
    appLifecycleAbortController = new AbortController();
    const { signal } = appLifecycleAbortController;

    if (unsubscribeSyncStatus) {
        unsubscribeSyncStatus();
        unsubscribeSyncStatus = null;
    }

    showMainApp(roomCode);

    // Initialize storage (with optional CouchDB sync)
    const couchDbUrl = COUCHDB_URL || null;
    const storageRoomCode = getStorageRoomCode(roomCode);
    const remoteUrl = couchDbUrl ? `${couchDbUrl}/fortudo-${storageRoomCode}` : null;
    await prepareStorage(storageRoomCode, {}, remoteUrl);

    // Load and initialize state
    await loadTasksIntoState();
    await loadCategories();

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

        if (isActivitiesEnabled()) {
            const categoryRow = document.getElementById('category-dropdown-row');
            const categorySelect = document.getElementById('category-select');
            if (categoryRow && categorySelect instanceof HTMLSelectElement) {
                categoryRow.classList.remove('hidden');
                populateCategoryDropdown(categorySelect, getCategoryGroups());
                initializeCategoryDropdownListener();
            }
        }
    }

    initializePageEventListeners(appCallbacks, taskFormElement);
    initializeTaskTypeToggle();
    startRealTimeClock();
    initializeUnscheduledTaskListEventListeners(unscheduledTaskEventCallbacks);
    initializeModalEventListeners(unscheduledTaskEventCallbacks);
    initializeClearTasksHandlers();

    // Wire up sync status indicator + refresh after sync
    unsubscribeSyncStatus = onSyncStatusChange((status) => {
        updateSyncStatusUI(status);
        if (status === 'synced') {
            refreshFromStorage().catch((err) => {
                logger.error('Failed to refresh tasks after sync:', err);
            });
        }
    });

    const refreshFromExternalChange = () => {
        refreshFromStorage().catch((err) => {
            logger.error('Failed to refresh tasks after external change:', err);
        });
    };

    const syncOnFocus = () => {
        triggerSync({ respectCooldown: true }).catch((err) => {
            logger.error('Failed to sync tasks after window focus:', err);
        });
    };

    document.addEventListener(
        'visibilitychange',
        () => {
            if (!document.hidden) {
                refreshFromExternalChange();
            }
        },
        { signal }
    );

    window.addEventListener('focus', syncOnFocus, { signal });

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

    window.addEventListener(
        'beforeunload',
        () => {
            clearInterval(activeTaskColorInterval);
        },
        { signal }
    );
}

document.addEventListener('DOMContentLoaded', async () => {
    // Wire up room code badge click once (outside initAndBootApp to avoid accumulation)
    const roomCodeBadge = document.getElementById('room-code-badge');
    if (roomCodeBadge) {
        roomCodeBadge.addEventListener('click', () => {
            showRoomEntryScreen(initAndBootApp);
        });
    }

    const syncStatusIndicator = document.getElementById('sync-status-indicator');
    if (syncStatusIndicator) {
        syncStatusIndicator.addEventListener('click', () => {
            triggerSync().catch((err) => {
                logger.error('Failed to sync tasks after manual sync request:', err);
            });
        });
    }

    initializeSettingsModalListeners(() => {
        renderSettingsContent();
    });

    const activeRoom = getActiveRoom();
    if (!activeRoom) {
        showRoomEntryScreen(initAndBootApp);
        return;
    }
    await initAndBootApp(activeRoom);
});

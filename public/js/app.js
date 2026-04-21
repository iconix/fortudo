// Orchestrator: public/js/app.js
import {
    updateTaskState,
    getTaskState,
    resetAllConfirmingDeleteFlags,
    getSortedUnscheduledTasks
} from './tasks/manager.js';
import { initializeModalEventListeners } from './modal-manager.js';
import {
    extractTaskFormData,
    resetTaskFormPreviewState,
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
    getSuggestedFormStartTime,
    updateStartTimeField,
    initializePageEventListeners,
    refreshStartTimeField,
    initializeTaskTypeToggle,
    startRealTimeClock,
    initializeUnscheduledTaskListEventListeners
} from './dom-renderer.js';
import {
    loadActivitiesState,
    loadRunningActivity,
    getRunningActivity,
    stopTimerAt
} from './activities/manager.js';
import { syncActivitiesUI, renderTodayActivities } from './activities/ui-handlers.js';
import { syncTimerFormState } from './activities/timer-ui.js';
import {
    createActivityAppCallbacks,
    initializeActivityUi,
    syncRestoredRunningTimer
} from './activities/app-wiring.js';
import { createRoomSessionLifecycle } from './app-lifecycle.js';
import { prepareStorage, loadTasks } from './storage.js';
import { loadTaxonomy } from './taxonomy/taxonomy-store.js';
import { isActivitiesEnabled, loadSettings } from './settings-manager.js';
import { initializeSettingsModalListeners, renderSettingsContent } from './settings-renderer.js';
import { refreshTaskCategoryDropdownUI } from './settings/taxonomy-settings.js';
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

/** @type {{ refreshFromStorage: () => Promise<void>, start: ({ signal }: { signal: AbortSignal }) => void, stop: () => void } | null} */
let roomSessionLifecycle = null;

/** @type {() => void} */
let refreshTaskDisplays = () => {};

function refreshTaxonomyUI() {
    refreshTaskCategoryDropdownUI();
    refreshTaskDisplays();
}

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

async function loadAppState() {
    await loadTasksIntoState();
    if (isActivitiesEnabled()) {
        await loadActivitiesState();
        await loadRunningActivity();
    }
}

/**
 * Initialize storage and boot the main app UI.
 * @param {string} roomCode
 */
async function initAndBootApp(roomCode) {
    if (roomSessionLifecycle) {
        roomSessionLifecycle.stop();
        roomSessionLifecycle = null;
    }
    if (appLifecycleAbortController) {
        appLifecycleAbortController.abort();
    }
    appLifecycleAbortController = new AbortController();
    const { signal } = appLifecycleAbortController;

    showMainApp(roomCode);

    // Initialize storage (with optional CouchDB sync)
    const couchDbUrl = COUCHDB_URL || null;
    const storageRoomCode = getStorageRoomCode(roomCode);
    const remoteUrl = couchDbUrl ? `${couchDbUrl}/fortudo-${storageRoomCode}` : null;
    await prepareStorage(storageRoomCode, {}, remoteUrl);

    // Load settings before any UI checks that depend on cached flags.
    await loadSettings();
    syncActivitiesUI(isActivitiesEnabled());

    // Load and initialize state
    await loadAppState();
    await loadTaxonomy();

    // Create callback objects
    const scheduledTaskEventCallbacks = createScheduledTaskCallbacks();
    const unscheduledTaskEventCallbacks = createUnscheduledTaskCallbacks();
    refreshTaskDisplays = () => {
        const allTasks = getTaskState();
        renderTasks(
            allTasks.filter((task) => task.type === 'scheduled'),
            scheduledTaskEventCallbacks
        );
        renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
        renderTodayActivities(isActivitiesEnabled());
        refreshActiveTaskColor(allTasks);
        refreshCurrentGapHighlight();
    };

    const appCallbacks = createActivityAppCallbacks({
        getActivitiesEnabled: () => isActivitiesEnabled(),
        refreshUI,
        resetAllConfirmingDeleteFlags,
        focusTaskDescriptionInput,
        resetTaskFormPreviewState,
        initializeTaskTypeToggle,
        handleTaskSubmit: async (taskFormElement) => {
            const taskData = extractTaskFormData(taskFormElement);
            if (!taskData) {
                focusTaskDescriptionInput();
                return;
            }
            const overlapEl = document.getElementById('overlap-warning');
            const reschedulePreApproved = !!(overlapEl && overlapEl.textContent.trim());
            await handleAddTaskProcess(taskFormElement, taskData, {
                reschedulePreApproved
            });
        }
    });

    roomSessionLifecycle = createRoomSessionLifecycle({
        loadAppState,
        refreshUI,
        getActivitiesEnabled: () => isActivitiesEnabled(),
        syncRestoredRunningTimer,
        getTaskState,
        refreshActiveTaskColor,
        refreshCurrentGapHighlight,
        refreshStartTimeField,
        getRunningActivity,
        stopTimerAt,
        syncTimerFormState,
        refreshTaskDisplays,
        onSyncStatusChange,
        updateSyncStatusUI,
        triggerSync,
        logger
    });

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
                    shouldWarn: () => {
                        const selectedTaskType = taskFormElement?.querySelector(
                            'input[name="task-type"]:checked'
                        );
                        return (
                            selectedTaskType instanceof HTMLInputElement &&
                            selectedTaskType.value !== 'activity'
                        );
                    },
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
                initializeCategoryDropdownListener();
                refreshTaxonomyUI();
            }
        }
    }

    initializePageEventListeners(appCallbacks, taskFormElement);
    initializeTaskTypeToggle();
    initializeActivityUi({
        signal,
        refreshUI,
        refreshTaskDisplays,
        getActivitiesEnabled: () => isActivitiesEnabled()
    });
    startRealTimeClock();
    initializeUnscheduledTaskListEventListeners(unscheduledTaskEventCallbacks);
    initializeModalEventListeners(unscheduledTaskEventCallbacks);
    initializeClearTasksHandlers();
    roomSessionLifecycle.start({ signal });

    // Initial render
    refreshTaskDisplays();
    const restoredRunningActivity = isActivitiesEnabled() ? getRunningActivity() : null;
    if (restoredRunningActivity) {
        syncRestoredRunningTimer(isActivitiesEnabled());

        const activityToggle = document.getElementById('activity-toggle-option');
        if (activityToggle) {
            activityToggle.classList.add('ring-2', 'ring-sky-400/50');
            setTimeout(() => {
                activityToggle.classList.remove('ring-2', 'ring-sky-400/50');
            }, 3000);
        }
    }

    const suggested = getSuggestedFormStartTime();
    logger.debug('initAndBootApp - getSuggestedFormStartTime() returned:', suggested);
    updateStartTimeField(suggested, true);

    focusTaskDescriptionInput();
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
        renderSettingsContent({
            onTaxonomyChanged: () => {
                refreshTaxonomyUI();
            }
        });
    });

    const activeRoom = getActiveRoom();
    if (!activeRoom) {
        showRoomEntryScreen(initAndBootApp);
        return;
    }
    await initAndBootApp(activeRoom);
});

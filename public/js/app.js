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
    focusTaskDescriptionInput
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
    getActiveRoom,
    setActiveRoom,
    addRoom,
    generateRoomCode,
    getSavedRooms
} from './room-manager.js';
import { onSyncStatusChange } from './sync-manager.js';

/**
 * Show the room entry screen and populate saved rooms.
 */
function showRoomEntryScreen() {
    const roomEntryScreen = document.getElementById('room-entry-screen');
    const mainApp = document.getElementById('main-app');
    if (roomEntryScreen) roomEntryScreen.classList.remove('hidden');
    if (mainApp) mainApp.classList.add('hidden');

    // Populate saved rooms
    const savedRooms = getSavedRooms();
    const savedRoomsList = document.getElementById('saved-rooms-list');
    const savedRoomsButtons = document.getElementById('saved-rooms-buttons');
    if (savedRooms.length > 0 && savedRoomsList && savedRoomsButtons) {
        savedRoomsList.classList.remove('hidden');
        savedRoomsButtons.innerHTML = savedRooms
            .map(
                (code) =>
                    `<button type="button" class="saved-room-btn px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-sm text-slate-300 transition-colors" data-room="${code}">${code}</button>`
            )
            .join('');
    }

    // Wire up room entry form
    const roomEntryForm = document.getElementById('room-entry-form');
    const roomCodeInput = document.getElementById('room-code-input');
    const generateBtn = document.getElementById('generate-room-btn');

    if (generateBtn && roomCodeInput) {
        generateBtn.addEventListener('click', () => {
            roomCodeInput.value = generateRoomCode();
        });
    }

    if (roomEntryForm && roomCodeInput) {
        roomEntryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = roomCodeInput.value.trim().toLowerCase();
            if (code) {
                await enterRoom(code);
            }
        });
    }

    // Wire up saved room buttons
    if (savedRoomsButtons) {
        savedRoomsButtons.addEventListener('click', async (e) => {
            const btn = e.target.closest('.saved-room-btn');
            if (btn) {
                const code = btn.getAttribute('data-room');
                if (code) {
                    await enterRoom(code);
                }
            }
        });
    }
}

/**
 * Enter a room: set active, save to list, init storage, and boot the app.
 * @param {string} roomCode
 */
async function enterRoom(roomCode) {
    setActiveRoom(roomCode);
    addRoom(roomCode);
    await initAndBootApp(roomCode);
}

/**
 * Initialize storage and boot the main app UI.
 * @param {string} roomCode
 */
async function initAndBootApp(roomCode) {
    // Hide room entry, show main app
    const roomEntryScreen = document.getElementById('room-entry-screen');
    const mainApp = document.getElementById('main-app');
    if (roomEntryScreen) roomEntryScreen.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');

    // Update room code display
    const roomCodeDisplay = document.getElementById('room-code-display');
    if (roomCodeDisplay) roomCodeDisplay.textContent = roomCode;

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

    // Wire up room code badge click to switch rooms
    const roomCodeBadge = document.getElementById('room-code-badge');
    if (roomCodeBadge) {
        roomCodeBadge.addEventListener('click', () => {
            showRoomEntryScreen();
        });
    }

    // Initial render
    const allTasks = getTaskState();
    renderTasks(
        allTasks.filter((t) => t.type === 'scheduled'),
        scheduledTaskEventCallbacks
    );
    renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);

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

/**
 * Update the sync status UI indicator.
 * @param {string} status - 'idle' | 'syncing' | 'synced' | 'error' | 'unsynced'
 */
function updateSyncStatusUI(status) {
    const icon = document.getElementById('sync-status-icon');
    const text = document.getElementById('sync-status-text');
    if (!icon || !text) return;

    const configs = {
        idle: { icon: 'fa-solid fa-cloud', color: 'text-slate-500', label: 'Local' },
        syncing: { icon: 'fa-solid fa-rotate fa-spin', color: 'text-blue-400', label: 'Syncing' },
        synced: { icon: 'fa-solid fa-cloud-arrow-up', color: 'text-teal-400', label: 'Synced' },
        error: { icon: 'fa-solid fa-cloud-exclamation', color: 'text-red-400', label: 'Error' },
        unsynced: {
            icon: 'fa-solid fa-cloud-arrow-up',
            color: 'text-amber-400',
            label: 'Pending'
        }
    };

    const config = configs[status] || configs.idle;
    icon.className = `${config.icon} ${config.color}`;
    text.className = config.color;
    text.textContent = config.label;
}

document.addEventListener('DOMContentLoaded', async () => {
    const activeRoom = getActiveRoom();
    if (!activeRoom) {
        showRoomEntryScreen();
        return;
    }
    await initAndBootApp(activeRoom);
});

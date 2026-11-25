import { setActiveRoom, addRoom, generateRoomCode, getSavedRooms } from './room-manager.js';

/**
 * Show the room entry screen and populate saved rooms.
 * @param {Function} onEnterRoom - Callback invoked with room code when user enters a room
 */
export function showRoomEntryScreen(onEnterRoom) {
    const roomEntryScreen = document.getElementById('room-entry-screen');
    const mainApp = document.getElementById('main-app');
    if (roomEntryScreen) {
        roomEntryScreen.classList.remove('hidden');
        document.getElementById('startup-fallback')?.remove();
    }
    if (mainApp) mainApp.classList.add('hidden');

    const savedRooms = getSavedRooms();
    const savedRoomsList = document.getElementById('saved-rooms-list');
    const savedRoomsButtons = document.getElementById('saved-rooms-buttons');
    if (savedRooms.length > 0 && savedRoomsList && savedRoomsButtons) {
        savedRoomsList.classList.remove('hidden');
        savedRoomsButtons.replaceChildren();
        for (const code of savedRooms) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className =
                'saved-room-btn px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-sm text-slate-300 transition-colors';
            btn.dataset.room = code;
            btn.textContent = code;
            savedRoomsButtons.appendChild(btn);
        }
    }

    const roomEntryForm = document.getElementById('room-entry-form');
    const roomCodeInput = document.getElementById('room-code-input');
    const generateBtn = document.getElementById('generate-room-btn');

    if (generateBtn && roomCodeInput) {
        generateBtn.onclick = () => {
            roomCodeInput.value = generateRoomCode();
        };
    }

    if (roomEntryForm && roomCodeInput) {
        roomEntryForm.onsubmit = async (e) => {
            e.preventDefault();
            const code = roomCodeInput.value.trim().toLowerCase();
            if (code) {
                await enterRoom(code, onEnterRoom);
            }
        };
    }

    if (savedRoomsButtons) {
        savedRoomsButtons.onclick = async (e) => {
            const code = e.target.closest('.saved-room-btn')?.dataset.room;
            if (code) {
                await enterRoom(code, onEnterRoom);
            }
        };
    }
}

async function enterRoom(roomCode, onEnterRoom) {
    setActiveRoom(roomCode);
    addRoom(roomCode);
    await onEnterRoom(roomCode);
}

/**
 * Show the main app and hide the room entry screen.
 * @param {string} roomCode - The active room code to display
 */
export function showMainApp(roomCode) {
    const roomEntryScreen = document.getElementById('room-entry-screen');
    const mainApp = document.getElementById('main-app');
    if (roomEntryScreen) roomEntryScreen.classList.add('hidden');
    if (mainApp) {
        mainApp.classList.remove('hidden');
        document.getElementById('startup-fallback')?.remove();
    }

    const roomCodeDisplay = document.getElementById('room-code-display');
    if (roomCodeDisplay) roomCodeDisplay.textContent = roomCode;
}

/**
 * Update the sync status UI indicator.
 * @param {string} status - Current transport/contract state
 */
export function updateSyncStatusUI(status) {
    const icon = document.getElementById('sync-status-icon');
    const text = document.getElementById('sync-status-text');
    const indicator = document.getElementById('sync-status-indicator');
    if (!icon || !text || !indicator) return;

    const configs = {
        checking: {
            icon: 'fa-solid fa-rotate fa-spin',
            color: 'text-sky-400',
            label: 'Connecting'
        },
        'preparation-error': {
            icon: 'fa-solid fa-triangle-exclamation',
            color: 'text-rose-400',
            label: 'Startup error'
        },
        'replica-replaced': {
            icon: 'fa-solid fa-rotate',
            color: 'text-violet-400',
            label: 'Reload room'
        },
        idle: {
            icon: 'fa-solid fa-cloud',
            color: 'text-slate-400 sm:text-slate-500',
            label: 'Local'
        },
        syncing: { icon: 'fa-solid fa-rotate fa-spin', color: 'text-sky-400', label: 'Syncing' },
        synced: {
            icon: 'fa-solid fa-cloud-arrow-up',
            color: 'text-emerald-400',
            label: 'Synced'
        },
        error: { icon: 'fa-solid fa-triangle-exclamation', color: 'text-rose-400', label: 'Error' },
        offline: { icon: 'fa-solid fa-link-slash', color: 'text-slate-400', label: 'Offline' },
        unsynced: {
            icon: 'fa-solid fa-cloud-arrow-up',
            color: 'text-amber-400',
            label: 'Pending'
        },
        compatible: {
            icon: 'fa-solid fa-shield-halved',
            color: 'text-emerald-400',
            label: 'Sync ready'
        },
        'missing-validator': {
            icon: 'fa-solid fa-shield',
            color: 'text-amber-400',
            label: 'Sync protection missing'
        },
        'validator-mismatch': {
            icon: 'fa-solid fa-shield-halved',
            color: 'text-rose-400',
            label: 'Sync setup error'
        },
        unprovisioned: {
            icon: 'fa-solid fa-cloud-slash',
            color: 'text-slate-400',
            label: 'Sync not provisioned'
        },
        'update-required': {
            icon: 'fa-solid fa-arrows-rotate',
            color: 'text-amber-400',
            label: 'Update required'
        },
        'update-required-available': {
            icon: 'fa-solid fa-arrows-rotate',
            color: 'text-violet-400',
            label: 'Reload to update'
        },
        'recovery-required': {
            icon: 'fa-solid fa-triangle-exclamation',
            color: 'text-rose-400',
            label: 'Recovery required'
        },
        'audit-error': {
            icon: 'fa-solid fa-shield-halved',
            color: 'text-rose-400',
            label: 'Sync check failed'
        }
    };

    const displayedStatus = indicator.getAttribute('aria-busy') === 'true' ? 'syncing' : status;
    const config = configs[displayedStatus] || configs.idle;
    icon.className = `${config.icon} ${config.color}`;
    text.className = config.color;
    text.textContent = config.label;
    indicator.disabled = displayedStatus === 'syncing';
    indicator.title = displayedStatus === 'syncing' ? 'Syncing...' : 'Sync now';
}

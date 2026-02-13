import { setActiveRoom, addRoom, generateRoomCode, getSavedRooms } from '../room-manager.js';

/**
 * Show the room entry screen and populate saved rooms.
 * @param {Function} onEnterRoom - Callback invoked with room code when user enters a room
 */
export function showRoomEntryScreen(onEnterRoom) {
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
                await enterRoom(code, onEnterRoom);
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
                    await enterRoom(code, onEnterRoom);
                }
            }
        });
    }
}

/**
 * Enter a room: set active, save to list, and invoke callback.
 * @param {string} roomCode
 * @param {Function} onEnterRoom - Callback to boot the app with the room code
 */
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
    if (mainApp) mainApp.classList.remove('hidden');

    const roomCodeDisplay = document.getElementById('room-code-display');
    if (roomCodeDisplay) roomCodeDisplay.textContent = roomCode;
}

/**
 * Update the sync status UI indicator.
 * @param {string} status - 'idle' | 'syncing' | 'synced' | 'error' | 'unsynced'
 */
export function updateSyncStatusUI(status) {
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

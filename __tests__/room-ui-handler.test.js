/**
 * @jest-environment jsdom
 */

import {
    showRoomEntryScreen,
    showMainApp,
    updateSyncStatusUI
} from '../public/js/handlers/room-ui-handler.js';

// Mock room-manager.js
jest.mock('../public/js/room-manager.js', () => ({
    getActiveRoom: jest.fn(),
    setActiveRoom: jest.fn(),
    addRoom: jest.fn(),
    generateRoomCode: jest.fn(() => 'fox-123'),
    getSavedRooms: jest.fn(() => [])
}));

import { getSavedRooms, setActiveRoom, addRoom } from '../public/js/room-manager.js';

function setupRoomDOM() {
    document.body.innerHTML = `
        <div id="room-entry-screen" class="hidden">
            <form id="room-entry-form">
                <input type="text" id="room-code-input" />
                <button type="button" id="generate-room-btn"></button>
            </form>
            <div id="saved-rooms-list" class="hidden">
                <div id="saved-rooms-buttons"></div>
            </div>
        </div>
        <div id="main-app" class="hidden">
            <span id="room-code-badge"><span id="room-code-display"></span></span>
            <span id="sync-status-indicator">
                <i id="sync-status-icon" class="fa-solid fa-cloud text-slate-500"></i>
                <span id="sync-status-text" class="text-slate-500">Local</span>
            </span>
        </div>
    `;
}

describe('Room UI Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupRoomDOM();
    });

    describe('showRoomEntryScreen', () => {
        test('shows room entry screen and hides main app', () => {
            showRoomEntryScreen(jest.fn());
            expect(document.getElementById('room-entry-screen').classList.contains('hidden')).toBe(
                false
            );
            expect(document.getElementById('main-app').classList.contains('hidden')).toBe(true);
        });

        test('populates saved rooms when they exist', () => {
            getSavedRooms.mockReturnValue(['fox-123', 'owl-456']);
            showRoomEntryScreen(jest.fn());

            const savedRoomsList = document.getElementById('saved-rooms-list');
            expect(savedRoomsList.classList.contains('hidden')).toBe(false);

            const buttons = document.querySelectorAll('.saved-room-btn');
            expect(buttons).toHaveLength(2);
            expect(buttons[0].getAttribute('data-room')).toBe('fox-123');
            expect(buttons[1].getAttribute('data-room')).toBe('owl-456');
        });

        test('does not show saved rooms section when none exist', () => {
            getSavedRooms.mockReturnValue([]);
            showRoomEntryScreen(jest.fn());

            const savedRoomsList = document.getElementById('saved-rooms-list');
            expect(savedRoomsList.classList.contains('hidden')).toBe(true);
        });

        test('generate button populates room code input', () => {
            showRoomEntryScreen(jest.fn());

            const generateBtn = document.getElementById('generate-room-btn');
            generateBtn.dispatchEvent(new Event('click'));

            const input = document.getElementById('room-code-input');
            expect(input.value).toBe('fox-123');
        });

        test('form submission calls onEnterRoom with room code', async () => {
            const onEnterRoom = jest.fn(() => Promise.resolve());
            showRoomEntryScreen(onEnterRoom);

            const input = document.getElementById('room-code-input');
            input.value = 'Test-Room';

            const form = document.getElementById('room-entry-form');
            form.dispatchEvent(new Event('submit', { cancelable: true }));
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(setActiveRoom).toHaveBeenCalledWith('test-room');
            expect(addRoom).toHaveBeenCalledWith('test-room');
            expect(onEnterRoom).toHaveBeenCalledWith('test-room');
        });

        test('clicking saved room button calls onEnterRoom', async () => {
            getSavedRooms.mockReturnValue(['fox-123']);
            const onEnterRoom = jest.fn(() => Promise.resolve());
            showRoomEntryScreen(onEnterRoom);

            const btn = document.querySelector('.saved-room-btn');
            btn.dispatchEvent(new Event('click', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(onEnterRoom).toHaveBeenCalledWith('fox-123');
        });
    });

    describe('showMainApp', () => {
        test('hides room entry screen and shows main app', () => {
            showMainApp('fox-123');
            expect(document.getElementById('room-entry-screen').classList.contains('hidden')).toBe(
                true
            );
            expect(document.getElementById('main-app').classList.contains('hidden')).toBe(false);
        });

        test('displays room code in badge', () => {
            showMainApp('fox-123');
            expect(document.getElementById('room-code-display').textContent).toBe('fox-123');
        });
    });

    describe('updateSyncStatusUI', () => {
        test('updates icon and text for syncing status', () => {
            updateSyncStatusUI('syncing');
            const icon = document.getElementById('sync-status-icon');
            const text = document.getElementById('sync-status-text');
            expect(icon.className).toContain('fa-rotate');
            expect(icon.className).toContain('text-blue-400');
            expect(text.textContent).toBe('Syncing');
        });

        test('updates icon and text for synced status', () => {
            updateSyncStatusUI('synced');
            const text = document.getElementById('sync-status-text');
            expect(text.textContent).toBe('Synced');
            expect(text.className).toContain('text-teal-400');
        });

        test('updates icon and text for error status', () => {
            updateSyncStatusUI('error');
            const text = document.getElementById('sync-status-text');
            expect(text.textContent).toBe('Error');
            expect(text.className).toContain('text-red-400');
        });

        test('falls back to idle for unknown status', () => {
            updateSyncStatusUI('unknown-status');
            const text = document.getElementById('sync-status-text');
            expect(text.textContent).toBe('Local');
        });

        test('handles missing DOM elements gracefully', () => {
            document.body.innerHTML = '';
            expect(() => updateSyncStatusUI('syncing')).not.toThrow();
        });
    });
});

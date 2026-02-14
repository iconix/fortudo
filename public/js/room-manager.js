import { logger } from './utils.js';

const ACTIVE_ROOM_KEY = 'fortudo-active-room';
const SAVED_ROOMS_KEY = 'fortudo-rooms';

/**
 * Generate a random room code in the format word-NNN.
 * @returns {string} A room code like "fox-742"
 */
export function generateRoomCode() {
    const words = [
        'fox',
        'owl',
        'bee',
        'elk',
        'ant',
        'bat',
        'cat',
        'dog',
        'emu',
        'fly',
        'gnu',
        'hen',
        'jay',
        'koi',
        'ram',
        'yak'
    ];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    return `${word}-${num}`;
}

/**
 * Get the currently active room code from localStorage.
 * @returns {string|null}
 */
export function getActiveRoom() {
    return localStorage.getItem(ACTIVE_ROOM_KEY);
}

/**
 * Set the active room code in localStorage.
 * @param {string} roomCode
 */
export function setActiveRoom(roomCode) {
    localStorage.setItem(ACTIVE_ROOM_KEY, roomCode);
}

/**
 * Get all saved room codes from localStorage.
 * @returns {string[]}
 */
export function getSavedRooms() {
    const rooms = localStorage.getItem(SAVED_ROOMS_KEY);
    if (rooms) {
        try {
            return JSON.parse(rooms);
        } catch (err) {
            logger.error('Error parsing saved rooms:', err);
            return [];
        }
    }
    return [];
}

/**
 * Add a room code to the saved rooms list. No-op if already present.
 * @param {string} roomCode
 */
export function addRoom(roomCode) {
    const rooms = getSavedRooms();
    if (!rooms.includes(roomCode)) {
        rooms.push(roomCode);
        localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(rooms));
    }
}

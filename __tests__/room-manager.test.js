/**
 * @jest-environment jsdom
 */

import {
    generateRoomCode,
    getActiveRoom,
    setActiveRoom,
    getSavedRooms,
    addRoom
} from '../public/js/room-manager.js';

// Mock storage.js
jest.mock('../public/js/storage.js', () => ({
    prepareStorage: jest.fn(() => Promise.resolve()),
    initStorage: jest.fn(),
    migrateDocTypes: jest.fn(() => Promise.resolve()),
    destroyStorage: jest.fn(),
    saveTasks: jest.fn(),
    putTask: jest.fn(),
    deleteTask: jest.fn(),
    loadTasks: jest.fn(() => [])
}));

let mockStore = {};

beforeEach(() => {
    mockStore = {};
    Object.defineProperty(window, 'localStorage', {
        value: {
            getItem: jest.fn((key) => mockStore[key] || null),
            setItem: jest.fn((key, value) => {
                mockStore[key] = value;
            }),
            removeItem: jest.fn((key) => {
                delete mockStore[key];
            }),
            clear: jest.fn(() => {
                mockStore = {};
            })
        },
        writable: true
    });
});

describe('Room Manager', () => {
    describe('generateRoomCode', () => {
        test('generates a string', () => {
            const code = generateRoomCode();
            expect(typeof code).toBe('string');
            expect(code.length).toBeGreaterThan(0);
        });

        test('generates room codes in the expected format', () => {
            const code = generateRoomCode();
            expect(code).toMatch(/^[a-z]{3}-\d{3}$/);
        });

        test('produces different codes when randomness changes', () => {
            const randomSpy = jest.spyOn(Math, 'random');
            randomSpy
                .mockReturnValueOnce(0)
                .mockReturnValueOnce(0)
                .mockReturnValueOnce(0.999)
                .mockReturnValueOnce(0.999);

            const firstCode = generateRoomCode();
            const secondCode = generateRoomCode();

            expect(firstCode).toBe('fox-100');
            expect(secondCode).toBe('yak-999');
            expect(firstCode).not.toBe(secondCode);

            randomSpy.mockRestore();
        });
    });

    describe('getActiveRoom / setActiveRoom', () => {
        test('returns null when no active room', () => {
            expect(getActiveRoom()).toBeNull();
        });

        test('returns active room after setting', () => {
            setActiveRoom('fox-742');
            expect(getActiveRoom()).toBe('fox-742');
        });
    });

    describe('getSavedRooms / addRoom', () => {
        test('returns empty array when no rooms saved', () => {
            expect(getSavedRooms()).toEqual([]);
        });

        test('adds room to saved list', () => {
            addRoom('fox-742');
            expect(getSavedRooms()).toContain('fox-742');
        });

        test('does not add duplicate rooms', () => {
            addRoom('fox-742');
            addRoom('fox-742');
            expect(getSavedRooms()).toHaveLength(1);
        });
    });
});

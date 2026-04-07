/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));
window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn(),
    waitForIdleSync: jest.fn(() => Promise.resolve()),
    teardownSync: jest.fn(),
    triggerSync: jest.fn(() => Promise.resolve()),
    onSyncStatusChange: jest.fn()
}));

import { initStorage, destroyStorage, loadConfig, putConfig } from '../public/js/storage.js';
import {
    loadSettings,
    isActivitiesEnabled,
    setActivitiesEnabled,
    SETTINGS_CONFIG_ID
} from '../public/js/settings-manager.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `settings-room-${testDbCounter++}-${Date.now()}`;
}

async function initAndLoadSettings() {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadSettings();
}

afterEach(async () => {
    localStorage.clear();
    await destroyStorage();
});

describe('settings-manager', () => {
    test('loadSettings defaults to activities disabled when no config exists', async () => {
        await initAndLoadSettings();

        expect(isActivitiesEnabled()).toBe(false);
    });

    test('loadSettings reads activitiesEnabled from PouchDB config doc', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled: true });
        await loadSettings();

        expect(isActivitiesEnabled()).toBe(true);
    });

    test('loadSettings migrates from localStorage when no PouchDB config exists', async () => {
        localStorage.setItem('fortudo-activities-enabled', 'true');
        await initAndLoadSettings();

        expect(isActivitiesEnabled()).toBe(true);

        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config).not.toBeNull();
        expect(config.activitiesEnabled).toBe(true);
    });

    test('loadSettings removes localStorage key after migration', async () => {
        localStorage.setItem('fortudo-activities-enabled', 'true');
        await initAndLoadSettings();

        expect(localStorage.getItem('fortudo-activities-enabled')).toBeNull();
    });

    test('loadSettings prefers PouchDB config over localStorage', async () => {
        localStorage.setItem('fortudo-activities-enabled', 'true');
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled: false });
        await loadSettings();

        expect(isActivitiesEnabled()).toBe(false);
    });

    test('isActivitiesEnabled returns cached value synchronously', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled: true });
        await loadSettings();

        const result = isActivitiesEnabled();
        expect(result).toBe(true);
        expect(typeof result).toBe('boolean');
    });

    test('setActivitiesEnabled updates cache and persists to PouchDB', async () => {
        await initAndLoadSettings();

        await setActivitiesEnabled(true);
        expect(isActivitiesEnabled()).toBe(true);

        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config.activitiesEnabled).toBe(true);
    });

    test('setActivitiesEnabled(false) after true updates both cache and PouchDB', async () => {
        await initAndLoadSettings();

        await setActivitiesEnabled(true);
        await setActivitiesEnabled(false);
        expect(isActivitiesEnabled()).toBe(false);

        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config.activitiesEnabled).toBe(false);
    });

    test('handles corrupted localStorage value gracefully during migration', async () => {
        localStorage.setItem('fortudo-activities-enabled', 'not-a-boolean');
        await initAndLoadSettings();

        expect(isActivitiesEnabled()).toBe(false);
    });
});

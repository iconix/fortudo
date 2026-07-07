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

import * as storage from '../public/js/storage.js';
import { initStorage, destroyStorage, loadConfig, putConfig } from '../public/js/storage.js';
import {
    loadSettings,
    isOnboardingDismissed,
    isOnboardingSnoozed,
    isActivitiesEnabled,
    setActivitiesEnabled,
    setOnboardingDismissed,
    snoozeOnboarding,
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

    test('loadSettings reads onboardingDismissed from PouchDB config doc', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, onboardingDismissed: true });
        await loadSettings();

        expect(isOnboardingDismissed()).toBe(true);
    });

    test('loadSettings reads active onboarding snooze from PouchDB config doc', async () => {
        const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, onboardingSnoozedUntil: future });
        await loadSettings();

        expect(isOnboardingSnoozed()).toBe(true);
    });

    test('loadSettings ignores expired onboarding snooze from PouchDB config doc', async () => {
        const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, onboardingSnoozedUntil: past });
        await loadSettings();

        expect(isOnboardingSnoozed()).toBe(false);
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

    test('loadSettings preserves legacy localStorage key when migration persistence fails', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        localStorage.setItem('fortudo-activities-enabled', 'true');

        const putConfigSpy = jest
            .spyOn(storage, 'putConfig')
            .mockRejectedValueOnce(new Error('disk full'));

        await expect(loadSettings()).rejects.toThrow('disk full');
        expect(localStorage.getItem('fortudo-activities-enabled')).toBe('true');
        expect(isActivitiesEnabled()).toBe(true);

        putConfigSpy.mockRestore();
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

    test('setActivitiesEnabled preserves onboardingDismissed in PouchDB', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, onboardingDismissed: true });
        await loadSettings();

        await setActivitiesEnabled(true);

        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config.activitiesEnabled).toBe(true);
        expect(config.onboardingDismissed).toBe(true);
    });

    test('setActivitiesEnabled(false) after true updates both cache and PouchDB', async () => {
        await initAndLoadSettings();

        await setActivitiesEnabled(true);
        await setActivitiesEnabled(false);
        expect(isActivitiesEnabled()).toBe(false);

        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config.activitiesEnabled).toBe(false);
    });

    test('setOnboardingDismissed updates cache and persists to PouchDB', async () => {
        await initAndLoadSettings();

        await setOnboardingDismissed(true);

        expect(isOnboardingDismissed()).toBe(true);
        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config.onboardingDismissed).toBe(true);
        expect(config.activitiesEnabled).toBe(false);
    });

    test('snoozeOnboarding persists a 24-hour snooze window', async () => {
        const now = new Date('2026-07-06T12:00:00.000Z');
        await initAndLoadSettings();

        await snoozeOnboarding(now);

        expect(isOnboardingSnoozed(now)).toBe(true);
        expect(isOnboardingSnoozed(new Date('2026-07-07T12:00:01.000Z'))).toBe(false);
        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config.onboardingSnoozedUntil).toBe('2026-07-07T12:00:00.000Z');
        expect(config.onboardingDismissed).toBe(false);
    });

    test('handles corrupted localStorage value gracefully during migration', async () => {
        localStorage.setItem('fortudo-activities-enabled', 'not-a-boolean');
        await initAndLoadSettings();

        expect(isActivitiesEnabled()).toBe(false);
    });
});

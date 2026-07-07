import { loadConfig, putConfig } from './storage.js';

export const SETTINGS_CONFIG_ID = 'config-settings';
const LEGACY_STORAGE_KEY = 'fortudo-activities-enabled';
const ONBOARDING_SNOOZE_MS = 24 * 60 * 60 * 1000;

let activitiesEnabled = false;
let onboardingDismissed = false;
let onboardingSnoozedUntil = null;

function getSettingsConfig() {
    return {
        id: SETTINGS_CONFIG_ID,
        activitiesEnabled,
        onboardingDismissed,
        onboardingSnoozedUntil
    };
}

/**
 * Load settings from PouchDB config doc, migrating from localStorage if needed.
 * Must be called after initStorage/prepareStorage and before any isActivitiesEnabled() check.
 */
export async function loadSettings() {
    const config = await loadConfig(SETTINGS_CONFIG_ID);
    if (config) {
        activitiesEnabled = !!config.activitiesEnabled;
        onboardingDismissed = !!config.onboardingDismissed;
        onboardingSnoozedUntil =
            typeof config.onboardingSnoozedUntil === 'string'
                ? config.onboardingSnoozedUntil
                : null;
        return;
    }

    if (typeof localStorage !== 'undefined') {
        const legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyValue === 'true') {
            activitiesEnabled = true;
            onboardingDismissed = false;
            onboardingSnoozedUntil = null;
            await putConfig(getSettingsConfig());
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            return;
        }

        localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    activitiesEnabled = false;
    onboardingDismissed = false;
    onboardingSnoozedUntil = null;
}

/**
 * Check whether the Activities feature is enabled.
 * Synchronous: reads from in-memory cache populated by loadSettings().
 * @returns {boolean}
 */
export function isActivitiesEnabled() {
    return activitiesEnabled;
}

/**
 * Check whether the Activities onboarding walkthrough was dismissed for this room.
 * Synchronous: reads from in-memory cache populated by loadSettings().
 * @returns {boolean}
 */
export function isOnboardingDismissed() {
    return onboardingDismissed;
}

/**
 * Check whether the Activities onboarding walkthrough is snoozed for this room.
 * Synchronous: reads from in-memory cache populated by loadSettings().
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isOnboardingSnoozed(now = new Date()) {
    if (!onboardingSnoozedUntil) {
        return false;
    }

    const snoozedUntil = new Date(onboardingSnoozedUntil);
    return !Number.isNaN(snoozedUntil.getTime()) && snoozedUntil > now;
}

/**
 * Enable or disable the Activities feature.
 * Updates in-memory cache immediately and persists to PouchDB.
 * @param {boolean} enabled
 */
export async function setActivitiesEnabled(enabled) {
    activitiesEnabled = !!enabled;
    await putConfig(getSettingsConfig());
}

/**
 * Mark the Activities onboarding walkthrough dismissed or available for this room.
 * Updates in-memory cache immediately and persists to PouchDB.
 * @param {boolean} dismissed
 */
export async function setOnboardingDismissed(dismissed) {
    onboardingDismissed = !!dismissed;
    if (onboardingDismissed) {
        onboardingSnoozedUntil = null;
    }
    await putConfig(getSettingsConfig());
}

/**
 * Snooze the Activities onboarding walkthrough for 24 hours in this room.
 * Updates in-memory cache immediately and persists to PouchDB.
 * @param {Date} [now]
 */
export async function snoozeOnboarding(now = new Date()) {
    onboardingSnoozedUntil = new Date(now.getTime() + ONBOARDING_SNOOZE_MS).toISOString();
    await putConfig(getSettingsConfig());
}

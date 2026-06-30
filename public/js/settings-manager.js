import { loadConfig, putConfig } from './storage.js';

export const SETTINGS_CONFIG_ID = 'config-settings';
const LEGACY_STORAGE_KEY = 'fortudo-activities-enabled';

let activitiesEnabled = false;
let onboardingDismissed = false;

function getSettingsConfig() {
    return {
        id: SETTINGS_CONFIG_ID,
        activitiesEnabled,
        onboardingDismissed
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
        return;
    }

    if (typeof localStorage !== 'undefined') {
        const legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyValue === 'true') {
            activitiesEnabled = true;
            onboardingDismissed = false;
            await putConfig(getSettingsConfig());
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            return;
        }

        localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    activitiesEnabled = false;
    onboardingDismissed = false;
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
    await putConfig(getSettingsConfig());
}

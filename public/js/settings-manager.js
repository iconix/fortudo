import { loadConfig, putConfig } from './storage.js';

export const SETTINGS_CONFIG_ID = 'config-settings';
const LEGACY_STORAGE_KEY = 'fortudo-activities-enabled';

let activitiesEnabled = false;

/**
 * Load settings from PouchDB config doc, migrating from localStorage if needed.
 * Must be called after initStorage/prepareStorage and before any isActivitiesEnabled() check.
 */
export async function loadSettings() {
    const config = await loadConfig(SETTINGS_CONFIG_ID);
    if (config) {
        activitiesEnabled = !!config.activitiesEnabled;
        return;
    }

    if (typeof localStorage !== 'undefined') {
        const legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        if (legacyValue === 'true') {
            activitiesEnabled = true;
            await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled: true });
            return;
        }
    }

    activitiesEnabled = false;
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
 * Enable or disable the Activities feature.
 * Updates in-memory cache immediately and persists to PouchDB.
 * @param {boolean} enabled
 */
export async function setActivitiesEnabled(enabled) {
    activitiesEnabled = !!enabled;
    await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled });
}

const STORAGE_KEY = 'fortudo-activities-enabled';

/**
 * Check whether the Activities feature is enabled.
 * @returns {boolean}
 */
export function isActivitiesEnabled() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
}

/**
 * Enable or disable the Activities feature.
 * @param {boolean} enabled
 */
export function setActivitiesEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, String(!!enabled));
}

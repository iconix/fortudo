import { calculateHoursAndMinutes } from '../utils.js';

export const MILLISECONDS_PER_MINUTE = 60000;

/**
 * Returns the exact positive elapsed time between two timestamps.
 * @param {string|Date} startDateTime
 * @param {string|Date} endDateTime
 * @returns {number}
 */
export function getExactDurationMilliseconds(startDateTime, endDateTime) {
    const startMs = new Date(startDateTime).getTime();
    const endMs = new Date(endDateTime).getTime();

    if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) {
        return 0;
    }

    return endMs - startMs;
}

/**
 * Rounds a positive elapsed duration to stored/displayed whole minutes.
 * Positive sub-minute intervals are represented as one minute.
 * @param {number} durationMilliseconds
 * @returns {number}
 */
export function roundDurationMilliseconds(durationMilliseconds) {
    const safeDuration = Number(durationMilliseconds);
    if (!isFinite(safeDuration) || safeDuration <= 0) {
        return 0;
    }

    return Math.max(1, Math.round(safeDuration / MILLISECONDS_PER_MINUTE));
}

/**
 * Calculates the canonical stored duration for an exact timestamp interval.
 * @param {string|Date} startDateTime
 * @param {string|Date} endDateTime
 * @returns {number}
 */
export function calculateStoredDurationMinutes(startDateTime, endDateTime) {
    return roundDurationMilliseconds(getExactDurationMilliseconds(startDateTime, endDateTime));
}

/**
 * Returns exact elapsed time when timestamps are valid, otherwise falls back
 * to the legacy stored whole-minute duration.
 * @param {Object} item
 * @returns {number}
 */
export function getItemDurationMilliseconds(item) {
    const exactDuration = getExactDurationMilliseconds(item?.startDateTime, item?.endDateTime);
    if (exactDuration > 0) {
        return exactDuration;
    }

    return Math.max(0, Number(item?.duration) || 0) * MILLISECONDS_PER_MINUTE;
}

/**
 * Formats an individual activity while retaining visible sub-minute precision.
 * @param {Object} item
 * @returns {string}
 */
export function formatActivityDuration(item) {
    const exactDuration = getExactDurationMilliseconds(item?.startDateTime, item?.endDateTime);

    if (exactDuration > 0 && exactDuration < MILLISECONDS_PER_MINUTE) {
        return '<1m';
    }

    return calculateHoursAndMinutes(item?.duration);
}

// Time utilities and pure functions

// ============================================================================
// DATETIME UTILITIES
// ============================================================================

/**
 * Create a Date object from a date and time string
 * @param {string} timeStr - Time in HH:MM format
 * @param {string} [dateStr] - Date in YYYY-MM-DD format. Defaults to today.
 * @returns {Date} - Date object
 */
export function createDateTime(timeStr, dateStr) {
    if (!dateStr) {
        dateStr = new Date().toISOString().split('T')[0]; // Today in YYYY-MM-DD
    }
    return new Date(`${dateStr}T${timeStr}:00.000`);
}

/**
 * Calculate end DateTime from start DateTime and duration
 * @param {string} startDateTime - Start date and time in ISO format
 * @param {number} duration - Duration in minutes
 * @returns {string} - End date and time in ISO format
 */
export function calculateEndDateTime(startDateTime, duration) {
    const startDate = new Date(startDateTime);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    return endDate.toISOString();
}

/**
 * Extract time portion from DateTime string
 * @param {string} dateTimeStr - DateTime in ISO format
 * @returns {string} - Time in HH:MM format
 */
export function extractTimeFromDateTime(dateTimeStr) {
    const date = new Date(dateTimeStr);
    return date.toTimeString().substring(0, 5);
}

/**
 * Convert legacy time strings to DateTime strings (for migration)
 * @param {string} timeStr - Time in HH:MM format
 * @param {string} [dateStr] - Date in YYYY-MM-DD format. Defaults to today.
 * @returns {string} - DateTime in ISO format
 */
export function timeToDateTime(timeStr, dateStr) {
    if (!dateStr) {
        dateStr = new Date().toISOString().split('T')[0];
    }
    return createDateTime(timeStr, dateStr).toISOString();
}

/**
 * Get task start/end Date objects with DateTime support (backward compatible)
 * @param {Object} task - Task object with either legacy time fields or new DateTime fields
 * @returns {{startDate: Date, endDate: Date}} - Start and end Date objects
 */
export function getTaskDates(task) {
    return {
        startDate: new Date(task.startDateTime),
        endDate: new Date(task.endDateTime)
    };
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Calculate total minutes from a 24-hour time string
 * @param {string} time24Hour - Time in 24-hour format (HH:MM)
 * @returns {number} - Total minutes
 */
export function calculateMinutes(time24Hour) {
    const [hours, minutes] = time24Hour.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Format minutes as hours and minutes string
 * @param {number} minutes - Total minutes
 * @returns {string} - Formatted time string
 */
export function calculateHoursAndMinutes(minutes) {
    let timeStr = '';

    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        timeStr += `${hours}h `;
    }

    const remMinutes = minutes % 60;
    if (remMinutes > 0) {
        timeStr += `${remMinutes}m`;
    } else if (timeStr === '') {
        timeStr = '0m';
    }

    return timeStr.trim();
}

/**
 * Convert minutes to 24-hour time format
 * @param {number} minutes - Total minutes
 * @returns {string} - Time in 24-hour format (HH:MM)
 */
export function calculate24HourTimeFromMinutes(minutes) {
    // mod handles cases where minutes is beyond a day
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Convert a 12-hour time string to 24-hour format
 * @param {string} time12Hour - Time in 12-hour format (HH:MM AM/PM)
 * @returns {string} - Time in 24-hour format (HH:MM)
 */
export function convertTo24HourTime(time12Hour) {
    const match = time12Hour.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) throw new Error('Invalid time format');

    let hours = parseInt(match[1]);
    const minutes = match[2];
    const ampm = match[3].toUpperCase();

    if (ampm === 'PM' && hours < 12) {
        hours += 12;
    }

    if (ampm === 'AM' && hours === 12) {
        hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Convert a 24-hour time string to 12-hour format
 * @param {string} time24Hour - Time in 24-hour format (HH:MM)
 * @returns {string} - Time in 12-hour format (HH:MM AM/PM)
 */
export function convertTo12HourTime(time24Hour) {
    let hours = parseInt(time24Hour.split(':')[0]);
    const minutes = time24Hour.split(':')[1];
    let ampm = 'AM';

    if (hours >= 12) {
        ampm = 'PM';
        hours -= 12;
    }

    if (hours === 0) {
        hours = 12;
    }

    return `${hours}:${minutes} ${ampm}`;
}

/**
 * Gets current time rounded up to closest 5 minutes.
 * @param {Date} [now=new Date()] - Optional date object to use as current time. Defaults to `new Date()`.
 * @returns {string} - Current time in 24-hour format (HH:MM)
 */
export function getCurrentTimeRounded(now = new Date()) {
    const minutes = Math.ceil(now.getMinutes() / 5) * 5;
    const roundedDate = new Date(now.getTime());

    roundedDate.setSeconds(0, 0);
    roundedDate.setMinutes(minutes); // note: this automatically handles >= 60

    return roundedDate.toTimeString().substring(0, 5);
}

/**
 * Simple logger utility for consistent logging across the application
 */
export const logger = {
    error: (message, ...args) => {
        console.error(`[FORTUDO ERROR] ${message}`, ...args);
    },
    warn: (message, ...args) => {
        console.warn(`[FORTUDO WARN] ${message}`, ...args);
    },
    info: (message, ...args) => {
        console.info(`[FORTUDO INFO] ${message}`, ...args);
    },
    debug: (message, ...args) => {
        console.debug(`[FORTUDO DEBUG] ${message}`, ...args);
    }
};

/**
 * Validates task form data for description and duration.
 * @param {string} description - The task description
 * @param {number} duration - The task duration in minutes
 * @param {Function} isValidTaskData - The validation function from task-manager
 * @returns {{isValid: boolean, reason?: string}} Validation result with reason if invalid
 */
export function validateTaskFormData(description, duration, isValidTaskData) {
    return isValidTaskData(description, duration);
}

/**
 * Check if a task is running late (current time is past the task's end time)
 * @param {Object} task - The task object with either legacy time fields or new DateTime fields
 * @param {Date} [now=new Date()] - Optional date object to use as current time. Defaults to `new Date()`.
 * @returns {boolean} - True if the task is running late
 */
export function isTaskRunningLate(task, now = new Date()) {
    // Get task end Date (with backward compatibility)
    const { endDate } = getTaskDates(task);

    // A task is late if the current time 'now' is past its calculated 'endDate'.
    return now > endDate;
}

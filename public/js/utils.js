// Time utilities and pure functions

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
    let hours = parseInt(time12Hour.split(':')[0]);
    const minutes = time12Hour.split(':')[1].split(' ')[0];
    const ampm = time12Hour.split(' ')[1];

    if (ampm.toUpperCase() === 'PM' && hours < 12) {
        hours += 12;
    }

    if (ampm.toUpperCase() === 'AM' && hours === 12) {
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
 * Calculate the end time of a task
 * @param {string} startTime - Start time in 24-hour format (HH:MM)
 * @param {number} duration - Duration in minutes
 * @returns {string} - End time in 24-hour format (HH:MM)
 */
export function calculateEndTime(startTime, duration) {
    const endMinutes = calculateMinutes(startTime) + duration;
    return calculate24HourTimeFromMinutes(endMinutes);
}

/**
 * Gets current time rounded up to closest 5 minutes.
 * @param {Date} [date=new Date()] - Optional date object to use as current time. Defaults to `new Date()`.
 * @returns {string} - Current time in 24-hour format (HH:MM)
 */
export function getCurrentTimeRounded(date = new Date()) {
    const now = date;
    const minutes = Math.ceil(now.getMinutes() / 5) * 5;

    const roundedDate = new Date(now.getTime());

    // Reset seconds and milliseconds to ensure clean rounding for minutes/hours
    roundedDate.setSeconds(0, 0);

    if (minutes === 60) {
        roundedDate.setHours(roundedDate.getHours() + 1);
        roundedDate.setMinutes(0);
    } else {
        roundedDate.setMinutes(minutes);
    }

    return roundedDate.toTimeString().substring(0, 5);
}

/**
 * Format a date as a readable string (e.g., "Monday, January 1")
 * @param {Date} [date=new Date()] - Optional date object to format. Defaults to `new Date()`.
 * @returns {string} - Formatted date string
 */
export function getFormattedDate(date = new Date()) {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Format the current time in 12-hour format with AM/PM
 * @returns {string} - Formatted time string (e.g., "12:00 PM")
 */
export function getFormattedTime() {
    const date = new Date();
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
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

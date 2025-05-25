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
    let minutes = time12Hour.split(':')[1].split(' ')[0];
    let ampm = time12Hour.split(' ')[1];

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
    let minutes = time24Hour.split(':')[1];
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
 * Check if two tasks overlap in time
 * @param {Object} task1 - First task
 * @param {string} task1.startTime - Start time in 24-hour format (HH:MM)
 * @param {string} task1.endTime - End time in 24-hour format (HH:MM)
 * @param {Object} task2 - Second task
 * @param {string} task2.startTime - Start time in 24-hour format (HH:MM)
 * @param {string} task2.endTime - End time in 24-hour format (HH:MM)
 * @returns {boolean} - Whether tasks overlap
 */
export function tasksOverlap(task1, task2) {
    // convert times to minutes past midnight
    const start1 = calculateMinutes(task1.startTime);
    const end1 = calculateMinutes(task1.endTime);
    const start2 = calculateMinutes(task2.startTime);
    const end2 = calculateMinutes(task2.endTime);

    // check if tasks cross midnight
    const task1CrossesMidnight = end1 < start1;
    const task2CrossesMidnight = end2 < start2;

    // handle midnight crossing by normalizing the time ranges
    if (task1CrossesMidnight && !task2CrossesMidnight) {
        // task1 crosses midnight, task2 doesn't
        // overlap occurs if either:
        // 1. task2 starts before task1 ends on the next day (start2 < end1)
        // 2. task2 starts after or at the same time task1 starts on the first day (start2 >= start1)
        return start2 < end1 || start2 >= start1;
    }

    if (!task1CrossesMidnight && task2CrossesMidnight) {
        // task2 crosses midnight, task1 doesn't
        // overlap occurs if either:
        // 1. task1 starts before task2 ends on the next day (start1 < end2)
        // 2. task1 starts after or at the same time task2 starts on the first day (start1 >= start2)
        return start1 < end2 || start1 >= start2;
    }

    if (task1CrossesMidnight && task2CrossesMidnight) {
        // both tasks cross midnight
        // they must at least overlap at the midnight point (00:00)
        return true;
    }

    // neither task crosses midnight - standard interval overlap check
    return start1 < end2 && start2 < end1;
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
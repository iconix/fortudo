// Time utilities and pure functions

const MILLISECONDS_PER_MINUTE = 60000;

// ============================================================================
// DATETIME UTILITIES
// ============================================================================

/**
 * Calculate end DateTime from start DateTime and duration
 * @param {string} startDateTime - Start date and time in ISO format
 * @param {number} duration - Duration in minutes
 * @returns {string} - End date and time in ISO format
 */
export function calculateEndDateTime(startDateTime, duration) {
    const startDate = new Date(startDateTime);
    const endDate = new Date(startDate.getTime() + duration * MILLISECONDS_PER_MINUTE);
    return endDate.toISOString();
}

/**
 * Extract time portion from DateTime string
 * @param {Date} dateObj - Date object
 * @returns {string} - Time in HH:MM format
 */
export function extractTimeFromDateTime(dateObj) {
    return dateObj.toTimeString().substring(0, 5);
}

/**
 * Extract date portion from DateTime string
 * @param {Date} dateObj - Date object
 * @returns {string} - Date in YYYY-MM-DD format
 */
export function extractDateFromDateTime(dateObj) {
    return dateObj.toISOString().split('T')[0];
}

/**
 * Convert time strings to DateTime strings
 * @param {string} timeStr - Time in HH:MM format
 * @param {string} [dateStr] - Date in YYYY-MM-DD format. Defaults to today.
 * @returns {string} - DateTime in ISO format
 */
export function timeToDateTime(timeStr, dateStr = extractDateFromDateTime(new Date())) {
    return new Date(`${dateStr}T${timeStr}:00.000`).toISOString();
}

/**
 * Get task start/end Date objects with DateTime support
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
 * Format minutes as hours and minutes string, or return as an object.
 * @param {number} minutesInput - Total minutes.
 * @param {boolean} [returnAsObject=false] - If true, returns {hours, minutes, text} object.
 * @returns {string | {hours: number, minutes: number, text: string}} - Formatted time string or object.
 */
export function calculateHoursAndMinutes(minutesInput, returnAsObject = false) {
    const totalMinutes = Number(minutesInput);
    let timeStr = '';

    if (isNaN(totalMinutes)) {
        logger.warn('calculateHoursAndMinutes received NaN:', minutesInput);
        timeStr = '0m';
        if (returnAsObject) {
            return { hours: 0, minutes: 0, text: timeStr };
        }
        return timeStr;
    }

    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    if (hours > 0) {
        timeStr += `${hours}h `;
    }
    if (remainingMinutes > 0) {
        timeStr += `${remainingMinutes}m`;
    } else if (timeStr === '') {
        timeStr = '0m';
    }
    timeStr = timeStr.trim();

    if (returnAsObject) {
        return { hours, minutes: remainingMinutes, text: timeStr };
    }

    return timeStr;
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

    const result = roundedDate.toTimeString().substring(0, 5);
    logger.info('getCurrentTimeRounded returns:', result);
    return result;
}

/**
 * Simple logger utility for consistent logging across the application
 */
export const logger = {
    /**
     * Get caller file name and line number
     * @private
     * @returns {string} - Formatted caller info
     */
    _getCallerInfo() {
        try {
            const error = new Error();
            if (!error.stack) return '[unknown]';
            const stack = error.stack.split('\n');
            // Get the caller's info (index 3 since 0=Error, 1=_getCallerInfo, 2=log method)
            const caller = (stack[3] || '').match(/(?:at\s+)(?:.*\s+\()?(?:(.+?):(\d+):(\d+))/);
            if (!caller) return '[unknown]';
            // Extract just the filename from the full path
            const fileName = caller[1].split('/').pop();
            const lineNumber = caller[2];
            return `[${fileName}:${lineNumber}]`;
        } catch (err) {
            return '[unknown]';
        }
    },

    /**
     * Log an error message
     * @param {string} message - The error message to log
     * @param {...*} args - Additional arguments to log
     */
    error: (message, ...args) => {
        const callerInfo = logger._getCallerInfo();
        console.error(`[💪🏾 ERROR] ${callerInfo} ${message}`, ...args);
    },

    /**
     * Log a warning message
     * @param {string} message - The warning message to log
     * @param {...*} args - Additional arguments to log
     */
    warn: (message, ...args) => {
        const callerInfo = logger._getCallerInfo();
        console.warn(`[💪🏾 WARNING] ${callerInfo} ${message}`, ...args);
    },

    /**
     * Log an info message
     * @param {string} message - The info message to log
     * @param {...*} args - Additional arguments to log
     */
    info: (message, ...args) => {
        const callerInfo = logger._getCallerInfo();
        console.info(`[💪🏾 INFO] ${callerInfo} ${message}`, ...args);
    },

    /**
     * Log a debug message
     * @param {string} message - The debug message to log
     * @param {...*} args - Additional arguments to log
     */
    debug: (message, ...args) => {
        const callerInfo = logger._getCallerInfo();
        console.debug(`[💪🏾 DEBUG] ${callerInfo} ${message}`, ...args);
    }
};

/**
 * Check if a task is running late
 * @param {Object} task - The task object
 * @param {Date} [now=new Date()] - Optional date object to use as current time. Defaults to `new Date()`.
 * @returns {boolean} - True if the task is running late
 */
export function isTaskRunningLate(task, now = new Date()) {
    // A task is late if the current time 'now' is past its calculated 'endDate'.
    return now > new Date(task.endDateTime);
}

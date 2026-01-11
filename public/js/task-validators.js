// ============================================================================
// TASK TYPE CHECKING
// ============================================================================

/**
 * Type guard to check if a task is a scheduled task with all required fields
 * @param {Object} task - Task to check
 * @returns {boolean} True if task is a valid scheduled task
 */
export function isScheduledTask(task) {
    return (
        task &&
        task.type === 'scheduled' &&
        typeof task.startDateTime === 'string' &&
        typeof task.endDateTime === 'string' &&
        typeof task.duration === 'number'
    );
}

/**
 * Checks if a task is an unscheduled task
 * @param {Object} task - Task to check
 * @returns {boolean} True if task is unscheduled type
 */
export function isUnscheduledTask(task) {
    return task && task.type === 'unscheduled';
}

// ============================================================================
// TASK DATA VALIDATION
// ============================================================================

/**
 * Validates common task fields (description and type)
 * @param {string} description - Task description
 * @param {string} taskType - Task type
 * @returns {{isValid: boolean, reason?: string}}
 */
function validateCommonFields(description, taskType) {
    if (!description || description.trim() === '') {
        return { isValid: false, reason: 'Task description is required.' };
    }

    if (!taskType || !['scheduled', 'unscheduled'].includes(taskType)) {
        return { isValid: false, reason: 'Invalid task type.' };
    }

    return { isValid: true };
}

/**
 * Validates scheduled task specific fields
 * @param {number} duration - Task duration in minutes
 * @param {string} startTime - Task start time in HH:MM format
 * @returns {{isValid: boolean, reason?: string}}
 */
export function validateScheduledTaskFields(duration, startTime) {
    if (duration === undefined || duration === null || isNaN(duration) || duration < 0) {
        return {
            isValid: false,
            reason: 'Duration must be a non-negative number for scheduled tasks.'
        };
    }

    if (!startTime || startTime.trim() === '') {
        return { isValid: false, reason: 'Start time is required for scheduled tasks.' };
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime)) {
        return { isValid: false, reason: 'Invalid start time format. Use HH:MM format.' };
    }

    return { isValid: true };
}

/**
 * Validates unscheduled task specific fields
 * @param {string} priority - Task priority (high, medium, low)
 * @param {number} estDuration - Estimated duration in minutes
 * @returns {{isValid: boolean, reason?: string}}
 */
export function validateUnscheduledTaskFields(priority, estDuration) {
    if (priority && !['high', 'medium', 'low'].includes(priority)) {
        return { isValid: false, reason: 'Invalid priority. Must be high, medium, or low.' };
    }

    if (
        estDuration !== undefined &&
        estDuration !== null &&
        (isNaN(estDuration) || estDuration < 0)
    ) {
        return {
            isValid: false,
            reason: 'Estimated duration must be a non-negative number for unscheduled tasks.'
        };
    }

    return { isValid: true };
}

/**
 * Validate task data before creation or update
 * @param {string} description - Task description
 * @param {string} taskType - Task type ('scheduled' or 'unscheduled')
 * @param {number} [duration] - Task duration in minutes (for scheduled tasks)
 * @param {string} [startTime] - Task start time (for scheduled tasks)
 * @param {number} [estDuration] - Estimated duration in minutes (for unscheduled tasks)
 * @returns {{isValid: boolean, reason?: string}} Validation result
 */
export function isValidTaskData(description, taskType, duration, startTime, estDuration) {
    const commonValidation = validateCommonFields(description, taskType);
    if (!commonValidation.isValid) return commonValidation;

    if (taskType === 'scheduled') {
        return validateScheduledTaskFields(duration, startTime);
    }

    if (taskType === 'unscheduled') {
        if (
            estDuration !== undefined &&
            estDuration !== null &&
            (isNaN(estDuration) || estDuration < 0)
        ) {
            return {
                isValid: false,
                reason: 'Estimated duration must be a non-negative number for unscheduled tasks.'
            };
        }
    }

    return { isValid: true };
}

// ============================================================================
// TASK OBJECT VALIDATION
// ============================================================================

/**
 * Validates that a task object has required fields for rescheduling
 * @param {Object} task - Task to validate
 * @returns {{isValid: boolean, missingFields: string[]}}
 */
export function validateTaskForRescheduling(task) {
    const missingFields = [];

    if (task.type !== 'scheduled') missingFields.push('type !== "scheduled"');
    if (!task.startDateTime) missingFields.push('startDateTime');
    if (!task.endDateTime) missingFields.push('endDateTime');
    if (typeof task.duration !== 'number') missingFields.push('duration (must be number)');

    return {
        isValid: missingFields.length === 0,
        missingFields
    };
}

/**
 * Validates a task index against the tasks array length
 * @param {number} index - Index to validate
 * @param {number} arrayLength - Length of tasks array
 * @returns {{isValid: boolean, reason?: string}}
 */
export function validateTaskIndex(index, arrayLength) {
    if (index < 0 || index >= arrayLength) {
        return { isValid: false, reason: 'Invalid task index.' };
    }
    return { isValid: true };
}

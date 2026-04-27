import {
    calculateEndDateTime,
    extractDateFromDateTime,
    parseDuration,
    timeToDateTime
} from '../utils.js';
import { showAlert } from '../modal-manager.js';
import { validateCategoryKey } from '../tasks/form-utils.js';

function extractActivityFields(formElement, options = {}) {
    const formData = new FormData(formElement);
    const description = formData.get('description')?.toString().trim();
    const startTime = formData.get('start-time')?.toString();
    const durationResult = parseDuration(
        formData.get('duration-hours')?.toString() || '0',
        formData.get('duration-minutes')?.toString() || '0'
    );
    const categoryKey = formData.get('category')?.toString() || '';

    if (!description) {
        showAlert('Activity description cannot be empty.', 'sky');
        return null;
    }

    if (!startTime) {
        showAlert('Start time is required for activities.', 'sky');
        return null;
    }

    if (!durationResult.valid) {
        showAlert(durationResult.error, 'sky');
        return null;
    }

    const categoryResult = validateCategoryKey(categoryKey, 'sky');
    if (!categoryResult.valid) {
        return null;
    }

    const baseDate = options.baseDate || extractDateFromDateTime(new Date());
    const startDateTime = timeToDateTime(startTime, baseDate);
    const endDateTime = calculateEndDateTime(startDateTime, durationResult.duration);

    return {
        description,
        category: categoryResult.category,
        startDateTime,
        endDateTime,
        duration: durationResult.duration
    };
}

export function extractActivityFormData(formElement) {
    const fields = extractActivityFields(formElement);
    if (!fields) {
        return null;
    }

    return {
        ...fields,
        source: 'manual',
        sourceTaskId: null
    };
}

export function extractActivityEditFormData(formElement) {
    return extractActivityFields(formElement, {
        baseDate: formElement?.dataset?.activityDate || extractDateFromDateTime(new Date())
    });
}

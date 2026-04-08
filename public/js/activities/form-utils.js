import {
    calculateEndDateTime,
    extractDateFromDateTime,
    parseDuration,
    timeToDateTime
} from '../utils.js';
import { showAlert } from '../modal-manager.js';
import { resolveCategoryKey } from '../taxonomy/taxonomy-selectors.js';

export function extractActivityFormData(formElement) {
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

    if (categoryKey && !resolveCategoryKey(categoryKey)) {
        showAlert('Selected category is no longer available.', 'sky');
        return null;
    }

    const date = extractDateFromDateTime(new Date());
    const startDateTime = timeToDateTime(startTime, date);
    const endDateTime = calculateEndDateTime(startDateTime, durationResult.duration);

    return {
        description,
        category: categoryKey || null,
        startDateTime,
        endDateTime,
        duration: durationResult.duration,
        source: 'manual',
        sourceTaskId: null
    };
}

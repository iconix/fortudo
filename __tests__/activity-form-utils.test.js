/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn()
}));

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    resolveCategoryKey: jest.fn()
}));

import {
    extractActivityFormData,
    extractActivityEditFormData
} from '../public/js/activities/form-utils.js';
import { showAlert } from '../public/js/modal-manager.js';
import { resolveCategoryKey } from '../public/js/taxonomy/taxonomy-selectors.js';
import { calculateEndDateTime, timeToDateTime } from '../public/js/utils.js';

function createActivityForm({
    description = 'Deep work',
    startTime = '09:00',
    durationHours = '1',
    durationMinutes = '0',
    category = ''
} = {}) {
    document.body.innerHTML = `
        <form id="task-form">
            <input type="text" name="description" value="${description}" />
            <input type="radio" name="task-type" value="activity" checked />
            <input type="time" name="start-time" value="${startTime}" />
            <input type="number" name="duration-hours" value="${durationHours}" />
            <input type="number" name="duration-minutes" value="${durationMinutes}" />
            <select name="category">
                <option value="">No category</option>
                <option value="work/deep" ${category === 'work/deep' ? 'selected' : ''}>Deep Work</option>
            </select>
        </form>
    `;

    return document.getElementById('task-form');
}

describe('activity form utils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
        document.body.innerHTML = '';
    });

    test('extracts activity form data correctly', () => {
        const form = createActivityForm();
        const expectedStart = timeToDateTime('09:00', '2026-04-07');
        const expectedEnd = calculateEndDateTime(expectedStart, 60);

        const result = extractActivityFormData(form);

        expect(result).toEqual({
            description: 'Deep work',
            category: null,
            startDateTime: expectedStart,
            endDateTime: expectedEnd,
            duration: 60,
            source: 'manual',
            sourceTaskId: null
        });
    });

    test('includes category when selected', () => {
        resolveCategoryKey.mockReturnValue({
            kind: 'category',
            record: { key: 'work/deep', color: '#0ea5e9' }
        });
        const form = createActivityForm({ category: 'work/deep' });

        const result = extractActivityFormData(form);

        expect(result.category).toBe('work/deep');
    });

    test('rejects empty description', () => {
        const form = createActivityForm({ description: '' });

        const result = extractActivityFormData(form);

        expect(result).toBeNull();
        expect(showAlert).toHaveBeenCalledWith('Activity description cannot be empty.', 'sky');
    });

    test('rejects missing start time', () => {
        const form = createActivityForm({ startTime: '' });

        const result = extractActivityFormData(form);

        expect(result).toBeNull();
        expect(showAlert).toHaveBeenCalledWith('Start time is required for activities.', 'sky');
    });

    test('rejects zero duration', () => {
        const form = createActivityForm({ durationHours: '0', durationMinutes: '0' });

        const result = extractActivityFormData(form);

        expect(result).toBeNull();
        expect(showAlert).toHaveBeenCalledWith('Duration must be greater than 0.', 'sky');
    });

    test('rejects stale category keys', () => {
        resolveCategoryKey.mockReturnValue(null);
        const form = createActivityForm({ category: 'work/deep' });

        const result = extractActivityFormData(form);

        expect(result).toBeNull();
        expect(showAlert).toHaveBeenCalledWith('Selected category is no longer available.', 'sky');
    });

    test('extracts inline activity edit form data using the activity date instead of today', () => {
        const form = createActivityForm({
            description: 'Edited deep work',
            startTime: '13:15',
            durationHours: '1',
            durationMinutes: '30',
            category: 'work/deep'
        });
        form.dataset.activityDate = '2026-04-05';
        resolveCategoryKey.mockReturnValue({
            kind: 'category',
            record: { key: 'work/deep', color: '#0ea5e9' }
        });

        const result = extractActivityEditFormData(form);

        expect(result).toEqual({
            description: 'Edited deep work',
            category: 'work/deep',
            startDateTime: timeToDateTime('13:15', '2026-04-05'),
            endDateTime: calculateEndDateTime(timeToDateTime('13:15', '2026-04-05'), 90),
            duration: 90
        });
    });
});

/**
 * @jest-environment jsdom
 */

import {
    isScheduledTask,
    isUnscheduledTask,
    validateScheduledTaskFields,
    validateUnscheduledTaskFields,
    isValidTaskData,
    validateTaskForRescheduling,
    validateTaskIndex
} from '../public/js/task-validators.js';

describe('Task Validators Tests', () => {
    describe('isScheduledTask', () => {
        test('returns true for valid scheduled task', () => {
            const task = {
                type: 'scheduled',
                startDateTime: '2025-01-01T10:00:00.000Z',
                endDateTime: '2025-01-01T11:00:00.000Z',
                duration: 60
            };
            expect(isScheduledTask(task)).toBe(true);
        });

        test('returns false for unscheduled task', () => {
            const task = { type: 'unscheduled', priority: 'high' };
            expect(isScheduledTask(task)).toBe(false);
        });

        test('returns false for missing startDateTime', () => {
            const task = {
                type: 'scheduled',
                endDateTime: '2025-01-01T11:00:00.000Z',
                duration: 60
            };
            expect(isScheduledTask(task)).toBe(false);
        });

        test('returns false for missing endDateTime', () => {
            const task = {
                type: 'scheduled',
                startDateTime: '2025-01-01T10:00:00.000Z',
                duration: 60
            };
            expect(isScheduledTask(task)).toBe(false);
        });

        test('returns false for missing duration', () => {
            const task = {
                type: 'scheduled',
                startDateTime: '2025-01-01T10:00:00.000Z',
                endDateTime: '2025-01-01T11:00:00.000Z'
            };
            expect(isScheduledTask(task)).toBe(false);
        });

        test('returns falsy for null task', () => {
            expect(isScheduledTask(null)).toBeFalsy();
        });

        test('returns falsy for undefined task', () => {
            expect(isScheduledTask(undefined)).toBeFalsy();
        });
    });

    describe('isUnscheduledTask', () => {
        test('returns true for unscheduled task', () => {
            const task = { type: 'unscheduled', priority: 'medium' };
            expect(isUnscheduledTask(task)).toBe(true);
        });

        test('returns false for scheduled task', () => {
            const task = { type: 'scheduled' };
            expect(isUnscheduledTask(task)).toBe(false);
        });

        test('returns falsy for null task', () => {
            expect(isUnscheduledTask(null)).toBeFalsy();
        });

        test('returns falsy for undefined task', () => {
            expect(isUnscheduledTask(undefined)).toBeFalsy();
        });
    });

    describe('validateScheduledTaskFields', () => {
        test('returns valid for correct fields', () => {
            const result = validateScheduledTaskFields(60, '10:30');
            expect(result.isValid).toBe(true);
        });

        test('returns invalid for undefined duration', () => {
            const result = validateScheduledTaskFields(undefined, '10:30');
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('Duration');
        });

        test('returns invalid for null duration', () => {
            const result = validateScheduledTaskFields(null, '10:30');
            expect(result.isValid).toBe(false);
        });

        test('returns invalid for NaN duration', () => {
            const result = validateScheduledTaskFields(NaN, '10:30');
            expect(result.isValid).toBe(false);
        });

        test('returns invalid for negative duration', () => {
            const result = validateScheduledTaskFields(-10, '10:30');
            expect(result.isValid).toBe(false);
        });

        test('returns invalid for missing start time', () => {
            const result = validateScheduledTaskFields(60, '');
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('Start time');
        });

        test('returns invalid for null start time', () => {
            const result = validateScheduledTaskFields(60, null);
            expect(result.isValid).toBe(false);
        });

        test('returns invalid for invalid time format', () => {
            const result = validateScheduledTaskFields(60, '25:00');
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('HH:MM');
        });

        test('returns invalid for time with invalid minutes', () => {
            const result = validateScheduledTaskFields(60, '10:60');
            expect(result.isValid).toBe(false);
        });

        test('accepts valid time formats', () => {
            expect(validateScheduledTaskFields(60, '00:00').isValid).toBe(true);
            expect(validateScheduledTaskFields(60, '23:59').isValid).toBe(true);
            expect(validateScheduledTaskFields(60, '9:05').isValid).toBe(true);
        });
    });

    describe('validateUnscheduledTaskFields', () => {
        test('returns valid for correct fields', () => {
            const result = validateUnscheduledTaskFields('high', 60);
            expect(result.isValid).toBe(true);
        });

        test('returns valid for null priority (defaults to medium)', () => {
            const result = validateUnscheduledTaskFields(null, 60);
            expect(result.isValid).toBe(true);
        });

        test('returns valid for undefined estDuration', () => {
            const result = validateUnscheduledTaskFields('medium', undefined);
            expect(result.isValid).toBe(true);
        });

        test('returns valid for null estDuration', () => {
            const result = validateUnscheduledTaskFields('medium', null);
            expect(result.isValid).toBe(true);
        });

        test('returns invalid for invalid priority', () => {
            const result = validateUnscheduledTaskFields('urgent', 60);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('priority');
        });

        test('returns invalid for NaN estDuration', () => {
            const result = validateUnscheduledTaskFields('medium', NaN);
            expect(result.isValid).toBe(false);
        });

        test('returns invalid for negative estDuration', () => {
            const result = validateUnscheduledTaskFields('medium', -10);
            expect(result.isValid).toBe(false);
        });

        test('accepts all valid priorities', () => {
            expect(validateUnscheduledTaskFields('high', 30).isValid).toBe(true);
            expect(validateUnscheduledTaskFields('medium', 30).isValid).toBe(true);
            expect(validateUnscheduledTaskFields('low', 30).isValid).toBe(true);
        });
    });

    describe('isValidTaskData', () => {
        test('returns valid for scheduled task with all fields', () => {
            const result = isValidTaskData('Task', 'scheduled', 60, '10:00', null);
            expect(result.isValid).toBe(true);
        });

        test('returns valid for unscheduled task with all fields', () => {
            const result = isValidTaskData('Task', 'unscheduled', null, null, 30);
            expect(result.isValid).toBe(true);
        });

        test('returns invalid for empty description', () => {
            const result = isValidTaskData('', 'scheduled', 60, '10:00', null);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('description');
        });

        test('returns invalid for whitespace-only description', () => {
            const result = isValidTaskData('   ', 'scheduled', 60, '10:00', null);
            expect(result.isValid).toBe(false);
        });

        test('returns invalid for null description', () => {
            const result = isValidTaskData(null, 'scheduled', 60, '10:00', null);
            expect(result.isValid).toBe(false);
        });

        test('returns invalid for invalid task type', () => {
            const result = isValidTaskData('Task', 'invalid', 60, '10:00', null);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('Invalid task type');
        });

        test('returns invalid for null task type', () => {
            const result = isValidTaskData('Task', null, 60, '10:00', null);
            expect(result.isValid).toBe(false);
        });

        test('validates scheduled task fields', () => {
            const result = isValidTaskData('Task', 'scheduled', 60, '', null);
            expect(result.isValid).toBe(false);
        });

        test('validates unscheduled estDuration', () => {
            const result = isValidTaskData('Task', 'unscheduled', null, null, -10);
            expect(result.isValid).toBe(false);
        });
    });

    describe('validateTaskForRescheduling', () => {
        test('returns valid for complete scheduled task', () => {
            const task = {
                type: 'scheduled',
                startDateTime: '2025-01-01T10:00:00.000Z',
                endDateTime: '2025-01-01T11:00:00.000Z',
                duration: 60
            };
            const result = validateTaskForRescheduling(task);
            expect(result.isValid).toBe(true);
            expect(result.missingFields).toHaveLength(0);
        });

        test('returns invalid for unscheduled task', () => {
            const task = { type: 'unscheduled' };
            const result = validateTaskForRescheduling(task);
            expect(result.isValid).toBe(false);
            expect(result.missingFields).toContain('type !== "scheduled"');
        });

        test('returns invalid for missing startDateTime', () => {
            const task = {
                type: 'scheduled',
                endDateTime: '2025-01-01T11:00:00.000Z',
                duration: 60
            };
            const result = validateTaskForRescheduling(task);
            expect(result.isValid).toBe(false);
            expect(result.missingFields).toContain('startDateTime');
        });

        test('returns invalid for missing endDateTime', () => {
            const task = {
                type: 'scheduled',
                startDateTime: '2025-01-01T10:00:00.000Z',
                duration: 60
            };
            const result = validateTaskForRescheduling(task);
            expect(result.isValid).toBe(false);
            expect(result.missingFields).toContain('endDateTime');
        });

        test('returns invalid for missing duration', () => {
            const task = {
                type: 'scheduled',
                startDateTime: '2025-01-01T10:00:00.000Z',
                endDateTime: '2025-01-01T11:00:00.000Z'
            };
            const result = validateTaskForRescheduling(task);
            expect(result.isValid).toBe(false);
            expect(result.missingFields).toContain('duration (must be number)');
        });

        test('returns multiple missing fields', () => {
            const task = { type: 'unscheduled' };
            const result = validateTaskForRescheduling(task);
            expect(result.missingFields.length).toBeGreaterThan(1);
        });
    });

    describe('validateTaskIndex', () => {
        test('returns valid for index within range', () => {
            expect(validateTaskIndex(0, 5).isValid).toBe(true);
            expect(validateTaskIndex(2, 5).isValid).toBe(true);
            expect(validateTaskIndex(4, 5).isValid).toBe(true);
        });

        test('returns invalid for negative index', () => {
            const result = validateTaskIndex(-1, 5);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('Invalid task index');
        });

        test('returns invalid for index equal to array length', () => {
            const result = validateTaskIndex(5, 5);
            expect(result.isValid).toBe(false);
        });

        test('returns invalid for index greater than array length', () => {
            const result = validateTaskIndex(10, 5);
            expect(result.isValid).toBe(false);
        });

        test('returns invalid for empty array', () => {
            const result = validateTaskIndex(0, 0);
            expect(result.isValid).toBe(false);
        });
    });
});

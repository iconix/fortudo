/**
 * @jest-environment jsdom
 */

// This file contains tests for time utility functions in fortudo
// These are pure functions that don't interact with state or DOM

import {
    calculateMinutes,
    calculateHoursAndMinutes,
    calculate24HourTimeFromMinutes,
    convertTo12HourTime,
    convertTo24HourTime,
    getCurrentTimeRounded,
    timeToDateTime,
    calculateEndDateTime,
    isTaskRunningLate
} from '../public/js/utils.js';

describe('Time Utility Functions', () => {
    test('calculateMinutes converts time string to minutes correctly', () => {
        expect(calculateMinutes('00:00')).toBe(0);
        expect(calculateMinutes('01:00')).toBe(60);
        expect(calculateMinutes('01:30')).toBe(90);
        expect(calculateMinutes('09:30')).toBe(570);
        expect(calculateMinutes('14:45')).toBe(885);
        expect(calculateMinutes('23:59')).toBe(1439);
    });

    test('calculateHoursAndMinutes formats minutes into readable time string', () => {
        expect(calculateHoursAndMinutes(0)).toBe('0m');
        expect(calculateHoursAndMinutes(1)).toBe('1m');
        expect(calculateHoursAndMinutes(30)).toBe('30m');
        expect(calculateHoursAndMinutes(60)).toBe('1h');
        expect(calculateHoursAndMinutes(61)).toBe('1h 1m');
        expect(calculateHoursAndMinutes(90)).toBe('1h 30m');
        expect(calculateHoursAndMinutes(120)).toBe('2h');
        expect(calculateHoursAndMinutes(150)).toBe('2h 30m');
    });

    test('calculate24HourTimeFromMinutes converts minutes to 24-hour format', () => {
        expect(calculate24HourTimeFromMinutes(0)).toBe('00:00');
        expect(calculate24HourTimeFromMinutes(60)).toBe('01:00');
        expect(calculate24HourTimeFromMinutes(90)).toBe('01:30');
        expect(calculate24HourTimeFromMinutes(570)).toBe('09:30');
        expect(calculate24HourTimeFromMinutes(885)).toBe('14:45');
        expect(calculate24HourTimeFromMinutes(1439)).toBe('23:59');

        // Edge cases
        expect(calculate24HourTimeFromMinutes(1440)).toBe('00:00'); // Midnight next day
        expect(calculate24HourTimeFromMinutes(1500)).toBe('01:00'); // 1 AM next day
    });

    test('convertTo24HourTime converts 12-hour time to 24-hour format', () => {
        expect(convertTo24HourTime('12:00 AM')).toBe('00:00');
        expect(convertTo24HourTime('1:00 AM')).toBe('01:00');
        expect(convertTo24HourTime('11:59 AM')).toBe('11:59');
        expect(convertTo24HourTime('12:00 PM')).toBe('12:00');
        expect(convertTo24HourTime('1:00 PM')).toBe('13:00');
        expect(convertTo24HourTime('11:59 PM')).toBe('23:59');

        // Check case insensitivity
        expect(convertTo24HourTime('9:30 am')).toBe('09:30');
        expect(convertTo24HourTime('9:30 pm')).toBe('21:30');
    });

    test('convertTo12HourTime converts 24-hour time to 12-hour format', () => {
        expect(convertTo12HourTime('00:00')).toBe('12:00 AM');
        expect(convertTo12HourTime('01:00')).toBe('1:00 AM');
        expect(convertTo12HourTime('11:59')).toBe('11:59 AM');
        expect(convertTo12HourTime('12:00')).toBe('12:00 PM');
        expect(convertTo12HourTime('13:00')).toBe('1:00 PM');
        expect(convertTo12HourTime('23:59')).toBe('11:59 PM');
    });

    describe('Date and Time Formatting & getCurrentTimeRounded', () => {
        test('getCurrentTimeRounded returns exact time when already at 5-minute interval', () => {
            const fixedDate = new Date(2025, 0, 15, 14, 30, 0); // Jan 15, 2025, 2:30 PM
            expect(getCurrentTimeRounded(fixedDate)).toBe('14:30');
        });

        test('getCurrentTimeRounded rounds up to nearest 5 minutes (e.g., 14:32 -> 14:35)', () => {
            const roundingDate = new Date(2025, 0, 15, 14, 32, 0); // Jan 15, 2025, 2:32 PM
            expect(getCurrentTimeRounded(roundingDate)).toBe('14:35');
        });

        test('getCurrentTimeRounded handles hour rollover (e.g. 10:58 -> 11:00)', () => {
            const rolloverDate = new Date(2025, 0, 15, 10, 58, 0); // 10:58 AM
            expect(getCurrentTimeRounded(rolloverDate)).toBe('11:00');
        });

        test('getCurrentTimeRounded handles just before midnight (e.g. 23:58 -> 00:00)', () => {
            const almostMidnight = new Date(2025, 0, 15, 23, 58, 0);
            expect(getCurrentTimeRounded(almostMidnight)).toBe('00:00');
        });
    });

    describe('Late Task Warning Feature', () => {
        describe('isTaskRunningLate', () => {
            test('should return true when current time is past task end time', () => {
                const today = '2024-01-01';
                const startDateTime = timeToDateTime('13:00', today);
                const endDateTime = calculateEndDateTime(startDateTime, 60);

                const lateTask = {
                    startDateTime,
                    endDateTime,
                    duration: 60,
                    status: 'incomplete'
                };

                // Pass the mock time directly as a parameter instead of global mocking
                const mockTime = new Date('2024-01-01T14:30:00');
                expect(isTaskRunningLate(lateTask, mockTime)).toBe(true);
            });

            test('should return false when current time is before task end time', () => {
                const today = '2024-01-01';
                const startDateTime = timeToDateTime('14:00', today);
                const endDateTime = calculateEndDateTime(startDateTime, 60);

                const onTimeTask = {
                    startDateTime,
                    endDateTime,
                    duration: 60,
                    status: 'incomplete'
                };

                // Pass the mock time directly as a parameter instead of global mocking
                const mockTime = new Date('2024-01-01T14:30:00');
                expect(isTaskRunningLate(onTimeTask, mockTime)).toBe(false);
            });

            test('should return false when current time equals task end time', () => {
                const today = '2024-01-01';
                const startDateTime = timeToDateTime('13:30', today);
                const endDateTime = calculateEndDateTime(startDateTime, 60);

                const exactTimeTask = {
                    startDateTime,
                    endDateTime,
                    duration: 60,
                    status: 'incomplete'
                };

                // Pass the mock time directly as a parameter instead of global mocking
                const mockTime = new Date('2024-01-01T14:30:00');
                expect(isTaskRunningLate(exactTimeTask, mockTime)).toBe(false);
            });

            describe('Comprehensive Midnight Crossing Scenarios', () => {
                test('should handle tasks that cross midnight correctly', () => {
                    // Mock current time to 1:00 AM (using local time constructor)
                    const mockDate = new Date(2024, 0, 1, 1, 0, 0); // Year, month (0-based), day, hour, minute, second

                    const today = '2024-01-01';
                    const startDateTime = timeToDateTime('23:00', today);
                    const endDateTime = calculateEndDateTime(startDateTime, 180);

                    const midnightTask = {
                        startDateTime,
                        endDateTime,
                        duration: 180, // 3 hours
                        status: 'incomplete'
                    };

                    expect(isTaskRunningLate(midnightTask, mockDate)).toBe(false); // 1:00 AM is before 2:00 AM end time
                });

                test('should return true for midnight-crossing task that is late', () => {
                    // Mock current time to 3:00 AM (using local time constructor)
                    const mockDate = new Date(2024, 0, 2, 3, 0, 0); // Year, month (0-based), day, hour, minute, second

                    const today = '2024-01-01';
                    const startDateTime = timeToDateTime('23:00', today);
                    const endDateTime = calculateEndDateTime(startDateTime, 180);

                    const lateNightTask = {
                        startDateTime,
                        endDateTime,
                        duration: 180, // 3 hours
                        status: 'incomplete'
                    };

                    expect(isTaskRunningLate(lateNightTask, mockDate)).toBe(true); // 3:00 AM is past 2:00 AM end time
                });

                test('Normal task that ended yesterday', () => {
                    const todayEarly = new Date(2024, 0, 2, 1, 0, 0); // Jan 2, 1:00 AM

                    const yesterday = '2024-01-01';
                    const startDateTime = timeToDateTime('22:00', yesterday);
                    const endDateTime = calculateEndDateTime(startDateTime, 90);

                    const yesterdayTask = {
                        startDateTime,
                        endDateTime,
                        duration: 90,
                        status: 'incomplete'
                    };

                    expect(isTaskRunningLate(yesterdayTask, todayEarly)).toBe(true);
                });

                test('Task crossing midnight - current time DURING task should be false', () => {
                    // Current time: 11:30 PM (30 minutes after task started)
                    const duringTask = new Date(2024, 0, 1, 23, 30, 0);

                    const today = '2024-01-01';
                    const startDateTime = timeToDateTime('23:00', today);
                    const endDateTime = calculateEndDateTime(startDateTime, 180);

                    const ongoingTask = {
                        startDateTime,
                        endDateTime,
                        duration: 180,
                        status: 'incomplete'
                    };

                    expect(isTaskRunningLate(ongoingTask, duringTask)).toBe(false);
                });

                test('Task crossing midnight - next day AFTER end time should be true', () => {
                    // Current time: 3:00 AM next day (1 hour after task should have ended)
                    const afterEnd = new Date(2024, 0, 2, 3, 0, 0);

                    const yesterday = '2024-01-01';
                    const startDateTime = timeToDateTime('23:00', yesterday);
                    const endDateTime = calculateEndDateTime(startDateTime, 180);

                    const lateTask = {
                        startDateTime,
                        endDateTime,
                        duration: 180,
                        status: 'incomplete'
                    };

                    expect(isTaskRunningLate(lateTask, afterEnd)).toBe(true);
                });

                test('Edge case: Task ending exactly at midnight should work correctly', () => {
                    // Current time: 12:30 AM (30 minutes after midnight)
                    const pastMidnight = new Date(2024, 0, 2, 0, 30, 0);

                    const yesterday = '2024-01-01';
                    const startDateTime = timeToDateTime('22:00', yesterday);
                    const endDateTime = calculateEndDateTime(startDateTime, 120);

                    const midnightEndTask = {
                        startDateTime,
                        endDateTime,
                        duration: 120,
                        status: 'incomplete'
                    };

                    expect(isTaskRunningLate(midnightEndTask, pastMidnight)).toBe(true);
                });
            });
        });
    });

    describe('calculateHoursAndMinutes edge cases', () => {
        test('handles NaN input and returns 0m as string', () => {
            expect(calculateHoursAndMinutes(NaN)).toBe('0m');
            expect(calculateHoursAndMinutes('invalid')).toBe('0m');
            expect(calculateHoursAndMinutes(undefined)).toBe('0m');
        });

        test('handles NaN input with returnAsObject=true', () => {
            const result = calculateHoursAndMinutes(NaN, true);
            expect(result).toEqual({ hours: 0, minutes: 0, text: '0m' });
        });

        test('returns object with returnAsObject=true for valid input', () => {
            expect(calculateHoursAndMinutes(90, true)).toEqual({
                hours: 1,
                minutes: 30,
                text: '1h 30m'
            });
            expect(calculateHoursAndMinutes(60, true)).toEqual({
                hours: 1,
                minutes: 0,
                text: '1h'
            });
            expect(calculateHoursAndMinutes(45, true)).toEqual({
                hours: 0,
                minutes: 45,
                text: '45m'
            });
            expect(calculateHoursAndMinutes(0, true)).toEqual({ hours: 0, minutes: 0, text: '0m' });
        });
    });

    describe('parseDuration edge cases', () => {
        const { parseDuration } = require('../public/js/utils.js');

        test('allows zero duration when allowZero is true', () => {
            const result = parseDuration(0, 0, { allowZero: true });
            expect(result.valid).toBe(true);
            expect(result.duration).toBe(0);
        });

        test('rejects zero duration when allowZero is false', () => {
            const result = parseDuration(0, 0, { allowZero: false });
            expect(result.valid).toBe(false);
        });

        test('rejects negative hours', () => {
            const result = parseDuration(-1, 30);
            expect(result.valid).toBe(false);
        });

        test('rejects negative minutes', () => {
            const result = parseDuration(1, -1);
            expect(result.valid).toBe(false);
        });

        test('rejects minutes greater than 59', () => {
            const result = parseDuration(1, 60);
            expect(result.valid).toBe(false);
        });

        test('handles string inputs', () => {
            const result = parseDuration('2', '30');
            expect(result.valid).toBe(true);
            expect(result.duration).toBe(150);
        });

        test('handles empty string inputs', () => {
            const result = parseDuration('', '', { allowZero: true });
            expect(result.valid).toBe(true);
            expect(result.duration).toBe(0);
        });
    });

    describe('getThemeForTask and getThemeForTaskType', () => {
        const { getThemeForTask, getThemeForTaskType } = require('../public/js/utils.js');

        test('getThemeForTask returns teal for scheduled task', () => {
            expect(getThemeForTask({ type: 'scheduled' })).toBe('teal');
        });

        test('getThemeForTask returns indigo for unscheduled task', () => {
            expect(getThemeForTask({ type: 'unscheduled' })).toBe('indigo');
        });

        test('getThemeForTask returns indigo for null task', () => {
            expect(getThemeForTask(null)).toBe('indigo');
        });

        test('getThemeForTaskType returns teal for scheduled type', () => {
            expect(getThemeForTaskType('scheduled')).toBe('teal');
        });

        test('getThemeForTaskType returns indigo for unscheduled type', () => {
            expect(getThemeForTaskType('unscheduled')).toBe('indigo');
        });
    });
});

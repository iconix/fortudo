/**
 * @jest-environment jsdom
 */

// This file contains tests for time utility functions in fortudo
// This file contains tests for time utility functions in fortudo
// These are pure functions that don't interact with state or DOM

import {
    calculateMinutes,
    calculateHoursAndMinutes,
    calculate24HourTimeFromMinutes,
    convertTo24HourTime,
    convertTo12HourTime,
    calculateEndTime,
    getCurrentTimeRounded,
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

    test('calculateEndTime calculates end time based on start time and duration', () => {
        expect(calculateEndTime('09:00', 30)).toBe('09:30');
        expect(calculateEndTime('09:00', 60)).toBe('10:00');
        expect(calculateEndTime('09:00', 90)).toBe('10:30');
        expect(calculateEndTime('23:00', 120)).toBe('01:00'); // crosses midnight
        expect(calculateEndTime('23:45', 30)).toBe('00:15'); // crosses midnight
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
        let dateSpy;

        beforeEach(() => {
            // Mock the current time to 2:30 PM (14:30)
            const mockDate = new Date('2024-01-01T14:30:00');
            dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
        });

        afterEach(() => {
            dateSpy.mockRestore();
        });

        describe('isTaskRunningLate', () => {
            test('should return true when current time is past task end time', () => {
                const lateTask = {
                    startTime: '13:00',
                    endTime: '14:00', // Task should have ended at 2:00 PM, current time is 2:30 PM
                    duration: 60,
                    status: 'incomplete'
                };

                expect(isTaskRunningLate(lateTask)).toBe(true);
            });

            test('should return false when current time is before task end time', () => {
                const onTimeTask = {
                    startTime: '14:00',
                    endTime: '15:00', // Task ends at 3:00 PM, current time is 2:30 PM
                    duration: 60,
                    status: 'incomplete'
                };

                expect(isTaskRunningLate(onTimeTask)).toBe(false);
            });

            test('should return false when current time equals task end time', () => {
                const exactTimeTask = {
                    startTime: '13:30',
                    endTime: '14:30', // Task ends exactly at current time (2:30 PM)
                    duration: 60,
                    status: 'incomplete'
                };

                expect(isTaskRunningLate(exactTimeTask)).toBe(false);
            });

            test('should handle tasks that cross midnight correctly', () => {
                // Temporarily restore the real Date constructor for this test
                dateSpy.mockRestore();

                // Mock current time to 1:00 AM (using local time constructor)
                const mockDate = new Date(2024, 0, 1, 1, 0, 0); // Year, month (0-based), day, hour, minute, second

                const midnightTask = {
                    startTime: '23:00', // 11:00 PM previous day
                    endTime: '02:00', // 2:00 AM next day
                    duration: 180, // 3 hours
                    status: 'incomplete'
                };

                expect(isTaskRunningLate(midnightTask, mockDate)).toBe(false); // 1:00 AM is before 2:00 AM end time

                // Restore the mock for other tests
                const mockDate2 = new Date('2024-01-01T14:30:00');
                dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => mockDate2);
            });

            test('should return true for midnight-crossing task that is late', () => {
                // Temporarily restore the real Date constructor for this test
                dateSpy.mockRestore();

                // Mock current time to 3:00 AM (using local time constructor)
                const mockDate = new Date(2024, 0, 1, 3, 0, 0); // Year, month (0-based), day, hour, minute, second

                const lateNightTask = {
                    startTime: '23:00', // 11:00 PM previous day
                    endTime: '02:00', // 2:00 AM next day
                    duration: 180, // 3 hours
                    status: 'incomplete'
                };

                expect(isTaskRunningLate(lateNightTask, mockDate)).toBe(true); // 3:00 AM is past 2:00 AM end time

                // Restore the mock for other tests
                const mockDate2 = new Date('2024-01-01T14:30:00');
                dateSpy = jest.spyOn(global, 'Date').mockImplementation(() => mockDate2);
            });
        });
    });
});

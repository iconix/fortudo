/**
 * @jest-environment jsdom
 */

import {
    getDateRangeInterval,
    getDurationCapableInterval,
    getIntervalDurationMilliseconds,
    getOverlapDurationMilliseconds,
    invalidActivityTouchesInterval,
    itemOverlapsInterval
} from '../public/js/activities/insights-intervals.js';
import { calculateEndDateTime, timeToDateTime } from '../public/js/utils.js';

function isoOn(date, time) {
    return timeToDateTime(time, date);
}

function activity(overrides = {}) {
    const startDateTime = overrides.startDateTime || isoOn('2026-05-07', '09:00');
    const duration = overrides.duration || 30;
    const endDateTime = overrides.endDateTime || calculateEndDateTime(startDateTime, duration);

    return {
        id: 'activity-1',
        docType: 'activity',
        startDateTime,
        endDateTime,
        duration,
        ...overrides
    };
}

describe('activity insights intervals', () => {
    test('retains exact elapsed milliseconds for aggregate calculations', () => {
        const interval = {
            start: new Date('2026-05-07T09:00:00.000Z'),
            end: new Date('2026-05-07T09:00:20.000Z')
        };
        const visibleInterval = getDateRangeInterval({
            startDate: '2026-05-07',
            endDate: '2026-05-07'
        });

        expect(getIntervalDurationMilliseconds(interval)).toBe(20000);
        expect(
            getOverlapDurationMilliseconds(
                activity({
                    startDateTime: interval.start.toISOString(),
                    endDateTime: interval.end.toISOString(),
                    duration: 1
                }),
                visibleInterval
            )
        ).toBe(20000);
    });

    test('getDurationCapableInterval returns null for invalid ranges', () => {
        expect(
            getDurationCapableInterval(
                activity({
                    startDateTime: isoOn('2026-05-07', '11:00'),
                    endDateTime: isoOn('2026-05-07', '10:45')
                })
            )
        ).toBeNull();
    });

    test('invalidActivityTouchesInterval keeps bad rows affiliated with their dates', () => {
        const range = getDateRangeInterval({
            startDate: '2026-05-07',
            endDate: '2026-05-07'
        });

        expect(
            invalidActivityTouchesInterval(
                activity({
                    startDateTime: isoOn('2026-05-07', '11:00'),
                    endDateTime: isoOn('2026-05-07', '10:45')
                }),
                range
            )
        ).toBe(true);
        expect(itemOverlapsInterval(activity(), range)).toBe(true);
    });
});

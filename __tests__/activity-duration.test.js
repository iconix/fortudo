/**
 * @jest-environment jsdom
 */

import {
    calculateStoredDurationMinutes,
    formatActivityDuration,
    getExactDurationMilliseconds,
    getItemDurationMilliseconds,
    roundDurationMilliseconds
} from '../public/js/activities/duration.js';

describe('activity duration', () => {
    test('returns exact positive elapsed milliseconds and rejects invalid ranges', () => {
        expect(
            getExactDurationMilliseconds('2026-04-07T09:00:00.000Z', '2026-04-07T09:00:20.000Z')
        ).toBe(20000);
        expect(
            getExactDurationMilliseconds('2026-04-07T09:00:00.000Z', '2026-04-07T09:00:00.000Z')
        ).toBe(0);
        expect(getExactDurationMilliseconds('invalid', 'also-invalid')).toBe(0);
    });

    test('rounds positive elapsed time while keeping sub-minute intervals representable', () => {
        expect(roundDurationMilliseconds(0)).toBe(0);
        expect(roundDurationMilliseconds(20000)).toBe(1);
        expect(roundDurationMilliseconds(60000)).toBe(1);
        expect(roundDurationMilliseconds(90000)).toBe(2);
        expect(roundDurationMilliseconds(Number.NaN)).toBe(0);
    });

    test('calculates the canonical stored duration from exact timestamps', () => {
        expect(
            calculateStoredDurationMinutes('2026-04-07T09:00:00.000Z', '2026-04-07T09:00:20.000Z')
        ).toBe(1);
        expect(
            calculateStoredDurationMinutes('2026-04-07T09:00:00.000Z', '2026-04-07T09:01:30.000Z')
        ).toBe(2);
    });

    test('uses exact item timestamps and falls back to legacy stored minutes', () => {
        expect(
            getItemDurationMilliseconds({
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:00:20.000Z',
                duration: 1
            })
        ).toBe(20000);
        expect(getItemDurationMilliseconds({ duration: 7 })).toBe(420000);
    });

    test('formats only exact positive sub-minute items as less than one minute', () => {
        expect(
            formatActivityDuration({
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:00:20.000Z',
                duration: 1
            })
        ).toBe('<1m');
        expect(
            formatActivityDuration({
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:01:00.000Z',
                duration: 1
            })
        ).toBe('1m');
    });
});

/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/storage.js', () => ({
    putActivity: jest.fn(() => Promise.resolve()),
    loadActivities: jest.fn(() => Promise.resolve([])),
    deleteActivity: jest.fn(() => Promise.resolve()),
    putConfig: jest.fn(() => Promise.resolve()),
    deleteConfig: jest.fn(() => Promise.resolve())
}));

import {
    getActivityById,
    getActivityOverlapTruncationPreviewForDate,
    resetActivityState,
    truncateActivityOverlapsForDate,
    updateActivityState
} from '../public/js/activities/manager.js';
import { putActivity } from '../public/js/storage.js';
import { timeToDateTime } from '../public/js/utils.js';

const SELECTED_DATE = '2026-04-07';

function iso(time, date = SELECTED_DATE) {
    return timeToDateTime(time, date);
}

function isoWithSeconds(time, date = SELECTED_DATE) {
    return new Date(`${date}T${time}`).toISOString();
}

function activity(overrides = {}) {
    return {
        id: 'activity-1',
        docType: 'activity',
        description: 'Activity',
        startDateTime: iso('09:00'),
        endDateTime: iso('10:00'),
        duration: 60,
        source: 'timer',
        sourceTaskId: null,
        ...overrides
    };
}

describe('activity overlap repair production taxonomy', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        putActivity.mockResolvedValue();
        resetActivityState();
    });

    describe('visible-minute boundary', () => {
        test('ignores an exact overlap when both boundaries display as the same minute', () => {
            updateActivityState([
                activity({
                    id: 'earlier',
                    endDateTime: isoWithSeconds('09:45:50'),
                    duration: 46
                }),
                activity({
                    id: 'later',
                    startDateTime: isoWithSeconds('09:45:10'),
                    endDateTime: iso('10:15'),
                    duration: 30
                })
            ]);

            expect(getActivityOverlapTruncationPreviewForDate(SELECTED_DATE)).toEqual(
                expect.objectContaining({
                    changes: [],
                    unresolvedOverlaps: []
                })
            );
        });

        test('offers repair once the displayed end minute is later than the next start minute', () => {
            updateActivityState([
                activity({
                    id: 'earlier',
                    endDateTime: isoWithSeconds('09:45:10'),
                    duration: 45
                }),
                activity({
                    id: 'later',
                    startDateTime: isoWithSeconds('09:44:59'),
                    endDateTime: iso('10:15'),
                    duration: 30
                })
            ]);

            expect(getActivityOverlapTruncationPreviewForDate(SELECTED_DATE).changes).toEqual([
                expect.objectContaining({
                    activityId: 'earlier',
                    nextEndDateTime: isoWithSeconds('09:44:59')
                })
            ]);
        });
    });

    test('preserves an exact positive sub-minute repair interval and stores it as one minute', async () => {
        updateActivityState([
            activity({
                id: 'quick',
                startDateTime: isoWithSeconds('09:44:30'),
                endDateTime: iso('09:46'),
                duration: 2
            }),
            activity({
                id: 'next',
                startDateTime: isoWithSeconds('09:45:10'),
                endDateTime: iso('10:00'),
                duration: 15
            })
        ]);

        const preview = getActivityOverlapTruncationPreviewForDate(SELECTED_DATE);
        expect(preview.changes).toEqual([
            expect.objectContaining({
                activityId: 'quick',
                nextEndDateTime: isoWithSeconds('09:45:10'),
                nextDuration: 1,
                isSubMinute: true
            })
        ]);

        const result = await truncateActivityOverlapsForDate(SELECTED_DATE, preview);

        expect(result.success).toBe(true);
        expect(getActivityById('quick')).toEqual(
            expect.objectContaining({
                endDateTime: isoWithSeconds('09:45:10'),
                duration: 1
            })
        );
    });

    describe('containment', () => {
        test('offers repair when both the containing and contained activities came from timers', () => {
            updateActivityState([
                activity({ id: 'outer', endDateTime: iso('12:00'), duration: 180 }),
                activity({
                    id: 'inner',
                    startDateTime: iso('09:30'),
                    endDateTime: iso('10:00'),
                    duration: 30,
                    source: 'timer'
                })
            ]);

            expect(getActivityOverlapTruncationPreviewForDate(SELECTED_DATE)).toEqual(
                expect.objectContaining({
                    truncatedActivityIds: ['outer'],
                    unresolvedOverlaps: []
                })
            );
        });

        test.each([
            ['manual', 'timer'],
            ['timer', 'manual'],
            ['auto', 'timer'],
            ['timer', 'auto']
        ])('leaves %s-to-%s containment for manual review', (outerSource, innerSource) => {
            updateActivityState([
                activity({
                    id: 'outer',
                    endDateTime: iso('12:00'),
                    duration: 180,
                    source: outerSource
                }),
                activity({
                    id: 'inner',
                    startDateTime: iso('09:30'),
                    endDateTime: iso('10:00'),
                    duration: 30,
                    source: innerSource
                })
            ]);

            expect(getActivityOverlapTruncationPreviewForDate(SELECTED_DATE)).toEqual(
                expect.objectContaining({
                    changes: [],
                    unresolvedOverlaps: [
                        expect.objectContaining({
                            activityId: 'outer',
                            overlappingActivityId: 'inner',
                            reason: 'containment'
                        })
                    ]
                })
            );
        });
    });

    test('keeps an entire same-start cluster unresolved while offering unrelated repairs', () => {
        updateActivityState([
            activity({ id: 'same-a', startDateTime: iso('09:00'), endDateTime: iso('10:00') }),
            activity({ id: 'same-b', startDateTime: iso('09:00'), endDateTime: iso('09:30') }),
            activity({ id: 'same-c', startDateTime: iso('09:00'), endDateTime: iso('09:15') }),
            activity({
                id: 'ordinary-a',
                startDateTime: iso('11:00'),
                endDateTime: iso('12:00'),
                source: 'manual'
            }),
            activity({
                id: 'ordinary-b',
                startDateTime: iso('11:45'),
                endDateTime: iso('12:15'),
                duration: 30,
                source: 'manual'
            })
        ]);

        const preview = getActivityOverlapTruncationPreviewForDate(SELECTED_DATE);

        expect(preview.truncatedActivityIds).toEqual(['ordinary-a']);
        expect(preview.unresolvedOverlaps).toEqual([
            expect.objectContaining({
                reason: 'same-start',
                activityIds: ['same-a', 'same-b', 'same-c']
            })
        ]);
    });

    test('assigns a cross-midnight repair only to the day where the later activity starts', () => {
        updateActivityState([
            activity({
                id: 'crossing',
                startDateTime: iso('23:50', '2026-04-06'),
                endDateTime: iso('00:30'),
                duration: 40
            }),
            activity({
                id: 'after-midnight',
                startDateTime: iso('00:10'),
                endDateTime: iso('00:45'),
                duration: 35
            })
        ]);

        expect(getActivityOverlapTruncationPreviewForDate('2026-04-06').changes).toEqual([]);
        expect(
            getActivityOverlapTruncationPreviewForDate(SELECTED_DATE).truncatedActivityIds
        ).toEqual(['crossing']);
    });

    test('marks adjustments of thirty minutes or more for extra review', () => {
        updateActivityState([
            activity({ id: 'large', endDateTime: iso('11:00'), duration: 120 }),
            activity({
                id: 'next',
                startDateTime: iso('09:30'),
                endDateTime: iso('10:00'),
                duration: 30
            })
        ]);

        expect(getActivityOverlapTruncationPreviewForDate(SELECTED_DATE).changes).toEqual([
            expect.objectContaining({
                activityId: 'large',
                removedDurationMinutes: 90,
                isLargeAdjustment: true
            })
        ]);
    });

    test('applies only the repair rows selected in the approved preview', async () => {
        updateActivityState([
            activity({ id: 'first', endDateTime: iso('10:30'), duration: 90 }),
            activity({
                id: 'second',
                startDateTime: iso('10:00'),
                endDateTime: iso('11:30'),
                duration: 90
            }),
            activity({
                id: 'third',
                startDateTime: iso('11:00'),
                endDateTime: iso('12:00'),
                duration: 60
            })
        ]);
        const preview = getActivityOverlapTruncationPreviewForDate(SELECTED_DATE);

        const result = await truncateActivityOverlapsForDate(SELECTED_DATE, {
            ...preview,
            selectedActivityIds: ['second']
        });

        expect(result).toEqual({
            success: true,
            truncatedCount: 1,
            truncatedActivityIds: ['second']
        });
        expect(getActivityById('first').endDateTime).toBe(iso('10:30'));
        expect(getActivityById('second').endDateTime).toBe(iso('11:00'));
        expect(putActivity).toHaveBeenCalledTimes(1);
    });
});

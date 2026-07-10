/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    getGroupByKey: jest.fn((key) => {
        if (key === 'work') {
            return { key: 'work', label: 'Work', color: '#0f172a' };
        }

        return null;
    }),
    resolveCategoryKey: jest.fn((key) => {
        if (key === 'work/deep') {
            return {
                kind: 'category',
                record: {
                    key: 'work/deep',
                    label: 'Deep Work',
                    groupKey: 'work',
                    color: '#0ea5e9'
                }
            };
        }

        return null;
    })
}));

import {
    buildTrendModel,
    getDefaultTrendDateRange
} from '../public/js/activities/insights-trends.js';
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
        category: 'work/deep',
        ...overrides
    };
}

describe('activity insights trends', () => {
    test('getDefaultTrendDateRange returns the last local days ending at today', () => {
        expect(getDefaultTrendDateRange(new Date(isoOn('2026-05-07', '12:00')), 3)).toEqual({
            startDate: '2026-05-05',
            endDate: '2026-05-07'
        });
        expect(getDefaultTrendDateRange(new Date(isoOn('2026-05-07', '12:00')))).toEqual({
            startDate: '2026-05-01',
            endDate: '2026-05-07'
        });
    });

    test('buildTrendModel builds daily buckets and parent category totals', () => {
        const model = buildTrendModel({
            activities: [
                activity({
                    id: 'old-work',
                    startDateTime: isoOn('2026-05-06', '09:00'),
                    endDateTime: isoOn('2026-05-06', '09:30'),
                    duration: 30
                }),
                activity({
                    id: 'work',
                    startDateTime: isoOn('2026-05-07', '09:00'),
                    endDateTime: isoOn('2026-05-07', '10:00'),
                    duration: 60
                })
            ],
            now: new Date(isoOn('2026-05-07', '12:00'))
        });

        expect(model.dailyHours).toHaveLength(7);
        expect(model.dailyHours.at(-1)).toEqual(
            expect.objectContaining({
                date: '2026-05-07',
                minutes: 60,
                activityCount: 1,
                categorySegments: expect.arrayContaining([
                    expect.objectContaining({ key: 'work', minutes: 60 })
                ])
            })
        );
        expect(model.categoryTotals).toEqual([
            expect.objectContaining({ key: 'work', label: 'Work', minutes: 90 })
        ]);
    });

    test('buildTrendModel splits midnight-crossing activities across local day buckets', () => {
        const startDateTime = isoOn('2026-05-06', '23:30');
        const endDateTime = calculateEndDateTime(startDateTime, 60);

        const model = buildTrendModel({
            activities: [
                activity({
                    id: 'crossing-activity',
                    startDateTime,
                    endDateTime,
                    duration: 60
                })
            ],
            dateRange: { startDate: '2026-05-06', endDate: '2026-05-07' },
            now: new Date(isoOn('2026-05-07', '12:00'))
        });

        expect(model.dailyHours).toEqual([
            expect.objectContaining({
                date: '2026-05-06',
                minutes: 30,
                activityCount: 1,
                categorySegments: expect.arrayContaining([
                    expect.objectContaining({ key: 'work', minutes: 30 })
                ])
            }),
            expect.objectContaining({
                date: '2026-05-07',
                minutes: 30,
                activityCount: 1,
                categorySegments: expect.arrayContaining([
                    expect.objectContaining({ key: 'work', minutes: 30 })
                ])
            })
        ]);
        expect(model.categoryTotals).toEqual([
            expect.objectContaining({ key: 'work', minutes: 60 })
        ]);
    });

    test('buildTrendModel marks daily buckets with activity data issue counts', () => {
        const model = buildTrendModel({
            activities: [
                activity({
                    id: 'clean-day',
                    startDateTime: isoOn('2026-05-06', '09:00'),
                    endDateTime: isoOn('2026-05-06', '09:30'),
                    duration: 30
                }),
                activity({
                    id: 'overlapped',
                    startDateTime: isoOn('2026-05-07', '09:00'),
                    endDateTime: isoOn('2026-05-07', '10:00'),
                    duration: 60
                }),
                activity({
                    id: 'overlapping',
                    startDateTime: isoOn('2026-05-07', '09:30'),
                    endDateTime: isoOn('2026-05-07', '10:15'),
                    duration: 45
                })
            ],
            dateRange: { startDate: '2026-05-06', endDate: '2026-05-07' },
            now: new Date(isoOn('2026-05-07', '12:00'))
        });

        expect(model.dailyHours).toEqual([
            expect.objectContaining({
                date: '2026-05-06',
                issueCount: 0
            }),
            expect.objectContaining({
                date: '2026-05-07',
                issueCount: 1
            })
        ]);
    });
});

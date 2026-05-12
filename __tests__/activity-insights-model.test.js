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
        if (key === 'work') {
            return {
                kind: 'group',
                record: { key: 'work', label: 'Work', color: '#0f172a' }
            };
        }

        return null;
    })
}));

import {
    buildInsightsModel,
    buildTrendModel,
    detectActivityDataIssues,
    getDefaultTrendDateRange
} from '../public/js/activities/insights-model.js';

function isoAt(time) {
    return `2026-05-07T${time}:00.000Z`;
}

function isoOn(date, time) {
    return `${date}T${time}:00.000Z`;
}

function scheduledTask(overrides = {}) {
    const startDateTime = overrides.startDateTime || isoAt('09:00');
    const duration = overrides.duration || 30;
    const endDateTime =
        overrides.endDateTime ||
        new Date(new Date(startDateTime).getTime() + duration * 60 * 1000).toISOString();

    return {
        id: 'task-1',
        type: 'scheduled',
        title: 'Deep work',
        startDateTime,
        endDateTime,
        duration,
        status: 'pending',
        category: 'work/deep',
        ...overrides
    };
}

function activity(overrides = {}) {
    const startDateTime = overrides.startDateTime || isoAt('09:00');
    const duration = overrides.duration || 30;
    const endDateTime =
        overrides.endDateTime ||
        new Date(new Date(startDateTime).getTime() + duration * 60 * 1000).toISOString();

    return {
        id: 'activity-1',
        docType: 'activity',
        title: 'Actual focus',
        startDateTime,
        endDateTime,
        duration,
        source: 'task',
        sourceTaskId: 'task-1',
        category: 'work/deep',
        ...overrides
    };
}

describe('activity insights model', () => {
    test('buildInsightsModel builds today summary stats and timeline blocks', () => {
        const model = buildInsightsModel({
            tasks: [
                scheduledTask({
                    id: 'task-1',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('10:00'),
                    duration: 60,
                    status: 'completed'
                }),
                scheduledTask({
                    id: 'task-2',
                    startDateTime: isoAt('11:00'),
                    endDateTime: isoAt('11:30'),
                    duration: 30,
                    status: 'pending'
                }),
                scheduledTask({
                    id: 'old-task',
                    startDateTime: isoOn('2026-05-06', '09:00'),
                    endDateTime: isoOn('2026-05-06', '10:00'),
                    duration: 60
                })
            ],
            activities: [
                activity({
                    id: 'activity-1',
                    startDateTime: isoAt('09:05'),
                    endDateTime: isoAt('09:45'),
                    duration: 40,
                    sourceTaskId: 'task-1'
                }),
                activity({
                    id: 'activity-2',
                    startDateTime: isoAt('10:00'),
                    endDateTime: isoAt('10:30'),
                    duration: 30,
                    sourceTaskId: null,
                    source: 'manual'
                }),
                activity({
                    id: 'old-activity',
                    startDateTime: isoOn('2026-05-06', '10:00'),
                    endDateTime: isoOn('2026-05-06', '10:30')
                })
            ],
            now: new Date(isoAt('10:45')),
            activityLogDateRange: { startDate: '2026-05-07', endDate: '2026-05-07' }
        });

        expect(model.summary).toEqual({
            totalPlannedMinutes: 90,
            totalActualMinutes: 70,
            completedTaskCount: 1,
            currentlyLateTaskCount: 0
        });
        expect(model.plannedBlocks).toHaveLength(2);
        expect(model.actualBlocks).toHaveLength(2);
        expect(model.actualBlocks[0]).toEqual(
            expect.objectContaining({
                id: 'activity-1',
                duration: 40,
                source: 'task',
                sourceTaskId: 'task-1',
                categoryMeta: expect.objectContaining({ key: 'work/deep', color: '#0ea5e9' })
            })
        );
        expect(model.actualBlocks[0].leftPercent).toBeGreaterThanOrEqual(0);
        expect(model.actualBlocks[0].widthPercent).toBeGreaterThan(0);
    });

    test('buildInsightsModel normalizes today running activity with effective end time', () => {
        const now = new Date(isoAt('10:30'));
        const runningActivity = activity({
            id: 'running-activity',
            startDateTime: isoAt('10:00'),
            endDateTime: undefined,
            duration: undefined,
            source: 'timer',
            sourceTaskId: null
        });

        const model = buildInsightsModel({
            tasks: [],
            activities: [],
            runningActivity,
            now,
            activityLogDateRange: { startDate: '2026-05-07', endDate: '2026-05-07' }
        });

        expect(model.summary.totalActualMinutes).toBe(30);
        expect(model.actualBlocks).toEqual([
            expect.objectContaining({
                id: 'running-activity',
                duration: 30,
                endDateTime: now.toISOString()
            })
        ]);
        expect(model.issues).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'invalid-range',
                    activityId: 'running-activity'
                })
            ])
        );
    });

    test('buildInsightsModel filters the Insights Activity Log by selected date range', () => {
        const model = buildInsightsModel({
            tasks: [],
            activities: [
                activity({
                    id: 'today-activity',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('09:30')
                }),
                activity({
                    id: 'old-activity',
                    startDateTime: isoOn('2026-05-06', '09:00'),
                    endDateTime: isoOn('2026-05-06', '09:30')
                })
            ],
            now: new Date(isoAt('12:00')),
            activityLogDateRange: { startDate: '2026-05-06', endDate: '2026-05-06' }
        });

        expect(model.activityLog.map((entry) => entry.id)).toEqual(['old-activity']);
    });

    test('buildInsightsModel sorts the Activity Log by newest end time', () => {
        const model = buildInsightsModel({
            tasks: [],
            activities: [
                activity({
                    id: 'long-ends-later',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('11:00'),
                    duration: 120
                }),
                activity({
                    id: 'short-starts-later',
                    startDateTime: isoAt('10:00'),
                    endDateTime: isoAt('10:30'),
                    duration: 30
                }),
                activity({
                    id: 'same-end-later-start',
                    startDateTime: isoAt('10:15'),
                    endDateTime: isoAt('10:30'),
                    duration: 15
                })
            ],
            now: new Date(isoAt('12:00')),
            activityLogDateRange: { startDate: '2026-05-07', endDate: '2026-05-07' }
        });

        expect(model.activityLog.map((entry) => entry.id)).toEqual([
            'long-ends-later',
            'same-end-later-start',
            'short-starts-later'
        ]);
    });

    test('buildInsightsModel detects activityLogIssues inside the selected historical range', () => {
        const model = buildInsightsModel({
            tasks: [],
            activities: [
                activity({
                    id: 'old-1',
                    startDateTime: isoOn('2026-05-06', '09:00'),
                    endDateTime: isoOn('2026-05-06', '10:00')
                }),
                activity({
                    id: 'old-2',
                    startDateTime: isoOn('2026-05-06', '09:30'),
                    endDateTime: isoOn('2026-05-06', '10:15'),
                    source: 'manual',
                    sourceTaskId: null
                }),
                activity({
                    id: 'today-activity',
                    startDateTime: isoAt('12:00'),
                    endDateTime: isoAt('12:30')
                })
            ],
            now: new Date(isoAt('12:45')),
            activityLogDateRange: { startDate: '2026-05-06', endDate: '2026-05-06' }
        });

        expect(model.activityLogIssues).toEqual([
            expect.objectContaining({
                type: 'overlap',
                activityId: 'old-2',
                overlappingActivityId: 'old-1'
            })
        ]);
        expect(model.issues).toEqual([]);
    });

    test('detectActivityDataIssues detects overlap, invalid-range, and duplicate-auto', () => {
        const issues = detectActivityDataIssues([
            activity({
                id: 'activity-1',
                startDateTime: isoAt('09:00'),
                endDateTime: isoAt('10:00'),
                source: 'task',
                sourceTaskId: 'task-1'
            }),
            activity({
                id: 'activity-2',
                startDateTime: isoAt('09:30'),
                endDateTime: isoAt('10:30'),
                source: 'manual',
                sourceTaskId: null
            }),
            activity({
                id: 'activity-3',
                startDateTime: isoAt('11:00'),
                endDateTime: isoAt('10:45')
            }),
            activity({
                id: 'activity-4',
                startDateTime: isoAt('12:00'),
                endDateTime: isoAt('12:30'),
                source: 'task',
                sourceTaskId: 'task-1'
            })
        ]);

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'overlap',
                    activityId: 'activity-2',
                    overlappingActivityId: 'activity-1'
                }),
                expect.objectContaining({ type: 'invalid-range', activityId: 'activity-3' }),
                expect.objectContaining({
                    type: 'duplicate-auto',
                    activityId: 'activity-4',
                    sourceTaskId: 'task-1'
                })
            ])
        );
    });

    test('buildTrendModel builds filtered daily buckets and parent category totals', () => {
        const model = buildTrendModel({
            activities: [
                activity({
                    id: 'old-work',
                    startDateTime: isoOn('2026-05-06', '09:00'),
                    endDateTime: isoOn('2026-05-06', '09:30'),
                    duration: 30
                }),
                activity({
                    id: 'today-work',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('10:00'),
                    duration: 60
                }),
                activity({
                    id: 'outside-range',
                    startDateTime: isoOn('2026-04-23', '09:00'),
                    endDateTime: isoOn('2026-04-23', '10:00'),
                    duration: 60
                })
            ],
            now: new Date(isoAt('12:00'))
        });

        expect(model.dailyHours).toHaveLength(14);
        expect(model.dailyHours.at(-1)).toEqual({
            date: '2026-05-07',
            minutes: 60,
            categorySegments: [
                {
                    key: 'work',
                    label: 'Work',
                    color: '#0f172a',
                    minutes: 60
                }
            ]
        });
        expect(model.categoryTotals[0]).toEqual({
            key: 'work',
            label: 'Work',
            color: '#0f172a',
            minutes: 90
        });
    });

    test('getDefaultTrendDateRange returns the last 14 local days ending today', () => {
        expect(getDefaultTrendDateRange(new Date(isoAt('12:00')))).toEqual({
            startDate: '2026-04-24',
            endDate: '2026-05-07'
        });
    });
});

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

import { buildInsightsModel } from '../public/js/activities/insights-model.js';
import { calculateEndDateTime, timeToDateTime } from '../public/js/utils.js';

function isoAt(time) {
    return timeToDateTime(time, '2026-05-07');
}

function isoOn(date, time) {
    return timeToDateTime(time, date);
}

function addMinutes(startDateTime, duration) {
    return calculateEndDateTime(startDateTime, duration);
}

function scheduledTask(overrides = {}) {
    const startDateTime = overrides.startDateTime || isoAt('09:00');
    const duration = overrides.duration || 30;
    const endDateTime = overrides.endDateTime || addMinutes(startDateTime, duration);

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
    const endDateTime = overrides.endDateTime || addMinutes(startDateTime, duration);

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
    test('buildInsightsModel scopes summary timeline and log to selectedDate', () => {
        const now = new Date(isoOn('2026-06-16', '12:00'));
        const tasks = [
            scheduledTask({
                id: 'today-task',
                description: 'today plan',
                startDateTime: isoOn('2026-06-16', '10:00'),
                endDateTime: isoOn('2026-06-16', '10:30'),
                duration: 30,
                status: 'completed'
            }),
            scheduledTask({
                id: 'yesterday-task',
                description: 'yesterday plan',
                startDateTime: isoOn('2026-06-15', '09:00'),
                endDateTime: isoOn('2026-06-15', '10:00'),
                duration: 60,
                status: 'completed'
            })
        ];
        const activities = [
            activity({
                id: 'today-activity',
                description: 'today actual',
                startDateTime: isoOn('2026-06-16', '10:00'),
                endDateTime: isoOn('2026-06-16', '10:30'),
                duration: 30
            }),
            activity({
                id: 'yesterday-activity',
                description: 'yesterday actual',
                startDateTime: isoOn('2026-06-15', '09:00'),
                endDateTime: isoOn('2026-06-15', '09:45'),
                duration: 45
            })
        ];

        const model = buildInsightsModel({
            tasks,
            activities,
            now,
            selectedDate: '2026-06-15'
        });

        expect(model.date).toBe('2026-06-15');
        expect(model.summary.totalPlannedMinutes).toBe(60);
        expect(model.summary.totalActualMinutes).toBe(45);
        expect(model.plannedBlocks.map((block) => block.id)).toEqual(['yesterday-task']);
        expect(model.actualBlocks.map((block) => block.id)).toEqual(['yesterday-activity']);
        expect(model.activityLog.map((entry) => entry.id)).toEqual(['yesterday-activity']);
    });

    test('buildInsightsModel includes running activity only when it overlaps selectedDate', () => {
        const now = new Date(isoOn('2026-06-16', '10:30'));
        const runningActivity = {
            id: 'config-running-activity',
            description: 'live work',
            startDateTime: isoOn('2026-06-16', '10:00'),
            category: null
        };

        const todayModel = buildInsightsModel({
            runningActivity,
            now,
            selectedDate: '2026-06-16'
        });
        const yesterdayModel = buildInsightsModel({
            runningActivity,
            now,
            selectedDate: '2026-06-15'
        });

        expect(todayModel.actualBlocks).toHaveLength(1);
        expect(yesterdayModel.actualBlocks).toHaveLength(0);
    });

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
        const runningActivity = {
            description: 'Running focus',
            category: 'work/deep',
            startDateTime: isoAt('10:00'),
            source: 'timer',
            sourceTaskId: null
        };

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
                docType: 'activity',
                description: 'Running focus',
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

    test('buildInsightsModel counts only the portion of previous-day items overlapping today', () => {
        const crossingTaskStart = isoOn('2026-05-06', '23:30');
        const crossingTaskEnd = addMinutes(crossingTaskStart, 60);
        const crossingActivityStart = isoOn('2026-05-06', '23:30');
        const crossingActivityEnd = addMinutes(crossingActivityStart, 60);

        const model = buildInsightsModel({
            tasks: [
                scheduledTask({
                    id: 'crossing-task',
                    startDateTime: crossingTaskStart,
                    endDateTime: crossingTaskEnd,
                    duration: 60,
                    status: 'pending'
                })
            ],
            activities: [
                activity({
                    id: 'crossing-activity',
                    startDateTime: crossingActivityStart,
                    endDateTime: crossingActivityEnd,
                    duration: 60
                })
            ],
            now: new Date(isoAt('08:00')),
            activityLogDateRange: { startDate: '2026-05-07', endDate: '2026-05-07' }
        });

        expect(model.summary.totalPlannedMinutes).toBe(30);
        expect(model.summary.totalActualMinutes).toBe(30);
        expect(model.plannedBlocks.map((block) => block.id)).toEqual(['crossing-task']);
        expect(model.actualBlocks.map((block) => block.id)).toEqual(['crossing-activity']);
    });

    test('buildInsightsModel clips previous-day timeline blocks to today bounds', () => {
        const startDateTime = isoOn('2026-05-06', '23:30');
        const endDateTime = addMinutes(startDateTime, 60);

        const model = buildInsightsModel({
            tasks: [
                scheduledTask({
                    id: 'crossing-task',
                    startDateTime,
                    endDateTime,
                    duration: 60
                })
            ],
            activities: [],
            now: new Date(isoAt('08:00')),
            activityLogDateRange: { startDate: '2026-05-07', endDate: '2026-05-07' }
        });

        expect(model.plannedBlocks).toEqual([
            expect.objectContaining({
                id: 'crossing-task',
                startDateTime: isoAt('00:00'),
                endDateTime: isoAt('00:30'),
                duration: 30
            })
        ]);
        expect(model.plannedBlocks[0].leftPercent).toBe(0);
        expect(model.plannedBlocks[0].widthPercent).toBeCloseTo((30 / (24 * 60)) * 100);
        expect(
            model.plannedBlocks[0].leftPercent + model.plannedBlocks[0].widthPercent
        ).toBeLessThanOrEqual(100);
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

    test('buildInsightsModel keeps invalid-range activities in the selected Activity Log', () => {
        const model = buildInsightsModel({
            tasks: [],
            activities: [
                activity({
                    id: 'invalid-range',
                    startDateTime: isoOn('2026-05-06', '11:00'),
                    endDateTime: isoOn('2026-05-06', '10:45')
                }),
                activity({
                    id: 'valid-range',
                    startDateTime: isoOn('2026-05-06', '09:00'),
                    endDateTime: isoOn('2026-05-06', '09:30')
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

        expect(model.activityLog.map((entry) => entry.id)).toEqual([
            'invalid-range',
            'valid-range'
        ]);
        expect(model.activityLogIssues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'invalid-range',
                    activityId: 'invalid-range'
                })
            ])
        );
    });
});

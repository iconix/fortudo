/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/activities/manager.js', () => ({
    getActivityState: jest.fn(() => []),
    getRunningActivity: jest.fn(() => null)
}));

jest.mock('../public/js/activities/renderer.js', () => ({
    renderActivities: jest.fn()
}));

import { setupDOM } from './test-utils.js';
import { getActivityState, getRunningActivity } from '../public/js/activities/manager.js';
import { renderActivities } from '../public/js/activities/renderer.js';
import {
    expandInsightsActivityLogLimit,
    renderInsightsView
} from '../public/js/activities/insights-renderer.js';
import { replaceTaxonomyState } from '../public/js/taxonomy/taxonomy-store.js';
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
        description: 'Deep work',
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
        description: 'Actual focus',
        startDateTime,
        endDateTime,
        duration,
        source: 'task',
        sourceTaskId: 'task-1',
        category: 'work/deep',
        ...overrides
    };
}

function renderWith({ tasks = [], activities = [], now = new Date(isoAt('12:00')) } = {}) {
    getActivityState.mockReturnValue(activities);
    getRunningActivity.mockReturnValue(null);

    renderInsightsView({
        tasks,
        now,
        activityRenderOptions: { confirmingDeleteActivityId: 'activity-3' }
    });
}

describe('activity insights renderer', () => {
    beforeEach(() => {
        setupDOM();
        jest.clearAllMocks();
        replaceTaxonomyState({
            groups: [{ key: 'work', label: 'Work', color: '#0f172a', colorFamily: 'blue' }],
            categories: [
                {
                    key: 'work/deep',
                    label: 'Deep Work',
                    groupKey: 'work',
                    color: '#0ea5e9',
                    isLinkedToGroupFamily: true
                }
            ]
        });
    });

    test('renderInsightsView renders summary stats and category-colored timeline blocks', () => {
        renderWith({
            tasks: [
                scheduledTask({
                    id: 'task-1',
                    description: 'Plan focus',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('10:00'),
                    duration: 60,
                    status: 'completed'
                }),
                scheduledTask({
                    id: 'task-2',
                    description: 'Late task',
                    startDateTime: isoAt('10:00'),
                    endDateTime: isoAt('10:30'),
                    duration: 30,
                    status: 'pending'
                })
            ],
            activities: [
                activity({
                    id: 'activity-1',
                    description: 'Actual focus',
                    startDateTime: isoAt('09:05'),
                    endDateTime: isoAt('09:45'),
                    duration: 40
                })
            ],
            now: new Date(isoAt('11:00'))
        });

        const summary = document.getElementById('insights-summary');
        const timeline = document.getElementById('insights-timeline');
        const plannedBlock = timeline.querySelector('[data-timeline-block="planned"]');
        const actualBlock = timeline.querySelector('[data-timeline-block="actual"]');

        expect(summary.textContent).toContain('Planned');
        expect(summary.textContent).toContain('1h 30m');
        expect(summary.textContent).toContain('Actual');
        expect(summary.textContent).toContain('40m');
        expect(summary.textContent).toContain('Completed');
        expect(summary.textContent).toContain('1');
        expect(summary.textContent).toContain('Currently Late');
        expect(summary.textContent).toContain('1');
        expect(plannedBlock).not.toBeNull();
        expect(actualBlock).not.toBeNull();
        expect(plannedBlock.getAttribute('style')).toContain('#0ea5e9');
        expect(plannedBlock.getAttribute('title')).toContain('Plan focus');
        expect(actualBlock.textContent).toContain('Actual focus');
    });

    test('renderInsightsView renders visible Activity Log activities with summary metadata', () => {
        const activities = [
            activity({ id: 'activity-1', endDateTime: isoAt('09:30') }),
            activity({ id: 'activity-2', endDateTime: isoAt('10:30') })
        ];

        renderWith({ activities });

        expect(renderActivities).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ id: 'activity-2' })]),
            document.getElementById('insights-activity-list'),
            expect.objectContaining({
                confirmingDeleteActivityId: 'activity-3',
                summaryActivities: expect.arrayContaining([
                    expect.objectContaining({ id: 'activity-1' }),
                    expect.objectContaining({ id: 'activity-2' })
                ]),
                activityIssuesById: expect.any(Map)
            })
        );
    });

    test('long Activity Logs are bounded until expanded', () => {
        const activities = Array.from({ length: 55 }, (_, index) =>
            activity({
                id: `activity-${index + 1}`,
                startDateTime: isoAt('09:00'),
                endDateTime: isoAt('09:30')
            })
        );

        renderWith({ activities });

        expect(renderActivities).toHaveBeenLastCalledWith(
            expect.arrayContaining([expect.objectContaining({ id: 'activity-50' })]),
            document.getElementById('insights-activity-list'),
            expect.objectContaining({ summaryActivities: expect.any(Array) })
        );
        expect(renderActivities.mock.calls.at(-1)[0]).toHaveLength(50);
        expect(document.querySelector('[data-show-more-activities]')).not.toBeNull();

        expandInsightsActivityLogLimit(50);
        renderWith({ activities });

        expect(renderActivities.mock.calls.at(-1)[0]).toHaveLength(55);
        expect(document.querySelector('[data-show-more-activities]')).toBeNull();
    });

    test('initial Activity Log uses the default 14-day trend range', () => {
        renderWith({
            activities: [
                activity({
                    id: 'inside-range',
                    startDateTime: isoOn('2026-04-24', '09:00'),
                    endDateTime: isoOn('2026-04-24', '09:30')
                }),
                activity({
                    id: 'outside-range',
                    startDateTime: isoOn('2026-04-23', '09:00'),
                    endDateTime: isoOn('2026-04-23', '09:30')
                })
            ],
            now: new Date(isoAt('12:00'))
        });

        expect(renderActivities.mock.calls.at(-1)[0]).toEqual([
            expect.objectContaining({ id: 'inside-range' })
        ]);
    });
});

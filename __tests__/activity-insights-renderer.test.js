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
import { getByRole } from '@testing-library/dom';
import { getActivityState, getRunningActivity } from '../public/js/activities/manager.js';
import { renderActivities } from '../public/js/activities/renderer.js';
import {
    expandInsightsActivityLogLimit,
    renderInsightsView,
    setSelectedTimelineBlock,
    setInsightsTrendDateRange
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

function restorePrototypeDescriptor(property, descriptor) {
    if (descriptor) {
        Object.defineProperty(window.HTMLElement.prototype, property, descriptor);
    } else {
        delete window.HTMLElement.prototype[property];
    }
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

function renderWith({
    tasks = [],
    activities = [],
    now = new Date(isoAt('12:00')),
    dateRange = null,
    selectedDate = null,
    overlapRepairEnabled
} = {}) {
    getActivityState.mockReturnValue(activities);
    getRunningActivity.mockReturnValue(null);

    renderInsightsView({
        tasks,
        now,
        dateRange,
        selectedDate,
        activityRenderOptions: {
            confirmingDeleteActivityId: 'activity-3',
            overlapRepairEnabled
        }
    });
}

describe('activity insights renderer', () => {
    beforeEach(() => {
        setupDOM();
        jest.clearAllMocks();
        expandInsightsActivityLogLimit(0);
        setInsightsTrendDateRange(null);
        setSelectedTimelineBlock(null);
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
        expect(plannedBlock.className).toContain('cursor-pointer');
        expect(actualBlock.className).toContain('cursor-pointer');
        expect(plannedBlock.getAttribute('style')).toContain('#0ea5e9');
        expect(plannedBlock.getAttribute('title')).toContain('Plan focus');
        expect(actualBlock.textContent).toContain('Actual focus');
    });

    test('timeline block category color falls back when taxonomy color is unsafe', () => {
        replaceTaxonomyState({
            groups: [{ key: 'work', label: 'Work', color: '#0f172a', colorFamily: 'blue' }],
            categories: [
                {
                    key: 'work/deep',
                    label: 'Deep Work',
                    groupKey: 'work',
                    color: '#0ea5e9; background-image: url(javascript:alert(1))',
                    isLinkedToGroupFamily: true
                }
            ]
        });

        renderWith({ tasks: [scheduledTask()] });

        const plannedBlock = document.querySelector('[data-timeline-block="planned"]');

        expect(plannedBlock.getAttribute('style')).toContain('background-color: #64748b;');
        expect(plannedBlock.getAttribute('style')).not.toContain('javascript:');
    });

    test('timeline blocks include accessible text with label time range and duration', () => {
        renderWith({
            tasks: [
                scheduledTask({
                    description: 'Plan focus',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('10:00'),
                    duration: 60
                })
            ],
            activities: [
                activity({
                    description: 'Actual focus',
                    startDateTime: isoAt('09:05'),
                    endDateTime: isoAt('09:45'),
                    duration: 40
                })
            ]
        });

        const plannedBlock = document.querySelector('[data-timeline-block="planned"]');
        const actualBlock = document.querySelector('[data-timeline-block="actual"]');

        expect(plannedBlock.querySelector('.sr-only').textContent).toBe(
            'Plan focus, 9:00 AM - 10:00 AM, 1h'
        );
        expect(actualBlock.querySelector('.sr-only').textContent).toBe(
            'Actual focus, 9:05 AM - 9:45 AM, 40m'
        );
    });

    test('timeline blocks expose full accessible labels through an image role', () => {
        renderWith({
            tasks: [
                scheduledTask({
                    description: 'Plan focus',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('10:00'),
                    duration: 60
                })
            ],
            activities: [
                activity({
                    description: 'Actual focus',
                    startDateTime: isoAt('09:05'),
                    endDateTime: isoAt('09:45'),
                    duration: 40
                })
            ]
        });

        const plannedBlock = getByRole(document.body, 'img', {
            name: 'Plan focus, 9:00 AM - 10:00 AM, 1h'
        });
        const actualBlock = getByRole(document.body, 'img', {
            name: 'Actual focus, 9:05 AM - 9:45 AM, 40m'
        });

        expect(plannedBlock.dataset.timelineBlock).toBe('planned');
        expect(actualBlock.dataset.timelineBlock).toBe('actual');
    });

    test('timeline renders focused range and compact narrow blocks', () => {
        renderInsightsView({
            tasks: [
                scheduledTask({
                    id: 'planned-1',
                    description: 'meeting',
                    startDateTime: isoAt('10:20'),
                    endDateTime: isoAt('10:40'),
                    duration: 20,
                    status: 'pending'
                })
            ],
            activities: [
                activity({
                    id: 'actual-1',
                    description: 'standup',
                    startDateTime: isoAt('10:00'),
                    endDateTime: isoAt('10:30'),
                    duration: 30
                }),
                activity({
                    id: 'actual-2',
                    description: 'tiny review',
                    startDateTime: isoAt('10:39'),
                    endDateTime: isoAt('10:48'),
                    duration: 9
                })
            ],
            now: new Date(isoAt('12:00')),
            selectedDate: '2026-05-07'
        });

        expect(document.querySelector('[data-timeline-range]').textContent).toContain('9:30 AM');
        expect(document.querySelector('[data-timeline-range]').textContent).toContain('11:18 AM');
        const narrow = document.querySelector('[data-timeline-block-id="actual-2"]');
        expect(narrow.dataset.compact).toBe('true');
        expect(narrow.querySelector('[data-timeline-visible-label]')).toBeNull();
        expect(narrow.querySelector('.sr-only').textContent).toContain('tiny review');
    });

    test('timeline blocks meet minimum mobile touch target height', () => {
        renderWith({ tasks: [scheduledTask()] });

        const block = document.querySelector('[data-timeline-block-id="task-1"]');

        expect(block).not.toBeNull();
        expect(block.className).toContain('min-h-[44px]');
        expect(block.className).toContain('leading-[44px]');
    });

    test('timeline visible labels stay single-line within fixed-height blocks', () => {
        renderWith({
            activities: [
                activity({
                    id: 'activity-1',
                    description: 'Preview personal activity',
                    startDateTime: isoAt('08:45'),
                    endDateTime: isoAt('09:00'),
                    duration: 15
                })
            ]
        });

        const block = document.querySelector('[data-timeline-block-id="activity-1"]');
        const visibleLabel = block.querySelector('[data-timeline-visible-label]');

        expect(block.className).toContain('h-[44px]');
        expect(visibleLabel.className).toContain('truncate');
        expect(visibleLabel.className).toContain('whitespace-nowrap');
    });

    test('timeline row containers allow taller mobile touch targets', () => {
        renderWith({ tasks: [scheduledTask()] });

        const rowContainer = document
            .querySelector('[data-timeline-block="planned"]')
            ?.closest('.relative');

        expect(rowContainer).not.toBeNull();
        expect(rowContainer.className).toContain('min-h-[3.5rem]');
    });

    test('timeline midpoint tick is hidden on narrow screens', () => {
        renderWith({ tasks: [scheduledTask()] });

        const ticks = document
            .getElementById('insights-timeline')
            .querySelector('.grid.grid-cols-3');
        const midpointTick = ticks.querySelectorAll('span')[1];
        const endTick = ticks.querySelectorAll('span')[2];

        expect(midpointTick.className).toContain('hidden');
        expect(midpointTick.className).toContain('sm:block');
        expect(endTick.className).toContain('col-start-3');
    });

    test('timeline selected block detail follows selected timeline block state', () => {
        setSelectedTimelineBlock('actual-2');

        renderInsightsView({
            activities: [
                activity({
                    id: 'actual-1',
                    description: 'standup',
                    startDateTime: isoAt('10:00'),
                    endDateTime: isoAt('10:30'),
                    duration: 30
                }),
                activity({
                    id: 'actual-2',
                    description: 'tiny review',
                    startDateTime: isoAt('10:39'),
                    endDateTime: isoAt('10:48'),
                    duration: 9
                })
            ],
            now: new Date(isoAt('12:00')),
            selectedDate: '2026-05-07'
        });

        const detail = document.querySelector('[data-selected-timeline-block]');
        const selectedBlock = document.querySelector('[data-timeline-block-id="actual-2"]');
        expect(detail.textContent).toContain('tiny review');
        expect(detail.textContent).toContain('10:39 AM - 10:48 AM');
        expect(detail.textContent).toContain('9m');
        expect(selectedBlock.dataset.selected).toBe('true');
        expect(selectedBlock.className).toContain('shadow-sky');
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
                activityIssuesById: expect.any(Object)
            })
        );
    });

    test('activity log title and rows are scoped to selected day', () => {
        renderInsightsView({
            activities: [
                activity({
                    id: 'selected-day',
                    description: 'selected day activity',
                    startDateTime: isoOn('2026-05-06', '10:00'),
                    endDateTime: isoOn('2026-05-06', '10:30'),
                    duration: 30
                }),
                activity({
                    id: 'other-day',
                    description: 'other day activity',
                    startDateTime: isoAt('10:00'),
                    endDateTime: isoAt('10:30'),
                    duration: 30
                })
            ],
            now: new Date(isoAt('12:00')),
            selectedDate: '2026-05-06'
        });

        expect(document.getElementById('insights-selected-day').textContent).toContain(
            'Wed, May 6'
        );
        expect(document.getElementById('insights-selected-day').textContent).toContain(
            'Summary, timeline, and activity log are scoped to this day.'
        );
        expect(
            document.getElementById('insights-activity-log').querySelector('h3').textContent
        ).toBe('Activity Log');
        expect(renderActivities.mock.calls.at(-1)[0]).toEqual([
            expect.objectContaining({ id: 'selected-day' })
        ]);
    });

    test('selected-day context renders between Trends and day detail sections', () => {
        setupDOM();

        const insightsView = document.getElementById('insights-view');
        const children = [...insightsView.children].map((child) => child.id);

        expect(children.indexOf('insights-selected-day')).toBeGreaterThan(
            children.indexOf('insights-trends')
        );
        expect(children.indexOf('insights-selected-day')).toBeLessThan(
            children.indexOf('insights-summary')
        );
        expect(children.indexOf('insights-selected-day')).toBeLessThan(
            children.indexOf('insights-timeline')
        );
        expect(children.indexOf('insights-selected-day')).toBeLessThan(
            children.indexOf('insights-activity-log')
        );
    });

    test('activity log renders selected-day empty state', () => {
        renderInsightsView({
            activities: [],
            now: new Date(isoAt('12:00')),
            selectedDate: '2026-05-06'
        });

        expect(document.getElementById('insights-activity-list').textContent).toContain(
            'No activities logged for'
        );
        expect(document.getElementById('insights-activity-list').textContent).toContain('May 6');
        expect(renderActivities).not.toHaveBeenCalled();
    });

    test('renderInsightsView groups overlapping activity issues by affected and related activity ids', () => {
        renderWith({
            activities: [
                activity({
                    id: 'activity-overlapped',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('10:00'),
                    source: 'manual',
                    sourceTaskId: null
                }),
                activity({
                    id: 'activity-overlapping',
                    startDateTime: isoAt('09:30'),
                    endDateTime: isoAt('10:30'),
                    source: 'manual',
                    sourceTaskId: null
                })
            ]
        });

        const options = renderActivities.mock.calls.at(-1)[2];

        expect(options.activityIssuesById['activity-overlapping']).toEqual([
            expect.objectContaining({
                type: 'overlap',
                activityId: 'activity-overlapping',
                overlappingActivityId: 'activity-overlapped'
            })
        ]);
        expect(options.activityIssuesById['activity-overlapped']).toEqual([
            expect.objectContaining({
                type: 'overlap',
                activityId: 'activity-overlapping',
                overlappingActivityId: 'activity-overlapped'
            })
        ]);
        expect(options).toEqual(
            expect.objectContaining({
                confirmingDeleteActivityId: 'activity-3',
                summaryActivities: expect.arrayContaining([
                    expect.objectContaining({ id: 'activity-overlapped' }),
                    expect.objectContaining({ id: 'activity-overlapping' })
                ])
            })
        );
    });

    test('hides the overlap repair action while the feature flag is disabled', () => {
        renderWith({
            selectedDate: '2026-05-07',
            activities: [
                activity({
                    id: 'activity-overlapped',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('10:00'),
                    source: 'manual',
                    sourceTaskId: null
                }),
                activity({
                    id: 'activity-overlapping',
                    startDateTime: isoAt('09:30'),
                    endDateTime: isoAt('10:30'),
                    source: 'manual',
                    sourceTaskId: null
                })
            ]
        });

        expect(document.querySelector('[data-truncate-activity-overlaps]')).toBeNull();
    });

    test('renders overlap repair only when enabled and the selected Activity Log has overlaps', () => {
        renderWith({
            selectedDate: '2026-05-07',
            overlapRepairEnabled: true,
            activities: [
                activity({
                    id: 'activity-overlapped',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('10:00'),
                    source: 'manual',
                    sourceTaskId: null
                }),
                activity({
                    id: 'activity-overlapping',
                    startDateTime: isoAt('09:30'),
                    endDateTime: isoAt('10:30'),
                    source: 'manual',
                    sourceTaskId: null
                })
            ]
        });

        const action = document.querySelector('[data-truncate-activity-overlaps]');
        expect(action).not.toBeNull();
        expect(action.dataset.truncateActivityOverlapsDate).toBe('2026-05-07');
        expect(action.textContent).toContain('Fix overlaps');

        renderWith({
            selectedDate: '2026-05-07',
            overlapRepairEnabled: true,
            activities: [
                activity({
                    id: 'activity-clean-1',
                    startDateTime: isoAt('09:00'),
                    endDateTime: isoAt('09:30'),
                    source: 'manual',
                    sourceTaskId: null
                }),
                activity({
                    id: 'activity-clean-2',
                    startDateTime: isoAt('09:30'),
                    endDateTime: isoAt('10:00'),
                    source: 'manual',
                    sourceTaskId: null
                })
            ]
        });

        expect(document.querySelector('[data-truncate-activity-overlaps]')).toBeNull();
    });

    test('renderInsightsView preserves caller activity issue annotations with model issues', () => {
        const existingIssue = {
            type: 'manual-review',
            activityId: 'activity-overlapping',
            message: 'Needs human review'
        };

        getActivityState.mockReturnValue([
            activity({
                id: 'activity-overlapped',
                startDateTime: isoAt('09:00'),
                endDateTime: isoAt('10:00'),
                source: 'manual',
                sourceTaskId: null
            }),
            activity({
                id: 'activity-overlapping',
                startDateTime: isoAt('09:30'),
                endDateTime: isoAt('10:30'),
                source: 'manual',
                sourceTaskId: null
            })
        ]);
        getRunningActivity.mockReturnValue(null);

        renderInsightsView({
            now: new Date(isoAt('12:00')),
            activityRenderOptions: {
                confirmingDeleteActivityId: 'activity-3',
                activityIssuesById: {
                    'activity-overlapping': [existingIssue]
                }
            }
        });

        const options = renderActivities.mock.calls.at(-1)[2];

        expect(options.activityIssuesById['activity-overlapping']).toEqual([
            existingIssue,
            expect.objectContaining({
                type: 'overlap',
                activityId: 'activity-overlapping',
                overlappingActivityId: 'activity-overlapped'
            })
        ]);
        expect(options.activityIssuesById['activity-overlapped']).toEqual([
            expect.objectContaining({
                type: 'overlap',
                activityId: 'activity-overlapping',
                overlappingActivityId: 'activity-overlapped'
            })
        ]);
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

    test('changing the trend date range resets Activity Log visible limit to default', () => {
        const activities = Array.from({ length: 75 }, (_, index) =>
            activity({
                id: `activity-${index + 1}`,
                startDateTime: isoAt('09:00'),
                endDateTime: isoAt('09:30')
            })
        );

        expandInsightsActivityLogLimit(50);
        renderWith({ activities });
        expect(renderActivities.mock.calls.at(-1)[0]).toHaveLength(75);

        setInsightsTrendDateRange({
            startDate: '2026-04-24',
            endDate: '2026-05-07'
        });
        renderWith({ activities });

        expect(renderActivities.mock.calls.at(-1)[0]).toHaveLength(50);
        expect(document.querySelector('[data-show-more-activities]')).not.toBeNull();
    });

    test('initial Activity Log defaults to today within the default 7-day trend range', () => {
        renderWith({
            activities: [
                activity({
                    id: 'today-activity',
                    startDateTime: isoOn('2026-05-07', '09:00'),
                    endDateTime: isoOn('2026-05-07', '09:30')
                }),
                activity({
                    id: 'inside-range-but-not-selected-day',
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
            expect.objectContaining({ id: 'today-activity' })
        ]);
    });

    test('renderInsightsView renders selectable trend day cards with selected day', () => {
        renderInsightsView({
            activities: [
                activity({
                    id: 'a-1',
                    description: 'work',
                    startDateTime: isoOn('2026-06-15', '09:00'),
                    endDateTime: isoOn('2026-06-15', '10:00'),
                    duration: 60,
                    category: 'work/deep'
                }),
                activity({
                    id: 'a-2',
                    description: 'project',
                    startDateTime: isoOn('2026-06-16', '09:00'),
                    endDateTime: isoOn('2026-06-16', '10:30'),
                    duration: 90,
                    category: 'work/deep'
                })
            ],
            now: new Date(isoOn('2026-06-16', '12:00')),
            dateRange: { startDate: '2026-06-03', endDate: '2026-06-16' },
            selectedDate: '2026-06-15'
        });

        const trends = document.getElementById('insights-trends');

        expect(trends.querySelector('details')).toBeNull();
        expect(trends.querySelectorAll('[data-trend-day]')).toHaveLength(14);
        expect(trends.querySelector('[data-trend-day="2026-06-15"]').dataset.selected).toBe('true');
        expect(trends.querySelector('[data-trend-day="2026-06-16"]').dataset.selected).toBe(
            'false'
        );
    });

    test('renderInsightsView flags trend day cards that contain data issues', () => {
        renderWith({
            activities: [
                activity({
                    id: 'clean-day',
                    startDateTime: isoOn('2026-05-06', '09:00'),
                    endDateTime: isoOn('2026-05-06', '09:30'),
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                }),
                activity({
                    id: 'overlapped',
                    startDateTime: isoOn('2026-05-07', '09:00'),
                    endDateTime: isoOn('2026-05-07', '10:00'),
                    duration: 60,
                    source: 'manual',
                    sourceTaskId: null
                }),
                activity({
                    id: 'overlapping',
                    startDateTime: isoOn('2026-05-07', '09:30'),
                    endDateTime: isoOn('2026-05-07', '10:15'),
                    duration: 45,
                    source: 'manual',
                    sourceTaskId: null
                })
            ],
            now: new Date(isoAt('12:00'))
        });

        const cleanDay = document.querySelector('[data-trend-day="2026-05-06"]');
        const issueDay = document.querySelector('[data-trend-day="2026-05-07"]');
        const indicator = issueDay.querySelector('[data-trend-day-issue]');

        expect(cleanDay.querySelector('[data-trend-day-issue]')).toBeNull();
        expect(indicator).not.toBeNull();
        expect(indicator.querySelector('.fa-triangle-exclamation')).not.toBeNull();
        expect(indicator.getAttribute('aria-label')).toBe('1 data issue on this day');
        expect(indicator.getAttribute('title')).toBe('1 data issue on this day');
    });

    test('renderInsightsView scrolls only the horizontal trend strip to the selected day', () => {
        const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalClientWidth = Object.getOwnPropertyDescriptor(
            window.HTMLElement.prototype,
            'clientWidth'
        );
        const originalOffsetWidth = Object.getOwnPropertyDescriptor(
            window.HTMLElement.prototype,
            'offsetWidth'
        );
        const originalOffsetLeft = Object.getOwnPropertyDescriptor(
            window.HTMLElement.prototype,
            'offsetLeft'
        );
        const scrollIntoView = jest.fn();
        window.requestAnimationFrame = (callback) => {
            callback();
            return 1;
        };
        window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
        Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get() {
                return this.matches?.('[data-trend-day-strip]') ? 200 : 0;
            }
        });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            get() {
                return this.matches?.('[data-trend-day]') ? 100 : 0;
            }
        });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetLeft', {
            configurable: true,
            get() {
                if (this.matches?.('[data-trend-day-strip]')) {
                    return 32;
                }
                return this.getAttribute?.('data-trend-day') === '2026-06-15' ? 500 : 0;
            }
        });

        try {
            renderInsightsView({
                activities: [],
                now: new Date(isoOn('2026-06-16', '12:00')),
                dateRange: { startDate: '2026-06-03', endDate: '2026-06-16' },
                selectedDate: '2026-06-15'
            });

            const strip = document.querySelector('[data-trend-day-strip]');

            expect(scrollIntoView).not.toHaveBeenCalled();
            expect(strip.scrollLeft).toBe(418);
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
            restorePrototypeDescriptor('clientWidth', originalClientWidth);
            restorePrototypeDescriptor('offsetWidth', originalOffsetWidth);
            restorePrototypeDescriptor('offsetLeft', originalOffsetLeft);
        }
    });

    test('renderInsightsView defers selected trend day alignment until after initial render', () => {
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalClientWidth = Object.getOwnPropertyDescriptor(
            window.HTMLElement.prototype,
            'clientWidth'
        );
        const originalOffsetWidth = Object.getOwnPropertyDescriptor(
            window.HTMLElement.prototype,
            'offsetWidth'
        );
        const originalOffsetLeft = Object.getOwnPropertyDescriptor(
            window.HTMLElement.prototype,
            'offsetLeft'
        );
        const frameCallbacks = [];
        window.requestAnimationFrame = (callback) => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        };
        Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get() {
                return this.matches?.('[data-trend-day-strip]') ? 180 : 0;
            }
        });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            get() {
                return this.matches?.('[data-trend-day]') ? 80 : 0;
            }
        });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetLeft', {
            configurable: true,
            get() {
                return this.getAttribute?.('data-trend-day') === '2026-06-15' ? 420 : 0;
            }
        });

        try {
            renderInsightsView({
                activities: [],
                now: new Date(isoOn('2026-06-16', '12:00')),
                dateRange: { startDate: '2026-06-03', endDate: '2026-06-16' },
                selectedDate: '2026-06-15'
            });

            const strip = document.querySelector('[data-trend-day-strip]');

            expect(frameCallbacks).toHaveLength(1);
            expect(strip.scrollLeft).toBe(0);

            frameCallbacks[0]();

            expect(strip.scrollLeft).toBe(370);
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            restorePrototypeDescriptor('clientWidth', originalClientWidth);
            restorePrototypeDescriptor('offsetWidth', originalOffsetWidth);
            restorePrototypeDescriptor('offsetLeft', originalOffsetLeft);
        }
    });

    test('renderInsightsView renders visible Trends with date filters and category day cards', () => {
        renderWith({
            activities: [
                activity({
                    id: 'activity-1',
                    startDateTime: isoOn('2026-04-24', '09:00'),
                    endDateTime: isoOn('2026-04-24', '10:30'),
                    duration: 90
                }),
                activity({
                    id: 'activity-2',
                    startDateTime: isoOn('2026-05-07', '14:00'),
                    endDateTime: isoOn('2026-05-07', '15:00'),
                    duration: 60
                })
            ],
            now: new Date(isoAt('12:00'))
        });

        const trends = document.getElementById('insights-trends');

        expect(trends.textContent).toContain('Trends');
        expect(trends.querySelector('details')).toBeNull();
        expect(trends.querySelector('[data-trend-start-date]')).toBeNull();
        expect(trends.querySelector('[data-trend-end-date]')).toBeNull();
        expect(trends.querySelector('[data-trend-range-days="7"]')).not.toBeNull();
        expect(trends.querySelector('[data-trend-range-days="7"]').dataset.selected).toBe('true');
        expect(trends.querySelector('[data-trend-range-days="30"]')).not.toBeNull();
        expect(trends.querySelector('[data-category-trend-chart]')).not.toBeNull();
        expect(trends.querySelectorAll('[data-category-trend-segment]').length).toBeGreaterThan(0);
        expect(trends.querySelectorAll('[data-trend-day]')).toHaveLength(7);
        expect(trends.querySelectorAll('[data-daily-trend-segment]').length).toBeGreaterThan(0);
        expect(trends.querySelector('[data-trend-day-strip]')).not.toBeNull();
        expect(trends.textContent).toContain('Work');
    });

    test('trends render before selected-day detail sections', () => {
        setupDOM();

        const insightsView = document.getElementById('insights-view');
        const children = [...insightsView.children].map((child) => child.id);

        expect(children.indexOf('insights-trends')).toBeLessThan(
            children.indexOf('insights-summary')
        );
        expect(children.indexOf('insights-trends')).toBeLessThan(
            children.indexOf('insights-activity-log')
        );
    });

    test('trend day strip stays horizontally scrollable for long ranges', () => {
        renderInsightsView({
            activities: [],
            now: new Date(isoAt('12:00')),
            dateRange: { startDate: '2026-04-24', endDate: '2026-05-07' }
        });

        const strip = document.querySelector('[data-trend-day-strip]');
        expect(strip.className).toContain('overflow-x-auto');
        expect(strip.className).toContain('scrollbar-hidden');
        expect(strip.className).toContain('auto-cols');
        expect(strip.className).toContain('snap-x');
        expect(strip.className).not.toContain('md:grid-flow-row');
        expect(strip.className).not.toContain('md:overflow-visible');
    });

    test('daily trend stacked segment container fills the fixed-height bar', () => {
        renderWith({
            activities: [
                activity({
                    id: 'activity-1',
                    startDateTime: isoOn('2026-05-07', '09:00'),
                    endDateTime: isoOn('2026-05-07', '10:30'),
                    duration: 90
                })
            ],
            now: new Date(isoAt('12:00'))
        });

        const segment = document.querySelector('[data-daily-trend-segment]');
        const stackContainer = segment.parentElement;

        expect(stackContainer.classList.contains('h-3')).toBe(true);
    });

    test('category trend segments normalize percentage dash lengths to path length 100', () => {
        renderWith({
            activities: [
                activity({
                    id: 'activity-1',
                    startDateTime: isoOn('2026-05-07', '09:00'),
                    endDateTime: isoOn('2026-05-07', '10:00'),
                    duration: 60
                })
            ],
            now: new Date(isoAt('12:00'))
        });

        const segment = document.querySelector('[data-category-trend-segment]');

        expect(segment.getAttribute('pathLength')).toBe('100');
    });

    test('renderInsightsView passes one effective date range to insights and trends models', async () => {
        jest.resetModules();

        const buildInsightsModel = jest.fn(() => ({
            summary: {
                totalPlannedMinutes: 0,
                totalActualMinutes: 0,
                completedTaskCount: 0,
                currentlyLateTaskCount: 0
            },
            plannedBlocks: [],
            actualBlocks: [],
            activityLog: [],
            activityLogIssues: []
        }));
        const buildTrendModel = jest.fn(() => ({
            dateRange: { startDate: '2026-04-24', endDate: '2026-05-07' },
            dailyHours: [],
            categoryTotals: []
        }));

        jest.doMock('../public/js/activities/manager.js', () => ({
            getActivityState: jest.fn(() => []),
            getRunningActivity: jest.fn(() => null)
        }));
        jest.doMock('../public/js/activities/renderer.js', () => ({
            renderActivities: jest.fn()
        }));
        jest.doMock('../public/js/activities/insights-model.js', () => ({
            buildInsightsModel
        }));
        jest.doMock('../public/js/activities/insights-trends.js', () => ({
            buildTrendModel,
            getDefaultTrendDateRange: jest.fn(() => ({
                startDate: '2026-04-24',
                endDate: '2026-05-07'
            }))
        }));

        const { renderInsightsView: renderMockedInsightsView } =
            await import('../public/js/activities/insights-renderer.js');

        renderMockedInsightsView({ now: new Date(isoAt('12:00')) });

        expect(buildInsightsModel).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedDate: '2026-05-07'
            })
        );
        expect(buildTrendModel).toHaveBeenCalledWith(
            expect.objectContaining({
                dateRange: { startDate: '2026-04-24', endDate: '2026-05-07' }
            })
        );

        jest.dontMock('../public/js/activities/manager.js');
        jest.dontMock('../public/js/activities/renderer.js');
        jest.dontMock('../public/js/activities/insights-model.js');
        jest.dontMock('../public/js/activities/insights-trends.js');
    });
});

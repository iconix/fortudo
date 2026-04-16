/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    renderCategoryBadge: jest.fn(() => '<span class="category-badge">Deep Work</span>'),
    getGroupByKey: jest.fn((key) => {
        if (key === 'work') {
            return {
                key: 'work',
                label: 'Work',
                color: '#0f172a'
            };
        }

        if (key === 'personal') {
            return {
                key: 'personal',
                label: 'Personal',
                color: '#f97316'
            };
        }

        return null;
    }),
    getCategoryByKey: jest.fn((key) => {
        if (key === 'work/deep') {
            return {
                key: 'work/deep',
                label: 'Deep Work',
                groupKey: 'work',
                color: '#0ea5e9'
            };
        }

        if (key === 'work/admin') {
            return {
                key: 'work/admin',
                label: 'Admin',
                groupKey: 'work',
                color: '#14b8a6'
            };
        }

        if (key === 'personal/planning') {
            return {
                key: 'personal/planning',
                label: 'Planning',
                groupKey: 'personal',
                color: '#f97316'
            };
        }

        if (key === 'ghost/focus') {
            return {
                key: 'ghost/focus',
                label: 'Focus',
                groupKey: 'ghost',
                color: '#22c55e'
            };
        }

        return null;
    }),
    resolveCategoryKey: jest.fn((key) => {
        if (key === 'work') {
            return {
                kind: 'group',
                record: {
                    key: 'work',
                    label: 'Work',
                    color: '#0f172a'
                }
            };
        }

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

        if (key === 'work/admin') {
            return {
                kind: 'category',
                record: {
                    key: 'work/admin',
                    label: 'Admin',
                    groupKey: 'work',
                    color: '#14b8a6'
                }
            };
        }

        if (key === 'personal/planning') {
            return {
                kind: 'category',
                record: {
                    key: 'personal/planning',
                    label: 'Planning',
                    groupKey: 'personal',
                    color: '#f97316'
                }
            };
        }

        if (key === 'ghost/focus') {
            return {
                kind: 'category',
                record: {
                    key: 'ghost/focus',
                    label: 'Focus',
                    groupKey: 'ghost',
                    color: '#22c55e'
                }
            };
        }

        return null;
    }),
    getSelectableCategoryOptions: jest.fn(() => [
        { value: 'work/deep', label: 'Deep Work', indentLevel: 1 }
    ])
}));

import { renderActivities } from '../public/js/activities/renderer.js';
import { convertTo12HourTime, extractTimeFromDateTime } from '../public/js/utils.js';

describe('activity renderer', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="activity-list"></div>';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('renders empty state when no activities exist', () => {
        const container = document.getElementById('activity-list');

        renderActivities([], container);

        expect(container.textContent).toContain('No activities tracked today');
        expect(container.querySelector('.text-center')).toBeNull();
    });

    test('renders manual activity with edit and delete actions', () => {
        const container = document.getElementById('activity-list');
        const startText = convertTo12HourTime(
            extractTimeFromDateTime(new Date('2026-04-07T09:00:00.000Z'))
        );
        const endText = convertTo12HourTime(
            extractTimeFromDateTime(new Date('2026-04-07T10:00:00.000Z'))
        );

        renderActivities(
            [
                {
                    id: 'activity-1',
                    description: 'Deep work',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T10:00:00.000Z',
                    duration: 60,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container
        );

        expect(container.querySelector('[data-activity-id="activity-1"]')).not.toBeNull();
        expect(container.textContent).toContain('Deep work');
        expect(container.textContent).toContain(startText);
        expect(container.textContent).toContain(endText);
        expect(container.textContent).toContain('1h');
        expect(container.querySelector('.btn-edit-activity')).not.toBeNull();
        expect(container.querySelector('.btn-delete-activity')).not.toBeNull();
    });

    test('renders a parent-group summary bar above the activity list', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-1',
                    description: 'Deep work',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T10:00:00.000Z',
                    duration: 60,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-2',
                    description: 'Planning',
                    category: 'personal/planning',
                    startDateTime: '2026-04-07T10:00:00.000Z',
                    endDateTime: '2026-04-07T10:30:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-3',
                    description: 'Catch-up',
                    category: null,
                    startDateTime: '2026-04-07T10:30:00.000Z',
                    endDateTime: '2026-04-07T11:00:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container
        );

        const summary = container.querySelector('[data-activity-summary]');
        expect(summary).not.toBeNull();
        expect(summary.textContent).toContain('Category Breakdown');
        expect(summary.textContent).toContain('Total 2h');
        expect(summary.textContent).toContain('Work 1h');
        expect(summary.textContent).toContain('Personal 30m');
        expect(summary.textContent).toContain('Uncategorized 30m');
        expect(summary.textContent).not.toContain('Deep Work');
        expect(summary.querySelectorAll('[data-summary-parent-segment]')).toHaveLength(3);
    });

    test('parent-group default summary aggregates child and parent activities', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-1',
                    description: 'Deep work',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:45:00.000Z',
                    duration: 45,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-2',
                    description: 'Parent work',
                    category: 'work',
                    startDateTime: '2026-04-07T09:45:00.000Z',
                    endDateTime: '2026-04-07T10:20:00.000Z',
                    duration: 35,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-3',
                    description: 'Planning',
                    category: 'personal/planning',
                    startDateTime: '2026-04-07T10:20:00.000Z',
                    endDateTime: '2026-04-07T10:50:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-4',
                    description: 'Loose notes',
                    category: null,
                    startDateTime: '2026-04-07T10:50:00.000Z',
                    endDateTime: '2026-04-07T11:05:00.000Z',
                    duration: 15,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container
        );

        const summary = container.querySelector('[data-activity-summary]');

        expect(summary).not.toBeNull();
        expect(summary.textContent).toContain('Work 1h 20m');
        expect(summary.textContent).toContain('Personal 30m');
        expect(summary.textContent).toContain('Uncategorized 15m');
        expect(summary.textContent).not.toContain('Deep Work');
        expect(summary.querySelectorAll('[data-summary-parent-segment]')).toHaveLength(3);
    });

    test('parent-group summary rolls deleted child categories up to their inferred parent', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-1',
                    description: 'Missing child',
                    category: 'work/missing',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:20:00.000Z',
                    duration: 20,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-2',
                    description: 'Deep work',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:20:00.000Z',
                    endDateTime: '2026-04-07T09:50:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container
        );

        const summary = container.querySelector('[data-activity-summary]');

        expect(summary).not.toBeNull();
        expect(summary.textContent).toContain('Work 50m');
        expect(summary.textContent).not.toContain('work/missing');
        expect(summary.querySelectorAll('[data-summary-parent-segment]')).toHaveLength(1);
    });

    test('parent-group summary keeps missing parent groups in one fallback bucket', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-1',
                    description: 'Ghost child',
                    category: 'ghost/focus',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:20:00.000Z',
                    duration: 20,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-2',
                    description: 'Ghost parent',
                    category: 'ghost',
                    startDateTime: '2026-04-07T09:20:00.000Z',
                    endDateTime: '2026-04-07T09:45:00.000Z',
                    duration: 25,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container
        );

        const summary = container.querySelector('[data-activity-summary]');

        expect(summary).not.toBeNull();
        expect(summary.textContent).toContain('Ghost 45m');
        expect(summary.textContent).not.toContain('Focus');
        expect(summary.querySelectorAll('[data-summary-parent-segment]')).toHaveLength(1);
    });

    test('parent-group summary uses deterministic ordering when durations tie', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-1',
                    description: 'Work item',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:30:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-2',
                    description: 'Personal item',
                    category: 'personal/planning',
                    startDateTime: '2026-04-07T09:30:00.000Z',
                    endDateTime: '2026-04-07T10:00:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container
        );

        const labels = Array.from(container.querySelectorAll('[data-summary-parent-legend]')).map(
            (item) => item.textContent.trim()
        );

        expect(labels).toEqual(['Personal 30m', 'Work 30m']);
    });

    test('parent summary shows pointer affordance only for expandable groups', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-1',
                    description: 'Deep work',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:30:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-2',
                    description: 'Loose notes',
                    category: null,
                    startDateTime: '2026-04-07T09:30:00.000Z',
                    endDateTime: '2026-04-07T09:45:00.000Z',
                    duration: 15,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container
        );

        const workSegment = container.querySelector('[data-summary-parent-segment="work"]');
        const workLegend = container.querySelector('[data-summary-parent-legend="work"]');
        const uncategorizedSegment = container.querySelector(
            '[data-summary-parent-segment="uncategorized"]'
        );
        const uncategorizedLegend = container.querySelector(
            '[data-summary-parent-legend="uncategorized"]'
        );

        expect(workSegment.className).toContain('cursor-pointer');
        expect(workLegend.className).toContain('cursor-pointer');
        expect(uncategorizedSegment.className).toContain('cursor-default');
        expect(uncategorizedLegend.className).toContain('cursor-default');
    });

    test('renders uncategorized summary items with the dedicated uncategorized style', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-uncategorized',
                    description: 'Loose notes',
                    category: null,
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:45:00.000Z',
                    duration: 45,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container
        );

        const uncategorizedSegment = container.querySelector(
            '[data-summary-segment="uncategorized"]'
        );
        const uncategorizedLegend = container.querySelector(
            '[data-summary-legend-swatch="uncategorized"]'
        );

        expect(uncategorizedSegment).not.toBeNull();
        expect(uncategorizedLegend).not.toBeNull();
        expect(uncategorizedSegment.getAttribute('style')).toContain('repeating-linear-gradient');
        expect(uncategorizedLegend.getAttribute('style')).toContain('repeating-linear-gradient');
    });

    test('renders an expanded child rail for the selected parent group', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-1',
                    description: 'Deep work',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:45:00.000Z',
                    duration: 45,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-2',
                    description: 'Admin',
                    category: 'work/admin',
                    startDateTime: '2026-04-07T09:45:00.000Z',
                    endDateTime: '2026-04-07T10:05:00.000Z',
                    duration: 20,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-3',
                    description: 'Parent work',
                    category: 'work',
                    startDateTime: '2026-04-07T10:05:00.000Z',
                    endDateTime: '2026-04-07T10:20:00.000Z',
                    duration: 15,
                    source: 'manual',
                    sourceTaskId: null
                },
                {
                    id: 'activity-4',
                    description: 'Planning',
                    category: 'personal/planning',
                    startDateTime: '2026-04-07T10:20:00.000Z',
                    endDateTime: '2026-04-07T10:50:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container,
            { expandedParentGroupKey: 'work' }
        );

        const expandedRail = container.querySelector('[data-summary-expanded-group="work"]');

        expect(expandedRail).not.toBeNull();
        expect(expandedRail.textContent).toContain('Work');
        expect(expandedRail.textContent).toContain('Deep Work 45m');
        expect(expandedRail.textContent).toContain('Admin 20m');
        expect(expandedRail.textContent).toContain('Unspecified Work 15m');
        expect(expandedRail.textContent).not.toContain('Zero Child');
        expect(container.querySelectorAll('[data-summary-child-segment]')).toHaveLength(3);
    });

    test('does not render an expanded child rail for uncategorized', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-1',
                    description: 'Loose notes',
                    category: null,
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:15:00.000Z',
                    duration: 15,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container,
            { expandedParentGroupKey: 'uncategorized' }
        );

        expect(container.querySelector('[data-summary-expanded-group]')).toBeNull();
        expect(container.querySelectorAll('[data-summary-child-segment]')).toHaveLength(0);
    });

    test('renders auto activity with source indicator and edit/delete actions', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-2',
                    description: 'Standup',
                    category: null,
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:30:00.000Z',
                    duration: 30,
                    source: 'auto',
                    sourceTaskId: 'sched-1'
                }
            ],
            container
        );

        expect(container.textContent).toContain('auto');
        expect(container.querySelector('.activity-source-link')).not.toBeNull();
        expect(container.querySelector('.btn-edit-activity')).not.toBeNull();
        expect(container.querySelector('.btn-delete-activity')).not.toBeNull();
    });

    test('renders inline edit form instead of the summary row for the editing activity', () => {
        const container = document.getElementById('activity-list');
        const displayStartTime = extractTimeFromDateTime(new Date('2026-04-07T09:00:00.000Z'));

        renderActivities(
            [
                {
                    id: 'activity-editing',
                    description: 'Deep work',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T10:30:00.000Z',
                    duration: 90,
                    source: 'auto',
                    sourceTaskId: 'sched-1'
                }
            ],
            container,
            { editingActivityId: 'activity-editing' }
        );

        const editForm = container.querySelector('form.activity-inline-edit-form');
        expect(editForm).not.toBeNull();
        expect(editForm.dataset.activityId).toBe('activity-editing');
        expect(editForm.dataset.activityDate).toBe('2026-04-07');
        expect(editForm.querySelector('input[name="description"]').value).toBe('Deep work');
        expect(editForm.querySelector('input[name="start-time"]').value).toBe(displayStartTime);
        expect(editForm.querySelector('input[name="duration-hours"]').value).toBe('1');
        expect(editForm.querySelector('input[name="duration-minutes"]').value).toBe('30');
        expect(editForm.querySelector('select[name="category"]').value).toBe('work/deep');
        expect(editForm.textContent).toContain('auto');
        expect(editForm.querySelector('.btn-delete-activity')).toBeNull();
        expect(editForm.querySelector('.btn-cancel-activity-edit')).not.toBeNull();
        expect(editForm.querySelector('.btn-save-activity-edit')).not.toBeNull();
    });

    test('renders an end-time hint for inline activity edit duration', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-hint',
                    description: 'Deep work',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T10:30:00.000Z',
                    duration: 90,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container,
            { editingActivityId: 'activity-hint' }
        );

        const hintEl = container.querySelector('.edit-end-time-hint');

        expect(hintEl).not.toBeNull();
        expect(hintEl.textContent).toContain('AM');
        expect(hintEl.classList.contains('opacity-0')).toBe(false);
    });

    test('reserves row space for the inline activity edit end-time hint on larger widths', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-layout',
                    description: 'Deep work',
                    category: 'work/deep',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T10:30:00.000Z',
                    duration: 90,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container,
            { editingActivityId: 'activity-layout' }
        );

        const row = container.querySelector('form.activity-inline-edit-form > div:last-of-type');

        expect(row).not.toBeNull();
        expect(row.className).toContain('sm:pb-5');
    });

    test('escapes activity descriptions', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-3',
                    description: '<script>alert("x")</script>',
                    category: null,
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:30:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                }
            ],
            container
        );

        expect(container.innerHTML).not.toContain('<script>');
        expect(container.textContent).toContain('<script>alert("x")</script>');
    });

    test('uses the default activity-list container when none is provided', () => {
        renderActivities([
            {
                id: 'activity-default',
                description: 'Default target',
                category: null,
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:30:00.000Z',
                duration: 30,
                source: 'manual',
                sourceTaskId: null
            }
        ]);

        expect(document.getElementById('activity-list').textContent).toContain('Default target');
    });

    test('returns cleanly when no container can be resolved', () => {
        document.body.innerHTML = '';

        expect(() =>
            renderActivities([
                {
                    id: 'activity-missing-target',
                    description: 'No target',
                    category: null,
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:30:00.000Z',
                    duration: 30,
                    source: 'manual',
                    sourceTaskId: null
                }
            ])
        ).not.toThrow();
    });

    test('escapes activity ids and auto source task ids in attributes', () => {
        const container = document.getElementById('activity-list');

        renderActivities(
            [
                {
                    id: 'activity-"><bad',
                    description: 'Standup',
                    category: null,
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T09:30:00.000Z',
                    duration: 30,
                    source: 'auto',
                    sourceTaskId: 'sched-"><bad'
                }
            ],
            container
        );

        expect(container.innerHTML).not.toContain('data-source-task-id="sched-"><bad"');
        expect(container.innerHTML).not.toContain('data-activity-id="activity-"><bad"');
        expect(container.querySelector('.activity-source-link')).not.toBeNull();
    });
});

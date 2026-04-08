/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    renderCategoryBadge: jest.fn(() => '<span class="category-badge">Deep Work</span>')
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

    test('renders auto activity with source indicator and no edit/delete actions', () => {
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
        expect(container.querySelector('.btn-edit-activity')).toBeNull();
        expect(container.querySelector('.btn-delete-activity')).toBeNull();
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

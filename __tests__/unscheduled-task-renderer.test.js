/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/activities/manager.js', () => ({
    getRunningActivity: jest.fn(() => null)
}));

import { renderUnscheduledTasks } from '../public/js/tasks/unscheduled-renderer.js';
import { getRunningActivity } from '../public/js/activities/manager.js';

describe('unscheduled task renderer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '<div id="unscheduled-task-list"></div>';
    });

    test('renders a start timer action for incomplete unscheduled tasks', () => {
        renderUnscheduledTasks(
            [
                {
                    id: 'unsched-1',
                    type: 'unscheduled',
                    description: 'Inbox zero',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'incomplete'
                }
            ],
            {},
            jest.fn()
        );

        const startTimerButton = document.querySelector('.btn-start-unscheduled-timer');
        expect(startTimerButton).not.toBeNull();
        expect(startTimerButton.getAttribute('title')).toBe('Start timer from task');
        expect(startTimerButton.querySelector('.fa-stopwatch')).not.toBeNull();
        expect(startTimerButton.hasAttribute('disabled')).toBe(false);
    });

    test('renders the linked source task with a subdued in-progress badge and fully disabled while its timer runs', () => {
        getRunningActivity.mockReturnValue({
            description: 'Inbox zero',
            category: 'break/admin',
            startDateTime: '2026-04-14T12:00:00.000Z',
            source: 'auto',
            sourceTaskId: 'unsched-2'
        });

        renderUnscheduledTasks(
            [
                {
                    id: 'unsched-2',
                    type: 'unscheduled',
                    description: 'Inbox zero',
                    priority: 'medium',
                    estDuration: 30,
                    status: 'incomplete'
                }
            ],
            {},
            jest.fn()
        );

        const taskCard = document.querySelector('[data-task-id="unsched-2"]');
        expect(taskCard.className).toContain('opacity-70');
        expect(taskCard.className).toContain('pointer-events-none');
        const inProgressBadge = taskCard.querySelector('.unscheduled-in-progress-badge');
        expect(inProgressBadge).not.toBeNull();
        expect(inProgressBadge.textContent).toContain('In progress');
        expect(inProgressBadge.className).toContain('bg-slate-700/70');
        expect(inProgressBadge.className).toContain('text-sky-200');
        expect(
            document.querySelector('.btn-start-unscheduled-timer').hasAttribute('disabled')
        ).toBe(true);
        expect(document.querySelector('.btn-schedule-task').hasAttribute('disabled')).toBe(true);
        expect(document.querySelector('.btn-edit-unscheduled').hasAttribute('disabled')).toBe(true);
        expect(document.querySelector('.btn-delete-unscheduled').hasAttribute('disabled')).toBe(
            true
        );
    });
});

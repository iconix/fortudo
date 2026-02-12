/**
 * @jest-environment jsdom
 */

import {
    getScheduledTaskListElement,
    renderGapHTML,
    renderTasks,
    refreshCurrentGapHighlight
} from '../public/js/scheduled-task-renderer.js';
import { timeToDateTime, calculateEndDateTime } from '../public/js/utils.js';

// Helper to create a scheduled task
function createTask(id, startTime, duration, options = {}) {
    const testDate = '2025-01-15';
    const startDateTime = timeToDateTime(startTime, testDate);
    const endDateTime = calculateEndDateTime(startDateTime, duration);

    return {
        id,
        type: 'scheduled',
        description: options.description || `Task ${id}`,
        startDateTime,
        endDateTime,
        duration,
        status: options.status || 'incomplete',
        locked: options.locked || false,
        editing: options.editing || false,
        confirmingDelete: false
    };
}

describe('Scheduled Task Renderer Tests', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="scheduled-task-list"></div>';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('renderGapHTML', () => {
        test('returns string containing schedule-gap class', () => {
            const gap = {
                afterTaskId: '1',
                startISO: '2025-01-15T11:00:00.000Z',
                endISO: '2025-01-15T11:30:00.000Z',
                durationMinutes: 30
            };
            const html = renderGapHTML(gap);
            expect(html).toContain('schedule-gap');
        });

        test('returns string containing aria-hidden="true"', () => {
            const gap = {
                afterTaskId: '1',
                startISO: '2025-01-15T11:00:00.000Z',
                endISO: '2025-01-15T11:30:00.000Z',
                durationMinutes: 30
            };
            const html = renderGapHTML(gap);
            expect(html).toContain('aria-hidden="true"');
        });

        test('includes data-gap-start and data-gap-end attributes', () => {
            const gap = {
                afterTaskId: '1',
                startISO: '2025-01-15T11:00:00.000Z',
                endISO: '2025-01-15T11:30:00.000Z',
                durationMinutes: 30
            };
            const html = renderGapHTML(gap);
            expect(html).toContain('data-gap-start="2025-01-15T11:00:00.000Z"');
            expect(html).toContain('data-gap-end="2025-01-15T11:30:00.000Z"');
        });

        test('formats duration correctly for 90 min gap', () => {
            const gap = {
                afterTaskId: '1',
                startISO: '2025-01-15T11:00:00.000Z',
                endISO: '2025-01-15T12:30:00.000Z',
                durationMinutes: 90
            };
            const html = renderGapHTML(gap);
            expect(html).toContain('1h 30m free');
        });

        test('formats duration correctly for sub-hour gap', () => {
            const gap = {
                afterTaskId: '1',
                startISO: '2025-01-15T11:00:00.000Z',
                endISO: '2025-01-15T11:15:00.000Z',
                durationMinutes: 15
            };
            const html = renderGapHTML(gap);
            expect(html).toContain('15m free');
        });
    });

    describe('renderTasks with gaps', () => {
        const mockInitListeners = jest.fn();
        const mockCallbacks = { onCompleteTask: jest.fn() };

        test('two tasks with gap produces a .schedule-gap element between them', () => {
            const tasks = [
                createTask('1', '10:00', 60), // 10:00 - 11:00
                createTask('2', '11:30', 60) // 11:30 - 12:30
            ];

            renderTasks(tasks, mockCallbacks, mockInitListeners, null);

            const list = getScheduledTaskListElement();
            const gapEl = list.querySelector('.schedule-gap');
            expect(gapEl).not.toBeNull();
            expect(gapEl.textContent).toContain('30m free');
        });

        test('two back-to-back tasks produce no .schedule-gap', () => {
            const tasks = [
                createTask('1', '10:00', 60), // 10:00 - 11:00
                createTask('2', '11:00', 60) // 11:00 - 12:00
            ];

            renderTasks(tasks, mockCallbacks, mockInitListeners, null);

            const list = getScheduledTaskListElement();
            const gapEl = list.querySelector('.schedule-gap');
            expect(gapEl).toBeNull();
        });

        test('single task produces no .schedule-gap', () => {
            const tasks = [createTask('1', '10:00', 60)];

            renderTasks(tasks, mockCallbacks, mockInitListeners, null);

            const list = getScheduledTaskListElement();
            const gapEl = list.querySelector('.schedule-gap');
            expect(gapEl).toBeNull();
        });

        test('gap elements do not have data-task-id attribute', () => {
            const tasks = [createTask('1', '10:00', 60), createTask('2', '11:30', 60)];

            renderTasks(tasks, mockCallbacks, mockInitListeners, null);

            const list = getScheduledTaskListElement();
            const gapEls = list.querySelectorAll('.schedule-gap');
            gapEls.forEach((el) => {
                expect(el.hasAttribute('data-task-id')).toBe(false);
            });
        });
    });

    describe('refreshCurrentGapHighlight', () => {
        const mockInitListeners = jest.fn();
        const mockCallbacks = { onCompleteTask: jest.fn() };

        test('gap matching current time gets teal highlight classes', () => {
            const tasks = [
                createTask('1', '10:00', 60), // 10:00 - 11:00
                createTask('2', '11:30', 60) // 11:30 - 12:30
            ];
            renderTasks(tasks, mockCallbacks, mockInitListeners, null);

            // Time within the gap (11:00 - 11:30)
            const gapEl = document.querySelector('.schedule-gap');
            const withinGap = new Date(gapEl.dataset.gapStart);
            withinGap.setMinutes(withinGap.getMinutes() + 15);

            refreshCurrentGapHighlight(withinGap);

            expect(gapEl.classList.contains('text-teal-400')).toBe(true);
            expect(gapEl.classList.contains('text-slate-500')).toBe(false);
            const borderSpans = gapEl.querySelectorAll('.border-t');
            borderSpans.forEach((s) => {
                expect(s.classList.contains('border-teal-400')).toBe(true);
                expect(s.classList.contains('border-solid')).toBe(true);
            });
        });

        test('gap NOT matching current time keeps default slate classes', () => {
            const tasks = [createTask('1', '10:00', 60), createTask('2', '11:30', 60)];
            renderTasks(tasks, mockCallbacks, mockInitListeners, null);

            // Time outside the gap
            const outsideGap = new Date('2025-01-15T09:00:00.000Z');

            refreshCurrentGapHighlight(outsideGap);

            const gapEl = document.querySelector('.schedule-gap');
            expect(gapEl.classList.contains('text-slate-500')).toBe(true);
            expect(gapEl.classList.contains('text-teal-400')).toBe(false);
            const borderSpans = gapEl.querySelectorAll('.border-t');
            borderSpans.forEach((s) => {
                expect(s.classList.contains('border-slate-600')).toBe(true);
                expect(s.classList.contains('border-dashed')).toBe(true);
            });
        });

        test('no errors when no gap elements exist', () => {
            const tasks = [createTask('1', '10:00', 60)];
            renderTasks(tasks, mockCallbacks, mockInitListeners, null);

            expect(() => {
                refreshCurrentGapHighlight(new Date());
            }).not.toThrow();
        });
    });
});

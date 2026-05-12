/**
 * @jest-environment jsdom
 */

import { setupDOM } from './test-utils.js';

describe('activity view shell', () => {
    test('setupDOM includes task and insights view containers', () => {
        setupDOM();

        [
            'tasks-view',
            'insights-view',
            'view-toggle-tasks',
            'view-toggle-insights',
            'insights-summary',
            'insights-timeline',
            'insights-activity-list',
            'insights-trends'
        ].forEach((id) => {
            expect(document.getElementById(id)).not.toBeNull();
        });
    });

    test('setupDOM keeps info panel and clear controls outside tasks view', () => {
        setupDOM();

        const tasksView = document.getElementById('tasks-view');
        const infoPanel = document.getElementById('info-panel');
        const clearScheduleButton = document.getElementById('clear-schedule-button');

        expect(tasksView).not.toBeNull();
        expect(infoPanel).not.toBeNull();
        expect(clearScheduleButton).not.toBeNull();
        expect(tasksView.contains(infoPanel)).toBe(false);
        expect(tasksView.contains(clearScheduleButton)).toBe(false);
    });
});

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
});

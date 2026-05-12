/**
 * @jest-environment jsdom
 */

import { setupDOM } from './test-utils.js';
import {
    initializeActivitiesViewToggle,
    syncActivitiesViewToggle,
    getActiveActivitiesView,
    resetActivitiesViewToggle
} from '../public/js/activities/view-toggle.js';

describe('activity view shell', () => {
    afterEach(() => {
        resetActivitiesViewToggle();
    });

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

    test('hides toggle and forces tasks view when activities are disabled', () => {
        setupDOM();
        const renderInsights = jest.fn();

        initializeActivitiesViewToggle({
            getActivitiesEnabled: () => true,
            renderInsights
        });

        syncActivitiesViewToggle(true);
        document.getElementById('view-toggle-insights').click();

        expect(getActiveActivitiesView()).toBe('insights');
        expect(renderInsights).toHaveBeenCalledTimes(1);

        syncActivitiesViewToggle(false);

        expect(document.getElementById('view-toggle').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('tasks-view').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('insights-view').classList.contains('hidden')).toBe(true);
        expect(getActiveActivitiesView()).toBe('tasks');
    });

    test('switches to insights and calls render hook', () => {
        setupDOM();
        const renderInsights = jest.fn();

        initializeActivitiesViewToggle({
            getActivitiesEnabled: () => true,
            renderInsights
        });
        syncActivitiesViewToggle(true);
        document.getElementById('view-toggle-insights').click();

        expect(renderInsights).toHaveBeenCalledTimes(1);
        expect(document.getElementById('tasks-view').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('insights-view').classList.contains('hidden')).toBe(false);
        expect(getActiveActivitiesView()).toBe('insights');
    });

    test('hides clear actions and closes dropdown while insights is active', () => {
        setupDOM();
        const dropdown = document.getElementById('clear-tasks-dropdown');
        const clearOptionsButton = document.getElementById('clear-options-dropdown-trigger-btn');
        dropdown.classList.remove('hidden');
        dropdown.style.display = 'block';
        clearOptionsButton.setAttribute('aria-expanded', 'true');

        initializeActivitiesViewToggle({
            getActivitiesEnabled: () => true,
            renderInsights: jest.fn()
        });
        syncActivitiesViewToggle(true);
        document.getElementById('view-toggle-insights').click();

        expect(document.getElementById('clear-schedule-button').classList.contains('hidden')).toBe(
            true
        );
        expect(
            document
                .getElementById('clear-options-dropdown-trigger-btn')
                .classList.contains('hidden')
        ).toBe(true);
        expect(dropdown.classList.contains('hidden')).toBe(true);
        expect(dropdown.style.display).toBe('none');
        expect(clearOptionsButton.getAttribute('aria-expanded')).toBe('false');

        document.getElementById('view-toggle-tasks').click();

        expect(document.getElementById('clear-schedule-button').classList.contains('hidden')).toBe(
            false
        );
        expect(clearOptionsButton.classList.contains('hidden')).toBe(false);
        expect(getActiveActivitiesView()).toBe('tasks');
    });

    test('Tab does not toggle views from editable targets', () => {
        setupDOM();
        const renderInsights = jest.fn();
        const editableTarget = document.createElement('input');
        document.body.append(editableTarget);

        initializeActivitiesViewToggle({
            getActivitiesEnabled: () => true,
            renderInsights
        });
        syncActivitiesViewToggle(true);

        const tabEvent = new KeyboardEvent('keydown', {
            key: 'Tab',
            bubbles: true,
            cancelable: true
        });
        editableTarget.dispatchEvent(tabEvent);

        expect(getActiveActivitiesView()).toBe('tasks');
        expect(renderInsights).not.toHaveBeenCalled();
        expect(tabEvent.defaultPrevented).toBe(false);
    });

    test('Tab toggles views when activities are enabled and focus is not editable', () => {
        setupDOM();
        const renderInsights = jest.fn();

        initializeActivitiesViewToggle({
            getActivitiesEnabled: () => true,
            renderInsights
        });
        syncActivitiesViewToggle(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));

        expect(getActiveActivitiesView()).toBe('insights');
        expect(renderInsights).toHaveBeenCalledTimes(1);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));

        expect(getActiveActivitiesView()).toBe('tasks');
    });
});

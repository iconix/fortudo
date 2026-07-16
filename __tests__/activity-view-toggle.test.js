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

        const tasksView = document.getElementById('tasks-view');
        const insightsView = document.getElementById('insights-view');

        expect(document.getElementById('view-toggle').classList.contains('hidden')).toBe(true);
        expect(tasksView.classList.contains('hidden')).toBe(false);
        expect(tasksView.classList.contains('view-panel--visible')).toBe(true);
        expect(tasksView.classList.contains('view-panel--hidden')).toBe(false);
        expect(insightsView.classList.contains('hidden')).toBe(false);
        expect(insightsView.classList.contains('view-panel--hidden')).toBe(true);
        expect(insightsView.classList.contains('view-panel--visible')).toBe(false);
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

        const tasksView = document.getElementById('tasks-view');
        const insightsView = document.getElementById('insights-view');

        expect(renderInsights).toHaveBeenCalledTimes(1);
        expect(tasksView.classList.contains('hidden')).toBe(false);
        expect(tasksView.classList.contains('view-panel--hidden')).toBe(true);
        expect(tasksView.classList.contains('view-panel--visible')).toBe(false);
        expect(insightsView.classList.contains('hidden')).toBe(false);
        expect(insightsView.classList.contains('view-panel--visible')).toBe(true);
        expect(insightsView.classList.contains('view-panel--hidden')).toBe(false);
        expect(getActiveActivitiesView()).toBe('insights');
    });

    test('uses violet styling for whichever view is active', () => {
        setupDOM();

        initializeActivitiesViewToggle({
            getActivitiesEnabled: () => true,
            renderInsights: jest.fn()
        });
        syncActivitiesViewToggle(true);

        const tasksButton = document.getElementById('view-toggle-tasks');
        const insightsButton = document.getElementById('view-toggle-insights');

        expect(tasksButton.className).toContain('bg-violet-500/20');
        expect(tasksButton.className).toContain('text-violet-200');

        insightsButton.click();

        expect(insightsButton.className).toContain('bg-violet-500/20');
        expect(insightsButton.className).toContain('border-violet-400/40');
        expect(tasksButton.className).not.toContain('bg-violet-500/20');
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
        expect(dropdown.style.display).toBe('block');
        expect(clearOptionsButton.getAttribute('aria-expanded')).toBe('false');

        document.getElementById('view-toggle-tasks').click();

        expect(document.getElementById('clear-schedule-button').classList.contains('hidden')).toBe(
            false
        );
        expect(clearOptionsButton.classList.contains('hidden')).toBe(false);
        expect(getActiveActivitiesView()).toBe('tasks');
    });

    test('clear dropdown remains class-showable after returning to tasks view', () => {
        setupDOM();
        const dropdown = document.getElementById('clear-tasks-dropdown');

        initializeActivitiesViewToggle({
            getActivitiesEnabled: () => true,
            renderInsights: jest.fn()
        });
        syncActivitiesViewToggle(true);
        document.getElementById('view-toggle-insights').click();
        document.getElementById('view-toggle-tasks').click();

        dropdown.classList.remove('hidden');

        expect(dropdown.style.display).not.toBe('none');
        expect(dropdown.classList.contains('hidden')).toBe(false);
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

    test('Tab does not toggle views from focused button targets', () => {
        setupDOM();
        const renderInsights = jest.fn();
        const buttonTarget = document.createElement('button');
        document.body.append(buttonTarget);

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
        buttonTarget.dispatchEvent(tabEvent);

        expect(getActiveActivitiesView()).toBe('tasks');
        expect(renderInsights).not.toHaveBeenCalled();
        expect(tabEvent.defaultPrevented).toBe(false);
    });

    test('Tab does not toggle views from focused anchor targets', () => {
        setupDOM();
        const renderInsights = jest.fn();
        const anchorTarget = document.createElement('a');
        anchorTarget.href = '#tasks';
        document.body.append(anchorTarget);

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
        anchorTarget.dispatchEvent(tabEvent);

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

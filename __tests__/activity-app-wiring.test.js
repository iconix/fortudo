/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/activities/ui-handlers.js', () => ({
    handleActivityAwareFormSubmit: jest.fn(() => Promise.resolve()),
    handleActivityListClick: jest.fn(() => false),
    handleActivityListSubmit: jest.fn(() => false),
    handleActivityListKeydown: jest.fn(() => false),
    handleActivityListInput: jest.fn(() => false),
    refreshTodayActivitySummary: jest.fn()
}));

jest.mock('../public/js/activities/timer-ui.js', () => ({
    initializeTimerUI: jest.fn(),
    syncTimerFormState: jest.fn()
}));

jest.mock('../public/js/activities/manager.js', () => ({
    getRunningActivity: jest.fn(() => null)
}));

import {
    createActivityAppCallbacks,
    initializeActivityUi,
    syncRestoredRunningTimer
} from '../public/js/activities/app-wiring.js';
import {
    handleActivityAwareFormSubmit,
    handleActivityListClick,
    handleActivityListSubmit,
    handleActivityListKeydown,
    handleActivityListInput,
    refreshTodayActivitySummary
} from '../public/js/activities/ui-handlers.js';
import { initializeTimerUI, syncTimerFormState } from '../public/js/activities/timer-ui.js';
import { getRunningActivity } from '../public/js/activities/manager.js';

describe('activity app wiring', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = `
            <form id="task-form"></form>
            <div id="activity-list"></div>
            <input type="radio" id="activity" name="task-type" value="activity">
        `;
    });

    test('creates activity-aware app callbacks for submit and global click', async () => {
        const refreshUI = jest.fn();
        const resetAllConfirmingDeleteFlags = jest.fn();
        const handleTaskSubmit = jest.fn();
        const focusTaskDescriptionInput = jest.fn();
        const resetTaskFormPreviewState = jest.fn();
        const initializeTaskTypeToggle = jest.fn();

        const callbacks = createActivityAppCallbacks({
            getActivitiesEnabled: () => true,
            refreshUI,
            resetAllConfirmingDeleteFlags,
            handleTaskSubmit,
            focusTaskDescriptionInput,
            resetTaskFormPreviewState,
            initializeTaskTypeToggle
        });

        const form = document.getElementById('task-form');
        await callbacks.onTaskFormSubmit(form);
        callbacks.onGlobalClick({ target: document.body });

        expect(handleActivityAwareFormSubmit).toHaveBeenCalledWith(
            form,
            expect.objectContaining({
                activitiesEnabled: true,
                handleTaskSubmit,
                focusTaskDescriptionInput,
                resetTaskFormPreviewState,
                initializeTaskTypeToggle
            })
        );
        expect(handleActivityListClick).toHaveBeenCalledWith(document.body, {
            refreshUI,
            resetAllConfirmingDeleteFlags
        });
    });

    test('initializes timer ui and delegates activity list events', () => {
        const refreshUI = jest.fn();
        const refreshTaskDisplays = jest.fn();
        const signal = new AbortController().signal;

        initializeActivityUi({
            signal,
            refreshUI,
            refreshTaskDisplays,
            getActivitiesEnabled: () => true
        });

        expect(initializeTimerUI).toHaveBeenCalledWith({
            refreshUI: refreshTaskDisplays,
            refreshActivitySummary: expect.any(Function)
        });

        const activityList = document.getElementById('activity-list');
        activityList.dispatchEvent(new Event('submit', { bubbles: true }));
        activityList.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        activityList.dispatchEvent(new Event('input', { bubbles: true }));

        expect(handleActivityListSubmit).toHaveBeenCalled();
        expect(handleActivityListKeydown).toHaveBeenCalled();
        expect(handleActivityListInput).toHaveBeenCalled();

        const refreshSummary = initializeTimerUI.mock.calls[0][0].refreshActivitySummary;
        refreshSummary();
        expect(refreshTodayActivitySummary).toHaveBeenCalledWith(true);
    });

    test('restores activity mode before syncing timer ui when a running timer exists', () => {
        const activityRadio = document.getElementById('activity');
        const dispatchSpy = jest.spyOn(activityRadio, 'dispatchEvent');
        getRunningActivity.mockReturnValueOnce({
            description: 'Restored timer',
            startDateTime: '2026-04-21T09:00:00.000Z'
        });

        syncRestoredRunningTimer(true);

        expect(activityRadio.checked).toBe(true);
        expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
        expect(syncTimerFormState).toHaveBeenCalled();
    });

    test('only syncs timer ui when activities are enabled but no timer is running', () => {
        syncRestoredRunningTimer(true);

        expect(syncTimerFormState).toHaveBeenCalled();
    });

    test('does nothing when activities are disabled', () => {
        syncRestoredRunningTimer(false);

        expect(syncTimerFormState).not.toHaveBeenCalled();
        expect(getRunningActivity).not.toHaveBeenCalled();
    });
});

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
    getRunningActivity: jest.fn(() => null),
    getActivityOverlapTruncationPreviewForDate: jest.fn(() => ({
        success: true,
        truncatedCount: 2,
        truncatedActivityIds: ['activity-1', 'activity-2'],
        previewToken: 'preview-token',
        changes: [
            {
                activityId: 'activity-1',
                description: 'Writing',
                startDateTime: '2026-05-07T09:00:00.000Z',
                previousEndDateTime: '2026-05-07T10:00:00.000Z',
                nextEndDateTime: '2026-05-07T09:45:00.000Z',
                previousDuration: 60,
                nextDuration: 45,
                overlappingActivityId: 'activity-2',
                overlappingActivityDescription: 'Call'
            },
            {
                activityId: 'activity-2',
                description: 'Call',
                startDateTime: '2026-05-07T09:45:00.000Z',
                previousEndDateTime: '2026-05-07T11:00:00.000Z',
                nextEndDateTime: '2026-05-07T10:30:00.000Z',
                previousDuration: 75,
                nextDuration: 45,
                overlappingActivityId: 'activity-3',
                overlappingActivityDescription: 'Break'
            }
        ]
    })),
    truncateActivityOverlapsForDate: jest.fn(() =>
        Promise.resolve({ success: true, truncatedCount: 2 })
    )
}));

jest.mock('../public/js/modal-manager.js', () => ({
    askConfirmation: jest.fn(() => Promise.resolve(true)),
    showAlert: jest.fn(),
    showCustomAlert: jest.fn()
}));

jest.mock('../public/js/toast-manager.js', () => ({
    showToast: jest.fn()
}));

jest.mock('../public/js/activities/insights-renderer.js', () => ({
    expandInsightsActivityLogLimit: jest.fn(),
    setInsightsSelectedDate: jest.fn(),
    setSelectedTimelineBlock: jest.fn(),
    setInsightsTrendDateRange: jest.fn()
}));

import {
    createActivityAppCallbacks,
    initializeActivityUi,
    syncRestoredRunningTimer,
    syncRunningTimerDisplay
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
import {
    getActivityOverlapTruncationPreviewForDate,
    getRunningActivity,
    truncateActivityOverlapsForDate
} from '../public/js/activities/manager.js';
import { askConfirmation, showAlert, showCustomAlert } from '../public/js/modal-manager.js';
import { showToast } from '../public/js/toast-manager.js';
import {
    expandInsightsActivityLogLimit,
    setInsightsSelectedDate,
    setSelectedTimelineBlock,
    setInsightsTrendDateRange
} from '../public/js/activities/insights-renderer.js';

describe('activity app wiring', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = `
            <form id="task-form"></form>
            <div id="activity-list"></div>
            <div id="insights-trends"></div>
            <div id="insights-activity-log">
                <div id="insights-activity-list"></div>
            </div>
            <div id="insights-timeline"></div>
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

    test('preserves vertical scroll when global activity clicks refresh insights', () => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<div id="insights-view"><button class="btn-delete-activity">Delete</button></div>'
        );
        Object.defineProperty(window, 'scrollX', { value: 0, configurable: true });
        Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
        window.requestAnimationFrame = (callback) => callback();
        window.scrollTo = jest.fn();
        handleActivityListClick.mockImplementationOnce((_target, { refreshUI }) => {
            refreshUI();
            return true;
        });
        const refreshUI = jest.fn();
        const callbacks = createActivityAppCallbacks({
            getActivitiesEnabled: () => true,
            refreshUI,
            resetAllConfirmingDeleteFlags: jest.fn(),
            handleTaskSubmit: jest.fn(),
            focusTaskDescriptionInput: jest.fn(),
            resetTaskFormPreviewState: jest.fn(),
            initializeTaskTypeToggle: jest.fn()
        });

        callbacks.onGlobalClick({
            target: document.querySelector('#insights-view .btn-delete-activity')
        });

        expect(refreshUI).toHaveBeenCalled();
        expect(window.scrollTo).toHaveBeenCalledWith(0, 640);
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

    test('delegates insights activity list edit events', () => {
        const refreshUI = jest.fn();
        const refreshTaskDisplays = jest.fn();
        const signal = new AbortController().signal;

        initializeActivityUi({
            signal,
            refreshUI,
            refreshTaskDisplays,
            getActivitiesEnabled: () => true
        });

        const insightsActivityList = document.getElementById('insights-activity-list');
        insightsActivityList.dispatchEvent(new Event('submit', { bubbles: true }));
        insightsActivityList.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
        insightsActivityList.dispatchEvent(new Event('input', { bubbles: true }));

        expect(handleActivityListSubmit).toHaveBeenCalled();
        expect(handleActivityListKeydown).toHaveBeenCalled();
        expect(handleActivityListInput).toHaveBeenCalled();
    });

    test('clicking a trend range preset stores the range and renders insights', () => {
        const refreshUI = jest.fn();
        const refreshTaskDisplays = jest.fn();
        const renderInsights = jest.fn();
        const signal = new AbortController().signal;

        initializeActivityUi({
            signal,
            refreshUI,
            refreshTaskDisplays,
            getActivitiesEnabled: () => true,
            renderInsights
        });

        const trends = document.getElementById('insights-trends');
        trends.innerHTML =
            '<button type="button" data-trend-range-days="7" data-trend-range-start="2026-05-01" data-trend-range-end="2026-05-07">7 days</button>';
        trends
            .querySelector('[data-trend-range-days="7"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(setInsightsTrendDateRange).toHaveBeenCalledWith({
            startDate: '2026-05-01',
            endDate: '2026-05-07'
        });
        expect(renderInsights).toHaveBeenCalled();
    });

    test('clicking a trend day stores the selected date and renders insights', () => {
        const refreshUI = jest.fn();
        const refreshTaskDisplays = jest.fn();
        const renderInsights = jest.fn();
        const signal = new AbortController().signal;

        initializeActivityUi({
            signal,
            refreshUI,
            refreshTaskDisplays,
            getActivitiesEnabled: () => true,
            renderInsights
        });

        const trends = document.getElementById('insights-trends');
        trends.insertAdjacentHTML(
            'beforeend',
            '<button type="button" data-trend-day="2026-05-06">May 6</button>'
        );
        trends
            .querySelector('[data-trend-day="2026-05-06"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(setInsightsSelectedDate).toHaveBeenCalledWith('2026-05-06');
        expect(renderInsights).toHaveBeenCalled();
    });

    test('clicking a timeline block stores the selected block and renders insights', () => {
        const refreshUI = jest.fn();
        const refreshTaskDisplays = jest.fn();
        const renderInsights = jest.fn();
        const signal = new AbortController().signal;

        initializeActivityUi({
            signal,
            refreshUI,
            refreshTaskDisplays,
            getActivitiesEnabled: () => true,
            renderInsights
        });

        const timeline = document.getElementById('insights-timeline');
        timeline.innerHTML =
            '<button type="button" data-timeline-block-id="activity-1">Block</button>';
        timeline
            .querySelector('[data-timeline-block-id="activity-1"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(setSelectedTimelineBlock).toHaveBeenCalledWith('activity-1');
        expect(renderInsights).toHaveBeenCalled();
    });

    test('clicking show more expands the insights activity log and renders insights', () => {
        const refreshUI = jest.fn();
        const refreshTaskDisplays = jest.fn();
        const renderInsights = jest.fn();
        const signal = new AbortController().signal;

        initializeActivityUi({
            signal,
            refreshUI,
            refreshTaskDisplays,
            getActivitiesEnabled: () => true,
            renderInsights
        });

        const insightsActivityList = document.getElementById('insights-activity-list');
        insightsActivityList.innerHTML = '<button data-show-more-activities>Show 50 more</button>';
        insightsActivityList
            .querySelector('[data-show-more-activities]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(expandInsightsActivityLogLimit).toHaveBeenCalledWith(50);
        expect(renderInsights).toHaveBeenCalled();
    });

    test('clicking truncate overlaps confirms, repairs selected day, refreshes, and shows toast', async () => {
        const refreshUI = jest.fn();
        const refreshTaskDisplays = jest.fn();
        const renderInsights = jest.fn();
        const signal = new AbortController().signal;

        initializeActivityUi({
            signal,
            refreshUI,
            refreshTaskDisplays,
            getActivitiesEnabled: () => true,
            renderInsights
        });

        const insightsActivityLog = document.getElementById('insights-activity-log');
        insightsActivityLog.insertAdjacentHTML(
            'afterbegin',
            [
                '<button type="button" data-truncate-activity-overlaps',
                'data-truncate-activity-overlaps-date="2026-05-07">',
                'Truncate overlaps</button>'
            ].join(' ')
        );
        insightsActivityLog
            .querySelector('[data-truncate-activity-overlaps]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        await Promise.resolve();
        await Promise.resolve();

        expect(askConfirmation).toHaveBeenCalledWith(
            expect.any(HTMLElement),
            { ok: 'Repair selected', cancel: 'Cancel' },
            'slate',
            'wide',
            'Review overlap fixes'
        );
        const previewContent = askConfirmation.mock.calls[0][0];
        expect(previewContent.textContent).toMatch(
            /Writing[\s\S]*Call[\s\S]*Only selected end times and durations will change/
        );
        expect(previewContent.querySelectorAll('[data-overlap-repair-id]:checked')).toHaveLength(2);
        expect(getActivityOverlapTruncationPreviewForDate).toHaveBeenCalledWith('2026-05-07');
        expect(truncateActivityOverlapsForDate).toHaveBeenCalledWith(
            '2026-05-07',
            expect.objectContaining({
                previewToken: 'preview-token',
                selectedActivityIds: ['activity-1', 'activity-2']
            })
        );
        expect(refreshUI).toHaveBeenCalled();
        expect(renderInsights).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('Repaired 2 overlaps.', {
            theme: 'amber'
        });
    });

    test('clicking overlap repair in Today uses the same reviewed repair flow', async () => {
        const refreshUI = jest.fn();
        initializeActivityUi({
            signal: new AbortController().signal,
            refreshUI,
            refreshTaskDisplays: jest.fn(),
            getActivitiesEnabled: () => true,
            renderInsights: jest.fn()
        });
        document.getElementById('activity-list').innerHTML = `
            <button type="button" data-truncate-activity-overlaps
                data-truncate-activity-overlaps-date="2026-05-07">
                Review overlap fixes
            </button>
        `;

        document
            .querySelector('#activity-list [data-truncate-activity-overlaps]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();

        expect(getActivityOverlapTruncationPreviewForDate).toHaveBeenCalledWith('2026-05-07');
        expect(askConfirmation).toHaveBeenCalled();
        expect(truncateActivityOverlapsForDate).toHaveBeenCalledWith(
            '2026-05-07',
            expect.objectContaining({ selectedActivityIds: ['activity-1', 'activity-2'] })
        );
        expect(refreshUI).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('Repaired 2 overlaps.', { theme: 'amber' });
    });

    test('applies only rows that remain selected in the repair review', async () => {
        let resolveConfirmation;
        askConfirmation.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveConfirmation = resolve;
                })
        );
        const signal = new AbortController().signal;
        initializeActivityUi({
            signal,
            refreshUI: jest.fn(),
            refreshTaskDisplays: jest.fn(),
            getActivitiesEnabled: () => true,
            renderInsights: jest.fn()
        });
        document
            .getElementById('insights-activity-log')
            .insertAdjacentHTML(
                'afterbegin',
                '<button data-truncate-activity-overlaps data-truncate-activity-overlaps-date="2026-05-07">Review</button>'
            );

        document
            .querySelector('[data-truncate-activity-overlaps]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        const previewContent = askConfirmation.mock.calls[0][0];
        previewContent.querySelector('[data-overlap-repair-id="activity-2"]').checked = false;
        resolveConfirmation(true);
        await Promise.resolve();
        await Promise.resolve();

        expect(truncateActivityOverlapsForDate).toHaveBeenCalledWith(
            '2026-05-07',
            expect.objectContaining({ selectedActivityIds: ['activity-1'] })
        );
    });

    test('does not apply a stale preview and asks the user to review again', async () => {
        truncateActivityOverlapsForDate.mockResolvedValueOnce({
            success: false,
            code: 'preview-stale',
            reason: 'Activity data changed after the preview.'
        });
        const refreshUI = jest.fn();
        const signal = new AbortController().signal;
        initializeActivityUi({
            signal,
            refreshUI,
            refreshTaskDisplays: jest.fn(),
            getActivitiesEnabled: () => true,
            renderInsights: jest.fn()
        });
        document
            .getElementById('insights-activity-log')
            .insertAdjacentHTML(
                'afterbegin',
                '<button type="button" data-truncate-activity-overlaps data-truncate-activity-overlaps-date="2026-05-07">Review</button>'
            );

        document
            .querySelector('[data-truncate-activity-overlaps]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();

        expect(refreshUI).toHaveBeenCalled();
        expect(showAlert).toHaveBeenCalledWith('Activity data changed after the preview.', 'amber');
        expect(showToast).not.toHaveBeenCalled();
    });

    test('acknowledges partial progress and reopens a fresh preview for remaining repairs', async () => {
        truncateActivityOverlapsForDate.mockResolvedValueOnce({
            success: false,
            code: 'partial-failure',
            reason: 'Fixed 1 overlap change, but another activity could not be saved.',
            truncatedCount: 1,
            truncatedActivityIds: ['activity-1']
        });
        askConfirmation.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        showAlert.mockResolvedValueOnce();
        const refreshUI = jest.fn();
        initializeActivityUi({
            signal: new AbortController().signal,
            refreshUI,
            refreshTaskDisplays: jest.fn(),
            getActivitiesEnabled: () => true,
            renderInsights: jest.fn()
        });
        document
            .getElementById('insights-activity-log')
            .insertAdjacentHTML(
                'afterbegin',
                '<button data-truncate-activity-overlaps data-truncate-activity-overlaps-date="2026-05-07">Review</button>'
            );

        document
            .querySelector('[data-truncate-activity-overlaps]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(refreshUI).toHaveBeenCalled();
        expect(showAlert).toHaveBeenCalledWith(
            'Fixed 1 overlap change, but another activity could not be saved.',
            'amber'
        );
        expect(getActivityOverlapTruncationPreviewForDate).toHaveBeenCalledTimes(2);
        expect(askConfirmation).toHaveBeenCalledTimes(2);
        expect(truncateActivityOverlapsForDate).toHaveBeenCalledTimes(1);
    });

    test('explains overlaps that cannot be auto-fixed without deleting an activity', async () => {
        getActivityOverlapTruncationPreviewForDate.mockReturnValueOnce({
            success: true,
            truncatedCount: 0,
            changes: [],
            unresolvedOverlapCount: 1,
            unresolvedOverlaps: [
                {
                    activityId: 'activity-1',
                    description: 'Writing',
                    overlappingActivityId: 'activity-2',
                    overlappingActivityDescription: 'Call',
                    reason: 'same-start'
                }
            ]
        });
        const signal = new AbortController().signal;
        initializeActivityUi({
            signal,
            refreshUI: jest.fn(),
            refreshTaskDisplays: jest.fn(),
            getActivitiesEnabled: () => true,
            renderInsights: jest.fn()
        });
        document
            .getElementById('insights-activity-log')
            .insertAdjacentHTML(
                'afterbegin',
                '<button type="button" data-truncate-activity-overlaps data-truncate-activity-overlaps-date="2026-05-07">Review</button>'
            );

        document
            .querySelector('[data-truncate-activity-overlaps]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();

        expect(showCustomAlert).toHaveBeenCalledWith(
            'Review overlaps',
            expect.any(HTMLElement),
            'slate',
            'Done',
            'wide'
        );
        expect(showCustomAlert.mock.calls[0][1].textContent).toMatch(
            /Needs manual review[\s\S]*Writing[\s\S]*Call/
        );
        expect(askConfirmation).not.toHaveBeenCalled();
        expect(truncateActivityOverlapsForDate).not.toHaveBeenCalled();
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

    test('syncs running timer display without changing task type selection', () => {
        const activityRadio = document.getElementById('activity');
        const dispatchSpy = jest.spyOn(activityRadio, 'dispatchEvent');

        syncRunningTimerDisplay(true);

        expect(activityRadio.checked).toBe(false);
        expect(dispatchSpy).not.toHaveBeenCalled();
        expect(syncTimerFormState).toHaveBeenCalled();
    });

    test('does nothing when activities are disabled', () => {
        syncRestoredRunningTimer(false);

        expect(syncTimerFormState).not.toHaveBeenCalled();
        expect(getRunningActivity).not.toHaveBeenCalled();
    });

    test('does not sync running timer display when activities are disabled', () => {
        syncRunningTimerDisplay(false);

        expect(syncTimerFormState).not.toHaveBeenCalled();
    });
});

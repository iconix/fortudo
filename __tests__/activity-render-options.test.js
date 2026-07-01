/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/activities/manager.js', () => ({
    getTodaysActivities: jest.fn(() => []),
    getRunningActivity: jest.fn(() => null),
    getLiveTodayActivitySummary: jest.fn(() => null)
}));

jest.mock('../public/js/activities/renderer.js', () => ({
    renderActivities: jest.fn(),
    renderActivitySummaryOnly: jest.fn()
}));

import {
    getActivityRenderOptions,
    handleActivityListClick,
    resetActivityInlineEditState
} from '../public/js/activities/ui-handlers.js';

describe('activity render options', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        resetActivityInlineEditState();
    });

    test('returns shared inline state with overrides for alternate activity lists', () => {
        const refreshUI = jest.fn();
        const resetAllConfirmingDeleteFlags = jest.fn(() => false);
        const alternateSummaryActivities = [{ id: 'activity-1' }];

        const expandedTarget = document.createElement('button');
        expandedTarget.dataset.summaryParentKey = 'work';
        expandedTarget.dataset.summaryParentLegend = 'true';
        handleActivityListClick(expandedTarget, { refreshUI, resetAllConfirmingDeleteFlags });

        document.body.innerHTML = `
            <div id="insights-activity-list">
                <div class="activity-item" data-activity-id="activity-1">
                    <button class="btn-edit-activity" data-activity-id="activity-1"></button>
                </div>
                <div class="activity-item" data-activity-id="activity-2">
                    <button class="btn-delete-activity" data-activity-id="activity-2"></button>
                </div>
            </div>
        `;

        handleActivityListClick(document.querySelector('.btn-edit-activity'), {
            refreshUI,
            resetAllConfirmingDeleteFlags
        });
        handleActivityListClick(document.querySelector('.btn-delete-activity'), {
            refreshUI,
            resetAllConfirmingDeleteFlags
        });

        expect(
            getActivityRenderOptions({
                summaryActivities: alternateSummaryActivities,
                activityIssuesById: new Map([['activity-1', [{ severity: 'warning' }]]])
            })
        ).toEqual({
            editingActivityId: 'activity-1',
            expandedParentGroupKey: 'work',
            confirmingDeleteActivityId: 'activity-2',
            summaryActivities: alternateSummaryActivities,
            activityIssuesById: new Map([['activity-1', [{ severity: 'warning' }]]])
        });
    });

    test('does not refresh and overwrite drafts while clicking inside a scheduled task edit form', () => {
        document.body.innerHTML = `
            <form id="edit-task-task-1" data-task-id="task-1">
                <input name="duration-minutes" value="45">
            </form>
        `;
        const durationInput = document.querySelector('input[name="duration-minutes"]');
        const refreshUI = jest.fn(() => {
            durationInput.value = '30';
        });
        const resetAllConfirmingDeleteFlags = jest.fn(() => true);

        const handled = handleActivityListClick(durationInput, {
            refreshUI,
            resetAllConfirmingDeleteFlags
        });

        expect(handled).toBe(false);
        expect(resetAllConfirmingDeleteFlags).not.toHaveBeenCalled();
        expect(refreshUI).not.toHaveBeenCalled();
        expect(durationInput.value).toBe('45');
    });
});

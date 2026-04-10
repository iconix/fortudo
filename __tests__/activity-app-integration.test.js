/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn()
}));

jest.mock('../public/js/activities/form-utils.js', () => ({
    extractActivityFormData: jest.fn()
}));

jest.mock('../public/js/activities/handlers.js', () => ({
    handleAddActivity: jest.fn(() => Promise.resolve({ success: true })),
    handleEditActivity: jest.fn(() => Promise.resolve()),
    handleDeleteActivity: jest.fn(() => Promise.resolve()),
    handleSaveActivityEdit: jest.fn(() => Promise.resolve({ success: true }))
}));

jest.mock('../public/js/activities/manager.js', () => ({
    getTodaysActivities: jest.fn(() => []),
    getRunningActivity: jest.fn(() => null)
}));

jest.mock('../public/js/activities/renderer.js', () => ({
    renderActivities: jest.fn()
}));

import {
    syncActivitiesUI,
    renderTodayActivities,
    handleActivityAwareFormSubmit,
    handleActivityListClick,
    resetActivityInlineEditState
} from '../public/js/activities/ui-handlers.js';
import { extractActivityFormData } from '../public/js/activities/form-utils.js';
import {
    handleAddActivity,
    handleDeleteActivity,
    handleSaveActivityEdit
} from '../public/js/activities/handlers.js';
import { getTodaysActivities, getRunningActivity } from '../public/js/activities/manager.js';
import { renderActivities } from '../public/js/activities/renderer.js';

describe('activity app integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getRunningActivity.mockReturnValue(null);
        resetActivityInlineEditState();
        document.body.innerHTML = `
            <div id="activity-toggle-option" class="hidden"></div>
            <div id="activities-container" class="hidden"></div>
            <input id="scheduled" type="radio" name="task-type" checked />
            <input id="activity" type="radio" name="task-type" />
            <div id="activity-list"></div>
            <div id="end-time-hint"></div>
            <div id="overlap-warning"></div>
            <div id="task-form-fields">
                <div id="time-inputs"></div>
            </div>
            <div id="timer-display" class="hidden">
                <input id="timer-description" />
                <select id="timer-category"></select>
                <input id="timer-start-time" type="time" />
                <div id="timer-elapsed"></div>
                <button id="timer-stop-btn" type="button">Stop</button>
            </div>
            <button id="start-timer-btn" type="button" class="hidden">Start Timer</button>
            <button id="add-task-btn" type="submit">Add Task</button>
            <select id="category-select"></select>
            <form id="task-form">
                <input name="description" />
                <select name="category">
                    <option value="">No category</option>
                    <option value="work/deep">Deep Work</option>
                </select>
                <input type="radio" name="task-type" value="scheduled" checked />
                <input type="radio" name="task-type" value="activity" />
            </form>
        `;
    });

    test('shows activity UI when enabled', () => {
        syncActivitiesUI(true);

        expect(document.getElementById('activity-toggle-option').classList.contains('hidden')).toBe(
            false
        );
        expect(document.getElementById('activities-container').classList.contains('hidden')).toBe(
            false
        );
    });

    test('hides activity UI and restores scheduled mode when disabled', () => {
        document.getElementById('activity').checked = true;
        document.getElementById('scheduled').checked = false;

        syncActivitiesUI(false);

        expect(document.getElementById('activity-toggle-option').classList.contains('hidden')).toBe(
            true
        );
        expect(document.getElementById('activities-container').classList.contains('hidden')).toBe(
            true
        );
        expect(document.getElementById('activity').checked).toBe(false);
        expect(document.getElementById('scheduled').checked).toBe(true);
    });

    test('renders today activities into the default list when enabled', () => {
        const activities = [{ id: 'activity-1', description: 'Focus' }];
        getTodaysActivities.mockReturnValue(activities);

        renderTodayActivities(true);

        expect(getTodaysActivities).toHaveBeenCalled();
        expect(renderActivities).toHaveBeenCalledWith(
            activities,
            document.getElementById('activity-list'),
            expect.objectContaining({ editingActivityId: null })
        );
    });

    test('does not render today activities when disabled', () => {
        renderTodayActivities(false);

        expect(getTodaysActivities).not.toHaveBeenCalled();
        expect(renderActivities).not.toHaveBeenCalled();
    });

    test('submits activity forms through the activity flow', async () => {
        const form = document.getElementById('task-form');
        form.querySelector('input[value="scheduled"]').checked = false;
        form.querySelector('input[value="activity"]').checked = true;
        extractActivityFormData.mockReturnValue({
            description: 'Pairing',
            startDateTime: '2026-04-07T10:00:00.000Z',
            endDateTime: '2026-04-07T11:00:00.000Z',
            duration: 60,
            source: 'manual'
        });
        const resetTaskFormPreviewStateMock = jest.fn();
        const initializeTaskTypeToggleMock = jest.fn();
        const focusTaskDescriptionInputMock = jest.fn();
        const handleTaskSubmitMock = jest.fn();

        await handleActivityAwareFormSubmit(form, {
            activitiesEnabled: true,
            resetTaskFormPreviewState: resetTaskFormPreviewStateMock,
            initializeTaskTypeToggle: initializeTaskTypeToggleMock,
            focusTaskDescriptionInput: focusTaskDescriptionInputMock,
            handleTaskSubmit: handleTaskSubmitMock
        });

        expect(handleAddActivity).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Pairing' })
        );
        expect(resetTaskFormPreviewStateMock).toHaveBeenCalled();
        expect(initializeTaskTypeToggleMock).toHaveBeenCalled();
        expect(focusTaskDescriptionInputMock).toHaveBeenCalled();
        expect(handleTaskSubmitMock).not.toHaveBeenCalled();
        expect(form.querySelector('input[value="activity"]').checked).toBe(true);
    });

    test('preserves activity form input when activity save fails', async () => {
        const form = document.getElementById('task-form');
        const descriptionInput = form.querySelector('input[name="description"]');
        form.querySelector('input[value="scheduled"]').checked = false;
        form.querySelector('input[value="activity"]').checked = true;
        descriptionInput.value = 'Pairing';
        extractActivityFormData.mockReturnValue({
            description: 'Pairing',
            startDateTime: '2026-04-07T10:00:00.000Z',
            endDateTime: '2026-04-07T11:00:00.000Z',
            duration: 60,
            source: 'manual'
        });
        handleAddActivity.mockResolvedValue({ success: false, reason: 'Could not log activity.' });
        const resetTaskFormPreviewStateMock = jest.fn();
        const initializeTaskTypeToggleMock = jest.fn();
        const focusTaskDescriptionInputMock = jest.fn();

        await handleActivityAwareFormSubmit(form, {
            activitiesEnabled: true,
            resetTaskFormPreviewState: resetTaskFormPreviewStateMock,
            initializeTaskTypeToggle: initializeTaskTypeToggleMock,
            focusTaskDescriptionInput: focusTaskDescriptionInputMock,
            handleTaskSubmit: jest.fn()
        });

        expect(descriptionInput.value).toBe('Pairing');
        expect(resetTaskFormPreviewStateMock).not.toHaveBeenCalled();
        expect(initializeTaskTypeToggleMock).not.toHaveBeenCalled();
    });

    test('falls back to task submission for non-activity forms', async () => {
        const form = document.getElementById('task-form');
        const handleTaskSubmitMock = jest.fn();

        await handleActivityAwareFormSubmit(form, {
            activitiesEnabled: true,
            resetTaskFormPreviewState: jest.fn(),
            initializeTaskTypeToggle: jest.fn(),
            focusTaskDescriptionInput: jest.fn(),
            handleTaskSubmit: handleTaskSubmitMock
        });

        expect(handleTaskSubmitMock).toHaveBeenCalledWith(form);
        expect(handleAddActivity).not.toHaveBeenCalled();
    });

    test('returns after focusing description when activity extraction fails', async () => {
        const form = document.getElementById('task-form');
        form.querySelector('input[value="scheduled"]').checked = false;
        form.querySelector('input[value="activity"]').checked = true;
        extractActivityFormData.mockReturnValue(null);
        const focusTaskDescriptionInputMock = jest.fn();

        await handleActivityAwareFormSubmit(form, {
            activitiesEnabled: true,
            resetTaskFormPreviewState: jest.fn(),
            initializeTaskTypeToggle: jest.fn(),
            focusTaskDescriptionInput: focusTaskDescriptionInputMock,
            handleTaskSubmit: jest.fn()
        });

        expect(handleAddActivity).not.toHaveBeenCalled();
        expect(focusTaskDescriptionInputMock).toHaveBeenCalled();
    });

    test('clicking activity edit enters inline edit mode for that row', async () => {
        const activityList = document.getElementById('activity-list');
        activityList.innerHTML = `
            <article class="activity-item" data-activity-id="activity-1">
                <span class="text-sm text-slate-200">Current</span>
                <button class="btn-edit-activity" data-activity-id="activity-1"><span>Edit</span></button>
            </article>
        `;
        getTodaysActivities.mockReturnValue([{ id: 'activity-1', description: 'Current' }]);

        const refreshUIMock = jest.fn();
        const resetAllConfirmingDeleteFlagsMock = jest.fn(() => true);

        const handled = await handleActivityListClick(
            activityList.querySelector('.btn-edit-activity span'),
            {
                refreshUI: refreshUIMock,
                resetAllConfirmingDeleteFlags: resetAllConfirmingDeleteFlagsMock
            }
        );
        renderTodayActivities(true);

        expect(handled).toBe(true);
        expect(resetAllConfirmingDeleteFlagsMock).toHaveBeenCalled();
        expect(refreshUIMock).toHaveBeenCalled();
        expect(renderActivities).toHaveBeenLastCalledWith(
            [{ id: 'activity-1', description: 'Current' }],
            document.getElementById('activity-list'),
            expect.objectContaining({ editingActivityId: 'activity-1' })
        );
    });

    test('saving inline activity edits delegates the form to the activity edit handler', async () => {
        const activityList = document.getElementById('activity-list');
        activityList.innerHTML = `
            <form class="activity-inline-edit-form" data-activity-id="activity-11" data-activity-date="2026-04-07">
                <input name="description" value="Row description" />
                <input name="start-time" value="09:00" />
                <input name="duration-hours" value="1" />
                <input name="duration-minutes" value="15" />
                <select name="category"><option value="work/deep" selected>Deep Work</option></select>
                <button class="btn-save-activity-edit" type="button"><span>Save</span></button>
            </form>
        `;
        const refreshUIMock = jest.fn();

        const handled = await handleActivityListClick(
            activityList.querySelector('.btn-save-activity-edit span'),
            {
                refreshUI: refreshUIMock,
                resetAllConfirmingDeleteFlags: jest.fn()
            }
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handled).toBe(true);
        expect(handleSaveActivityEdit).toHaveBeenCalledWith(
            'activity-11',
            activityList.querySelector('form')
        );
        expect(refreshUIMock).toHaveBeenCalled();
    });

    test('canceling inline activity edit clears the inline edit state', async () => {
        getTodaysActivities.mockReturnValue([{ id: 'activity-12', description: 'Current' }]);
        const activityList = document.getElementById('activity-list');
        activityList.innerHTML = `
            <article class="activity-item" data-activity-id="activity-12">
                <span class="text-sm text-slate-200">Current</span>
                <button class="btn-edit-activity"><span>Edit</span></button>
            </article>
        `;

        await handleActivityListClick(activityList.querySelector('.btn-edit-activity span'), {
            refreshUI: jest.fn(),
            resetAllConfirmingDeleteFlags: jest.fn()
        });

        activityList.innerHTML = `
            <form class="activity-inline-edit-form" data-activity-id="activity-12" data-activity-date="2026-04-07">
                <button class="btn-cancel-activity-edit" type="button"><span>Cancel</span></button>
            </form>
        `;

        const handled = await handleActivityListClick(
            activityList.querySelector('.btn-cancel-activity-edit span'),
            {
                refreshUI: jest.fn(),
                resetAllConfirmingDeleteFlags: jest.fn()
            }
        );
        renderTodayActivities(true);

        expect(handled).toBe(true);
        expect(renderActivities).toHaveBeenLastCalledWith(
            [{ id: 'activity-12', description: 'Current' }],
            document.getElementById('activity-list'),
            expect.objectContaining({ editingActivityId: null })
        );
    });

    test('handles auto activity edit clicks while preserving provenance in the ui path', async () => {
        const activityList = document.getElementById('activity-list');
        activityList.innerHTML = `
            <article class="activity-item" data-activity-id="activity-auto-1">
                <span class="text-sm text-slate-200">Auto activity</span>
                <span class="activity-source-link" data-source-task-id="sched-1">auto</span>
                <button class="btn-edit-activity" data-activity-id="activity-auto-1"><span>Edit</span></button>
                <button class="btn-delete-activity" data-activity-id="activity-auto-1"><span>Delete</span></button>
            </article>
        `;
        getTodaysActivities.mockReturnValue([
            {
                id: 'activity-auto-1',
                description: 'Auto activity',
                source: 'auto',
                sourceTaskId: 'sched-1'
            }
        ]);

        const handled = await handleActivityListClick(
            activityList.querySelector('.btn-edit-activity span'),
            {
                refreshUI: jest.fn(),
                resetAllConfirmingDeleteFlags: jest.fn()
            }
        );
        renderTodayActivities(true);

        expect(handled).toBe(true);
        expect(renderActivities).toHaveBeenLastCalledWith(
            [
                {
                    id: 'activity-auto-1',
                    description: 'Auto activity',
                    source: 'auto',
                    sourceTaskId: 'sched-1'
                }
            ],
            document.getElementById('activity-list'),
            expect.objectContaining({ editingActivityId: 'activity-auto-1' })
        );
    });

    test('handles activity delete clicks', async () => {
        const activityList = document.getElementById('activity-list');
        activityList.innerHTML = `
            <article class="activity-item" data-activity-id="activity-2">
                <button class="btn-delete-activity"><span>Delete</span></button>
            </article>
        `;
        const refreshUIMock = jest.fn();
        const resetAllConfirmingDeleteFlagsMock = jest.fn(() => true);

        const handled = await handleActivityListClick(
            activityList.querySelector('.btn-delete-activity span'),
            {
                refreshUI: refreshUIMock,
                resetAllConfirmingDeleteFlags: resetAllConfirmingDeleteFlagsMock
            }
        );

        expect(handled).toBe(true);
        expect(resetAllConfirmingDeleteFlagsMock).toHaveBeenCalled();
        expect(refreshUIMock).toHaveBeenCalled();
        expect(handleDeleteActivity).toHaveBeenCalledWith('activity-2');
    });

    test('activity actions still resolve ids when refresh rerenders the list', async () => {
        const activityList = document.getElementById('activity-list');
        activityList.innerHTML = `
            <article class="activity-item" data-activity-id="activity-9">
                <span class="text-sm text-slate-200">Before rerender</span>
                <button class="btn-edit-activity"><span>Edit</span></button>
                <button class="btn-delete-activity"><span>Delete</span></button>
            </article>
        `;
        const rerenderingRefreshMock = jest.fn(() => {
            activityList.innerHTML = '<div>rerendered</div>';
        });

        await handleActivityListClick(activityList.querySelector('.btn-edit-activity span'), {
            refreshUI: rerenderingRefreshMock,
            resetAllConfirmingDeleteFlags: jest.fn(() => true)
        });

        expect(rerenderingRefreshMock).toHaveBeenCalled();

        activityList.innerHTML = `
            <article class="activity-item" data-activity-id="activity-10">
                <button class="btn-delete-activity"><span>Delete</span></button>
            </article>
        `;
        const deleteRefreshMock = jest.fn(() => {
            activityList.innerHTML = '<div>rerendered again</div>';
        });

        await handleActivityListClick(activityList.querySelector('.btn-delete-activity span'), {
            refreshUI: deleteRefreshMock,
            resetAllConfirmingDeleteFlags: jest.fn(() => true)
        });

        expect(handleDeleteActivity).toHaveBeenCalledWith('activity-10');
    });

    test('clears confirming delete state for non-task non-activity clicks', async () => {
        const refreshUIMock = jest.fn();
        const resetAllConfirmingDeleteFlagsMock = jest.fn(() => true);
        const outside = document.createElement('div');
        document.body.appendChild(outside);

        const handled = await handleActivityListClick(outside, {
            refreshUI: refreshUIMock,
            resetAllConfirmingDeleteFlags: resetAllConfirmingDeleteFlagsMock
        });

        expect(handled).toBe(false);
        expect(resetAllConfirmingDeleteFlagsMock).toHaveBeenCalled();
        expect(refreshUIMock).toHaveBeenCalled();
    });

    test('save failure keeps the activity row in inline edit mode', async () => {
        handleSaveActivityEdit.mockResolvedValue({
            success: false,
            reason: 'Could not update activity.'
        });
        getTodaysActivities.mockReturnValue([{ id: 'activity-3', description: 'Current' }]);
        const activityList = document.getElementById('activity-list');
        activityList.innerHTML = `
            <article class="activity-item" data-activity-id="activity-3">
                <button class="btn-edit-activity" type="button"><span>Edit</span></button>
            </article>
        `;

        await handleActivityListClick(activityList.querySelector('.btn-edit-activity span'), {
            refreshUI: jest.fn(),
            resetAllConfirmingDeleteFlags: jest.fn()
        });

        activityList.innerHTML = `
            <form class="activity-inline-edit-form" data-activity-id="activity-3" data-activity-date="2026-04-07">
                <input name="description" value="Current" />
                <input name="start-time" value="09:00" />
                <input name="duration-hours" value="1" />
                <input name="duration-minutes" value="0" />
                <select name="category"></select>
                <button class="btn-save-activity-edit" type="button"><span>Save</span></button>
            </form>
        `;

        const handled = await handleActivityListClick(
            activityList.querySelector('.btn-save-activity-edit span'),
            {
                refreshUI: jest.fn(),
                resetAllConfirmingDeleteFlags: jest.fn()
            }
        );
        renderTodayActivities(true);

        expect(handled).toBe(true);
        expect(renderActivities).toHaveBeenLastCalledWith(
            [{ id: 'activity-3', description: 'Current' }],
            document.getElementById('activity-list'),
            expect.objectContaining({ editingActivityId: 'activity-3' })
        );
    });

    test('activity form submission returns early when a timer is running', async () => {
        const form = document.getElementById('task-form');
        form.querySelector('input[value="scheduled"]').checked = false;
        form.querySelector('input[value="activity"]').checked = true;
        getRunningActivity.mockReturnValue({
            description: 'Running',
            startDateTime: '2026-04-09T10:00:00.000Z'
        });
        const handleTaskSubmitMock = jest.fn();

        await handleActivityAwareFormSubmit(form, {
            activitiesEnabled: true,
            resetTaskFormPreviewState: jest.fn(),
            initializeTaskTypeToggle: jest.fn(),
            focusTaskDescriptionInput: jest.fn(),
            handleTaskSubmit: handleTaskSubmitMock
        });

        expect(handleAddActivity).not.toHaveBeenCalled();
        expect(handleTaskSubmitMock).not.toHaveBeenCalled();
    });
});

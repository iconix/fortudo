/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/activities/form-utils.js', () => ({
    extractActivityFormData: jest.fn()
}));

jest.mock('../public/js/activities/handlers.js', () => ({
    handleAddActivity: jest.fn(() => Promise.resolve()),
    handleEditActivity: jest.fn(() => Promise.resolve()),
    handleDeleteActivity: jest.fn(() => Promise.resolve())
}));

jest.mock('../public/js/activities/manager.js', () => ({
    getTodaysActivities: jest.fn(() => [])
}));

jest.mock('../public/js/activities/renderer.js', () => ({
    renderActivities: jest.fn()
}));

import {
    syncActivitiesUI,
    renderTodayActivities,
    handleActivityAwareFormSubmit,
    handleActivityListClick
} from '../public/js/activities/ui-handlers.js';
import { extractActivityFormData } from '../public/js/activities/form-utils.js';
import {
    handleAddActivity,
    handleEditActivity,
    handleDeleteActivity
} from '../public/js/activities/handlers.js';
import { getTodaysActivities } from '../public/js/activities/manager.js';
import { renderActivities } from '../public/js/activities/renderer.js';

describe('activity app integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = `
            <div id="activity-toggle-option" class="hidden"></div>
            <div id="activities-container" class="hidden"></div>
            <input id="scheduled" type="radio" name="task-type" checked />
            <input id="activity" type="radio" name="task-type" />
            <div id="activity-list"></div>
            <div id="end-time-hint"></div>
            <div id="overlap-warning"></div>
            <button id="add-task-btn" type="submit">Add Task</button>
            <select id="category-select"></select>
            <form id="task-form">
                <input name="description" />
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
            document.getElementById('activity-list')
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

    test('handles activity edit clicks and trims prompt output', async () => {
        const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('  Updated  ');
        const activityList = document.getElementById('activity-list');
        activityList.innerHTML = `
            <article data-activity-id="activity-1">
                <span class="text-sm text-slate-200">Current</span>
                <button class="btn-edit-activity"><span>Edit</span></button>
            </article>
        `;

        const handled = await handleActivityListClick(
            activityList.querySelector('.btn-edit-activity span'),
            {
                refreshUI: jest.fn(),
                resetAllConfirmingDeleteFlags: jest.fn()
            }
        );

        expect(handled).toBe(true);
        expect(handleEditActivity).toHaveBeenCalledWith('activity-1', {
            description: 'Updated'
        });
        promptSpy.mockRestore();
    });

    test('handles activity delete clicks', async () => {
        const activityList = document.getElementById('activity-list');
        activityList.innerHTML = `
            <article data-activity-id="activity-2">
                <button class="btn-delete-activity"><span>Delete</span></button>
            </article>
        `;

        const handled = await handleActivityListClick(
            activityList.querySelector('.btn-delete-activity span'),
            {
                refreshUI: jest.fn(),
                resetAllConfirmingDeleteFlags: jest.fn()
            }
        );

        expect(handled).toBe(true);
        expect(handleDeleteActivity).toHaveBeenCalledWith('activity-2');
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
});

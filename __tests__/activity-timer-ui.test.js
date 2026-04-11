/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn()
}));

jest.mock('../public/js/activities/handlers.js', () => ({
    handleStartTimer: jest.fn(() => Promise.resolve({ success: true })),
    handleStopTimer: jest.fn(() => Promise.resolve({ success: true }))
}));

jest.mock('../public/js/activities/manager.js', () => ({
    getRunningActivity: jest.fn(() => null),
    updateRunningActivity: jest.fn(() => Promise.resolve({ success: true }))
}));

import {
    showTimerDisplay,
    hideTimerDisplay,
    disposeTimerUI,
    syncTimerFormState,
    initializeTimerUI
} from '../public/js/activities/timer-ui.js';
import { handleStartTimer, handleStopTimer } from '../public/js/activities/handlers.js';
import { getRunningActivity, updateRunningActivity } from '../public/js/activities/manager.js';
import { showAlert } from '../public/js/modal-manager.js';

describe('activity timer ui', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getRunningActivity.mockReturnValue(null);
        updateRunningActivity.mockResolvedValue({ success: true });
        handleStartTimer.mockResolvedValue({ success: true });
        handleStopTimer.mockResolvedValue({ success: true });
        document.body.innerHTML = `
            <input id="scheduled" type="radio" name="task-type" checked />
            <input id="activity" type="radio" name="task-type" />
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

    describe('display state', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-04-09T11:00:00.000Z'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('showTimerDisplay hides form fields and shows timer state', () => {
            showTimerDisplay({
                description: 'Timer work',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            expect(document.getElementById('task-form-fields').classList.contains('hidden')).toBe(
                true
            );
            expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(
                false
            );
            expect(document.getElementById('timer-description').value).toBe('Timer work');
            expect(document.getElementById('timer-category').value).toBe('work/deep');
            expect(document.getElementById('timer-start-time').value).toBe(
                `${String(new Date('2026-04-09T10:00:00.000Z').getHours()).padStart(2, '0')}:${String(
                    new Date('2026-04-09T10:00:00.000Z').getMinutes()
                ).padStart(2, '0')}`
            );
            expect(document.getElementById('timer-elapsed').textContent).toBe('01:00:00');
        });

        test('elapsed counter updates while timer is visible', () => {
            showTimerDisplay({
                description: 'Timer work',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            jest.advanceTimersByTime(30000);

            expect(document.getElementById('timer-elapsed').textContent).toBe('01:00:30');
        });

        test('hideTimerDisplay restores the form and stops elapsed updates', () => {
            showTimerDisplay({
                description: 'Timer work',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            hideTimerDisplay();
            const textAfterHide = document.getElementById('timer-elapsed').textContent;
            jest.advanceTimersByTime(5000);

            expect(document.getElementById('task-form-fields').classList.contains('hidden')).toBe(
                false
            );
            expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(
                true
            );
            expect(document.getElementById('timer-elapsed').textContent).toBe(textAfterHide);
        });

        test('showTimerDisplay returns early when required elements are missing', () => {
            document.getElementById('task-form-fields').remove();

            showTimerDisplay({
                description: 'Timer work',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(
                true
            );
        });

        test('showTimerDisplay leaves elapsed text unchanged for invalid timer start times', () => {
            document.getElementById('timer-elapsed').textContent = 'unchanged';

            showTimerDisplay({
                description: 'Timer work',
                startDateTime: 'not-a-date'
            });

            expect(document.getElementById('timer-description').value).toBe('Timer work');
            expect(document.getElementById('timer-elapsed').textContent).toBe('unchanged');
        });
    });

    describe('form state', () => {
        test('shows timer display when activity tab is selected and timer is running', () => {
            document.getElementById('activity').checked = true;
            getRunningActivity.mockReturnValue({
                description: 'Running',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            syncTimerFormState();

            expect(document.getElementById('task-form-fields').classList.contains('hidden')).toBe(
                true
            );
            expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(
                false
            );
            expect(document.getElementById('start-timer-btn').classList.contains('hidden')).toBe(
                false
            );
        });

        test('shows start timer button when activity tab is selected and no timer is running', () => {
            document.getElementById('activity').checked = true;

            syncTimerFormState();

            expect(document.getElementById('task-form-fields').classList.contains('hidden')).toBe(
                false
            );
            expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(
                true
            );
            expect(document.getElementById('start-timer-btn').classList.contains('hidden')).toBe(
                false
            );
        });

        test('keeps timer hidden on non-activity tabs', () => {
            document.getElementById('scheduled').checked = true;
            getRunningActivity.mockReturnValue({
                description: 'Running',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            syncTimerFormState();

            expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(
                true
            );
            expect(document.getElementById('start-timer-btn').classList.contains('hidden')).toBe(
                true
            );
        });
    });

    describe('initializeTimerUI', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('start timer button uses form values and refreshes UI on success', async () => {
            document.getElementById('activity').checked = true;
            document.querySelector('#task-form input[name="description"]').value = 'Feature work';
            document.querySelector('#task-form select[name="category"]').value = 'work/deep';
            const refreshUI = jest.fn();

            initializeTimerUI({ refreshUI });
            document
                .getElementById('start-timer-btn')
                .dispatchEvent(new Event('click', { bubbles: true }));
            await Promise.resolve();

            expect(handleStartTimer).toHaveBeenCalledWith({
                description: 'Feature work',
                category: 'work/deep'
            });
            expect(refreshUI).toHaveBeenCalled();
        });

        test('re-initializing timer UI does not duplicate start/stop handlers', async () => {
            document.getElementById('activity').checked = true;
            document.querySelector('#task-form input[name="description"]').value = 'Feature work';
            const refreshUI = jest.fn();

            initializeTimerUI({ refreshUI });
            initializeTimerUI({ refreshUI });

            document
                .getElementById('start-timer-btn')
                .dispatchEvent(new Event('click', { bubbles: true }));
            await Promise.resolve();

            document
                .getElementById('timer-stop-btn')
                .dispatchEvent(new Event('click', { bubbles: true }));
            await Promise.resolve();

            expect(handleStartTimer).toHaveBeenCalledTimes(1);
            expect(handleStopTimer).toHaveBeenCalledTimes(1);
        });

        test('start timer button alerts when description is blank', async () => {
            document.getElementById('activity').checked = true;

            initializeTimerUI({ refreshUI: jest.fn() });
            document
                .getElementById('start-timer-btn')
                .dispatchEvent(new Event('click', { bubbles: true }));
            await Promise.resolve();

            expect(handleStartTimer).not.toHaveBeenCalled();
            expect(showAlert).toHaveBeenCalledWith(
                'Please enter a description before starting the timer.',
                'sky'
            );
        });

        test('start timer button uses timer display values when replacing a running timer', async () => {
            document.getElementById('activity').checked = true;
            getRunningActivity.mockReturnValue({
                description: 'Current timer',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });
            document.querySelector('#task-form input[name="description"]').value = 'Form value';
            document.getElementById('timer-description').value = 'Replacement timer';
            document.getElementById('timer-category').innerHTML =
                '<option value="break/admin">Admin</option>';
            document.getElementById('timer-category').value = 'break/admin';

            initializeTimerUI({ refreshUI: jest.fn() });
            document
                .getElementById('start-timer-btn')
                .dispatchEvent(new Event('click', { bubbles: true }));
            await Promise.resolve();

            expect(handleStartTimer).toHaveBeenCalledWith({
                description: 'Replacement timer',
                category: 'break/admin'
            });
        });

        test('disposing timer UI removes existing listeners until re-initialized', async () => {
            document.getElementById('activity').checked = true;
            document.querySelector('#task-form input[name="description"]').value = 'Feature work';
            const refreshUI = jest.fn();

            initializeTimerUI({ refreshUI });
            disposeTimerUI();

            document
                .getElementById('start-timer-btn')
                .dispatchEvent(new Event('click', { bubbles: true }));
            document
                .getElementById('timer-stop-btn')
                .dispatchEvent(new Event('click', { bubbles: true }));
            await Promise.resolve();

            expect(handleStartTimer).not.toHaveBeenCalled();
            expect(handleStopTimer).not.toHaveBeenCalled();
        });

        test('stop timer button delegates to handler and refreshes UI', async () => {
            const refreshUI = jest.fn();

            initializeTimerUI({ refreshUI });
            document
                .getElementById('timer-stop-btn')
                .dispatchEvent(new Event('click', { bubbles: true }));
            await Promise.resolve();

            expect(handleStopTimer).toHaveBeenCalled();
            expect(refreshUI).toHaveBeenCalled();
        });

        test('failed timer stop does not refresh the UI', async () => {
            handleStopTimer.mockResolvedValueOnce({ success: false, reason: 'No timer running.' });
            const refreshUI = jest.fn();

            initializeTimerUI({ refreshUI });
            document
                .getElementById('timer-stop-btn')
                .dispatchEvent(new Event('click', { bubbles: true }));
            await Promise.resolve();

            expect(refreshUI).not.toHaveBeenCalled();
        });

        test('timer field edits persist running activity changes', async () => {
            getRunningActivity.mockReturnValue({
                description: 'Running',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });
            updateRunningActivity
                .mockResolvedValueOnce({
                    success: true,
                    runningActivity: {
                        description: 'Updated',
                        category: 'work/deep',
                        startDateTime: '2026-04-09T10:00:00.000Z'
                    }
                })
                .mockResolvedValueOnce({
                    success: true,
                    runningActivity: {
                        description: 'Updated',
                        category: 'work/deep',
                        startDateTime: '2026-04-09T10:00:00.000Z'
                    }
                })
                .mockResolvedValueOnce({
                    success: true,
                    runningActivity: {
                        description: 'Updated',
                        category: 'work/deep',
                        startDateTime: '2026-04-09T09:30:00.000Z'
                    }
                });

            initializeTimerUI({ refreshUI: jest.fn() });
            showTimerDisplay({
                description: 'Running',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            const descriptionInput = document.getElementById('timer-description');
            descriptionInput.value = 'Updated';
            descriptionInput.dispatchEvent(new Event('change', { bubbles: true }));

            const categoryInput = document.getElementById('timer-category');
            categoryInput.innerHTML = '<option value="work/deep">Deep Work</option>';
            categoryInput.value = 'work/deep';
            categoryInput.dispatchEvent(new Event('change', { bubbles: true }));

            const startTimeInput = document.getElementById('timer-start-time');
            startTimeInput.value = '09:30';
            startTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();

            const expectedStartDate = new Date('2026-04-09T10:00:00.000Z');
            expectedStartDate.setHours(9, 30, 0, 0);

            expect(updateRunningActivity).toHaveBeenCalledWith({ description: 'Updated' });
            expect(updateRunningActivity).toHaveBeenCalledWith({ category: 'work/deep' });
            expect(updateRunningActivity).toHaveBeenCalledWith({
                startDateTime: expectedStartDate.toISOString()
            });
            expect(document.getElementById('timer-elapsed').textContent).toBe('00:30:00');
        });

        test('failed timer description edits rollback the visible value and alert', async () => {
            getRunningActivity.mockReturnValue({
                description: 'Running',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });
            updateRunningActivity.mockResolvedValueOnce({
                success: false,
                reason: 'Description is required while a timer is running.'
            });

            initializeTimerUI({ refreshUI: jest.fn() });
            showTimerDisplay({
                description: 'Running',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            const descriptionInput = document.getElementById('timer-description');
            descriptionInput.value = '';
            descriptionInput.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();

            expect(descriptionInput.value).toBe('Running');
            expect(showAlert).toHaveBeenCalledWith(
                'Description is required while a timer is running.',
                'sky'
            );
        });

        test('failed timer category edits rollback the visible value and alert', async () => {
            getRunningActivity.mockReturnValue({
                description: 'Running',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });
            updateRunningActivity.mockResolvedValueOnce({
                success: false,
                reason: 'Category update failed.'
            });

            initializeTimerUI({ refreshUI: jest.fn() });
            showTimerDisplay({
                description: 'Running',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            const categoryInput = document.getElementById('timer-category');
            categoryInput.innerHTML =
                '<option value="work/deep">Deep Work</option><option value="break/admin">Admin</option>';
            categoryInput.value = 'break/admin';
            categoryInput.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();

            expect(categoryInput.value).toBe('work/deep');
            expect(showAlert).toHaveBeenCalledWith('Category update failed.', 'sky');
        });

        test('timer start time changes are ignored without a running activity or time value', async () => {
            initializeTimerUI({ refreshUI: jest.fn() });

            const startTimeInput = document.getElementById('timer-start-time');
            startTimeInput.value = '';
            startTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();

            expect(updateRunningActivity).not.toHaveBeenCalled();
        });

        test('failed timer start time edits rollback the visible value and alert', async () => {
            getRunningActivity.mockReturnValue({
                description: 'Running',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });
            updateRunningActivity.mockResolvedValueOnce({
                success: false,
                reason: 'Start time update failed.'
            });

            initializeTimerUI({ refreshUI: jest.fn() });
            showTimerDisplay({
                description: 'Running',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z'
            });

            const startTimeInput = document.getElementById('timer-start-time');
            startTimeInput.value = '09:15';
            startTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();

            const previousDate = new Date('2026-04-09T10:00:00.000Z');
            const previousValue = `${String(previousDate.getHours()).padStart(2, '0')}:${String(
                previousDate.getMinutes()
            ).padStart(2, '0')}`;

            expect(startTimeInput.value).toBe(previousValue);
            expect(showAlert).toHaveBeenCalledWith('Start time update failed.', 'sky');
        });
    });
});

/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/settings-manager.js', () => ({
    isOnboardingDismissed: jest.fn(() => false),
    isOnboardingSnoozed: jest.fn(() => false),
    setOnboardingDismissed: jest.fn(() => Promise.resolve()),
    snoozeOnboarding: jest.fn(() => Promise.resolve())
}));

import {
    isOnboardingDismissed,
    isOnboardingSnoozed,
    setOnboardingDismissed,
    snoozeOnboarding
} from '../public/js/settings-manager.js';

function renderTargets() {
    document.body.innerHTML = `
        <form id="task-form">
            <label id="scheduled-toggle-option">
                <input id="scheduled" name="task-type" type="radio" value="scheduled" checked />
                Scheduled
            </label>
            <label id="unscheduled-toggle-option">
                <input id="unscheduled" name="task-type" type="radio" value="unscheduled" />
                Unscheduled
            </label>
            <label id="activity-toggle-option">
                <input id="activity" name="task-type" type="radio" value="activity" />
                Activity
            </label>
            <button id="start-timer-btn" type="button" class="hidden">Start Timer</button>
        </form>
        <button id="view-toggle-tasks" type="button" aria-pressed="true">Tasks</button>
        <button id="view-toggle-insights" type="button" aria-pressed="false">Insights</button>
    `;

    document.getElementById('activity')?.addEventListener('change', () => {
        document.getElementById('start-timer-btn')?.classList.remove('hidden');
    });
    document.getElementById('view-toggle-insights')?.addEventListener('click', () => {
        document.getElementById('view-toggle-tasks')?.setAttribute('aria-pressed', 'false');
        document.getElementById('view-toggle-insights')?.setAttribute('aria-pressed', 'true');
    });
}

describe('activity onboarding walkthrough', () => {
    beforeEach(() => {
        document.getElementById('activity-onboarding')?.remove();
        jest.clearAllMocks();
        isOnboardingDismissed.mockReturnValue(false);
        isOnboardingSnoozed.mockReturnValue(false);
        setOnboardingDismissed.mockResolvedValue();
        snoozeOnboarding.mockResolvedValue();
        renderTargets();
    });

    test('does nothing when Activities are disabled', async () => {
        const { maybeShowOnboarding } = await import('../public/js/activities/onboarding.js');

        await maybeShowOnboarding({ activitiesEnabled: false });

        expect(document.querySelector('[data-activity-onboarding]')).toBeNull();
        expect(setOnboardingDismissed).not.toHaveBeenCalled();
    });

    test('does nothing when onboarding was already dismissed for the room', async () => {
        isOnboardingDismissed.mockReturnValue(true);
        const { maybeShowOnboarding } = await import('../public/js/activities/onboarding.js');

        await maybeShowOnboarding({ activitiesEnabled: true });

        expect(document.querySelector('[data-activity-onboarding]')).toBeNull();
        expect(setOnboardingDismissed).not.toHaveBeenCalled();
    });

    test('does nothing while onboarding is snoozed for the room', async () => {
        isOnboardingSnoozed.mockReturnValue(true);
        const { maybeShowOnboarding } = await import('../public/js/activities/onboarding.js');

        await maybeShowOnboarding({ activitiesEnabled: true });

        expect(document.querySelector('[data-activity-onboarding]')).toBeNull();
        expect(setOnboardingDismissed).not.toHaveBeenCalled();
        expect(snoozeOnboarding).not.toHaveBeenCalled();
    });

    test('renders the first tooltip and highlights its target', async () => {
        const { maybeShowOnboarding } = await import('../public/js/activities/onboarding.js');

        await maybeShowOnboarding({ activitiesEnabled: true });

        const tooltip = document.querySelector('[data-activity-onboarding]');
        expect(tooltip).not.toBeNull();
        expect(tooltip.textContent).toContain('Activity mode');
        expect(tooltip.textContent).toContain('1 of 3');
        expect(document.getElementById('activity-toggle-option').className).toContain(
            'activity-onboarding-target'
        );
        expect(document.getElementById('activity').checked).toBe(true);
    });

    test('advances through all steps and persists dismissal on Done', async () => {
        const { maybeShowOnboarding } = await import('../public/js/activities/onboarding.js');
        await maybeShowOnboarding({ activitiesEnabled: true });

        document.querySelector('[data-activity-onboarding-next]').click();
        expect(document.querySelector('[data-activity-onboarding]').textContent).toContain(
            'Live timer'
        );
        expect(document.getElementById('start-timer-btn').className).toContain(
            'activity-onboarding-target'
        );
        expect(document.getElementById('start-timer-btn').classList.contains('hidden')).toBe(false);

        document.querySelector('[data-activity-onboarding-next]').click();
        expect(document.querySelector('[data-activity-onboarding]').textContent).toContain(
            'Insights'
        );
        expect(document.getElementById('view-toggle-insights').className).toContain(
            'activity-onboarding-target'
        );
        expect(document.getElementById('view-toggle-insights').getAttribute('aria-pressed')).toBe(
            'true'
        );

        document.querySelector('[data-activity-onboarding-next]').click();
        await Promise.resolve();

        expect(setOnboardingDismissed).toHaveBeenCalledWith(true);
        expect(document.querySelector('[data-activity-onboarding]')).toBeNull();
    });

    test('skip persists dismissal and removes the tooltip', async () => {
        const { maybeShowOnboarding } = await import('../public/js/activities/onboarding.js');
        await maybeShowOnboarding({ activitiesEnabled: true });

        document.querySelector('[data-activity-onboarding-skip]').click();
        await Promise.resolve();

        expect(setOnboardingDismissed).toHaveBeenCalledWith(true);
        expect(document.querySelector('[data-activity-onboarding]')).toBeNull();
        expect(document.getElementById('activity-toggle-option').className).not.toContain(
            'activity-onboarding-target'
        );
    });

    test('remind me later snoozes onboarding without dismissing it permanently', async () => {
        const { maybeShowOnboarding } = await import('../public/js/activities/onboarding.js');
        await maybeShowOnboarding({ activitiesEnabled: true });

        document.querySelector('[data-activity-onboarding-snooze]').click();
        await Promise.resolve();

        expect(snoozeOnboarding).toHaveBeenCalledTimes(1);
        expect(setOnboardingDismissed).not.toHaveBeenCalled();
        expect(document.querySelector('[data-activity-onboarding]')).toBeNull();
        expect(document.getElementById('activity-toggle-option').className).not.toContain(
            'activity-onboarding-target'
        );
    });
});

/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/settings-manager.js', () => ({
    isOnboardingDismissed: jest.fn(() => false),
    setOnboardingDismissed: jest.fn(() => Promise.resolve())
}));

import { isOnboardingDismissed, setOnboardingDismissed } from '../public/js/settings-manager.js';

function renderTargets() {
    document.body.innerHTML = `
        <div id="activity-toggle-option"></div>
        <button id="start-timer-btn" type="button"></button>
        <button id="view-toggle-insights" type="button"></button>
    `;
}

describe('activity onboarding walkthrough', () => {
    beforeEach(() => {
        document.getElementById('activity-onboarding')?.remove();
        jest.clearAllMocks();
        isOnboardingDismissed.mockReturnValue(false);
        setOnboardingDismissed.mockResolvedValue();
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

        document.querySelector('[data-activity-onboarding-next]').click();
        expect(document.querySelector('[data-activity-onboarding]').textContent).toContain(
            'Insights'
        );
        expect(document.getElementById('view-toggle-insights').className).toContain(
            'activity-onboarding-target'
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
});

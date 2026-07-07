/**
 * @jest-environment jsdom
 */

describe("what's new modal", () => {
    beforeEach(() => {
        localStorage.clear();
        jest.resetModules();
    });

    test('does nothing when announcement flag is disabled', async () => {
        const { maybeShowWhatsNew, WHATS_NEW_KEY } = await import('../public/js/whats-new.js');
        const showAlert = jest.fn();

        await maybeShowWhatsNew({ announcementEnabled: false, activitiesEnabled: true, showAlert });

        expect(showAlert).not.toHaveBeenCalled();
        expect(localStorage.getItem(WHATS_NEW_KEY)).toBeNull();
    });

    test('shows announcement before Activities are enabled when flag is enabled', async () => {
        const { maybeShowWhatsNew } = await import('../public/js/whats-new.js');
        const showAlert = jest.fn();

        await maybeShowWhatsNew({ announcementEnabled: true, activitiesEnabled: false, showAlert });

        const [, message] = showAlert.mock.calls[0];

        expect(showAlert).toHaveBeenCalledWith(
            "What's New in Fortudo",
            expect.any(HTMLElement),
            'sky'
        );
        expect(message.querySelector('[data-whats-new-intro]').textContent).toContain(
            'Activities are ready to try'
        );
        expect(message.querySelectorAll('[data-whats-new-feature]')).toHaveLength(3);
        expect(message.textContent).toContain('Activity Logging');
        expect(message.textContent).toContain('Live Timer');
        expect(message.textContent).toContain('Insights View');
    });

    test('does not show announcement when already dismissed', async () => {
        const { maybeShowWhatsNew, WHATS_NEW_KEY } = await import('../public/js/whats-new.js');
        const showAlert = jest.fn();
        localStorage.setItem(WHATS_NEW_KEY, 'dismissed');

        await maybeShowWhatsNew({ announcementEnabled: true, showAlert });

        expect(showAlert).not.toHaveBeenCalled();
    });

    test('sets localStorage only after alert completes', async () => {
        const { maybeShowWhatsNew, WHATS_NEW_KEY } = await import('../public/js/whats-new.js');
        let resolveAlert;
        const showAlert = jest.fn(
            () =>
                new Promise((resolve) => {
                    resolveAlert = resolve;
                })
        );

        const resultPromise = maybeShowWhatsNew({ announcementEnabled: true, showAlert });

        expect(localStorage.getItem(WHATS_NEW_KEY)).toBeNull();

        resolveAlert();
        await resultPromise;

        expect(localStorage.getItem(WHATS_NEW_KEY)).toBe('dismissed');
    });
});

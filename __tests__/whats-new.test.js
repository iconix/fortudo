/**
 * @jest-environment jsdom
 */

describe("what's new modal", () => {
    beforeEach(() => {
        localStorage.clear();
        jest.resetModules();
    });

    test('does nothing when Activities are disabled', async () => {
        const { maybeShowWhatsNew, WHATS_NEW_KEY } = await import('../public/js/whats-new.js');
        const showAlert = jest.fn();

        await maybeShowWhatsNew({ activitiesEnabled: false, showAlert });

        expect(showAlert).not.toHaveBeenCalled();
        expect(localStorage.getItem(WHATS_NEW_KEY)).toBeNull();
    });

    test('shows announcement when Activities are enabled and key is absent', async () => {
        const { maybeShowWhatsNew } = await import('../public/js/whats-new.js');
        const showAlert = jest.fn();

        await maybeShowWhatsNew({ activitiesEnabled: true, showAlert });

        expect(showAlert).toHaveBeenCalledWith(
            "What's New in Fortudo",
            expect.stringContaining('Activity Logging'),
            'sky'
        );
    });

    test('does not show announcement when already dismissed', async () => {
        const { maybeShowWhatsNew, WHATS_NEW_KEY } = await import('../public/js/whats-new.js');
        const showAlert = jest.fn();
        localStorage.setItem(WHATS_NEW_KEY, 'dismissed');

        await maybeShowWhatsNew({ activitiesEnabled: true, showAlert });

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

        const resultPromise = maybeShowWhatsNew({ activitiesEnabled: true, showAlert });

        expect(localStorage.getItem(WHATS_NEW_KEY)).toBeNull();

        resolveAlert();
        await resultPromise;

        expect(localStorage.getItem(WHATS_NEW_KEY)).toBe('dismissed');
    });
});

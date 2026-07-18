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

        await maybeShowWhatsNew({ announcementEnabled: false, showAlert });

        expect(showAlert).not.toHaveBeenCalled();
        expect(localStorage.getItem(WHATS_NEW_KEY)).toBeNull();
    });

    test('shows the current release announcement when the flag is enabled', async () => {
        const { maybeShowWhatsNew, WHATS_NEW_KEY } = await import('../public/js/whats-new.js');
        const showAlert = jest.fn();

        await maybeShowWhatsNew({ announcementEnabled: true, showAlert });

        const [, message] = showAlert.mock.calls[0];

        expect(WHATS_NEW_KEY).toBe('fortudo-whats-new-v1');
        expect(showAlert).toHaveBeenCalledWith(
            "What's New in Fortudo",
            expect.any(HTMLElement),
            'violet',
            'Got it',
            'wide'
        );
        expect(message.className).not.toContain('max-h-64');
        expect(message.className).toContain('overflow-y-auto');
        expect(message.className).toContain('whats-new-scroll-area');
        expect(message.querySelector('[data-whats-new-intro]')).toBeNull();
        expect(message.textContent).not.toContain("Here's what's new:");
        expect(message.textContent).not.toContain('Here’s what’s new:');
        expect(message.querySelectorAll('[data-whats-new-feature]')).toHaveLength(5);
        expect(
            [...message.querySelectorAll('[data-whats-new-feature-emoji]')].map(
                (emoji) => emoji.textContent
            )
        ).toEqual(['⏱️', '⚡', '🔀', '📲', '✨']);
        expect(
            [...message.querySelectorAll('[data-whats-new-feature-emoji]')].every(
                (emoji) => emoji.getAttribute('aria-hidden') === 'true'
            )
        ).toBe(true);
        expect(
            [...message.querySelectorAll('[data-whats-new-feature]')].every((feature) =>
                feature.className.includes('border-violet-400/40')
            )
        ).toBe(true);
        expect(
            [...message.querySelectorAll('[data-whats-new-feature]')].every((feature) =>
                feature.lastElementChild.className.includes('text-slate-300')
            )
        ).toBe(true);
        expect(message.textContent).toContain('Activity Tracking');
        expect(message.textContent).toContain(
            'Log what you actually do, or use the live timer to capture it automatically.'
        );
        expect(message.textContent).toContain('Reschedule on the Fly');
        expect(message.textContent).toContain(
            'Use Do Now on any scheduled task to move it to the current time and automatically adjust the rest of your day.'
        );
        expect(message.textContent).toContain('My Order');
        expect(message.textContent).toContain(
            'Arrange unscheduled tasks by dragging them or using Move actions. Switch back to Priority anytime.'
        );
        expect(message.textContent).toContain('Install Fortudo');
        expect(message.textContent).toContain(
            'Add Fortudo to your home screen or desktop and use it like an app—even when you’re offline.'
        );
        expect(message.textContent).toContain('A New Look');
        expect(message.textContent).toContain(
            'Fortudo has a new logo and a refreshed design throughout the app.'
        );
        expect(message.textContent).not.toContain('Insights View');
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

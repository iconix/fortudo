/**
 * @jest-environment jsdom
 */

import {
    consumeActivitySmokeFailure,
    queueActivitySmokeFailure
} from '../public/js/activities/smoke-hooks.js';

describe('activity smoke hooks', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('queues and consumes a manual add failure on supported smoke hosts', () => {
        expect(
            queueActivitySmokeFailure('manual-add', 2, {
                storage: window.localStorage,
                hostname: 'fortudo--pr60.web.app'
            })
        ).toBe(true);

        expect(
            consumeActivitySmokeFailure('manual-add', {
                storage: window.localStorage,
                hostname: 'fortudo--pr60.web.app'
            })
        ).toBe(true);
        expect(
            consumeActivitySmokeFailure('manual-add', {
                storage: window.localStorage,
                hostname: 'fortudo--pr60.web.app'
            })
        ).toBe(true);
        expect(
            consumeActivitySmokeFailure('manual-add', {
                storage: window.localStorage,
                hostname: 'fortudo--pr60.web.app'
            })
        ).toBe(false);
    });

    test('does not queue or consume on unsupported hosts', () => {
        expect(
            queueActivitySmokeFailure('auto-log', 1, {
                storage: window.localStorage,
                hostname: 'fortudo.app'
            })
        ).toBe(false);
        expect(
            consumeActivitySmokeFailure('auto-log', {
                storage: window.localStorage,
                hostname: 'fortudo.app'
            })
        ).toBe(false);
    });

    test('ignores malformed stored smoke hook state', () => {
        window.localStorage.setItem('fortudo-smoke-activity-failures', '{not-json');

        expect(
            consumeActivitySmokeFailure('manual-add', {
                storage: window.localStorage,
                hostname: 'localhost'
            })
        ).toBe(false);
    });
});

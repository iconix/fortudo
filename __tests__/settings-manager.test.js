/**
 * @jest-environment jsdom
 */

import { isActivitiesEnabled, setActivitiesEnabled } from '../public/js/settings-manager.js';

describe('settings-manager', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('isActivitiesEnabled returns false by default', () => {
        expect(isActivitiesEnabled()).toBe(false);
    });

    test('setActivitiesEnabled(true) makes isActivitiesEnabled return true', () => {
        setActivitiesEnabled(true);
        expect(isActivitiesEnabled()).toBe(true);
    });

    test('setActivitiesEnabled(false) makes isActivitiesEnabled return false', () => {
        setActivitiesEnabled(true);
        setActivitiesEnabled(false);
        expect(isActivitiesEnabled()).toBe(false);
    });

    test('setting persists across reads via localStorage', () => {
        setActivitiesEnabled(true);
        expect(localStorage.getItem('fortudo-activities-enabled')).toBe('true');
    });

    test('handles corrupted localStorage value gracefully', () => {
        localStorage.setItem('fortudo-activities-enabled', 'not-a-boolean');
        expect(isActivitiesEnabled()).toBe(false);
    });
});

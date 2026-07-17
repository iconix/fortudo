import { showToast } from '../public/js/toast-manager.js';

describe('showToast action support', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test('exposes polite status semantics for assistive technology', () => {
        showToast('New version available', { action: { label: 'Reload', onClick: () => {} } });

        const toast = document.querySelector('[data-toast-container] > div');
        expect(toast.getAttribute('role')).toBe('status');
        expect(toast.getAttribute('aria-live')).toBe('polite');
        expect(toast.getAttribute('aria-atomic')).toBe('true');
    });

    test('renders an action button that fires the handler and dismisses', () => {
        const onClick = jest.fn();
        showToast('New version available', { action: { label: 'Reload', onClick } });

        const button = document.querySelector('[data-toast-container] button');
        expect(button).not.toBeNull();
        expect(button.textContent).toBe('Reload');

        button.click();
        button.click();
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-toast-container] div')).toBeNull();
    });

    test('action toasts do not auto-dismiss', () => {
        jest.useFakeTimers();
        showToast('sticky', { action: { label: 'Go', onClick: () => {} } });
        jest.advanceTimersByTime(10000);
        expect(document.querySelectorAll('[data-toast-container] > div').length).toBe(1);
    });

    test('a dedupe key replaces an existing action toast with the latest handler', () => {
        const firstHandler = jest.fn();
        const latestHandler = jest.fn();

        showToast('New version available', {
            dedupeKey: 'app-update',
            action: { label: 'Reload', onClick: firstHandler }
        });
        showToast('New version available', {
            dedupeKey: 'app-update',
            action: { label: 'Reload', onClick: latestHandler }
        });

        expect(document.querySelectorAll('[data-toast-container] > div')).toHaveLength(1);
        document.querySelector('[data-toast-container] button').click();
        expect(firstHandler).not.toHaveBeenCalled();
        expect(latestHandler).toHaveBeenCalledTimes(1);
    });

    test('clicking the action toast body dismisses without firing the action', () => {
        const onClick = jest.fn();
        showToast('New version available', { action: { label: 'Reload', onClick } });

        document.querySelector('[data-toast-container] > div').click();

        expect(onClick).not.toHaveBeenCalled();
        expect(document.querySelector('[data-toast-container] > div')).toBeNull();
    });

    test('plain toasts still auto-dismiss', () => {
        jest.useFakeTimers();
        showToast('plain');
        jest.advanceTimersByTime(4000);
        expect(document.querySelectorAll('[data-toast-container] > div').length).toBe(0);
    });
});

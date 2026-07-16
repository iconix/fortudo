/**
 * @jest-environment jsdom
 */

import { showToast, getToastContainer } from '../public/js/toast-manager.js';

describe('toast-manager', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        const container = document.querySelector('[data-toast-container]');
        if (container) container.remove();
    });

    test('showToast creates a toast element in the container', () => {
        showToast('Task added successfully');
        const container = getToastContainer();
        expect(container).toBeTruthy();
        expect(container.children.length).toBe(1);
        expect(container.textContent).toContain('Task added successfully');
    });

    test('showToast auto-dismisses after default timeout (3500ms)', () => {
        showToast('Temporary message');
        const container = getToastContainer();
        expect(container.children.length).toBe(1);

        jest.advanceTimersByTime(3499);
        expect(container.children.length).toBe(1);

        jest.advanceTimersByTime(1);
        expect(container.children.length).toBe(0);
    });

    test('showToast accepts custom timeout', () => {
        showToast('Quick message', { duration: 2000 });
        const container = getToastContainer();
        expect(container.children.length).toBe(1);

        jest.advanceTimersByTime(2000);
        expect(container.children.length).toBe(0);
    });

    test('showToast accepts a theme color', () => {
        showToast('Teal message', { theme: 'teal' });
        const toast = getToastContainer().children[0];
        expect(toast.className).toContain('teal');
    });

    test('showToast accepts the sky theme color', () => {
        showToast('Sky message', { theme: 'sky' });
        const toast = getToastContainer().children[0];
        expect(toast.className).toContain('sky');
    });

    test.each([
        ['violet', 'border-violet-400/60', 'text-violet-200'],
        ['teal', 'border-teal-400/60', 'text-teal-200'],
        ['sky', 'border-sky-400/60', 'text-sky-200'],
        ['slate', 'border-slate-500/60', 'text-slate-200'],
        ['default', 'border-slate-500/60', 'text-slate-200']
    ])('%s toasts use a quiet slate surface with semantic framing', (theme, border, text) => {
        showToast('Informational message', { theme });
        const toast = getToastContainer().children[0];

        expect(toast.className).toContain('bg-slate-800/95');
        expect(toast.className).toContain(border);
        expect(toast.className).toContain(text);
        expect(toast.className).not.toContain(`bg-${theme}-900/90`);
    });

    test.each(['amber', 'rose'])('%s toasts retain a denser urgent surface', (theme) => {
        showToast('Urgent message', { theme });
        const toast = getToastContainer().children[0];

        expect(toast.className).toContain(`bg-${theme}-900/90`);
        expect(toast.className).toContain(`border-${theme}-700`);
        expect(toast.className).toContain(`text-${theme}-200`);
    });

    test('toast container uses mobile gutters and returns to top-right alignment on larger screens', () => {
        const container = getToastContainer();

        expect(container.className).toContain('left-4');
        expect(container.className).toContain('right-4');
        expect(container.className).toContain('sm:left-auto');
    });

    test('multiple toasts stack in the container', () => {
        showToast('First');
        showToast('Second');
        showToast('Third');
        const container = getToastContainer();
        expect(container.children.length).toBe(3);
    });

    test('toast container is created lazily on first showToast', () => {
        expect(document.querySelector('[data-toast-container]')).toBeNull();
        showToast('Hello');
        expect(document.querySelector('[data-toast-container]')).toBeTruthy();
    });
});

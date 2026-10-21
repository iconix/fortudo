describe('independent startup fallback', () => {
    let listeners;
    let spy;
    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML =
            '<main id="startup-fallback"><h1 id="startup-title">Loading Fortudo…</h1><p id="startup-message"></p></main>';
        listeners = [];
        const add = window.addEventListener.bind(window);
        spy = jest.spyOn(window, 'addEventListener').mockImplementation((...args) => {
            listeners.push(args);
            add(...args);
        });
        jest.isolateModules(() => require('../public/js/startup-fallback.js'));
    });
    afterEach(() => {
        for (const args of listeners) window.removeEventListener(...args);
        spy.mockRestore();
        jest.clearAllTimers();
        jest.useRealTimers();
    });
    test('reports script fetch failures before the app can run', () => {
        const script = document.createElement('script');
        document.head.append(script);
        script.dispatchEvent(new Event('error'));
        expect(document.getElementById('startup-fallback').dataset.visible).toBe('true');
        expect(document.getElementById('startup-title').textContent).toBe('Fortudo couldn’t load');
        expect(document.getElementById('startup-message').textContent).toMatch(
            /Some app files couldn’t load\. Reload to try again\./
        );
        jest.advanceTimersByTime(15000);
        expect(document.getElementById('startup-title').textContent).toBe('Fortudo couldn’t load');
        script.remove();
    });
    test('retains errors that happen before fallback markup is parsed', () => {
        document.body.replaceChildren();
        window.dispatchEvent(new ErrorEvent('error', { message: 'Module evaluation failed' }));
        document.body.innerHTML =
            '<main id="startup-fallback"><h1 id="startup-title"></h1><p id="startup-message"></p></main>';
        window.dispatchEvent(new Event('DOMContentLoaded'));
        expect(document.getElementById('startup-title').textContent).toBe('Fortudo couldn’t load');
    });
    test('ignores non-script resource errors and explains a stalled load', () => {
        const image = document.createElement('img');
        document.body.append(image);
        image.dispatchEvent(new Event('error'));
        expect(document.getElementById('startup-title').textContent).toBe('Loading Fortudo…');
        jest.advanceTimersByTime(15000);
        expect(document.getElementById('startup-title').textContent).toBe(
            'Fortudo is taking longer to load'
        );
    });
    test('handles failed dynamic imports but never resurfaces after the app is visible', () => {
        window.dispatchEvent(new Event('unhandledrejection'));
        expect(document.getElementById('startup-title').textContent).toBe('Fortudo couldn’t load');
        document.getElementById('startup-fallback').remove();
        window.dispatchEvent(new Event('unhandledrejection'));
        jest.runAllTimers();
        expect(document.getElementById('startup-fallback')).toBeNull();
    });
});

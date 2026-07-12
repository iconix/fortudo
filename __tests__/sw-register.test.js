import { registerServiceWorker } from '../public/js/sw-register.js';

describe('registerServiceWorker', () => {
    afterEach(() => {
        delete navigator.serviceWorker;
        jest.restoreAllMocks();
    });

    test('no-ops when serviceWorker is unsupported', () => {
        expect(() => registerServiceWorker()).not.toThrow();
    });

    test('surfaces a waiting worker and activates it on demand', async () => {
        const waiting = { postMessage: jest.fn() };
        const registration = { waiting, installing: null, addEventListener: jest.fn() };
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                register: jest.fn().mockResolvedValue(registration),
                addEventListener: jest.fn(),
                controller: {}
            }
        });

        const onUpdateAvailable = jest.fn();
        registerServiceWorker({ onUpdateAvailable });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
        const activate = onUpdateAvailable.mock.calls[0][0];
        activate();
        expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    test('does not reload when an initially uncontrolled page gains a controller', () => {
        const listeners = {};
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                register: jest.fn().mockResolvedValue({
                    waiting: null,
                    installing: null,
                    addEventListener: jest.fn()
                }),
                addEventListener: jest.fn((event, handler) => {
                    listeners[event] = handler;
                }),
                controller: null
            }
        });
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        registerServiceWorker();
        navigator.serviceWorker.controller = {};
        listeners.controllerchange();

        expect(consoleError).not.toHaveBeenCalled();
    });

    test('reloads a later update after an initially uncontrolled page gains a controller', async () => {
        const listeners = {};
        const waiting = { postMessage: jest.fn() };
        const registration = { waiting, installing: null, addEventListener: jest.fn() };
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                register: jest.fn().mockResolvedValue(registration),
                addEventListener: jest.fn((event, handler) => {
                    listeners[event] = handler;
                }),
                controller: null
            }
        });
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        const onUpdateAvailable = jest.fn();

        registerServiceWorker({ onUpdateAvailable });
        navigator.serviceWorker.controller = {};
        listeners.controllerchange();
        expect(consoleError).not.toHaveBeenCalled();

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
        onUpdateAvailable.mock.calls[0][0]();
        listeners.controllerchange();
        listeners.controllerchange();

        expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(consoleError).toHaveBeenCalledTimes(1);
    });

    test('reloads exactly once when an already controlled page changes controller', () => {
        const listeners = {};
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                register: jest.fn().mockResolvedValue({
                    waiting: null,
                    installing: null,
                    addEventListener: jest.fn()
                }),
                addEventListener: jest.fn((event, handler) => {
                    listeners[event] = handler;
                }),
                controller: {}
            }
        });
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        registerServiceWorker();
        listeners.controllerchange();
        listeners.controllerchange();

        expect(consoleError).toHaveBeenCalledTimes(1);
    });

    test('handles service worker registration rejection', async () => {
        const onUpdateAvailable = jest.fn();
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                register: jest.fn().mockRejectedValue(new Error('registration failed')),
                addEventListener: jest.fn(),
                controller: null
            }
        });

        registerServiceWorker({ onUpdateAvailable });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(onUpdateAvailable).not.toHaveBeenCalled();
    });
});

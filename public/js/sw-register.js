/**
 * Register the service worker and surface update availability.
 * @param {Object} [callbacks]
 * @param {(activate: () => void) => void} [callbacks.onUpdateAvailable] -
 *   Called when a new version is installed and waiting. Invoking `activate`
 *   tells the waiting worker to take over; the page reloads on controllerchange.
 */
export function registerServiceWorker(callbacks = {}) {
    if (!('serviceWorker' in navigator)) return;

    let hasBeenControlled = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        if (!hasBeenControlled) {
            hasBeenControlled = Boolean(navigator.serviceWorker.controller);
            return;
        }
        reloading = true;
        window.location.reload();
    });

    // updateViaCache:'none' keeps update checks for importScripts'd files
    // (sw-precache.js) out of the HTTP cache — belt and braces alongside the
    // no-cache header and the version stamp in sw.js itself.
    navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
            const notifyIfWaiting = (worker) => {
                if (!worker || !callbacks.onUpdateAvailable) return;
                callbacks.onUpdateAvailable(() => worker.postMessage({ type: 'SKIP_WAITING' }));
            };
            const watchInstalling = (worker) => {
                if (!worker) return;
                if (worker.state === 'installed') {
                    if (navigator.serviceWorker.controller) notifyIfWaiting(worker);
                    return;
                }
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        notifyIfWaiting(worker);
                    }
                });
            };
            if (registration.waiting && navigator.serviceWorker.controller) {
                notifyIfWaiting(registration.waiting);
            }
            watchInstalling(registration.installing);
            registration.addEventListener('updatefound', () => {
                watchInstalling(registration.installing);
            });
        })
        .catch(() => {});
}

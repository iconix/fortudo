let container = null;

const THEME_CLASSES = {
    teal: 'bg-teal-900/90 border-teal-700 text-teal-200',
    indigo: 'bg-indigo-900/90 border-indigo-700 text-indigo-200',
    sky: 'bg-sky-900/90 border-sky-700 text-sky-200',
    amber: 'bg-amber-900/90 border-amber-700 text-amber-200',
    rose: 'bg-rose-900/90 border-rose-700 text-rose-200',
    default: 'bg-slate-800/90 border-slate-600 text-slate-200'
};

const DEFAULT_DURATION = 3500;

/**
 * Get or create the toast container element.
 * @returns {HTMLElement}
 */
export function getToastContainer() {
    if (!container || !document.body.contains(container)) {
        container = document.createElement('div');
        container.setAttribute('data-toast-container', '');
        container.className =
            'fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm';
        document.body.appendChild(container);
    }

    return container;
}

/**
 * Show a non-blocking toast notification.
 * @param {string} message - The message to display
 * @param {Object} [options]
 * @param {number} [options.duration=3500] - Auto-dismiss after this many ms
 * @param {string} [options.theme='default'] - Color theme: teal, indigo, amber, rose, default
 */
export function showToast(message, options = {}) {
    const { duration = DEFAULT_DURATION, theme = 'default' } = options;
    const toastContainer = getToastContainer();
    const toast = document.createElement('div');
    const themeClasses = THEME_CLASSES[theme] || THEME_CLASSES.default;

    toast.className = `${themeClasses} px-4 py-2 rounded-lg border text-sm shadow-lg pointer-events-auto transition-opacity duration-300`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, duration);
}

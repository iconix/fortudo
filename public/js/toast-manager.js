let container = null;

// Non-urgent themes share a neutral overlay; urgency stays encoded by semantic framing.
const QUIET_TOAST_SURFACE = 'bg-slate-800/95';
const THEME_CLASSES = {
    teal: `${QUIET_TOAST_SURFACE} border-teal-400/60 text-teal-200`,
    indigo: `${QUIET_TOAST_SURFACE} border-indigo-400/60 text-indigo-200`,
    slate: `${QUIET_TOAST_SURFACE} border-slate-500/60 text-slate-200`,
    violet: `${QUIET_TOAST_SURFACE} border-violet-400/60 text-violet-200`,
    sky: `${QUIET_TOAST_SURFACE} border-sky-400/60 text-sky-200`,
    amber: 'bg-amber-900/90 border-amber-700 text-amber-200',
    rose: 'bg-rose-900/90 border-rose-700 text-rose-200',
    default: `${QUIET_TOAST_SURFACE} border-slate-500/60 text-slate-200`
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
            'fixed top-4 left-4 right-4 sm:left-auto sm:max-w-sm z-50 flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    return container;
}

/**
 * Show a non-blocking toast notification.
 * @param {string} message - The message to display
 * @param {Object} [options]
 * @param {number} [options.duration=3500] - Auto-dismiss after this many ms (ignored when action is set)
 * @param {string} [options.theme='default'] - Color theme: violet, slate, teal, sky, amber, rose, default
 * @param {string|null} [options.dedupeKey=null] - Replaces an existing toast with the same key
 * @param {{label: string, onClick: Function}} [options.action] - Renders a button; toast stays until clicked
 */
export function showToast(message, options = {}) {
    const {
        duration = DEFAULT_DURATION,
        theme = 'default',
        dedupeKey = null,
        action = null
    } = options;
    const toastContainer = getToastContainer();

    if (dedupeKey) {
        Array.from(toastContainer.children)
            .find((element) => element.dataset.toastKey === dedupeKey)
            ?.remove();
    }

    const toast = document.createElement('div');
    const themeClasses = THEME_CLASSES[theme] || THEME_CLASSES.default;

    if (dedupeKey) {
        toast.dataset.toastKey = dedupeKey;
    }
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.className = `${themeClasses} px-4 py-2 rounded-lg border text-sm shadow-lg backdrop-blur-sm pointer-events-auto transition-opacity duration-300`;
    if (action) {
        const text = document.createElement('span');
        text.textContent = message;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = action.label;
        button.className = 'ml-3 underline font-semibold';
        button.addEventListener(
            'click',
            (event) => {
                event.stopPropagation();
                action.onClick();
                toast.remove();
            },
            { once: true }
        );
        toast.addEventListener('click', () => toast.remove());
        toast.append(text, button);
    } else {
        toast.textContent = message;
        setTimeout(() => {
            toast.remove();
        }, duration);
    }

    toastContainer.appendChild(toast);
}

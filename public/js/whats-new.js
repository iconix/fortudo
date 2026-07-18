import { showCustomAlert } from './modal-manager.js';

export const WHATS_NEW_KEY = 'fortudo-whats-new-v1';

const WHATS_NEW_TITLE = "What's New in Fortudo";
const WHATS_NEW_FEATURES = [
    {
        title: 'Activity Tracking',
        body: 'Log what you actually do, or use the live timer to capture it automatically.'
    },
    {
        title: 'Reschedule on the Fly',
        body: 'Use Do Now on any scheduled task to move it to the current time and automatically adjust the rest of your day.'
    },
    {
        title: 'My Order',
        body: 'Arrange unscheduled tasks by dragging them or using Move actions. Switch back to Priority anytime.'
    },
    {
        title: 'Install Fortudo',
        body: 'Add Fortudo to your home screen or desktop and use it like an app—even when you’re offline.'
    },
    {
        title: 'A New Look',
        body: 'Fortudo has a new logo and a refreshed design throughout the app.'
    }
];

function createWhatsNewMessage() {
    const container = document.createElement('div');
    container.className = 'whats-new-scroll-area overflow-y-auto pr-1';

    const list = document.createElement('ul');
    list.className = 'space-y-3';

    WHATS_NEW_FEATURES.forEach((feature) => {
        const item = document.createElement('li');
        item.dataset.whatsNewFeature = 'true';
        item.className =
            'rounded-lg border border-violet-400/40 bg-slate-900/40 px-3 py-2.5 text-sm';

        const title = document.createElement('div');
        title.className = 'font-semibold text-slate-100';
        title.textContent = feature.title;

        const body = document.createElement('div');
        body.className = 'mt-1 leading-5 text-slate-300';
        body.textContent = feature.body;

        item.append(title, body);
        list.appendChild(item);
    });

    container.appendChild(list);
    return container;
}

/**
 * Shows the one-time release announcement for this browser.
 * @param {{ announcementEnabled?: boolean, showAlert?: Function }} [options]
 */
export async function maybeShowWhatsNew({
    announcementEnabled = false,
    showAlert = showCustomAlert
} = {}) {
    if (!announcementEnabled) {
        return;
    }

    if (typeof localStorage !== 'undefined' && localStorage.getItem(WHATS_NEW_KEY)) {
        return;
    }

    await Promise.resolve(
        showAlert(WHATS_NEW_TITLE, createWhatsNewMessage(), 'violet', 'Got it', 'wide')
    );

    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(WHATS_NEW_KEY, 'dismissed');
    }
}

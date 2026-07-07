import { showCustomAlert } from './modal-manager.js';

export const WHATS_NEW_KEY = 'fortudo-whats-new-activities-v1';

const WHATS_NEW_TITLE = "What's New in Fortudo";
const WHATS_NEW_FEATURES = [
    {
        title: 'Activity Logging',
        body: 'Track what you actually do alongside your plan.'
    },
    {
        title: 'Live Timer',
        body: 'Start and stop capture with automatic activity logging.'
    },
    {
        title: 'Insights View',
        body: 'Compare plan vs actual with timelines and trend day cards.'
    }
];

function createWhatsNewMessage() {
    const container = document.createElement('div');
    container.className = 'space-y-4';

    const intro = document.createElement('p');
    intro.dataset.whatsNewIntro = 'true';
    intro.className = 'text-sm leading-6 text-slate-300';
    intro.textContent = 'Activities are ready to try. Here is what changed:';
    container.appendChild(intro);

    const list = document.createElement('ul');
    list.className = 'space-y-3';

    WHATS_NEW_FEATURES.forEach((feature) => {
        const item = document.createElement('li');
        item.dataset.whatsNewFeature = 'true';
        item.className = 'rounded-lg border border-sky-400/20 bg-slate-900/40 px-3 py-2.5 text-sm';

        const title = document.createElement('div');
        title.className = 'font-semibold text-slate-100';
        title.textContent = feature.title;

        const body = document.createElement('div');
        body.className = 'mt-1 leading-5 text-slate-400';
        body.textContent = feature.body;

        item.append(title, body);
        list.appendChild(item);
    });

    container.appendChild(list);
    return container;
}

/**
 * Shows the one-time Activities announcement for this browser.
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

    await Promise.resolve(showAlert(WHATS_NEW_TITLE, createWhatsNewMessage(), 'sky'));

    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(WHATS_NEW_KEY, 'dismissed');
    }
}

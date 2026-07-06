import { showCustomAlert } from './modal-manager.js';

export const WHATS_NEW_KEY = 'fortudo-whats-new-activities-v1';

const WHATS_NEW_TITLE = "What's New in Fortudo";
const WHATS_NEW_MESSAGE = [
    'Activity Logging - Track what you actually do alongside your plan.',
    'Live Timer - Start/stop capture with automatic activity logging.',
    'Insights View - Plan vs actual timeline with trend day cards.'
].join('\n\n');

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

    await Promise.resolve(showAlert(WHATS_NEW_TITLE, WHATS_NEW_MESSAGE, 'sky'));

    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(WHATS_NEW_KEY, 'dismissed');
    }
}

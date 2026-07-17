import { isActivitiesEnabled, setActivitiesEnabled } from './settings-manager.js';
import {
    bindTaxonomySettingsEvents,
    renderTaxonomyManagementContent,
    resetTaxonomySettingsViewState
} from './settings/taxonomy-settings.js';
import { showToast } from './toast-manager.js';

const OPEN_SETTINGS_AFTER_ACTIVITIES_RELOAD_KEY = 'fortudo-open-settings-after-activities-reload';

/**
 * Get the settings modal element.
 * @returns {HTMLElement|null}
 */
export function getSettingsModalElement() {
    return document.getElementById('settings-modal');
}

/**
 * Open the settings modal.
 */
export function openSettingsModal() {
    const modal = getSettingsModalElement();
    if (modal) {
        modal.classList.remove('hidden');
    }
}

/**
 * Close the settings modal.
 */
export function closeSettingsModal() {
    const modal = getSettingsModalElement();
    if (modal) {
        modal.classList.add('hidden');
    }
    resetTaxonomySettingsViewState();
}

/**
 * Render the settings panel content.
 * @param {{ onTaxonomyChanged?: Function }} [options]
 */
export function renderSettingsContent(options = {}) {
    const container = document.getElementById('settings-content');
    if (!container) {
        return;
    }

    container.classList.add('settings-scroll-area');

    const enabled = isActivitiesEnabled();
    container.innerHTML = `
        <div class="space-y-4">
            <section data-settings-domain="activity-tracking" class="flex items-center justify-between">
                <div data-activities-setting-copy class="min-w-0 text-left">
                    <label for="activities-toggle" class="text-base font-medium text-slate-200">Activity tracking</label>
                    <p class="text-xs text-slate-400 mt-0.5">Track time spent and view insights</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="activities-toggle" class="sr-only peer" ${enabled ? 'checked' : ''} />
                    <div class="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-sky-300/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                </label>
            </section>

            <div id="reload-prompt" class="settings-reload-prompt hidden bg-slate-700/50 border border-slate-600 rounded-lg p-3 text-sm">
                <p class="text-slate-300 mb-2" id="reload-prompt-message"></p>
                <button id="reload-apply-btn" type="button" class="bg-violet-500/30 border border-violet-400/60 text-violet-200 hover:bg-violet-500/40 px-4 py-1.5 rounded-lg text-sm transition-colors">
                    Reload to Apply
                </button>
            </div>

            <section id="taxonomy-management-section" data-settings-domain="organization" class="space-y-5 border-t border-slate-700/80 pt-4 ${enabled ? '' : 'hidden'}">
                <div class="text-left">
                    <h4 class="text-base font-medium text-slate-200">Organization</h4>
                    <p class="text-xs text-slate-400">Groups and categories shared by tasks and activities.</p>
                </div>
                ${renderTaxonomyManagementContent()}
            </section>
        </div>
    `;

    wireSettingsEvents(options);
}

export function openSettingsAfterActivitiesReloadIfNeeded() {
    if (sessionStorage.getItem(OPEN_SETTINGS_AFTER_ACTIVITIES_RELOAD_KEY) !== 'true') {
        return;
    }

    sessionStorage.removeItem(OPEN_SETTINGS_AFTER_ACTIVITIES_RELOAD_KEY);
}

function wireSettingsEvents(options) {
    const toggle = document.getElementById('activities-toggle');
    if (toggle) {
        toggle.onchange = async () => {
            const newValue = toggle.checked;
            const previousValue = !newValue;

            try {
                await setActivitiesEnabled(newValue);
            } catch (error) {
                toggle.checked = previousValue;
                showToast('Could not update Activities setting', { theme: 'rose' });
                return;
            }

            const reloadPrompt = document.getElementById('reload-prompt');
            const message = document.getElementById('reload-prompt-message');
            const taxonomySection = document.getElementById('taxonomy-management-section');

            if (reloadPrompt) {
                reloadPrompt.classList.remove('hidden');
                reloadPrompt.classList.add('settings-reload-prompt--visible');
            }
            if (message) {
                message.textContent = newValue
                    ? 'Activities enabled. Category tracking, insights, and taxonomy controls will be available after reload.'
                    : 'Activities disabled. Category and activity features will be hidden after reload.';
            }
            if (taxonomySection) {
                taxonomySection.classList.add('hidden');
            }
        };
    }

    const reloadButton = document.getElementById('reload-apply-btn');
    if (reloadButton) {
        reloadButton.onclick = () => {
            sessionStorage.removeItem(OPEN_SETTINGS_AFTER_ACTIVITIES_RELOAD_KEY);
            (options.reloadWindow || (() => window.location.reload()))();
        };
    }

    const closeButton = document.getElementById('close-settings-modal');
    if (closeButton) {
        closeButton.onclick = closeSettingsModal;
    }

    bindTaxonomySettingsEvents(options);
}

/**
 * Initialize modal listeners shared across app boot.
 * @param {Function} [onOpen]
 */
export function initializeSettingsModalListeners(onOpen) {
    const gearButton = document.getElementById('settings-gear-btn');
    if (gearButton) {
        gearButton.addEventListener('click', () => {
            resetTaxonomySettingsViewState();
            if (onOpen) {
                onOpen();
            }
            openSettingsModal();
        });
    }

    const modal = getSettingsModalElement();
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeSettingsModal();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const activeModal = getSettingsModalElement();
            if (activeModal && !activeModal.classList.contains('hidden')) {
                closeSettingsModal();
            }
        }
    });
}

import { isActivitiesEnabled, setActivitiesEnabled } from './settings-manager.js';
import {
    bindTaxonomySettingsEvents,
    renderTaxonomyManagementContent,
    resetTaxonomySettingsViewState
} from './settings/taxonomy-settings.js';

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
        <div class="space-y-6">
            <div class="flex items-center justify-between">
                <div>
                    <label for="activities-toggle" class="text-slate-200 font-medium">Enable Activities</label>
                    <p class="text-xs text-slate-400 mt-0.5">Track time spent and view insights</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="activities-toggle" class="sr-only peer" ${enabled ? 'checked' : ''} />
                    <div class="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                </label>
            </div>

            <div id="reload-prompt" class="hidden bg-slate-700/50 border border-slate-600 rounded-lg p-3 text-sm">
                <p class="text-slate-300 mb-2" id="reload-prompt-message"></p>
                <button id="reload-apply-btn" type="button" class="bg-teal-500 hover:bg-teal-400 text-white px-4 py-1.5 rounded-lg text-sm transition-colors">
                    Reload to Apply
                </button>
            </div>

            <div id="taxonomy-management-section" class="space-y-6 ${enabled ? '' : 'hidden'}">
                ${renderTaxonomyManagementContent()}
            </div>
        </div>
    `;

    wireSettingsEvents(options);
}

function wireSettingsEvents(options) {
    const toggle = document.getElementById('activities-toggle');
    if (toggle) {
        toggle.onchange = async () => {
            const newValue = toggle.checked;
            await setActivitiesEnabled(newValue);

            const reloadPrompt = document.getElementById('reload-prompt');
            const message = document.getElementById('reload-prompt-message');
            const taxonomySection = document.getElementById('taxonomy-management-section');

            if (reloadPrompt) {
                reloadPrompt.classList.remove('hidden');
            }
            if (message) {
                message.textContent = newValue
                    ? 'Activities enabled. Category tracking and insights will be available after reload.'
                    : 'Activities disabled. Category and activity features will be hidden after reload.';
            }
            if (taxonomySection) {
                taxonomySection.classList.toggle('hidden', !newValue);
            }
        };
    }

    const reloadButton = document.getElementById('reload-apply-btn');
    if (reloadButton) {
        reloadButton.onclick = () => {
            window.location.reload();
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

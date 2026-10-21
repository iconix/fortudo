import { showToast } from './toast-manager.js';

/**
 * Build the sticky recovery and update actions used by the app orchestrator.
 * Recovery opens a separate guided flow; update activation remains explicit.
 * @param {Object} [dependencies]
 * @returns {{handleRecoveryRequired: () => Promise<void>, handleContractUpdateRequired: () => void}}
 */
export function createContractSafetyActions({
    toast = showToast,
    openRecovery,
    getRegistration = () => navigator.serviceWorker?.getRegistration?.(),
    reload = () => window.location.reload()
} = {}) {
    async function handleRecoveryRequired() {
        toast(
            'Editing is paused to protect your local changes. Recover them with a saved copy and a fresh cloud download.',
            {
                theme: 'rose',
                dedupeKey: 'local-recovery-required',
                action: { label: 'Recover changes', onClick: openRecovery }
            }
        );
    }

    function handleContractUpdateRequired() {
        toast('Update Fortudo to edit this room. Your task draft is kept in this tab.', {
            theme: 'violet',
            dedupeKey: 'app-update',
            action: {
                label: 'Reload',
                onClick: async () => {
                    try {
                        const registration = await getRegistration();
                        if (registration?.waiting) {
                            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                        } else {
                            reload();
                        }
                    } catch (error) {
                        reload();
                    }
                }
            }
        });
    }

    return { handleRecoveryRequired, handleContractUpdateRequired };
}

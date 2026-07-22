import { exportLocalRecoveryBundle, resetLocalReplicaAfterRecovery } from './storage.js';
import { showToast } from './toast-manager.js';
import { logger } from './utils.js';

/**
 * Build the sticky recovery and update actions used by the app orchestrator.
 * Dependencies are injectable so the destructive confirmation sequence stays testable.
 * @param {Object} [dependencies]
 * @returns {{handleRecoveryRequired: () => Promise<void>, handleContractUpdateRequired: () => void}}
 */
export function createContractSafetyActions({
    toast = showToast,
    exportRecovery = exportLocalRecoveryBundle,
    resetReplica = resetLocalReplicaAfterRecovery,
    log = logger,
    promptForReset = (message) => window.prompt(message),
    getRegistration = () => navigator.serviceWorker?.getRegistration?.(),
    reload = () => window.location.reload()
} = {}) {
    async function handleRecoveryRequired() {
        toast('Local changes need recovery before sync can continue', {
            theme: 'rose',
            dedupeKey: 'local-recovery-required',
            action: {
                label: 'Download recovery',
                onClick: async () => {
                    try {
                        const result = await exportRecovery();
                        toast(`Recovery bundle downloaded (${result.leafCount} leaves)`, {
                            theme: 'violet',
                            dedupeKey: 'local-recovery-reset',
                            action: {
                                label: 'Reset local copy',
                                onClick: async () => {
                                    const confirmation = promptForReset(
                                        'Type RESET LOCAL DATA to replace this local copy with the remote state.'
                                    );
                                    if (confirmation === null) return;
                                    try {
                                        await resetReplica(confirmation);
                                    } catch (error) {
                                        toast(error.message || 'Local reset was blocked', {
                                            theme: 'rose'
                                        });
                                    }
                                }
                            }
                        });
                    } catch (error) {
                        log.error('Local recovery export failed.');
                        toast('Could not create the local recovery bundle', { theme: 'rose' });
                    }
                }
            }
        });
    }

    function handleContractUpdateRequired() {
        toast('This room requires a newer Fortudo version', {
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

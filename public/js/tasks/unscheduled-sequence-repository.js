import { loadConfigWithConflicts, putConfig, resolveConfigConflicts } from '../storage.js';
import { UNSCHEDULED_SEQUENCE_CONFIG_ID } from './unscheduled-sequence.js';

/**
 * Load the room-level Unscheduled sequence, resolving replicated conflict leaves first.
 * @returns {Promise<Object|null>} Conflict-free sequence document, or null before migration
 */
export async function loadUnscheduledSequenceDocument() {
    const { config, conflictRevisions } = await loadConfigWithConflicts(
        UNSCHEDULED_SEQUENCE_CONFIG_ID
    );
    if (conflictRevisions.length === 0) {
        return config;
    }
    return resolveConfigConflicts(UNSCHEDULED_SEQUENCE_CONFIG_ID);
}

/**
 * Persist one room-level Unscheduled sequence document.
 * @param {Object} sequenceDocument - Ordered task identifier document
 */
export async function persistUnscheduledSequenceDocument(sequenceDocument) {
    await putConfig(sequenceDocument);
}

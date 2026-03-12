import { logger } from './utils.js';

/** @type {Object|null} PouchDB database instance */
let localDb = null;

/** @type {string|null} Remote CouchDB URL */
let remoteUrl = null;

/** @type {string} Current sync status: 'idle' | 'syncing' | 'synced' | 'error' | 'unsynced' */
let syncStatus = 'idle';

/** @type {Set<Function>} Registered status change callbacks */
const statusCallbacks = new Set();

/** @type {number|null} Debounce timer ID */
let debounceTimer = null;

const DEBOUNCE_MS = 2000;

/**
 * Update sync status and notify all listeners.
 * @param {string} newStatus
 */
function setStatus(newStatus) {
    syncStatus = newStatus;
    for (const cb of statusCallbacks) {
        try {
            cb(newStatus);
        } catch (err) {
            logger.error('Sync status callback error:', err);
        }
    }
}

/**
 * Initialize sync manager with a local PouchDB instance and optional remote URL.
 * @param {Object} db - Local PouchDB instance
 * @param {string|null} remote - Remote CouchDB URL (null to disable sync)
 */
export function initSync(db, remote) {
    localDb = db;
    remoteUrl = remote;
    syncStatus = 'idle';
}

/**
 * Trigger a one-time bidirectional sync with the remote.
 */
export async function triggerSync() {
    if (!localDb || !remoteUrl) return;

    setStatus('syncing');
    try {
        await localDb.replicate.to(remoteUrl);
        await localDb.replicate.from(remoteUrl);
        setStatus('synced');
    } catch (err) {
        logger.error('Sync error:', err);
        setStatus('error');
    }
}

/**
 * Debounced sync - call this after writes to batch rapid changes.
 */
export function debouncedSync() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    setStatus('unsynced');
    debounceTimer = setTimeout(() => {
        triggerSync();
    }, DEBOUNCE_MS);
}

/**
 * Register a callback for sync status changes.
 * @param {Function} callback - Called with new status string
 * @returns {Function} Unsubscribe function
 */
export function onSyncStatusChange(callback) {
    statusCallbacks.add(callback);
    return () => statusCallbacks.delete(callback);
}

/**
 * Get current sync status.
 * @returns {string}
 */
export function getSyncStatus() {
    return syncStatus;
}

/**
 * Tear down sync manager. Clears timers and state.
 */
export function teardownSync() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    localDb = null;
    remoteUrl = null;
    syncStatus = 'idle';
    statusCallbacks.clear();
}

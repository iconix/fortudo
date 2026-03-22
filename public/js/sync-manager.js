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
const RESUME_SYNC_COOLDOWN_MS = 15000;

/** @type {boolean} */
let syncInFlight = false;

/** @type {number} */
let lastSyncStartedAt = 0;

/** @type {Promise<void>|null} */
let inFlightSyncPromise = null;

/** @type {number} */
let syncSessionId = 0;

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
    syncSessionId += 1;
    localDb = db;
    remoteUrl = remote;
    syncStatus = 'idle';
    syncInFlight = false;
    lastSyncStartedAt = 0;
    inFlightSyncPromise = null;
}

/**
 * Trigger a one-time bidirectional sync with the remote.
 */
export async function triggerSync({ respectCooldown = false } = {}) {
    if (!localDb || !remoteUrl) return;
    if (syncInFlight) return inFlightSyncPromise;

    const now = Date.now();
    if (respectCooldown && now - lastSyncStartedAt < RESUME_SYNC_COOLDOWN_MS) {
        return;
    }

    const currentDb = localDb;
    const currentRemoteUrl = remoteUrl;
    const currentSessionId = syncSessionId;

    syncInFlight = true;
    lastSyncStartedAt = now;
    setStatus('syncing');
    inFlightSyncPromise = (async () => {
        try {
            await currentDb.replicate.to(currentRemoteUrl);
            await currentDb.replicate.from(currentRemoteUrl);
            if (currentSessionId === syncSessionId) {
                setStatus('synced');
            }
        } catch (err) {
            if (currentSessionId === syncSessionId) {
                logger.error('Sync error:', err);
                setStatus('error');
            }
        } finally {
            if (currentSessionId === syncSessionId) {
                syncInFlight = false;
                inFlightSyncPromise = null;
            }
        }
    })();

    return inFlightSyncPromise;
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
 * Wait for the current in-flight sync, if any, to settle.
 */
export async function waitForIdleSync() {
    if (!inFlightSyncPromise) {
        return;
    }

    try {
        await inFlightSyncPromise;
    } catch (err) {
        // teardown/switch callers only need sync activity to settle
    }
}

/**
 * Tear down sync manager. Clears timers and state.
 */
export function teardownSync() {
    syncSessionId += 1;
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    localDb = null;
    remoteUrl = null;
    syncStatus = 'idle';
    syncInFlight = false;
    lastSyncStartedAt = 0;
    inFlightSyncPromise = null;
    statusCallbacks.clear();
}

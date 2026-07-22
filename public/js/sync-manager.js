import { auditLocalDivergence, inspectRemoteDocumentContract } from './sync-contract.js';
import { logger } from './utils.js';

let localDb = null;
let remoteUrl = null;
let remoteDatabase = null;
let syncStatus = 'idle';
let debounceTimer = null;
let syncInFlight = false;
let lastSyncStartedAt = 0;
let inFlightSyncPromise = null;
let retryAfterInFlightFailureRequested = false;
let reconnectRetrySessionId = null;
let syncSessionId = 0;
let preflightPromise = null;
let remoteContract = null;
let lastAudit = null;
let auditGeneration = 0;
let auditedGeneration = null;
let localChangesObserver = null;
let controlledPullSessionId = null;

const statusCallbacks = new Set();
const dataChangeCallbacks = new Set();
const expectedLocalRevisions = new Set();
const rejectedLocalRevisions = new Set();

const DEBOUNCE_MS = 2000;
const RESUME_SYNC_COOLDOWN_MS = 15000;
const WRITE_BLOCKING_STATUSES = new Set([
    'update-required',
    'update-required-available',
    'validator-mismatch',
    'recovery-required',
    'audit-error'
]);

function setStatus(newStatus) {
    syncStatus = newStatus;
    for (const callback of statusCallbacks) {
        try {
            callback(newStatus);
        } catch (error) {
            logger.error('Sync status callback failed.');
        }
    }
}

function notifyDataChange() {
    for (const callback of dataChangeCallbacks) {
        try {
            callback();
        } catch (error) {
            logger.error('Sync data change callback failed.');
        }
    }
}

function createRemoteDatabase(remote) {
    if (!remote || typeof window === 'undefined' || typeof window.PouchDB !== 'function') {
        return null;
    }
    try {
        // skip_setup prevents a browser from provisioning a missing production database.
        return new window.PouchDB(remote, { skip_setup: true });
    } catch (error) {
        return null;
    }
}

function sameContract(first, second) {
    return (
        first?.state === second?.state &&
        first?.compatible === second?.compatible &&
        first?.contractRevision === second?.contractRevision
    );
}

async function requestServiceWorkerUpdate() {
    if (!navigator?.serviceWorker?.getRegistration) {
        return false;
    }
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update?.();
        return Boolean(registration?.waiting);
    } catch (error) {
        return false;
    }
}

function applyAuditStatus(audit, contract) {
    if (audit.state === 'compatible') {
        setStatus(contract.state === 'missing-validator' ? 'missing-validator' : 'compatible');
    } else {
        setStatus(audit.state);
    }
}

async function performDivergenceAudit(currentSessionId) {
    const audit = await auditLocalDivergence(localDb, remoteDatabase, {
        rejectedLeaves: rejectedLocalRevisions
    });
    if (currentSessionId !== syncSessionId) {
        return false;
    }
    lastAudit = audit;
    if (audit.state === 'compatible') {
        auditedGeneration = auditGeneration;
    } else {
        auditedGeneration = null;
    }
    applyAuditStatus(audit, remoteContract);
    return audit.state === 'compatible';
}

async function performFullPreflight(currentSessionId = syncSessionId) {
    if (!localDb || !remoteDatabase) {
        return true;
    }
    const inspection = await inspectRemoteDocumentContract(remoteDatabase);
    if (currentSessionId !== syncSessionId) {
        return false;
    }
    remoteContract = inspection;
    if (!inspection.compatible) {
        auditedGeneration = null;
        lastAudit = null;
        if (inspection.state === 'update-required') {
            const available = await requestServiceWorkerUpdate();
            if (currentSessionId !== syncSessionId) return false;
            setStatus(available ? 'update-required-available' : 'update-required');
        } else {
            setStatus(inspection.state);
        }
        return false;
    }
    return performDivergenceAudit(currentSessionId);
}

function observeLocalChanges() {
    if (!localDb?.changes || !remoteDatabase) {
        return;
    }
    const observerSessionId = syncSessionId;
    localChangesObserver = localDb.changes({
        since: 'now',
        live: true,
        style: 'all_docs',
        include_docs: true
    });
    localChangesObserver.on?.('change', (change) => {
        const revisions = Array.isArray(change?.changes) ? change.changes : [];
        let expected = revisions.length > 0;
        for (const item of revisions) {
            const identity = `${change.id}@${item?.rev}`;
            if (
                controlledPullSessionId === observerSessionId ||
                expectedLocalRevisions.delete(identity)
            ) {
                continue;
            }
            expected = false;
        }
        if (expected || controlledPullSessionId === observerSessionId) {
            auditGeneration += 1;
            if (auditedGeneration !== null) auditedGeneration = auditGeneration;
        } else {
            invalidateSyncAudit();
        }
    });
    localChangesObserver.on?.('error', () => invalidateSyncAudit());
}

async function ensurePrePushGate(currentSessionId) {
    if (!remoteDatabase) {
        // Test/local compatibility path. Production always has a real remote handle.
        return true;
    }
    await waitForSyncPreflight();
    if (currentSessionId !== syncSessionId) return false;

    const inspection = await inspectRemoteDocumentContract(remoteDatabase);
    if (currentSessionId !== syncSessionId) return false;
    if (!sameContract(inspection, remoteContract)) {
        return performFullPreflight(currentSessionId);
    }
    if (!inspection.compatible) {
        return false;
    }
    if (auditedGeneration !== auditGeneration) {
        return performDivergenceAudit(currentSessionId);
    }
    return lastAudit?.state === 'compatible';
}

function observeDenied(operation, denied) {
    operation?.on?.('denied', (error) => {
        const id = error?.id || error?.doc?._id;
        const revision = error?.rev || error?.doc?._rev;
        if (typeof id === 'string' && typeof revision === 'string') {
            denied.add(`${id}@${revision}`);
        }
    });
}

function collectFailedRevisions(result, denied) {
    for (const error of Array.isArray(result?.errors) ? result.errors : []) {
        const id = error?.id || error?.doc?._id;
        const revision = error?.rev || error?.doc?._rev;
        if (typeof id === 'string' && typeof revision === 'string') {
            denied.add(`${id}@${revision}`);
        }
    }
    return denied.size > 0 || (result?.doc_write_failures || 0) > 0;
}

export function assertPersistenceAllowed() {
    if (WRITE_BLOCKING_STATUSES.has(syncStatus)) {
        throw new Error(`Persistence blocked: ${syncStatus}`);
    }
}

export function isPersistenceAllowed() {
    return !WRITE_BLOCKING_STATUSES.has(syncStatus);
}

export function registerExpectedLocalRevision(id, revision) {
    if (typeof id !== 'string' || typeof revision !== 'string') return;
    expectedLocalRevisions.add(`${id}@${revision}`);
    if (auditedGeneration === auditGeneration) {
        auditGeneration += 1;
        auditedGeneration = auditGeneration;
    }
}

export function invalidateSyncAudit() {
    auditGeneration += 1;
    auditedGeneration = null;
}

export function initSync(db, remote, options = {}) {
    syncSessionId += 1;
    localDb = db;
    remoteUrl = remote;
    remoteDatabase = options.remoteDb || createRemoteDatabase(remote);
    syncStatus = 'idle';
    syncInFlight = false;
    lastSyncStartedAt = 0;
    inFlightSyncPromise = null;
    retryAfterInFlightFailureRequested = false;
    reconnectRetrySessionId = null;
    remoteContract = null;
    lastAudit = null;
    auditGeneration = 0;
    auditedGeneration = null;
    controlledPullSessionId = null;
    expectedLocalRevisions.clear();
    rejectedLocalRevisions.clear();
    observeLocalChanges();
    const currentSessionId = syncSessionId;
    preflightPromise = remoteDatabase
        ? performFullPreflight(currentSessionId).finally(() => {
              if (currentSessionId === syncSessionId) preflightPromise = null;
          })
        : null;
}

export async function waitForSyncPreflight() {
    if (preflightPromise) {
        await preflightPromise;
    }
}

export async function triggerSync({
    respectCooldown = false,
    retryAfterInFlightFailure = false
} = {}) {
    if (!localDb || !remoteUrl) return;
    if (syncInFlight) {
        if (retryAfterInFlightFailure && reconnectRetrySessionId !== syncSessionId) {
            retryAfterInFlightFailureRequested = true;
        }
        return inFlightSyncPromise;
    }

    const now = Date.now();
    if (respectCooldown && now - lastSyncStartedAt < RESUME_SYNC_COOLDOWN_MS) return;

    const currentDb = localDb;
    const currentRemoteUrl = remoteUrl;
    const currentSessionId = syncSessionId;
    syncInFlight = true;
    lastSyncStartedAt = now;
    inFlightSyncPromise = (async () => {
        let syncSucceeded = false;
        let shouldRetry = false;
        try {
            if (!remoteDatabase) {
                setStatus('audit-error');
                return;
            }
            if (!(await ensurePrePushGate(currentSessionId))) return;
            if (currentSessionId !== syncSessionId) return;

            setStatus('syncing');
            const denied = new Set();
            const pushOperation = currentDb.replicate.to(currentRemoteUrl);
            observeDenied(pushOperation, denied);
            const pushResult = await pushOperation;
            const pushHadFailures = collectFailedRevisions(pushResult, denied);

            controlledPullSessionId = currentSessionId;
            let pullResult;
            try {
                pullResult = await currentDb.replicate.from(currentRemoteUrl);
            } finally {
                if (controlledPullSessionId === currentSessionId) {
                    controlledPullSessionId = null;
                }
            }

            if (currentSessionId === syncSessionId && pushHadFailures) {
                for (const identity of denied) rejectedLocalRevisions.add(identity);
                invalidateSyncAudit();
                await performDivergenceAudit(currentSessionId);
                if (lastAudit?.state === 'compatible') {
                    // After the mixed push, any still-missing eligible leaf is the rejected subset.
                    for (const leaf of lastAudit.eligible || []) {
                        rejectedLocalRevisions.add(`${leaf.id}@${leaf.revision}`);
                    }
                    invalidateSyncAudit();
                    await performDivergenceAudit(currentSessionId);
                }
                if (lastAudit?.state === 'compatible') setStatus('audit-error');
            } else if (currentSessionId === syncSessionId) {
                syncSucceeded = true;
                setStatus('synced');
            }

            if (currentSessionId === syncSessionId && (pullResult?.docs_written || 0) > 0) {
                notifyDataChange();
            }
        } catch (error) {
            if (currentSessionId === syncSessionId) {
                invalidateSyncAudit();
                logger.error('Sync transport failed.');
                setStatus(
                    typeof navigator !== 'undefined' && navigator.onLine === false
                        ? 'offline'
                        : 'error'
                );
            }
        } finally {
            if (currentSessionId === syncSessionId) {
                syncInFlight = false;
                inFlightSyncPromise = null;
                shouldRetry = !syncSucceeded && retryAfterInFlightFailureRequested;
                retryAfterInFlightFailureRequested = false;
            }
        }

        if (shouldRetry) {
            const retryOwnerSessionId = currentSessionId;
            reconnectRetrySessionId = retryOwnerSessionId;
            try {
                await triggerSync();
            } finally {
                if (reconnectRetrySessionId === retryOwnerSessionId) {
                    reconnectRetrySessionId = null;
                }
            }
        }
    })();
    return inFlightSyncPromise;
}

export function debouncedSync() {
    if (WRITE_BLOCKING_STATUSES.has(syncStatus)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    setStatus('unsynced');
    debounceTimer = setTimeout(() => triggerSync(), DEBOUNCE_MS);
}

export function onSyncStatusChange(callback) {
    statusCallbacks.add(callback);
    return () => statusCallbacks.delete(callback);
}

export function onSyncDataChange(callback) {
    dataChangeCallbacks.add(callback);
    return () => dataChangeCallbacks.delete(callback);
}

export function getSyncStatus() {
    return syncStatus;
}

export function getLastDivergenceAudit() {
    return lastAudit ? JSON.parse(JSON.stringify(lastAudit)) : null;
}

export async function waitForIdleSync() {
    await waitForSyncPreflight();
    if (!inFlightSyncPromise) return;
    try {
        await inFlightSyncPromise;
    } catch (error) {
        // Room switching only needs outstanding work to settle.
    }
}

export function teardownSync() {
    syncSessionId += 1;
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    localChangesObserver?.cancel?.();
    localChangesObserver = null;
    localDb = null;
    remoteUrl = null;
    remoteDatabase = null;
    syncStatus = 'idle';
    syncInFlight = false;
    lastSyncStartedAt = 0;
    inFlightSyncPromise = null;
    preflightPromise = null;
    retryAfterInFlightFailureRequested = false;
    reconnectRetrySessionId = null;
    remoteContract = null;
    lastAudit = null;
    auditGeneration = 0;
    auditedGeneration = null;
    controlledPullSessionId = null;
    expectedLocalRevisions.clear();
    rejectedLocalRevisions.clear();
    statusCallbacks.clear();
    dataChangeCallbacks.clear();
}

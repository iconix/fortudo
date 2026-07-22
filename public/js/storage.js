import { logger } from './utils.js';
import {
    initSync,
    debouncedSync,
    triggerSync,
    waitForSyncPreflight,
    waitForIdleSync,
    teardownSync,
    assertPersistenceAllowed,
    isPersistenceAllowed,
    registerExpectedLocalRevision,
    getLastDivergenceAudit
} from './sync-manager.js';
import {
    applyWriterContract,
    stripWriterContract,
    validateLocalDocumentContract
} from './document-contract.js';
import {
    buildLocalRecoveryBundle,
    downloadLocalRecoveryBundle,
    requireRecoveryResetConfirmation
} from './local-recovery.js';

const DOC_TYPES = Object.freeze({
    TASK: 'task',
    ACTIVITY: 'activity',
    CONFIG: 'config'
});

const LEGACY_TASK_TYPES = new Set(['scheduled', 'unscheduled']);
const LEGACY_TASK_ID_PREFIXES = ['sched-', 'unsched-'];

/** @type {Object|null} PouchDB database instance */
let db = null;

/** @type {Map<string, string>} In-memory map of task id -> PouchDB _rev */
const taskRevMap = new Map();
/** @type {Map<string, string>} In-memory map of activity id -> PouchDB _rev */
const activityRevMap = new Map();
/** @type {Map<string, string>} In-memory map of config id -> PouchDB _rev */
const configRevMap = new Map();

function ensureStorageInitialized() {
    if (!db) {
        throw new Error('Storage not initialized. Call initStorage first.');
    }
}

function clearRevStores() {
    taskRevMap.clear();
    activityRevMap.clear();
    configRevMap.clear();
}

function getRevStore(docType) {
    switch (docType) {
        case DOC_TYPES.TASK:
            return taskRevMap;
        case DOC_TYPES.ACTIVITY:
            return activityRevMap;
        case DOC_TYPES.CONFIG:
            return configRevMap;
        default:
            throw new Error(`Unsupported docType: ${docType}`);
    }
}

function hasDocType(doc) {
    return !!doc && Object.prototype.hasOwnProperty.call(doc, 'docType');
}

function hasLegacyTaskId(id) {
    return LEGACY_TASK_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function isInternalDoc(doc) {
    return !doc || !doc._id || doc._id.startsWith('_') || doc._deleted;
}

function isLegacyTaskDoc(doc) {
    if (isInternalDoc(doc) || hasDocType(doc)) {
        return false;
    }

    return LEGACY_TASK_TYPES.has(doc.type) || hasLegacyTaskId(doc._id);
}

const isTaskDoc = (doc) => doc?.docType === DOC_TYPES.TASK || isLegacyTaskDoc(doc);
const isActivityDoc = (doc) => doc?.docType === DOC_TYPES.ACTIVITY;
const isConfigDoc = (doc) => doc?.docType === DOC_TYPES.CONFIG;

function getStoredDocType(doc) {
    if (isActivityDoc(doc)) {
        return DOC_TYPES.ACTIVITY;
    }
    if (isConfigDoc(doc)) {
        return DOC_TYPES.CONFIG;
    }
    if (isTaskDoc(doc)) {
        return DOC_TYPES.TASK;
    }
    return null;
}

function normalizeStoredDoc(doc) {
    const normalized = stripWriterContract(doc);
    normalized.id = normalized._id;
    delete normalized._id;
    delete normalized._rev;
    if (
        normalized.category === null &&
        normalized.categoryId === null &&
        normalized.categoryIdentityVersion === null
    ) {
        delete normalized.category;
        delete normalized.categoryId;
        delete normalized.categoryIdentityVersion;
    }
    return normalized;
}

function toStoredDoc(record, docType) {
    const doc = { ...record, _id: record.id, docType };
    delete doc.id;
    return createContractedDocument(doc);
}

function createContractedDocument(document) {
    const contracted = applyWriterContract(document);
    const validation = validateLocalDocumentContract(contracted);
    if (!validation.ok) {
        throw new Error(`Persistence contract rejected the document: ${validation.code}`);
    }
    return contracted;
}

function assertCanPersist() {
    assertPersistenceAllowed?.();
}

function recordExpectedRevision(id, revision) {
    registerExpectedLocalRevision?.(id, revision);
}

async function loadAllRows() {
    ensureStorageInitialized();
    const result = await db.allDocs({ include_docs: true });
    return result.rows;
}

function seedRevisionStore(rows) {
    for (const row of rows) {
        const docType = getStoredDocType(row.doc);
        if (!docType) {
            continue;
        }
        getRevStore(docType).set(row.id, row.value.rev);
    }
}

function hasSameTrackedRevision(revStore, snapshot, id) {
    return revStore.has(id) === snapshot.has(id) && revStore.get(id) === snapshot.get(id);
}

function refreshRevisionStore(docType, rows, snapshot) {
    const revStore = getRevStore(docType);
    const loadedRevisions = new Map(
        rows
            .filter((row) => getStoredDocType(row.doc) === docType)
            .map((row) => [row.id, row.value.rev])
    );
    const candidateIds = new Set([...snapshot.keys(), ...loadedRevisions.keys()]);

    for (const id of candidateIds) {
        if (!hasSameTrackedRevision(revStore, snapshot, id)) {
            continue;
        }
        if (loadedRevisions.has(id)) {
            revStore.set(id, loadedRevisions.get(id));
        } else {
            revStore.delete(id);
        }
    }
}

function refreshOneTrackedRevision(docType, id, revision, snapshot) {
    const revStore = getRevStore(docType);
    if (!hasSameTrackedRevision(revStore, snapshot, id)) {
        return;
    }
    if (revision) {
        revStore.set(id, revision);
    } else {
        revStore.delete(id);
    }
}

async function loadDocsByPredicate(predicate, docType) {
    const revisionSnapshot = new Map(getRevStore(docType));
    const rows = await loadAllRows();
    refreshRevisionStore(docType, rows, revisionSnapshot);
    return rows
        .map((row) => row.doc)
        .filter(predicate)
        .map(normalizeStoredDoc);
}

async function getTrackedRevision(id, docType) {
    const revStore = getRevStore(docType);
    const trackedRevision = revStore.get(id);
    if (trackedRevision) {
        return trackedRevision;
    }

    try {
        const existingDoc = await db.get(id);
        if (getStoredDocType(existingDoc) !== docType) {
            return null;
        }
        revStore.set(id, existingDoc._rev);
        return existingDoc._rev;
    } catch (err) {
        if (err.status === 404) {
            return null;
        }
        throw err;
    }
}

async function putTypedDoc(record, docType) {
    ensureStorageInitialized();
    assertCanPersist();

    const doc = toStoredDoc(record, docType);
    const existingRev = await getTrackedRevision(record.id, docType);
    if (existingRev) {
        doc._rev = existingRev;
    }

    const result = await db.put(doc);
    getRevStore(docType).set(record.id, result.rev);
    recordExpectedRevision(record.id, result.rev);
    debouncedSync();
}

async function deleteTypedDoc(id, docType, logLabel) {
    ensureStorageInitialized();
    assertCanPersist();

    const revStore = getRevStore(docType);
    const rev = await getTrackedRevision(id, docType);
    if (!rev) {
        logger.warn(`${logLabel}: No rev found for id ${id}, document may not exist.`);
        return;
    }

    try {
        const result = await db.put(
            createContractedDocument({ _id: id, _rev: rev, _deleted: true })
        );
        revStore.delete(id);
        recordExpectedRevision(id, result.rev);
    } catch (err) {
        if (err.status !== 404) {
            throw err;
        }
        revStore.delete(id);
    }
    debouncedSync();
}

async function loadTypedDocById(id, predicate, docType) {
    ensureStorageInitialized();
    const revisionSnapshot = new Map(getRevStore(docType));

    try {
        const doc = await db.get(id);
        if (!predicate(doc)) {
            refreshOneTrackedRevision(docType, id, null, revisionSnapshot);
            return null;
        }
        refreshOneTrackedRevision(docType, id, doc._rev, revisionSnapshot);
        return normalizeStoredDoc(doc);
    } catch (err) {
        if (err.status === 404) {
            refreshOneTrackedRevision(docType, id, null, revisionSnapshot);
            return null;
        }
        throw err;
    }
}

/**
 * Initialize storage with a room code.
 * Creates/opens a PouchDB database scoped to the room.
 * @param {string} roomCode - The room identifier
 * @param {Object} [options] - PouchDB options (e.g., { adapter: 'memory' } for tests)
 * @param {string|null} [remoteUrl] - Remote CouchDB URL for sync (null to disable)
 */
export async function initStorage(roomCode, options = {}, remoteUrl = null, lifecycle = {}) {
    if (db) {
        await waitForIdleSync();
        teardownSync();
        await db.close();
    }

    clearRevStores();
    const PDB = window.PouchDB;
    const dbName = `fortudo-${roomCode}`;
    db = new PDB(dbName, options);

    const rows = await loadAllRows();
    seedRevisionStore(rows);

    initSync(db, remoteUrl);
    await waitForSyncPreflight?.();
    if (remoteUrl && !lifecycle.deferInitialSync) {
        await triggerSync?.();
    }
    logger.info(`Storage initialized for room: ${roomCode}`);
}

/**
 * Initialize storage and run idempotent storage preparation steps.
 * @param {string} roomCode
 * @param {Object} [options]
 * @param {string|null} [remoteUrl]
 */
export async function prepareStorage(roomCode, options = {}, remoteUrl = null) {
    await initStorage(roomCode, options, remoteUrl, { deferInitialSync: true });
    if (isPersistenceAllowed?.() !== false) {
        await migrateDocTypes();
    }
    if (remoteUrl) {
        await triggerSync?.();
    }
}

/**
 * Write a single task to PouchDB.
 * Handles both insert and update (upsert) via _rev tracking.
 * @param {Object} task - Task object (must have `id` field)
 */
export async function putTask(task) {
    await putTypedDoc(task, DOC_TYPES.TASK);
}

/**
 * Error containing the successful and failed rows returned by a task batch write.
 */
export class TaskBatchWriteError extends Error {
    /**
     * @param {Object[]} results - PouchDB bulkDocs row results
     */
    constructor(results) {
        const succeededIds = results.filter((result) => result.ok).map((result) => result.id);
        const failures = results.filter((result) => !result.ok);
        super('One or more task documents could not be persisted.');
        this.name = 'TaskBatchWriteError';
        this.succeededIds = succeededIds;
        this.failures = failures;
    }
}

/**
 * Upsert only the supplied task documents and report each successful row.
 * @param {Object[]} tasksToPut - Task objects to write
 * @returns {Promise<{succeededIds: string[]}>}
 * @throws {TaskBatchWriteError} When one or more PouchDB rows fail
 */
export async function putTasks(tasksToPut) {
    ensureStorageInitialized();
    assertCanPersist();
    if (tasksToPut.length === 0) {
        return { succeededIds: [] };
    }

    const docs = await Promise.all(
        tasksToPut.map(async (task) => {
            const doc = toStoredDoc(task, DOC_TYPES.TASK);
            const revision = await getTrackedRevision(task.id, DOC_TYPES.TASK);
            if (revision) {
                doc._rev = revision;
            }
            return doc;
        })
    );
    const results = await db.bulkDocs(docs);
    const succeededIds = [];

    for (const result of results) {
        if (result.ok) {
            taskRevMap.set(result.id, result.rev);
            succeededIds.push(result.id);
            recordExpectedRevision(result.id, result.rev);
        }
    }

    if (succeededIds.length > 0) {
        debouncedSync();
    }
    if (results.some((result) => !result.ok)) {
        throw new TaskBatchWriteError(results);
    }

    return { succeededIds };
}

/**
 * Write a single activity to PouchDB.
 * Handles insert/update via _rev tracking and enforces docType.
 * @param {Object} activity - Activity object (must have `id`)
 */
export async function putActivity(activity) {
    await putTypedDoc(activity, DOC_TYPES.ACTIVITY);
}

/**
 * Write or update a config document.
 * Enforces docType isolation and tracks revisions.
 * @param {Object} config - Config object (must have `id`)
 */
export async function putConfig(config) {
    await putTypedDoc(config, DOC_TYPES.CONFIG);
}

/**
 * Delete a single task from PouchDB by id.
 * @param {string} id - Task id to delete
 */
export async function deleteTask(id) {
    await deleteTypedDoc(id, DOC_TYPES.TASK, 'deleteTask');
}

/**
 * Delete only the supplied task documents and report each successful row.
 * Missing task IDs are treated as already deleted.
 * @param {string[]} taskIds - Task IDs to delete
 * @returns {Promise<{succeededIds: string[]}>}
 * @throws {TaskBatchWriteError} When one or more PouchDB rows fail
 */
export async function deleteTasks(taskIds) {
    ensureStorageInitialized();
    assertCanPersist();
    const uniqueTaskIds = [...new Set(taskIds)];
    if (uniqueTaskIds.length === 0) {
        return { succeededIds: [] };
    }

    const candidates = await Promise.all(
        uniqueTaskIds.map(async (id) => ({
            id,
            revision: await getTrackedRevision(id, DOC_TYPES.TASK)
        }))
    );
    const existing = candidates.filter(({ revision }) => revision);
    const alreadyDeletedIds = candidates.filter(({ revision }) => !revision).map(({ id }) => id);
    if (existing.length === 0) {
        return { succeededIds: alreadyDeletedIds };
    }

    const results = await db.bulkDocs(
        existing.map(({ id, revision }) =>
            createContractedDocument({ _id: id, _rev: revision, _deleted: true })
        )
    );
    const succeededIds = [...alreadyDeletedIds];

    for (const result of results) {
        if (result.ok) {
            taskRevMap.delete(result.id);
            succeededIds.push(result.id);
            recordExpectedRevision(result.id, result.rev);
        }
    }

    if (results.some((result) => result.ok)) {
        debouncedSync();
    }
    if (results.some((result) => !result.ok)) {
        throw new TaskBatchWriteError(results);
    }

    return { succeededIds };
}

/**
 * Delete a single activity by id.
 * @param {string} id - Activity id
 */
export async function deleteActivity(id) {
    await deleteTypedDoc(id, DOC_TYPES.ACTIVITY, 'deleteActivity');
}

/**
 * Delete a single config document by id.
 * @param {string} id - Config document id
 */
export async function deleteConfig(id) {
    await deleteTypedDoc(id, DOC_TYPES.CONFIG, 'deleteConfig');
}

/**
 * Load all tasks from PouchDB.
 * Maps _id back to id and strips _rev before returning.
 * @returns {Promise<Object[]>} Array of task objects
 */
export async function loadTasks() {
    return loadDocsByPredicate(isTaskDoc, DOC_TYPES.TASK);
}

/**
 * Load all activity documents.
 * @returns {Promise<Object[]>}
 */
export async function loadActivities() {
    return loadDocsByPredicate(isActivityDoc, DOC_TYPES.ACTIVITY);
}

/**
 * Load a single config document by id.
 * Returns null when the document is missing or not marked as config.
 * @param {string} configId - Config document id
 * @returns {Promise<Object|null>}
 */
export async function loadConfig(configId) {
    return loadTypedDocById(configId, isConfigDoc, DOC_TYPES.CONFIG);
}

function normalizeConfigWinner(doc) {
    const normalized = normalizeStoredDoc(doc);
    delete normalized._conflicts;
    return normalized;
}

/**
 * Load a config document together with any losing CouchDB revision leaves.
 * PouchDB metadata remains internal to the persistence layer.
 * @param {string} configId - Config document id
 * @returns {Promise<{config: Object|null, conflictRevisions: string[]}>}
 */
export async function loadConfigWithConflicts(configId) {
    ensureStorageInitialized();
    const revisionSnapshot = new Map(configRevMap);

    try {
        const doc = await db.get(configId, { conflicts: true });
        if (!isConfigDoc(doc)) {
            refreshOneTrackedRevision(DOC_TYPES.CONFIG, configId, null, revisionSnapshot);
            return { config: null, conflictRevisions: [] };
        }

        refreshOneTrackedRevision(DOC_TYPES.CONFIG, configId, doc._rev, revisionSnapshot);
        return {
            config: normalizeConfigWinner(doc),
            conflictRevisions: Array.isArray(doc._conflicts) ? [...doc._conflicts] : []
        };
    } catch (err) {
        if (err.status === 404) {
            refreshOneTrackedRevision(DOC_TYPES.CONFIG, configId, null, revisionSnapshot);
            return { config: null, conflictRevisions: [] };
        }
        throw err;
    }
}

function isConflictResult(result) {
    return result?.name === 'conflict' || result?.status === 409;
}

/**
 * Preserve the latest winning config revision and tombstone all losing leaves.
 * The read/write loop is required because CouchDB bulk writes are not atomic.
 * @param {string} configId - Config document id
 * @param {number} [maxAttempts=5] - Maximum cleanup attempts
 * @returns {Promise<Object|null>} Latest conflict-free config winner
 */
export async function resolveConfigConflicts(configId, maxAttempts = 5) {
    ensureStorageInitialized();
    assertCanPersist();
    let wroteDocuments = false;

    try {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            let winner;
            try {
                winner = await db.get(configId, { conflicts: true });
            } catch (err) {
                if (err.status === 404) {
                    configRevMap.delete(configId);
                    return null;
                }
                throw err;
            }

            if (!isConfigDoc(winner)) {
                configRevMap.delete(configId);
                return null;
            }

            const conflictRevisions = Array.isArray(winner._conflicts) ? winner._conflicts : [];
            if (conflictRevisions.length === 0) {
                configRevMap.set(configId, winner._rev);
                return normalizeConfigWinner(winner);
            }

            const successor = createContractedDocument({ ...winner });
            delete successor._conflicts;
            const documents = [
                successor,
                ...conflictRevisions.map((revision) =>
                    createContractedDocument({
                        _id: configId,
                        _rev: revision,
                        _deleted: true
                    })
                )
            ];
            const results = await db.bulkDocs(documents);
            if (results.some((result) => result.ok)) {
                wroteDocuments = true;
            }

            const nonConflictFailure = results.find(
                (result) => !result.ok && !isConflictResult(result)
            );
            if (nonConflictFailure) {
                const error = new Error('Config conflict cleanup failed.');
                error.failure = nonConflictFailure;
                throw error;
            }

            const winnerResult = results[0];
            if (winnerResult?.ok && configRevMap.get(configId) === winner._rev) {
                configRevMap.set(configId, winnerResult.rev);
            }
            for (const result of results) {
                if (result.ok) {
                    recordExpectedRevision(result.id, result.rev);
                }
            }
        }

        throw new Error('Config conflict cleanup did not converge.');
    } finally {
        if (wroteDocuments) {
            debouncedSync();
        }
    }
}

/**
 * Get the current PouchDB database instance.
 * @returns {Object|null}
 */
export function getDb() {
    return db;
}

/**
 * Download the sensitive current-leaf recovery bundle without logging its contents.
 */
export async function exportLocalRecoveryBundle() {
    ensureStorageInitialized();
    const bundle = await buildLocalRecoveryBundle(db, getLastDivergenceAudit?.());
    downloadLocalRecoveryBundle(db, bundle);
    return {
        leafCount: bundle.manifest.leafCount,
        manifestChecksum: bundle.manifestChecksum
    };
}

/**
 * Destroy a stranded local replica only after its bundle was downloaded and the
 * caller supplied the exact destructive confirmation. Reloading then pulls the
 * authoritative remote state through the normal preflight.
 */
export async function resetLocalReplicaAfterRecovery(confirmation) {
    ensureStorageInitialized();
    requireRecoveryResetConfirmation(db, confirmation);
    await waitForIdleSync();
    teardownSync();
    const databaseToDestroy = db;
    db = null;
    clearRevStores();
    await databaseToDestroy.destroy();
    window.location.reload();
}

/**
 * Destroy the current database. Used for cleanup in tests.
 */
export async function destroyStorage() {
    if (db) {
        try {
            await waitForIdleSync();
            teardownSync();
            await db.destroy();
        } catch (err) {
            logger.warn('destroyStorage: Error destroying database:', err);
        }
        db = null;
        clearRevStores();
    }
}

/**
 * Adds `docType: 'task'` to legacy task documents that lack the field so that
 * task scoping remains stable for older data.
 */
export async function migrateDocTypes() {
    ensureStorageInitialized();

    const legacyDocs = (await loadAllRows()).map((row) => row.doc).filter(isLegacyTaskDoc);
    if (legacyDocs.length === 0) {
        return;
    }

    assertCanPersist();
    const docsToUpdate = legacyDocs.map((doc) =>
        createContractedDocument({
            ...doc,
            docType: DOC_TYPES.TASK
        })
    );
    const responses = await db.bulkDocs(docsToUpdate);
    for (const response of responses) {
        if (response.ok) {
            taskRevMap.set(response.id, response.rev);
            recordExpectedRevision(response.id, response.rev);
        }
    }

    if (responses.some((response) => response.ok)) {
        debouncedSync();
    }
}

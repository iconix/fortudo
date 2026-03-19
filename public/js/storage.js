import { logger } from './utils.js';
import { initSync, debouncedSync, triggerSync } from './sync-manager.js';

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
    const normalized = { ...doc };
    normalized.id = normalized._id;
    delete normalized._id;
    delete normalized._rev;
    return normalized;
}

function toStoredDoc(record, docType) {
    const doc = { ...record, _id: record.id, docType };
    delete doc.id;
    return doc;
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

async function loadDocsByPredicate(predicate) {
    const rows = await loadAllRows();
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

    const doc = toStoredDoc(record, docType);
    const existingRev = await getTrackedRevision(record.id, docType);
    if (existingRev) {
        doc._rev = existingRev;
    }

    const result = await db.put(doc);
    getRevStore(docType).set(record.id, result.rev);
    debouncedSync();
}

async function deleteTypedDoc(id, docType, logLabel) {
    ensureStorageInitialized();

    const revStore = getRevStore(docType);
    const rev = await getTrackedRevision(id, docType);
    if (!rev) {
        logger.warn(`${logLabel}: No rev found for id ${id}, document may not exist.`);
        return;
    }

    try {
        await db.remove(id, rev);
        revStore.delete(id);
    } catch (err) {
        if (err.status !== 404) {
            throw err;
        }
        revStore.delete(id);
    }
    debouncedSync();
}

async function loadTypedDocById(id, predicate) {
    ensureStorageInitialized();

    try {
        const doc = await db.get(id);
        if (!predicate(doc)) {
            return null;
        }
        return normalizeStoredDoc(doc);
    } catch (err) {
        if (err.status === 404) {
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
export async function initStorage(roomCode, options = {}, remoteUrl = null) {
    if (db) {
        await db.close();
    }

    clearRevStores();
    const PDB = window.PouchDB;
    const dbName = `fortudo-${roomCode}`;
    db = new PDB(dbName, options);

    const rows = await loadAllRows();
    seedRevisionStore(rows);

    initSync(db, remoteUrl);
    if (remoteUrl) {
        triggerSync();
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
    await initStorage(roomCode, options, remoteUrl);
    await migrateDocTypes();
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
 * Delete a single activity by id.
 * @param {string} id - Activity id
 */
export async function deleteActivity(id) {
    await deleteTypedDoc(id, DOC_TYPES.ACTIVITY, 'deleteActivity');
}

/**
 * Load all tasks from PouchDB.
 * Maps _id back to id and strips _rev before returning.
 * @returns {Promise<Object[]>} Array of task objects
 */
export async function loadTasks() {
    return loadDocsByPredicate(isTaskDoc);
}

/**
 * Load all activity documents.
 * @returns {Promise<Object[]>}
 */
export async function loadActivities() {
    return loadDocsByPredicate(isActivityDoc);
}

/**
 * Load a single config document by id.
 * Returns null when the document is missing or not marked as config.
 * @param {string} configId - Config document id
 * @returns {Promise<Object|null>}
 */
export async function loadConfig(configId) {
    return loadTypedDocById(configId, isConfigDoc);
}

/**
 * Bulk replace all tasks. Deletes existing docs and inserts new ones.
 * Used for init/clear-all operations.
 * @param {Object[]} tasks - Array of task objects to save
 */
export async function saveTasks(tasks) {
    ensureStorageInitialized();

    const rows = await loadAllRows();
    const deletions = rows
        .filter((row) => isTaskDoc(row.doc))
        .map((row) => ({
            _id: row.id,
            _rev: row.value.rev,
            _deleted: true
        }));

    if (deletions.length > 0) {
        await db.bulkDocs(deletions);
        for (const { _id } of deletions) {
            taskRevMap.delete(_id);
        }
    }

    if (tasks.length > 0) {
        const docs = tasks.map((task) => toStoredDoc(task, DOC_TYPES.TASK));
        const results = await db.bulkDocs(docs);
        for (const result of results) {
            if (result.ok) {
                taskRevMap.set(result.id, result.rev);
            }
        }
    }

    debouncedSync();
}

/**
 * Get the current PouchDB database instance.
 * @returns {Object|null}
 */
export function getDb() {
    return db;
}

/**
 * Destroy the current database. Used for cleanup in tests.
 */
export async function destroyStorage() {
    if (db) {
        try {
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

    const docsToUpdate = legacyDocs.map((doc) => ({
        ...doc,
        docType: DOC_TYPES.TASK
    }));
    const responses = await db.bulkDocs(docsToUpdate);
    for (const response of responses) {
        if (response.ok) {
            taskRevMap.set(response.id, response.rev);
        }
    }

    if (responses.some((response) => response.ok)) {
        debouncedSync();
    }
}

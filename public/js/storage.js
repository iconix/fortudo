import { logger } from './utils.js';
import { initSync, debouncedSync, triggerSync } from './sync-manager.js';

/** @type {Object|null} PouchDB database instance */
let db = null;

/** @type {Map<string, string>} In-memory map of task id -> PouchDB _rev */
const revMap = new Map();
/** @type {Map<string, string>} In-memory map of activity id -> PouchDB _rev */
const activityRevMap = new Map();
/** @type {Map<string, string>} In-memory map of config id -> PouchDB _rev */
const configRevMap = new Map();

const isTaskDoc = (doc) => {
    if (!doc) {
        return false;
    }
    const hasDocType = Object.prototype.hasOwnProperty.call(doc, 'docType');
    return !hasDocType || doc.docType === 'task';
};

const isActivityDoc = (doc) => {
    if (!doc) {
        return false;
    }
    return doc.docType === 'activity';
};

const isConfigDoc = (doc) => {
    if (!doc) {
        return false;
    }
    return doc.docType === 'config';
};

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
    revMap.clear();
    activityRevMap.clear();
    configRevMap.clear();
    const PDB = window.PouchDB;
    const dbName = `fortudo-${roomCode}`;
    db = new PDB(dbName, options);

    // Pre-populate revMap from existing docs
    const result = await db.allDocs({ include_docs: true });
    for (const row of result.rows) {
        const doc = row.doc;
        if (doc && isTaskDoc(doc)) {
            revMap.set(row.id, row.value.rev);
        }
        if (doc && isActivityDoc(doc)) {
            activityRevMap.set(row.id, row.value.rev);
        }
        if (doc && isConfigDoc(doc)) {
            configRevMap.set(row.id, row.value.rev);
        }
    }

    initSync(db, remoteUrl);
    if (remoteUrl) {
        triggerSync();
    }
    logger.info(`Storage initialized for room: ${roomCode}`);
}

/**
 * Write a single task to PouchDB.
 * Handles both insert and update (upsert) via _rev tracking.
 * @param {Object} task - Task object (must have `id` field)
 */
export async function putTask(task) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const doc = { ...task, _id: task.id };
    doc.docType = 'task';
    delete doc.id;

    const existingRev = revMap.get(task.id);
    if (existingRev) {
        doc._rev = existingRev;
    }

    const result = await db.put(doc);
    revMap.set(task.id, result.rev);
    debouncedSync();
}

/**
 * Write a single activity to PouchDB.
 * Handles insert/update via _rev tracking and enforces docType.
 * @param {Object} activity - Activity object (must have `id`)
 */
export async function putActivity(activity) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const doc = { ...activity, _id: activity.id, docType: 'activity' };
    delete doc.id;

    const existingRev = activityRevMap.get(activity.id);
    if (existingRev) {
        doc._rev = existingRev;
    }

    const result = await db.put(doc);
    activityRevMap.set(activity.id, result.rev);
    debouncedSync();
}

/**
 * Write or update a config document.
 * Enforces docType isolation and tracks revisions.
 * @param {Object} config - Config object (must have `id`)
 */
export async function putConfig(config) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const doc = { ...config, _id: config.id, docType: 'config' };
    delete doc.id;

    const existingRev = configRevMap.get(config.id);
    if (existingRev) {
        doc._rev = existingRev;
    }

    const result = await db.put(doc);
    configRevMap.set(config.id, result.rev);
    debouncedSync();
}

/**
 * Delete a single task from PouchDB by id.
 * @param {string} id - Task id to delete
 */
export async function deleteTask(id) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const rev = revMap.get(id);
    if (!rev) {
        logger.warn(`deleteTask: No rev found for id ${id}, task may not exist.`);
        return;
    }

    try {
        await db.remove(id, rev);
        revMap.delete(id);
    } catch (err) {
        if (err.status !== 404) throw err;
        revMap.delete(id);
    }
    debouncedSync();
}

/**
 * Delete a single activity by id.
 * @param {string} id - Activity id
 */
export async function deleteActivity(id) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const rev = activityRevMap.get(id);
    if (!rev) {
        logger.warn(`deleteActivity: No rev found for id ${id}, activity may not exist.`);
        return;
    }

    try {
        await db.remove(id, rev);
        activityRevMap.delete(id);
    } catch (err) {
        if (err.status !== 404) throw err;
        activityRevMap.delete(id);
    }
    debouncedSync();
}

/**
 * Load all tasks from PouchDB.
 * Maps _id back to id and strips _rev before returning.
 * @returns {Promise<Object[]>} Array of task objects
 */
export async function loadTasks() {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const result = await db.allDocs({ include_docs: true });
    return result.rows
        .map((row) => row.doc)
        .filter(isTaskDoc)
        .map((doc) => {
            const normalized = { ...doc };
            normalized.id = normalized._id;
            delete normalized._id;
            delete normalized._rev;
            return normalized;
        });
}

/**
 * Load all activity documents.
 * @returns {Promise<Object[]>}
 */
export async function loadActivities() {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const result = await db.allDocs({ include_docs: true });
    return result.rows
        .map((row) => row.doc)
        .filter(isActivityDoc)
        .map((doc) => {
            const normalized = { ...doc };
            normalized.id = normalized._id;
            delete normalized._id;
            delete normalized._rev;
            return normalized;
        });
}

/**
 * Load a single config document by id.
 * Returns null when the document is missing or not marked as config.
 * @param {string} configId - Config document id
 * @returns {Promise<Object|null>}
 */
export async function loadConfig(configId) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    try {
        const doc = await db.get(configId);
        if (!isConfigDoc(doc)) {
            return null;
        }
        const normalized = { ...doc };
        normalized.id = normalized._id;
        delete normalized._id;
        delete normalized._rev;
        return normalized;
    } catch (err) {
        if (err.status === 404) {
            return null;
        }
        throw err;
    }
}

/**
 * Bulk replace all tasks. Deletes existing docs and inserts new ones.
 * Used for init/clear-all operations.
 * @param {Object[]} tasks - Array of task objects to save
 */
export async function saveTasks(tasks) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    // Delete all existing docs
    const existing = await db.allDocs({ include_docs: true });
    const deletions = existing.rows
        .filter((row) => isTaskDoc(row.doc))
        .map((row) => ({
            _id: row.id,
            _rev: row.value.rev,
            _deleted: true
        }));
    if (deletions.length > 0) {
        await db.bulkDocs(deletions);
        for (const { _id } of deletions) {
            revMap.delete(_id);
        }
    }

    // Insert new tasks
    if (tasks.length > 0) {
        const docs = tasks.map((task) => {
            const doc = { ...task, _id: task.id };
            delete doc.id;
            return doc;
        });
        const results = await db.bulkDocs(docs);
        for (const result of results) {
            if (result.ok) {
                revMap.set(result.id, result.rev);
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
        revMap.clear();
        activityRevMap.clear();
        configRevMap.clear();
    }
}

/**
 * Adds `docType: 'task'` to legacy documents that lack the field so that task
 * scoping remains stable for older data.
 */
export async function migrateDocTypes() {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const result = await db.allDocs({ include_docs: true });
    const legacyDocs = result.rows
        .map((row) => row.doc)
        .filter((doc) => {
            if (!doc || !doc._id) {
                return false;
            }
            if (doc._id.startsWith('_') || doc._deleted) {
                return false;
            }
            return !Object.prototype.hasOwnProperty.call(doc, 'docType');
        });

    if (legacyDocs.length === 0) {
        return;
    }

    const docsToUpdate = legacyDocs.map((doc) => ({
        ...doc,
        docType: 'task'
    }));
    const responses = await db.bulkDocs(docsToUpdate);
    for (const response of responses) {
        if (response.ok) {
            revMap.set(response.id, response.rev);
        }
    }

    if (responses.some((response) => response.ok)) {
        debouncedSync();
    }
}

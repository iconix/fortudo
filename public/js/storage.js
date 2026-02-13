import { logger } from './utils.js';
import { initSync, debouncedSync } from './sync-manager.js';

/** @type {Object|null} PouchDB database instance */
let db = null;

/** @type {Map<string, string>} In-memory map of task id -> PouchDB _rev */
const revMap = new Map();

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

    const PDB = window.PouchDB;
    const dbName = `fortudo-${roomCode}`;
    db = new PDB(dbName, options);

    // Pre-populate revMap from existing docs
    const result = await db.allDocs();
    for (const row of result.rows) {
        revMap.set(row.id, row.value.rev);
    }

    initSync(db, remoteUrl);
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
 * Load all tasks from PouchDB.
 * Maps _id back to id and strips _rev before returning.
 * @returns {Promise<Object[]>} Array of task objects
 */
export async function loadTasks() {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const result = await db.allDocs({ include_docs: true });
    return result.rows.map((row) => {
        const doc = { ...row.doc };
        doc.id = doc._id;
        delete doc._id;
        delete doc._rev;
        return doc;
    });
}

/**
 * Bulk replace all tasks. Deletes existing docs and inserts new ones.
 * Used for init/clear-all operations.
 * @param {Object[]} tasks - Array of task objects to save
 */
export async function saveTasks(tasks) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    // Delete all existing docs
    const existing = await db.allDocs();
    if (existing.rows.length > 0) {
        const deletions = existing.rows.map((row) => ({
            _id: row.id,
            _rev: row.value.rev,
            _deleted: true
        }));
        await db.bulkDocs(deletions);
    }
    revMap.clear();

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
    }
}

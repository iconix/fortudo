/**
 * @jest-environment jsdom
 */

// PouchDB/memdown requires setImmediate which jsdom doesn't provide
const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

// Set up window.PouchDB before importing storage
window.PouchDB = PouchDB;

// Mock sync-manager so storage tests don't trigger actual sync
jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn(),
    waitForIdleSync: jest.fn(() => Promise.resolve()),
    teardownSync: jest.fn()
}));

import {
    initStorage,
    putTask,
    putTasks,
    TaskBatchWriteError,
    putActivity,
    putConfig,
    deleteTask,
    loadTasks,
    loadActivities,
    loadConfig,
    loadConfigWithConflicts,
    resolveConfigConflicts,
    saveTasks,
    getDb,
    destroyStorage
} from '../public/js/storage.js';
import {
    debouncedSync as mockDebouncedSync,
    waitForIdleSync as mockWaitForIdleSync
} from '../public/js/sync-manager.js';

// Use a unique DB name per test to avoid cross-contamination
let testDbCounter = 0;
function uniqueRoomCode() {
    return `test-room-${testDbCounter++}-${Date.now()}`;
}

beforeEach(() => {
    mockDebouncedSync.mockClear();
});

afterEach(async () => {
    await destroyStorage();
});

describe('Storage - PouchDB', () => {
    describe('initStorage', () => {
        test('initializes without error', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        });

        test('creates a database scoped to room code', async () => {
            const roomCode = uniqueRoomCode();
            await initStorage(roomCode, { adapter: 'memory' });
            const tasks = await loadTasks();
            expect(tasks).toEqual([]);
        });

        test('waits for in-flight sync to settle before closing the current db', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            mockWaitForIdleSync.mockClear();

            const firstDb = getDb();
            const closeSpy = jest.spyOn(firstDb, 'close');

            let releaseSyncWait;
            const syncWait = new Promise((resolve) => {
                releaseSyncWait = resolve;
            });
            mockWaitForIdleSync.mockReturnValueOnce(syncWait);

            const reinitPromise = initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await Promise.resolve();

            expect(mockWaitForIdleSync).toHaveBeenCalledTimes(1);
            expect(closeSpy).not.toHaveBeenCalled();

            releaseSyncWait();
            await reinitPromise;

            expect(closeSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('putTask', () => {
        test('stores a new task and retrieves it', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const task = {
                id: 'sched-123',
                type: 'scheduled',
                description: 'Test task',
                status: 'incomplete',
                startDateTime: '2025-01-15T09:00:00',
                endDateTime: '2025-01-15T10:00:00',
                duration: 60
            };
            await putTask(task);
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('sched-123');
            expect(tasks[0].description).toBe('Test task');
        });

        test('does not expose _id or _rev to callers', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                type: 'scheduled',
                description: 'Test',
                status: 'incomplete'
            });
            const tasks = await loadTasks();
            expect(tasks[0]).not.toHaveProperty('_id');
            expect(tasks[0]).not.toHaveProperty('_rev');
        });

        test('updates an existing task', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                type: 'scheduled',
                description: 'Original',
                status: 'incomplete'
            });
            await putTask({
                id: 'sched-1',
                type: 'scheduled',
                description: 'Updated',
                status: 'incomplete'
            });
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].description).toBe('Updated');
        });
    });

    describe('config conflicts', () => {
        test('loads a config winner and reports its losing revisions without exposing Pouch metadata', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const database = getDb();
            const getSpy = jest.spyOn(database, 'get').mockResolvedValueOnce({
                _id: 'config-unscheduled-sequence',
                _rev: '3-winner',
                _conflicts: ['2-loser-a', '2-loser-b'],
                docType: 'config',
                schemaVersion: 1,
                orderedTaskIds: ['gamma', 'alpha', 'beta']
            });

            try {
                await expect(
                    loadConfigWithConflicts('config-unscheduled-sequence')
                ).resolves.toEqual({
                    config: {
                        id: 'config-unscheduled-sequence',
                        docType: 'config',
                        schemaVersion: 1,
                        orderedTaskIds: ['gamma', 'alpha', 'beta']
                    },
                    conflictRevisions: ['2-loser-a', '2-loser-b']
                });
            } finally {
                getSpy.mockRestore();
            }
        });

        test('returns an empty conflict result for a missing config', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });

            await expect(loadConfigWithConflicts('config-missing')).resolves.toEqual({
                config: null,
                conflictRevisions: []
            });
        });

        test('resolves real sibling revisions in PouchDB without changing the winning value', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const id = 'config-unscheduled-sequence';
            await putConfig({ id, schemaVersion: 1, orderedTaskIds: ['alpha', 'beta'] });
            const database = getDb();
            const base = await database.get(id);
            const baseRevisionHash = base._rev.split('-')[1];
            await database.put({ ...base, orderedTaskIds: ['alpha', 'beta', 'gamma'] });
            const injectedWinnerRevision = '2-ffffffffffffffffffffffffffffffff';
            await database.bulkDocs(
                [
                    {
                        _id: id,
                        _rev: injectedWinnerRevision,
                        _revisions: {
                            start: 2,
                            ids: ['ffffffffffffffffffffffffffffffff', baseRevisionHash]
                        },
                        docType: 'config',
                        schemaVersion: 1,
                        orderedTaskIds: ['gamma', 'beta', 'alpha']
                    }
                ],
                { new_edits: false }
            );

            await expect(loadConfigWithConflicts(id)).resolves.toMatchObject({
                config: expect.objectContaining({
                    id,
                    orderedTaskIds: ['gamma', 'beta', 'alpha']
                }),
                conflictRevisions: [expect.stringMatching(/^2-/)]
            });
            await expect(resolveConfigConflicts(id)).resolves.toEqual({
                id,
                docType: 'config',
                schemaVersion: 1,
                orderedTaskIds: ['gamma', 'beta', 'alpha']
            });

            const resolved = await database.get(id, { conflicts: true });
            expect(resolved.orderedTaskIds).toEqual(['gamma', 'beta', 'alpha']);
            expect(resolved._conflicts).toBeUndefined();
        });

        test('advances the current winner and tombstones every losing config revision', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const database = getDb();
            const winner = {
                _id: 'config-unscheduled-sequence',
                _rev: '3-winner',
                _conflicts: ['2-loser-a', '2-loser-b'],
                docType: 'config',
                schemaVersion: 1,
                orderedTaskIds: ['gamma', 'alpha', 'beta']
            };
            const getSpy = jest
                .spyOn(database, 'get')
                .mockResolvedValueOnce(winner)
                .mockResolvedValueOnce({
                    ...winner,
                    _rev: '4-resolved',
                    _conflicts: []
                });
            const bulkSpy = jest.spyOn(database, 'bulkDocs').mockResolvedValueOnce([
                { ok: true, id: winner._id, rev: '4-resolved' },
                { ok: true, id: winner._id, rev: '3-deleted-a' },
                { ok: true, id: winner._id, rev: '3-deleted-b' }
            ]);

            try {
                await expect(resolveConfigConflicts(winner._id)).resolves.toEqual({
                    id: winner._id,
                    docType: 'config',
                    schemaVersion: 1,
                    orderedTaskIds: ['gamma', 'alpha', 'beta']
                });
                expect(bulkSpy).toHaveBeenCalledWith([
                    {
                        _id: winner._id,
                        _rev: '3-winner',
                        docType: 'config',
                        schemaVersion: 1,
                        orderedTaskIds: ['gamma', 'alpha', 'beta']
                    },
                    { _id: winner._id, _rev: '2-loser-a', _deleted: true },
                    { _id: winner._id, _rev: '2-loser-b', _deleted: true }
                ]);
                expect(mockDebouncedSync).toHaveBeenCalledTimes(1);
            } finally {
                getSpy.mockRestore();
                bulkSpy.mockRestore();
            }
        });

        test('re-reads and retries when a non-atomic conflict cleanup races another writer', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const database = getDb();
            const id = 'config-unscheduled-sequence';
            const firstWinner = {
                _id: id,
                _rev: '3-first',
                _conflicts: ['2-loser'],
                docType: 'config',
                orderedTaskIds: ['alpha', 'beta']
            };
            const newerWinner = {
                _id: id,
                _rev: '4-newer',
                _conflicts: ['2-loser'],
                docType: 'config',
                orderedTaskIds: ['beta', 'alpha']
            };
            const getSpy = jest
                .spyOn(database, 'get')
                .mockResolvedValueOnce(firstWinner)
                .mockResolvedValueOnce(newerWinner)
                .mockResolvedValueOnce({ ...newerWinner, _rev: '5-resolved', _conflicts: [] });
            const bulkSpy = jest
                .spyOn(database, 'bulkDocs')
                .mockResolvedValueOnce([
                    { id, error: true, name: 'conflict', status: 409 },
                    { ok: true, id, rev: '3-deleted' }
                ])
                .mockResolvedValueOnce([
                    { ok: true, id, rev: '5-resolved' },
                    { ok: true, id, rev: '3-deleted-again' }
                ]);

            try {
                await expect(resolveConfigConflicts(id)).resolves.toEqual({
                    id,
                    docType: 'config',
                    orderedTaskIds: ['beta', 'alpha']
                });
                expect(bulkSpy).toHaveBeenCalledTimes(2);
                expect(bulkSpy.mock.calls[1][0][0]).toEqual({
                    _id: id,
                    _rev: '4-newer',
                    docType: 'config',
                    orderedTaskIds: ['beta', 'alpha']
                });
                expect(mockDebouncedSync).toHaveBeenCalledTimes(1);
            } finally {
                getSpy.mockRestore();
                bulkSpy.mockRestore();
            }
        });

        test('fails conflict cleanup on a non-conflict bulk error', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const database = getDb();
            const id = 'config-unscheduled-sequence';
            const getSpy = jest.spyOn(database, 'get').mockResolvedValueOnce({
                _id: id,
                _rev: '2-winner',
                _conflicts: ['2-loser'],
                docType: 'config',
                orderedTaskIds: []
            });
            const bulkSpy = jest.spyOn(database, 'bulkDocs').mockResolvedValueOnce([
                { id, error: true, name: 'forbidden', status: 403 },
                { ok: true, id, rev: '3-deleted' }
            ]);

            try {
                await expect(resolveConfigConflicts(id)).rejects.toThrow(
                    'Config conflict cleanup failed.'
                );
            } finally {
                getSpy.mockRestore();
                bulkSpy.mockRestore();
            }
        });
    });

    describe('putTasks', () => {
        test('returns empty IDs without writing or syncing an empty batch', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const bulkDocsSpy = jest.spyOn(getDb(), 'bulkDocs');

            try {
                await expect(putTasks([])).resolves.toEqual({ succeededIds: [] });
                expect(bulkDocsSpy).not.toHaveBeenCalled();
                expect(mockDebouncedSync).not.toHaveBeenCalled();
            } finally {
                bulkDocsSpy.mockRestore();
            }
        });

        test('upserts only supplied tasks and returns successful IDs', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'scheduled-kept',
                type: 'scheduled',
                description: 'Keep me',
                status: 'incomplete'
            });

            const result = await putTasks([
                {
                    id: 'unscheduled-a',
                    type: 'unscheduled',
                    description: 'First backlog task',
                    status: 'incomplete',
                    manualOrder: 1
                },
                {
                    id: 'unscheduled-b',
                    type: 'unscheduled',
                    description: 'Second backlog task',
                    status: 'incomplete',
                    manualOrder: 0
                }
            ]);

            expect(result).toEqual({ succeededIds: ['unscheduled-a', 'unscheduled-b'] });
            expect(await loadTasks()).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: 'scheduled-kept' }),
                    expect.objectContaining({ id: 'unscheduled-a', manualOrder: 1 }),
                    expect.objectContaining({ id: 'unscheduled-b', manualOrder: 0 })
                ])
            );
        });

        test('refreshes tracked revisions across consecutive batch updates', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'unscheduled-a',
                type: 'unscheduled',
                description: 'Original',
                status: 'incomplete',
                manualOrder: 2
            });

            await expect(
                putTasks([
                    {
                        id: 'unscheduled-a',
                        type: 'unscheduled',
                        description: 'First update',
                        status: 'incomplete',
                        manualOrder: 1
                    }
                ])
            ).resolves.toEqual({ succeededIds: ['unscheduled-a'] });
            await expect(
                putTasks([
                    {
                        id: 'unscheduled-a',
                        type: 'unscheduled',
                        description: 'Second update',
                        status: 'incomplete',
                        manualOrder: 0
                    }
                ])
            ).resolves.toEqual({ succeededIds: ['unscheduled-a'] });

            expect(await loadTasks()).toEqual([
                expect.objectContaining({
                    id: 'unscheduled-a',
                    description: 'Second update',
                    manualOrder: 0
                })
            ]);
        });

        test('refreshes a task revision after another writer updates it', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'unscheduled-shared',
                type: 'unscheduled',
                description: 'Original description',
                status: 'incomplete',
                priority: 'medium'
            });

            const database = getDb();
            const externalDoc = await database.get('unscheduled-shared');
            await database.put({
                ...externalDoc,
                description: 'Updated in another page',
                externalNote: 'preserve this field'
            });

            const [loadedTask] = await loadTasks();
            await expect(putTasks([{ ...loadedTask, manualOrder: 0 }])).resolves.toEqual({
                succeededIds: ['unscheduled-shared']
            });

            expect(await loadTasks()).toEqual([
                expect.objectContaining({
                    id: 'unscheduled-shared',
                    description: 'Updated in another page',
                    externalNote: 'preserve this field',
                    manualOrder: 0
                })
            ]);
        });

        test('triggers debounced sync exactly once after a successful batch', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });

            await putTasks([
                { id: 'unscheduled-a', type: 'unscheduled', manualOrder: 1 },
                { id: 'unscheduled-b', type: 'unscheduled', manualOrder: 0 }
            ]);

            expect(mockDebouncedSync).toHaveBeenCalledTimes(1);
        });

        test('throws structured row results after a partial batch failure', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const database = getDb();
            const realBulkDocs = database.bulkDocs.bind(database);
            const conflictRow = {
                id: 'unscheduled-b',
                error: true,
                name: 'conflict',
                status: 409,
                message: 'Document update conflict'
            };
            const bulkDocsSpy = jest
                .spyOn(database, 'bulkDocs')
                .mockImplementationOnce(async (docs) => {
                    const [successRow] = await realBulkDocs([docs[0]]);
                    return [successRow, conflictRow];
                });
            let thrownError;

            try {
                await putTasks([
                    {
                        id: 'unscheduled-a',
                        type: 'unscheduled',
                        description: 'Durably written',
                        manualOrder: 1
                    },
                    { id: 'unscheduled-b', type: 'unscheduled', manualOrder: 0 }
                ]);
            } catch (error) {
                thrownError = error;
            } finally {
                bulkDocsSpy.mockRestore();
            }

            expect(thrownError).toBeInstanceOf(TaskBatchWriteError);
            expect(thrownError).toMatchObject({
                name: 'TaskBatchWriteError',
                succeededIds: ['unscheduled-a'],
                failures: [conflictRow]
            });
            expect(await loadTasks()).toEqual([
                expect.objectContaining({
                    id: 'unscheduled-a',
                    description: 'Durably written',
                    manualOrder: 1
                })
            ]);
            expect(mockDebouncedSync).toHaveBeenCalledTimes(1);
        });
    });

    describe('deleteTask', () => {
        test('removes a task by id', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                type: 'scheduled',
                description: 'To delete',
                status: 'incomplete'
            });
            await deleteTask('sched-1');
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(0);
        });

        test('does not error when deleting non-existent task', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await expect(deleteTask('nonexistent')).resolves.not.toThrow();
        });
    });

    describe('loadTasks', () => {
        test('returns empty array when no tasks exist', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const tasks = await loadTasks();
            expect(tasks).toEqual([]);
        });

        test('returns all stored tasks', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                type: 'scheduled',
                description: 'Task 1',
                status: 'incomplete'
            });
            await putTask({
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Task 2',
                status: 'incomplete',
                priority: 'high'
            });
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(2);
        });

        test('drops a tracked revision after another writer deletes the task', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'externally-deleted',
                type: 'unscheduled',
                description: 'Deleted elsewhere',
                status: 'incomplete'
            });

            const database = getDb();
            await database.remove(await database.get('externally-deleted'));

            await expect(loadTasks()).resolves.toEqual([]);
            await expect(deleteTask('externally-deleted')).resolves.toBeUndefined();
        });

        test('does not replace a newer revision when an older load finishes late', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'concurrent-task',
                type: 'unscheduled',
                description: 'Before concurrent write',
                status: 'incomplete'
            });

            const database = getDb();
            const staleResult = await database.allDocs({ include_docs: true });
            const allDocsSpy = jest.spyOn(database, 'allDocs');
            let finishLoad;
            allDocsSpy.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finishLoad = () => resolve(staleResult);
                    })
            );

            const delayedLoad = loadTasks();
            await putTask({
                id: 'concurrent-task',
                type: 'unscheduled',
                description: 'Concurrent write',
                status: 'incomplete'
            });
            finishLoad();
            await delayedLoad;
            allDocsSpy.mockRestore();

            await expect(
                putTask({
                    id: 'concurrent-task',
                    type: 'unscheduled',
                    description: 'After delayed load',
                    status: 'incomplete'
                })
            ).resolves.toBeUndefined();
            expect(await loadTasks()).toEqual([
                expect.objectContaining({
                    id: 'concurrent-task',
                    description: 'After delayed load'
                })
            ]);
        });
    });

    describe('saveTasks (bulk)', () => {
        test('replaces all tasks with provided array', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'old-1',
                type: 'scheduled',
                description: 'Old',
                status: 'incomplete'
            });
            await saveTasks([
                { id: 'new-1', type: 'scheduled', description: 'New 1', status: 'incomplete' },
                {
                    id: 'new-2',
                    type: 'unscheduled',
                    description: 'New 2',
                    status: 'incomplete',
                    priority: 'low'
                }
            ]);
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(2);
            const ids = tasks.map((t) => t.id).sort();
            expect(ids).toEqual(['new-1', 'new-2']);
        });

        test('clearing all tasks with empty array', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                type: 'scheduled',
                description: 'Task',
                status: 'incomplete'
            });
            await saveTasks([]);
            const tasks = await loadTasks();
            expect(tasks).toEqual([]);
        });

        test('clearing all tasks preserves activity and config docs', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                type: 'scheduled',
                description: 'Scheduled task',
                status: 'incomplete'
            });
            await putTask({
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'Unscheduled task',
                status: 'incomplete',
                priority: 'medium'
            });
            await putActivity({
                id: 'activity-1',
                docType: 'activity',
                description: 'Preserved activity',
                category: null,
                startDateTime: '2026-04-11T09:00:00.000Z',
                endDateTime: '2026-04-11T09:30:00.000Z',
                duration: 30,
                source: 'manual',
                sourceTaskId: null
            });
            await putConfig({
                id: 'config-categories',
                groups: [],
                categories: []
            });

            await saveTasks([]);

            const tasks = await loadTasks();
            const activities = await loadActivities();
            const categoriesConfig = await loadConfig('config-categories');

            expect(tasks).toEqual([]);
            expect(activities).toEqual([
                expect.objectContaining({
                    id: 'activity-1',
                    docType: 'activity',
                    description: 'Preserved activity'
                })
            ]);
            expect(categoriesConfig).toEqual(
                expect.objectContaining({
                    id: 'config-categories',
                    docType: 'config'
                })
            );
        });
    });
});

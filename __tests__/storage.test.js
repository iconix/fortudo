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

import {
    initStorage,
    putTask,
    deleteTask,
    loadTasks,
    saveTasks,
    destroyStorage
} from '../public/js/storage.js';

// Use a unique DB name per test to avoid cross-contamination
let testDbCounter = 0;
function uniqueRoomCode() {
    return `test-room-${testDbCounter++}-${Date.now()}`;
}

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
    });
});

/**
 * @jest-environment jsdom
 */

// PouchDB/memdown relies on setImmediate, which jsdom lacks
const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn()
}));

import {
    initStorage,
    putActivity,
    loadActivities,
    deleteActivity,
    putTask,
    deleteTask,
    loadTasks,
    destroyStorage
} from '../public/js/storage.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `activity-room-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('Storage - activities', () => {
    describe('putActivity', () => {
        test('persists activity and loadActivities returns sanitized doc', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const activity = {
                id: 'activity-1',
                name: 'Test focus',
                status: 'planned'
            };
            await putActivity(activity);
            const activities = await loadActivities();
            expect(activities).toHaveLength(1);
            expect(activities[0]).toMatchObject({
                id: 'activity-1',
                name: 'Test focus',
                status: 'planned',
                docType: 'activity'
            });
            expect(activities[0]).not.toHaveProperty('_id');
            expect(activities[0]).not.toHaveProperty('_rev');
        });

        test('updates an existing activity via revision tracking', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putActivity({ id: 'activity-2', name: 'Original', status: 'planned' });
            await putActivity({ id: 'activity-2', name: 'Updated', status: 'completed' });
            const activities = await loadActivities();
            expect(activities).toHaveLength(1);
            expect(activities[0].name).toBe('Updated');
            expect(activities[0].status).toBe('completed');
        });
    });

    describe('loadActivities', () => {
        test('returns only activity docs and hides internal fields', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'task-1',
                type: 'scheduled',
                description: 'Task doc',
                status: 'incomplete'
            });
            await putActivity({ id: 'activity-3', name: 'Focus block', status: 'planned' });
            const activities = await loadActivities();
            expect(activities).toHaveLength(1);
            expect(activities[0].id).toBe('activity-3');
            expect(activities[0]).not.toHaveProperty('_id');
            expect(activities[0]).not.toHaveProperty('_rev');
        });

        test('returns empty array when no activities exist', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const activities = await loadActivities();
            expect(activities).toEqual([]);
        });
    });

    describe('deleteActivity', () => {
        test('removes only the activity and leaves tasks intact', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'y-task',
                type: 'unscheduled',
                description: 'Do not delete',
                status: 'incomplete'
            });
            await putActivity({ id: 'activity-delete', name: 'To remove', status: 'planned' });
            await deleteActivity('activity-delete');
            const activities = await loadActivities();
            expect(activities).toEqual([]);
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('y-task');
        });

        test('resolves when activity does not exist and does not touch tasks', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'lonely-task',
                type: 'unscheduled',
                description: 'Still here',
                status: 'incomplete'
            });
            await expect(deleteActivity('missing-activity')).resolves.not.toThrow();
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('lonely-task');
        });
    });

    describe('activity/task isolation', () => {
        test('activity survives re-init and task APIs do not remove or overwrite it', async () => {
            const roomCode = uniqueRoomCode();
            await initStorage(roomCode, { adapter: 'memory' });
            await putActivity({ id: 'shared-id', name: 'Safe focus', status: 'planned' });
            await initStorage(roomCode, { adapter: 'memory' });

            await expect(deleteTask('shared-id')).resolves.not.toThrow();
            let activities = await loadActivities();
            expect(activities).toHaveLength(1);
            expect(activities[0].id).toBe('shared-id');

            await expect(
                putTask({
                    id: 'shared-id',
                    type: 'scheduled',
                    description: 'Collision',
                    status: 'incomplete'
                })
            ).rejects.toThrow(/conflict/i);

            activities = await loadActivities();
            expect(activities).toHaveLength(1);
            expect(activities[0].docType).toBe('activity');

            const tasks = await loadTasks();
            expect(tasks).toHaveLength(0);
        });
    });
});

/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    getSelectableCategoryOptions: jest.fn(() => [
        { value: 'work', label: 'Work', indentLevel: 0 },
        { value: 'work/deep', label: 'Deep Work', indentLevel: 1 }
    ]),
    resolveCategoryKey: jest.fn(() => null),
    renderCategoryBadge: jest.fn(() => '')
}));

import { createRoomSessionLifecycle } from '../public/js/app-lifecycle.js';
import {
    getTaskState,
    updateTaskState,
    updateTaskStateFromStorage
} from '../public/js/tasks/manager.js';
import { renderTasks } from '../public/js/tasks/scheduled-renderer.js';

function createScheduledTask(overrides = {}) {
    return {
        id: 'scheduled-editing-task',
        type: 'scheduled',
        description: 'Persisted description',
        startDateTime: '2026-04-21T14:00:00.000Z',
        endDateTime: '2026-04-21T14:30:00.000Z',
        duration: 30,
        status: 'incomplete',
        locked: false,
        editing: false,
        confirmingDelete: false,
        category: 'work/deep',
        ...overrides
    };
}

describe('scheduled edit sync integration', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-21T10:00:00-04:00'));
        document.body.innerHTML = '<div id="scheduled-task-list"></div>';
        updateTaskState([]);
    });

    afterEach(() => {
        updateTaskState([]);
        document.body.innerHTML = '';
        jest.useRealTimers();
    });

    test('preserves the open draft, focus, and caret when pulled sync data refreshes the UI', async () => {
        updateTaskState([createScheduledTask({ editing: true })]);

        const callbacks = {};
        const initializeEventListeners = jest.fn();
        let globalCallbacks = renderTasks(
            getTaskState(),
            callbacks,
            initializeEventListeners,
            null
        );

        const descriptionInput = document.querySelector(
            '#edit-task-scheduled-editing-task input[name="description"]'
        );
        descriptionInput.value = 'Unsaved scheduled draft';
        descriptionInput.focus();
        descriptionInput.setSelectionRange(8, 17, 'forward');

        let notifySyncDataChange;
        let resolveRefresh;
        const refreshFinished = new Promise((resolve) => {
            resolveRefresh = resolve;
        });
        const refreshUI = jest.fn(() => {
            globalCallbacks = renderTasks(
                getTaskState(),
                callbacks,
                initializeEventListeners,
                globalCallbacks
            );
            resolveRefresh();
        });
        const lifecycle = createRoomSessionLifecycle({
            loadAppState: jest.fn(async () => {
                updateTaskStateFromStorage([
                    createScheduledTask({ description: 'Description from another client' })
                ]);
            }),
            refreshUI,
            getActivitiesEnabled: jest.fn(() => false),
            syncRestoredRunningTimer: jest.fn(),
            syncRunningTimerDisplay: jest.fn(),
            getTaskState,
            refreshActiveTaskColor: jest.fn(),
            refreshCurrentGapHighlight: jest.fn(),
            refreshStartTimeField: jest.fn(),
            getRunningActivity: jest.fn(() => null),
            stopTimerAt: jest.fn(async () => ({ success: true })),
            deleteCompletedUnscheduledTasks: jest.fn(async () => ({
                success: true,
                tasksDeleted: 0
            })),
            rolloverPriorDayScheduledTasks: jest.fn(async () => ({
                success: true,
                tasksMoved: 0
            })),
            showToast: jest.fn(),
            onSyncStatusChange: jest.fn(() => jest.fn()),
            onSyncDataChange: jest.fn((callback) => {
                notifySyncDataChange = callback;
                return jest.fn();
            }),
            updateSyncStatusUI: jest.fn(),
            triggerSync: jest.fn(async () => {}),
            logger: { error: jest.fn() }
        });

        const abortController = new AbortController();
        lifecycle.start({ signal: abortController.signal });
        notifySyncDataChange();
        await refreshFinished;

        const refreshedInput = document.querySelector(
            '#edit-task-scheduled-editing-task input[name="description"]'
        );
        expect(getTaskState()[0]).toEqual(
            expect.objectContaining({
                description: 'Description from another client',
                editing: true
            })
        );
        expect(refreshedInput.value).toBe('Unsaved scheduled draft');
        expect(document.activeElement).toBe(refreshedInput);
        expect(refreshedInput.selectionStart).toBe(8);
        expect(refreshedInput.selectionEnd).toBe(17);
        expect(refreshedInput.selectionDirection).toBe('forward');

        lifecycle.stop();
        abortController.abort();
    });
});

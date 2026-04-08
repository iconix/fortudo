import { refreshUI } from './dom-renderer.js';
import { addActivity, createActivityFromTask } from './activities/manager.js';
import { consumeActivitySmokeFailure } from './activities/smoke-hooks.js';
import { isActivitiesEnabled } from './settings-manager.js';
import { triggerConfettiAnimation } from './tasks/scheduled-renderer.js';
import { showToast } from './toast-manager.js';
import { logger } from './utils.js';

function refreshWhenPresent(value) {
    if (!value) {
        return false;
    }

    refreshUI();
    return true;
}

function refreshForClearEvent() {
    refreshUI();
}

/**
 * Semantic post-mutation coordinator boundary for task state changes.
 * Handlers should report successful mutations through specific event types:
 * - onTaskCreated({ task })
 * - onTaskEdited({ task })
 * - onTaskScheduled({ task })
 * - onTaskUnscheduled({ task })
 * - onTaskCompleted({ task })
 * - onTaskDeleted({ task })
 * - onActivityCreated({ activity })
 * - onActivityEdited({ activity })
 * - onActivityDeleted({ activity })
 * - onScheduledTasksCleared()
 * - onCompletedTasksCleared()
 * - onAllTasksCleared()
 */
export function onTaskCreated({ task }) {
    refreshWhenPresent(task);
}

export function onTaskEdited({ task }) {
    refreshWhenPresent(task);
}

export function onTaskScheduled({ task }) {
    refreshWhenPresent(task);
}

export function onTaskUnscheduled({ task }) {
    refreshWhenPresent(task);
}

export function onTaskCompleted({ task }) {
    if (!refreshWhenPresent(task)) {
        return;
    }
    if (task.type !== 'scheduled') {
        return;
    }

    triggerConfettiAnimation(task.id);

    if (isActivitiesEnabled()) {
        const activity = createActivityFromTask(task);
        if (activity) {
            const autoLogPromise = consumeActivitySmokeFailure('auto-log')
                ? Promise.reject(new Error('Smoke forced activity auto-log failure.'))
                : addActivity(activity);

            void autoLogPromise
                .then((result) => {
                    if (result?.success && result.activity) {
                        onActivityCreated({ activity: result.activity });
                    }
                })
                .catch((error) => {
                    logger.error('Failed to auto-log completed task as activity:', error);
                    showToast('Task completed, but activity auto-log failed.', {
                        theme: 'amber'
                    });
                });
        }
    }
}

export function onTaskDeleted({ task }) {
    refreshWhenPresent(task);
}

export function onActivityCreated({ activity }) {
    refreshWhenPresent(activity);
}

export function onActivityEdited({ activity }) {
    refreshWhenPresent(activity);
}

export function onActivityDeleted({ activity }) {
    refreshWhenPresent(activity);
}

export function onScheduledTasksCleared() {
    refreshForClearEvent();
}

export function onCompletedTasksCleared() {
    refreshForClearEvent();
}

export function onAllTasksCleared() {
    refreshForClearEvent();
}

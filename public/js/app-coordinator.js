import { refreshUI } from './dom-renderer.js';
import {
    addActivity,
    createActivityFromTask,
    getRunningActivity,
    stopTimerAt
} from './activities/manager.js';
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

function toMs(dateTime) {
    const value = new Date(dateTime).getTime();
    return Number.isNaN(value) ? null : value;
}

function rangesOverlap(startA, endA, startB, endB) {
    const aStart = toMs(startA);
    const aEnd = toMs(endA);
    const bStart = toMs(startB);
    const bEnd = toMs(endB);

    if ([aStart, aEnd, bStart, bEnd].some((value) => value === null)) {
        return false;
    }

    return aStart < bEnd && bStart < aEnd;
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
                .then(async (result) => {
                    if (result?.success && result.activity) {
                        const runningActivity = getRunningActivity();
                        if (
                            runningActivity &&
                            rangesOverlap(
                                runningActivity.startDateTime,
                                new Date().toISOString(),
                                result.activity.startDateTime,
                                result.activity.endDateTime
                            )
                        ) {
                            const stopResult = await stopTimerAt(result.activity.startDateTime);
                            if (stopResult?.success && stopResult.activity) {
                                onActivityCreated({ activity: stopResult.activity });
                            }
                        }
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

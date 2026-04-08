import { refreshUI } from './dom-renderer.js';
import { addActivity, createActivityFromTask } from './activities/manager.js';
import { isActivitiesEnabled } from './settings-manager.js';
import { triggerConfettiAnimation } from './tasks/scheduled-renderer.js';
import { logger } from './utils.js';

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
    if (!task) {
        return;
    }
    refreshUI();
}

export function onTaskEdited({ task }) {
    if (!task) {
        return;
    }
    refreshUI();
}

export function onTaskScheduled({ task }) {
    if (!task) {
        return;
    }
    refreshUI();
}

export function onTaskUnscheduled({ task }) {
    if (!task) {
        return;
    }
    refreshUI();
}

export function onTaskCompleted({ task }) {
    if (!task) {
        return;
    }
    refreshUI();
    if (task.type !== 'scheduled') {
        return;
    }

    triggerConfettiAnimation(task.id);

    if (isActivitiesEnabled()) {
        const activity = createActivityFromTask(task);
        if (activity) {
            void addActivity(activity).catch((error) => {
                logger.error('Failed to auto-log completed task as activity:', error);
            });
        }
    }
}

export function onTaskDeleted({ task }) {
    if (!task) {
        return;
    }
    refreshUI();
}

export function onActivityCreated({ activity }) {
    if (!activity) {
        return;
    }
    refreshUI();
}

export function onActivityEdited({ activity }) {
    if (!activity) {
        return;
    }
    refreshUI();
}

export function onActivityDeleted({ activity }) {
    if (!activity) {
        return;
    }
    refreshUI();
}

export function onScheduledTasksCleared() {
    refreshUI();
}

export function onCompletedTasksCleared() {
    refreshUI();
}

export function onAllTasksCleared() {
    refreshUI();
}

import { refreshUI } from './dom-renderer.js';
import { triggerConfettiAnimation } from './tasks/scheduled-renderer.js';

/**
 * Semantic post-mutation coordinator boundary for task state changes.
 * Handlers should report successful mutations through specific event types:
 * - onTaskCreated({ task })
 * - onTaskEdited({ task })
 * - onTaskScheduled({ task })
 * - onTaskUnscheduled({ task })
 * - onTaskCompleted({ task })
 * - onTaskDeleted({ task })
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
    if (task.type === 'scheduled') {
        triggerConfettiAnimation(task.id);
    }
}

export function onTaskDeleted({ task }) {
    if (!task) {
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

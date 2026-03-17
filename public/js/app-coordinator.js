import { refreshUI } from './dom-renderer.js';
import { triggerConfettiAnimation } from './tasks/scheduled-renderer.js';

/**
 * Semantic post-mutation coordinator boundary for task state changes.
 * Single-task mutations should route through one of:
 * - onTaskAdded(task)
 * - onTaskUpdated(task)
 * - onTaskDeleted(taskId)
 * - onTaskCompleted(task)
 * Batch clears should route through:
 * - onTasksCleared(scope)
 */
export function onTaskCompleted(task) {
    refreshUI();
    if (task?.type === 'scheduled') {
        triggerConfettiAnimation(task.id);
    }
}

export function onTaskAdded(task) {
    refreshUI();
    void task;
}

export function onTaskUpdated(task) {
    void task;
    refreshUI();
}

export function onTaskDeleted(taskId) {
    void taskId;
    refreshUI();
}

export function onTasksCleared(scope) {
    void scope;
    refreshUI();
}

export function onDayChanged() {
    // Placeholder for future day-change coordination.
}

import { refreshUI } from './dom-renderer.js';
import { triggerConfettiAnimation } from './tasks/scheduled-renderer.js';

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

export function onDayChanged() {
    // Placeholder for future day-change coordination.
}

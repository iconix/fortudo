import { refreshUI, updateStartTimeField } from './dom-renderer.js';
import { triggerConfettiAnimation } from './tasks/scheduled-renderer.js';
import { getSuggestedStartTime } from './tasks/manager.js';

function refreshStartTimeSuggestion() {
    updateStartTimeField(getSuggestedStartTime(), true);
}

export function onTaskCompleted(task) {
    refreshUI();
    if (task?.type === 'scheduled') {
        triggerConfettiAnimation(task.id);
        refreshStartTimeSuggestion();
    }
}

export function onTaskAdded(task) {
    refreshUI();
    if (task?.type === 'scheduled') {
        refreshStartTimeSuggestion();
    }
}

export function onTaskUpdated(task) {
    void task;
    refreshUI();
    refreshStartTimeSuggestion();
}

export function onTaskDeleted(taskId) {
    void taskId;
    refreshUI();
    refreshStartTimeSuggestion();
}

export function onDayChanged() {
    // Placeholder for future day-change coordination.
}

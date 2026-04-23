import {
    handleActivityAwareFormSubmit,
    handleActivityListClick,
    handleActivityListSubmit,
    handleActivityListKeydown,
    handleActivityListInput,
    refreshTodayActivitySummary
} from './ui-handlers.js';
import { initializeTimerUI, syncTimerFormState } from './timer-ui.js';
import { getRunningActivity } from './manager.js';

export function createActivityAppCallbacks({
    getActivitiesEnabled,
    refreshUI,
    resetAllConfirmingDeleteFlags,
    handleTaskSubmit,
    focusTaskDescriptionInput,
    resetTaskFormPreviewState,
    initializeTaskTypeToggle
}) {
    return {
        onTaskFormSubmit: async (formElement) => {
            await handleActivityAwareFormSubmit(formElement, {
                activitiesEnabled: getActivitiesEnabled(),
                resetTaskFormPreviewState,
                initializeTaskTypeToggle,
                focusTaskDescriptionInput,
                handleTaskSubmit
            });
        },
        onGlobalClick: (event) => {
            handleActivityListClick(event.target, {
                refreshUI,
                resetAllConfirmingDeleteFlags
            });
        }
    };
}

export function initializeActivityUi({
    signal,
    refreshUI,
    refreshTaskDisplays,
    getActivitiesEnabled
}) {
    initializeTimerUI({
        refreshUI: refreshTaskDisplays,
        refreshActivitySummary: () => refreshTodayActivitySummary(getActivitiesEnabled())
    });

    const activityListElement = document.getElementById('activity-list');
    if (!activityListElement) {
        return;
    }

    activityListElement.addEventListener(
        'submit',
        (event) => {
            handleActivityListSubmit(event, {
                refreshUI
            });
        },
        { signal }
    );
    activityListElement.addEventListener(
        'keydown',
        (event) => {
            handleActivityListKeydown(event, {
                refreshUI
            });
        },
        { signal }
    );
    activityListElement.addEventListener('input', handleActivityListInput, { signal });
}

export function syncRestoredRunningTimer(activitiesEnabled) {
    if (!activitiesEnabled) {
        return;
    }

    const runningActivity = getRunningActivity();
    if (runningActivity) {
        const activityRadio = document.getElementById('activity');
        if (activityRadio instanceof HTMLInputElement && !activityRadio.checked) {
            activityRadio.checked = true;
            activityRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    syncTimerFormState();
}

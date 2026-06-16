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
import {
    expandInsightsActivityLogLimit,
    setInsightsSelectedDate,
    setSelectedTimelineBlock,
    setInsightsTrendDateRange
} from './insights-renderer.js';

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

function initializeActivityListEventHandlers(activityListElement, { signal, refreshUI }) {
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

function initializeInsightsTrendEventHandlers(trendsElement, { signal, renderInsights }) {
    if (!trendsElement) {
        return;
    }

    trendsElement.addEventListener(
        'click',
        (event) => {
            const dayButton = event.target.closest('[data-trend-day]');
            if (!dayButton) {
                return;
            }

            setInsightsSelectedDate(dayButton.dataset.trendDay);
            renderInsights();
        },
        { signal }
    );

    trendsElement.addEventListener(
        'change',
        (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) {
                return;
            }

            if (!target.matches('[data-trend-start-date], [data-trend-end-date]')) {
                return;
            }

            const startDate = trendsElement.querySelector('[data-trend-start-date]')?.value || '';
            const endDate = trendsElement.querySelector('[data-trend-end-date]')?.value || '';

            setInsightsTrendDateRange({ startDate, endDate });
            renderInsights();
        },
        { signal }
    );
}

function initializeInsightsActivityListEventHandlers(listElement, { signal, renderInsights }) {
    if (!listElement) {
        return;
    }

    listElement.addEventListener(
        'click',
        (event) => {
            const showMoreButton = event.target.closest('[data-show-more-activities]');
            if (!showMoreButton) {
                return;
            }

            expandInsightsActivityLogLimit(50);
            renderInsights();
        },
        { signal }
    );
}

function initializeInsightsTimelineEventHandlers(timelineElement, { signal, renderInsights }) {
    if (!timelineElement) {
        return;
    }

    timelineElement.addEventListener(
        'click',
        (event) => {
            const block = event.target.closest('[data-timeline-block-id]');
            if (!block) {
                return;
            }

            setSelectedTimelineBlock(block.dataset.timelineBlockId);
            renderInsights();
        },
        { signal }
    );
}

export function initializeActivityUi({
    signal,
    refreshUI,
    refreshTaskDisplays,
    getActivitiesEnabled,
    renderInsights = () => {}
}) {
    initializeTimerUI({
        refreshUI: refreshTaskDisplays,
        refreshActivitySummary: () => refreshTodayActivitySummary(getActivitiesEnabled())
    });

    initializeActivityListEventHandlers(document.getElementById('activity-list'), {
        signal,
        refreshUI
    });
    initializeActivityListEventHandlers(document.getElementById('insights-activity-list'), {
        signal,
        refreshUI
    });
    initializeInsightsTrendEventHandlers(document.getElementById('insights-trends'), {
        signal,
        renderInsights
    });
    initializeInsightsTimelineEventHandlers(document.getElementById('insights-timeline'), {
        signal,
        renderInsights
    });
    initializeInsightsActivityListEventHandlers(document.getElementById('insights-activity-list'), {
        signal,
        renderInsights
    });
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

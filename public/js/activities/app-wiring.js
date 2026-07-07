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

function runWithPreservedWindowScroll(callback) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    callback();

    const restoreScroll = () => {
        window.scrollTo(scrollX, scrollY);
    };

    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreScroll);
    } else {
        window.setTimeout(restoreScroll, 0);
    }
}

function getRefreshUiForClickTarget(target, refreshUI) {
    if (target?.closest?.('#insights-view')) {
        return () => runWithPreservedWindowScroll(refreshUI);
    }

    return refreshUI;
}

/**
 * Create app-level callbacks that bridge generic task UI events to Activities behavior.
 * @param {Object} options
 * @param {Function} options.getActivitiesEnabled
 * @param {Function} options.refreshUI
 * @param {Function} options.resetAllConfirmingDeleteFlags
 * @param {Function} options.handleTaskSubmit
 * @param {Function} options.focusTaskDescriptionInput
 * @param {Function} options.resetTaskFormPreviewState
 * @param {Function} options.initializeTaskTypeToggle
 * @returns {{ onTaskFormSubmit: Function, onGlobalClick: Function }}
 */
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
                refreshUI: getRefreshUiForClickTarget(event.target, refreshUI),
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
            const rangeButton = event.target.closest(
                '[data-trend-range-start][data-trend-range-end]'
            );
            if (rangeButton) {
                setInsightsTrendDateRange({
                    startDate: rangeButton.dataset.trendRangeStart,
                    endDate: rangeButton.dataset.trendRangeEnd
                });
                renderInsights();
                return;
            }

            const dayButton = event.target.closest('[data-trend-day]');
            if (!dayButton) {
                return;
            }

            setInsightsSelectedDate(dayButton.dataset.trendDay);
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

/**
 * Initialize Activities event handlers and timer UI for the current app lifecycle.
 * @param {Object} options
 * @param {AbortSignal} options.signal
 * @param {Function} options.refreshUI
 * @param {Function} options.refreshTaskDisplays
 * @param {Function} options.getActivitiesEnabled
 * @param {Function} [options.renderInsights]
 */
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

/**
 * Sync form mode and timer fields after loading a persisted running timer.
 * @param {boolean} activitiesEnabled
 */
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

/**
 * Refresh the timer display when the running timer may have changed.
 * @param {boolean} activitiesEnabled
 */
export function syncRunningTimerDisplay(activitiesEnabled) {
    if (!activitiesEnabled) {
        return;
    }

    syncTimerFormState();
}

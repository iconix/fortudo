import { extractDateFromDateTime } from '../utils.js';
import { resolveCategoryKey, resolveCategoryReference } from '../taxonomy/taxonomy-selectors.js';
import { detectActivityDataIssues } from './insights-issues.js';
import {
    getClippedDurationInterval,
    getDateRangeInterval,
    getDayInterval,
    getDurationCapableInterval,
    getIntervalDuration,
    getOverlapDuration,
    intervalsOverlap,
    invalidActivityTouchesInterval,
    itemOverlapsInterval
} from './insights-intervals.js';

const MINUTES_PER_DAY = 24 * 60;

/**
 * Builds the activity insights selector model for the selected day and log range.
 * @param {Object} options - Selector inputs.
 * @param {Array<Object>} [options.tasks=[]] - Scheduled and unscheduled tasks.
 * @param {Array<Object>} [options.activities=[]] - Activity records.
 * @param {Object|null} [options.runningActivity=null] - In-progress activity for today.
 * @param {Date} [options.now=new Date()] - Current date/time.
 * @param {{startDate: string, endDate: string}} [options.activityLogDateRange] - Log range.
 * @returns {Object} Insights model.
 */
export function buildInsightsModel({
    tasks = [],
    activities = [],
    runningActivity = null,
    now = new Date(),
    selectedDate = null,
    activityLogDateRange = null
} = {}) {
    const today = extractDateFromDateTime(now);
    const detailDate = selectedDate || today;
    const detailInterval = getDayInterval(detailDate);
    const selectedLogRange = activityLogDateRange || { startDate: detailDate, endDate: detailDate };
    const detailTasks = tasks.filter((task) => isScheduledOnDate(task, detailInterval));
    const normalizedRunningActivity = normalizeRunningActivity(runningActivity, detailDate, now);
    const detailActivities = [
        ...activities.filter((activityItem) => isActivityOnDate(activityItem, detailInterval)),
        ...(normalizedRunningActivity ? [normalizedRunningActivity] : [])
    ];
    const selectedLogActivities = activities
        .filter(isCompletedActivity)
        .filter((activityItem) => isActivityVisibleInLogRange(activityItem, selectedLogRange))
        .sort(compareNewestFirst);

    return {
        date: detailDate,
        activityLogDateRange: selectedLogRange,
        summary: {
            totalPlannedMinutes: detailTasks.reduce(
                (total, task) => total + getOverlapDuration(task, detailInterval, now),
                0
            ),
            totalActualMinutes: detailActivities.reduce(
                (total, activityItem) =>
                    total + getOverlapDuration(activityItem, detailInterval, now),
                0
            ),
            completedTaskCount: detailTasks.filter((task) => task.status === 'completed').length,
            currentlyLateTaskCount: detailTasks.filter((task) => isCurrentlyLate(task, now)).length
        },
        plannedBlocks: detailTasks.map((task) => buildTimelineBlock(task, detailInterval, now)),
        actualBlocks: detailActivities.map((activityItem) =>
            buildTimelineBlock(activityItem, detailInterval, now)
        ),
        activityLog: selectedLogActivities,
        issues: detectActivityDataIssues(detailActivities),
        activityLogIssues: detectActivityDataIssues(selectedLogActivities)
    };
}

export { detectActivityDataIssues } from './insights-issues.js';
export { buildTrendModel, getDefaultTrendDateRange } from './insights-trends.js';

function buildTimelineBlock(item, visibleInterval, now) {
    const clippedInterval = getClippedDurationInterval(item, visibleInterval, now);
    const startDate = clippedInterval?.start || new Date(item.startDateTime);
    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const duration = clippedInterval
        ? getIntervalDuration(clippedInterval)
        : getActivityDuration(item, now);

    return {
        ...item,
        startDateTime: clippedInterval ? clippedInterval.start.toISOString() : item.startDateTime,
        endDateTime: clippedInterval ? clippedInterval.end.toISOString() : item.endDateTime,
        duration,
        categoryMeta: getCategoryMeta(item),
        leftPercent: (startMinutes / MINUTES_PER_DAY) * 100,
        widthPercent: (duration / MINUTES_PER_DAY) * 100,
        source: item.source,
        sourceTaskId: item.sourceTaskId
    };
}

function normalizeRunningActivity(runningActivity, today, now) {
    if (!runningActivity?.startDateTime) {
        return null;
    }

    const todayInterval = getDayInterval(today);
    const runningInterval = getDurationCapableInterval(
        { ...runningActivity, endDateTime: now.toISOString() },
        now
    );

    if (!runningInterval || !intervalsOverlap(runningInterval, todayInterval)) {
        return null;
    }

    const duration = getOverlapDuration(runningActivity, todayInterval, now);

    return {
        ...runningActivity,
        docType: 'activity',
        endDateTime: now.toISOString(),
        duration
    };
}

function getCategoryMeta(item) {
    const resolved =
        typeof resolveCategoryReference === 'function'
            ? resolveCategoryReference(item)
            : item.category
              ? resolveCategoryKey(item.category)
              : null;

    if (!resolved) {
        return {
            key: 'uncategorized',
            label: 'Uncategorized',
            color: '#64748b'
        };
    }

    if (!resolved.record) {
        return {
            key: `unknown-category:${item.categoryId || item.category || 'missing'}`,
            label: 'Unknown category',
            color: '#64748b',
            isIntegrityIssue: true
        };
    }

    return {
        key: resolved.record.id || resolved.record.key,
        label: resolved.record.label,
        color: resolved.record.color,
        isIntegrityIssue: Boolean(resolved.integrityIssue)
    };
}

function isScheduledOnDate(task, dayInterval) {
    return task.type === 'scheduled' && itemOverlapsInterval(task, dayInterval);
}

function isActivityOnDate(activityItem, dayInterval) {
    return activityItem.docType === 'activity' && itemOverlapsInterval(activityItem, dayInterval);
}

function isActivityVisibleInLogRange(activityItem, dateRange) {
    const rangeInterval = getDateRangeInterval(dateRange);

    return (
        itemOverlapsInterval(activityItem, rangeInterval) ||
        invalidActivityTouchesInterval(activityItem, rangeInterval)
    );
}

function isCompletedActivity(activityItem) {
    return activityItem.docType === 'activity' && Boolean(activityItem.endDateTime);
}

function isCurrentlyLate(task, now) {
    return task.status !== 'completed' && task.endDateTime && new Date(task.endDateTime) < now;
}

function getDuration(item) {
    return Number(item.duration) || 0;
}

function getActivityDuration(activityItem, now) {
    if (activityItem.endDateTime) {
        return getDuration(activityItem);
    }

    const startDate = new Date(activityItem.startDateTime);
    return Math.max(0, Math.round((now.getTime() - startDate.getTime()) / 60000));
}

function compareNewestFirst(left, right) {
    const endTimeDifference = new Date(right.endDateTime) - new Date(left.endDateTime);

    if (endTimeDifference !== 0) {
        return endTimeDifference;
    }

    return new Date(right.startDateTime) - new Date(left.startDateTime);
}

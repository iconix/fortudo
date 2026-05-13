import { extractDateFromDateTime } from '../utils.js';
import { getGroupByKey, resolveCategoryKey } from '../taxonomy/taxonomy-selectors.js';

const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_TREND_DAYS = 14;

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
    activityLogDateRange = null
} = {}) {
    const today = extractDateFromDateTime(now);
    const todayInterval = getDayInterval(today);
    const selectedLogRange = activityLogDateRange || { startDate: today, endDate: today };
    const todayTasks = tasks.filter((task) => isScheduledOnDate(task, todayInterval));
    const normalizedRunningActivity = normalizeRunningActivity(runningActivity, today, now);
    const todayActivities = [
        ...activities.filter((activityItem) => isActivityOnDate(activityItem, todayInterval)),
        ...(normalizedRunningActivity ? [normalizedRunningActivity] : [])
    ];
    const selectedLogActivities = activities
        .filter(isCompletedActivity)
        .filter((activityItem) => isActivityVisibleInLogRange(activityItem, selectedLogRange))
        .sort(compareNewestFirst);

    return {
        date: today,
        activityLogDateRange: selectedLogRange,
        summary: {
            totalPlannedMinutes: todayTasks.reduce(
                (total, task) => total + getOverlapDuration(task, todayInterval, now),
                0
            ),
            totalActualMinutes: todayActivities.reduce(
                (total, activityItem) =>
                    total + getOverlapDuration(activityItem, todayInterval, now),
                0
            ),
            completedTaskCount: todayTasks.filter((task) => task.status === 'completed').length,
            currentlyLateTaskCount: todayTasks.filter((task) => isCurrentlyLate(task, now)).length
        },
        plannedBlocks: todayTasks.map((task) => buildTimelineBlock(task, todayInterval, now)),
        actualBlocks: todayActivities.map((activityItem) =>
            buildTimelineBlock(activityItem, todayInterval, now)
        ),
        activityLog: selectedLogActivities,
        issues: detectActivityDataIssues(todayActivities),
        activityLogIssues: detectActivityDataIssues(selectedLogActivities)
    };
}

/**
 * Detects activity data issues that can affect insights and historical reporting.
 * @param {Array<Object>} activities - Activity records.
 * @returns {Array<Object>} Issue records.
 */
export function detectActivityDataIssues(activities = []) {
    const issues = [];
    const sortedActivities = [...activities].sort(compareOldestFirst);
    const seenSourceTaskIds = new Map();
    let previousValidActivity = null;

    for (const activityItem of sortedActivities) {
        const startDate = new Date(activityItem.startDateTime);
        const endDate = new Date(activityItem.endDateTime);
        const hasValidRange =
            isFinite(startDate.getTime()) && isFinite(endDate.getTime()) && endDate > startDate;

        if (!hasValidRange) {
            issues.push({
                type: 'invalid-range',
                activityId: activityItem.id
            });
        } else {
            if (previousValidActivity && startDate < new Date(previousValidActivity.endDateTime)) {
                issues.push({
                    type: 'overlap',
                    activityId: activityItem.id,
                    overlappingActivityId: previousValidActivity.id
                });
            }

            if (!previousValidActivity || endDate > new Date(previousValidActivity.endDateTime)) {
                previousValidActivity = activityItem;
            }
        }

        if (activityItem.sourceTaskId && activityItem.source !== 'manual') {
            if (seenSourceTaskIds.has(activityItem.sourceTaskId)) {
                issues.push({
                    type: 'duplicate-auto',
                    activityId: activityItem.id,
                    duplicateActivityId: seenSourceTaskIds.get(activityItem.sourceTaskId),
                    sourceTaskId: activityItem.sourceTaskId
                });
            } else {
                seenSourceTaskIds.set(activityItem.sourceTaskId, activityItem.id);
            }
        }
    }

    return issues;
}

/**
 * Builds daily activity trend buckets and parent-group category totals.
 * @param {Object} options - Selector inputs.
 * @param {Array<Object>} [options.activities=[]] - Activity records.
 * @param {Date} [options.now=new Date()] - Current date/time.
 * @param {number} [options.days=14] - Number of local days to include.
 * @param {{startDate: string, endDate: string}} [options.dateRange] - Optional range override.
 * @returns {Object} Trend model.
 */
export function buildTrendModel({
    activities = [],
    now = new Date(),
    days = DEFAULT_TREND_DAYS,
    dateRange = null
} = {}) {
    const selectedDateRange = dateRange || getDefaultTrendDateRange(now, days);
    const dailyBuckets = buildDailyBuckets(selectedDateRange);
    const categoryTotals = new Map();

    for (const activityItem of activities.filter(isCompletedActivity)) {
        const activityInterval = getItemInterval(activityItem);

        if (
            !activityInterval ||
            !intervalsOverlap(activityInterval, getDateRangeInterval(selectedDateRange))
        ) {
            continue;
        }

        const categoryMeta = getParentGroupMeta(activityItem.category);

        for (const dailyBucket of dailyBuckets.values()) {
            const bucketInterval = getDayInterval(dailyBucket.date);
            const duration = getOverlapDuration(activityItem, bucketInterval, now);

            if (duration <= 0) {
                continue;
            }

            addCategoryMinutes(dailyBucket.categorySegments, categoryMeta, duration);
            addCategoryMinutes(categoryTotals, categoryMeta, duration);
            dailyBucket.minutes += duration;
        }
    }

    return {
        dateRange: selectedDateRange,
        dailyHours: [...dailyBuckets.values()].map((bucket) => ({
            ...bucket,
            categorySegments: sortCategoryEntries(bucket.categorySegments)
        })),
        categoryTotals: sortCategoryEntries(categoryTotals)
    };
}

/**
 * Gets the default trend range for the last N local days ending at now.
 * @param {Date} [today=new Date()] - Current date/time.
 * @param {number} [days=14] - Number of local days to include.
 * @returns {{startDate: string, endDate: string}} Date range.
 */
export function getDefaultTrendDateRange(today = new Date(), days = DEFAULT_TREND_DAYS) {
    const endDate = new Date(today.getTime());
    const startDate = new Date(today.getTime());
    startDate.setDate(startDate.getDate() - days + 1);

    return {
        startDate: extractDateFromDateTime(startDate),
        endDate: extractDateFromDateTime(endDate)
    };
}

function buildDailyBuckets(dateRange) {
    const buckets = new Map();
    const cursor = parseLocalDate(dateRange.startDate);
    const endDate = parseLocalDate(dateRange.endDate);

    while (cursor <= endDate) {
        const date = extractDateFromDateTime(cursor);
        buckets.set(date, {
            date,
            minutes: 0,
            categorySegments: new Map()
        });
        cursor.setDate(cursor.getDate() + 1);
    }

    return buckets;
}

function buildTimelineBlock(item, visibleInterval, now) {
    const clippedInterval = getClippedInterval(item, visibleInterval, now);
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
        categoryMeta: getCategoryMeta(item.category),
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
    const runningInterval = getItemInterval(
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

function getCategoryMeta(categoryKey) {
    const resolved = categoryKey ? resolveCategoryKey(categoryKey) : null;

    if (!resolved) {
        return {
            key: 'uncategorized',
            label: 'Uncategorized',
            color: '#64748b'
        };
    }

    return {
        key: resolved.record.key,
        label: resolved.record.label,
        color: resolved.record.color
    };
}

function getParentGroupMeta(categoryKey) {
    const resolved = categoryKey ? resolveCategoryKey(categoryKey) : null;

    if (!resolved) {
        return {
            key: 'uncategorized',
            label: 'Uncategorized',
            color: '#64748b'
        };
    }

    if (resolved.kind === 'group') {
        return {
            key: resolved.record.key,
            label: resolved.record.label,
            color: resolved.record.color
        };
    }

    const parentGroup = getGroupByKey(resolved.record.groupKey);

    if (parentGroup) {
        return {
            key: parentGroup.key,
            label: parentGroup.label,
            color: parentGroup.color
        };
    }

    return {
        key: resolved.record.groupKey,
        label: titleizeKey(resolved.record.groupKey),
        color: resolved.record.color
    };
}

function addCategoryMinutes(categoryMap, categoryMeta, minutes) {
    const existing = categoryMap.get(categoryMeta.key);

    if (existing) {
        existing.minutes += minutes;
        return;
    }

    categoryMap.set(categoryMeta.key, {
        ...categoryMeta,
        minutes
    });
}

function sortCategoryEntries(categoryMap) {
    return [...categoryMap.values()].sort(
        (left, right) => right.minutes - left.minutes || left.label.localeCompare(right.label)
    );
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

function compareOldestFirst(left, right) {
    return new Date(left.startDateTime) - new Date(right.startDateTime);
}

function compareNewestFirst(left, right) {
    const endTimeDifference = new Date(right.endDateTime) - new Date(left.endDateTime);

    if (endTimeDifference !== 0) {
        return endTimeDifference;
    }

    return new Date(right.startDateTime) - new Date(left.startDateTime);
}

function parseLocalDate(date) {
    return new Date(`${date}T00:00:00`);
}

function getDayInterval(date) {
    const start = parseLocalDate(date);
    const end = new Date(start.getTime());
    end.setDate(end.getDate() + 1);
    return { start, end };
}

function getDateRangeInterval(dateRange) {
    return {
        start: parseLocalDate(dateRange.startDate),
        end: getDayInterval(dateRange.endDate).end
    };
}

function getItemInterval(item, now = new Date()) {
    const start = new Date(item.startDateTime);
    const end = item.endDateTime ? new Date(item.endDateTime) : now;

    if (!isFinite(start.getTime()) || !isFinite(end.getTime()) || end <= start) {
        return null;
    }

    return { start, end };
}

function intervalsOverlap(left, right) {
    return left.start < right.end && left.end > right.start;
}

function getClippedInterval(item, visibleInterval, now = new Date()) {
    const itemInterval = getItemInterval(item, now);

    if (!itemInterval || !intervalsOverlap(itemInterval, visibleInterval)) {
        return null;
    }

    return {
        start: new Date(Math.max(itemInterval.start.getTime(), visibleInterval.start.getTime())),
        end: new Date(Math.min(itemInterval.end.getTime(), visibleInterval.end.getTime()))
    };
}

function itemOverlapsInterval(item, visibleInterval, now = new Date()) {
    const itemInterval = getItemInterval(item, now);
    return Boolean(itemInterval && intervalsOverlap(itemInterval, visibleInterval));
}

function invalidActivityTouchesInterval(item, visibleInterval) {
    const start = new Date(item.startDateTime);
    const end = new Date(item.endDateTime);

    if (!isFinite(start.getTime()) || !isFinite(end.getTime()) || end > start) {
        return false;
    }

    return (
        isPointWithinInterval(start, visibleInterval) || isPointWithinInterval(end, visibleInterval)
    );
}

function isPointWithinInterval(point, visibleInterval) {
    return point >= visibleInterval.start && point < visibleInterval.end;
}

function getIntervalDuration(interval) {
    return Math.max(0, Math.round((interval.end.getTime() - interval.start.getTime()) / 60000));
}

function getOverlapDuration(item, visibleInterval, now = new Date()) {
    const clippedInterval = getClippedInterval(item, visibleInterval, now);
    return clippedInterval ? getIntervalDuration(clippedInterval) : 0;
}

function titleizeKey(key) {
    return key
        .split(/[/-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

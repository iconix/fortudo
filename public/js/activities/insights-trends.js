import {
    getGroupById,
    getGroupByKey,
    resolveCategoryKey,
    resolveCategoryReference
} from '../taxonomy/taxonomy-selectors.js';
import { extractDateFromDateTime } from '../utils.js';
import { detectActivityDataIssues } from './insights-issues.js';
import {
    getDateRangeInterval,
    getDayInterval,
    getDurationCapableInterval,
    getLastLocalDaysDateRange,
    invalidActivityTouchesInterval,
    getOverlapDurationMilliseconds,
    intervalsOverlap,
    parseLocalDate
} from './insights-intervals.js';
import { roundDurationMilliseconds } from './duration.js';

const DEFAULT_TREND_DAYS = 7;

/**
 * Builds daily activity trend buckets and parent-group category totals.
 * @param {Object} options - Selector inputs.
 * @param {Array<Object>} [options.activities=[]] - Activity records.
 * @param {Date} [options.now=new Date()] - Current date/time.
 * @param {number} [options.days=7] - Number of local days to include.
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
        const activityInterval = getDurationCapableInterval(activityItem);

        if (
            !activityInterval ||
            !intervalsOverlap(activityInterval, getDateRangeInterval(selectedDateRange))
        ) {
            continue;
        }

        const categoryMeta = getParentGroupMeta(activityItem);

        for (const dailyBucket of dailyBuckets.values()) {
            const bucketInterval = getDayInterval(dailyBucket.date);
            const durationMilliseconds = getOverlapDurationMilliseconds(
                activityItem,
                bucketInterval,
                now
            );

            if (durationMilliseconds <= 0) {
                continue;
            }

            addCategoryDuration(dailyBucket.categorySegments, categoryMeta, durationMilliseconds);
            addCategoryDuration(categoryTotals, categoryMeta, durationMilliseconds);
            dailyBucket.durationMilliseconds += durationMilliseconds;
            dailyBucket.activityCount += 1;
        }
    }

    for (const activityItem of activities.filter(isCompletedActivity)) {
        for (const dailyBucket of dailyBuckets.values()) {
            const bucketInterval = getDayInterval(dailyBucket.date);
            const activityInterval = getDurationCapableInterval(activityItem, now);

            if (
                (activityInterval && intervalsOverlap(activityInterval, bucketInterval)) ||
                invalidActivityTouchesInterval(activityItem, bucketInterval)
            ) {
                dailyBucket.issueActivities.push(activityItem);
            }
        }
    }

    return {
        dateRange: selectedDateRange,
        dailyHours: [...dailyBuckets.values()].map(
            ({ categorySegments, issueActivities, durationMilliseconds, ...bucket }) => ({
                ...bucket,
                minutes: roundDurationMilliseconds(durationMilliseconds),
                issueCount: detectActivityDataIssues(issueActivities).length,
                categorySegments: sortCategoryEntries(categorySegments)
            })
        ),
        categoryTotals: sortCategoryEntries(categoryTotals)
    };
}

/**
 * Gets the default trend range for the last N local days ending at now.
 * @param {Date} [today=new Date()] - Current date/time.
 * @param {number} [days=7] - Number of local days to include.
 * @returns {{startDate: string, endDate: string}} Date range.
 */
export function getDefaultTrendDateRange(today = new Date(), days = DEFAULT_TREND_DAYS) {
    return getLastLocalDaysDateRange(today, days);
}

function buildDailyBuckets(dateRange) {
    const buckets = new Map();
    const cursor = parseLocalDate(dateRange.startDate);
    const endDate = parseLocalDate(dateRange.endDate);

    while (cursor <= endDate) {
        const date = extractDateFromDateTime(cursor);
        buckets.set(date, {
            date,
            durationMilliseconds: 0,
            activityCount: 0,
            categorySegments: new Map(),
            issueActivities: []
        });
        cursor.setDate(cursor.getDate() + 1);
    }

    return buckets;
}

function getParentGroupMeta(activityItem) {
    const resolved =
        typeof resolveCategoryReference === 'function'
            ? resolveCategoryReference(activityItem)
            : activityItem.category
              ? resolveCategoryKey(activityItem.category)
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
            key: `unknown-category:${activityItem.categoryId || activityItem.category || 'missing'}`,
            label: 'Unknown category',
            color: '#64748b',
            isIntegrityIssue: true
        };
    }

    if (resolved.kind === 'group') {
        return {
            key: resolved.record.id || resolved.record.key,
            label: resolved.record.label,
            color: resolved.record.color
        };
    }

    const parentGroup =
        (typeof getGroupById === 'function' ? getGroupById(resolved.record.groupId) : null) ||
        getGroupByKey(resolved.record.groupKey);

    if (parentGroup) {
        return {
            key: parentGroup.id || parentGroup.key,
            label: parentGroup.label,
            color: parentGroup.color
        };
    }

    return {
        key: `unknown-category:${resolved.record.id || resolved.record.key}`,
        label: 'Unknown category',
        color: '#64748b',
        isIntegrityIssue: true
    };
}

function addCategoryDuration(categoryMap, categoryMeta, durationMilliseconds) {
    const existing = categoryMap.get(categoryMeta.key);

    if (existing) {
        existing.durationMilliseconds += durationMilliseconds;
        return;
    }

    categoryMap.set(categoryMeta.key, {
        ...categoryMeta,
        durationMilliseconds
    });
}

function sortCategoryEntries(categoryMap) {
    return [...categoryMap.values()]
        .map(({ durationMilliseconds, ...entry }) => ({
            ...entry,
            minutes: roundDurationMilliseconds(durationMilliseconds)
        }))
        .sort(
            (left, right) => right.minutes - left.minutes || left.label.localeCompare(right.label)
        );
}

function isCompletedActivity(activityItem) {
    return activityItem.docType === 'activity' && Boolean(activityItem.endDateTime);
}

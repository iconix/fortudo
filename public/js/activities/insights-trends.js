import { getGroupByKey, resolveCategoryKey } from '../taxonomy/taxonomy-selectors.js';
import { extractDateFromDateTime } from '../utils.js';
import {
    getDateRangeInterval,
    getDayInterval,
    getDurationCapableInterval,
    getLastLocalDaysDateRange,
    getOverlapDuration,
    intervalsOverlap,
    parseLocalDate
} from './insights-intervals.js';

const DEFAULT_TREND_DAYS = 14;

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
        const activityInterval = getDurationCapableInterval(activityItem);

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
            dailyBucket.activityCount += 1;
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
            minutes: 0,
            activityCount: 0,
            categorySegments: new Map()
        });
        cursor.setDate(cursor.getDate() + 1);
    }

    return buckets;
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

function isCompletedActivity(activityItem) {
    return activityItem.docType === 'activity' && Boolean(activityItem.endDateTime);
}

function titleizeKey(key) {
    return key
        .split(/[/-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

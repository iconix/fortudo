import {
    resolveCategoryKey,
    getGroupByKey,
    getCategoryByKey,
    getTaxonomySnapshot
} from '../taxonomy/taxonomy-selectors.js';

function titleCaseKey(value) {
    return String(value)
        .split(/[-_/]+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
}

function buildFallbackParentMetadata(parentKey) {
    return {
        key: parentKey,
        label: titleCaseKey(parentKey),
        color: '#64748b',
        isUncategorized: false
    };
}

function buildResolvedParentMetadata(parentKey) {
    const parentGroup = getGroupByKey(parentKey);
    if (parentGroup) {
        return {
            key: parentGroup.key,
            label: parentGroup.label,
            color: parentGroup.color,
            isUncategorized: false
        };
    }

    return buildFallbackParentMetadata(parentKey);
}

function getParentSummaryMetadata(activity) {
    if (!activity.category) {
        return {
            key: 'uncategorized',
            label: 'Uncategorized',
            color: '#64748b',
            isUncategorized: true
        };
    }

    const resolvedCategory = resolveCategoryKey(activity.category);
    if (!resolvedCategory) {
        const inferredParentKey = activity.category.split('/')[0] || activity.category;
        return buildResolvedParentMetadata(inferredParentKey);
    }

    if (resolvedCategory.kind === 'group') {
        return buildResolvedParentMetadata(resolvedCategory.record.key);
    }

    return buildResolvedParentMetadata(resolvedCategory.record.groupKey);
}

export function summarizeActivitiesByParentGroup(activities) {
    const summaryMap = new Map();

    for (const activity of activities) {
        const summaryItem = getParentSummaryMetadata(activity);
        const existing = summaryMap.get(summaryItem.key);

        if (existing) {
            existing.duration += activity.duration;
            existing.count += 1;
            continue;
        }

        summaryMap.set(summaryItem.key, {
            ...summaryItem,
            duration: activity.duration,
            count: 1,
            isUncategorized: Boolean(summaryItem.isUncategorized)
        });
    }

    return Array.from(summaryMap.values()).sort((left, right) => {
        if (right.duration !== left.duration) {
            return right.duration - left.duration;
        }

        return left.label.localeCompare(right.label) || left.key.localeCompare(right.key);
    });
}

export function summarizeExpandedChildCategories(activities, expandedParentGroupKey) {
    if (!expandedParentGroupKey || expandedParentGroupKey === 'uncategorized') {
        return null;
    }

    const parentGroup = getGroupByKey(expandedParentGroupKey);
    if (!parentGroup) {
        return null;
    }

    const parentHasChildren = getTaxonomySnapshot().categories.some(
        (category) => category.groupKey === expandedParentGroupKey
    );
    const summaryMap = new Map();

    for (const activity of activities) {
        if (!activity.category) {
            continue;
        }

        const resolvedCategory = resolveCategoryKey(activity.category);
        if (!resolvedCategory) {
            continue;
        }

        if (resolvedCategory.kind === 'group') {
            if (resolvedCategory.record.key !== expandedParentGroupKey) {
                continue;
            }

            const syntheticKey = `${expandedParentGroupKey}::__unspecified`;
            const existing = summaryMap.get(syntheticKey);
            if (existing) {
                existing.duration += activity.duration;
                continue;
            }

            summaryMap.set(syntheticKey, {
                key: syntheticKey,
                label: parentHasChildren ? 'Unspecified' : parentGroup.label,
                color: parentGroup.color,
                duration: activity.duration
            });
            continue;
        }

        const childCategory = getCategoryByKey(resolvedCategory.record.key);
        if (!childCategory || childCategory.groupKey !== expandedParentGroupKey) {
            continue;
        }

        const existing = summaryMap.get(childCategory.key);
        if (existing) {
            existing.duration += activity.duration;
            continue;
        }

        summaryMap.set(childCategory.key, {
            key: childCategory.key,
            label: childCategory.label,
            color: childCategory.color,
            duration: activity.duration
        });
    }

    const items = Array.from(summaryMap.values())
        .filter((item) => item.duration > 0)
        .sort((left, right) => {
            if (right.duration !== left.duration) {
                return right.duration - left.duration;
            }

            return left.label.localeCompare(right.label) || left.key.localeCompare(right.key);
        });

    if (items.length === 0) {
        return null;
    }

    return {
        key: expandedParentGroupKey,
        label: parentGroup.label,
        items,
        totalDuration: items.reduce((sum, item) => sum + item.duration, 0)
    };
}

export function buildActivitySummaryModel(activities, expandedParentGroupKey = null) {
    const summaryItems = summarizeActivitiesByParentGroup(activities);
    return {
        summaryItems,
        totalDuration: summaryItems.reduce((sum, item) => sum + item.duration, 0),
        totalCount: summaryItems.reduce((sum, item) => sum + item.count, 0),
        expandedGroup: summarizeExpandedChildCategories(activities, expandedParentGroupKey)
    };
}

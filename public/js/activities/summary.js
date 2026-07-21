import {
    resolveCategoryKey,
    resolveCategoryReference,
    getGroupById,
    getGroupByKey,
    getCategoryById,
    getCategoryByKey
} from '../taxonomy/taxonomy-selectors.js';

function resolveActivityCategory(activity) {
    if (typeof resolveCategoryReference === 'function') {
        return resolveCategoryReference(activity);
    }
    return activity.category ? resolveCategoryKey(activity.category) : null;
}

function getGroupByIdentity(idOrKey) {
    return (
        (typeof getGroupById === 'function' ? getGroupById(idOrKey) : null) ||
        getGroupByKey(idOrKey)
    );
}

function buildGroupMetadata(group) {
    return {
        key: group.id || group.key,
        compatibilityKey: group.key,
        label: group.label,
        color: group.color,
        isUncategorized: false,
        isIntegrityIssue: false
    };
}

function buildUnknownMetadata(activity) {
    return {
        key: `unknown-category:${activity.categoryId || activity.category || 'missing'}`,
        compatibilityKey: null,
        label: 'Unknown category',
        color: '#64748b',
        isUncategorized: false,
        isIntegrityIssue: true
    };
}

function getParentSummaryMetadata(activity) {
    if (!activity.category && !activity.categoryId) {
        return {
            key: 'uncategorized',
            compatibilityKey: null,
            label: 'Uncategorized',
            color: '#64748b',
            isUncategorized: true,
            isIntegrityIssue: false
        };
    }

    const resolvedCategory = resolveActivityCategory(activity);
    if (!resolvedCategory?.record) {
        return buildUnknownMetadata(activity);
    }

    if (resolvedCategory.kind === 'group') {
        return buildGroupMetadata(resolvedCategory.record);
    }

    const parentGroup = getGroupByIdentity(
        resolvedCategory.record.groupId || resolvedCategory.record.groupKey
    );
    return parentGroup ? buildGroupMetadata(parentGroup) : buildUnknownMetadata(activity);
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

export function summarizeExpandedChildCategories(activities, expandedParentGroupId) {
    if (!expandedParentGroupId || expandedParentGroupId === 'uncategorized') {
        return null;
    }

    const parentGroup = getGroupByIdentity(expandedParentGroupId);
    if (!parentGroup) {
        return null;
    }
    const parentIdentity = parentGroup.id || parentGroup.key;

    const summaryMap = new Map();

    for (const activity of activities) {
        if (!activity.category && !activity.categoryId) {
            continue;
        }

        const resolvedCategory = resolveActivityCategory(activity);
        if (!resolvedCategory?.record) {
            continue;
        }

        if (resolvedCategory.kind === 'group') {
            if ((resolvedCategory.record.id || resolvedCategory.record.key) !== parentIdentity) {
                continue;
            }

            const syntheticKey = `${parentIdentity}::__unspecified`;
            const existing = summaryMap.get(syntheticKey);
            if (existing) {
                existing.duration += activity.duration;
                continue;
            }

            summaryMap.set(syntheticKey, {
                key: syntheticKey,
                label: parentGroup.label,
                color: parentGroup.color,
                duration: activity.duration
            });
            continue;
        }

        const childCategory =
            (typeof getCategoryById === 'function'
                ? getCategoryById(resolvedCategory.record.id)
                : null) || getCategoryByKey(resolvedCategory.record.key);
        if (
            !childCategory ||
            (childCategory.groupId || childCategory.groupKey) !==
                (parentGroup.id || parentGroup.key)
        ) {
            continue;
        }

        const childIdentity = childCategory.id || childCategory.key;
        const existing = summaryMap.get(childIdentity);
        if (existing) {
            existing.duration += activity.duration;
            continue;
        }

        summaryMap.set(childIdentity, {
            key: childIdentity,
            compatibilityKey: childCategory.key,
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
        key: parentIdentity,
        compatibilityKey: parentGroup.key,
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

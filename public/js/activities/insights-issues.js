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
        const categoryResolution =
            typeof resolveCategoryReference === 'function'
                ? resolveCategoryReference(activityItem)
                : null;
        if (categoryResolution?.integrityIssue) {
            issues.push({
                type: categoryResolution.integrityIssue,
                activityId: activityItem.id,
                categoryId: activityItem.categoryId || null
            });
        }
        const startDate = new Date(activityItem.startDateTime);
        const endDate = new Date(activityItem.endDateTime);
        const hasDurationCapableRange =
            isFinite(startDate.getTime()) && isFinite(endDate.getTime()) && endDate > startDate;

        if (!hasDurationCapableRange) {
            issues.push({
                type: 'invalid-range',
                activityId: activityItem.id
            });
        } else {
            if (
                previousValidActivity &&
                hasDisplayedMinuteOverlap(startDate, new Date(previousValidActivity.endDateTime))
            ) {
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
 * Returns every activity row that should display an issue badge for this issue.
 * @param {Object|null} issue
 * @returns {Array<string>}
 */
export function getActivityIdsForIssue(issue) {
    if (!issue) {
        return [];
    }

    return [
        issue.activityId,
        issue.relatedActivityId,
        issue.overlappingActivityId,
        issue.duplicateActivityId
    ].filter(Boolean);
}

/**
 * Groups issues by every affected activity id.
 * @param {Array<Object>} issues
 * @returns {Object<string, Array<Object>>}
 */
export function groupIssuesByActivityId(issues = []) {
    const issuesById = {};

    for (const issue of issues) {
        for (const activityId of getActivityIdsForIssue(issue)) {
            issuesById[activityId] = issuesById[activityId] || [];
            issuesById[activityId].push(issue);
        }
    }

    return issuesById;
}

/**
 * Merges caller-provided row annotations with model-detected issue annotations.
 * @param {Object<string, Array<Object>>|Map<string, Array<Object>>} existingIssuesById
 * @param {Array<Object>} modelIssues
 * @returns {Object<string, Array<Object>>}
 */
export function mergeActivityIssuesById(existingIssuesById, modelIssues = []) {
    const mergedIssuesById = {};

    if (existingIssuesById instanceof Map) {
        for (const [activityId, issues] of existingIssuesById) {
            mergedIssuesById[activityId] = [...issues];
        }
    } else {
        for (const [activityId, issues] of Object.entries(existingIssuesById || {})) {
            mergedIssuesById[activityId] = [...issues];
        }
    }

    const modelIssuesById = groupIssuesByActivityId(modelIssues);

    for (const [activityId, issues] of Object.entries(modelIssuesById)) {
        mergedIssuesById[activityId] = [...(mergedIssuesById[activityId] || []), ...issues];
    }

    return mergedIssuesById;
}

function compareOldestFirst(left, right) {
    return new Date(left.startDateTime) - new Date(right.startDateTime);
}

function getDisplayedMinuteTime(date) {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes()
    ).getTime();
}

function hasDisplayedMinuteOverlap(startDate, previousEndDate) {
    return getDisplayedMinuteTime(startDate) < getDisplayedMinuteTime(previousEndDate);
}
import { resolveCategoryReference } from '../taxonomy/taxonomy-selectors.js';

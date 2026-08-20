import {
    putActivity,
    loadActivities as loadActivitiesFromStorage,
    deleteActivity as deleteActivityFromStorage
} from '../storage.js';
import { extractDateFromDateTime, extractTimeFromDateTime } from '../utils.js';
import {
    loadRunningActivityConfig,
    saveRunningActivityConfig,
    deleteRunningActivityConfig
} from './running-activity-repository.js';
import { getDayInterval, itemOverlapsInterval } from './insights-intervals.js';
import { createActivityId } from '../entity-id.js';
import { getCategoryReferenceFields } from '../taxonomy/taxonomy-selectors.js';
import {
    MILLISECONDS_PER_MINUTE,
    calculateStoredDurationMinutes,
    getExactDurationMilliseconds,
    roundDurationMilliseconds
} from './duration.js';

/** @type {Array<Object>} */
let activities = [];
let runningActivity = null;
let timerStopInFlight = false;

function cloneActivity(activity) {
    return activity ? { ...activity } : activity;
}

function sortByStartDateTime(list) {
    list.sort((left, right) => new Date(left.startDateTime) - new Date(right.startDateTime));
}

function normalizeActivity(activity) {
    return {
        docType: 'activity',
        category: null,
        source: 'manual',
        sourceTaskId: null,
        ...activity
    };
}

function toSafeIsoDateTime(value, fallback = new Date().toISOString()) {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function clampTimerEndDateTime(startDateTime, requestedEndDateTime) {
    const startMs = new Date(startDateTime).getTime();
    const requestedMs = new Date(requestedEndDateTime).getTime();
    const clampedMs = Number.isNaN(requestedMs) ? startMs : Math.max(startMs, requestedMs);
    return new Date(clampedMs).toISOString();
}

function calculateDurationMinutes(startDateTime, endDateTime) {
    return calculateStoredDurationMinutes(startDateTime, endDateTime);
}

function ensureMinimumCompletedActivityDuration(activityData) {
    if (
        !activityData?.startDateTime ||
        !activityData?.endDateTime ||
        typeof activityData?.duration !== 'number' ||
        activityData.duration >= 1
    ) {
        return activityData;
    }

    const exactDuration = getExactDurationMilliseconds(
        activityData.startDateTime,
        activityData.endDateTime
    );
    if (exactDuration <= 0 || exactDuration >= MILLISECONDS_PER_MINUTE) {
        return activityData;
    }

    return {
        ...activityData,
        duration: 1
    };
}

function replaceState(nextActivities = []) {
    activities = nextActivities.map((activity) => normalizeActivity(cloneActivity(activity)));
    sortByStartDateTime(activities);
    return getActivityState();
}

export function resetActivityState() {
    activities = [];
    runningActivity = null;
    timerStopInFlight = false;
}

export function updateActivityState(nextActivities = []) {
    return replaceState(nextActivities);
}

export function getActivityState() {
    return activities.map(cloneActivity);
}

export function getActivityById(activityId) {
    return activities.find((activity) => activity.id === activityId) || null;
}

export function getTodaysActivities(now = new Date()) {
    const today = extractDateFromDateTime(now instanceof Date ? now : new Date(now));

    return activities
        .filter(
            (activity) =>
                activity.startDateTime &&
                extractDateFromDateTime(new Date(activity.startDateTime)) === today
        )
        .slice()
        .sort((left, right) => new Date(right.endDateTime) - new Date(left.endDateTime))
        .map(cloneActivity);
}

export function getSuggestedActivityStartTime(now = new Date()) {
    const todaysActivities = getTodaysActivities(now);
    if (todaysActivities.length === 0) {
        return null;
    }

    const latestActivity = todaysActivities.reduce((latest, activity) => {
        if (!latest) {
            return activity;
        }

        return new Date(activity.endDateTime) > new Date(latest.endDateTime) ? activity : latest;
    }, null);
    if (!latestActivity?.endDateTime) {
        return null;
    }

    return extractTimeFromDateTime(new Date(latestActivity.endDateTime));
}

export function getLiveTodayActivitySummary(now = new Date()) {
    if (!runningActivity?.startDateTime) {
        return null;
    }

    const nowDate = now instanceof Date ? now : new Date(now);
    const startDate = new Date(runningActivity.startDateTime);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(nowDate.getTime())) {
        return null;
    }

    const today = extractDateFromDateTime(nowDate);
    if (extractDateFromDateTime(startDate) !== today) {
        return null;
    }

    const endDateTime = clampTimerEndDateTime(runningActivity.startDateTime, nowDate.toISOString());
    const duration = calculateDurationMinutes(runningActivity.startDateTime, endDateTime);

    return cloneActivity(
        normalizeActivity({
            ...runningActivity,
            id: runningActivity.id || 'running-activity-summary',
            endDateTime,
            duration,
            isRunningActivity: true
        })
    );
}

export async function loadActivitiesState(loadActivities = loadActivitiesFromStorage) {
    if (typeof loadActivities !== 'function') {
        replaceState([]);
        return getActivityState();
    }

    const loadedActivities = await loadActivities();
    replaceState(Array.isArray(loadedActivities) ? loadedActivities : []);
    return getActivityState();
}

export async function addActivity(activityData, storageOptions = {}) {
    const normalizedActivityData = ensureMinimumCompletedActivityDuration(activityData);
    const description = normalizedActivityData?.description?.trim();

    if (!description) {
        return { success: false, reason: 'Activity description is required.' };
    }

    if (!normalizedActivityData?.startDateTime || !normalizedActivityData?.endDateTime) {
        return { success: false, reason: 'Activity start and end times are required.' };
    }

    if (
        typeof normalizedActivityData?.duration !== 'number' ||
        normalizedActivityData.duration <= 0
    ) {
        return { success: false, reason: 'Activity duration must be greater than 0.' };
    }

    const activity = normalizeActivity({
        ...normalizedActivityData,
        id: normalizedActivityData.id || createActivityId(),
        description,
        ...getCategoryReferenceFields(normalizedActivityData)
    });

    if (storageOptions.allowDuringPreparation) {
        await putActivity(activity, storageOptions);
    } else {
        await putActivity(activity);
    }
    activities.push(activity);
    sortByStartDateTime(activities);

    return { success: true, activity: cloneActivity(activity) };
}

export async function editActivity(activityId, updates = {}) {
    const existing = getActivityById(activityId);

    if (!existing) {
        return { success: false, reason: 'Activity not found.' };
    }

    const nextActivity = ensureMinimumCompletedActivityDuration(
        normalizeActivity({
            ...existing,
            ...updates,
            id: activityId,
            description: updates.description ? updates.description.trim() : existing.description,
            ...getCategoryReferenceFields(
                Object.prototype.hasOwnProperty.call(updates, 'category') ? updates : existing
            )
        })
    );

    if (!nextActivity.description) {
        return { success: false, reason: 'Activity description is required.' };
    }

    if (!nextActivity.duration || nextActivity.duration <= 0) {
        return { success: false, reason: 'Activity duration must be greater than 0.' };
    }

    await putActivity(nextActivity);
    activities = activities.map((activity) =>
        activity.id === activityId ? nextActivity : activity
    );
    sortByStartDateTime(activities);

    return { success: true, activity: cloneActivity(nextActivity) };
}

function buildActivityOverlapTruncationsForDate(selectedDate) {
    if (!selectedDate) {
        return { success: false, reason: 'Selected date is required.' };
    }

    const dayInterval = getDayInterval(selectedDate);
    const selectedActivities = activities
        .filter(
            (activity) =>
                activity.docType === 'activity' &&
                activity.endDateTime &&
                itemOverlapsInterval(activity, dayInterval)
        )
        .slice()
        .sort((left, right) => new Date(left.startDateTime) - new Date(right.startDateTime));

    const truncatedActivities = [];
    const changes = [];
    const unresolvedOverlaps = [];
    const sameStartClusters = new Map();

    for (const activity of selectedActivities) {
        const startMs = new Date(activity.startDateTime).getTime();
        if (!isFinite(startMs)) {
            continue;
        }
        const cluster = sameStartClusters.get(startMs) || [];
        cluster.push(activity);
        sameStartClusters.set(startMs, cluster);
    }

    const clusteredActivityIds = new Set();
    for (const cluster of sameStartClusters.values()) {
        if (cluster.length < 2) {
            continue;
        }

        cluster.forEach((activity) => clusteredActivityIds.add(activity.id));
        unresolvedOverlaps.push({
            activityId: cluster[0].id,
            description: cluster[0].description || 'Untitled activity',
            overlappingActivityId: cluster[1].id,
            overlappingActivityDescription: cluster[1].description || 'Untitled activity',
            activityIds: cluster.map((activity) => activity.id),
            descriptions: cluster.map((activity) => activity.description || 'Untitled activity'),
            reason: 'same-start'
        });
    }

    for (let index = 0; index < selectedActivities.length - 1; index += 1) {
        const activity = selectedActivities[index];
        const nextActivity = selectedActivities[index + 1];
        const startDate = new Date(activity.startDateTime);
        const endDate = new Date(activity.endDateTime);
        const nextStartDate = new Date(nextActivity.startDateTime);

        const nextEndDate = new Date(nextActivity.endDateTime);
        if (
            !isFinite(startDate.getTime()) ||
            !isFinite(endDate.getTime()) ||
            !isFinite(nextStartDate.getTime()) ||
            endDate <= nextStartDate ||
            extractDateFromDateTime(nextStartDate) !== selectedDate
        ) {
            continue;
        }

        if (clusteredActivityIds.has(activity.id)) {
            continue;
        }

        const displayedEnd = new Date(endDate.getTime());
        displayedEnd.setSeconds(0, 0);
        const displayedNextStart = new Date(nextStartDate.getTime());
        displayedNextStart.setSeconds(0, 0);
        if (displayedEnd <= displayedNextStart) {
            continue;
        }

        const isContainment = isFinite(nextEndDate.getTime()) && endDate >= nextEndDate;
        const isTimerOnlyContainment =
            activity.source === 'timer' && nextActivity.source === 'timer';
        if (isContainment && !isTimerOnlyContainment) {
            unresolvedOverlaps.push({
                activityId: activity.id,
                description: activity.description || 'Untitled activity',
                overlappingActivityId: nextActivity.id,
                overlappingActivityDescription: nextActivity.description || 'Untitled activity',
                reason: 'containment'
            });
            continue;
        }

        const exactNextDuration = getExactDurationMilliseconds(
            activity.startDateTime,
            nextStartDate
        );
        const truncatedActivity = normalizeActivity({
            ...activity,
            endDateTime: nextStartDate.toISOString(),
            duration: roundDurationMilliseconds(exactNextDuration)
        });
        const removedDurationMilliseconds = endDate.getTime() - nextStartDate.getTime();
        truncatedActivities.push(truncatedActivity);
        changes.push({
            activityId: activity.id,
            description: activity.description || 'Untitled activity',
            startDateTime: activity.startDateTime,
            previousEndDateTime: activity.endDateTime,
            nextEndDateTime: truncatedActivity.endDateTime,
            previousDuration: activity.duration,
            nextDuration: truncatedActivity.duration,
            overlappingActivityId: nextActivity.id,
            overlappingActivityDescription: nextActivity.description || 'Untitled activity',
            removedDurationMinutes: Math.round(
                removedDurationMilliseconds / MILLISECONDS_PER_MINUTE
            ),
            isLargeAdjustment: removedDurationMilliseconds >= 30 * MILLISECONDS_PER_MINUTE,
            isSubMinute: exactNextDuration > 0 && exactNextDuration < MILLISECONDS_PER_MINUTE
        });
    }

    return {
        success: true,
        truncatedActivities,
        changes,
        unresolvedOverlaps,
        previewToken: JSON.stringify(
            selectedActivities.map((activity) => [
                activity.id,
                activity.startDateTime,
                activity.endDateTime,
                activity.duration
            ])
        )
    };
}

/**
 * Previews overlapping saved activities that would be truncated for a selected local day.
 * @param {string} selectedDate - Local date in YYYY-MM-DD format.
 * @returns {{
 *   success: boolean,
 *   truncatedCount?: number,
 *   truncatedActivityIds?: Array<string>,
 *   changes?: Array<Object>,
 *   unresolvedOverlapCount?: number,
 *   unresolvedOverlaps?: Array<Object>,
 *   previewToken?: string,
 *   reason?: string
 * }}
 */
export function getActivityOverlapTruncationPreviewForDate(selectedDate) {
    const result = buildActivityOverlapTruncationsForDate(selectedDate);
    if (!result.success) {
        return result;
    }

    return {
        success: true,
        truncatedCount: result.truncatedActivities.length,
        truncatedActivityIds: result.truncatedActivities.map((activity) => activity.id),
        changes: result.changes,
        unresolvedOverlapCount: result.unresolvedOverlaps.length,
        unresolvedOverlaps: result.unresolvedOverlaps,
        previewToken: result.previewToken
    };
}

/**
 * Truncates overlapping saved activities for a selected local day.
 * @param {string} selectedDate - Local date in YYYY-MM-DD format.
 * @param {{previewToken?: string}|null} expectedPreview - Preview approved by the user.
 * @returns {Promise<{
 *   success: boolean,
 *   truncatedCount?: number,
 *   truncatedActivityIds?: Array<string>,
 *   reason?: string
 * }>}
 */
export async function truncateActivityOverlapsForDate(selectedDate, expectedPreview = null) {
    const result = buildActivityOverlapTruncationsForDate(selectedDate);
    if (!result.success) {
        return result;
    }

    if (!expectedPreview?.previewToken) {
        return {
            success: false,
            code: 'preview-required',
            reason: 'Review the proposed overlap changes before applying them.'
        };
    }

    if (expectedPreview.previewToken !== result.previewToken) {
        return {
            success: false,
            code: 'preview-stale',
            reason: 'Activity data changed after the preview. Review the updated changes before fixing overlaps.'
        };
    }

    const availableActivityIds = new Set(result.truncatedActivities.map((activity) => activity.id));
    const selectedActivityIds = Array.isArray(expectedPreview.selectedActivityIds)
        ? [...new Set(expectedPreview.selectedActivityIds)]
        : [...availableActivityIds];
    if (selectedActivityIds.length === 0) {
        return {
            success: false,
            code: 'selection-required',
            reason: 'Select at least one overlap change to apply.'
        };
    }
    if (selectedActivityIds.some((activityId) => !availableActivityIds.has(activityId))) {
        return {
            success: false,
            code: 'selection-stale',
            reason: 'The selected overlap changes are no longer available. Review the updated changes.'
        };
    }

    const truncatedActivities = result.truncatedActivities.filter((activity) =>
        selectedActivityIds.includes(activity.id)
    );
    const truncatedActivityIds = [];

    for (const activity of truncatedActivities) {
        Object.assign(activity, getCategoryReferenceFields(activity));
        try {
            await putActivity(activity);
        } catch {
            const truncatedCount = truncatedActivityIds.length;
            return {
                success: false,
                code: truncatedCount > 0 ? 'partial-failure' : 'write-failure',
                reason:
                    truncatedCount > 0
                        ? `Fixed ${truncatedCount} overlap ${truncatedCount === 1 ? 'change' : 'changes'}, but another activity could not be saved. Review the remaining warnings before retrying.`
                        : 'No overlap changes were saved. Review the activity data and try again.',
                truncatedCount,
                truncatedActivityIds
            };
        }

        activities = activities.map((existingActivity) =>
            existingActivity.id === activity.id ? activity : existingActivity
        );
        truncatedActivityIds.push(activity.id);
    }

    sortByStartDateTime(activities);

    return {
        success: true,
        truncatedCount: truncatedActivityIds.length,
        truncatedActivityIds
    };
}

export async function removeActivity(activityId) {
    const existing = getActivityById(activityId);

    if (!existing) {
        return { success: false, reason: 'Activity not found.' };
    }

    await deleteActivityFromStorage(activityId);
    activities = activities.filter((activity) => activity.id !== activityId);

    return { success: true, activity: cloneActivity(existing) };
}

export function createActivityFromTask(task) {
    const now = new Date();
    const plannedStart = new Date(task.startDateTime);
    const endsInFuture = !Number.isNaN(plannedStart.getTime()) && plannedStart > now;
    const endDateTime = endsInFuture ? now.toISOString() : task.endDateTime;
    const startDateTime = endsInFuture
        ? new Date(now.getTime() - task.duration * 60000).toISOString()
        : task.startDateTime;

    return {
        description: task.description,
        ...getCategoryReferenceFields(task),
        startDateTime,
        endDateTime,
        duration: task.duration,
        source: 'auto',
        sourceTaskId: task.id || null
    };
}

export async function loadRunningActivity() {
    runningActivity = await loadRunningActivityConfig();
    return getRunningActivity();
}

export function getRunningActivity() {
    return runningActivity ? { ...runningActivity } : null;
}

export async function startTimer(timerInput = {}, storageOptions = {}) {
    const { description, source = 'timer', sourceTaskId = null, startDateTime = null } = timerInput;
    const trimmedDescription = description?.trim();
    if (!trimmedDescription) {
        return { success: false, reason: 'Description is required to start a timer.' };
    }

    if (runningActivity) {
        return { success: false, reason: 'A timer is already running. Stop it first.' };
    }

    const timerState = {
        id: createActivityId(),
        description: trimmedDescription,
        ...getCategoryReferenceFields(timerInput),
        startDateTime: toSafeIsoDateTime(startDateTime),
        source,
        sourceTaskId
    };

    if (storageOptions.allowDuringPreparation) {
        await saveRunningActivityConfig(timerState, storageOptions);
    } else {
        await saveRunningActivityConfig(timerState);
    }

    runningActivity = timerState;
    return { success: true, runningActivity: getRunningActivity() };
}

export async function startTimerReplacingCurrent(timerData) {
    return startTimerReplacingCurrentAt(timerData, new Date().toISOString());
}

export async function startTimerReplacingCurrentAt(
    timerData,
    transitionDateTime,
    storageOptions = {}
) {
    let stoppedActivity = null;
    const safeTransitionDateTime = toSafeIsoDateTime(transitionDateTime);

    if (runningActivity) {
        const stopResult = await stopTimerAt(safeTransitionDateTime, storageOptions);
        if (!stopResult?.success) {
            return stopResult;
        }
        stoppedActivity = stopResult.activity || null;
    }

    const startResult = await startTimer(
        { ...timerData, startDateTime: safeTransitionDateTime },
        storageOptions
    );
    if (!startResult?.success) {
        return {
            ...startResult,
            stoppedActivity
        };
    }

    return {
        ...startResult,
        stoppedActivity
    };
}

export async function stopTimer() {
    return stopTimerAt(new Date().toISOString());
}

export async function stopTimerAt(endDateTime, storageOptions = {}) {
    if (timerStopInFlight) {
        return { success: false, reason: 'Timer stop is already in progress.' };
    }

    if (!runningActivity) {
        return { success: false, reason: 'No timer is currently running.' };
    }

    timerStopInFlight = true;
    const timerToStop = runningActivity;
    const safeEndDateTime = clampTimerEndDateTime(
        timerToStop.startDateTime,
        toSafeIsoDateTime(endDateTime)
    );

    try {
        const activityResult = await addActivity(
            {
                id: timerToStop.id || createActivityId(),
                description: timerToStop.description,
                ...getCategoryReferenceFields(timerToStop),
                startDateTime: timerToStop.startDateTime,
                endDateTime: safeEndDateTime,
                duration: calculateDurationMinutes(timerToStop.startDateTime, safeEndDateTime),
                source: timerToStop.source || 'timer',
                sourceTaskId: timerToStop.sourceTaskId || null
            },
            storageOptions
        );

        if (!activityResult?.success) {
            return activityResult;
        }

        if (storageOptions.allowDuringPreparation) {
            await deleteRunningActivityConfig(storageOptions);
        } else {
            await deleteRunningActivityConfig();
        }
        runningActivity = null;

        return { success: true, activity: cloneActivity(activityResult.activity) };
    } finally {
        timerStopInFlight = false;
    }
}

export async function updateRunningActivity(updates = {}) {
    if (!runningActivity) {
        return { success: false, reason: 'No timer is currently running.' };
    }

    const nextDescription =
        Object.prototype.hasOwnProperty.call(updates, 'description') &&
        updates.description !== undefined
            ? updates.description.trim()
            : runningActivity.description;

    if (!nextDescription) {
        return { success: false, reason: 'Description is required while a timer is running.' };
    }

    const nextRunningActivity = {
        id: runningActivity.id || null,
        description: nextDescription,
        ...getCategoryReferenceFields(
            Object.prototype.hasOwnProperty.call(updates, 'category') ? updates : runningActivity
        ),
        startDateTime: Object.prototype.hasOwnProperty.call(updates, 'startDateTime')
            ? toSafeIsoDateTime(updates.startDateTime, runningActivity.startDateTime)
            : runningActivity.startDateTime,
        source: runningActivity.source || 'timer',
        sourceTaskId: runningActivity.sourceTaskId || null
    };

    await saveRunningActivityConfig(nextRunningActivity);

    runningActivity = nextRunningActivity;
    return { success: true, runningActivity: getRunningActivity() };
}

import {
    putActivity,
    loadActivities as loadActivitiesFromStorage,
    deleteActivity as deleteActivityFromStorage
} from '../storage.js';
import { extractDateFromDateTime } from '../utils.js';
import {
    loadRunningActivityConfig,
    saveRunningActivityConfig,
    deleteRunningActivityConfig
} from './running-activity-repository.js';

/** @type {Array<Object>} */
let activities = [];
let runningActivity = null;

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

function generateActivityId() {
    return `activity-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
    const startMs = new Date(startDateTime).getTime();
    const endMs = new Date(endDateTime).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        return 0;
    }

    return Math.max(0, Math.round((endMs - startMs) / 60000));
}

function replaceState(nextActivities = []) {
    activities = nextActivities.map((activity) => normalizeActivity(cloneActivity(activity)));
    sortByStartDateTime(activities);
    return getActivityState();
}

export function resetActivityState() {
    activities = [];
    runningActivity = null;
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
        .sort((left, right) => new Date(left.startDateTime) - new Date(right.startDateTime))
        .map(cloneActivity);
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

export async function addActivity(activityData) {
    const description = activityData?.description?.trim();

    if (!description) {
        return { success: false, reason: 'Activity description is required.' };
    }

    if (!activityData?.startDateTime || !activityData?.endDateTime) {
        return { success: false, reason: 'Activity start and end times are required.' };
    }

    const allowsZeroDuration = activityData?.source === 'timer';
    if (
        typeof activityData?.duration !== 'number' ||
        activityData.duration < 0 ||
        (!allowsZeroDuration && activityData.duration <= 0)
    ) {
        return { success: false, reason: 'Activity duration must be greater than 0.' };
    }

    const activity = normalizeActivity({
        ...activityData,
        id: activityData.id || generateActivityId(),
        description
    });

    await putActivity(activity);
    activities.push(activity);
    sortByStartDateTime(activities);

    return { success: true, activity: cloneActivity(activity) };
}

export async function editActivity(activityId, updates = {}) {
    const existing = getActivityById(activityId);

    if (!existing) {
        return { success: false, reason: 'Activity not found.' };
    }

    const nextActivity = normalizeActivity({
        ...existing,
        ...updates,
        id: activityId,
        description: updates.description ? updates.description.trim() : existing.description
    });

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
        category: task.category || null,
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

export async function startTimer({ description, category } = {}) {
    const trimmedDescription = description?.trim();
    if (!trimmedDescription) {
        return { success: false, reason: 'Description is required to start a timer.' };
    }

    if (runningActivity) {
        return { success: false, reason: 'A timer is already running. Stop it first.' };
    }

    const timerState = {
        description: trimmedDescription,
        category: category || null,
        startDateTime: new Date().toISOString()
    };

    await saveRunningActivityConfig(timerState);

    runningActivity = timerState;
    return { success: true, runningActivity: getRunningActivity() };
}

export async function startTimerReplacingCurrent(timerData) {
    let stoppedActivity = null;

    if (runningActivity) {
        const stopResult = await stopTimer();
        if (!stopResult?.success) {
            return stopResult;
        }
        stoppedActivity = stopResult.activity || null;
    }

    const startResult = await startTimer(timerData);
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

export async function stopTimerAt(endDateTime) {
    if (!runningActivity) {
        return { success: false, reason: 'No timer is currently running.' };
    }

    const safeEndDateTime = clampTimerEndDateTime(
        runningActivity.startDateTime,
        toSafeIsoDateTime(endDateTime)
    );
    const activity = normalizeActivity({
        id: generateActivityId(),
        description: runningActivity.description,
        category: runningActivity.category || null,
        startDateTime: runningActivity.startDateTime,
        endDateTime: safeEndDateTime,
        duration: calculateDurationMinutes(runningActivity.startDateTime, safeEndDateTime),
        source: 'timer',
        sourceTaskId: null
    });

    await putActivity(activity);
    activities.push(activity);
    sortByStartDateTime(activities);
    await deleteRunningActivityConfig();
    runningActivity = null;

    return { success: true, activity: cloneActivity(activity) };
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
        description: nextDescription,
        category: Object.prototype.hasOwnProperty.call(updates, 'category')
            ? updates.category || null
            : runningActivity.category || null,
        startDateTime: Object.prototype.hasOwnProperty.call(updates, 'startDateTime')
            ? toSafeIsoDateTime(updates.startDateTime, runningActivity.startDateTime)
            : runningActivity.startDateTime
    };

    await saveRunningActivityConfig(nextRunningActivity);

    runningActivity = nextRunningActivity;
    return { success: true, runningActivity: getRunningActivity() };
}

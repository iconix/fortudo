import {
    putActivity,
    loadActivities as loadActivitiesFromStorage,
    deleteActivity as deleteActivityFromStorage
} from '../storage.js';
import { extractDateFromDateTime } from '../utils.js';

/** @type {Array<Object>} */
let activities = [];

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

function replaceState(nextActivities = []) {
    activities = nextActivities.map((activity) => normalizeActivity(cloneActivity(activity)));
    sortByStartDateTime(activities);
    return getActivityState();
}

export function resetActivityState() {
    activities = [];
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

export async function loadActivityState(loadActivities = loadActivitiesFromStorage) {
    return loadActivitiesState(loadActivities);
}

export async function addActivity(activityData) {
    const description = activityData?.description?.trim();

    if (!description) {
        return { success: false, reason: 'Activity description is required.' };
    }

    if (!activityData?.startDateTime || !activityData?.endDateTime) {
        return { success: false, reason: 'Activity start and end times are required.' };
    }

    if (!activityData?.duration || activityData.duration <= 0) {
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

    if (existing.source === 'auto') {
        return { success: false, reason: 'Auto-logged activities cannot be edited.' };
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

export async function updateActivity(activityId, updates = {}) {
    return editActivity(activityId, updates);
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

export async function deleteActivity(activityId) {
    return removeActivity(activityId);
}

export function createActivityFromTask(task) {
    return {
        description: task.description,
        category: task.category || null,
        startDateTime: task.startDateTime,
        endDateTime: task.endDateTime,
        duration: task.duration,
        source: 'auto',
        sourceTaskId: task.id || null
    };
}

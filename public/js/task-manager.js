import {
    calculateMinutes,
    getCurrentTimeRounded,
    logger,
    timeToDateTime,
    calculateEndDateTime,
    extractTimeFromDateTime,
    getTaskDates,
    extractDateFromDateTime
} from './utils.js';
import { saveTasks } from './storage.js';

/**
 * @typedef {Object} Task
 * @property {string} id - Unique ID for the task
 * @property {string} description - task description
 * @property {string} type - 'scheduled' or 'unscheduled'
 * @property {string} [startDateTime] - start date and time in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ) (for scheduled)
 * @property {string} [endDateTime] - end date and time in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ) (for scheduled)
 * @property {number} [duration] - duration in minutes (for scheduled)
 * @property {string} [priority] - 'high', 'medium', 'low' (for unscheduled)
 * @property {number} [estDuration] - estimated duration in minutes (for unscheduled)
 * @property {string} status - task status ("incomplete" or "completed")
 * @property {boolean} editing - whether task is being edited
 * @property {boolean} confirmingDelete - whether delete is being confirmed
 */

// ============================================================================
// MIGRATION UTILITIES
// ============================================================================
function migrateTasks(tasksToMigrate) {
    const today = extractDateFromDateTime(new Date());
    let idCounter = Date.now();

    return tasksToMigrate.map((task, index) => {
        const migratedTask = { ...task };
        if (!migratedTask.id) migratedTask.id = `task-${idCounter++}`;
        if (!migratedTask.status) migratedTask.status = 'incomplete';
        if (migratedTask.editing === undefined) migratedTask.editing = false;
        if (migratedTask.confirmingDelete === undefined) migratedTask.confirmingDelete = false;
        if (!migratedTask.type) migratedTask.type = 'scheduled';

        if (migratedTask.type === 'scheduled') {
            if (!migratedTask.startDateTime && migratedTask.startTime) migratedTask.startDateTime = timeToDateTime(migratedTask.startTime, today);
            if (!migratedTask.endDateTime && migratedTask.startDateTime && migratedTask.duration) migratedTask.endDateTime = calculateEndDateTime(migratedTask.startDateTime, migratedTask.duration);
            if(migratedTask.startDateTime && migratedTask.endDateTime && !migratedTask.duration) {
                const start = new Date(migratedTask.startDateTime);
                const end = new Date(migratedTask.endDateTime);
                migratedTask.duration = (end.getTime() - start.getTime()) / 60000;
            }
        } else if (migratedTask.type === 'unscheduled') {
            if (migratedTask.estDuration === undefined && migratedTask.duration !== undefined) {
                migratedTask.estDuration = migratedTask.duration;
                delete migratedTask.duration;
            }
            if (!migratedTask.priority) migratedTask.priority = 'medium';
        }
        delete migratedTask.startTime; delete migratedTask.endTime;
        return migratedTask;
    });
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let tasks = [];
let currentTasksVersion = 0;
export function getTaskState() { return tasks; }
export function updateTaskState(newTasks) {
    tasks = migrateTasks(newTasks || []);
    if (tasks.length === 0) { /* Sample tasks are added in task-manager.js's updateTaskState */ }
    invalidateTaskCaches();
    saveTasks(tasks);
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
let sortedScheduledTasksCache = null;
let sortedScheduledTasksCacheVersion = 0;
const invalidateTaskCaches = () => { currentTasksVersion++; sortedScheduledTasksCache = null; };

// ============================================================================
// SORTING AND TASK UTILITIES
// ============================================================================
const sortScheduledTasks = (tasksToSort) => {
    tasksToSort.sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
};
const getSortedScheduledTasks = () => {
    if (sortedScheduledTasksCache && sortedScheduledTasksCacheVersion === currentTasksVersion) return sortedScheduledTasksCache;
    sortedScheduledTasksCache = tasks.filter(task => task.type === 'scheduled');
    sortScheduledTasks(sortedScheduledTasksCache);
    sortedScheduledTasksCacheVersion = currentTasksVersion;
    return sortedScheduledTasksCache;
};

const createTaskObject = (taskData) => {
    const id = `unsched-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; // Ensure unscheduled tasks also get unique IDs starting differently if needed
    const baseTask = { id, description: taskData.description, status: 'incomplete', editing: false, confirmingDelete: false, type: taskData.taskType || 'scheduled' };
    if (baseTask.type === 'scheduled') {
        const today = extractDateFromDateTime(new Date());
        const startDateTime = timeToDateTime(taskData.startTime, today);
        return { ...baseTask, id: `sched-${Date.now()}-${Math.random().toString(36).substr(2,9)}`, startDateTime, endDateTime: calculateEndDateTime(startDateTime, taskData.duration), duration: taskData.duration };
    }
    return { ...baseTask, priority: taskData.priority || 'medium', estDuration: taskData.estDuration || 0 };
};

const finalizeTaskModification = () => { invalidateTaskCaches(); saveTasks(tasks); };

// ============================================================================
// VALIDATION
// ============================================================================
export function isValidTaskData(description, duration, taskType = 'scheduled', startTime, estDuration) {
    if (!description || description.trim() === '') return { isValid: false, reason: 'Description cannot be empty.' };
    if (taskType === 'scheduled') {
        if (isNaN(duration) || duration <= 0) return { isValid: false, reason: 'Duration must be a positive number for scheduled tasks.' };
        if (!startTime) return { isValid: false, reason: 'Start time is required for scheduled tasks.' };
    } else if (taskType === 'unscheduled') {
        if (estDuration !== undefined && estDuration !== null && (isNaN(estDuration) || estDuration < 0)) { // Allow 0 for estDuration
             return { isValid: false, reason: 'Estimated duration must be a non-negative number for unscheduled tasks.' };
        }
    }
    return { isValid: true };
}

// ============================================================================
// UI STATE
// ============================================================================
const resetAllUIFlags = () => tasks.forEach(task => { task.editing = false; task.confirmingDelete = false; });
export function resetAllConfirmingDeleteFlags() { let c = false; tasks.forEach(t => { if (t.confirmingDelete) { t.confirmingDelete = false; c = true; }}); return c; }
export function resetAllEditingFlags() { let c = false; tasks.forEach(t => { if (t.editing) { t.editing = false; c = true; }}); return c; }

// ============================================================================
// OVERLAP & SCHEDULING (Scheduled Tasks Only)
// ============================================================================
export function tasksOverlap(task1, task2) {
    if (task1.type !== 'scheduled' || task2.type !== 'scheduled' || !task1.startDateTime || !task1.endDateTime || !task2.startDateTime || !task2.endDateTime) return false;
    const start1 = new Date(task1.startDateTime); const end1 = new Date(task1.endDateTime);
    const start2 = new Date(task2.startDateTime); const end2 = new Date(task2.endDateTime);
    return start1 < end2 && start2 < end1;
}
export function checkOverlap(taskToCompare, existingTasks) {
    if (taskToCompare.type !== 'scheduled') return [];
    return existingTasks.filter(task => task.type === 'scheduled' && task.id !== taskToCompare.id && task.status !== 'completed' && !task.editing && tasksOverlap(taskToCompare, task));
}
export function performReschedule(taskThatChanged, actualTaskRef = undefined) {
    if (taskThatChanged.type !== 'scheduled' || !taskThatChanged.startDateTime || !taskThatChanged.endDateTime) return;
    let actualTask = actualTaskRef || tasks.find(t => t.id === taskThatChanged.id && t.type === 'scheduled');
    if (!actualTask || !actualTask.startDateTime || !actualTask.endDateTime) { logger.warn('performReschedule: Scheduled task not found or invalid.', taskThatChanged); return; }
    if (taskThatChanged.duration !== actualTask.duration) {
        actualTask.duration = taskThatChanged.duration;
        actualTask.endDateTime = calculateEndDateTime(actualTask.startDateTime, actualTask.duration);
    }
    const originalEditingState = actualTask.editing; actualTask.editing = false;
    const sortedScheduledTasks = getSortedScheduledTasks().filter(t => t.id !== actualTask.id);
    for (const taskToCompare of sortedScheduledTasks) {
        if (taskToCompare.status === 'completed' || taskToCompare.editing || !taskToCompare.startDateTime || !taskToCompare.duration) continue;
        if (new Date(taskToCompare.startDateTime) >= new Date(actualTask.endDateTime)) break;
        if (tasksOverlap(actualTask, taskToCompare)) {
            const newStartDateTimeStr = actualTask.endDateTime;
            taskToCompare.startDateTime = newStartDateTimeStr;
            taskToCompare.endDateTime = calculateEndDateTime(newStartDateTimeStr, taskToCompare.duration);
            performReschedule(taskToCompare, taskToCompare);
        }
    }
    actualTask.editing = originalEditingState;
}
export function getSuggestedStartTime() {
    const currentTimeRounded = getCurrentTimeRounded();
    const scheduledOnly = tasks.filter(t => t.type === 'scheduled' && t.status === 'incomplete');
    if (scheduledOnly.length === 0) return currentTimeRounded;
    let latestEndTime = null; let latestEndMinutes = -1; let hasTaskAtCurrent = false;
    scheduledOnly.forEach(task => {
        const start = new Date(task.startDateTime); const end = new Date(task.endDateTime);
        const startMins = start.getHours() * 60 + start.getMinutes(); const endMins = end.getHours() * 60 + end.getMinutes();
        const currentMins = new Date().getHours() * 60 + new Date().getMinutes();
        if (endMins > latestEndMinutes) { latestEndMinutes = endMins; latestEndTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`; }
        if (currentMins >= startMins && currentMins < endMins) hasTaskAtCurrent = true;
    });
    return hasTaskAtCurrent && latestEndTime ? latestEndTime : currentTimeRounded;
}
const createOverlapConfirmation = (operation, data, reason) => ({ success: false, requiresConfirmation: true, confirmationType: `RESCHEDULE_${operation}`, ...data, reason });

// ============================================================================
// CORE TASK OPERATIONS
// ============================================================================
export function addTask(taskData) {
    const validation = isValidTaskData(taskData.description, taskData.duration, taskData.taskType, taskData.startTime, taskData.estDuration);
    if (!validation.isValid) return { success: false, reason: validation.reason };
    const newTask = createTaskObject(taskData);
    if (newTask.type === 'scheduled') {
        const overlaps = checkOverlap(newTask, tasks);
        if (overlaps.length > 0) return createOverlapConfirmation('ADD', { taskData }, 'Adding this task will overlap. Reschedule others?');
        tasks.push(newTask);
        performReschedule(newTask);
        finalizeTaskModification();
    } else { // Unscheduled
        tasks.push(newTask);
        saveTasks(tasks); // Save without full finalization to preserve append order
    }
    return { success: true, task: newTask };
}
export function confirmAddTaskAndReschedule(taskData) {
    const newTask = createTaskObject(taskData);
    tasks.push(newTask);
    if (newTask.type === 'scheduled') performReschedule(newTask);
    finalizeTaskModification();
    return { success: true, task: newTask };
}
export function updateTask(index, taskData) {
    if (index < 0 || index >= tasks.length) return { success: false, reason: 'Invalid task index.' };
    const existingTask = tasks[index];
    const updatedDetails = { description: taskData.description, type: taskData.taskType, status: existingTask.status, id: existingTask.id, editing: false, confirmingDelete: existingTask.confirmingDelete };
    if (updatedDetails.type === 'scheduled') {
        updatedDetails.duration = taskData.duration;
        const today = extractDateFromDateTime(new Date());
        const startTime = taskData.startTime || extractTimeFromDateTime(new Date(existingTask.startDateTime));
        updatedDetails.startDateTime = timeToDateTime(startTime, today);
        updatedDetails.endDateTime = calculateEndDateTime(updatedDetails.startDateTime, updatedDetails.duration);
    } else {
        updatedDetails.priority = taskData.priority; updatedDetails.estDuration = taskData.estDuration;
    }
    const validation = isValidTaskData(updatedDetails.description, updatedDetails.duration, updatedDetails.type, updatedDetails.startDateTime ? extractTimeFromDateTime(new Date(updatedDetails.startDateTime)) : undefined, updatedDetails.estDuration);
    if (!validation.isValid) return { success: false, reason: validation.reason };
    if (updatedDetails.type === 'scheduled') {
        const overlaps = checkOverlap(updatedDetails, tasks.filter(t => t.id !== existingTask.id));
        if (overlaps.length > 0) return createOverlapConfirmation('UPDATE', { taskIndex: index, updatedData: taskData }, 'Updating may overlap. Reschedule others?');
    }
    tasks[index] = { ...existingTask, ...updatedDetails, editing: false };
    if (tasks[index].type === 'scheduled') performReschedule(tasks[index]);
    finalizeTaskModification();
    return { success: true, task: tasks[index] };
}

export function updateUnscheduledTask(taskId, newData) {
    const taskIndex = tasks.findIndex(t => t.id === taskId && t.type === 'unscheduled');
    if (taskIndex === -1) {
        return { success: false, reason: 'Unscheduled task not found.' };
    }
    const taskToUpdate = tasks[taskIndex];

    const validation = isValidTaskData(newData.description, undefined, 'unscheduled', undefined, newData.estDuration);
    if (!validation.isValid) {
        return { success: false, reason: validation.reason };
    }

    taskToUpdate.description = newData.description;
    taskToUpdate.priority = newData.priority;
    taskToUpdate.estDuration = newData.estDuration;

    saveTasks(tasks); // Save without full finalization
    return { success: true, task: taskToUpdate };
}


export function confirmUpdateTaskAndReschedule(index, taskData) {
    if (index < 0 || index >= tasks.length) return { success: false, reason: 'Invalid task index.' };
    const taskToUpdate = tasks[index];
    const updatedDetails = { description: taskData.description, type: taskData.taskType, editing: false };
    if (updatedDetails.type === 'scheduled') {
        updatedDetails.duration = taskData.duration;
        const today = extractDateFromDateTime(new Date());
        const startTime = taskData.startTime || extractTimeFromDateTime(new Date(taskToUpdate.startDateTime));
        updatedDetails.startDateTime = timeToDateTime(startTime, today);
        updatedDetails.endDateTime = calculateEndDateTime(updatedDetails.startDateTime, updatedDetails.duration);
    } else {
        updatedDetails.priority = taskData.priority; updatedDetails.estDuration = taskData.estDuration;
    }
    tasks[index] = { ...taskToUpdate, ...updatedDetails };
    if (tasks[index].type === 'scheduled') performReschedule(tasks[index], tasks[index]);
    finalizeTaskModification();
    return { success: true, task: tasks[index] };
}
export function completeTask(index, currentTime24Hour) {
    if (index < 0 || index >= tasks.length) return { success: false, reason: 'Invalid task index.' };
    const task = tasks[index];
    if (task.type === 'scheduled' && currentTime24Hour && task.startDateTime && task.endDateTime) {
        const currentMins = calculateMinutes(currentTime24Hour);
        const startMins = calculateMinutes(extractTimeFromDateTime(new Date(task.startDateTime)));
        const endMins = calculateMinutes(extractTimeFromDateTime(new Date(task.endDateTime)));
        if (currentMins > endMins) {
            return { success: true, task: { ...task }, requiresConfirmation: true, confirmationType: 'COMPLETE_LATE', oldEndTime: extractTimeFromDateTime(new Date(task.endDateTime)), newEndTime: currentTime24Hour, newDuration: Math.max(0, currentMins - startMins) };
        } else if (currentMins < endMins && currentMins >= startMins) {
            task.duration = Math.max(0, currentMins - startMins);
            task.endDateTime = calculateEndDateTime(task.startDateTime, task.duration);
        }
    }
    task.status = 'completed';
    finalizeTaskModification();
    return { success: true, task };
}
export function confirmCompleteLate(index, newEndTime, newDuration) {
    if (index < 0 || index >= tasks.length) return { success: false, reason: 'Invalid task index.' };
    const task = tasks[index];
    if (task.type !== 'scheduled' || !task.startDateTime) return { success: false, reason: 'Cannot confirm late for non-scheduled or invalid task.'};
    task.editing = false; task.status = 'completed'; task.duration = newDuration;
    task.endDateTime = calculateEndDateTime(task.startDateTime, task.duration);
    performReschedule(task, task);
    finalizeTaskModification();
    return { success: true, task };
}
export function editTask(index) { if (index < 0 || index >= tasks.length) return { success: false, reason: 'Invalid task index.' }; resetAllUIFlags(); tasks[index].editing = true; return { success: true, task: tasks[index] }; }
export function cancelEdit(index) { if (index < 0 || index >= tasks.length) return { success: false, reason: 'Invalid task index.' }; if (tasks[index]) tasks[index].editing = false; return { success: true, task: tasks[index] }; }

export function deleteTask(index, confirmed = false) {
    if (index < 0 || index >= tasks.length) return { success: false, reason: 'Invalid task index.' };
    const taskToDelete = tasks[index]; // Store reference before potential splice for logging or type checking

    if (!confirmed && taskToDelete.type === 'scheduled') { // Only scheduled tasks have two-step delete for now
        taskToDelete.confirmingDelete = true;
        return { success: false, requiresConfirmation: true, reason: 'Confirmation required.' };
    }

    tasks.splice(index, 1);
    if (taskToDelete.type === 'scheduled') { // Only reset UI flags if it was a scheduled task deletion (which might have had confirmingDelete flag)
        resetAllUIFlags();
    }
    finalizeTaskModification();
    return { success: true, message: `Task "${taskToDelete.description}" deleted successfully.` };
}

export function deleteUnscheduledTask(taskId) {
    const taskIndex = tasks.findIndex(t => t.id === taskId && t.type === 'unscheduled');
    if (taskIndex === -1) {
        return { success: false, reason: 'Unscheduled task not found.' };
    }
    tasks.splice(taskIndex, 1);
    saveTasks(tasks); // Save without full finalization to preserve order
    return { success: true, message: 'Unscheduled task deleted.' };
}

export function deleteAllTasks() { if (tasks.length === 0) return { success: true, tasksDeleted: 0 }; const num = tasks.length; updateTaskState([]); return { success: true, tasksDeleted: num, message: 'All tasks deleted.' }; }

export function scheduleUnscheduledTask(taskId, startTime) {
    const taskIndex = tasks.findIndex(t => t.id === taskId && t.type === 'unscheduled');
    if (taskIndex === -1) return { success: false, reason: 'Unscheduled task not found.' };
    const unscheduledTask = tasks[taskIndex];
    const newScheduledTaskData = { description: unscheduledTask.description, startTime: startTime, duration: unscheduledTask.estDuration, taskType: 'scheduled' };
    const tempScheduledTask = createTaskObject(newScheduledTaskData);
    const overlaps = checkOverlap(tempScheduledTask, tasks.filter(t => t.type === 'scheduled'));
    if (overlaps.length > 0) {
        return { success: false, requiresConfirmation: true, confirmationType: 'RESCHEDULE_SCHEDULE_UNSCHEDULED', taskData: { unscheduledTaskId: taskId, newScheduledTaskData }, reason: 'Scheduling will overlap. Reschedule others?' };
    }
    tasks.splice(taskIndex, 1);
    const newScheduledTask = createTaskObject(newScheduledTaskData);
    tasks.push(newScheduledTask);
    performReschedule(newScheduledTask);
    finalizeTaskModification();
    return { success: true, task: newScheduledTask };
}

export function confirmScheduleUnscheduledTask(unscheduledTaskId, newScheduledTaskData) {
    const taskIndex = tasks.findIndex(t => t.id === unscheduledTaskId && t.type === 'unscheduled');
    if (taskIndex !== -1) tasks.splice(taskIndex, 1);
    else logger.warn(`Unscheduled task ID ${unscheduledTaskId} not found for confirmation.`);
    const taskToCreate = { ...newScheduledTaskData, taskType: 'scheduled' };
    const newScheduledTask = createTaskObject(taskToCreate);
    tasks.push(newScheduledTask);
    performReschedule(newScheduledTask);
    finalizeTaskModification();
    return { success: true, task: newScheduledTask };
}

export function reorderUnscheduledTask(draggedTaskId, targetTaskId) {
    const draggedTaskIndex = tasks.findIndex(task => task.id === draggedTaskId && task.type === 'unscheduled');
    const targetTaskIndex = tasks.findIndex(task => task.id === targetTaskId && task.type === 'unscheduled');

    if (draggedTaskIndex === -1 || targetTaskIndex === -1) {
        logger.error("Error reordering tasks: One or both tasks not found.", {draggedTaskId, targetTaskId});
        return { success: false, reason: "Could not find tasks to reorder." };
    }

    const [draggedTask] = tasks.splice(draggedTaskIndex, 1);
    // Adjust target index if dragged item was before it
    const adjustedTargetIndex = targetTaskIndex > draggedTaskIndex ? targetTaskIndex -1 : targetTaskIndex;
    tasks.splice(adjustedTargetIndex, 0, draggedTask);

    saveTasks(tasks); // Save the new order
    return { success: true };
}

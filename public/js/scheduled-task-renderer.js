import {
    calculateHoursAndMinutes,
    convertTo12HourTime,
    logger,
    isTaskRunningLate,
    isTaskCurrentlyActive,
    extractTimeFromDateTime
} from './utils.js';
import { findScheduleGaps } from './reschedule-engine.js';

// --- DOM Element Getters ---
export function getScheduledTaskListElement() {
    return document.getElementById('scheduled-task-list');
}

export function getTaskViewElement(taskId) {
    return document.getElementById(`view-task-${taskId}`);
}

export function getTaskEditFormElement(taskId) {
    return /** @type {HTMLFormElement|null} */ (document.getElementById(`edit-task-${taskId}`));
}

// --- Render Functions ---

/**
 * Renders the HTML for a task in edit mode
 * @param {Object} task - The task object
 * @param {number} index - The task index
 * @returns {string} HTML string for the edit form
 */
export function renderEditTaskHTML(task, index) {
    const displayStartTime = task.startDateTime
        ? extractTimeFromDateTime(new Date(task.startDateTime))
        : '';
    const durationHours = task.duration ? Math.floor(task.duration / 60) : 0;
    const durationMinutes = task.duration ? task.duration % 60 : 0;

    return `
        <form id="edit-task-${task.id}" data-task-id="${task.id}" data-task-index="${index}" autocomplete="off" class="p-4 rounded-lg border border-gray-700 bg-gray-800 bg-opacity-70 shadow-lg text-left space-y-4">
            <input type="hidden" name="task-type" value="scheduled">

            <!-- Description Row -->
            <div class="relative">
                <i class="fa-regular fa-pen-to-square absolute left-3 top-1/2 transform -translate-y-1/2 text-teal-400"></i>
                <input type="text" name="description" value="${task.description}" placeholder="What needs to be done?"
                    class="bg-gray-700 pl-10 pr-4 py-2.5 rounded-lg w-full focus:ring-2 focus:ring-teal-400 focus:outline-none transition-all" required>
            </div>

            <!-- Time, Duration, and Buttons Row -->
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <!-- Start Time -->
                <div class="relative">
                    <i class="fa-regular fa-clock absolute left-3 top-1/2 transform -translate-y-1/2 text-teal-400"></i>
                    <input type="time" name="start-time" value="${displayStartTime}"
                        class="bg-gray-700 pl-10 pr-3 py-2 rounded-lg w-full focus:ring-2 focus:ring-teal-400 focus:outline-none transition-all" required>
                </div>

                <!-- Duration -->
                <div class="flex items-center gap-2">
                    <div class="relative flex-1">
                        <i class="fa-regular fa-hourglass absolute left-3 top-1/2 transform -translate-y-1/2 text-teal-400"></i>
                        <input type="number" name="duration-hours" value="${durationHours}" min="0" placeholder="HH"
                            class="bg-gray-700 pl-10 pr-2 py-2 rounded-lg w-full focus:ring-2 focus:ring-teal-400 focus:outline-none transition-all">
                    </div>
                    <span class="text-gray-400 text-lg">:</span>
                    <div class="relative flex-1">
                        <input type="number" name="duration-minutes" value="${durationMinutes.toString().padStart(2, '0')}" min="0" max="59" placeholder="MM"
                            class="bg-gray-700 px-3 py-2 rounded-lg w-full focus:ring-2 focus:ring-teal-400 focus:outline-none transition-all">
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-2 sm:ml-auto">
                    <button type="button" class="btn-edit-cancel w-full sm:w-auto justify-center px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-gray-700 hover:bg-gray-600 border border-gray-600" data-task-id="${task.id}" data-task-index="${index}">
                        <i class="fa-solid fa-xmark mr-2"></i>Cancel
                    </button>
                    <button type="submit" class="w-full sm:w-auto justify-center px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300">
                        <i class="fa-solid fa-check mr-2"></i>Save
                    </button>
                </div>
            </div>
        </form>
    `;
}

/**
 * Renders the HTML for a task in view mode
 * @param {Object} task - The task object
 * @param {number} index - The task index
 * @param {boolean} isActiveTask - Whether this is the active task
 * @returns {string} HTML string for the task view
 */
export function renderViewTaskHTML(task, index, isActiveTask) {
    const isCompleted = task.status === 'completed';
    const checkboxDisabled = isCompleted || !isActiveTask;
    let activeTaskColorClass = 'text-slate-200';
    if (isActiveTask && !isCompleted && task.type === 'scheduled') {
        const isLate = isTaskRunningLate(task);
        activeTaskColorClass = isLate ? 'text-amber-300' : 'text-teal-400';
    }
    const displayStartTime = task.startDateTime
        ? extractTimeFromDateTime(new Date(task.startDateTime))
        : '';
    const displayEndTime = task.endDateTime
        ? extractTimeFromDateTime(new Date(task.endDateTime))
        : '';
    const durationText = calculateHoursAndMinutes(task.duration);

    return `<div id="view-task-${task.id}" class="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-3 rounded-lg border border-slate-700 bg-slate-800 bg-opacity-60 hover:bg-opacity-80 transition-all shadow-md relative gap-2 sm:gap-0" data-task-index="${index}" data-task-id="${task.id}">
        <div class="celebration-container hidden">
            <span class="celebration-emoji">🎉</span>
            <span class="celebration-emoji">🌟</span>
            <span class="celebration-emoji">✨</span>
            <span class="celebration-emoji">🎊</span>
            <span class="celebration-emoji">🏆</span>
            <span class="celebration-emoji">💫</span>
            <span class="celebration-emoji">💪🏾</span>
        </div>
        <div class="flex items-start space-x-3">
            <label for="task-checkbox-${task.id}" class="checkbox mt-0.5 ${checkboxDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}" title="${checkboxDisabled ? (isCompleted ? 'Task already completed' : 'Only the active task can be completed') : 'Mark as complete'}">
                <i class="fa-regular ${isCompleted ? 'fa-check-square text-teal-700' : 'fa-square text-slate-500'} text-lg sm:text-xl"></i>
            </label>
            <input type="checkbox" id="task-checkbox-${task.id}" class="hidden">
            <div class="${isCompleted ? 'line-through opacity-70' : ''} ${isActiveTask && !isCompleted && task.type === 'scheduled' ? '' : isCompleted ? '' : 'opacity-60'} min-w-0 flex-1">
                <div class="${isCompleted ? 'text-white font-medium' : `${activeTaskColorClass} font-medium`} text-sm sm:text-base break-words">${task.description}</div>
                <div class="${isCompleted ? 'text-white' : activeTaskColorClass} text-xs sm:text-sm mt-0.5">${convertTo12HourTime(displayStartTime)} &ndash; ${convertTo12HourTime(displayEndTime)} (${durationText})</div>
            </div>
        </div>
        <div class="flex space-x-1 ml-auto">
            <button class="text-slate-400 hover:text-teal-400 p-1.5 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors btn-lock" title="${task.locked ? 'Unlock task' : 'Lock task'}" data-task-id="${task.id}" data-task-index="${index}">
                <i class="fa-solid ${task.locked ? 'fa-lock text-rose-400' : 'fa-lock-open'} text-sm sm:text-base"></i>
            </button>
            <button class="text-slate-400 hover:text-indigo-400 p-1.5 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors btn-unschedule" title="Unschedule task" data-task-id="${task.id}" data-task-index="${index}">
                <i class="fa-regular fa-calendar-xmark text-sm sm:text-base"></i>
            </button>
            <button class="text-slate-400 hover:text-amber-300 p-1.5 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors btn-edit" title="Edit task">
                <i class="fa-solid fa-pen text-sm sm:text-base"></i>
            </button>
            <button class="${task.confirmingDelete ? 'text-rose-400' : 'text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded-lg transition-colors'} btn-delete p-1.5 sm:p-2" title="Delete task">
                <i class="fa-regular ${task.confirmingDelete ? 'fa-check-circle' : 'fa-trash-can'} text-sm sm:text-base"></i>
            </button>
        </div>
    </div>`;
}

/**
 * Renders a gap indicator between consecutive scheduled tasks
 * @param {Object} gap - Gap object from findScheduleGaps()
 * @returns {string} HTML string for the gap indicator
 */
export function renderGapHTML(gap) {
    const durationText = calculateHoursAndMinutes(gap.durationMinutes);
    return `<div class="schedule-gap flex items-center justify-center py-1 text-xs text-slate-500 cursor-pointer hover:text-teal-300 transition-colors" role="button" tabindex="0" data-gap-start="${gap.startISO}" data-gap-end="${gap.endISO}" data-gap-duration="${gap.durationMinutes}" title="Click to schedule a task in this gap">
        <span class="border-t border-dashed border-slate-600 flex-1"></span>
        <span class="px-2 whitespace-nowrap">${durationText} free</span>
        <span class="border-t border-dashed border-slate-600 flex-1"></span>
    </div>`;
}

/**
 * Renders a boundary marker at the top or bottom of the schedule
 * @param {string} boundaryTime - ISO datetime string for the boundary
 * @param {string} position - 'before' or 'after'
 * @returns {string} HTML string for the boundary marker
 */
export function renderBoundaryMarkerHTML(boundaryTime, position) {
    return `<div class="schedule-boundary hidden flex items-center justify-center py-1 text-xs text-teal-400"
        aria-hidden="true" data-boundary="${position}" data-boundary-time="${boundaryTime}">
        <span class="border-t border-solid border-teal-400 flex-1"></span>
        <span class="px-2 whitespace-nowrap">now</span>
        <span class="border-t border-solid border-teal-400 flex-1"></span>
    </div>`;
}

/**
 * Renders all scheduled tasks
 * @param {Array} tasksToRender - All tasks
 * @param {Object} eventCallbacks - Event callbacks for task actions
 * @param {Function} initializeEventListeners - Function to initialize event listeners
 * @param {Object|null} globalCallbacks - Current global callbacks reference
 * @returns {Object} Updated global callbacks reference
 */
export function renderTasks(
    tasksToRender,
    eventCallbacks,
    initializeEventListeners,
    globalCallbacks
) {
    const taskListElement = getScheduledTaskListElement();
    if (!taskListElement) {
        logger.error('Scheduled task list element not found.');
        return globalCallbacks;
    }

    let updatedCallbacks = globalCallbacks;
    if (!globalCallbacks) {
        initializeEventListeners(eventCallbacks);
        updatedCallbacks = eventCallbacks;
    } else {
        updatedCallbacks = eventCallbacks;
    }

    let activeTaskFound = false;
    const scheduledTasks = tasksToRender.filter((task) => task.type === 'scheduled');

    if (scheduledTasks.length === 0) {
        taskListElement.innerHTML =
            '<p class="text-gray-500 text-sm italic px-2">No scheduled tasks yet. Add some using the form above or schedule a task from below!</p>';
        return updatedCallbacks;
    }

    const gaps = findScheduleGaps(tasksToRender);
    const gapAfterTask = new Map(gaps.map((g) => [g.afterTaskId, g]));

    let html = '';
    html += renderBoundaryMarkerHTML(scheduledTasks[0].startDateTime, 'before');
    scheduledTasks.forEach((task) => {
        const originalIndex = tasksToRender.findIndex((t) => t.id === task.id);
        let isActiveTask = false;
        if (!activeTaskFound && task.status !== 'completed' && isTaskCurrentlyActive(task)) {
            activeTaskFound = true;
            isActiveTask = true;
        }
        html += task.editing
            ? renderEditTaskHTML(task, originalIndex)
            : renderViewTaskHTML(task, originalIndex, isActiveTask);

        const gap = gapAfterTask.get(task.id);
        if (gap) {
            html += renderGapHTML(gap);
        }
    });
    html += renderBoundaryMarkerHTML(
        scheduledTasks[scheduledTasks.length - 1].endDateTime,
        'after'
    );
    taskListElement.innerHTML = html;

    return updatedCallbacks;
}

/**
 * Refreshes the color of the active task based on late status
 * @param {Array} tasks - All tasks
 * @param {Date} [now] - Current time (defaults to new Date())
 */
export function refreshActiveTaskColor(tasks, now = new Date()) {
    const taskListElement = getScheduledTaskListElement();
    if (!taskListElement) return;

    let activeTaskFound = false;
    const scheduledTasksToConsider = tasks.filter((task) => task.type === 'scheduled');

    scheduledTasksToConsider.forEach((task) => {
        const taskViewElement = getTaskViewElement(task.id);
        if (taskViewElement && task.status !== 'completed') {
            const descriptionDiv = taskViewElement.querySelector(
                '.text-slate-200, .text-teal-400, .text-amber-300'
            );
            const timeDiv = taskViewElement.querySelectorAll(
                '.text-slate-200, .text-teal-400, .text-amber-300'
            )[1];

            let newColorClass = 'text-slate-200';
            let isActive = false;

            // Only mark as active if: first incomplete task AND current time is within its range
            if (!activeTaskFound && isTaskCurrentlyActive(task, now)) {
                activeTaskFound = true;
                isActive = true;
            }

            if (isActive) {
                const isLate = isTaskRunningLate(task, now);
                newColorClass = isLate ? 'text-amber-300' : 'text-teal-400';
            }

            if (descriptionDiv) {
                descriptionDiv.classList.remove(
                    'text-slate-200',
                    'text-teal-400',
                    'text-amber-300'
                );
                descriptionDiv.classList.add(newColorClass);
            }
            if (timeDiv) {
                timeDiv.classList.remove('text-slate-200', 'text-teal-400', 'text-amber-300');
                timeDiv.classList.add(newColorClass);
            }
        }
    });
}

/**
 * Triggers the confetti animation for a completed task
 * @param {string} taskId - The task ID
 */
export function triggerConfettiAnimation(taskId) {
    const taskElement = document.getElementById(`view-task-${taskId}`);
    if (taskElement) {
        const celebrationContainer = taskElement.querySelector('.celebration-container');
        if (celebrationContainer) {
            logger.debug(`Celebration container FOUND for task ID: ${taskId}`);
            celebrationContainer.classList.remove('hidden');

            // Reset animation by removing and re-adding emojis
            const emojis = celebrationContainer.querySelectorAll('.celebration-emoji');
            emojis.forEach((emoji) => {
                if (emoji.parentNode) {
                    const clone = emoji.cloneNode(true);
                    emoji.parentNode.replaceChild(clone, emoji);
                }
            });

            setTimeout(() => {
                logger.debug(`setTimeout CALLED to hide celebration for task ID: ${taskId}`);
                celebrationContainer.classList.add('hidden');
            }, 2500); // Match the new 2.5s animation duration
        } else {
            logger.warn(`Celebration container NOT FOUND for task ID: ${taskId}`, taskElement);
        }
    } else {
        logger.warn(`Task element not found for celebration: ${taskId}`);
    }
}

/**
 * Highlights the gap that contains the current time with teal styling
 * @param {Date} [now] - Current time (defaults to new Date())
 */
export function refreshCurrentGapHighlight(now = new Date()) {
    const taskListElement = getScheduledTaskListElement();
    if (!taskListElement) return;

    const gapElements = taskListElement.querySelectorAll('.schedule-gap');
    gapElements.forEach((el) => {
        const start = new Date(el.dataset.gapStart);
        const end = new Date(el.dataset.gapEnd);
        const isCurrent = now >= start && now < end;

        const borderSpans = el.querySelectorAll('.border-t');
        if (isCurrent) {
            el.classList.replace('text-slate-500', 'text-teal-400');
            borderSpans.forEach((s) => {
                s.classList.replace('border-slate-600', 'border-teal-400');
                s.classList.replace('border-dashed', 'border-solid');
            });
        } else {
            el.classList.replace('text-teal-400', 'text-slate-500');
            borderSpans.forEach((s) => {
                s.classList.replace('border-teal-400', 'border-slate-600');
                s.classList.replace('border-solid', 'border-dashed');
            });
        }
    });

    const boundaryElements = taskListElement.querySelectorAll('.schedule-boundary');
    boundaryElements.forEach((el) => {
        const position = el.dataset.boundary;
        const boundaryTime = new Date(el.dataset.boundaryTime);
        const isCurrent =
            (position === 'before' && now < boundaryTime) ||
            (position === 'after' && now >= boundaryTime);
        if (isCurrent) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

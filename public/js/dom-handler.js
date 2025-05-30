import {
    calculateMinutes,
    calculateHoursAndMinutes,
    convertTo12HourTime,
    logger,
    isTaskRunningLate,
    getCurrentTimeRounded,
    extractTimeFromDateTime
} from './utils.js';

// Global event callbacks storage for event delegation
let globalEventCallbacks = null;

// Auto-update state for start time field
const startTimeAutoUpdate = {
    trackedTime: /** @type {string|null} */ (null),
    trackedDate: /** @type {string|null} */ (null),

    isEnabled() {
        return this.trackedTime !== null;
    },

    /**
     * Enable automatic updating of the start time field.
     * Used to track what time was automatically set in the start time input field.
     * Also tracks the date to detect midnight crossings.
     * @param {string} timeValue - The time value to track.
     * @param {Date} [date=new Date()] - The date to track.
     */
    enable(timeValue, date = new Date()) {
        this.trackedTime = timeValue;
        this.trackedDate = date.toDateString();
    },

    disable() {
        this.trackedTime = null;
        this.trackedDate = null;
    },

    hasDateChanged(currentDate = new Date()) {
        return this.trackedDate && this.trackedDate !== currentDate.toDateString();
    }
};

// --- Rendering Functions ---

/**
 * Render current date and time in the UI.
 */
export function renderDateTime() {
    const now = new Date();
    const currentTimeElement = getCurrentTimeElement();
    const currentDateElement = getCurrentDateElement();

    if (currentTimeElement) {
        currentTimeElement.textContent = now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    if (currentDateElement) {
        currentDateElement.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

/**
 * Generate HTML for task edit form.
 * @param {object} task - The task to edit (using a generic object type from task-manager's perspective)
 * @param {number} index - Task index.
 * @returns {string} - HTML for edit form.
 */
function renderEditTaskHTML(task, index) {
    const displayStartTime = extractTimeFromDateTime(new Date(task.startDateTime));

    return `<form id="edit-task-${index}" autocomplete="off" class="mb-4 p-4 rounded border border-gray-700 bg-gray-800 mx-2 text-left space-y-4">
        <div class="mb-4">
            <input type="text" name="description" value="${task.description}" class="bg-gray-700 p-2 rounded w-full" required>
        </div>
        <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-4">
            <label class="flex items-center w-full sm:w-auto">
                <span class="text-gray-400">Start Time</span>
                <input type="time" name="start-time" value="${displayStartTime}" class="bg-gray-700 p-2 rounded w-full lg:w-[10rem]" required>
            </label>
            <label class="flex items-center w-full sm:w-auto">
                <span class="mr-2 text-gray-400">Duration</span>
                <div class="flex space-x-2 w-full sm:w-auto">
                    <input type="number" name="duration-hours" value="${Math.floor(task.duration / 60)}" min="0" class="bg-gray-700 p-2 rounded w-full lg:w-[4rem]">
                    <input type="number" name="duration-minutes" value="${task.duration % 60}" min="0" max="59" class="bg-gray-700 p-2 rounded w-full lg:w-[4rem]">
                </div>
            </label>
            <div class="flex space-x-2">
                <button type="submit" class="bg-green-500 hover:bg-green-400 px-4 py-2 rounded w-full sm:w-auto font-semibold btn-save-edit" data-task-index="${index}">Edit</button>
                <button type="button" class="bg-red-500 hover:bg-red-400 px-4 py-2 rounded w-full sm:w-auto font-semibold btn-edit-cancel" data-task-index="${index}">Cancel</button>
            </div>
        </div>
    </form>`;
}

/**
 * Render a task in view mode.
 * @param {object} task - The task to render.
 * @param {number} index - The index of the task.
 * @param {boolean} isActiveTask - Whether this is the active task for styling.
 * @returns {string} - HTML for the task.
 */
function renderViewTaskHTML(task, index, isActiveTask) {
    const isCompleted = task.status === 'completed';
    const checkboxDisabled = isCompleted;

    // Determine task styling based on active status and completion
    let activeTaskColorClass = 'text-white';
    if (isActiveTask && !isCompleted) {
        const isLate = isTaskRunningLate(task);
        activeTaskColorClass = isLate ? 'text-yellow-500' : 'text-green-500';
    }

    const displayStartTime = extractTimeFromDateTime(new Date(task.startDateTime));
    const displayEndTime = extractTimeFromDateTime(new Date(task.endDateTime));

    return `<div id="view-task-${index}" class="flex items-center justify-between space-x-2 p-2 border-b">
        <div class="flex items-center space-x-4">
            <label for="task-checkbox-${index}" class="checkbox ${checkboxDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
                <i class="far ${isCompleted ? 'fa-check-square text-green-700' : 'fa-square text-gray-500'}"></i>
            </label>
            <input type="checkbox" id="task-checkbox-${index}" class="hidden" data-task-index="${index}" ${isCompleted ? 'checked disabled' : ''}>
            <div class="${isCompleted ? 'line-through' : ''} ${isActiveTask && !isCompleted ? '' : isCompleted ? '' : 'opacity-60'}">
                <div class="${activeTaskColorClass}">${task.description}</div>
                <div class="${activeTaskColorClass}">${convertTo12HourTime(displayStartTime)} &ndash; ${convertTo12HourTime(displayEndTime)} (${calculateHoursAndMinutes(task.duration)})</div>
            </div>
        </div>
        <div>
            <button class="${isCompleted ? 'text-gray-500 cursor-not-allowed' : 'text-yellow-500'} btn-edit p-1" ${isCompleted ? 'disabled' : ''} data-task-index="${index}">
                <i class="far fa-pen"></i>
            </button>
            <button class="${task.confirmingDelete ? 'text-red-500' : isCompleted ? 'text-gray-500 cursor-not-allowed' : 'text-red-500'} btn-delete p-1" ${isCompleted ? 'disabled' : ''} data-task-index="${index}">
                <i class="far ${task.confirmingDelete ? 'fa-check-circle' : 'fa-trash-can'}"></i>
            </button>
        </div>
    </div>`;
}

/**
 * Initialize event delegation for task list interactions.
 * This sets up a single event listener on the task list container that handles all task interactions.
 * This approach prevents memory leaks and improves performance by avoiding multiple event listeners.
 * @param {object} eventCallbacks - Callbacks for task actions.
 */
function initializeTaskListEventDelegation(eventCallbacks) {
    const taskListElement = getTaskListElement();
    if (!taskListElement) {
        logger.error('Task list element not found. Event delegation cannot be initialized.');
        return;
    }

    // Remove any existing event listener to prevent duplicates
    taskListElement.removeEventListener('click', handleTaskListClick);
    taskListElement.removeEventListener('submit', handleTaskListSubmit);

    // Store callbacks globally for the event handlers
    globalEventCallbacks = eventCallbacks;

    // Add single delegated event listeners
    taskListElement.addEventListener('click', handleTaskListClick);
    taskListElement.addEventListener('submit', handleTaskListSubmit);
}

/**
 * Handle click events on the task list using event delegation.
 * @param {Event} event - The click event
 */
function handleTaskListClick(event) {
    if (!globalEventCallbacks) return;

    const target = /** @type {HTMLElement} */ (event.target);
    const taskIndex = getTaskIndexFromElement(target);

    if (taskIndex === null) return;

    // Handle checkbox clicks (task completion)
    if (target.closest('.checkbox')) {
        event.preventDefault();
        globalEventCallbacks.onCompleteTask(taskIndex);
        return;
    }

    // Handle edit button clicks
    if (target.closest('.btn-edit')) {
        event.preventDefault();
        globalEventCallbacks.onEditTask(taskIndex);
        return;
    }

    // Handle delete button clicks
    if (target.closest('.btn-delete')) {
        event.preventDefault();
        event.stopPropagation();
        globalEventCallbacks.onDeleteTask(taskIndex);
        return;
    }

    // Handle cancel button clicks
    if (target.closest('.btn-edit-cancel')) {
        event.preventDefault();
        globalEventCallbacks.onCancelEdit(taskIndex);
        return;
    }
}

/**
 * Handle form submit events on the task list using event delegation.
 * @param {Event} event - The submit event
 */
function handleTaskListSubmit(event) {
    if (!globalEventCallbacks) return;

    const target = /** @type {HTMLElement} */ (event.target);
    const taskIndex = getTaskIndexFromElement(target);

    if (taskIndex === null) return;

    // Handle edit form submissions
    if (target.id && target.id.startsWith('edit-task-')) {
        event.preventDefault();
        const formData = new FormData(/** @type {HTMLFormElement} */ (target));
        globalEventCallbacks.onSaveTaskEdit(taskIndex, formData);
        return;
    }
}

/**
 * Extract task index from DOM element or its data attributes.
 * @param {HTMLElement} element - The DOM element
 * @returns {number | null} - The task index or null if not found
 */
function getTaskIndexFromElement(element) {
    // Check for data-task-index attribute on the element or its parents
    let current = element;
    while (current && current !== document.body) {
        if (current.dataset && current.dataset.taskIndex !== undefined) {
            const index = parseInt(current.dataset.taskIndex, 10);
            return isNaN(index) ? null : index;
        }

        // Check for edit form ID pattern
        if (current.id && current.id.startsWith('edit-task-')) {
            const index = parseInt(current.id.replace('edit-task-', ''), 10);
            return isNaN(index) ? null : index;
        }

        // Check for view task ID pattern
        if (current.id && current.id.startsWith('view-task-')) {
            const index = parseInt(current.id.replace('view-task-', ''), 10);
            return isNaN(index) ? null : index;
        }

        current = /** @type {HTMLElement} */ (current.parentElement);
    }

    return null;
}

/**
 * Render all tasks in the task list using optimized DOM operations.
 * Uses event delegation.
 * @param {object[]} tasksToRender - Array of tasks to render.
 * @param {object} eventCallbacks - Callbacks for task actions.
 * @param {(index: number) => void} eventCallbacks.onCompleteTask - Callback for completing a task.
 * @param {(index: number) => void} eventCallbacks.onEditTask - Callback for initiating task edit.
 * @param {(index: number) => void} eventCallbacks.onDeleteTask - Callback for deleting a task.
 * @param {(index: number, formData: FormData) => void} eventCallbacks.onSaveTaskEdit - Callback for saving an edited task.
 * @param {(index: number) => void} eventCallbacks.onCancelEdit - Callback for cancelling task edit.
 */
export function renderTasks(tasksToRender, eventCallbacks) {
    const taskListElement = getTaskListElement();
    if (!taskListElement) {
        logger.error('Task list element not found. Tasks will not be rendered.');
        return;
    }

    // Initialize event delegation if not already done
    if (!globalEventCallbacks) {
        initializeTaskListEventDelegation(eventCallbacks);
    } else {
        // Update callbacks if they've changed
        globalEventCallbacks = eventCallbacks;
    }

    // Render tasks efficiently using innerHTML (single DOM operation)
    let activeTaskFound = false;
    taskListElement.innerHTML = tasksToRender
        .map((task, index) => {
            let isActiveTask = false;
            if (!activeTaskFound && task.status !== 'completed') {
                activeTaskFound = true;
                isActiveTask = true;
            }
            return task.editing
                ? renderEditTaskHTML(task, index)
                : renderViewTaskHTML(task, index, isActiveTask);
        })
        .join('');
}

/**
 * Update the start time input field with a suggested time.
 * @param {string} suggestedTime - The suggested start time in HH:MM format.
 * @param {boolean} [forceUpdate=false] - Whether to update the field even if it has a value.
 */
export function updateStartTimeField(suggestedTime, forceUpdate = false) {
    const form = getTaskFormElement();
    if (!form) return;
    const startTimeInput = /** @type {HTMLInputElement|null} */ (
        form.querySelector('input[name="start-time"]')
    );
    if (startTimeInput && (forceUpdate || !startTimeInput.value)) {
        startTimeInput.value = suggestedTime;

        // Track if we're setting it to current time rounded up
        const currentTimeRounded = getCurrentTimeRounded();
        if (suggestedTime === currentTimeRounded) {
            startTimeAutoUpdate.enable(suggestedTime);
        } else {
            startTimeAutoUpdate.disable();
        }
    }
}

/**
 * Check if the start time field should be updated when current time advances.
 * Updates the field if it was previously set to current time rounded up and current time has advanced.
 */
export function refreshStartTimeField() {
    // Only check if we previously set the field to current time rounded up
    if (!startTimeAutoUpdate.isEnabled()) return;

    const form = getTaskFormElement();
    if (!form) return;

    const startTimeInput = /** @type {HTMLInputElement|null} */ (
        form.querySelector('input[name="start-time"]')
    );
    if (!startTimeInput) return;

    // Check if the field still has the value we set it to
    if (startTimeInput.value !== startTimeAutoUpdate.trackedTime) {
        // User has manually changed the field, stop tracking
        startTimeAutoUpdate.disable();
        return;
    }

    const currentTimeRounded = getCurrentTimeRounded();
    const currentTimeMinutes = calculateMinutes(currentTimeRounded);
    const fieldTimeMinutes = calculateMinutes(startTimeAutoUpdate.trackedTime);

    // Check if date has changed (definitive midnight crossing) OR time has advanced
    const dateChanged = startTimeAutoUpdate.hasDateChanged();
    const timeAdvanced = currentTimeMinutes > fieldTimeMinutes;

    if (timeAdvanced || dateChanged) {
        startTimeInput.value = currentTimeRounded;
        startTimeAutoUpdate.enable(currentTimeRounded);
    }
}

/**
 * Disables automatic updating of the start time field.
 * Called when the form is reset, when the field is manually changed,
 * or when we want to stop tracking and updating the field based on current time.
 */
export function disableStartTimeAutoUpdate() {
    startTimeAutoUpdate.disable();
}

/**
 * Initialize event listeners for static page elements.
 * @param {object} appCallbacks - Callbacks for application logic.
 * @param {(formData: FormData) => void} appCallbacks.onTaskFormSubmit - Handles main task form submission.
 * @param {() => void} appCallbacks.onDeleteAllTasks - Handles delete all button click.
 * @param {(event: Event) => void} appCallbacks.onGlobalClick - Handles clicks on the document.
 * @param {HTMLFormElement | null} taskFormElement - The main task form element.
 * @param {HTMLButtonElement | null} deleteAllButtonElement - The delete all button element.
 */
export function initializePageEventListeners(
    appCallbacks,
    taskFormElement,
    deleteAllButtonElement
) {
    if (taskFormElement) {
        taskFormElement.addEventListener('submit', (e) => {
            e.preventDefault();
            appCallbacks.onTaskFormSubmit(new FormData(taskFormElement));
        });

        // Reset tracking when form is reset
        taskFormElement.addEventListener('reset', () => {
            disableStartTimeAutoUpdate();
        });

        // Reset tracking when start time field is manually changed
        const startTimeInput = taskFormElement.querySelector('input[name="start-time"]');
        if (startTimeInput) {
            startTimeInput.addEventListener('input', () => {
                disableStartTimeAutoUpdate();
            });
        }
    } else {
        logger.error('dom-handler: initializePageEventListeners received null taskFormElement.');
    }

    if (deleteAllButtonElement) {
        deleteAllButtonElement.addEventListener('click', appCallbacks.onDeleteAllTasks);
    } else {
        logger.error(
            'dom-handler: initializePageEventListeners received null deleteAllButtonElement.'
        );
    }

    document.addEventListener('click', appCallbacks.onGlobalClick);
}

/**
 * Returns a reference to the main task form.
 * @returns {HTMLFormElement | null}
 */
export function getTaskFormElement() {
    return /** @type {HTMLFormElement|null} */ (document.getElementById('task-form'));
}

/**
 * Returns a reference to the task list container.
 * @returns {HTMLElement | null}
 */
export function getTaskListElement() {
    return document.getElementById('task-list');
}

/**
 * Returns a reference to the current time display element.
 * @returns {HTMLElement | null}
 */
export function getCurrentTimeElement() {
    return document.getElementById('current-time');
}

/**
 * Returns a reference to the current date display element.
 * @returns {HTMLElement | null}
 */
export function getCurrentDateElement() {
    return document.getElementById('current-date');
}

/**
 * Returns a reference to the delete all button.
 * @returns {HTMLButtonElement | null}
 */
export function getDeleteAllButtonElement() {
    return /** @type {HTMLButtonElement|null} */ (document.getElementById('delete-all'));
}

/**
 * Returns a reference to a specific task view element.
 * @param {number} index - The task index
 * @returns {HTMLElement | null}
 */
export function getTaskViewElement(index) {
    return document.getElementById(`view-task-${index}`);
}

/**
 * Returns a reference to a specific task edit form element.
 * @param {number} index - The task index
 * @returns {HTMLFormElement | null}
 */
export function getTaskEditFormElement(index) {
    return /** @type {HTMLFormElement|null} */ (document.getElementById(`edit-task-${index}`));
}

/**
 * Focuses on the main task description input field.
 */
export function focusTaskDescriptionInput() {
    const form = getTaskFormElement();
    const descriptionInput = form ? form.querySelector('input[name="description"]') : null;
    if (descriptionInput instanceof HTMLInputElement) {
        descriptionInput.focus();
    }
}

/**
 * Shows an alert message to the user.
 * @param {string} message
 */
export function showAlert(message) {
    window.alert(message);
}

/**
 * Asks for user confirmation.
 * @param {string} message
 * @returns {boolean}
 */
export function askConfirmation(message) {
    return window.confirm(message);
}

/**
 * Extracts task form data from a FormData object.
 * @param {FormData} formData - The form data containing task details
 * @returns {{description: string, startTime: string, duration: number}} Object containing extracted task data
 */
export function extractTaskFormData(formData) {
    const description = /** @type {string} */ (formData.get('description') || '');
    const startTime = /** @type {string} */ (formData.get('start-time') || '');
    const durationHours = formData.get('duration-hours') || '0';
    const durationMinutes = formData.get('duration-minutes') || '0';
    const duration = calculateMinutes(`${durationHours}:${durationMinutes}`);
    return { description, startTime, duration };
}

/**
 * Reset event delegation state (for testing purposes).
 * This allows tests to reinitialize event delegation with fresh callbacks.
 */
export function resetEventDelegation() {
    globalEventCallbacks = null;

    // Remove existing event listeners from task list
    const taskListElement = getTaskListElement();
    if (taskListElement) {
        taskListElement.removeEventListener('click', handleTaskListClick);
        taskListElement.removeEventListener('submit', handleTaskListSubmit);
    }
}

/**
 * Update active task styling for late warning.
 * This function finds the first incomplete task and updates its color styling based on whether it's running late.
 * @param {object[]} tasks - Array of all tasks to check for the active task
 * @param {Date} [now] - Current date and time - defaults to the current date and time
 */
export function refreshActiveTaskColor(tasks, now = new Date()) {
    // Find the first incomplete task (the active task)
    let activeTaskIndex = -1;
    for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].status !== 'completed') {
            activeTaskIndex = i;
            break;
        }
    }

    // If no active task found, nothing to update
    if (activeTaskIndex === -1) return;

    const activeTask = tasks[activeTaskIndex];
    const isLate = isTaskRunningLate(activeTask, now);

    // Find the DOM elements for this task
    const taskElement = getTaskViewElement(activeTaskIndex);
    if (!taskElement) return; // Task might be in edit mode or not rendered

    // Find the text elements that need color updates - only those that already have color classes
    const textElements = taskElement.querySelectorAll('div.text-green-500, div.text-yellow-500');

    // Determine the target color class
    const targetColorClass = isLate ? 'text-yellow-500' : 'text-green-500';
    const otherColorClass = isLate ? 'text-green-500' : 'text-yellow-500';

    // Update the color classes efficiently - only change if needed
    textElements.forEach((element) => {
        // Only update if the element doesn't already have the correct color
        if (!element.classList.contains(targetColorClass)) {
            // Remove the other color class if present
            if (element.classList.contains(otherColorClass)) {
                element.classList.remove(otherColorClass);
            }
            // Add the target color class
            element.classList.add(targetColorClass);
        }
    });
}

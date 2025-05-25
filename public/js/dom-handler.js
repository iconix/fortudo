import {
    calculateMinutes, // Needed for parsing duration in edit form submit if handled here
    calculateHoursAndMinutes,
    convertTo12HourTime,
    logger
    // getFormattedDate, // renderDateTime can use Date().toLocaleDateString directly
    // getFormattedTime, // renderDateTime can use Date().toLocaleTimeString directly
} from './utils.js';

// --- DOM Element References ---
// Elements used for attaching initial event listeners or frequent access will be fetched by functions.
// export const taskForm = document.getElementById('task-form'); // Deferred to functions
// export const taskListElement = document.getElementById('task-list'); // Now fetched dynamically
// export const currentTimeElement = document.getElementById('current-time'); // Now fetched dynamically
// export const currentDateElement = document.getElementById('current-date'); // Now fetched dynamically
// export const deleteAllButton = document.getElementById('delete-all'); // Deferred to functions
// export const taskDescriptionInput = taskForm ? taskForm.querySelector('input[name="description"]') : null; // Deferred


// --- Rendering Functions ---

/**
 * Render current date and time in the UI.
 */
export function renderDateTime() {
    const now = new Date();
    const currentTimeElement = document.getElementById('current-time');
    const currentDateElement = document.getElementById('current-date');

    if (currentTimeElement) {
        currentTimeElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (currentDateElement) {
        currentDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
}

/**
 * Generate HTML for task edit form. (Internal helper)
 * @param {object} task - The task to edit (using a generic object type from task-manager's perspective)
 * @param {number} index - Task index.
 * @returns {string} - HTML for edit form.
 */
function renderEditTaskHTML(task, index) {
    return `<form id="edit-task-${index}" autocomplete="off" class="mb-4 p-4 rounded border border-gray-700 bg-gray-800 mx-2 text-left space-y-4">
        <div class="mb-4">
            <input type="text" name="description" value="${task.description}" class="bg-gray-700 p-2 rounded w-full" required>
        </div>
        <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-4">
            <label class="flex items-center w-full sm:w-auto">
                <span class="text-gray-400">Start Time</span>
                <input type="time" name="start-time" value="${task.startTime}" class="bg-gray-700 p-2 rounded w-full lg:w-[10rem]" required>
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
 * Render a task in view mode. (Internal helper)
 * @param {object} task - The task to render.
 * @param {number} index - The index of the task.
 * @param {boolean} isFirstIncompleteForStyling - Whether this is the first incomplete task for styling.
 * @returns {string} - HTML for the task.
 */
function renderViewTaskHTML(task, index, isFirstIncompleteForStyling) {
    const isCompleted = task.status === 'completed';
    const checkboxDisabled = isCompleted;

    return `<div id="view-task-${index}" class="flex items-center justify-between space-x-2 p-2 border-b">
        <div class="flex items-center space-x-4">
            <label for="task-checkbox-${index}" class="checkbox ${checkboxDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}">
                <i class="far ${isCompleted ? 'fa-check-square text-green-700' : 'fa-square text-gray-500'}"></i>
            </label>
            <input type="checkbox" id="task-checkbox-${index}" class="hidden" data-task-index="${index}" ${isCompleted ? 'checked disabled' : ''}>
            <div class="${isCompleted ? 'line-through' : ''} ${isFirstIncompleteForStyling && !isCompleted ? '' : (isCompleted ? '' : 'opacity-60') }">
                <div class="${isFirstIncompleteForStyling && !isCompleted ? 'text-green-500' : ''}">${task.description}</div>
                <div class="${isFirstIncompleteForStyling && !isCompleted ? 'text-green-500' : ''}">${convertTo12HourTime(task.startTime)} &ndash; ${convertTo12HourTime(task.endTime)} (${calculateHoursAndMinutes(task.duration)})</div>
            </div>
        </div>
        <div>
            <button class="${isCompleted ? 'text-gray-500 cursor-not-allowed' : 'text-yellow-500'} btn-edit p-1" ${isCompleted ? 'disabled' : ''} data-task-index="${index}">
                <i class="far fa-pen"></i>
            </button>
            <button class="${task.confirmingDelete ? 'text-red-500' : (isCompleted ? 'text-gray-500 cursor-not-allowed' : 'text-red-500')} btn-delete p-1" ${isCompleted ? 'disabled' : ''} data-task-index="${index}">
                <i class="far ${task.confirmingDelete ? 'fa-check-circle' : 'fa-trash-can'}"></i>
            </button>
        </div>
    </div>`;
}

/**
 * Render all tasks in the task list and attach event listeners.
 * @param {object[]} tasksToRender - Array of tasks to render.
 * @param {object} eventCallbacks - Callbacks for task actions.
 * @param {(index: number) => void} eventCallbacks.onCompleteTask - Callback for completing a task.
 * @param {(index: number) => void} eventCallbacks.onEditTask - Callback for initiating task edit.
 * @param {(index: number) => void} eventCallbacks.onDeleteTask - Callback for deleting a task.
 * @param {(index: number, formData: FormData) => void} eventCallbacks.onSaveTaskEdit - Callback for saving an edited task.
 * @param {(index: number) => void} eventCallbacks.onCancelEdit - Callback for cancelling task edit.
 */
export function renderTasks(tasksToRender, eventCallbacks) {
    const taskListElement = document.getElementById('task-list');
    if (!taskListElement) {
        logger.error('Task list element not found. Tasks will not be rendered.');
        return;
    }

    let firstIncompleteTaskFound = false;
    taskListElement.innerHTML = tasksToRender.map((task, index) => {
        let isFirstForStyling = false;
        if (!firstIncompleteTaskFound && task.status !== 'completed') {
            firstIncompleteTaskFound = true;
            isFirstForStyling = true;
        }
        return task.editing ? renderEditTaskHTML(task, index) : renderViewTaskHTML(task, index, isFirstForStyling);
    }).join('');

    tasksToRender.forEach((task, index) => {
        const viewTaskElement = taskListElement.querySelector(`#view-task-${index}`);
        const editTaskForm = taskListElement.querySelector(`#edit-task-${index}`);

        if (task.editing && editTaskForm && editTaskForm instanceof HTMLFormElement) {
            editTaskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                eventCallbacks.onSaveTaskEdit(index, new FormData(editTaskForm));
            });
            const cancelButton = editTaskForm.querySelector('.btn-edit-cancel');
            if (cancelButton) {
                cancelButton.addEventListener('click', () => eventCallbacks.onCancelEdit(index));
            }
        } else if (!task.editing && viewTaskElement) {
            const checkboxLabel = viewTaskElement.querySelector(`.checkbox`);
            if (checkboxLabel && task.status !== 'completed') {
                 checkboxLabel.addEventListener('click', () => eventCallbacks.onCompleteTask(index));
            }

            const editButton = viewTaskElement.querySelector(`.btn-edit`);
            if (editButton && task.status !== 'completed') {
                editButton.addEventListener('click', () => eventCallbacks.onEditTask(index));
            }

            const deleteButton = viewTaskElement.querySelector(`.btn-delete`);
            if (deleteButton && task.status !== 'completed') {
                // Prevent delete button clicks from bubbling to global click handlers.
                // This ensures that global handlers (like those that reset editing/confirmation states)
                // don't interfere with the delete confirmation workflow.
                deleteButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    eventCallbacks.onDeleteTask(index);
                });
            }
        }
    });
}

/**
 * Update the start time input field with a suggested time.
 * @param {string} suggestedTime - The suggested start time in HH:MM format.
 */
export function updateStartTimeField(suggestedTime) {
    const form = document.getElementById('task-form');
    if (!form) return;
    const startTimeInput = /** @type {HTMLInputElement|null} */(form.querySelector('input[name="start-time"]'));
    if (startTimeInput && !startTimeInput.value) {
        startTimeInput.value = suggestedTime;
    }
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
export function initializePageEventListeners(appCallbacks, taskFormElement, deleteAllButtonElement) {
    if (taskFormElement) {
        taskFormElement.addEventListener('submit', (e) => {
            e.preventDefault();
            appCallbacks.onTaskFormSubmit(new FormData(taskFormElement));
        });
    } else {
        logger.error("dom-handler: initializePageEventListeners received null taskFormElement.");
    }

    if (deleteAllButtonElement) {
        deleteAllButtonElement.addEventListener('click', appCallbacks.onDeleteAllTasks);
    } else {
        logger.error("dom-handler: initializePageEventListeners received null deleteAllButtonElement.");
    }

    document.addEventListener('click', appCallbacks.onGlobalClick);
}

/**
 * Returns a reference to the main task form.
 * @returns {HTMLFormElement | null}
 */
export function getTaskFormElement() {
    return /** @type {HTMLFormElement|null} */(document.getElementById('task-form'));
}

/**
 * Focuses on the main task description input field.
 */
export function focusTaskDescriptionInput() {
    const form = document.getElementById('task-form');
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

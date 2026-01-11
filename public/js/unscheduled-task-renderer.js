import { calculateHoursAndMinutes, logger } from './utils.js';
import { toggleUnscheduledTaskInlineEdit } from './form-utils.js';

// --- DOM Element Getters ---
export function getUnscheduledTaskListElement() {
    return document.getElementById('unscheduled-task-list');
}

// --- Helper Functions ---

/**
 * Priority configuration for visual styling
 */
const PRIORITY_CONFIG = {
    high: {
        border: 'border-rose-400',
        bg: 'bg-rose-400 bg-opacity-20',
        text: 'text-rose-300',
        icon: 'fa-arrow-up',
        focusRing: 'rose-400'
    },
    medium: {
        border: 'border-indigo-400',
        bg: 'bg-indigo-400 bg-opacity-20',
        text: 'text-indigo-300',
        icon: 'fa-equals',
        focusRing: 'indigo-300'
    },
    low: {
        border: 'border-pink-400',
        bg: 'bg-pink-400 bg-opacity-20',
        text: 'text-pink-300',
        icon: 'fa-arrow-down',
        focusRing: 'pink-400'
    }
};

/**
 * Gets the CSS classes for a priority level
 * @param {string} priority - The priority level ('high', 'medium', or 'low')
 * @returns {Object} An object with CSS class properties
 */
export function getPriorityClasses(priority) {
    const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
    return {
        border: config.border,
        bg: config.bg,
        text: config.text,
        icon: config.icon,
        focusRing: config.focusRing,
        checkbox: 'text-teal-700'
    };
}

function getDurationText(estDuration) {
    return calculateHoursAndMinutes(estDuration, true).text;
}

/**
 * Creates the display view HTML for a task card
 * @param {Object} task - The task object
 * @param {Object} priorityClasses - CSS classes for priority styling
 * @param {string} durationText - Formatted duration text
 * @param {boolean} isCompleted - Whether the task is completed
 * @returns {string} HTML string for the display view
 */
function createTaskDisplayHTML(task, priorityClasses, durationText, isCompleted) {
    const completedClass = isCompleted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
    const completedTitle = isCompleted ? 'Task already completed' : 'Toggle complete status';
    const checkIcon = isCompleted ? 'fa-check-square text-indigo-400' : 'fa-square text-slate-500';
    const textStrike = isCompleted ? 'line-through opacity-70' : '';
    const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
    const disabledAttr = isCompleted ? 'disabled class="opacity-50 cursor-not-allowed"' : '';

    return `
        <div class="flex items-start space-x-3 min-w-0 flex-1">
            <label class="task-checkbox-unscheduled mt-0.5 ${completedClass}" title="${completedTitle}">
                <i class="fa-regular ${checkIcon} text-lg sm:text-xl"></i>
            </label>
            <div class="min-w-0 flex-1">
                <div class="font-medium text-white ${textStrike} text-sm sm:text-base break-words">${task.description}</div>
                <div class="text-xs text-gray-400 mt-1.5 flex items-center flex-wrap gap-1.5 ${isCompleted ? 'opacity-70' : ''}">
                    <span class="priority-badge inline-flex items-center ${priorityClasses.bg} ${priorityClasses.text} px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs">
                        <i class="${priorityClasses.icon} mr-1 text-xs"></i>${priorityLabel} Priority
                    </span>
                    <span class="inline-flex items-center text-gray-400 text-xs">
                        <i class="fa-regular fa-hourglass mr-1"></i>Est: ${durationText}
                    </span>
                </div>
            </div>
        </div>
        <div class="flex space-x-1 ml-auto">
            <button class="text-gray-400 hover:text-teal-400 p-1.5 sm:p-2 hover:bg-gray-700 rounded-lg transition-colors btn-schedule-task" title="Schedule task" data-task-id="${task.id}" ${disabledAttr}>
                <i class="fa-regular fa-calendar-plus text-sm sm:text-base"></i>
            </button>
            <button class="text-gray-400 hover:text-amber-300 p-1.5 sm:p-2 hover:bg-gray-700 rounded-lg transition-colors btn-edit-unscheduled" title="Edit task" data-task-id="${task.id}">
                <i class="fa-solid fa-pen text-sm sm:text-base"></i>
            </button>
            <button class="${task.confirmingDelete ? 'text-rose-400' : 'text-gray-400 hover:text-rose-500 hover:bg-gray-700 rounded-lg transition-colors'} btn-delete-unscheduled p-1.5 sm:p-2" title="Delete task" data-task-id="${task.id}">
                <i class="fa-regular ${task.confirmingDelete ? 'fa-check-circle' : 'fa-trash-can'} text-sm sm:text-base"></i>
            </button>
        </div>
    `;
}

/**
 * Creates the inline edit form HTML for a task
 * @param {Object} task - The task object
 * @returns {string} HTML string for the inline edit form
 */
function createInlineEditFormHTML(task) {
    const checkedHigh = task.priority === 'high' ? 'checked' : '';
    const checkedMed = task.priority === 'medium' ? 'checked' : '';
    const checkedLow = task.priority === 'low' ? 'checked' : '';

    return `
        <form class="space-y-3">
            <!-- Description Row -->
            <div class="relative">
                <i class="fa-regular fa-pen-to-square absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-300"></i>
                <input type="text" id="inline-edit-description-${task.id}" name="inline-edit-description"
                    placeholder="What needs to be done?"
                    class="task-edit-description bg-gray-700 pl-9 pr-3 py-2 rounded-lg w-full focus:ring-2 focus:ring-indigo-300 focus:outline-none transition-all text-sm sm:text-base" required>
            </div>

            <!-- Priority, Duration, and Buttons Row -->
            <div class="flex flex-col sm:flex-row gap-3">
                <!-- Priority -->
                <div class="flex items-center gap-2 sm:min-w-[200px]">
                    <label class="flex-1">
                        <input type="radio" name="inline-edit-priority" value="high" class="hidden peer" ${checkedHigh}>
                        <div class="task-edit-priority-option text-center py-1.5 px-2 rounded-lg border border-gray-600 bg-gray-700 bg-opacity-30
                            peer-checked:bg-rose-500 peer-checked:bg-opacity-20
                            hover:bg-opacity-50 cursor-pointer transition-all text-sm">
                            <i class="fa-solid fa-bars text-rose-400"></i>
                            <span class="ml-1">High</span>
                        </div>
                    </label>
                    <label class="flex-1">
                        <input type="radio" name="inline-edit-priority" value="medium" class="hidden peer" ${checkedMed}>
                        <div class="task-edit-priority-option text-center py-1.5 px-2 rounded-lg border border-gray-600 bg-gray-700 bg-opacity-30
                            peer-checked:bg-amber-400 peer-checked:bg-opacity-20
                            hover:bg-opacity-50 cursor-pointer transition-all text-sm">
                            <i class="fa-regular fa-equals text-amber-400"></i>
                            <span class="ml-1">Med</span>
                        </div>
                    </label>
                    <label class="flex-1">
                        <input type="radio" name="inline-edit-priority" value="low" class="hidden peer" ${checkedLow}>
                        <div class="task-edit-priority-option text-center py-1.5 px-2 rounded-lg border border-gray-600 bg-gray-700 bg-opacity-30
                            peer-checked:bg-teal-500 peer-checked:bg-opacity-20
                            hover:bg-opacity-50 cursor-pointer transition-all text-sm">
                            <i class="fa-solid fa-minus text-teal-400"></i>
                            <span class="ml-1">Low</span>
                        </div>
                    </label>
                </div>

                <!-- Estimated Duration -->
                <div class="flex items-center gap-2 sm:min-w-[140px]">
                    <div class="relative flex-1">
                        <i class="fa-regular fa-hourglass absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-300"></i>
                        <input type="number" name="inline-edit-est-duration-hours" placeholder="HH" min="0"
                            class="task-edit-duration-hours bg-gray-700 pl-9 pr-2 py-2 rounded-lg w-full focus:ring-2 focus:ring-indigo-300 focus:outline-none transition-all text-sm sm:text-base">
                    </div>
                    <span class="text-gray-400 text-lg">:</span>
                    <div class="relative flex-1">
                        <input type="number" name="inline-edit-est-duration-minutes" placeholder="MM" min="0" max="59"
                            class="task-edit-duration-minutes bg-gray-700 px-3 py-2 rounded-lg w-full focus:ring-2 focus:ring-indigo-300 focus:outline-none transition-all text-sm sm:text-base">
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-2 sm:ml-auto">
                    <button type="button" class="btn-cancel-inline-edit px-3 sm:px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-gray-700 hover:bg-gray-600 border border-gray-600 text-sm sm:text-base flex-1 sm:flex-none justify-center">
                        <i class="fa-solid fa-xmark mr-2"></i>Cancel
                    </button>
                    <button type="button" class="btn-save-inline-edit px-3 sm:px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-sm sm:text-base flex-1 sm:flex-none justify-center">
                        <i class="fa-regular fa-save mr-2"></i>Save
                    </button>
                </div>
            </div>
        </form>
    `;
}

/**
 * Creates a complete task card element for an unscheduled task
 * @param {Object} task - The task object
 * @returns {HTMLDivElement} The task card element
 */
function createUnscheduledTaskCard(task) {
    const priorityClasses = getPriorityClasses(task.priority);
    const isCompleted = task.status === 'completed';
    const durationText = getDurationText(task.estDuration);

    const taskCard = document.createElement('div');
    taskCard.className = `task-card bg-gray-800 bg-opacity-60 ${priorityClasses.border} p-2 sm:p-4 rounded-lg shadow-lg flex flex-col gap-2`;
    taskCard.dataset.taskId = task.id;
    taskCard.dataset.taskName = task.description;
    taskCard.dataset.taskEstDuration = durationText;

    // Display view
    const taskDisplayPart = document.createElement('div');
    taskDisplayPart.className =
        'task-display-view flex flex-col sm:flex-row justify-between items-start w-full gap-2 sm:gap-0';
    taskDisplayPart.innerHTML = createTaskDisplayHTML(
        task,
        priorityClasses,
        durationText,
        isCompleted
    );
    taskCard.appendChild(taskDisplayPart);

    // Inline edit form (hidden by default)
    const editFormContainer = document.createElement('div');
    editFormContainer.className =
        'inline-edit-unscheduled-form hidden mt-3 pt-3 border-t border-gray-700 w-full';
    editFormContainer.innerHTML = createInlineEditFormHTML(task);
    taskCard.appendChild(editFormContainer);

    return taskCard;
}

// --- Render Functions ---

const EMPTY_STATE_MESSAGE =
    '<p class="text-gray-500 text-sm italic px-2">No unscheduled tasks yet. Add some using the form above!</p>';

/**
 * Renders all unscheduled tasks
 * @param {Array} unscheduledTasks - Array of unscheduled tasks
 * @param {Object} eventCallbacks - Event callbacks for task actions
 * @param {Function} setGlobalCallbacks - Function to set global callbacks
 */
export function renderUnscheduledTasks(unscheduledTasks, eventCallbacks, setGlobalCallbacks) {
    setGlobalCallbacks(eventCallbacks);

    const unscheduledTaskList = getUnscheduledTaskListElement();
    if (!unscheduledTaskList) {
        logger.error('Unscheduled task list element not found.');
        return;
    }

    unscheduledTaskList.innerHTML = '';

    if (unscheduledTasks.length === 0) {
        unscheduledTaskList.innerHTML = EMPTY_STATE_MESSAGE;
        return;
    }

    unscheduledTasks.forEach((task) => {
        const taskCard = createUnscheduledTaskCard(task);
        unscheduledTaskList.appendChild(taskCard);

        if (task.isEditingInline) {
            toggleUnscheduledTaskInlineEdit(task.id, true, task);
        }
    });
}

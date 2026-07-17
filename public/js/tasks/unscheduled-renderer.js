import { calculateHoursAndMinutes } from '../utils.js';
import { toggleUnscheduledTaskInlineEdit } from './form-utils.js';
import { renderCategorySelectRow } from '../category-form-utils.js';
import {
    captureFormInteractionState,
    restoreFormInteractionState
} from './form-interaction-state.js';
import {
    getSelectableCategoryOptions,
    renderCategoryBadge
} from '../taxonomy/taxonomy-selectors.js';

const CARD_RENDER_KEY = Symbol('unscheduledTaskRenderKey');

// --- DOM Element Getters ---
export function getUnscheduledTaskListElement() {
    return document.getElementById('unscheduled-task-list');
}

// --- Helper Functions ---

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Priority configuration for visual styling
 */
const PRIORITY_CONFIG = {
    high: {
        border: 'border-rose-400',
        bg: 'bg-rose-400 bg-opacity-20',
        text: 'text-rose-300',
        icon: 'fa-solid fa-arrow-up',
        focusRing: 'rose-400'
    },
    medium: {
        border: 'border-amber-400',
        bg: 'bg-amber-400 bg-opacity-20',
        text: 'text-amber-300',
        icon: 'fa-solid fa-equals',
        focusRing: 'amber-300'
    },
    low: {
        border: 'border-emerald-400',
        bg: 'bg-emerald-400 bg-opacity-20',
        text: 'text-emerald-300',
        icon: 'fa-solid fa-arrow-down',
        focusRing: 'emerald-400'
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
        focusRing: config.focusRing
    };
}

function getDurationText(estDuration) {
    return calculateHoursAndMinutes(estDuration, true).text;
}

function createCardRenderKey(task, options) {
    return JSON.stringify({
        id: task.id,
        description: task.description,
        status: task.status,
        priority: task.priority,
        estDuration: task.estDuration,
        category: task.category || null,
        categoryBadge: renderCategoryBadge(task.category),
        confirmingDelete: Boolean(task.confirmingDelete),
        isEditingInline: Boolean(task.isEditingInline),
        mode: options.mode,
        linkedToRunningTimer: options.runningActivity?.sourceTaskId === task.id
    });
}

function isMovementDisabled(task, options) {
    const movement = options.movement;
    const isLinkedToRunningTimer = options.runningActivity?.sourceTaskId === task.id;
    const hasAvailableMovement = Boolean(movement && (movement.canMoveUp || movement.canMoveDown));
    return task.isEditingInline || isLinkedToRunningTimer || !hasAvailableMovement;
}

function setMovementControlDisabled(control, disabled) {
    if (!(control instanceof HTMLButtonElement)) return;
    control.disabled = disabled;
    control.classList.toggle('opacity-50', disabled);
    control.classList.toggle('cursor-not-allowed', disabled);
}

function syncMovementControls(taskCard, task, options) {
    if (options.mode !== 'manual') return;

    const movementDisabled = isMovementDisabled(task, options);
    setMovementControlDisabled(
        taskCard.querySelector('.unscheduled-drag-handle'),
        movementDisabled
    );
    taskCard.querySelectorAll('[data-move-kind]').forEach((button) => {
        const isUpCommand = button.dataset.moveKind === 'up' || button.dataset.moveKind === 'top';
        const directionUnavailable = isUpCommand
            ? !options.movement?.canMoveUp
            : !options.movement?.canMoveDown;
        setMovementControlDisabled(button, movementDisabled || directionUnavailable);
    });
}

function captureInlineEditDrafts(taskList) {
    const drafts = new Map();
    taskList.querySelectorAll('.task-card[data-task-id]').forEach((card) => {
        const editor = card.querySelector('.inline-edit-unscheduled-form');
        if (!editor || editor.classList.contains('hidden')) return;

        const form = editor.querySelector('form');
        if (!form) return;
        drafts.set(card.dataset.taskId, {
            description: form.querySelector('[name="inline-edit-description"]')?.value,
            category: form.querySelector('[name="inline-edit-category"]')?.value,
            priority: form.querySelector('[name="inline-edit-priority"]:checked')?.value,
            durationHours: form.querySelector('[name="inline-edit-est-duration-hours"]')?.value,
            durationMinutes: form.querySelector('[name="inline-edit-est-duration-minutes"]')?.value,
            interactionState: captureFormInteractionState(form)
        });
    });
    return drafts;
}

function applyInlineEditDraft(card, draft) {
    if (!draft) return;

    const form = card.querySelector('.inline-edit-unscheduled-form form');
    if (!form) return;
    const values = [
        ['inline-edit-description', draft.description],
        ['inline-edit-category', draft.category],
        ['inline-edit-est-duration-hours', draft.durationHours],
        ['inline-edit-est-duration-minutes', draft.durationMinutes]
    ];
    values.forEach(([name, value]) => {
        const field = form.querySelector(`[name="${name}"]`);
        if (field && value !== undefined) field.value = value;
    });
    form.querySelectorAll('[name="inline-edit-priority"]').forEach((radio) => {
        radio.checked = radio.value === draft.priority;
    });

    restoreFormInteractionState(form, draft.interactionState);
}

function renderMoveMenu(movement, movementDisabled) {
    const upDisabled = movementDisabled || !movement?.canMoveUp;
    const downDisabled = movementDisabled || !movement?.canMoveDown;
    const itemClasses =
        'unscheduled-task-actions-menu-item grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 w-full min-h-10 px-2.5 rounded-md text-slate-300 hover:bg-slate-700 text-sm text-left focus:outline-none focus:ring-2 focus:ring-slate-300';
    const disabledClasses = ' opacity-50 cursor-not-allowed';

    const moveButton = (kind, label, icon, disabled) => `
        <button class="${itemClasses}${disabled ? disabledClasses : ''}" type="button" role="menuitem" data-move-kind="${kind}" ${disabled ? 'disabled' : ''}>
            <i class="fa-solid ${icon} text-slate-400 text-center" aria-hidden="true"></i>
            <span>${label}</span>
        </button>`;

    return `
        <div class="unscheduled-task-actions-menu-group mt-1.5 pt-1.5 border-t border-slate-700">
            ${moveButton('up', 'Move up', 'fa-arrow-up', upDisabled)}
            ${moveButton('down', 'Move down', 'fa-arrow-down', downDisabled)}
            ${moveButton('top', 'Move to top', 'fa-angles-up', upDisabled)}
            ${moveButton('bottom', 'Move to bottom', 'fa-angles-down', downDisabled)}
        </div>`;
}

function renderUnscheduledTaskActionsMenu(task, actionState, options) {
    const actionMenuExpanded = task.confirmingDelete ? 'true' : 'false';
    const actionMenuHidden = task.confirmingDelete ? '' : ' hidden';
    const actionMenuTransitionClass = task.confirmingDelete
        ? 'action-menu-content--open'
        : 'action-menu-content--closed';
    const openMenuActionsClass = task.confirmingDelete ? ' z-50' : '';
    const menuTriggerDisabledAttr = actionState.menuTriggerDisabled ? 'disabled' : '';
    const menuTriggerDisabledClasses = actionState.menuTriggerDisabled
        ? ' opacity-50 cursor-not-allowed'
        : '';
    const blockedActionDisabledAttr = actionState.blockedActionsDisabled ? 'disabled' : '';
    const blockedActionDisabledClasses = actionState.blockedActionsDisabled
        ? ' opacity-50 cursor-not-allowed'
        : '';
    const editDeleteDisabledAttr = actionState.editDeleteDisabled ? 'disabled' : '';
    const editDeleteDisabledClasses = actionState.editDeleteDisabled
        ? ' opacity-50 cursor-not-allowed'
        : '';

    return `
        <div class="unscheduled-task-actions relative ml-auto -mt-1 -mr-1${openMenuActionsClass}">
            <button class="btn-unscheduled-task-actions-menu inline-grid place-items-center w-9 h-9 rounded-lg border border-transparent text-slate-300 hover:text-slate-200 hover:bg-slate-700 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-colors${menuTriggerDisabledClasses}" type="button" aria-label="Actions for ${task.description}" aria-haspopup="menu" aria-expanded="${actionMenuExpanded}" ${menuTriggerDisabledAttr}>
                <i class="fa-solid fa-ellipsis text-sm" aria-hidden="true"></i>
            </button>
            <div class="unscheduled-task-actions-menu action-menu-content ${actionMenuTransitionClass} absolute right-0 top-11 z-20 w-56 p-1.5 rounded-xl border border-slate-600 bg-slate-800 shadow-2xl sm:origin-top-right max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:bottom-3 max-sm:top-auto max-sm:w-auto" role="menu" aria-label="Task actions"${actionMenuHidden}>
                <div class="unscheduled-task-actions-menu-group">
                    <button class="unscheduled-task-actions-menu-item unscheduled-task-actions-menu-item-primary btn-start-unscheduled-timer grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 w-full min-h-10 px-2.5 rounded-md bg-slate-400/10 hover:bg-slate-400/20 text-slate-200 font-semibold text-sm text-left focus:outline-none focus:ring-2 focus:ring-slate-300${blockedActionDisabledClasses}" type="button" role="menuitem" data-task-id="${task.id}" ${blockedActionDisabledAttr}>
                        <i class="fa-solid fa-stopwatch text-slate-300 text-center" aria-hidden="true"></i>
                        <span>Start timer</span>
                    </button>
                </div>
                <div class="unscheduled-task-actions-menu-group mt-1.5 pt-1.5 border-t border-slate-700">
                    <button class="unscheduled-task-actions-menu-item btn-schedule-task grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 w-full min-h-10 px-2.5 rounded-md text-slate-300 hover:bg-slate-700 text-sm text-left focus:outline-none focus:ring-2 focus:ring-slate-300${blockedActionDisabledClasses}" type="button" role="menuitem" data-task-id="${task.id}" ${blockedActionDisabledAttr}>
                        <i class="fa-regular fa-calendar-plus text-slate-400 text-center" aria-hidden="true"></i>
                        <span>Schedule</span>
                    </button>
                    <button class="unscheduled-task-actions-menu-item btn-edit-unscheduled grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 w-full min-h-10 px-2.5 rounded-md text-slate-300 hover:bg-slate-700 text-sm text-left focus:outline-none focus:ring-2 focus:ring-slate-300${editDeleteDisabledClasses}" type="button" role="menuitem" data-task-id="${task.id}" ${editDeleteDisabledAttr}>
                        <i class="fa-solid fa-pen text-slate-400 text-center" aria-hidden="true"></i>
                        <span>Edit task</span>
                    </button>
                </div>
                ${options.mode === 'manual' ? renderMoveMenu(options.movement, options.movementDisabled) : ''}
                <div class="unscheduled-task-actions-menu-group mt-1.5 pt-1.5 border-t border-slate-700">
                    <button class="unscheduled-task-actions-menu-item unscheduled-task-actions-menu-item-danger btn-delete-unscheduled grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 w-full min-h-10 px-2.5 rounded-md text-rose-300 hover:bg-rose-400/10 text-sm text-left focus:outline-none focus:ring-2 focus:ring-rose-400${editDeleteDisabledClasses}" type="button" role="menuitem" data-task-id="${task.id}" ${editDeleteDisabledAttr}>
                        <i class="fa-regular ${task.confirmingDelete ? 'fa-check-circle' : 'fa-trash-can'} text-rose-400 text-center" aria-hidden="true"></i>
                        <span>${task.confirmingDelete ? 'Confirm delete' : 'Delete task'}</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Creates the display view HTML for a task card
 * @param {Object} task - The task object
 * @param {Object} priorityClasses - CSS classes for priority styling
 * @param {string} durationText - Formatted duration text
 * @param {boolean} isCompleted - Whether the task is completed
 * @returns {string} HTML string for the display view
 */
function createTaskDisplayHTML(task, priorityClasses, durationText, isCompleted, options) {
    const { mode, movement, runningActivity } = options;
    const isLinkedToRunningTimer = runningActivity?.sourceTaskId === task.id;
    const movementDisabled = isMovementDisabled(task, options);
    const isDisabled = isCompleted || isLinkedToRunningTimer;
    const completedClass = isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
    const completedTitle = isCompleted ? 'Task already completed' : 'Toggle complete status';
    const checkIcon = isCompleted ? 'fa-check-square text-slate-300' : 'fa-square text-slate-300';
    const textStrike = isCompleted ? 'line-through opacity-70' : '';
    const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
    const actionState = {
        menuTriggerDisabled: isLinkedToRunningTimer,
        blockedActionsDisabled: isCompleted || isLinkedToRunningTimer,
        editDeleteDisabled: isLinkedToRunningTimer
    };
    const inProgressBadge = isLinkedToRunningTimer
        ? '<span class="unscheduled-in-progress-badge inline-flex items-center px-2 py-0.5 rounded-full text-[10px] tracking-normal bg-slate-700/70 text-sky-200 border border-slate-500/40">In progress</span>'
        : '';
    const dragHandle =
        mode === 'manual'
            ? `<button type="button" class="unscheduled-drag-handle shrink-0 inline-grid place-items-center w-8 h-8 -ml-1 rounded-md text-slate-500 hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300${movementDisabled ? ' opacity-50 cursor-not-allowed' : ''}" aria-label="Move ${escapeHtml(task.description)}" aria-haspopup="menu" aria-expanded="false" ${movementDisabled ? 'disabled' : ''}>
                <i class="fa-solid fa-grip-vertical" aria-hidden="true"></i>
            </button>`
            : '';

    return `
        <div class="flex items-start space-x-3 min-w-0 flex-1">
            ${dragHandle}
            <label class="task-checkbox-unscheduled mt-0.5 ${completedClass}" title="${completedTitle}">
                <i class="fa-regular ${checkIcon} text-lg sm:text-xl"></i>
            </label>
            <div class="min-w-0 flex-1">
                <div class="font-medium text-white ${textStrike} text-sm sm:text-base flex items-center gap-2 flex-wrap"><span class="task-description">${task.description}</span> ${renderCategoryBadge(task.category)} ${inProgressBadge}</div>
                <div class="text-xs text-slate-400 mt-1.5 flex items-center flex-wrap gap-1.5 ${isCompleted ? 'opacity-70' : ''}">
                    <span class="priority-badge inline-flex items-center ${priorityClasses.bg} ${priorityClasses.text} px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs">
                        <i class="${priorityClasses.icon} mr-1 text-xs"></i>${priorityLabel} Priority
                    </span>
                    <span class="inline-flex items-center text-slate-400 text-xs">
                        <i class="fa-regular fa-hourglass mr-1"></i>Est: ${durationText}
                    </span>
                </div>
            </div>
        </div>
        ${renderUnscheduledTaskActionsMenu(task, actionState, {
            mode,
            movement,
            movementDisabled
        })}
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
    const categoryRowHtml = renderCategorySelectRow({
        selectName: 'inline-edit-category',
        selectedValue: task.category || '',
        options: getSelectableCategoryOptions(),
        dotClass: 'unscheduled-edit-category-dot',
        selectClass:
            'bg-slate-700 px-3 py-2 rounded-lg w-full focus:ring-2 focus:ring-slate-300 focus:outline-none transition-all text-sm sm:text-base'
    });

    return `
        <form class="space-y-3">
            <!-- Description Row -->
            <div class="relative">
                <i class="fa-regular fa-pen-to-square absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-300"></i>
                <input type="text" id="inline-edit-description-${task.id}" name="inline-edit-description"
                    placeholder="What needs to be done?"
                    class="task-edit-description bg-slate-700 pl-9 pr-3 py-2 rounded-lg w-full focus:ring-2 focus:ring-slate-300 focus:outline-none transition-all text-sm sm:text-base" required>
            </div>

            <!-- Category Row -->
            ${categoryRowHtml}

            <!-- Priority, Duration, and Buttons Row -->
            <div class="flex flex-col sm:flex-row gap-3">
                <!-- Priority -->
                <div class="flex items-center gap-2 sm:min-w-[200px]">
                    <label class="flex-1">
                        <input type="radio" name="inline-edit-priority" value="high" class="hidden peer" ${checkedHigh}>
                        <div class="task-edit-priority-option text-center py-1.5 px-2 rounded-lg border border-slate-600 bg-slate-700 bg-opacity-30
                            peer-checked:bg-rose-500 peer-checked:bg-opacity-20
                            hover:bg-opacity-50 cursor-pointer transition-all text-sm">
                            <i class="fa-solid fa-bars text-rose-400"></i>
                            <span class="ml-1">High</span>
                        </div>
                    </label>
                    <label class="flex-1">
                        <input type="radio" name="inline-edit-priority" value="medium" class="hidden peer" ${checkedMed}>
                        <div class="task-edit-priority-option text-center py-1.5 px-2 rounded-lg border border-slate-600 bg-slate-700 bg-opacity-30
                            peer-checked:bg-amber-400 peer-checked:bg-opacity-20
                            hover:bg-opacity-50 cursor-pointer transition-all text-sm">
                            <i class="fa-regular fa-equals text-amber-400"></i>
                            <span class="ml-1">Med</span>
                        </div>
                    </label>
                    <label class="flex-1">
                        <input type="radio" name="inline-edit-priority" value="low" class="hidden peer" ${checkedLow}>
                        <div class="task-edit-priority-option text-center py-1.5 px-2 rounded-lg border border-slate-600 bg-slate-700 bg-opacity-30
                            peer-checked:bg-emerald-500 peer-checked:bg-opacity-20
                            hover:bg-opacity-50 cursor-pointer transition-all text-sm">
                            <i class="fa-solid fa-minus text-emerald-400"></i>
                            <span class="ml-1">Low</span>
                        </div>
                    </label>
                </div>

                <!-- Estimated Duration -->
                <div class="flex items-center gap-2 sm:min-w-[140px]">
                    <div class="relative flex-1">
                        <i class="fa-regular fa-hourglass absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-300"></i>
                        <input type="number" name="inline-edit-est-duration-hours" placeholder="HH" min="0"
                            class="task-edit-duration-hours bg-slate-700 pl-9 pr-2 py-2 rounded-lg w-full focus:ring-2 focus:ring-slate-300 focus:outline-none transition-all text-sm sm:text-base">
                    </div>
                    <span class="text-slate-400 text-lg">:</span>
                    <div class="relative flex-1">
                        <input type="number" name="inline-edit-est-duration-minutes" placeholder="MM" min="0" max="59"
                            class="task-edit-duration-minutes bg-slate-700 px-3 py-2 rounded-lg w-full focus:ring-2 focus:ring-slate-300 focus:outline-none transition-all text-sm sm:text-base">
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-2 sm:ml-auto">
                    <button type="button" class="btn-cancel-inline-edit px-3 sm:px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-slate-700 hover:bg-slate-600 border border-slate-600 text-sm sm:text-base flex-1 sm:flex-none justify-center">
                        <i class="fa-solid fa-xmark mr-2"></i>Cancel
                    </button>
                    <button type="button" class="btn-save-inline-edit px-3 sm:px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-violet-500/30 border border-violet-400/60 text-violet-200 hover:bg-violet-500/40 text-sm sm:text-base flex-1 sm:flex-none justify-center">
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
function createUnscheduledTaskCard(task, options = {}) {
    const priorityClasses = getPriorityClasses(task.priority);
    const isCompleted = task.status === 'completed';
    const isLinkedToRunningTimer = options.runningActivity?.sourceTaskId === task.id;
    const durationText = getDurationText(task.estDuration);

    const taskCard = document.createElement('div');
    taskCard.className = `task-card relative bg-slate-800 bg-opacity-60 ${priorityClasses.border} border-l-4 border-l-slate-300 p-2 sm:p-4 rounded-lg shadow-lg flex flex-col gap-2 ${task.confirmingDelete ? 'z-40 ' : ''}${isLinkedToRunningTimer ? 'opacity-70 pointer-events-none' : ''}`;
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
        isCompleted,
        options
    );
    taskCard.appendChild(taskDisplayPart);

    // Inline edit form (hidden by default)
    const editFormContainer = document.createElement('div');
    editFormContainer.className =
        'inline-edit-unscheduled-form hidden mt-3 pt-3 border-t border-slate-700 w-full';
    editFormContainer.innerHTML = createInlineEditFormHTML(task);
    taskCard.appendChild(editFormContainer);
    taskCard[CARD_RENDER_KEY] = createCardRenderKey(task, options);

    return taskCard;
}

// --- Render Functions ---

const EMPTY_STATE_MESSAGE =
    '<p class="text-slate-500 text-sm italic px-2">No unscheduled tasks yet. Add some using the form above!</p>';

/**
 * Renders all unscheduled tasks
 * @param {Array} unscheduledTasks - Array of unscheduled tasks
 * @param {Object} options - Display-only rendering options
 */
export function renderUnscheduledTasks(unscheduledTasks, options = {}) {
    const {
        mode = 'priority',
        movementByTaskId = new Map(),
        runningActivity = null
    } = options || {};
    const unscheduledTaskList = getUnscheduledTaskListElement();
    if (!unscheduledTaskList) return;

    if (unscheduledTasks.length === 0) {
        unscheduledTaskList.replaceChildren();
        unscheduledTaskList.innerHTML = EMPTY_STATE_MESSAGE;
        return;
    }

    const inlineEditDrafts = captureInlineEditDrafts(unscheduledTaskList);
    const existingCardsById = new Map(
        [...unscheduledTaskList.querySelectorAll('.task-card[data-task-id]')].map((card) => [
            card.dataset.taskId,
            card
        ])
    );
    const retainedCards = new Set();

    unscheduledTasks.forEach((task, index) => {
        const cardOptions = {
            mode,
            movement: movementByTaskId.get(task.id),
            runningActivity
        };
        const existingCard = existingCardsById.get(task.id);
        const renderKey = createCardRenderKey(task, cardOptions);
        const taskCard =
            existingCard?.[CARD_RENDER_KEY] === renderKey
                ? existingCard
                : createUnscheduledTaskCard(task, cardOptions);
        const cardAtPosition = unscheduledTaskList.children[index] || null;
        if (cardAtPosition !== taskCard) {
            unscheduledTaskList.insertBefore(taskCard, cardAtPosition);
        }
        retainedCards.add(taskCard);
        syncMovementControls(taskCard, task, cardOptions);

        if (taskCard !== existingCard && task.isEditingInline) {
            toggleUnscheduledTaskInlineEdit(task.id, true, task);
            applyInlineEditDraft(taskCard, inlineEditDrafts.get(task.id));
        }
    });
    [...unscheduledTaskList.children].forEach((child) => {
        if (!retainedCards.has(child)) child.remove();
    });
}

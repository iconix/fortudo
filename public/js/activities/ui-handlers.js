import { extractActivityFormData } from './form-utils.js';
import { getTodaysActivities, getRunningActivity, getLiveTodayActivitySummary } from './manager.js';
import { renderActivities, renderActivitySummaryOnly } from './renderer.js';
import { handleAddActivity, handleDeleteActivity, handleSaveActivityEdit } from './handlers.js';
import { disposeTimerUI, hideTimerDisplay } from './timer-ui.js';
import { computeEndTimePreview } from '../tasks/form-utils.js';
import { resolveCategoryKey } from '../taxonomy/taxonomy-selectors.js';

const activityUiState = {
    editingActivityId: null,
    expandedParentGroupKey: null,
    confirmingDeleteActivityId: null,
    inFlightActivitySaveIds: new Set()
};

function getActivitiesForSummary() {
    const todaysActivities = getTodaysActivities();
    const liveRunningSummary = getLiveTodayActivitySummary();

    return liveRunningSummary ? [...todaysActivities, liveRunningSummary] : todaysActivities;
}

export function resetActivityInlineEditState() {
    activityUiState.editingActivityId = null;
    activityUiState.expandedParentGroupKey = null;
    activityUiState.confirmingDeleteActivityId = null;
    activityUiState.inFlightActivitySaveIds.clear();
}

function clearDeleteConfirmState(deps) {
    const wasConfirmingTaskDelete = deps.resetAllConfirmingDeleteFlags();
    const wasConfirmingActivityDelete = activityUiState.confirmingDeleteActivityId !== null;
    activityUiState.confirmingDeleteActivityId = null;

    const wasConfirming = wasConfirmingTaskDelete || wasConfirmingActivityDelete;
    if (wasConfirming) {
        deps.refreshUI();
    }
}

export function syncActivitiesUI(enabled) {
    const activityToggleOption = document.getElementById('activity-toggle-option');
    const activitiesContainer = document.getElementById('activities-container');

    if (activityToggleOption) {
        activityToggleOption.classList.toggle('hidden', !enabled);
    }

    if (activitiesContainer) {
        activitiesContainer.classList.toggle('hidden', !enabled);
    }

    if (!enabled) {
        activityUiState.editingActivityId = null;
        activityUiState.expandedParentGroupKey = null;
        disposeTimerUI();
        hideTimerDisplay();
        const activityRadio = document.getElementById('activity');
        const scheduledRadio = document.getElementById('scheduled');
        if (activityRadio instanceof HTMLInputElement) {
            activityRadio.checked = false;
        }
        if (scheduledRadio instanceof HTMLInputElement) {
            scheduledRadio.checked = true;
        }
    }
}

export function renderTodayActivities(enabled) {
    if (!enabled) {
        return;
    }

    const todaysActivities = getTodaysActivities();
    renderActivities(
        todaysActivities,
        /** @type {HTMLElement|null} */ (document.getElementById('activity-list')),
        {
            editingActivityId: activityUiState.editingActivityId,
            expandedParentGroupKey: activityUiState.expandedParentGroupKey,
            confirmingDeleteActivityId: activityUiState.confirmingDeleteActivityId,
            summaryActivities: getActivitiesForSummary()
        }
    );
}

export function refreshTodayActivitySummary(enabled) {
    if (!enabled) {
        return;
    }

    const activityList = /** @type {HTMLElement|null} */ (document.getElementById('activity-list'));
    renderActivitySummaryOnly(getTodaysActivities(), activityList, {
        expandedParentGroupKey: activityUiState.expandedParentGroupKey,
        summaryActivities: getActivitiesForSummary()
    });
}

export async function handleActivityAwareFormSubmit(formElement, deps) {
    const selectedTaskType = new FormData(formElement).get('task-type')?.toString();
    if (!deps.activitiesEnabled || selectedTaskType !== 'activity') {
        await deps.handleTaskSubmit(formElement);
        return;
    }

    if (getRunningActivity()) {
        return;
    }

    const activityData = extractActivityFormData(formElement);
    if (!activityData) {
        deps.focusTaskDescriptionInput();
        return;
    }

    const result = await handleAddActivity(activityData);
    if (!result?.success) {
        return;
    }

    formElement.reset();
    deps.resetTaskFormPreviewState({
        hintElement: document.getElementById('end-time-hint'),
        warningElement: document.getElementById('overlap-warning'),
        buttonElement: document.getElementById('add-task-btn')
    });

    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
        categorySelect.dispatchEvent(new Event('change'));
    }

    const activityRadio = formElement.querySelector('input[name="task-type"][value="activity"]');
    if (activityRadio instanceof HTMLInputElement) {
        activityRadio.checked = true;
    }

    deps.initializeTaskTypeToggle();
    deps.focusTaskDescriptionInput();
}

export function handleActivityListClick(target, deps) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    const summaryParentTarget = target.closest(
        '[data-summary-parent-key][data-summary-parent-legend], [data-summary-parent-key][data-summary-parent-segment]'
    );
    if (summaryParentTarget instanceof HTMLElement) {
        const parentKey = summaryParentTarget.dataset.summaryParentKey;
        if (!parentKey) {
            return false;
        }

        if (parentKey === 'uncategorized') {
            return true;
        }

        activityUiState.expandedParentGroupKey =
            activityUiState.expandedParentGroupKey === parentKey ? null : parentKey;
        deps.refreshUI();
        return true;
    }

    const editActivityButton = target.closest('.btn-edit-activity');
    if (editActivityButton instanceof HTMLElement) {
        const activityItem = editActivityButton.closest('.activity-item[data-activity-id]');
        const activityId =
            editActivityButton.dataset.activityId || activityItem?.getAttribute('data-activity-id');
        clearDeleteConfirmState(deps);
        if (activityId) {
            activityUiState.editingActivityId = activityId;
            deps.refreshUI();
        }
        return true;
    }

    const cancelActivityEditButton = target.closest('.btn-cancel-activity-edit');
    if (cancelActivityEditButton instanceof HTMLElement) {
        activityUiState.editingActivityId = null;
        deps.refreshUI();
        return true;
    }

    const saveActivityEditButton = target.closest('.btn-save-activity-edit[type="button"]');
    if (saveActivityEditButton instanceof HTMLElement) {
        const editForm = saveActivityEditButton.closest(
            'form.activity-inline-edit-form[data-activity-id]'
        );
        if (editForm instanceof HTMLFormElement) {
            void saveInlineActivityEdit(editForm, deps);
        }
        return true;
    }

    const deleteActivityButton = target.closest('.btn-delete-activity');
    if (deleteActivityButton instanceof HTMLElement) {
        const activityItem = deleteActivityButton.closest('.activity-item[data-activity-id]');
        const activityId =
            deleteActivityButton.dataset.activityId ||
            activityItem?.getAttribute('data-activity-id');
        if (activityId) {
            deps.resetAllConfirmingDeleteFlags();

            if (activityUiState.confirmingDeleteActivityId === activityId) {
                activityUiState.confirmingDeleteActivityId = null;
                if (activityUiState.editingActivityId === activityId) {
                    activityUiState.editingActivityId = null;
                }
                void handleDeleteActivity(activityId);
            } else {
                activityUiState.confirmingDeleteActivityId = activityId;
                if (activityUiState.editingActivityId === activityId) {
                    activityUiState.editingActivityId = null;
                }
                deps.refreshUI();
            }
        }
        return true;
    }

    const taskElement = target.closest('.task-item, .task-card');
    const deleteButton = target.closest('.btn-delete, .btn-delete-unscheduled');

    if (!taskElement && !deleteButton) {
        clearDeleteConfirmState(deps);
    }

    return false;
}

async function saveInlineActivityEdit(editForm, deps) {
    const activityId = editForm.getAttribute('data-activity-id');
    if (!activityId) {
        return false;
    }

    if (activityUiState.inFlightActivitySaveIds.has(activityId)) {
        return true;
    }

    activityUiState.inFlightActivitySaveIds.add(activityId);
    try {
        const result = await handleSaveActivityEdit(activityId, editForm);
        if (result?.success) {
            activityUiState.editingActivityId = null;
        }
        deps.refreshUI();
        return true;
    } finally {
        activityUiState.inFlightActivitySaveIds.delete(activityId);
    }
}

export function handleActivityListSubmit(event, deps) {
    const editForm = event.target;
    if (!(editForm instanceof HTMLFormElement)) {
        return false;
    }

    if (!editForm.matches('form.activity-inline-edit-form[data-activity-id]')) {
        return false;
    }

    event.preventDefault();
    void saveInlineActivityEdit(editForm, deps);
    return true;
}

export function handleActivityListKeydown(event, deps) {
    if (event.key !== 'Enter') {
        return false;
    }

    if (!(event.target instanceof HTMLInputElement)) {
        return false;
    }

    const editForm = event.target.closest('form.activity-inline-edit-form[data-activity-id]');
    if (!(editForm instanceof HTMLFormElement)) {
        return false;
    }

    event.preventDefault();
    void saveInlineActivityEdit(editForm, deps);
    return true;
}

export function handleActivityListInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
        return false;
    }

    const editForm = target.closest('form.activity-inline-edit-form[data-activity-id]');
    if (!(editForm instanceof HTMLFormElement)) {
        return false;
    }

    if (target instanceof HTMLSelectElement && target.name === 'category') {
        const categoryDot = editForm.querySelector('.activity-edit-category-dot');
        if (categoryDot instanceof HTMLElement) {
            const resolvedCategory = resolveCategoryKey(target.value);
            categoryDot.style.backgroundColor = resolvedCategory?.record?.color || '#64748b';
        }
        return true;
    }

    const startInput = editForm.querySelector('input[name="start-time"]');
    const hoursInput = editForm.querySelector('input[name="duration-hours"]');
    const minutesInput = editForm.querySelector('input[name="duration-minutes"]');
    const hintElement = editForm.querySelector('.edit-end-time-hint');

    if (
        !(startInput instanceof HTMLInputElement) ||
        !(hoursInput instanceof HTMLInputElement) ||
        !(minutesInput instanceof HTMLInputElement) ||
        !(hintElement instanceof HTMLElement)
    ) {
        return false;
    }

    const preview = computeEndTimePreview(startInput.value, hoursInput.value, minutesInput.value);
    if (preview) {
        hintElement.textContent = `\u25b8 ${preview}`;
        hintElement.classList.remove('opacity-0');
    } else {
        hintElement.textContent = '';
        hintElement.classList.add('opacity-0');
    }

    return true;
}

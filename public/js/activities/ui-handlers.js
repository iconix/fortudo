import { showAlert } from '../modal-manager.js';
import { extractActivityFormData } from './form-utils.js';
import { getTodaysActivities, getRunningActivity, updateRunningActivity } from './manager.js';
import { renderActivities } from './renderer.js';
import {
    handleAddActivity,
    handleDeleteActivity,
    handleSaveActivityEdit,
    handleStartTimer,
    handleStopTimer
} from './handlers.js';

let editingActivityId = null;
let timerIntervalId = null;
let timerUiAbortController = null;

export function resetActivityInlineEditState() {
    editingActivityId = null;
}

function clearDeleteConfirmState(deps) {
    const wasConfirming = deps.resetAllConfirmingDeleteFlags();
    if (wasConfirming) {
        deps.refreshUI();
    }
}

function stopElapsedCounter() {
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
}

function formatElapsed(elapsedMs) {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
        seconds
    ).padStart(2, '0')}`;
}

function startElapsedCounter(startDateTime) {
    stopElapsedCounter();

    const startMs = new Date(startDateTime).getTime();
    const elapsedElement = document.getElementById('timer-elapsed');
    if (!elapsedElement || Number.isNaN(startMs)) {
        return;
    }

    const updateElapsed = () => {
        elapsedElement.textContent = formatElapsed(Date.now() - startMs);
    };

    updateElapsed();
    timerIntervalId = setInterval(updateElapsed, 1000);
}

export function showTimerDisplay(runningActivity) {
    const formFields = document.getElementById('task-form-fields');
    const timerDisplay = document.getElementById('timer-display');
    if (!formFields || !timerDisplay || !runningActivity) {
        return;
    }

    formFields.classList.add('hidden');
    timerDisplay.classList.remove('hidden');

    const descriptionInput = document.getElementById('timer-description');
    if (descriptionInput instanceof HTMLInputElement) {
        descriptionInput.value = runningActivity.description || '';
    }

    const startTimeInput = document.getElementById('timer-start-time');
    if (startTimeInput instanceof HTMLInputElement && runningActivity.startDateTime) {
        const startDate = new Date(runningActivity.startDateTime);
        startTimeInput.value = `${String(startDate.getHours()).padStart(2, '0')}:${String(
            startDate.getMinutes()
        ).padStart(2, '0')}`;
    }

    const timerCategorySelect = document.getElementById('timer-category');
    if (timerCategorySelect instanceof HTMLSelectElement) {
        const mainCategorySelect = document.querySelector('#task-form select[name="category"]');
        if (mainCategorySelect instanceof HTMLSelectElement) {
            timerCategorySelect.innerHTML = mainCategorySelect.innerHTML;
        }
        timerCategorySelect.value = runningActivity.category || '';
    }

    startElapsedCounter(runningActivity.startDateTime);
}

export function hideTimerDisplay() {
    const formFields = document.getElementById('task-form-fields');
    const timerDisplay = document.getElementById('timer-display');

    stopElapsedCounter();

    if (timerDisplay) {
        timerDisplay.classList.add('hidden');
    }
    if (formFields) {
        formFields.classList.remove('hidden');
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
        editingActivityId = null;
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

    renderActivities(
        getTodaysActivities(),
        /** @type {HTMLElement|null} */ (document.getElementById('activity-list')),
        { editingActivityId }
    );
}

export function syncTimerFormState() {
    const activityRadio = document.getElementById('activity');
    const isActivityMode = activityRadio instanceof HTMLInputElement && activityRadio.checked;
    const runningActivity = getRunningActivity();
    const startTimerButton = document.getElementById('start-timer-btn');

    if (isActivityMode && runningActivity) {
        showTimerDisplay(runningActivity);
        if (startTimerButton) {
            startTimerButton.classList.remove('hidden');
        }
        return;
    }

    hideTimerDisplay();
    if (startTimerButton) {
        startTimerButton.classList.toggle('hidden', !isActivityMode);
    }
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

export function initializeTimerUI(deps) {
    if (timerUiAbortController) {
        timerUiAbortController.abort();
    }
    timerUiAbortController = new AbortController();
    const { signal } = timerUiAbortController;

    const radios = document.querySelectorAll('input[name="task-type"]');
    radios.forEach((radio) => {
        radio.addEventListener(
            'change',
            () => {
                syncTimerFormState();
            },
            { signal }
        );
    });

    const startTimerButton = document.getElementById('start-timer-btn');
    if (startTimerButton) {
        startTimerButton.addEventListener(
            'click',
            () => {
                const runningActivity = getRunningActivity();
                const formDescriptionInput = document.querySelector(
                    '#task-form input[name="description"]'
                );
                const formCategorySelect = document.querySelector(
                    '#task-form select[name="category"]'
                );
                const timerDescriptionInput = document.getElementById('timer-description');
                const timerCategorySelect = document.getElementById('timer-category');

                const activeDescriptionInput = runningActivity
                    ? timerDescriptionInput
                    : formDescriptionInput;
                const activeCategorySelect = runningActivity
                    ? timerCategorySelect
                    : formCategorySelect;
                const description =
                    activeDescriptionInput instanceof HTMLInputElement
                        ? activeDescriptionInput.value.trim()
                        : '';
                const category =
                    activeCategorySelect instanceof HTMLSelectElement
                        ? activeCategorySelect.value || null
                        : null;

                if (!description) {
                    showAlert('Please enter a description before starting the timer.', 'sky');
                    return;
                }

                void handleStartTimer({ description, category }).then((result) => {
                    if (!result?.success) {
                        return;
                    }

                    if (formDescriptionInput instanceof HTMLInputElement) {
                        formDescriptionInput.value = '';
                    }
                    syncTimerFormState();
                    deps.refreshUI();
                });
            },
            { signal }
        );
    }

    const stopTimerButton = document.getElementById('timer-stop-btn');
    if (stopTimerButton) {
        stopTimerButton.addEventListener(
            'click',
            () => {
                void handleStopTimer().then((result) => {
                    if (!result?.success) {
                        return;
                    }

                    syncTimerFormState();
                    deps.refreshUI();
                });
            },
            { signal }
        );
    }

    const timerDescriptionInput = document.getElementById('timer-description');
    if (timerDescriptionInput instanceof HTMLInputElement) {
        timerDescriptionInput.addEventListener(
            'change',
            () => {
                const previousValue = getRunningActivity()?.description || '';
                void updateRunningActivity({ description: timerDescriptionInput.value }).then(
                    (result) => {
                        if (result?.success && result.runningActivity) {
                            timerDescriptionInput.value = result.runningActivity.description || '';
                            return;
                        }

                        timerDescriptionInput.value = previousValue;
                        showAlert(result?.reason || 'Could not update timer.', 'sky');
                    }
                );
            },
            { signal }
        );
    }

    const timerCategorySelect = document.getElementById('timer-category');
    if (timerCategorySelect instanceof HTMLSelectElement) {
        timerCategorySelect.addEventListener(
            'change',
            () => {
                const previousValue = getRunningActivity()?.category || '';
                void updateRunningActivity({ category: timerCategorySelect.value || null }).then(
                    (result) => {
                        if (result?.success && result.runningActivity) {
                            timerCategorySelect.value = result.runningActivity.category || '';
                            return;
                        }

                        timerCategorySelect.value = previousValue;
                        showAlert(result?.reason || 'Could not update timer.', 'sky');
                    }
                );
            },
            { signal }
        );
    }

    const timerStartTimeInput = document.getElementById('timer-start-time');
    if (timerStartTimeInput instanceof HTMLInputElement) {
        timerStartTimeInput.addEventListener(
            'change',
            () => {
                const runningActivity = getRunningActivity();
                if (!runningActivity || !timerStartTimeInput.value) {
                    return;
                }

                const previousDate = new Date(runningActivity.startDateTime);
                const previousValue = `${String(previousDate.getHours()).padStart(2, '0')}:${String(
                    previousDate.getMinutes()
                ).padStart(2, '0')}`;
                const nextStartDate = new Date(runningActivity.startDateTime);
                const [hours, minutes] = timerStartTimeInput.value.split(':').map(Number);
                nextStartDate.setHours(hours, minutes, 0, 0);

                void updateRunningActivity({ startDateTime: nextStartDate.toISOString() }).then(
                    (result) => {
                        if (result?.success && result.runningActivity) {
                            showTimerDisplay(result.runningActivity);
                            return;
                        }

                        timerStartTimeInput.value = previousValue;
                        showAlert(result?.reason || 'Could not update timer.', 'sky');
                    }
                );
            },
            { signal }
        );
    }
}

export function handleActivityListClick(target, deps) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    const editActivityButton = target.closest('.btn-edit-activity');
    if (editActivityButton instanceof HTMLElement) {
        const activityItem = editActivityButton.closest('.activity-item[data-activity-id]');
        const activityId =
            editActivityButton.dataset.activityId || activityItem?.getAttribute('data-activity-id');
        clearDeleteConfirmState(deps);
        if (activityId) {
            editingActivityId = activityId;
            deps.refreshUI();
        }
        return true;
    }

    const cancelActivityEditButton = target.closest('.btn-cancel-activity-edit');
    if (cancelActivityEditButton instanceof HTMLElement) {
        editingActivityId = null;
        deps.refreshUI();
        return true;
    }

    const saveActivityEditButton = target.closest('.btn-save-activity-edit');
    if (saveActivityEditButton instanceof HTMLElement) {
        const editForm = saveActivityEditButton.closest(
            'form.activity-inline-edit-form[data-activity-id]'
        );
        const activityId = editForm?.getAttribute('data-activity-id');
        if (activityId && editForm instanceof HTMLFormElement) {
            void handleSaveActivityEdit(activityId, editForm).then((result) => {
                if (result?.success) {
                    editingActivityId = null;
                }
                deps.refreshUI();
            });
        }
        return true;
    }

    const deleteActivityButton = target.closest('.btn-delete-activity');
    if (deleteActivityButton instanceof HTMLElement) {
        const activityItem = deleteActivityButton.closest('.activity-item[data-activity-id]');
        const activityId =
            deleteActivityButton.dataset.activityId ||
            activityItem?.getAttribute('data-activity-id');
        clearDeleteConfirmState(deps);
        if (activityId) {
            if (editingActivityId === activityId) {
                editingActivityId = null;
            }
            void handleDeleteActivity(activityId);
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

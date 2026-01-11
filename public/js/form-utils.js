import { calculateHoursAndMinutes, parseDuration, getThemeForTaskType, logger } from './utils.js';
import { showAlert } from './modal-manager.js';

// --- Inline Edit Functions for Unscheduled Tasks ---

/**
 * Populates the inline edit form for an unscheduled task with existing task data
 * @param {string} taskId - The task ID
 * @param {Object} taskData - The task data to populate
 */
export function populateUnscheduledTaskInlineEditForm(taskId, taskData) {
    const taskCardElement = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (!taskCardElement) {
        logger.error(
            'populateUnscheduledTaskInlineEditForm: Task card element not found for ID',
            taskId
        );
        return;
    }
    const form = taskCardElement.querySelector('.inline-edit-unscheduled-form form');
    if (!(form instanceof HTMLFormElement)) {
        logger.error(
            'populateUnscheduledTaskInlineEditForm: Inline edit form not found in task card',
            taskCardElement
        );
        return;
    }

    const descriptionInput = form.querySelector('input[name="inline-edit-description"]');
    const hoursInput = form.querySelector('input[name="inline-edit-est-duration-hours"]');
    const minutesInput = form.querySelector('input[name="inline-edit-est-duration-minutes"]');
    const priorityRadios = form.querySelectorAll('input[name="inline-edit-priority"]');

    if (descriptionInput instanceof HTMLInputElement) descriptionInput.value = taskData.description;
    else logger.warn('Description input not found for inline edit form', form);

    if (hoursInput instanceof HTMLInputElement && minutesInput instanceof HTMLInputElement) {
        const { hours, minutes } = calculateHoursAndMinutes(taskData.estDuration, true);
        hoursInput.value = hours.toString();
        minutesInput.value = minutes.toString().padStart(2, '0');
    }

    priorityRadios.forEach((radio) => {
        if (radio instanceof HTMLInputElement) {
            radio.checked = radio.value === taskData.priority;
        }
    });
}

/**
 * Extracts form data from an unscheduled task inline edit form
 * @param {string} taskId - The task ID
 * @returns {Object|null} The form data or null if validation fails
 */
export function getUnscheduledTaskInlineFormData(taskId) {
    const taskCardElement = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (!taskCardElement) {
        logger.error(
            'getUnscheduledTaskInlineFormData: Task card element not found for ID',
            taskId
        );
        return null;
    }
    const form = taskCardElement.querySelector('.inline-edit-unscheduled-form form');
    if (!(form instanceof HTMLFormElement)) {
        logger.error(
            'getUnscheduledTaskInlineFormData: Inline edit form not found.',
            taskCardElement
        );
        return null;
    }

    const descriptionInput = form.querySelector('input[name="inline-edit-description"]');
    const hoursInput = form.querySelector('input[name="inline-edit-est-duration-hours"]');
    const minutesInput = form.querySelector('input[name="inline-edit-est-duration-minutes"]');
    const selectedPriorityElement = form.querySelector(
        'input[name="inline-edit-priority"]:checked'
    );

    const description =
        descriptionInput instanceof HTMLInputElement ? descriptionInput.value.trim() : '';
    if (!description) {
        showAlert('Task description cannot be empty.', 'indigo');
        descriptionInput?.focus();
        return null;
    }

    const hoursValue = hoursInput instanceof HTMLInputElement ? hoursInput.value : '0';
    const minutesValue = minutesInput instanceof HTMLInputElement ? minutesInput.value : '0';
    const durationResult = parseDuration(hoursValue, minutesValue, { allowZero: true });

    if (!durationResult.valid) {
        showAlert(durationResult.error, 'indigo');
        hoursInput?.focus();
        return null;
    }

    const priority =
        selectedPriorityElement instanceof HTMLInputElement
            ? selectedPriorityElement.value
            : 'medium';

    return { description, priority, estDuration: durationResult.duration };
}

/**
 * Toggles visibility of inline edit form for unscheduled tasks
 * @param {string} taskId - The task ID
 * @param {boolean} showEditForm - Whether to show or hide the edit form
 * @param {Object} [taskData] - The task data to populate (only when initially showing)
 */
export function toggleUnscheduledTaskInlineEdit(taskId, showEditForm, taskData) {
    const taskCardElement = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (!taskCardElement) {
        logger.error('toggleUnscheduledTaskInlineEdit: Task card element not found for ID', taskId);
        return;
    }
    const viewPart = taskCardElement.querySelector('.task-display-view');
    const editFormPart = taskCardElement.querySelector('.inline-edit-unscheduled-form');

    if (!viewPart || !editFormPart) {
        logger.error(
            'Could not find view or edit form parts in task card for toggling.',
            taskCardElement
        );
        return;
    }

    if (showEditForm) {
        if (taskData) populateUnscheduledTaskInlineEditForm(taskId, taskData);
        viewPart.classList.add('hidden');
        editFormPart.classList.remove('hidden');
        editFormPart.querySelector('input[name="inline-edit-description"]')?.focus();
    } else {
        viewPart.classList.remove('hidden');
        editFormPart.classList.add('hidden');
    }
}

// --- Main Task Form Functions ---

/**
 * Extracts task data from the main task form.
 * Handles both scheduled and unscheduled task types.
 * @param {HTMLFormElement} formElement - The task form element.
 * @returns {object|null} Task data object or null if form is invalid.
 */
export function extractTaskFormData(formElement) {
    const formData = new FormData(formElement);
    const description = formData.get('description')?.toString().trim();
    const taskType = formData.get('task-type')?.toString();

    if (!description) {
        showAlert('Task description cannot be empty.', getThemeForTaskType(taskType));
        return null;
    }

    let taskData = { description, taskType };

    if (taskType === 'scheduled') {
        const startTime = formData.get('start-time')?.toString();
        const durationResult = parseDuration(
            formData.get('duration-hours')?.toString() || '0',
            formData.get('duration-minutes')?.toString() || '0'
        );

        if (!startTime) {
            showAlert('Start time is required for scheduled tasks.', 'teal');
            return null;
        }
        if (!durationResult.valid) {
            showAlert(durationResult.error, 'teal');
            return null;
        }
        taskData = { ...taskData, startTime, duration: durationResult.duration };
    } else if (taskType === 'unscheduled') {
        const priority = formData.get('priority')?.toString() || 'medium';
        const estDurationResult = parseDuration(
            formData.get('est-duration-hours')?.toString() || '0',
            formData.get('est-duration-minutes')?.toString() || '0',
            { allowZero: true }
        );

        if (!estDurationResult.valid) {
            showAlert(estDurationResult.error, 'indigo');
            return null;
        }
        const estDuration = estDurationResult.duration;
        taskData = { ...taskData, priority, estDuration: estDuration > 0 ? estDuration : null };
    } else {
        showAlert('Invalid task type selected.', 'indigo');
        return null;
    }
    return taskData;
}

/**
 * Gets the task form element
 * @returns {HTMLFormElement|null}
 */
export function getTaskFormElement() {
    return /** @type {HTMLFormElement|null} */ (document.getElementById('task-form'));
}

/**
 * Focuses the task description input field
 */
export function focusTaskDescriptionInput() {
    const taskForm = getTaskFormElement();
    if (taskForm) {
        const descriptionInput = taskForm.querySelector('input[name="description"]');
        if (descriptionInput instanceof HTMLInputElement) {
            descriptionInput.focus();
        } else {
            logger.warn(
                'Description input not found or not an HTMLInputElement in focusTaskDescriptionInput.'
            );
        }
    } else {
        logger.warn('Task form not found in focusTaskDescriptionInput.');
    }
}

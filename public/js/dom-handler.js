import {
    calculateHoursAndMinutes,
    convertTo12HourTime,
    logger,
    isTaskRunningLate,
    getCurrentTimeRounded,
    extractTimeFromDateTime
} from './utils.js';

import { getTaskState } from './task-manager.js';

// Global event callbacks storage for event delegation
let globalScheduledTaskCallbacks = null;
let globalUnscheduledTaskCallbacks = null;

// Auto-update state for start time field
const startTimeAutoUpdate = {
    trackedTime: /** @type {string|null} */ (null),
    trackedDate: /** @type {string|null} */ (null),
    isEnabled() {
        return this.trackedTime !== null;
    },
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

// --- Modal Elements & Logic ---
const customAlertModal = document.getElementById('custom-alert-modal');
const customAlertTitle = document.getElementById('custom-alert-title');
const customAlertMessage = document.getElementById('custom-alert-message');
const closeCustomAlertButton = document.getElementById('close-custom-alert-modal');
const okCustomAlertButton = document.getElementById('ok-custom-alert-modal');

function setModalTheme(modal, title, button, theme = 'indigo') {
    const isIndigo = theme === 'indigo';
    // Update title color
    if (title) {
        title.className = `text-xl font-normal ${isIndigo ? 'text-indigo-400' : 'text-teal-400'}`;
    }
    // Update button gradient
    if (button) {
        button.className = `bg-gradient-to-r ${isIndigo ? 'from-indigo-500 to-indigo-400 hover:from-indigo-400 hover:to-indigo-300' : 'from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300'} px-5 py-2 rounded-lg text-white font-normal transition-colors`;
    }
}

export function hideCustomAlert() {
    if (customAlertModal) customAlertModal.classList.add('hidden');
}
export function showCustomAlert(title, message, theme = 'indigo') {
    if (customAlertTitle && customAlertMessage && customAlertModal && okCustomAlertButton) {
        customAlertTitle.textContent = title;
        customAlertMessage.textContent = message;
        setModalTheme(customAlertModal, customAlertTitle, okCustomAlertButton, theme);
        customAlertModal.classList.remove('hidden');
    } else {
        logger.error('Custom alert modal elements not found. Falling back to window.alert.');
        window.alert(`${title}: ${message}`);
    }
}
if (closeCustomAlertButton) closeCustomAlertButton.addEventListener('click', hideCustomAlert);
if (okCustomAlertButton) okCustomAlertButton.addEventListener('click', hideCustomAlert);

const customConfirmModal = document.getElementById('custom-confirm-modal');
const customConfirmTitle = document.getElementById('custom-confirm-title');
const customConfirmMessage = document.getElementById('custom-confirm-message');

export function hideCustomConfirm() {
    if (customConfirmModal) customConfirmModal.classList.add('hidden');
}
export function showCustomConfirm(
    title,
    message,
    buttonLabels = { ok: 'OK', cancel: 'Cancel' },
    theme = 'indigo'
) {
    const okBtnElement = document.getElementById('ok-custom-confirm-modal');
    const cancelBtnElement = document.getElementById('cancel-custom-confirm-modal');
    const closeBtnElement = document.getElementById('close-custom-confirm-modal');

    if (
        customConfirmTitle &&
        customConfirmMessage &&
        customConfirmModal &&
        okBtnElement instanceof HTMLElement &&
        cancelBtnElement instanceof HTMLElement &&
        closeBtnElement instanceof HTMLElement
    ) {
        customConfirmTitle.textContent = title;
        customConfirmMessage.textContent = message;

        return new Promise((resolve) => {
            const newOkBtn = okBtnElement.cloneNode(true);
            const newCancelBtn = cancelBtnElement.cloneNode(true);
            const newCloseBtn = closeBtnElement.cloneNode(true);

            if (okBtnElement.parentNode)
                okBtnElement.parentNode.replaceChild(newOkBtn, okBtnElement);
            if (cancelBtnElement.parentNode)
                cancelBtnElement.parentNode.replaceChild(newCancelBtn, cancelBtnElement);
            if (closeBtnElement.parentNode)
                closeBtnElement.parentNode.replaceChild(newCloseBtn, closeBtnElement);

            if (newOkBtn instanceof HTMLElement) {
                newOkBtn.textContent = buttonLabels.ok;
                newOkBtn.onclick = () => {
                    hideCustomConfirm();
                    resolve(true);
                };
            }
            if (newCancelBtn instanceof HTMLElement) {
                newCancelBtn.textContent = buttonLabels.cancel;
                newCancelBtn.onclick = () => {
                    hideCustomConfirm();
                    resolve(false);
                };
            }
            if (newCloseBtn instanceof HTMLElement) {
                newCloseBtn.onclick = () => {
                    hideCustomConfirm();
                    resolve(false);
                };
            }

            setModalTheme(customConfirmModal, customConfirmTitle, newOkBtn, theme);
            customConfirmModal.classList.remove('hidden');
        });
    } else {
        logger.error('Custom confirm modal elements not found or not HTMLElements.');
        return Promise.resolve(window.confirm(`${title}: ${message}`));
    }
}

// Schedule Modal
const scheduleModal = document.getElementById('schedule-modal');
const scheduleModalTaskName = document.getElementById('schedule-modal-task-name');
const scheduleModalDuration = document.getElementById('schedule-modal-duration');
const closeScheduleModalButton = document.getElementById('close-schedule-modal');
const cancelScheduleModalButton = document.getElementById('cancel-schedule-modal');
const scheduleModalForm = document.getElementById('schedule-modal-form');
const modalStartTimeInput = scheduleModalForm
    ? scheduleModalForm.querySelector('input[name="modal-start-time"]')
    : null;
const modalDurationHoursInput = scheduleModalForm
    ? scheduleModalForm.querySelector('input[name="modal-duration-hours"]')
    : null;
const modalDurationMinutesInput = scheduleModalForm
    ? scheduleModalForm.querySelector('input[name="modal-duration-minutes"]')
    : null;

export function hideScheduleModal() {
    if (scheduleModal) scheduleModal.classList.add('hidden');
}
export function showScheduleModal(taskName, taskEstDurationText, taskId, suggestedStartTime) {
    if (
        scheduleModalTaskName &&
        scheduleModalDuration &&
        modalStartTimeInput &&
        scheduleModal &&
        scheduleModalForm instanceof HTMLFormElement
    ) {
        scheduleModalTaskName.textContent = taskName;
        scheduleModalDuration.textContent = taskEstDurationText;
        scheduleModalForm.dataset.taskId = taskId;

        // Get the task from the state to access its estimated duration
        const task = getTaskState().find((t) => t.id === taskId);
        if (task && task.estDuration) {
            const durationObject = calculateHoursAndMinutes(task.estDuration, true);
            if (
                typeof durationObject === 'object' &&
                durationObject !== null &&
                typeof durationObject.hours === 'number' &&
                typeof durationObject.minutes === 'number' &&
                modalDurationHoursInput instanceof HTMLInputElement &&
                modalDurationMinutesInput instanceof HTMLInputElement
            ) {
                modalDurationHoursInput.value = durationObject.hours.toString();
                modalDurationMinutesInput.value = durationObject.minutes
                    .toString()
                    .padStart(2, '0');
            }
        }

        if (modalStartTimeInput instanceof HTMLInputElement) {
            modalStartTimeInput.value = suggestedStartTime;
            modalStartTimeInput.focus();
        } else if (modalStartTimeInput) {
            logger.warn('modalStartTimeInput is not an HTMLInputElement for focus/value');
        }
        scheduleModal.classList.remove('hidden');
    } else {
        logger.error('Schedule modal elements not found or form is not an HTMLFormElement.');
    }
}
if (closeScheduleModalButton) closeScheduleModalButton.addEventListener('click', hideScheduleModal);
if (cancelScheduleModalButton)
    cancelScheduleModalButton.addEventListener('click', hideScheduleModal);

export function initializeModalEventListeners(unscheduledTaskCallbacks, _appCallbacks) {
    // Modified signature
    globalUnscheduledTaskCallbacks = unscheduledTaskCallbacks; // Store for potential use if any modal still needs it

    if (scheduleModalForm instanceof HTMLFormElement) {
        scheduleModalForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const taskId = scheduleModalForm.dataset.taskId;
            let startTime = '';
            if (modalStartTimeInput instanceof HTMLInputElement) {
                startTime = modalStartTimeInput.value;
            } else {
                logger.warn(
                    'modalStartTimeInput in scheduleModalForm submit is not an HTMLInputElement'
                );
            }

            // Get duration from the inputs
            let duration = null;
            if (
                modalDurationHoursInput instanceof HTMLInputElement &&
                modalDurationMinutesInput instanceof HTMLInputElement
            ) {
                const hours = parseInt(modalDurationHoursInput.value) || 0;
                const minutes = parseInt(modalDurationMinutesInput.value) || 0;
                if (hours < 0 || minutes < 0 || minutes > 59) {
                    showAlert(
                        'Please enter valid numbers for duration (HH >= 0, 0 <= MM <= 59).',
                        'teal'
                    );
                    return;
                }
                duration = hours * 60 + minutes;
                if (duration <= 0) {
                    showAlert('Duration must be greater than 0.', 'teal');
                    return;
                }
            }

            if (
                taskId &&
                startTime &&
                duration !== null &&
                globalUnscheduledTaskCallbacks &&
                globalUnscheduledTaskCallbacks.onConfirmScheduleTask
            ) {
                globalUnscheduledTaskCallbacks.onConfirmScheduleTask(taskId, startTime, duration);
            } else {
                logger.error(
                    'Could not submit schedule modal form due to missing taskId, startTime, duration, or callback.',
                    { taskId, startTime, duration }
                );
            }
            hideScheduleModal();
        });
    } else {
        logger.error('Schedule Modal Form not found or not an HTMLFormElement.');
    }
}

// --- Inline Edit Functions for Unscheduled Tasks ---
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

    const durationObject = calculateHoursAndMinutes(taskData.estDuration, true);
    if (hoursInput instanceof HTMLInputElement && minutesInput instanceof HTMLInputElement) {
        if (
            typeof durationObject === 'object' &&
            durationObject !== null &&
            typeof durationObject.hours === 'number' &&
            typeof durationObject.minutes === 'number'
        ) {
            hoursInput.value = durationObject.hours.toString();
            minutesInput.value = durationObject.minutes.toString().padStart(2, '0');
        } else {
            hoursInput.value = '0';
            minutesInput.value = '00';
        }
    } else {
        logger.warn('Duration inputs not found for inline edit form', form);
    }

    priorityRadios.forEach((radioNode) => {
        if (radioNode instanceof HTMLInputElement && radioNode.value === taskData.priority) {
            radioNode.checked = true;
        } else if (radioNode instanceof HTMLInputElement) {
            radioNode.checked = false;
        }
    });
}

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

    let description = '';
    if (descriptionInput instanceof HTMLInputElement) description = descriptionInput.value.trim();
    if (!description) {
        showAlert('Task description cannot be empty.', 'teal');
        if (descriptionInput instanceof HTMLInputElement) descriptionInput.focus();
        return null;
    }

    let hours = 0;
    if (hoursInput instanceof HTMLInputElement) hours = parseInt(hoursInput.value) || 0;
    let minutes = 0;
    if (minutesInput instanceof HTMLInputElement) minutes = parseInt(minutesInput.value) || 0;

    if (hours < 0 || minutes < 0 || minutes > 59) {
        showAlert(
            'Please enter valid numbers for estimated duration (HH >= 0, 0 <= MM <= 59).',
            'teal'
        );
        if (hours < 0 && hoursInput instanceof HTMLInputElement) hoursInput.focus();
        else if ((minutes < 0 || minutes > 59) && minutesInput instanceof HTMLInputElement)
            minutesInput.focus();
        return null;
    }
    const estDuration = hours * 60 + minutes;

    let priority = 'medium'; // Default if somehow not found
    if (selectedPriorityElement instanceof HTMLInputElement) {
        priority = selectedPriorityElement.value;
    }

    return { description, priority, estDuration };
}

export function toggleUnscheduledTaskInlineEdit(taskId, showEditForm, taskData) {
    const taskCardElement = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (!taskCardElement) {
        logger.error('toggleUnscheduledTaskInlineEdit: Task card element not found for ID', taskId);
        return;
    }
    const viewPart = taskCardElement.querySelector('.flex.justify-between.items-start.w-full'); // The main display row
    const editFormPart = taskCardElement.querySelector('.inline-edit-unscheduled-form');

    if (!viewPart || !editFormPart) {
        logger.error(
            'Could not find view or edit form parts in task card for toggling.',
            taskCardElement
        );
        return;
    }

    if (showEditForm) {
        if (taskData) {
            // taskData is only passed when initially showing the form
            populateUnscheduledTaskInlineEditForm(taskId, taskData);
        }
        viewPart.classList.add('hidden');
        editFormPart.classList.remove('hidden');
        const descInput = editFormPart.querySelector('input[name="inline-edit-description"]');
        if (descInput instanceof HTMLInputElement) descInput.focus();
    } else {
        viewPart.classList.remove('hidden');
        editFormPart.classList.add('hidden');
    }
}

// --- Rendering Functions ---

export function renderDateTime() {
    const now = new Date();
    const currentTimeElement = getCurrentTimeElement();
    const currentDateElement = getCurrentDateElement();
    if (currentTimeElement)
        currentTimeElement.textContent = now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    if (currentDateElement)
        currentDateElement.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
}

export function startRealTimeClock() {
    renderDateTime();
    setInterval(renderDateTime, 1000);
}

export function initializeTaskTypeToggle() {
    const scheduledRadio = document.getElementById('scheduled');
    const unscheduledRadio = document.getElementById('unscheduled');
    const timeInputs = document.getElementById('time-inputs');
    const priorityInput = document.getElementById('priority-input');
    const addTaskButton = document.querySelector('#task-form button[type="submit"]');
    const descriptionInput = document.querySelector('input[name="description"]');

    if (
        scheduledRadio instanceof HTMLInputElement &&
        unscheduledRadio instanceof HTMLInputElement &&
        timeInputs instanceof HTMLElement &&
        priorityInput instanceof HTMLElement &&
        addTaskButton instanceof HTMLElement &&
        descriptionInput instanceof HTMLElement
    ) {
        const toggleVisibility = () => {
            if (scheduledRadio.checked) {
                timeInputs.classList.remove('hidden');
                priorityInput.classList.add('hidden');
                addTaskButton.className =
                    'shrink-0 bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300 px-5 py-2.5 rounded-lg w-full sm:w-auto font-normal text-white transition-all duration-300 flex items-center justify-center';
                descriptionInput.className =
                    'bg-slate-700 p-2.5 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none transition-all';
            } else {
                timeInputs.classList.add('hidden');
                priorityInput.classList.remove('hidden');
                addTaskButton.className =
                    'shrink-0 bg-gradient-to-r from-indigo-500 to-indigo-400 hover:from-indigo-400 hover:to-indigo-300 px-5 py-2.5 rounded-lg w-full sm:w-auto font-normal text-white transition-all duration-300 flex items-center justify-center';
                descriptionInput.className =
                    'bg-slate-700 p-2.5 rounded-lg w-full border border-slate-600 focus:border-indigo-400 focus:outline-none transition-all';
            }
        };

        scheduledRadio.addEventListener('change', toggleVisibility);
        unscheduledRadio.addEventListener('change', toggleVisibility);
        toggleVisibility(); // Initial call

        // Add page visibility change listener to re-sync form state when user returns to tab
        // This fixes mobile bug where radio button state and form UI can get out of sync
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Page became visible again, re-sync the form state
                toggleVisibility();
            }
        });

        // Also listen for focus events as additional safeguard for mobile browsers
        window.addEventListener('focus', () => {
            toggleVisibility();
        });
    } else {
        logger.error('DOM elements for task type toggle not found or not of expected types.');
    }
}

function renderEditTaskHTML(task, index) {
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

function renderViewTaskHTML(task, index, isActiveTask) {
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

export function renderUnscheduledTasks(unscheduledTasks, eventCallbacks) {
    globalUnscheduledTaskCallbacks = eventCallbacks; // Store for event delegation
    const unscheduledTaskList = document.getElementById('unscheduled-task-list');
    if (!unscheduledTaskList) {
        logger.error('Unscheduled task list element not found.');
        return;
    }
    unscheduledTaskList.innerHTML = ''; // Clear existing tasks

    if (unscheduledTasks.length === 0) {
        unscheduledTaskList.innerHTML =
            '<p class="text-gray-500 text-sm italic px-2">No unscheduled tasks yet. Add some using the form above!</p>';
        return;
    }

    unscheduledTasks.forEach((task) => {
        const priorityClasses = getPriorityClasses(task.priority);
        const isCompleted = task.status === 'completed';

        const durationDetailsOrString = calculateHoursAndMinutes(task.estDuration, true);
        let durationText = '0m';
        if (
            typeof durationDetailsOrString === 'object' &&
            durationDetailsOrString !== null &&
            typeof durationDetailsOrString.text === 'string'
        ) {
            durationText = durationDetailsOrString.text;
        } else if (typeof durationDetailsOrString === 'string') {
            durationText = durationDetailsOrString;
            logger.warn(
                'calculateHoursAndMinutes returned string unexpectedly when object was expected',
                task.estDuration
            );
        }

        const taskCard = document.createElement('div');
        taskCard.className = `task-card bg-gray-800 bg-opacity-60 ${priorityClasses.border} p-2 sm:p-4 rounded-lg shadow-lg flex flex-col gap-2`;
        taskCard.dataset.taskId = task.id;
        taskCard.dataset.taskName = task.description;
        taskCard.dataset.taskEstDuration = durationText;

        const taskDisplayPart = document.createElement('div');
        taskDisplayPart.className =
            'flex flex-col sm:flex-row justify-between items-start w-full gap-2 sm:gap-0';

        taskDisplayPart.innerHTML = `
            <div class="flex items-start space-x-3 min-w-0 flex-1">
                <label class="task-checkbox-unscheduled mt-0.5 ${isCompleted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}" title="${isCompleted ? 'Task already completed' : 'Toggle complete status'}">
                    <i class="fa-regular ${isCompleted ? 'fa-check-square text-indigo-400' : 'fa-square text-slate-500'} text-lg sm:text-xl"></i>
                </label>
                <div class="min-w-0 flex-1">
                    <div class="font-medium text-white ${isCompleted ? 'line-through opacity-70' : ''} text-sm sm:text-base break-words">${task.description}</div>
                    <div class="text-xs text-gray-400 mt-1.5 flex items-center flex-wrap gap-1.5 ${isCompleted ? 'opacity-70' : ''}">
                        <span class="priority-badge inline-flex items-center ${priorityClasses.bg} ${priorityClasses.text} px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs">
                            <i class="${priorityClasses.icon} mr-1 text-xs"></i>${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
                        </span>
                        <span class="inline-flex items-center text-gray-400 text-xs">
                            <i class="fa-regular fa-hourglass mr-1"></i>Est: ${durationText}
                        </span>
                    </div>
                </div>
            </div>
            <div class="flex space-x-1 ml-auto">
                <button class="text-gray-400 hover:text-teal-400 p-1.5 sm:p-2 hover:bg-gray-700 rounded-lg transition-colors btn-schedule-task" title="Schedule task" data-task-id="${task.id}" ${isCompleted ? 'disabled class="opacity-50 cursor-not-allowed"' : ''}>
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
        taskCard.appendChild(taskDisplayPart);

        // Inline Edit Form (hidden by default)
        const editFormContainer = document.createElement('div');
        editFormContainer.className =
            'inline-edit-unscheduled-form hidden mt-3 pt-3 border-t border-gray-700 w-full';
        editFormContainer.innerHTML = `
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
                            <input type="radio" name="inline-edit-priority" value="high" class="hidden peer" ${task.priority === 'high' ? 'checked' : ''}>
                            <div class="task-edit-priority-option text-center py-1.5 px-2 rounded-lg border border-gray-600 bg-gray-700 bg-opacity-30
                                peer-checked:bg-rose-500 peer-checked:bg-opacity-20
                                hover:bg-opacity-50 cursor-pointer transition-all text-sm">
                                <i class="fa-solid fa-bars text-rose-400"></i>
                                <span class="ml-1">High</span>
                            </div>
                        </label>
                        <label class="flex-1">
                            <input type="radio" name="inline-edit-priority" value="medium" class="hidden peer" ${task.priority === 'medium' ? 'checked' : ''}>
                            <div class="task-edit-priority-option text-center py-1.5 px-2 rounded-lg border border-gray-600 bg-gray-700 bg-opacity-30
                                peer-checked:bg-amber-400 peer-checked:bg-opacity-20
                                hover:bg-opacity-50 cursor-pointer transition-all text-sm">
                                <i class="fa-regular fa-equals text-amber-400"></i>
                                <span class="ml-1">Med</span>
                            </div>
                        </label>
                        <label class="flex-1">
                            <input type="radio" name="inline-edit-priority" value="low" class="hidden peer" ${task.priority === 'low' ? 'checked' : ''}>
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
        taskCard.appendChild(editFormContainer);
        unscheduledTaskList.appendChild(taskCard);

        // After appending, if task is in edit mode, toggle visibility
        if (task.isEditingInline) {
            toggleUnscheduledTaskInlineEdit(task.id, true, task);
        }
    });
}

function getPriorityClasses(priority) {
    const priorityConfig = {
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

    const config = priorityConfig[priority] || priorityConfig.medium;

    return {
        border: config.border,
        bg: config.bg,
        text: config.text,
        icon: config.icon,
        focusRing: config.focusRing,
        checkbox: 'text-teal-700'
    };
}

function handleScheduledTaskListClick(event) {
    if (!globalScheduledTaskCallbacks) {
        logger.warn('handleScheduledTaskListClick: globalScheduledTaskCallbacks not initialized');
        return;
    }
    const target = /** @type {HTMLElement} */ (event.target);

    // Check for Cancel button first
    const cancelButtonElement = target.closest('.btn-edit-cancel');
    if (cancelButtonElement instanceof HTMLElement) {
        const cancelButton = /** @type {HTMLElement} */ (cancelButtonElement);
        event.preventDefault();
        const editFormElement = cancelButton.closest('form');
        if (
            editFormElement instanceof HTMLFormElement &&
            editFormElement.id &&
            editFormElement.id.startsWith('edit-task-')
        ) {
            const editForm = /** @type {HTMLFormElement} */ (editFormElement);
            const taskId = editForm.dataset.taskId;
            const taskIndexStr = cancelButton.dataset.taskIndex; // Index is on the button

            if (taskId && taskIndexStr !== undefined && globalScheduledTaskCallbacks.onCancelEdit) {
                globalScheduledTaskCallbacks.onCancelEdit(taskId, parseInt(taskIndexStr, 10));
            } else {
                logger.warn('Cancel button: taskId, taskIndexStr or onCancelEdit cb missing.', {
                    taskId,
                    taskIndexStr
                });
            }
        } else {
            logger.warn('Cancel button found, but not within an expected edit form.', {
                cancelButton
            });
        }
        return; // Processed cancel
    }

    // For other clicks (checkbox, edit pencil, delete button on view task)
    let taskElementContextSource = target.closest('.task-item'); // General task container if view mode
    if (!taskElementContextSource) {
        // If not in a .task-item, try any [data-task-id] (like the form itself)
        taskElementContextSource = target.closest('[data-task-id]');
    }

    if (!(taskElementContextSource instanceof HTMLElement)) {
        return; // Click was not on a recognized task-related element
    }
    const taskElementContext = /** @type {HTMLElement} */ (taskElementContextSource);

    const taskId = taskElementContext.dataset.taskId;
    const taskIndexStr = taskElementContext.dataset.taskIndex;

    if (!taskId || taskIndexStr === undefined) {
        logger.warn(
            'handleScheduledTaskListClick: Click on task-like element, but taskId or taskIndex missing.',
            { taskId, taskIndexStr, taskElementContext }
        );
        return;
    }

    const taskIndex = parseInt(taskIndexStr, 10);

    if (target.closest('.checkbox')) {
        event.preventDefault();
        // Get all tasks and find the first uncompleted one (active task)
        const allTasks = getTaskState().filter((t) => t.type === 'scheduled');
        const activeTask = allTasks.find((t) => t.status !== 'completed');

        // Only allow completion if this is the active task
        if (activeTask && activeTask.id === taskId && globalScheduledTaskCallbacks.onCompleteTask) {
            globalScheduledTaskCallbacks.onCompleteTask(taskId, taskIndex);
        } else {
            logger.warn('Attempted to complete a non-active task:', taskId);
        }
        return;
    }

    if (target.closest('.btn-edit')) {
        // "pencil" icon on view task
        event.preventDefault();
        if (globalScheduledTaskCallbacks.onEditTask) {
            globalScheduledTaskCallbacks.onEditTask(taskId, taskIndex);
        }
        return;
    }

    if (target.closest('.btn-lock')) {
        event.preventDefault();
        if (globalScheduledTaskCallbacks.onLockTask) {
            globalScheduledTaskCallbacks.onLockTask(taskId, taskIndex);
        }
        return;
    }

    if (target.closest('.btn-unschedule')) {
        event.preventDefault();
        if (globalScheduledTaskCallbacks.onUnscheduleTask) {
            globalScheduledTaskCallbacks.onUnscheduleTask(taskId, taskIndex);
        }
        return;
    }

    if (target.closest('.btn-delete')) {
        event.preventDefault();
        event.stopPropagation();
        if (globalScheduledTaskCallbacks.onDeleteTask) {
            globalScheduledTaskCallbacks.onDeleteTask(taskId, taskIndex);
        }
        return;
    }
}

function handleScheduledTaskListSubmit(event) {
    if (!globalScheduledTaskCallbacks) return;
    const targetForm = /** @type {HTMLFormElement} */ (event.target);
    if (targetForm.id && targetForm.id.startsWith('edit-task-')) {
        event.preventDefault();
        const taskId = targetForm.dataset.taskId;
        const taskIndexStr = targetForm.dataset.taskIndex;
        if (taskId && taskIndexStr !== undefined && globalScheduledTaskCallbacks.onSaveTaskEdit) {
            globalScheduledTaskCallbacks.onSaveTaskEdit(
                taskId,
                targetForm,
                parseInt(taskIndexStr, 10)
            );
        }
    }
}

function handleUnscheduledTaskListClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const taskCard = /** @type {HTMLElement} */ (target.closest('.task-card'));

    if (!taskCard || !globalUnscheduledTaskCallbacks) return;

    const taskId = taskCard.dataset.taskId;

    if (target.closest('.btn-schedule-task')) {
        if (globalUnscheduledTaskCallbacks.onScheduleUnscheduledTask && taskId) {
            const taskName = taskCard.dataset.taskName || 'Task';
            const estDurationText = taskCard.dataset.taskEstDuration || 'N/A';
            const task = getTaskState().find((t) => t.id === taskId); // Check if task is completed
            if (task && task.status !== 'completed') {
                // Only schedule if not completed
                globalUnscheduledTaskCallbacks.onScheduleUnscheduledTask(
                    taskId,
                    taskName,
                    estDurationText
                );
            }
        }
    } else if (target.closest('.btn-edit-unscheduled')) {
        if (globalUnscheduledTaskCallbacks.onEditUnscheduledTask && taskId) {
            logger.debug(`Edit button clicked for unscheduled task: ${taskId}`);
            globalUnscheduledTaskCallbacks.onEditUnscheduledTask(taskId);
        }
    } else if (target.closest('.btn-delete-unscheduled')) {
        if (globalUnscheduledTaskCallbacks.onDeleteUnscheduledTask && taskId) {
            globalUnscheduledTaskCallbacks.onDeleteUnscheduledTask(taskId);
        }
    } else if (target.closest('.task-checkbox-unscheduled')) {
        if (globalUnscheduledTaskCallbacks.onToggleCompleteUnscheduledTask && taskId) {
            globalUnscheduledTaskCallbacks.onToggleCompleteUnscheduledTask(taskId);
        } else {
            logger.warn(
                'onToggleCompleteUnscheduledTask callback not found or taskId missing for unscheduled task checkbox.'
            );
        }
    } else if (target.closest('.btn-save-inline-edit')) {
        // Handle save from inline form
        if (globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit && taskId) {
            logger.debug(`Save inline edit button clicked for unscheduled task: ${taskId}`);
            globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit(taskId);
        }
    } else if (target.closest('.btn-cancel-inline-edit')) {
        // Handle cancel from inline form
        if (globalUnscheduledTaskCallbacks.onCancelUnscheduledTaskEdit && taskId) {
            logger.debug(`Cancel inline edit button clicked for unscheduled task: ${taskId}`);
            globalUnscheduledTaskCallbacks.onCancelUnscheduledTaskEdit(taskId);
        }
    }
}

function handleUnscheduledTaskListSubmit(event) {
    event.preventDefault(); // Always prevent default form submission
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const taskCard = /** @type {HTMLElement} */ (form.closest('.task-card'));
    if (!taskCard || !globalUnscheduledTaskCallbacks) return;

    const taskId = taskCard.dataset.taskId;
    if (taskId && globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit) {
        globalUnscheduledTaskCallbacks.onSaveUnscheduledTaskEdit(taskId);
    }
}

export function initializeScheduledTaskListEventListeners(eventCallbacks) {
    const taskListElement = getScheduledTaskListElement();
    if (!taskListElement) {
        logger.error('Scheduled task list element not found.');
        return;
    }
    taskListElement.removeEventListener('click', handleScheduledTaskListClick);
    taskListElement.removeEventListener('submit', handleScheduledTaskListSubmit);
    globalScheduledTaskCallbacks = eventCallbacks;
    taskListElement.addEventListener('click', handleScheduledTaskListClick);
    taskListElement.addEventListener('submit', handleScheduledTaskListSubmit);
}

export function initializeUnscheduledTaskListEventListeners(callbacks) {
    globalUnscheduledTaskCallbacks = callbacks;
    const unscheduledTaskList = document.getElementById('unscheduled-task-list');
    if (unscheduledTaskList) {
        // Remove existing listeners to prevent duplicates if re-initialized
        unscheduledTaskList.removeEventListener('click', handleUnscheduledTaskListClick);
        unscheduledTaskList.removeEventListener('submit', handleUnscheduledTaskListSubmit);
        unscheduledTaskList.addEventListener('click', handleUnscheduledTaskListClick);
        unscheduledTaskList.addEventListener('submit', handleUnscheduledTaskListSubmit);
    } else {
        logger.error('Unscheduled task list element not found for event listeners.');
    }
}

export function initializeDragAndDropUnscheduled(callbacks) {
    const taskList = document.getElementById('unscheduled-task-list');
    if (!taskList) return;

    let dragSrcEl = null;

    taskList.addEventListener('dragstart', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        target.style.opacity = '0.4';
        dragSrcEl = target;
        e.dataTransfer?.setData('text/html', target.innerHTML);
    });

    taskList.addEventListener('dragend', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        target.style.opacity = '1';
    });

    taskList.addEventListener('dragover', (e) => {
        e.preventDefault();
        return false;
    });

    taskList.addEventListener('dragenter', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        const taskCard = /** @type {HTMLElement} */ (target.closest('.task-card'));
        if (taskCard) {
            taskCard.classList.add('bg-gray-700');
        }
    });

    taskList.addEventListener('dragleave', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        const taskCard = /** @type {HTMLElement} */ (target.closest('.task-card'));
        if (taskCard) {
            taskCard.classList.remove('bg-gray-700');
        }
    });

    taskList.addEventListener('drop', (e) => {
        e.stopPropagation();
        const target = /** @type {HTMLElement} */ (e.target);
        if (!(target instanceof HTMLElement)) return;
        const taskCard = /** @type {HTMLElement} */ (target.closest('.task-card'));
        if (!taskCard || !dragSrcEl) return;

        taskCard.classList.remove('bg-gray-700');

        if (dragSrcEl !== taskCard) {
            const draggedTaskId = dragSrcEl.dataset.taskId;
            const targetTaskId = taskCard.dataset.taskId;
            if (draggedTaskId && targetTaskId && callbacks.onDropUnscheduledTask) {
                callbacks.onDropUnscheduledTask(draggedTaskId, targetTaskId);
            }
        }
    });
}

export function renderTasks(tasksToRender, eventCallbacks) {
    const taskListElement = getScheduledTaskListElement();
    if (!taskListElement) {
        logger.error('Scheduled task list element not found.');
        return;
    }
    if (!globalScheduledTaskCallbacks) {
        initializeScheduledTaskListEventListeners(eventCallbacks);
    } else {
        globalScheduledTaskCallbacks = eventCallbacks;
    }
    let activeTaskFound = false;
    const scheduledTasks = tasksToRender.filter((task) => task.type === 'scheduled');

    if (scheduledTasks.length === 0) {
        taskListElement.innerHTML =
            '<p class="text-gray-500 text-sm italic px-2">No scheduled tasks yet. Add some using the form above or schedule a task from below!</p>';
        return;
    }

    taskListElement.innerHTML = scheduledTasks
        .map((task) => {
            const originalIndex = tasksToRender.findIndex((t) => t.id === task.id);
            let isActiveTask = false;
            if (!activeTaskFound && task.status !== 'completed') {
                activeTaskFound = true;
                isActiveTask = true;
            }
            return task.editing
                ? renderEditTaskHTML(task, originalIndex)
                : renderViewTaskHTML(task, originalIndex, isActiveTask);
        })
        .join('');
}

export function updateStartTimeField(suggestedTime /*: string */, forceUpdate = false) {
    logger.debug('updateStartTimeField called with:', { suggestedTime, forceUpdate });
    const taskForm = getTaskFormElement();
    if (!taskForm) {
        logger.warn('Task form not found in updateStartTimeField.');
        return;
    }
    const startTimeInput = taskForm.querySelector('input[name="start-time"]');

    if (startTimeInput instanceof HTMLInputElement) {
        const now = new Date(); // This is a Date object

        if (forceUpdate) {
            startTimeInput.value = suggestedTime;
            logger.debug('updateStartTimeField - FORCED value to:', startTimeInput.value);
            // If the forced suggestedTime is a "special" calculation (not just the current rounded time),
            // disable auto-update so it doesn't get immediately overwritten by refreshStartTimeField.
            if (suggestedTime !== getCurrentTimeRounded()) {
                startTimeAutoUpdate.disable();
                logger.debug(
                    'Start time field updated (forced with special value), auto-update disabled:',
                    suggestedTime
                );
            } else {
                startTimeAutoUpdate.enable(suggestedTime, now); // now is a Date object
                logger.debug(
                    'Start time field updated (forced with current time), auto-update enabled:',
                    suggestedTime
                );
            }
        } else if (startTimeAutoUpdate.isEnabled()) {
            if (startTimeAutoUpdate.hasDateChanged(now)) {
                // now is a Date object
                startTimeAutoUpdate.disable();
                logger.info('Start time auto-update disabled due to date change.');
            } else {
                startTimeInput.value = suggestedTime; // suggestedTime is a string like HH:MM
                logger.debug('Start time field updated (auto):', suggestedTime);
            }
        }
    } else {
        logger.warn(
            'Start time input not found or not an HTMLInputElement in updateStartTimeField.'
        );
    }
}

export function refreshStartTimeField() {
    if (startTimeAutoUpdate.isEnabled()) {
        const currentTimeString = getCurrentTimeRounded(); // This returns a string like HH:MM
        updateStartTimeField(currentTimeString, false);
    }
}

export function disableStartTimeAutoUpdate() {
    startTimeAutoUpdate.disable();
}

export function initializePageEventListeners(appCallbacks, taskFormElement) {
    if (!(taskFormElement instanceof HTMLFormElement)) {
        logger.error(
            'Task form element not found or not an HTMLFormElement for initializePageEventListeners.'
        );
    } else {
        taskFormElement.addEventListener('submit', (event) => {
            event.preventDefault(); // Prevent default form submission (page reload)
            if (appCallbacks && appCallbacks.onTaskFormSubmit) {
                appCallbacks.onTaskFormSubmit(taskFormElement);
            } else {
                logger.error(
                    'onTaskFormSubmit callback not provided to initializePageEventListeners'
                );
            }
        });
        logger.debug('Submit event listener added to task form.');

        // Add listener to disable auto-update on manual input
        const startTimeInput = taskFormElement.querySelector('input[name="start-time"]');
        if (startTimeInput instanceof HTMLInputElement) {
            startTimeInput.addEventListener('input', () => {
                logger.debug('User manually changed start time input, disabling auto-update.');
                disableStartTimeAutoUpdate();
            });
        } else {
            logger.warn(
                'Start time input not found in task form for attaching input event listener during page init.'
            );
        }
    }

    // Optional: Global click listener to reset flags (from V1, consider if still needed for V2)
    document.addEventListener('click', (event) => {
        if (appCallbacks && appCallbacks.onGlobalClick) {
            appCallbacks.onGlobalClick(event);
        }
    });
}

export function getTaskFormElement() {
    return /** @type {HTMLFormElement|null} */ (document.getElementById('task-form'));
}
export function getScheduledTaskListElement() {
    return document.getElementById('scheduled-task-list');
}
export function getCurrentTimeElement() {
    return document.getElementById('current-time');
}
export function getCurrentDateElement() {
    return document.getElementById('current-date');
}
export function getDeleteAllButtonElement() {
    return document.getElementById('delete-all');
}
export function getClearOptionsDropdownTriggerButtonElement() {
    return document.getElementById('clear-options-dropdown-trigger-btn');
}
export function getClearTasksDropdownMenuElement() {
    return document.getElementById('clear-tasks-dropdown'); // This is the dropdown for the single "Clear Scheduled" option
}
export function getClearScheduledOptionElement() {
    return document.getElementById('clear-scheduled-tasks-option');
}
export function getClearCompletedOptionElement() {
    return document.getElementById('clear-completed-tasks-option');
}
export function toggleClearTasksDropdown() {
    const dropdown = getClearTasksDropdownMenuElement();
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}
export function closeClearTasksDropdown() {
    const dropdown = getClearTasksDropdownMenuElement();
    if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
    }
}
export function getTaskViewElement(taskId) {
    return document.getElementById(`view-task-${taskId}`);
}
export function getTaskEditFormElement(taskId) {
    return /** @type {HTMLFormElement|null} */ (document.getElementById(`edit-task-${taskId}`));
}
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
export function showAlert(message, theme = 'indigo') {
    showCustomAlert('Alert', message, theme);
}
/**
 * Show a confirmation dialog with customizable button labels
 * @param {string} message - The message to display
 * @param {{ok: string, cancel: string}=} buttonLabels - Optional custom labels for the buttons
 * @param {string=} theme - The theme to use ('indigo' or 'teal')
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
export function askConfirmation(message, buttonLabels, theme = 'indigo') {
    return showCustomConfirm('Confirmation', message, buttonLabels, theme);
}

/**
 * Extracts task data from the main task form.
 * Handles both scheduled and unscheduled task types.
 * @param {HTMLFormElement} formElement - The task form element.
 * @returns {object|null} Task data object or null if form is invalid.
 */
export function extractTaskFormData(formElement) {
    logger.debug('extractTaskFormData called', formElement);
    const formData = new FormData(formElement);
    const description = formData.get('description')?.toString().trim();
    const taskType = formData.get('task-type')?.toString();
    logger.debug('Extracted description and taskType:', { description, taskType });

    if (!description) {
        logger.warn('Description is empty');
        showAlert(
            'Task description cannot be empty.',
            taskType === 'scheduled' ? 'teal' : 'indigo'
        );
        return null;
    }

    let taskData = {
        description,
        taskType
    };

    if (taskType === 'scheduled') {
        const startTime = formData.get('start-time')?.toString();
        const durationHours = parseInt(formData.get('duration-hours')?.toString() || '0');
        const durationMinutes = parseInt(formData.get('duration-minutes')?.toString() || '0');
        const duration = durationHours * 60 + durationMinutes;
        logger.debug('Scheduled task details:', {
            startTime,
            durationHours,
            durationMinutes,
            duration
        });

        if (!startTime) {
            logger.warn('Start time missing for scheduled task');
            showAlert('Start time is required for scheduled tasks.', 'teal');
            return null;
        }
        if (duration <= 0) {
            logger.warn('Invalid duration for scheduled task:', duration);
            showAlert('Duration must be greater than 0 for scheduled tasks.', 'teal');
            return null;
        }
        taskData = { ...taskData, startTime, duration };
    } else if (taskType === 'unscheduled') {
        const priority = formData.get('priority')?.toString() || 'medium';
        const estDurationHours = parseInt(formData.get('est-duration-hours')?.toString() || '0');
        const estDurationMinutes = parseInt(
            formData.get('est-duration-minutes')?.toString() || '0'
        );
        const estDuration = estDurationHours * 60 + estDurationMinutes;
        logger.debug('Unscheduled task details:', {
            priority,
            estDurationHours,
            estDurationMinutes,
            estDuration
        });

        if (
            estDuration <= 0 &&
            (formData.get('est-duration-hours')?.toString() ||
                formData.get('est-duration-minutes')?.toString())
        ) {
            logger.warn(
                'Invalid estDuration for unscheduled task (explicitly set to <=0):',
                estDuration
            );
            showAlert(
                'Estimated duration must be greater than 0 for unscheduled tasks if specified.',
                'indigo'
            );
            return null;
        }
        if (estDuration < 0) {
            logger.warn('Invalid negative estDuration for unscheduled task:', estDuration);
            showAlert('Invalid estimated duration.', 'indigo');
            return null;
        }
        taskData = { ...taskData, priority, estDuration: estDuration > 0 ? estDuration : null };
    } else {
        logger.warn('Invalid task type selected:', taskType);
        showAlert('Invalid task type selected.', 'indigo');
        return null;
    }
    logger.debug('Returning taskData:', taskData);
    return taskData;
}

export function resetEventDelegation() {
    logger.debug('Resetting global event callbacks.');
    globalScheduledTaskCallbacks = null;
    globalUnscheduledTaskCallbacks = null;
}
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

            if (!activeTaskFound) {
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

export function getUnscheduledTaskListElement() {
    return document.getElementById('unscheduled-task-list');
}

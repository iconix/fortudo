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
let globalScheduledTaskCallbacks = null;
let globalUnscheduledTaskCallbacks = null;
let globalModalCallbacks = null;
let dragSrcEl = null; // For drag and drop

// Auto-update state for start time field
const startTimeAutoUpdate = {
    trackedTime: /** @type {string|null} */ (null),
    trackedDate: /** @type {string|null} */ (null),
    isEnabled() { return this.trackedTime !== null; },
    enable(timeValue, date = new Date()) { this.trackedTime = timeValue; this.trackedDate = date.toDateString(); },
    disable() { this.trackedTime = null; this.trackedDate = null; },
    hasDateChanged(currentDate = new Date()) { return this.trackedDate && this.trackedDate !== currentDate.toDateString(); }
};

// --- Modal Elements & Logic ---
const customAlertModal = document.getElementById('custom-alert-modal');
const customAlertTitle = document.getElementById('custom-alert-title');
const customAlertMessage = document.getElementById('custom-alert-message');
const closeCustomAlertButton = document.getElementById('close-custom-alert-modal');
const okCustomAlertButton = document.getElementById('ok-custom-alert-modal');

export function hideCustomAlert() { if (customAlertModal) customAlertModal.classList.add('hidden'); }
export function showCustomAlert(title, message) {
    if (customAlertTitle && customAlertMessage && customAlertModal) {
        customAlertTitle.textContent = title;
        customAlertMessage.textContent = message;
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

export function hideCustomConfirm() { if (customConfirmModal) customConfirmModal.classList.add('hidden'); }
export function showCustomConfirm(title, message) {
    let okBtn = document.getElementById('ok-custom-confirm-modal');
    let cancelBtn = document.getElementById('cancel-custom-confirm-modal');
    let closeBtn = document.getElementById('close-custom-confirm-modal');
    if (customConfirmTitle && customConfirmMessage && customConfirmModal && okBtn && cancelBtn && closeBtn) {
        customConfirmTitle.textContent = title;
        customConfirmMessage.textContent = message;
        return new Promise((resolve) => {
            const newOkBtn = okBtn.cloneNode(true); okBtn.parentNode.replaceChild(newOkBtn, okBtn); okBtn = newOkBtn;
            const newCancelBtn = cancelBtn.cloneNode(true); cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn); cancelBtn = newCancelBtn;
            const newCloseBtn = closeBtn.cloneNode(true); closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn); closeBtn = newCloseBtn;
            okBtn.onclick = () => { hideCustomConfirm(); resolve(true); };
            cancelBtn.onclick = () => { hideCustomConfirm(); resolve(false); };
            closeBtn.onclick = () => { hideCustomConfirm(); resolve(false); };
            customConfirmModal.classList.remove('hidden');
        });
    } else {
        logger.error('Custom confirm modal elements not found. Falling back to window.confirm.');
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
const modalStartTimeInput = scheduleModalForm ? scheduleModalForm.querySelector('input[name="modal-start-time"]') : null;

export function hideScheduleModal() { if (scheduleModal) scheduleModal.classList.add('hidden'); }
export function showScheduleModal(taskName, taskEstDurationText, taskId) {
    if (scheduleModalTaskName && scheduleModalDuration && modalStartTimeInput && scheduleModal && scheduleModalForm) {
        scheduleModalTaskName.textContent = taskName;
        scheduleModalDuration.textContent = taskEstDurationText;
        scheduleModalForm.dataset.taskId = taskId;
        modalStartTimeInput.value = '';
        scheduleModal.classList.remove('hidden');
        if(modalStartTimeInput) modalStartTimeInput.focus();
    } else {
        logger.error('Schedule modal elements not found.');
    }
}
if (closeScheduleModalButton) closeScheduleModalButton.addEventListener('click', hideScheduleModal);
if (cancelScheduleModalButton) cancelScheduleModalButton.addEventListener('click', hideScheduleModal);

// Edit Unscheduled Task Modal
const editUnscheduledTaskModal = document.getElementById('edit-unscheduled-task-modal');
const editUnscheduledModalTitle = document.getElementById('edit-unscheduled-modal-title'); // Though title is static
const editUnscheduledTaskForm = document.getElementById('edit-unscheduled-task-form');
const editUnscheduledDescriptionInput = editUnscheduledTaskForm ? editUnscheduledTaskForm.querySelector('input[name="edit-unscheduled-description"]') : null;
const editEstDurationHoursInput = editUnscheduledTaskForm ? editUnscheduledTaskForm.querySelector('input[name="edit-est-duration-hours"]') : null;
const editEstDurationMinutesInput = editUnscheduledTaskForm ? editUnscheduledTaskForm.querySelector('input[name="edit-est-duration-minutes"]') : null;
const closeEditUnscheduledModalButton = document.getElementById('close-edit-unscheduled-modal');
const cancelEditUnscheduledModalButton = document.getElementById('cancel-edit-unscheduled-modal');

export function hideEditUnscheduledModal() {
    if (editUnscheduledTaskModal) {
        editUnscheduledTaskModal.classList.add('hidden');
    }
}

export function showEditUnscheduledModal(task) {
    if (editUnscheduledTaskModal && editUnscheduledTaskForm && editUnscheduledDescriptionInput && editEstDurationHoursInput && editEstDurationMinutesInput) {
        editUnscheduledTaskForm.dataset.taskId = task.id;
        editUnscheduledDescriptionInput.value = task.description;

        const { hours, minutes } = calculateHoursAndMinutes(task.estDuration, true); // Get as object
        editEstDurationHoursInput.value = hours;
        editEstDurationMinutesInput.value = minutes;

        // Set priority radio button
        const priorityRadios = editUnscheduledTaskForm.querySelectorAll('input[name="edit-priority"]');
        priorityRadios.forEach(radio => {
            if (radio.value === task.priority) {
                radio.checked = true;
            } else {
                radio.checked = false;
            }
        });

        editUnscheduledTaskModal.classList.remove('hidden');
        editUnscheduledDescriptionInput.focus();
    } else {
        logger.error('Edit unscheduled task modal elements not found.');
    }
}
if(closeEditUnscheduledModalButton) closeEditUnscheduledModalButton.addEventListener('click', hideEditUnscheduledModal);
if(cancelEditUnscheduledModalButton) cancelEditUnscheduledModalButton.addEventListener('click', hideEditUnscheduledModal);


export function initializeModalEventListeners(callbacks) {
    globalModalCallbacks = callbacks;
    if (scheduleModalForm) {
        scheduleModalForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const taskId = scheduleModalForm.dataset.taskId;
            const startTime = modalStartTimeInput ? modalStartTimeInput.value : '';
            if (taskId && startTime && globalModalCallbacks && globalModalCallbacks.onConfirmScheduleTask) {
                globalModalCallbacks.onConfirmScheduleTask(taskId, startTime);
            } else {
                logger.error("Could not submit schedule modal form.", {taskId, startTime});
            }
            hideScheduleModal();
        });
    } else {
        logger.error("Schedule Modal Form not found.");
    }

    if (editUnscheduledTaskForm) {
        editUnscheduledTaskForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const taskId = editUnscheduledTaskForm.dataset.taskId;
            const description = editUnscheduledDescriptionInput ? editUnscheduledDescriptionInput.value : '';

            let priority = 'medium';
            const selectedPriority = editUnscheduledTaskForm.querySelector('input[name="edit-priority"]:checked');
            if (selectedPriority) {
                priority = selectedPriority.value;
            }

            const hours = editEstDurationHoursInput ? parseInt(editEstDurationHoursInput.value) || 0 : 0;
            const minutes = editEstDurationMinutesInput ? parseInt(editEstDurationMinutesInput.value) || 0 : 0;
            const estDuration = calculateMinutes(`${hours}:${minutes}`);

            if (taskId && globalModalCallbacks && globalModalCallbacks.onConfirmEditUnscheduledTask) {
                globalModalCallbacks.onConfirmEditUnscheduledTask(taskId, { description, priority, estDuration });
            } else {
                 logger.error("Could not submit edit unscheduled modal form.", {taskId});
            }
            hideEditUnscheduledModal();
        });
    } else {
        logger.error("Edit Unscheduled Task Form not found.");
    }
}


// --- Rendering Functions ---
// ... (renderDateTime, startRealTimeClock, initializeTaskTypeToggle, renderEditTaskHTML, renderViewTaskHTML, renderUnscheduledTasks, getPriorityClasses, all event listener initializers and handlers for task lists remain the same) ...
// ... (getScheduledTaskListElement, etc. also remain the same) ...

export function renderDateTime() {
    const now = new Date();
    const currentTimeElement = getCurrentTimeElement();
    const currentDateElement = getCurrentDateElement();
    if (currentTimeElement) currentTimeElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (currentDateElement) currentDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function startRealTimeClock() { renderDateTime(); setInterval(renderDateTime, 1000); }

export function initializeTaskTypeToggle() {
    const scheduledRadio = document.getElementById('scheduled');
    const unscheduledRadio = document.getElementById('unscheduled');
    const timeInputs = document.getElementById('time-inputs');
    const priorityInput = document.getElementById('priority-input');
    if (scheduledRadio && unscheduledRadio && timeInputs && priorityInput) {
        const toggleVisibility = () => {
            if (scheduledRadio.checked) {
                timeInputs.classList.remove('hidden');
                priorityInput.classList.add('hidden');
            } else {
                timeInputs.classList.add('hidden');
                priorityInput.classList.remove('hidden');
            }
        };
        scheduledRadio.addEventListener('change', toggleVisibility);
        unscheduledRadio.addEventListener('change', toggleVisibility);
        toggleVisibility();
    } else {
        logger.error('DOM elements for task type toggle not found.');
    }
}

function renderEditTaskHTML(task, index) {
    const displayStartTime = task.startDateTime ? extractTimeFromDateTime(new Date(task.startDateTime)) : '';
    return `<form id="edit-task-${task.id}" data-task-id="${task.id}" data-task-index="${index}" autocomplete="off" class="mb-4 p-4 rounded border border-gray-700 bg-gray-800 mx-2 text-left space-y-4">
        <div class="mb-4"> <input type="text" name="description" value="${task.description}" class="bg-gray-700 p-2 rounded w-full" required> </div>
        <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mb-4">
            <label class="flex items-center w-full sm:w-auto"> <span class="text-gray-400">Start Time</span> <input type="time" name="start-time" value="${displayStartTime}" class="bg-gray-700 p-2 rounded w-full lg:w-[10rem]" required> </label>
            <label class="flex items-center w-full sm:w-auto"> <span class="mr-2 text-gray-400">Duration</span> <div class="flex space-x-2 w-full sm:w-auto"> <input type="number" name="duration-hours" value="${Math.floor(task.duration / 60)}" min="0" class="bg-gray-700 p-2 rounded w-full lg:w-[4rem]"> <input type="number" name="duration-minutes" value="${task.duration % 60}" min="0" max="59" class="bg-gray-700 p-2 rounded w-full lg:w-[4rem]"> </div> </label>
            <div class="flex space-x-2"> <button type="submit" class="bg-green-500 hover:bg-green-400 px-4 py-2 rounded w-full sm:w-auto font-semibold btn-save-edit" data-task-index="${index}">Edit</button> <button type="button" class="bg-red-500 hover:bg-red-400 px-4 py-2 rounded w-full sm:w-auto font-semibold btn-edit-cancel" data-task-index="${index}">Cancel</button> </div>
        </div>
    </form>`;
}

function renderViewTaskHTML(task, index, isActiveTask) {
    const isCompleted = task.status === 'completed';
    const checkboxDisabled = isCompleted;
    let activeTaskColorClass = 'text-white';
    if (isActiveTask && !isCompleted && task.type === 'scheduled') {
        const isLate = isTaskRunningLate(task);
        activeTaskColorClass = isLate ? 'text-yellow-500' : 'text-green-500';
    }
    const displayStartTime = task.startDateTime ? extractTimeFromDateTime(new Date(task.startDateTime)) : '';
    const displayEndTime = task.endDateTime ? extractTimeFromDateTime(new Date(task.endDateTime)) : '';
    const durationText = task.duration ? calculateHoursAndMinutes(task.duration) : '';

    return `<div id="view-task-${task.id}" class="confetti-container flex items-center justify-between space-x-2 p-2 border-b border-gray-700" data-task-index="${index}" data-task-id="${task.id}">
        <div class="flex items-center space-x-4">
            <label for="task-checkbox-${task.id}" class="checkbox ${checkboxDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"> <i class="far ${isCompleted ? 'fa-check-square text-green-700' : 'fa-square text-gray-500'}"></i> </label>
            <input type="checkbox" id="task-checkbox-${task.id}" class="hidden" data-task-index="${index}" ${isCompleted ? 'checked disabled' : ''}>
            <div class="${isCompleted ? 'line-through' : ''} ${isActiveTask && !isCompleted && task.type === 'scheduled' ? '' : isCompleted ? '' : 'opacity-60'}">
                <div class="${activeTaskColorClass}">${task.description}</div>
                <div class="${activeTaskColorClass}">${convertTo12HourTime(displayStartTime)} &ndash; ${convertTo12HourTime(displayEndTime)} (${durationText})</div>
            </div>
        </div>
        <div>
            <button class="${isCompleted ? 'text-gray-500 cursor-not-allowed' : 'text-yellow-500'} btn-edit p-1" ${isCompleted ? 'disabled' : ''} data-task-index="${index}"><i class="far fa-pen"></i></button>
            <button class="${task.confirmingDelete ? 'text-red-500' : isCompleted ? 'text-gray-500 cursor-not-allowed' : 'text-red-500'} btn-delete p-1" ${isCompleted ? 'disabled' : ''} data-task-index="${index}"><i class="far ${task.confirmingDelete ? 'fa-check-circle' : 'fa-trash-can'}"></i></button>
        </div>
        <i class="confetti-particles" aria-hidden="true"></i>
        <span class="confetti-piece"></span><span class="confetti-piece"></span><span class="confetti-piece"></span>
    </div>`;
}

export function renderUnscheduledTasks(unscheduledTasks, eventCallbacks) {
    const unscheduledTaskListElement = document.getElementById('unscheduled-task-list');
    if (!unscheduledTaskListElement) { logger.error('Unscheduled task list element not found.'); return; }
    if (!globalUnscheduledTaskCallbacks) { initializeUnscheduledTaskListEventListeners(eventCallbacks); }
    else { globalUnscheduledTaskCallbacks = eventCallbacks; }

    unscheduledTaskListElement.innerHTML = unscheduledTasks.map(task => {
        const formattedEstDuration = calculateHoursAndMinutes(task.estDuration);
        let { priorityBorderClass, priorityCheckboxClass, priorityFocusRingColor, priorityBadgeBgClass, priorityBadgeTextClass, priorityIconClass, priorityText } = getPriorityClasses(task.priority);
        return `
        <div class="task-card bg-gray-800 bg-opacity-60 border-l-4 ${priorityBorderClass} p-4 rounded-lg flex justify-between items-start shadow-lg" draggable="true" data-task-id="${task.id}" data-task-name="${task.description}" data-task-est-duration="${formattedEstDuration}">
            <div class="flex items-start space-x-3">
                <input type="checkbox" class="mt-1 h-5 w-5 rounded border-gray-600 ${priorityCheckboxClass} focus:ring-${priorityFocusRingColor}" data-task-id="${task.id}" ${task.status === 'completed' ? 'checked disabled' : ''}>
                <div> <div class="font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-white'}">${task.description}</div> <div class="text-xs text-gray-400 mt-2 flex items-center flex-wrap gap-2"> <span class="priority-badge inline-flex items-center ${priorityBadgeBgClass} ${priorityBadgeTextClass} px-2 py-1 rounded-full text-xs"> <i class="far ${priorityIconClass} mr-1"></i>${priorityText} </span> <span class="inline-flex items-center text-gray-400"> <i class="far fa-hourglass mr-1"></i>Est: ${formattedEstDuration} </span> </div> </div>
            </div>
            <div class="flex space-x-1">
                <button class="text-gray-400 hover:text-yellow-500 p-2 hover:bg-gray-700 rounded-lg transition-colors btn-schedule-task" title="Schedule this task" data-task-id="${task.id}"><i class="far fa-calendar-plus"></i></button>
                <button class="text-gray-400 hover:text-yellow-500 p-2 hover:bg-gray-700 rounded-lg transition-colors btn-edit-unscheduled" title="Edit task" data-task-id="${task.id}"><i class="far fa-pen"></i></button>
                <button class="text-gray-400 hover:text-red-500 p-2 hover:bg-gray-700 rounded-lg transition-colors btn-delete-unscheduled" title="Delete task" data-task-id="${task.id}"><i class="far fa-trash-can"></i></button>
                <span class="text-gray-600 drag-handle p-2 hover:bg-gray-700 rounded-lg transition-colors" title="Drag to reorder" data-task-id="${task.id}"><i class="fas fa-grip-lines"></i></span>
            </div>
        </div>`;
    }).join('');
}

function getPriorityClasses(priority) {
    let priorityBorderClass = 'border-gray-500', priorityCheckboxClass = 'text-gray-500', priorityFocusRingColor = 'gray-500',
        priorityBadgeBgClass = 'bg-gray-500 bg-opacity-20', priorityBadgeTextClass = 'text-gray-400',
        priorityIconClass = 'fa-minus', priorityText = 'Medium Priority';
    if (priority === 'high') {
        priorityBorderClass = 'border-red-500'; priorityCheckboxClass = 'text-red-500'; priorityFocusRingColor = 'red-500';
        priorityBadgeBgClass = 'bg-red-500 bg-opacity-20'; priorityBadgeTextClass = 'text-red-400';
        priorityIconClass = 'fa-arrow-up'; priorityText = 'High Priority';
    } else if (priority === 'low') {
        priorityBorderClass = 'border-green-500'; priorityCheckboxClass = 'text-green-500'; priorityFocusRingColor = 'green-500';
        priorityBadgeBgClass = 'bg-green-500 bg-opacity-20'; priorityBadgeTextClass = 'text-green-400';
        priorityIconClass = 'fa-arrow-down'; priorityText = 'Low Priority';
    } else if (priority === 'medium') {
        priorityBorderClass = 'border-yellow-500'; priorityCheckboxClass = 'text-yellow-500'; priorityFocusRingColor = 'yellow-500';
        priorityBadgeBgClass = 'bg-yellow-500 bg-opacity-20'; priorityBadgeTextClass = 'text-yellow-400';
        priorityIconClass = 'fa-equals'; priorityText = 'Medium Priority';
    }
    return { priorityBorderClass, priorityCheckboxClass, priorityFocusRingColor, priorityBadgeBgClass, priorityBadgeTextClass, priorityIconClass, priorityText };
}


function initializeScheduledTaskListEventListeners(eventCallbacks) {
    const taskListElement = getScheduledTaskListElement();
    if (!taskListElement) { logger.error('Scheduled task list element not found.'); return; }
    taskListElement.removeEventListener('click', handleScheduledTaskListClick);
    taskListElement.removeEventListener('submit', handleScheduledTaskListSubmit);
    globalScheduledTaskCallbacks = eventCallbacks;
    taskListElement.addEventListener('click', handleScheduledTaskListClick);
    taskListElement.addEventListener('submit', handleScheduledTaskListSubmit);
}

function handleScheduledTaskListClick(event) {
    if (!globalScheduledTaskCallbacks) return;
    const target = /** @type {HTMLElement} */ (event.target);
    const taskElement = target.closest('[data-task-id]');
    if (!taskElement) return;
    const taskId = taskElement.dataset.taskId;
    const taskIndex = taskElement.dataset.taskIndex;

    if (target.closest('.checkbox')) {
        event.preventDefault();
        if (taskId) globalScheduledTaskCallbacks.onCompleteTask(taskId, taskIndex);
        return;
    }
    if (target.closest('.btn-edit')) {
        event.preventDefault();
        if (taskId) globalScheduledTaskCallbacks.onEditTask(taskId, taskIndex);
        return;
    }
    if (target.closest('.btn-delete')) {
        event.preventDefault(); event.stopPropagation();
        if (taskId) globalScheduledTaskCallbacks.onDeleteTask(taskId, taskIndex);
        return;
    }
}

function handleScheduledTaskListSubmit(event) {
    if (!globalScheduledTaskCallbacks) return;
    const target = /** @type {HTMLFormElement} */ (event.target);
    if (target.id && target.id.startsWith('edit-task-')) {
        event.preventDefault();
        const taskId = target.dataset.taskId;
        const taskIndex = target.dataset.taskIndex;
        const formData = new FormData(target);
        if (taskId) globalScheduledTaskCallbacks.onSaveTaskEdit(taskId, formData, taskIndex);
    }
}

export function initializeUnscheduledTaskListEventListeners(callbacks) {
    const unscheduledTaskListElement = document.getElementById('unscheduled-task-list');
    if (!unscheduledTaskListElement) { logger.error('Unscheduled task list element not found.'); return; }
    unscheduledTaskListElement.removeEventListener('click', handleUnscheduledTaskListClick);
    globalUnscheduledTaskCallbacks = callbacks;
    unscheduledTaskListElement.addEventListener('click', handleUnscheduledTaskListClick);
}

function handleUnscheduledTaskListClick(event) {
    if (!globalUnscheduledTaskCallbacks) return;
    const target = /** @type {HTMLElement} */ (event.target);
    const taskCard = target.closest('.task-card');
    if (!taskCard) return;
    const taskId = taskCard.dataset.taskId;
    if (!taskId) return;

    if (target.closest('.btn-schedule-task')) {
        event.preventDefault();
        const taskName = taskCard.dataset.taskName;
        const estDurationText = taskCard.dataset.taskEstDuration;
        if (taskName && estDurationText && globalUnscheduledTaskCallbacks.onScheduleUnscheduledTask) {
            globalUnscheduledTaskCallbacks.onScheduleUnscheduledTask(taskName, estDurationText, taskId);
        } else logger.warn('Task data missing for scheduling.');
    } else if (target.closest('.btn-edit-unscheduled')) {
        event.preventDefault();
        if (globalUnscheduledTaskCallbacks.onEditUnscheduledTask) globalUnscheduledTaskCallbacks.onEditUnscheduledTask(taskId);
    } else if (target.closest('.btn-delete-unscheduled')) {
        event.preventDefault();
        if (globalUnscheduledTaskCallbacks.onDeleteUnscheduledTask) globalUnscheduledTaskCallbacks.onDeleteUnscheduledTask(taskId);
    }
}

export function initializeDragAndDropUnscheduled(callbacks) {
    const taskList = document.getElementById('unscheduled-task-list');
    if (!taskList) return;

    taskList.addEventListener('dragstart', (e) => { /* ... (same as before) ... */ });
    taskList.addEventListener('dragend', (e) => { /* ... (same as before) ... */ });
    taskList.addEventListener('dragover', (e) => { /* ... (same as before) ... */ });
    taskList.addEventListener('dragenter', (e) => { /* ... (same as before) ... */ });
    taskList.addEventListener('dragleave', (e) => { /* ... (same as before) ... */ });
    taskList.addEventListener('drop', (e) => { /* ... (same as before, calls callbacks.onDropUnscheduledTask) ... */ });
}


export function renderTasks(tasksToRender, eventCallbacks) {
    const taskListElement = getScheduledTaskListElement();
    if (!taskListElement) { logger.error('Scheduled task list element not found.'); return; }
    if (!globalScheduledTaskCallbacks) { initializeScheduledTaskListEventListeners(eventCallbacks); }
    else { globalScheduledTaskCallbacks = eventCallbacks; }
    let activeTaskFound = false;
    const scheduledTasks = tasksToRender.filter(task => task.type === 'scheduled');
    taskListElement.innerHTML = scheduledTasks.map(task => {
        const originalIndex = tasksToRender.findIndex(t => t.id === task.id);
        let isActiveTask = false;
        if (!activeTaskFound && task.status !== 'completed') { activeTaskFound = true; isActiveTask = true; }
        return task.editing ? renderEditTaskHTML(task, originalIndex) : renderViewTaskHTML(task, originalIndex, isActiveTask);
    }).join('');
}

export function updateStartTimeField(suggestedTime, forceUpdate = false) { /* ... */ }
export function refreshStartTimeField() { /* ... */ }
export function disableStartTimeAutoUpdate() { startTimeAutoUpdate.disable(); }
export function initializePageEventListeners(appCallbacks, taskFormElement, deleteAllButtonElement) { /* ... */ }
export function getTaskFormElement() { return /** @type {HTMLFormElement|null} */ (document.getElementById('task-form')); }
export function getScheduledTaskListElement() { return document.getElementById('scheduled-task-list'); }
export function getCurrentTimeElement() { return document.getElementById('current-time'); }
export function getCurrentDateElement() { return document.getElementById('current-date'); }
export function getDeleteAllButtonElement() { return /** @type {HTMLButtonElement|null} */ (document.getElementById('delete-all')); }
export function getTaskViewElement(taskId) { return document.getElementById(`view-task-${taskId}`); }
export function getTaskEditFormElement(taskId) { return /** @type {HTMLFormElement|null} */ (document.getElementById(`edit-task-${taskId}`));}
export function focusTaskDescriptionInput() { /* ... */ }
export function showAlert(message) { showCustomAlert('Alert', message); }
export function askConfirmation(message) { return showCustomConfirm('Confirmation', message); }
export function extractTaskFormData(formData) { /* ... */ }
export function resetEventDelegation() { /* ... */ }
export function refreshActiveTaskColor(tasks, now = new Date()) { /* ... */ }
export function triggerConfettiAnimation(taskId) { /* ... */ }

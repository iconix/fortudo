import { calculateHoursAndMinutes, parseDuration, logger } from './utils.js';
import { getTaskState } from './task-manager.js';

// --- Modal Elements ---
const customAlertModal = document.getElementById('custom-alert-modal');
const customAlertTitle = document.getElementById('custom-alert-title');
const customAlertMessage = document.getElementById('custom-alert-message');
const closeCustomAlertButton = document.getElementById('close-custom-alert-modal');
const okCustomAlertButton = document.getElementById('ok-custom-alert-modal');

const customConfirmModal = document.getElementById('custom-confirm-modal');
const customConfirmTitle = document.getElementById('custom-confirm-title');
const customConfirmMessage = document.getElementById('custom-confirm-message');

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

// --- Helper Functions ---
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

// --- Custom Alert Modal ---
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

// Initialize alert modal button listeners
if (closeCustomAlertButton) closeCustomAlertButton.addEventListener('click', hideCustomAlert);
if (okCustomAlertButton) okCustomAlertButton.addEventListener('click', hideCustomAlert);

// --- Custom Confirm Modal ---
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

// --- Schedule Modal ---
export function hideScheduleModal() {
    if (scheduleModal) scheduleModal.classList.add('hidden');
}

export function showScheduleModal(taskName, taskEstDurationText, taskId, suggestedStartTime) {
    if (!(scheduleModalForm instanceof HTMLFormElement) || !scheduleModal) return;

    scheduleModalTaskName.textContent = taskName;
    scheduleModalDuration.textContent = taskEstDurationText;
    scheduleModalForm.dataset.taskId = taskId;

    const task = getTaskState().find((t) => t.id === taskId);
    if (
        task?.estDuration &&
        modalDurationHoursInput instanceof HTMLInputElement &&
        modalDurationMinutesInput instanceof HTMLInputElement
    ) {
        const { hours, minutes } = calculateHoursAndMinutes(task.estDuration, true);
        modalDurationHoursInput.value = hours.toString();
        modalDurationMinutesInput.value = minutes.toString().padStart(2, '0');
    }

    if (modalStartTimeInput instanceof HTMLInputElement) {
        modalStartTimeInput.value = suggestedStartTime;
        modalStartTimeInput.focus();
    }
    scheduleModal.classList.remove('hidden');
}

// Initialize schedule modal button listeners
if (closeScheduleModalButton) closeScheduleModalButton.addEventListener('click', hideScheduleModal);
if (cancelScheduleModalButton)
    cancelScheduleModalButton.addEventListener('click', hideScheduleModal);

export function initializeModalEventListeners(unscheduledTaskCallbacks) {
    if (!(scheduleModalForm instanceof HTMLFormElement)) return;

    scheduleModalForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const taskId = scheduleModalForm.dataset.taskId;
        const startTime =
            modalStartTimeInput instanceof HTMLInputElement ? modalStartTimeInput.value : '';

        let duration = null;
        if (
            modalDurationHoursInput instanceof HTMLInputElement &&
            modalDurationMinutesInput instanceof HTMLInputElement
        ) {
            const durationResult = parseDuration(
                modalDurationHoursInput.value,
                modalDurationMinutesInput.value
            );
            if (!durationResult.valid) {
                showAlert(durationResult.error, 'teal');
                return;
            }
            duration = durationResult.duration;
        }

        if (taskId && startTime && duration !== null) {
            unscheduledTaskCallbacks.onConfirmScheduleTask(taskId, startTime, duration);
        }
        hideScheduleModal();
    });
}

// --- Convenience Wrappers ---
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

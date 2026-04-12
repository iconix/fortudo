import { showAlert } from '../modal-manager.js';
import { getRunningActivity, updateRunningActivity } from './manager.js';
import { handleStartTimer, handleStopTimer } from './handlers.js';

let timerIntervalId = null;
let timerUiAbortController = null;
let pendingTimerMutation = null;
let suppressTimerFieldPersistence = false;

function shouldSuppressTimerFieldPersistence() {
    const startTimerButton = document.getElementById('start-timer-btn');
    return (
        suppressTimerFieldPersistence ||
        (!!getRunningActivity() && document.activeElement === startTimerButton)
    );
}

function moveStartTimerButton(targetId) {
    const startTimerButton = document.getElementById('start-timer-btn');
    const target = document.getElementById(targetId);

    if (!startTimerButton || !target || startTimerButton.parentElement === target) {
        return;
    }

    target.appendChild(startTimerButton);
}

function stopElapsedCounter() {
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
}

function queueTimerMutation(mutation) {
    const operation = pendingTimerMutation
        ? pendingTimerMutation.catch(() => {}).then(() => mutation())
        : Promise.resolve(mutation());
    const trackedOperation = operation.catch(() => {});
    pendingTimerMutation = trackedOperation;
    trackedOperation.finally(() => {
        if (pendingTimerMutation === trackedOperation) {
            pendingTimerMutation = null;
        }
    });
    return operation;
}

async function waitForPendingTimerMutation() {
    if (!pendingTimerMutation) {
        return;
    }

    await pendingTimerMutation;
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
    moveStartTimerButton('timer-action-group');

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
    moveStartTimerButton('activity-action-group');

    if (timerDisplay) {
        timerDisplay.classList.add('hidden');
    }
    if (formFields) {
        formFields.classList.remove('hidden');
    }
}

export function disposeTimerUI() {
    if (timerUiAbortController) {
        timerUiAbortController.abort();
        timerUiAbortController = null;
    }

    stopElapsedCounter();
    pendingTimerMutation = null;
    suppressTimerFieldPersistence = false;
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

export function initializeTimerUI(deps) {
    disposeTimerUI();
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
            'mousedown',
            () => {
                suppressTimerFieldPersistence = !!getRunningActivity();
            },
            { signal }
        );
        startTimerButton.addEventListener(
            'click',
            () => {
                void (async () => {
                    try {
                        await waitForPendingTimerMutation();

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
                            if (runningActivity) {
                                syncTimerFormState();
                            }
                            showAlert(
                                'Please enter a description before starting the timer.',
                                'sky'
                            );
                            return;
                        }

                        const result = await handleStartTimer({ description, category });
                        if (!result?.success) {
                            if (runningActivity) {
                                syncTimerFormState();
                            }
                            return;
                        }

                        if (formDescriptionInput instanceof HTMLInputElement) {
                            formDescriptionInput.value = '';
                        }
                        syncTimerFormState();
                        deps.refreshUI();
                    } finally {
                        suppressTimerFieldPersistence = false;
                    }
                })();
            },
            { signal }
        );
    }

    const stopTimerButton = document.getElementById('timer-stop-btn');
    if (stopTimerButton) {
        stopTimerButton.addEventListener(
            'click',
            () => {
                void (async () => {
                    await waitForPendingTimerMutation();

                    const result = await handleStopTimer();
                    if (!result?.success) {
                        return;
                    }

                    syncTimerFormState();
                    deps.refreshUI();
                })();
            },
            { signal }
        );
    }

    const timerDescriptionInput = document.getElementById('timer-description');
    if (timerDescriptionInput instanceof HTMLInputElement) {
        timerDescriptionInput.addEventListener(
            'focusout',
            (event) => {
                suppressTimerFieldPersistence =
                    !!getRunningActivity() &&
                    event.relatedTarget === document.getElementById('start-timer-btn');
            },
            { signal }
        );
        timerDescriptionInput.addEventListener(
            'change',
            () => {
                if (shouldSuppressTimerFieldPersistence()) {
                    return;
                }
                const previousValue = getRunningActivity()?.description || '';
                void queueTimerMutation(() =>
                    updateRunningActivity({ description: timerDescriptionInput.value }).then(
                        (result) => {
                            if (result?.success && result.runningActivity) {
                                timerDescriptionInput.value =
                                    result.runningActivity.description || '';
                                return;
                            }

                            timerDescriptionInput.value = previousValue;
                            showAlert(result?.reason || 'Could not update timer.', 'sky');
                        }
                    )
                );
            },
            { signal }
        );
    }

    const timerCategorySelect = document.getElementById('timer-category');
    if (timerCategorySelect instanceof HTMLSelectElement) {
        timerCategorySelect.addEventListener(
            'focusout',
            (event) => {
                suppressTimerFieldPersistence =
                    !!getRunningActivity() &&
                    event.relatedTarget === document.getElementById('start-timer-btn');
            },
            { signal }
        );
        timerCategorySelect.addEventListener(
            'change',
            () => {
                if (shouldSuppressTimerFieldPersistence()) {
                    return;
                }
                const previousValue = getRunningActivity()?.category || '';
                void queueTimerMutation(() =>
                    updateRunningActivity({ category: timerCategorySelect.value || null }).then(
                        (result) => {
                            if (result?.success && result.runningActivity) {
                                timerCategorySelect.value = result.runningActivity.category || '';
                                return;
                            }

                            timerCategorySelect.value = previousValue;
                            showAlert(result?.reason || 'Could not update timer.', 'sky');
                        }
                    )
                );
            },
            { signal }
        );
    }

    const timerStartTimeInput = document.getElementById('timer-start-time');
    if (timerStartTimeInput instanceof HTMLInputElement) {
        timerStartTimeInput.addEventListener(
            'focusout',
            (event) => {
                suppressTimerFieldPersistence =
                    !!getRunningActivity() &&
                    event.relatedTarget === document.getElementById('start-timer-btn');
            },
            { signal }
        );
        timerStartTimeInput.addEventListener(
            'change',
            () => {
                if (shouldSuppressTimerFieldPersistence()) {
                    return;
                }
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

                void queueTimerMutation(() =>
                    updateRunningActivity({ startDateTime: nextStartDate.toISOString() }).then(
                        (result) => {
                            if (result?.success && result.runningActivity) {
                                showTimerDisplay(result.runningActivity);
                                return;
                            }

                            timerStartTimeInput.value = previousValue;
                            showAlert(result?.reason || 'Could not update timer.', 'sky');
                        }
                    )
                );
            },
            { signal }
        );
    }
}

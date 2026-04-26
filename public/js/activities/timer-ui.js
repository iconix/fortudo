import { showAlert } from '../modal-manager.js';
import { logger } from '../utils.js';
import { getRunningActivity, updateRunningActivity } from './manager.js';
import { handleStartTimer, handleStopTimer } from './handlers.js';

const timerUiState = {
    tickTimeoutId: null,
    abortController: null,
    sessionId: 0,
    serverClockOffsetMs: null,
    serverDateHeader: null,
    serverRoundTripMs: null,
    pendingMutation: null,
    suppressFieldPersistence: false,
    refreshActivitySummary: null,
    lastSummaryElapsedMinutes: null,
    nextActivityDraft: {
        description: '',
        category: ''
    }
};

function shouldSuppressTimerFieldPersistence() {
    const startTimerButton = document.getElementById('start-timer-btn');
    return (
        timerUiState.suppressFieldPersistence ||
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

function setStartTimerButtonLabel() {
    const startTimerButton = document.getElementById('start-timer-btn');
    if (!startTimerButton) {
        return;
    }

    startTimerButton.innerHTML = '<i class="fa-solid fa-play mr-2"></i>Start Timer';
}

function refreshActivitySummary() {
    if (typeof timerUiState.refreshActivitySummary === 'function') {
        timerUiState.refreshActivitySummary();
    }
}

function getEffectiveNowMs() {
    return Date.now() + (timerUiState.serverClockOffsetMs ?? 0);
}

function stopElapsedCounter() {
    if (timerUiState.tickTimeoutId) {
        clearTimeout(timerUiState.tickTimeoutId);
        timerUiState.tickTimeoutId = null;
    }
    timerUiState.lastSummaryElapsedMinutes = null;
}

function queueTimerMutation(mutation) {
    const operation = timerUiState.pendingMutation
        ? timerUiState.pendingMutation.catch(() => {}).then(() => mutation())
        : Promise.resolve(mutation());
    const trackedOperation = operation.catch(() => {});
    timerUiState.pendingMutation = trackedOperation;
    trackedOperation.finally(() => {
        if (timerUiState.pendingMutation === trackedOperation) {
            timerUiState.pendingMutation = null;
        }
    });
    return operation;
}

async function waitForPendingTimerMutation() {
    if (!timerUiState.pendingMutation) {
        return;
    }

    await timerUiState.pendingMutation;
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

function getTimerDebugSnapshot() {
    const runningActivity = getRunningActivity();
    const elapsedElement = document.getElementById('timer-elapsed');
    const timerDisplay = document.getElementById('timer-display');
    const now = new Date();
    const startMs = runningActivity?.startDateTime
        ? new Date(runningActivity.startDateTime).getTime()
        : null;
    const elapsedMs =
        runningActivity && typeof startMs === 'number' && !Number.isNaN(startMs)
            ? Math.max(0, now.getTime() - startMs)
            : null;

    return {
        deviceNowIso: now.toISOString(),
        timezoneOffsetMinutes: now.getTimezoneOffset(),
        runningActivity,
        elapsedMs,
        displayedElapsed: elapsedElement?.textContent || null,
        isTimerVisible:
            !!timerDisplay && !timerDisplay.classList.contains('hidden') && runningActivity !== null
    };
}

async function getTimerDebugSnapshotWithServerEstimate() {
    const snapshot = getTimerDebugSnapshot();
    const correctedElapsedMs =
        typeof snapshot.elapsedMs === 'number'
            ? Math.max(0, snapshot.elapsedMs + (timerUiState.serverClockOffsetMs ?? 0))
            : null;

    return {
        ...snapshot,
        serverDateHeader: timerUiState.serverDateHeader,
        serverRoundTripMs: timerUiState.serverRoundTripMs,
        estimatedServerOffsetMs: timerUiState.serverClockOffsetMs,
        correctedElapsedMs,
        correctedDisplayedElapsed:
            typeof correctedElapsedMs === 'number' ? formatElapsed(correctedElapsedMs) : null
    };
}

async function measureServerClockOffset() {
    if (typeof fetch !== 'function') {
        return {
            serverDateHeader: null,
            serverRoundTripMs: null,
            estimatedServerOffsetMs: null
        };
    }

    const requestStartedAtMs = Date.now();
    const response = await fetch(window.location.href, {
        method: 'HEAD',
        cache: 'no-store',
        signal: timerUiState.abortController?.signal
    });
    const requestCompletedAtMs = Date.now();
    const serverDateHeader = response?.headers?.get('Date') || null;
    const serverDateMs = serverDateHeader ? new Date(serverDateHeader).getTime() : null;

    if (typeof serverDateMs !== 'number' || Number.isNaN(serverDateMs)) {
        return {
            serverDateHeader,
            serverRoundTripMs: requestCompletedAtMs - requestStartedAtMs,
            estimatedServerOffsetMs: null
        };
    }

    const localMidpointMs = requestStartedAtMs + (requestCompletedAtMs - requestStartedAtMs) / 2;

    return {
        serverDateHeader,
        serverRoundTripMs: requestCompletedAtMs - requestStartedAtMs,
        estimatedServerOffsetMs: serverDateMs - localMidpointMs
    };
}

async function refreshServerClockOffset(sessionId) {
    const previousOffsetMs = timerUiState.serverClockOffsetMs;
    let nextOffsetMs = null;
    let estimate = {
        serverDateHeader: null,
        serverRoundTripMs: null,
        estimatedServerOffsetMs: null
    };

    try {
        estimate = await measureServerClockOffset();
        nextOffsetMs =
            typeof estimate.estimatedServerOffsetMs === 'number' &&
            !Number.isNaN(estimate.estimatedServerOffsetMs)
                ? estimate.estimatedServerOffsetMs
                : null;
    } catch (error) {
        if (error?.name === 'AbortError') {
            return;
        }
    }

    if (timerUiState.sessionId !== sessionId || timerUiState.abortController?.signal?.aborted) {
        return;
    }

    timerUiState.serverClockOffsetMs = nextOffsetMs;
    timerUiState.serverDateHeader = estimate.serverDateHeader;
    timerUiState.serverRoundTripMs = estimate.serverRoundTripMs;

    if (previousOffsetMs === nextOffsetMs) {
        return;
    }

    const runningActivity = getRunningActivity();
    const timerDisplay = document.getElementById('timer-display');
    const isTimerVisible =
        runningActivity &&
        timerDisplay instanceof HTMLElement &&
        !timerDisplay.classList.contains('hidden');

    if (!isTimerVisible) {
        return;
    }

    startElapsedCounter(runningActivity.startDateTime);
    refreshActivitySummary();
}

function registerTimerDebugHelper() {
    window.dumpTimerDebug = async () => {
        const snapshot = await getTimerDebugSnapshotWithServerEstimate();
        logger.info('timer-debug:snapshot', snapshot);
        return snapshot;
    };
}

function unregisterTimerDebugHelper() {
    delete window.dumpTimerDebug;
}

function startElapsedCounter(startDateTime) {
    stopElapsedCounter();

    const startMs = new Date(startDateTime).getTime();
    const elapsedElement = document.getElementById('timer-elapsed');
    if (!elapsedElement || Number.isNaN(startMs)) {
        return;
    }

    const updateElapsed = () => {
        const elapsedMs = getEffectiveNowMs() - startMs;
        elapsedElement.textContent = formatElapsed(elapsedMs);

        const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));
        if (timerUiState.lastSummaryElapsedMinutes === null) {
            timerUiState.lastSummaryElapsedMinutes = elapsedMinutes;
            return;
        }

        if (
            elapsedMinutes !== timerUiState.lastSummaryElapsedMinutes &&
            typeof timerUiState.refreshActivitySummary === 'function'
        ) {
            timerUiState.lastSummaryElapsedMinutes = elapsedMinutes;
            refreshActivitySummary();
            return;
        }

        timerUiState.lastSummaryElapsedMinutes = elapsedMinutes;
    };

    const scheduleNextUpdate = () => {
        const elapsedMs = Math.max(0, getEffectiveNowMs() - startMs);
        const nextDelay = Math.max(1, 1000 - (elapsedMs % 1000));
        timerUiState.tickTimeoutId = setTimeout(() => {
            updateElapsed();
            scheduleNextUpdate();
        }, nextDelay);
    };

    updateElapsed();
    scheduleNextUpdate();
}

function syncNextCategoryOptions() {
    const nextCategorySelect = document.getElementById('next-activity-category');
    if (!(nextCategorySelect instanceof HTMLSelectElement)) {
        return;
    }

    const mainCategorySelect = document.querySelector('#task-form select[name="category"]');
    if (mainCategorySelect instanceof HTMLSelectElement) {
        nextCategorySelect.innerHTML = mainCategorySelect.innerHTML;
    }

    nextCategorySelect.value = timerUiState.nextActivityDraft.category || '';
}

function syncNextActivityDraftFields() {
    const nextDescriptionInput = document.getElementById('next-activity-description');
    if (nextDescriptionInput instanceof HTMLInputElement) {
        nextDescriptionInput.value = timerUiState.nextActivityDraft.description;
    }

    syncNextCategoryOptions();
}

function clearNextActivityDraft() {
    timerUiState.nextActivityDraft = {
        description: '',
        category: ''
    };
    syncNextActivityDraftFields();
}

export function showTimerDisplay(runningActivity) {
    const formFields = document.getElementById('task-form-fields');
    const timerDisplay = document.getElementById('timer-display');
    if (!formFields || !timerDisplay || !runningActivity) {
        return;
    }

    formFields.classList.add('hidden');
    timerDisplay.classList.remove('hidden');
    moveStartTimerButton('next-activity-action-group');
    setStartTimerButtonLabel();

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

    syncNextActivityDraftFields();
    startElapsedCounter(runningActivity.startDateTime);
}

export function hideTimerDisplay() {
    const formFields = document.getElementById('task-form-fields');
    const timerDisplay = document.getElementById('timer-display');

    stopElapsedCounter();
    moveStartTimerButton('activity-action-group');
    setStartTimerButtonLabel();
    if (!getRunningActivity()) {
        clearNextActivityDraft();
    }

    if (timerDisplay) {
        timerDisplay.classList.add('hidden');
    }
    if (formFields) {
        formFields.classList.remove('hidden');
    }
}

export function disposeTimerUI() {
    unregisterTimerDebugHelper();
    timerUiState.sessionId += 1;
    if (timerUiState.abortController) {
        timerUiState.abortController.abort();
        timerUiState.abortController = null;
    }

    stopElapsedCounter();
    timerUiState.serverClockOffsetMs = null;
    timerUiState.serverDateHeader = null;
    timerUiState.serverRoundTripMs = null;
    timerUiState.pendingMutation = null;
    timerUiState.suppressFieldPersistence = false;
    timerUiState.refreshActivitySummary = null;
    timerUiState.nextActivityDraft = {
        description: '',
        category: ''
    };
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
    registerTimerDebugHelper();
    timerUiState.sessionId += 1;
    timerUiState.abortController = new AbortController();
    const { signal } = timerUiState.abortController;
    timerUiState.refreshActivitySummary =
        typeof deps.refreshActivitySummary === 'function' ? deps.refreshActivitySummary : null;
    void refreshServerClockOffset(timerUiState.sessionId);

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
                timerUiState.suppressFieldPersistence = !!getRunningActivity();
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

                        const activeDescriptionInput = runningActivity
                            ? document.getElementById('next-activity-description')
                            : formDescriptionInput;
                        const activeCategorySelect = runningActivity
                            ? document.getElementById('next-activity-category')
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
                                runningActivity
                                    ? 'Please enter a description before starting the next timer.'
                                    : 'Please enter a description before starting the timer.',
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
                        clearNextActivityDraft();
                        syncTimerFormState();
                        deps.refreshUI();
                    } finally {
                        timerUiState.suppressFieldPersistence = false;
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

    const nextDescriptionInput = document.getElementById('next-activity-description');
    if (nextDescriptionInput instanceof HTMLInputElement) {
        nextDescriptionInput.addEventListener(
            'input',
            () => {
                timerUiState.nextActivityDraft.description = nextDescriptionInput.value;
            },
            { signal }
        );
    }

    const nextCategorySelect = document.getElementById('next-activity-category');
    if (nextCategorySelect instanceof HTMLSelectElement) {
        nextCategorySelect.addEventListener(
            'change',
            () => {
                timerUiState.nextActivityDraft.category = nextCategorySelect.value || '';
            },
            { signal }
        );
    }

    const timerDescriptionInput = document.getElementById('timer-description');
    if (timerDescriptionInput instanceof HTMLInputElement) {
        timerDescriptionInput.addEventListener(
            'focusout',
            (event) => {
                timerUiState.suppressFieldPersistence =
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
                                refreshActivitySummary();
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
                timerUiState.suppressFieldPersistence =
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
                                refreshActivitySummary();
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
                timerUiState.suppressFieldPersistence =
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
                                refreshActivitySummary();
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

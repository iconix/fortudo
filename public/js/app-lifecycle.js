import { extractDateFromDateTime } from './utils.js';

export function createRoomSessionLifecycle({
    loadAppState,
    refreshUI,
    getActivitiesEnabled,
    syncRestoredRunningTimer,
    syncRunningTimerDisplay,
    getTaskState,
    refreshActiveTaskColor,
    refreshCurrentGapHighlight,
    refreshStartTimeField,
    getRunningActivity,
    stopTimerAt,
    deleteCompletedUnscheduledTasks,
    rolloverPriorDayScheduledTasks,
    showToast,
    onSyncStatusChange,
    updateSyncStatusUI,
    triggerSync,
    logger
}) {
    let refreshFromStoragePromise = null;
    let unsubscribeSyncStatus = null;
    let activeTaskColorInterval = null;
    let midnightTimerStopInFlight = false;
    let lastObservedDate = extractDateFromDateTime(new Date());
    let shouldRestoreRunningTimerAfterInitialSync = true;

    function getNextLocalMidnight(dateTime) {
        const boundary = new Date(dateTime);
        if (Number.isNaN(boundary.getTime())) {
            return null;
        }

        boundary.setHours(24, 0, 0, 0);
        return boundary;
    }

    function getStaleRunningTimerBoundary(now = new Date()) {
        const runningActivity = getRunningActivity();
        if (!getActivitiesEnabled() || !runningActivity?.startDateTime) {
            return null;
        }

        const startDate = extractDateFromDateTime(new Date(runningActivity.startDateTime));
        const currentDate = extractDateFromDateTime(now);

        if (startDate === currentDate) {
            return null;
        }

        return getNextLocalMidnight(runningActivity.startDateTime);
    }

    async function stopStaleRunningTimerIfNeeded(now = new Date()) {
        if (midnightTimerStopInFlight) {
            return null;
        }

        const staleTimerBoundary = getStaleRunningTimerBoundary(now);
        if (!staleTimerBoundary) {
            return null;
        }

        midnightTimerStopInFlight = true;

        try {
            const result = await stopTimerAt(staleTimerBoundary.toISOString());
            if (!result?.success) {
                logger.error('Failed to stop stale running timer at midnight:', result?.reason);
            }
            return result;
        } catch (error) {
            logger.error('Failed to stop stale running timer at midnight:', error);
            return null;
        } finally {
            midnightTimerStopInFlight = false;
        }
    }

    async function refreshFromStorage({ restoreRunningTimer = false } = {}) {
        if (refreshFromStoragePromise) {
            return refreshFromStoragePromise;
        }

        refreshFromStoragePromise = (async () => {
            await loadAppState();
            await stopStaleRunningTimerIfNeeded();
            refreshUI();
            if (restoreRunningTimer) {
                syncRestoredRunningTimer(getActivitiesEnabled());
            } else if (typeof syncRunningTimerDisplay === 'function') {
                syncRunningTimerDisplay(getActivitiesEnabled());
            }
            refreshActiveTaskColor(getTaskState());
            refreshCurrentGapHighlight();
        })();

        try {
            await refreshFromStoragePromise;
        } finally {
            refreshFromStoragePromise = null;
        }
    }

    function refreshFromExternalChange() {
        refreshFromStorage().catch((err) => {
            logger.error('Failed to refresh tasks after external change:', err);
        });
    }

    function syncOnFocus() {
        triggerSync({ respectCooldown: true }).catch((err) => {
            logger.error('Failed to sync tasks after window focus:', err);
        });
    }

    function handleOnline() {
        triggerSync({ respectCooldown: false, retryAfterInFlightFailure: true }).catch((err) => {
            logger.error('Failed to sync tasks after reconnect:', err);
        });
    }

    function runDayRollover(now) {
        const cleanupResult = deleteCompletedUnscheduledTasks?.();
        const rolloverResult = rolloverPriorDayScheduledTasks?.(now);
        const deletedTasksCount = cleanupResult?.tasksDeleted || 0;
        const movedTasksCount = rolloverResult?.tasksMoved || 0;

        if (movedTasksCount > 0 && rolloverResult?.message) {
            showToast?.(rolloverResult.message, { theme: 'teal' });
        }

        if (deletedTasksCount > 0 || movedTasksCount > 0) {
            refreshFromStorage().catch((err) => {
                logger.error('Failed to refresh tasks after midnight task rollover:', err);
            });
        }
    }

    function startClockTickLoop() {
        activeTaskColorInterval = setInterval(() => {
            const now = new Date();
            const currentDate = extractDateFromDateTime(now);

            if (currentDate !== lastObservedDate) {
                lastObservedDate = currentDate;
                runDayRollover(now);

                if (getActivitiesEnabled() && getRunningActivity() && !midnightTimerStopInFlight) {
                    midnightTimerStopInFlight = true;
                    const midnightBoundary = new Date(now);
                    midnightBoundary.setHours(0, 0, 0, 0);

                    stopTimerAt(midnightBoundary.toISOString())
                        .then((result) => {
                            if (result?.success) {
                                refreshFromStorage().catch((err) => {
                                    logger.error(
                                        'Failed to refresh tasks after midnight timer stop:',
                                        err
                                    );
                                });
                            }
                        })
                        .catch((error) => {
                            logger.error('Failed to stop running timer at midnight:', error);
                        })
                        .finally(() => {
                            midnightTimerStopInFlight = false;
                        });
                }
            }

            refreshActiveTaskColor(getTaskState(), now);
            refreshCurrentGapHighlight(now);
            refreshStartTimeField();
        }, 1000);
    }

    function start({ signal }) {
        unsubscribeSyncStatus = onSyncStatusChange((status) => {
            updateSyncStatusUI(status);
            if (status === 'synced') {
                const restoreRunningTimer = shouldRestoreRunningTimerAfterInitialSync;
                shouldRestoreRunningTimerAfterInitialSync = false;
                refreshFromStorage({ restoreRunningTimer }).catch((err) => {
                    logger.error('Failed to refresh tasks after sync:', err);
                });
            }
        });

        document.addEventListener(
            'visibilitychange',
            () => {
                if (!document.hidden) {
                    refreshFromExternalChange();
                }
            },
            { signal }
        );

        window.addEventListener('focus', syncOnFocus, { signal });
        window.addEventListener('online', handleOnline, { signal });
        startClockTickLoop();
        window.addEventListener(
            'beforeunload',
            () => {
                if (activeTaskColorInterval) {
                    clearInterval(activeTaskColorInterval);
                }
            },
            { signal }
        );
    }

    function stop() {
        if (unsubscribeSyncStatus) {
            unsubscribeSyncStatus();
            unsubscribeSyncStatus = null;
        }
        if (activeTaskColorInterval) {
            clearInterval(activeTaskColorInterval);
            activeTaskColorInterval = null;
        }
    }

    return {
        refreshFromStorage,
        stopStaleRunningTimerIfNeeded,
        start,
        stop
    };
}

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
    isPersistenceAllowed,
    isStoragePreparationPending,
    stopTimerAt,
    deleteCompletedUnscheduledTasks,
    rolloverPriorDayScheduledTasks,
    showToast,
    onSyncStatusChange,
    onSyncDataChange,
    getSyncStatus,
    onRecoveryRequired,
    onUpdateRequired,
    updateSyncStatusUI,
    triggerSync,
    logger
}) {
    let refreshFromStoragePromise = null;
    let restoreRunningTimerRequested = false;
    let storageRefreshRequested = false;
    let writableRefreshRequested = false;
    let preparationWriteRequested = false;
    let activeWritableRefresh = false;
    let activePreparationWrite = false;
    let unsubscribeSyncStatus = null;
    let unsubscribeSyncDataChange = null;
    let activeTaskColorInterval = null;
    let midnightTimerStopInFlight = false;
    let pendingDayRolloverAt = null;
    let lastObservedDate = extractDateFromDateTime(new Date());
    let shouldRestoreRunningTimerAfterInitialSync = true;

    function canPersistLifecycleMutations() {
        return isPersistenceAllowed?.() !== false && isStoragePreparationPending?.() !== true;
    }

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
        if (midnightTimerStopInFlight || !canPersistLifecycleMutations()) {
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

    async function refreshFromStorage({
        restoreRunningTimer = false,
        readOnly = false,
        allowDuringPreparation = false,
        requireFreshRead = false
    } = {}) {
        if (restoreRunningTimer) {
            restoreRunningTimerRequested = true;
        }
        if (refreshFromStoragePromise) {
            const needsStrongerRefresh =
                requireFreshRead ||
                (!readOnly && !activeWritableRefresh && !writableRefreshRequested) ||
                (allowDuringPreparation && !activePreparationWrite && !preparationWriteRequested);
            if (needsStrongerRefresh) {
                storageRefreshRequested = true;
                writableRefreshRequested ||= !readOnly;
                preparationWriteRequested ||= allowDuringPreparation;
            }
            return refreshFromStoragePromise;
        }

        storageRefreshRequested = true;
        writableRefreshRequested ||= !readOnly;
        preparationWriteRequested ||= allowDuringPreparation;

        refreshFromStoragePromise = (async () => {
            while (storageRefreshRequested) {
                storageRefreshRequested = false;
                const runWritableRefresh = writableRefreshRequested;
                const runPreparationWrite = preparationWriteRequested;
                writableRefreshRequested = false;
                preparationWriteRequested = false;
                activeWritableRefresh = runWritableRefresh;
                activePreparationWrite = runPreparationWrite;

                await loadAppState({
                    readOnly: !runWritableRefresh,
                    allowDuringPreparation: runPreparationWrite
                });
                await stopStaleRunningTimerIfNeeded();
                refreshUI();
                if (restoreRunningTimerRequested && !storageRefreshRequested) {
                    restoreRunningTimerRequested = false;
                    syncRestoredRunningTimer(getActivitiesEnabled());
                } else if (
                    !restoreRunningTimerRequested &&
                    typeof syncRunningTimerDisplay === 'function'
                ) {
                    syncRunningTimerDisplay(getActivitiesEnabled());
                }
                refreshActiveTaskColor(getTaskState());
                refreshCurrentGapHighlight();
            }
            activeWritableRefresh = false;
            activePreparationWrite = false;
        })();

        try {
            await refreshFromStoragePromise;
        } finally {
            refreshFromStoragePromise = null;
            activeWritableRefresh = false;
            activePreparationWrite = false;
        }
    }

    function refreshFromExternalChange() {
        refreshFromStorage({
            readOnly: isStoragePreparationPending?.() === true,
            requireFreshRead: true
        }).catch((err) => {
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

    async function runDayRollover(now) {
        if (!canPersistLifecycleMutations()) {
            return;
        }
        const cleanupResult = await deleteCompletedUnscheduledTasks?.();
        if (cleanupResult?.persistenceFailed) {
            showToast?.(cleanupResult.reason, { theme: 'rose' });
            await refreshFromStorage();
            return;
        }

        const rolloverResult = await rolloverPriorDayScheduledTasks?.(now);
        if (rolloverResult?.persistenceFailed) {
            showToast?.(rolloverResult.reason, { theme: 'rose' });
            await refreshFromStorage();
            return;
        }

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
                pendingDayRolloverAt = now;
            }

            if (pendingDayRolloverAt && canPersistLifecycleMutations()) {
                const rolloverAt = pendingDayRolloverAt;
                pendingDayRolloverAt = null;
                runDayRollover(rolloverAt).catch((error) => {
                    logger.error('Failed to persist midnight task rollover:', error);
                    refreshFromStorage().catch((refreshError) => {
                        logger.error(
                            'Failed to recover after midnight task rollover:',
                            refreshError
                        );
                    });
                });

                if (getActivitiesEnabled() && getRunningActivity() && !midnightTimerStopInFlight) {
                    midnightTimerStopInFlight = true;
                    const midnightBoundary = new Date(rolloverAt);
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
        const handleSyncStatus = (status) => {
            updateSyncStatusUI(status);
            if (status === 'recovery-required') {
                onRecoveryRequired?.();
            }
            if (status === 'update-required' || status === 'update-required-available') {
                onUpdateRequired?.();
            }
            if (status === 'synced' && shouldRestoreRunningTimerAfterInitialSync) {
                refreshFromStorage({
                    restoreRunningTimer: true,
                    readOnly: isStoragePreparationPending?.() === true,
                    requireFreshRead: true
                })
                    .then(() => {
                        shouldRestoreRunningTimerAfterInitialSync = false;
                    })
                    .catch((err) => {
                        logger.error('Failed to refresh tasks after sync:', err);
                    });
            }
        };
        unsubscribeSyncStatus = onSyncStatusChange(handleSyncStatus);
        if (typeof getSyncStatus === 'function') {
            handleSyncStatus(getSyncStatus());
        }
        unsubscribeSyncDataChange = onSyncDataChange?.(refreshFromExternalChange) || null;

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

    async function stop() {
        if (unsubscribeSyncStatus) {
            unsubscribeSyncStatus();
            unsubscribeSyncStatus = null;
        }
        if (unsubscribeSyncDataChange) {
            unsubscribeSyncDataChange();
            unsubscribeSyncDataChange = null;
        }
        if (activeTaskColorInterval) {
            clearInterval(activeTaskColorInterval);
            activeTaskColorInterval = null;
        }
        if (refreshFromStoragePromise) {
            try {
                await refreshFromStoragePromise;
            } catch (error) {
                logger.error('Failed to drain storage refresh during room shutdown:', error);
            }
        }
    }

    return {
        refreshFromStorage,
        stopStaleRunningTimerIfNeeded,
        start,
        stop
    };
}

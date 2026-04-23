import { extractDateFromDateTime } from './utils.js';

export function createRoomSessionLifecycle({
    loadAppState,
    refreshUI,
    getActivitiesEnabled,
    syncRestoredRunningTimer,
    getTaskState,
    refreshActiveTaskColor,
    refreshCurrentGapHighlight,
    refreshStartTimeField,
    getRunningActivity,
    stopTimerAt,
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

    async function refreshFromStorage() {
        if (refreshFromStoragePromise) {
            return refreshFromStoragePromise;
        }

        refreshFromStoragePromise = (async () => {
            await loadAppState();
            refreshUI();
            syncRestoredRunningTimer(getActivitiesEnabled());
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

    function startClockTickLoop() {
        activeTaskColorInterval = setInterval(() => {
            const now = new Date();
            const currentDate = extractDateFromDateTime(now);

            if (currentDate !== lastObservedDate) {
                lastObservedDate = currentDate;

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
                refreshFromStorage().catch((err) => {
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
        start,
        stop
    };
}

import { renderUnscheduledTasks } from './unscheduled-renderer.js';
import { createUnscheduledListDrag } from './unscheduled-list-drag.js';

const MODE_KEY = 'fortudo-unscheduled-sort-mode';
const VALID_MODES = new Set(['priority', 'manual']);
const RESTORED_ORDER_MESSAGE = 'Order could not be saved. Your previous order was restored.';
const RELOADED_ORDER_MESSAGE = 'Order could not be saved. Fortudo reloaded the stored order.';
const RECOVERY_FAILED_MESSAGE =
    'Order could not be recovered from storage. Reload Fortudo before making more changes.';

let state = null;

function readMode(storage) {
    try {
        const savedMode = storage.getItem(MODE_KEY);
        return VALID_MODES.has(savedMode) ? savedMode : 'priority';
    } catch {
        return 'priority';
    }
}

function writeMode(storage, mode) {
    try {
        storage.setItem(MODE_KEY, mode);
    } catch {
        // The in-memory selection still applies for this page session.
    }
}

function getDefaultStorage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function taskIdFrom(target) {
    return target.closest('[data-task-id]')?.dataset.taskId || null;
}

function menuTriggers(menu) {
    const card = menu.closest('[data-task-id]');
    return [
        card?.querySelector('.unscheduled-drag-handle'),
        menu.parentElement?.querySelector('.btn-unscheduled-task-actions-menu')
    ].filter(Boolean);
}

function defaultMenuOpener(menu) {
    return menu.parentElement?.querySelector('.btn-unscheduled-task-actions-menu') || null;
}

function setMenuState(menu, isOpen, opener = null) {
    const activeOpener = isOpen
        ? opener || state?.menuOpeners.get(menu) || defaultMenuOpener(menu)
        : state?.menuOpeners.get(menu) || defaultMenuOpener(menu);
    menu.hidden = !isOpen;
    menu.classList.add('action-menu-content');
    menu.classList.toggle('action-menu-content--open', isOpen);
    menu.classList.toggle('action-menu-content--closed', !isOpen);
    menu.parentElement?.classList.toggle('z-50', isOpen);
    menu.closest('[data-task-id]')?.classList.toggle('z-40', isOpen);
    menuTriggers(menu).forEach((trigger) => {
        trigger.setAttribute('aria-expanded', String(isOpen && trigger === activeOpener));
    });
    if (isOpen && activeOpener) state?.menuOpeners.set(menu, activeOpener);
    else state?.menuOpeners.delete(menu);
}

function closeMenus({ except = null, restoreFocus = false } = {}) {
    if (!state) return;

    let focusTarget = null;
    state.root.querySelectorAll('.unscheduled-task-actions-menu').forEach((menu) => {
        if (menu === except || menu.hidden) return;
        focusTarget ||= state.menuOpeners.get(menu) || defaultMenuOpener(menu);
        setMenuState(menu, false);
    });
    if (restoreFocus) focusTarget?.focus();
}

function toggleMenu(trigger) {
    const menu = trigger.parentElement?.querySelector('.unscheduled-task-actions-menu');
    if (!menu) return;

    const shouldOpen = menu.hidden;
    closeMenus({ except: shouldOpen ? menu : null });
    setMenuState(menu, shouldOpen, shouldOpen ? trigger : null);
}

function handleModeSelection(modeButton) {
    const mode = modeButton.dataset.unscheduledMode;
    if (!VALID_MODES.has(mode)) return;

    state.mode = mode;
    writeMode(state.storage, mode);
    renderUnscheduledList();
}

function announceStatus(message, mountedState) {
    const status = document.getElementById('unscheduled-order-status');
    if (!status) return;

    const announcementToken = ++mountedState.announcementToken;
    status.textContent = '';
    queueMicrotask(() => {
        if (state !== mountedState || mountedState.announcementToken !== announcementToken) return;
        const currentStatus = document.getElementById('unscheduled-order-status');
        if (currentStatus !== status) return;
        currentStatus.textContent = message;
    });
}

function announceMove(description, operation, mountedState) {
    announceStatus(
        `Moved ${description} to position ${operation.position} of ${operation.total}.`,
        mountedState
    );
}

function findTaskCard(root, taskId) {
    return [...root.querySelectorAll('.task-card')].find((card) => card.dataset.taskId === taskId);
}

function findActiveModeControl(mountedState) {
    return [...mountedState.controls.querySelectorAll('[data-unscheduled-mode]')].find(
        (button) => button.dataset.unscheduledMode === mountedState.mode
    );
}

function focusTaskActionOrMode(taskId, mountedState) {
    const trigger = findTaskCard(mountedState.root, taskId)?.querySelector(
        '.btn-unscheduled-task-actions-menu'
    );
    if (trigger && !trigger.disabled) {
        trigger.focus();
        if (document.activeElement === trigger) return;
    }
    findActiveModeControl(mountedState)?.focus();
}

function focusTaskHandleOrMode(taskId, mountedState) {
    const handle = findTaskCard(mountedState.root, taskId)?.querySelector(
        '.unscheduled-drag-handle'
    );
    if (handle && !handle.disabled) {
        handle.focus();
        if (document.activeElement === handle) return;
    }
    findActiveModeControl(mountedState)?.focus();
}

async function settleMove(operation, mountedState, focusAfterFailure = focusTaskActionOrMode) {
    let result;
    try {
        result = await operation.settled;
    } catch {
        result = { success: false, recoveryFailed: true };
    }

    if (result?.success || state !== mountedState) return;

    renderUnscheduledList();
    const message = result?.recoveryFailed
        ? RECOVERY_FAILED_MESSAGE
        : result?.reloaded
          ? RELOADED_ORDER_MESSAGE
          : RESTORED_ORDER_MESSAGE;
    focusAfterFailure(operation.taskId, mountedState);
    announceStatus(message, mountedState);
    mountedState.showError(message, { theme: 'rose' });
}

function handleMoveButton(moveButton, taskId) {
    const mountedState = state;
    const description = moveButton.closest('.task-card')?.dataset.taskName || 'task';
    const operation = mountedState.moveTask(taskId, {
        kind: moveButton.dataset.moveKind
    });
    if (!operation?.success || !operation.changed) return;

    renderUnscheduledList();
    focusTaskActionOrMode(taskId, mountedState);
    void settleMove(operation, mountedState);
    announceMove(description, operation, mountedState);
}

function handleDragHandle(handle) {
    const card = handle.closest('.task-card');
    const menu = card?.querySelector('.unscheduled-task-actions-menu');
    const firstMove = [...(menu?.querySelectorAll('[data-move-kind]') || [])].find(
        (button) => !button.disabled
    );
    if (!menu || !firstMove) return;

    closeMenus({ except: menu });
    setMenuState(menu, true, handle);
    firstMove.focus();
}

function handleClick(event) {
    if (!state || !(event.target instanceof Element)) return;

    const modeButton = event.target.closest('[data-unscheduled-mode]');
    if (modeButton) {
        handleModeSelection(modeButton);
        return;
    }

    const dragHandle = event.target.closest('.unscheduled-drag-handle');
    if (dragHandle) {
        if (dragHandle.disabled) return;
        event.preventDefault();
        handleDragHandle(dragHandle);
        return;
    }

    const menuTrigger = event.target.closest('.btn-unscheduled-task-actions-menu');
    if (menuTrigger) {
        if (menuTrigger.disabled) return;
        event.preventDefault();
        toggleMenu(menuTrigger);
        return;
    }

    const taskId = taskIdFrom(event.target);
    if (!taskId || event.target.closest('button[disabled]')) return;

    const moveButton = event.target.closest('[data-move-kind]');
    if (moveButton) {
        handleMoveButton(moveButton, taskId);
    } else if (event.target.closest('.btn-schedule-task')) {
        closeMenus();
        state.actions.schedule(taskId);
    } else if (event.target.closest('.btn-start-unscheduled-timer')) {
        closeMenus();
        state.actions.startTimer(taskId);
    } else if (event.target.closest('.btn-edit-unscheduled')) {
        closeMenus();
        state.actions.edit(taskId);
    } else if (event.target.closest('.btn-delete-unscheduled')) {
        closeMenus();
        state.actions.delete(taskId);
    } else if (event.target.closest('.task-checkbox-unscheduled')) {
        state.actions.toggleComplete(taskId);
    } else if (event.target.closest('.btn-save-inline-edit')) {
        state.actions.saveEdit(taskId);
    } else if (event.target.closest('.btn-cancel-inline-edit')) {
        state.actions.cancelEdit(taskId);
    }
}

function handleKeydown(event) {
    if (!state) return;
    if (event.key === 'Escape') {
        closeMenus({ restoreFocus: true });
        return;
    }
    if (
        event.key !== 'Enter' ||
        !(event.target instanceof HTMLInputElement) ||
        !event.target.closest('form')
    ) {
        return;
    }

    const taskId = taskIdFrom(event.target);
    if (!taskId) return;
    event.preventDefault();
    state.actions.saveEdit(taskId);
}

function handleSubmit(event) {
    if (!state || !(event.target instanceof HTMLFormElement)) return;

    const taskId = taskIdFrom(event.target);
    if (!taskId) return;
    event.preventDefault();
    state.actions.saveEdit(taskId);
}

function handleDocumentClick(event) {
    if (!state || event.target?.closest?.('.unscheduled-task-actions, .unscheduled-drag-handle')) {
        return;
    }
    closeMenus();
}

function renderView(view) {
    state.controls.querySelectorAll('[data-unscheduled-mode]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.unscheduledMode === state.mode));
    });
    renderUnscheduledTasks(view.tasks, {
        mode: state.mode,
        movementByTaskId: view.movementByTaskId,
        runningActivity: state.getRunningActivity()
    });
}

/**
 * Mount the global Unscheduled list interaction boundary.
 * @param {Object} options - Sequence, action, activity, feedback, and storage adapters
 * @returns {boolean} Whether the required list roots were mounted
 */
export function mountUnscheduledList({
    readView,
    moveTask,
    actions,
    getRunningActivity = () => null,
    showError = () => {},
    storage
}) {
    destroyUnscheduledList();

    const root = document.getElementById('unscheduled-task-list');
    const controls = document.getElementById('unscheduled-sort-control');
    if (!root || !controls) return false;

    const preferenceStorage = storage === undefined ? getDefaultStorage() : storage;
    const abortController = new window.AbortController();
    state = {
        root,
        controls,
        readView,
        moveTask,
        actions,
        getRunningActivity,
        showError,
        storage: preferenceStorage,
        mode: readMode(preferenceStorage),
        abortController,
        announcementToken: 0,
        menuOpeners: new WeakMap(),
        dragActive: false,
        pendingView: null
    };

    const listenerOptions = { signal: abortController.signal };
    controls.addEventListener('click', handleClick, listenerOptions);
    root.addEventListener('click', handleClick, listenerOptions);
    root.addEventListener('submit', handleSubmit, listenerOptions);
    root.addEventListener('keydown', handleKeydown, listenerOptions);
    document.addEventListener('click', handleDocumentClick, listenerOptions);
    const mountedState = state;
    mountedState.drag = createUnscheduledListDrag({
        root,
        onActiveChange(active) {
            if (state !== mountedState) return;
            mountedState.dragActive = active;
            if (active) {
                closeMenus();
                return;
            }
            if (mountedState.pendingView) {
                const pendingView = mountedState.pendingView;
                mountedState.pendingView = null;
                renderView(pendingView);
            }
        },
        onDrop({ taskId, beforeId }) {
            if (state !== mountedState) return;
            const description = findTaskCard(root, taskId)?.dataset.taskName || 'task';
            const operation = mountedState.moveTask(taskId, {
                kind: 'before',
                taskId: beforeId
            });
            if (!operation?.success || !operation.changed) {
                renderUnscheduledList();
                return;
            }

            renderUnscheduledList();
            focusTaskHandleOrMode(taskId, mountedState);
            void settleMove(operation, mountedState, focusTaskHandleOrMode);
            announceMove(description, operation, mountedState);
        }
    });
    return true;
}

/** Render the current Unscheduled projection when the list is mounted. */
export function renderUnscheduledList() {
    if (!state) return;

    const view = state.readView(state.mode);
    if (state.dragActive) {
        state.pendingView = view;
        const activeTaskId = state.drag?.getActiveTaskId();
        if (activeTaskId && !view.tasks.some((task) => task.id === activeTaskId)) {
            state.drag.cancel();
        }
        return;
    }
    renderView(view);
}

/** Remove all Unscheduled list listeners and transient interaction state. */
export function destroyUnscheduledList() {
    if (!state) return;
    state.pendingView = null;
    state.drag?.destroy();
    state.abortController.abort();
    state = null;
}

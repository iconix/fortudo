import { renderUnscheduledTasks } from './unscheduled-renderer.js';

const MODE_KEY = 'fortudo-unscheduled-sort-mode';
const VALID_MODES = new Set(['priority', 'manual']);

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

function setMenuState(menu, isOpen) {
    menu.hidden = !isOpen;
    menu.classList.add('action-menu-content');
    menu.classList.toggle('action-menu-content--open', isOpen);
    menu.classList.toggle('action-menu-content--closed', !isOpen);
    menu.parentElement?.classList.toggle('z-50', isOpen);
    menu.closest('[data-task-id]')?.classList.toggle('z-40', isOpen);
    menu.parentElement
        ?.querySelector('.btn-unscheduled-task-actions-menu')
        ?.setAttribute('aria-expanded', String(isOpen));
}

function closeMenus({ except = null, restoreFocus = false } = {}) {
    if (!state) return;

    let focusTarget = null;
    state.root.querySelectorAll('.unscheduled-task-actions-menu').forEach((menu) => {
        if (menu === except || menu.hidden) return;
        focusTarget ||= menu.parentElement?.querySelector('.btn-unscheduled-task-actions-menu');
        setMenuState(menu, false);
    });
    if (restoreFocus) focusTarget?.focus();
}

function toggleMenu(trigger) {
    const menu = trigger.parentElement?.querySelector('.unscheduled-task-actions-menu');
    if (!menu) return;

    const shouldOpen = menu.hidden;
    closeMenus({ except: shouldOpen ? menu : null });
    setMenuState(menu, shouldOpen);
}

function handleModeSelection(modeButton) {
    const mode = modeButton.dataset.unscheduledMode;
    if (!VALID_MODES.has(mode)) return;

    state.mode = mode;
    writeMode(state.storage, mode);
    renderUnscheduledList();
}

function handleClick(event) {
    if (!state || !(event.target instanceof Element)) return;

    const modeButton = event.target.closest('[data-unscheduled-mode]');
    if (modeButton) {
        handleModeSelection(modeButton);
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

    if (event.target.closest('.btn-schedule-task')) {
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
    if (!state || event.target?.closest?.('.unscheduled-task-actions')) return;
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
        dragActive: false,
        pendingView: null
    };

    const listenerOptions = { signal: abortController.signal };
    controls.addEventListener('click', handleClick, listenerOptions);
    root.addEventListener('click', handleClick, listenerOptions);
    root.addEventListener('submit', handleSubmit, listenerOptions);
    root.addEventListener('keydown', handleKeydown, listenerOptions);
    document.addEventListener('click', handleDocumentClick, listenerOptions);
    return true;
}

/** Render the current Unscheduled projection when the list is mounted. */
export function renderUnscheduledList() {
    if (!state) return;

    const view = state.readView(state.mode);
    if (state.dragActive) {
        state.pendingView = view;
        return;
    }
    renderView(view);
}

/** Remove all Unscheduled list listeners and transient interaction state. */
export function destroyUnscheduledList() {
    state?.abortController.abort();
    state = null;
}

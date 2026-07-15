const DRAG_THRESHOLD = 4;
const EDGE_THRESHOLD = 32;
const EDGE_SCROLL_AMOUNT = 24;

function closestHandle(target) {
    return target instanceof Element ? target.closest('.unscheduled-drag-handle') : null;
}

function findCard(root, taskId) {
    return [...root.querySelectorAll('.task-card')].find((card) => card.dataset.taskId === taskId);
}

/**
 * Bind private pointer reordering behavior to an Unscheduled list root.
 * @param {Object} options - DOM root and list-owned callbacks
 * @returns {Object} Drag lifecycle controls used only by the list module
 */
export function createUnscheduledListDrag({ root, onActiveChange, onDrop }) {
    let active = null;
    let suppressedTaskId = null;
    let suppressionTimer = null;

    function insertionBeforeId(clientY) {
        const cards = [...root.querySelectorAll('.task-card:not(.unscheduled-task--dragging)')];
        const next = cards.find((card) => {
            const rect = card.getBoundingClientRect();
            return clientY < rect.top + rect.height / 2;
        });
        return next?.dataset.taskId || null;
    }

    function clearClickSuppression() {
        if (suppressionTimer !== null) window.clearTimeout(suppressionTimer);
        suppressionTimer = null;
        suppressedTaskId = null;
    }

    function suppressPostDragClick(taskId) {
        clearClickSuppression();
        suppressedTaskId = taskId;
        suppressionTimer = window.setTimeout(clearClickSuppression, 0);
    }

    function cleanup({ restoreFocus = true } = {}) {
        if (!active) return;

        const interaction = active;
        active = null;
        interaction.card.classList.remove('unscheduled-task--dragging');
        root.querySelector('.unscheduled-drop-marker')?.remove();
        try {
            interaction.handle.releasePointerCapture?.(interaction.pointerId);
        } catch {
            // Capture can already be released by the browser after cancellation.
        }
        onActiveChange(false, interaction.taskId, restoreFocus);
    }

    function startDragging() {
        if (active.dragging) return;
        active.dragging = true;
        active.card.classList.add('unscheduled-task--dragging');
    }

    function renderDropMarker(beforeId) {
        root.querySelector('.unscheduled-drop-marker')?.remove();
        const marker = document.createElement('div');
        marker.className = 'unscheduled-drop-marker';
        marker.setAttribute('aria-hidden', 'true');
        root.insertBefore(marker, beforeId ? findCard(root, beforeId) || null : null);
    }

    function autoScroll(clientY) {
        if (clientY < EDGE_THRESHOLD) {
            window.scrollBy({ top: -EDGE_SCROLL_AMOUNT, behavior: 'auto' });
        } else if (clientY > window.innerHeight - EDGE_THRESHOLD) {
            window.scrollBy({ top: EDGE_SCROLL_AMOUNT, behavior: 'auto' });
        }
    }

    function pointerDown(event) {
        if (active || event.button !== 0 || event.isPrimary === false) return;
        const handle = closestHandle(event.target);
        if (!handle || handle.disabled) return;
        const card = handle.closest('.task-card');
        if (!card) return;

        active = {
            pointerId: event.pointerId,
            handle,
            card,
            taskId: card.dataset.taskId,
            startX: event.clientX,
            startY: event.clientY,
            beforeId: null,
            dragging: false
        };
        handle.setPointerCapture?.(event.pointerId);
        onActiveChange(true);
    }

    function pointerMove(event) {
        if (!active || event.pointerId !== active.pointerId) return;

        const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
        if (!active.dragging && distance < DRAG_THRESHOLD) return;

        event.preventDefault();
        startDragging();
        active.beforeId = insertionBeforeId(event.clientY);
        renderDropMarker(active.beforeId);
        autoScroll(event.clientY);
    }

    function pointerUp(event) {
        if (!active || event.pointerId !== active.pointerId) return;

        const drop = {
            taskId: active.taskId,
            beforeId: active.beforeId,
            dragging: active.dragging
        };
        if (drop.dragging) suppressPostDragClick(drop.taskId);
        cleanup({ restoreFocus: !drop.dragging });
        if (drop.dragging) onDrop({ taskId: drop.taskId, beforeId: drop.beforeId });
    }

    function pointerCancel(event) {
        if (!active || event.pointerId !== active.pointerId) return;
        cleanup();
    }

    function lostPointerCapture(event) {
        if (!active || event.pointerId !== active.pointerId) return;
        cleanup();
    }

    function keydown(event) {
        if (!active || event.key !== 'Escape') return;
        event.preventDefault();
        cleanup();
    }

    function click(event) {
        if (!suppressedTaskId) return;
        const handle = closestHandle(event.target);
        const taskId = handle?.closest('.task-card')?.dataset.taskId;
        if (taskId !== suppressedTaskId) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        clearClickSuppression();
    }

    root.addEventListener('pointerdown', pointerDown);
    root.addEventListener('pointermove', pointerMove);
    root.addEventListener('pointerup', pointerUp);
    root.addEventListener('pointercancel', pointerCancel);
    root.addEventListener('lostpointercapture', lostPointerCapture);
    root.addEventListener('keydown', keydown);
    root.addEventListener('click', click, true);

    return {
        getActiveTaskId() {
            return active?.taskId || null;
        },
        cancel() {
            cleanup();
        },
        destroy() {
            root.removeEventListener('pointerdown', pointerDown);
            root.removeEventListener('pointermove', pointerMove);
            root.removeEventListener('pointerup', pointerUp);
            root.removeEventListener('pointercancel', pointerCancel);
            root.removeEventListener('lostpointercapture', lostPointerCapture);
            root.removeEventListener('keydown', keydown);
            root.removeEventListener('click', click, true);
            clearClickSuppression();
            cleanup({ restoreFocus: false });
        }
    };
}

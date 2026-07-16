const DRAG_THRESHOLD = 4;
const EDGE_THRESHOLD = 32;
const EDGE_SCROLL_AMOUNT = 24;
const NEIGHBOR_MOVE_DURATION = 160;
const NEIGHBOR_MOVE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

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

    function prefersReducedMotion() {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    }

    function captureNeighborPositions() {
        return new Map(
            [...root.querySelectorAll('.task-card:not(.unscheduled-task--dragging)')].map(
                (card) => [card, card.getBoundingClientRect().top]
            )
        );
    }

    function cancelNeighborAnimations(interaction) {
        interaction.neighborAnimations?.forEach((animation) => {
            try {
                animation.cancel();
            } catch {
                // The animation may already have completed or been replaced.
            }
        });
        interaction.neighborAnimations?.clear();
    }

    function animateNeighborMovement(interaction, previousPositions) {
        if (prefersReducedMotion()) return;

        previousPositions.forEach((previousTop, card) => {
            const delta = previousTop - card.getBoundingClientRect().top;
            if (Math.abs(delta) < 0.5 || typeof card.animate !== 'function') return;

            const animation = card.animate(
                [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
                { duration: NEIGHBOR_MOVE_DURATION, easing: NEIGHBOR_MOVE_EASING }
            );
            interaction.neighborAnimations.add(animation);
            if (animation.finished?.then) {
                animation.finished
                    .catch(() => {})
                    .finally(() => interaction.neighborAnimations.delete(animation));
            }
        });
    }

    function placeholderBeforeId(interaction) {
        return interaction.placeholder?.nextElementSibling?.dataset.taskId || null;
    }

    function movePlaceholder(beforeId) {
        if (!active?.placeholder || placeholderBeforeId(active) === beforeId) return;

        cancelNeighborAnimations(active);
        const previousPositions = captureNeighborPositions();
        const target = beforeId ? findCard(root, beforeId) : null;
        root.insertBefore(active.placeholder, target?.parentElement === root ? target : null);
        animateNeighborMovement(active, previousPositions);
    }

    function positionDraggedCard(clientY) {
        if (!active?.dragging) return;
        active.card.style.top = `${clientY - active.pointerOffsetY}px`;
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
        cancelNeighborAnimations(interaction);
        if (interaction.placeholder) {
            const originalNextSibling =
                interaction.originalNextSibling?.parentElement === root
                    ? interaction.originalNextSibling
                    : null;
            root.insertBefore(interaction.card, originalNextSibling);
            interaction.placeholder.remove();
        }
        interaction.card.style.removeProperty('left');
        interaction.card.style.removeProperty('top');
        interaction.card.style.removeProperty('width');
        interaction.card.style.removeProperty('height');
        interaction.card.classList.remove('unscheduled-task--dragging');
        try {
            root.releasePointerCapture?.(interaction.pointerId);
        } catch {
            // Capture can already be released by the browser after cancellation.
        }
        onActiveChange(false, interaction.taskId, restoreFocus);
    }

    function startDragging() {
        if (active.dragging) return;

        const rect = active.card.getBoundingClientRect();
        const placeholder = document.createElement('div');
        placeholder.className = 'unscheduled-drag-placeholder';
        placeholder.style.height = `${rect.height}px`;
        placeholder.style.width = `${rect.width}px`;
        active.originalNextSibling = active.card.nextElementSibling;
        root.insertBefore(placeholder, active.card);
        placeholder.append(active.card);

        active.dragging = true;
        active.placeholder = placeholder;
        active.beforeId = active.originalNextSibling?.dataset.taskId || null;
        active.neighborAnimations = new Set();
        active.card.classList.add('unscheduled-task--dragging');
        active.card.style.left = `${rect.left}px`;
        active.card.style.top = `${rect.top}px`;
        active.card.style.width = `${rect.width}px`;
        active.card.style.height = `${rect.height}px`;
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
            pointerOffsetY: event.clientY - card.getBoundingClientRect().top,
            beforeId: null,
            dragging: false
        };
        root.setPointerCapture?.(event.pointerId);
        onActiveChange(true);
    }

    function pointerMove(event) {
        if (!active || event.pointerId !== active.pointerId) return;

        const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
        if (!active.dragging && distance < DRAG_THRESHOLD) return;

        event.preventDefault();
        startDragging();
        positionDraggedCard(event.clientY);
        const beforeId = insertionBeforeId(event.clientY);
        movePlaceholder(beforeId);
        active.beforeId = beforeId;
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

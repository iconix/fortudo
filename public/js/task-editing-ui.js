/** Keep a room's task draft separate from persisted tasks and explain blocked saves. */
export function initializeTaskEditing({
    roomCode,
    signal,
    readState,
    notify,
    retrySync,
    requestRetry
}) {
    const form = document.getElementById('task-form');
    const key = `fortudo-task-draft:${roomCode}`;
    let draft = null;
    let startTimeTouched = false;
    let lastMessage = null;
    let retryInFlight = false;
    const retryAction = { label: 'Retry check', onClick: requestRetry || retryCheck };
    // The previous room's draft belongs to its own session-storage key.
    form?.reset();
    if (form) {
        delete form.dataset.hasTaskDraft;
        delete form.dataset.hasStartTimeDraft;
    }
    try {
        const saved = JSON.parse(sessionStorage.getItem(key));
        if (Array.isArray(saved)) draft = saved;
    } catch {
        // Drafting still works in memory when session storage is unavailable.
    }

    function rememberDraft(event) {
        if (!form) return;
        if (event?.target?.name === 'start-time') startTimeTouched = true;
        draft = Array.from(form.elements)
            .filter((field) => field.name && field.matches('input, select, textarea'))
            .map((field) => ({
                name: field.name,
                value: field.value,
                checked: field.checked,
                ...(field.name === 'start-time' ? { touched: startTimeTouched } : {}),
                label: field.selectedOptions?.[0]?.textContent
            }));
        form.dataset.hasTaskDraft = 'true';
        const time = draft.find((entry) => entry.name === 'start-time');
        form.dataset.hasStartTimeDraft = String(Boolean(time?.value || time?.touched));
        try {
            sessionStorage.setItem(key, JSON.stringify(draft));
        } catch {
            // Keep the in-memory copy even if the browser refuses storage.
        }
    }

    function clearDraft() {
        draft = null;
        startTimeTouched = false;
        if (form) {
            delete form.dataset.hasTaskDraft;
            delete form.dataset.hasStartTimeDraft;
        }
        try {
            sessionStorage.removeItem(key);
        } catch {
            // Resetting the visible form must not depend on browser storage.
        }
    }

    function restoreDraft() {
        if (!form || !draft) return;
        form.dataset.hasTaskDraft = 'true';
        const time = draft.find((entry) => entry?.name === 'start-time');
        startTimeTouched = time?.touched === true;
        form.dataset.hasStartTimeDraft = String(Boolean(time?.value || startTimeTouched));
        for (const entry of draft) {
            if (!entry || typeof entry.name !== 'string' || typeof entry.value !== 'string')
                continue;
            // An early description draft can precede the first suggested time.
            // Only an explicit clear should restore a blank over that default.
            if (entry.name === 'start-time' && !entry.value && entry.touched !== true) continue;
            for (const field of form.elements) {
                if (field.name !== entry.name) continue;
                if (field.type === 'radio' || field.type === 'checkbox') {
                    if (field.value === entry.value) field.checked = entry.checked === true;
                } else if (field.matches('input, select, textarea')) {
                    if (
                        field instanceof HTMLSelectElement &&
                        !Array.from(field.options).some((option) => option.value === entry.value)
                    ) {
                        // Keep a removed category visible; normal submit validation still applies.
                        field.add(new Option(entry.label || entry.value, entry.value));
                    }
                    field.value = entry.value;
                }
            }
        }
        form.querySelector('input[name="task-type"]:checked')?.dispatchEvent(new Event('change'));
        refresh();
    }

    async function retryCheck() {
        if (retryInFlight || signal.aborted || !retrySync) return;
        retryInFlight = true;
        notify?.('Checking local changes…', {
            theme: 'sky',
            dedupeKey: 'task-edit-readiness',
            duration: 30000
        });
        let failed = false;
        try {
            await retrySync();
        } catch {
            failed = true;
        } finally {
            retryInFlight = false;
        }
        if (signal.aborted) return;
        const state = readState();
        lastMessage = state.message;
        document.querySelector('[data-toast-key="task-edit-readiness"]')?.remove();
        refresh();
        if (failed || state.retryable || state.status === 'offline' || state.status === 'error') {
            const message = failed
                ? 'The check could not finish. Please try again.'
                : state.retryable
                  ? 'The check failed again. Your local changes are still protected. Try again, or reload Fortudo if this continues.'
                  : 'The check could not finish because of a connection problem. Check your connection and try again.';
            notify?.(message, {
                theme: 'rose',
                dedupeKey: 'task-edit-readiness',
                action: retryAction
            });
        } else if (state.allowed) {
            notify?.('Check passed. You can edit tasks again.', {
                theme: 'teal',
                dedupeKey: 'task-edit-readiness'
            });
        } else if (state.label === 'Editing paused') {
            notify?.(state.message, { theme: 'rose', dedupeKey: 'task-edit-readiness' });
        }
        // Update, recovery, and startup failures retain their dedicated actions.
    }

    function refresh() {
        const state = readState();
        const loading = !state.allowed && state.label === 'Loading tasks';
        if (!retryInFlight && lastMessage && lastMessage !== state.message) {
            document.querySelector('[data-toast-key="task-edit-readiness"]')?.remove();
        }
        // Update/recovery/startup failures already have their own actionable messages.
        if (!retryInFlight && state.label === 'Editing paused' && lastMessage !== state.message) {
            notify?.(state.message, {
                theme: 'rose',
                dedupeKey: 'task-edit-readiness',
                ...(state.retryable && retrySync ? { action: retryAction } : {})
            });
        }
        lastMessage = state.message;
        form?.querySelectorAll('button[type="submit"], #start-timer-btn').forEach((button) => {
            button.setAttribute('aria-disabled', String(!state.allowed));
            if (loading) {
                if (button.textContent !== 'Loading…') {
                    button.dataset.editActionHtml = button.innerHTML;
                }
                button.textContent = 'Loading…';
                button.setAttribute('aria-busy', 'true');
            } else if (button.hasAttribute('aria-busy')) {
                button.innerHTML =
                    button.dataset.editActionHtml || button.dataset.defaultButtonHtml || 'Add Task';
                button.removeAttribute('aria-busy');
                delete button.dataset.editActionHtml;
            }
        });
        for (const id of [
            'scheduled-task-list',
            'unscheduled-task-list',
            'clear-schedule-button',
            'clear-options-dropdown-trigger-btn',
            'clear-tasks-dropdown'
        ]) {
            document.getElementById(id)?.toggleAttribute('inert', !state.allowed);
        }
    }

    function guardSave(event) {
        const state = readState();
        if (state.allowed) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        rememberDraft();
        if (state.label === 'Loading tasks') {
            notify?.(state.message, { theme: 'sky', dedupeKey: 'task-edit-readiness' });
        }
        refresh();
    }

    form?.addEventListener(
        'input',
        (event) => {
            rememberDraft(event);
            refresh();
        },
        { signal }
    );
    form?.addEventListener(
        'change',
        (event) => {
            rememberDraft(event);
            refresh();
        },
        { signal }
    );
    form?.addEventListener('reset', clearDraft, { signal });
    form?.addEventListener('submit', guardSave, { capture: true, signal });
    form?.addEventListener(
        'click',
        (event) => {
            if (event.target.closest('#start-timer-btn')) guardSave(event);
        },
        { capture: true, signal }
    );
    restoreDraft();
    refresh();
    return { refresh, restoreDraft, retry: retryCheck };
}

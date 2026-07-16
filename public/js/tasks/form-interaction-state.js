/**
 * Capture the active named form control and its text selection, if any.
 * This state is intentionally DOM-only and must never be persisted with task data.
 * @param {HTMLFormElement} form
 * @returns {{name: string, value: string|null, selectionStart: number|null, selectionEnd: number|null, selectionDirection: string|null}|null}
 */
export function captureFormInteractionState(form) {
    const field = document.activeElement;
    const name = field?.getAttribute?.('name');
    if (!name || !form.contains(field)) return null;

    return {
        name,
        value: 'value' in field ? field.value : null,
        selectionStart: Number.isInteger(field.selectionStart) ? field.selectionStart : null,
        selectionEnd: Number.isInteger(field.selectionEnd) ? field.selectionEnd : null,
        selectionDirection: field.selectionDirection || null
    };
}

/**
 * Restore focus and text selection after a form has been recreated.
 * Matching by name and value handles grouped controls such as radio buttons.
 * @param {HTMLFormElement} form
 * @param {{name: string, value: string|null, selectionStart: number|null, selectionEnd: number|null, selectionDirection: string|null}|null} state
 * @returns {HTMLElement|null}
 */
export function restoreFormInteractionState(form, state) {
    if (!state?.name) return null;

    const field = [...form.querySelectorAll('[name]')].find(
        (candidate) =>
            candidate.getAttribute('name') === state.name &&
            (state.value === null || candidate.value === state.value)
    );
    if (!(field instanceof HTMLElement)) return null;

    field.focus();
    if (
        Number.isInteger(state.selectionStart) &&
        Number.isInteger(state.selectionEnd) &&
        typeof field.setSelectionRange === 'function'
    ) {
        field.setSelectionRange(
            state.selectionStart,
            state.selectionEnd,
            state.selectionDirection || 'none'
        );
    }
    return field;
}

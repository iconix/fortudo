import { showAlert } from './modal-manager.js';
import { resolveCategoryKey } from './taxonomy/taxonomy-selectors.js';

const DEFAULT_CATEGORY_DOT_COLOR = '#64748b';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function renderCategoryOptionsHtml(options, selectedValue = '') {
    return options
        .map((optionData) => {
            const label =
                optionData.indentLevel > 0
                    ? `${'&rsaquo; '.repeat(optionData.indentLevel)}${escapeHtml(optionData.label)}`
                    : escapeHtml(optionData.label);
            const selected = optionData.value === selectedValue ? ' selected' : '';
            return `<option value="${escapeHtml(optionData.value)}"${selected}>${label}</option>`;
        })
        .join('');
}

export function renderCategorySelectRow({
    selectName,
    selectedValue = '',
    options,
    dotClass,
    selectClass,
    rowClass = 'category-select-row flex items-center gap-2',
    dotStyle = ''
}) {
    const styleAttribute = dotStyle ? ` style="${escapeHtml(dotStyle)}"` : '';
    const optionsHtml = renderCategoryOptionsHtml(options, selectedValue);

    return `<div class="${escapeHtml(rowClass)}">
        <span class="${escapeHtml(dotClass)} w-3 h-3 rounded-full shrink-0" aria-hidden="true"${styleAttribute}></span>
        <select name="${escapeHtml(selectName)}" class="${escapeHtml(selectClass)}">
            <option value="">No category</option>
            ${optionsHtml}
        </select>
    </div>`;
}

export function populateCategorySelect(
    selectElement,
    options,
    selectedValue = selectElement.value
) {
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    for (const optionData of options) {
        const option = document.createElement('option');
        option.value = optionData.value;
        const indentPrefix = '\u203A '.repeat(optionData.indentLevel);
        option.textContent = `${indentPrefix}${optionData.label}`;
        selectElement.appendChild(option);
    }

    if (
        selectedValue &&
        Array.from(selectElement.options).some((option) => option.value === selectedValue)
    ) {
        selectElement.value = selectedValue;
    }
}

export function validateCategoryKey(categoryKey, theme) {
    if (!categoryKey) {
        return { valid: true, category: null };
    }

    if (!resolveCategoryKey(categoryKey)) {
        showAlert('Selected category is no longer available.', theme);
        return { valid: false, category: null };
    }

    return { valid: true, category: categoryKey };
}

export function syncCategoryColorDot(selectElement, dotElement) {
    if (!(selectElement instanceof HTMLSelectElement) || !(dotElement instanceof HTMLElement)) {
        return;
    }

    const updateIndicator = () => {
        const resolved = resolveCategoryKey(selectElement.value);
        dotElement.style.backgroundColor = resolved
            ? resolved.record.color
            : DEFAULT_CATEGORY_DOT_COLOR;
    };

    selectElement.addEventListener('change', updateIndicator);
    updateIndicator();
}

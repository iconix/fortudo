/**
 * @jest-environment jsdom
 */

import {
    renderCategoryOptionsHtml,
    renderCategorySelectRow,
    populateCategorySelect,
    validateCategoryKey,
    syncCategoryColorDot
} from '../public/js/category-form-utils.js';
import { showAlert } from '../public/js/modal-manager.js';
import { resolveCategoryKey } from '../public/js/taxonomy/taxonomy-selectors.js';

jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn()
}));

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    resolveCategoryKey: jest.fn()
}));

describe('category form utils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    test('renderCategoryOptionsHtml returns escaped flat options with selected value', () => {
        const html = renderCategoryOptionsHtml(
            [
                { value: 'work', label: 'Work & Admin', indentLevel: 0 },
                { value: 'work/deep', label: '<Deep Work>', indentLevel: 1 }
            ],
            'work/deep'
        );

        expect(html).toContain('<option value="work">Work &amp; Admin</option>');
        expect(html).toContain(
            '<option value="work/deep" selected>&rsaquo; &lt;Deep Work&gt;</option>'
        );
    });

    test('renderCategorySelectRow returns shared dot and select markup', () => {
        const html = renderCategorySelectRow({
            selectName: 'category',
            selectedValue: 'work/deep',
            dotClass: 'activity-edit-category-dot',
            selectClass: 'category-select-class',
            dotStyle: 'background-color: #0ea5e9;',
            options: [
                { value: 'work', label: 'Work', indentLevel: 0 },
                { value: 'work/deep', label: 'Deep Work', indentLevel: 1 }
            ]
        });

        document.body.innerHTML = html;

        const row = document.querySelector('.category-select-row');
        const dot = document.querySelector('.activity-edit-category-dot');
        const select = document.querySelector('select[name="category"]');

        expect(row).not.toBeNull();
        expect(dot.getAttribute('style')).toBe('background-color: #0ea5e9;');
        expect(select.className).toBe('category-select-class');
        expect(select.value).toBe('work/deep');
        expect(select.options[0].value).toBe('');
        expect(select.querySelector('option[value="work/deep"]').textContent).toBe('› Deep Work');
    });

    test('populateCategorySelect preserves the default option and selected value', () => {
        document.body.innerHTML = `
            <select id="category-select">
                <option value="">No category</option>
            </select>
        `;

        const select = document.getElementById('category-select');
        populateCategorySelect(
            select,
            [
                { value: 'work', label: 'Work', indentLevel: 0 },
                { value: 'work/deep', label: 'Deep Work', indentLevel: 1 }
            ],
            'work/deep'
        );

        expect(select.options).toHaveLength(3);
        expect(select.options[0].value).toBe('');
        expect(select.value).toBe('work/deep');
        expect(select.options[2].textContent).toBe('› Deep Work');
    });

    test('validateCategoryKey accepts empty and valid keys', () => {
        resolveCategoryKey.mockImplementation((key) =>
            key === 'work' ? { kind: 'group', record: { key, color: '#2563eb' } } : null
        );

        expect(validateCategoryKey('', 'teal')).toEqual({ valid: true, category: null });
        expect(validateCategoryKey('work', 'teal')).toEqual({
            valid: true,
            category: 'work'
        });
    });

    test('validateCategoryKey rejects stale keys with the provided theme', () => {
        resolveCategoryKey.mockReturnValue(null);

        expect(validateCategoryKey('missing', 'indigo')).toEqual({
            valid: false,
            category: null
        });
        expect(showAlert).toHaveBeenCalledWith(
            'Selected category is no longer available.',
            'indigo'
        );
    });

    test('syncCategoryColorDot initializes and updates a specific dot/select pair', () => {
        document.body.innerHTML = `
            <span id="category-dot"></span>
            <select id="category-select">
                <option value="">No category</option>
                <option value="work/deep">Deep Work</option>
            </select>
        `;

        resolveCategoryKey.mockImplementation((key) =>
            key === 'work/deep' ? { kind: 'category', record: { key, color: '#0ea5e9' } } : null
        );

        const select = document.getElementById('category-select');
        const dot = document.getElementById('category-dot');
        syncCategoryColorDot(select, dot);

        expect(dot.style.backgroundColor).toBe('rgb(100, 116, 139)');

        select.value = 'work/deep';
        select.dispatchEvent(new Event('change'));

        expect(dot.style.backgroundColor).toBe('rgb(14, 165, 233)');
    });
});

/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/tasks/manager.js', () => ({
    getTaskById: jest.fn()
}));

jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn(),
    askConfirmation: jest.fn()
}));

jest.mock('../public/js/utils.js', () => ({
    getThemeForTask: jest.fn()
}));

import { showInlineDeleteConfirmation } from '../public/js/tasks/confirmation-helpers.js';

describe('showInlineDeleteConfirmation', () => {
    test('rejects a missing button', () => {
        expect(showInlineDeleteConfirmation(null)).toBe(false);
    });

    test('rejects a button without a text label', () => {
        document.body.innerHTML = '<button><i class="fa-trash-can"></i></button>';

        expect(showInlineDeleteConfirmation(document.querySelector('button'))).toBe(false);
    });

    test('rejects a button without an icon', () => {
        document.body.innerHTML = '<button><span>Delete task</span></button>';

        expect(showInlineDeleteConfirmation(document.querySelector('button'))).toBe(false);
    });

    test('updates the existing button in place', () => {
        document.body.innerHTML = `
            <button data-identity="same-button">
                <i class="fa-trash-can"></i>
                <span>Delete task</span>
            </button>
        `;
        const button = document.querySelector('button');

        expect(showInlineDeleteConfirmation(button)).toBe(true);
        expect(button.dataset.identity).toBe('same-button');
        expect(button.querySelector('span').textContent).toBe('Confirm delete');
        expect(button.querySelector('i').classList.contains('fa-check-circle')).toBe(true);
        expect(button.querySelector('i').classList.contains('fa-trash-can')).toBe(false);
    });
});

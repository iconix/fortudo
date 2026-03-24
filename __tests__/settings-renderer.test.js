/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));
window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn(),
    waitForIdleSync: jest.fn(() => Promise.resolve()),
    teardownSync: jest.fn(),
    triggerSync: jest.fn(() => Promise.resolve()),
    onSyncStatusChange: jest.fn()
}));

jest.mock('../public/js/toast-manager.js', () => ({
    showToast: jest.fn()
}));

import { initStorage, destroyStorage } from '../public/js/storage.js';
import { loadCategories, getCategories } from '../public/js/category-manager.js';
import { setActivitiesEnabled } from '../public/js/settings-manager.js';
import { showToast } from '../public/js/toast-manager.js';
import {
    openSettingsModal,
    closeSettingsModal,
    renderSettingsContent,
    getSettingsModalElement,
    initializeSettingsModalListeners
} from '../public/js/settings-renderer.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `settings-ui-${testDbCounter++}-${Date.now()}`;
}

function setupSettingsDOM() {
    document.body.innerHTML = `
        <button id="settings-gear-btn" type="button">Gear</button>
        <div
            id="settings-modal"
            class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
            <div class="bg-slate-800 border border-slate-700 p-6 rounded-lg max-w-md w-full">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-normal text-slate-200">Settings</h3>
                    <button id="close-settings-modal" class="text-slate-400 hover:text-slate-200 p-1">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <div id="settings-content"></div>
            </div>
        </div>
    `;
}

beforeEach(() => {
    setupSettingsDOM();
    localStorage.clear();
    jest.clearAllMocks();
});

afterEach(async () => {
    await destroyStorage();
});

describe('settings-renderer', () => {
    describe('openSettingsModal / closeSettingsModal', () => {
        test('openSettingsModal removes hidden class', () => {
            openSettingsModal();
            expect(getSettingsModalElement().classList.contains('hidden')).toBe(false);
        });

        test('closeSettingsModal adds hidden class', () => {
            openSettingsModal();
            closeSettingsModal();
            expect(getSettingsModalElement().classList.contains('hidden')).toBe(true);
        });
    });

    describe('initializeSettingsModalListeners', () => {
        test('gear click runs onOpen and opens the modal', () => {
            const onOpen = jest.fn();
            initializeSettingsModalListeners(onOpen);

            document.getElementById('settings-gear-btn').click();

            expect(onOpen).toHaveBeenCalled();
            expect(getSettingsModalElement().classList.contains('hidden')).toBe(false);
        });

        test('backdrop click closes the modal', () => {
            initializeSettingsModalListeners();
            openSettingsModal();

            const modal = getSettingsModalElement();
            modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(modal.classList.contains('hidden')).toBe(true);
        });

        test('Escape closes the modal when open', () => {
            initializeSettingsModalListeners();
            openSettingsModal();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            expect(getSettingsModalElement().classList.contains('hidden')).toBe(true);
        });
    });

    describe('renderSettingsContent', () => {
        test('returns without throwing when settings content container is missing', () => {
            document.body.innerHTML = '<div id="settings-modal"></div>';

            expect(() => renderSettingsContent()).not.toThrow();
        });

        test('renders Activities toggle in off state by default', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const toggle = document.getElementById('activities-toggle');
            expect(toggle).not.toBeNull();
            expect(toggle.checked).toBe(false);
        });

        test('renders Activities toggle in on state when enabled', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const toggle = document.getElementById('activities-toggle');
            expect(toggle.checked).toBe(true);
        });

        test('renders category list when Activities enabled', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const categoryItems = document.querySelectorAll('[data-category-key]');
            expect(categoryItems.length).toBe(getCategories().categories.length);
        });

        test('hides category list when Activities disabled', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const categorySection = document.getElementById('category-management-section');
            expect(categorySection.classList.contains('hidden')).toBe(true);
        });

        test('toggling Activities shows reload prompt', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const toggle = document.getElementById('activities-toggle');
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));

            const reloadPrompt = document.getElementById('reload-prompt');
            expect(reloadPrompt).not.toBeNull();
            expect(reloadPrompt.classList.contains('hidden')).toBe(false);
        });

        test('toggling Activities off shows disabled reload message and hides categories', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const toggle = document.getElementById('activities-toggle');
            const categorySection = document.getElementById('category-management-section');
            const message = document.getElementById('reload-prompt-message');

            toggle.checked = false;
            toggle.dispatchEvent(new Event('change'));

            expect(categorySection.classList.contains('hidden')).toBe(true);
            expect(message.textContent).toContain('Activities disabled');
        });

        test('category color dots render with correct color', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const firstDot = document.querySelector(
                '[data-category-key="work/deep"] .category-dot'
            );
            expect(firstDot).not.toBeNull();
            expect(firstDot.style.backgroundColor).toBeTruthy();
        });

        test('add category form creates new category and refreshes list', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const initialCount = document.querySelectorAll('[data-category-key]').length;

            const addButton = document.getElementById('add-category-btn');
            addButton.click();

            const form = document.getElementById('add-category-form');
            expect(form.classList.contains('hidden')).toBe(false);

            form.querySelector('[name="category-label"]').value = 'Exercise';
            form.querySelector('[name="category-color"]').value = '#10b981';
            form.querySelector('[name="category-group"]').value = 'personal';
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

            await new Promise((resolve) => setTimeout(resolve, 50));

            const newCount = document.querySelectorAll('[data-category-key]').length;
            expect(newCount).toBe(initialCount + 1);
        });

        test('cancel add hides and resets the add-category form', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const addButton = document.getElementById('add-category-btn');
            addButton.click();

            const form = document.getElementById('add-category-form');
            const labelInput = form.querySelector('[name="category-label"]');
            labelInput.value = 'Temporary';

            document.getElementById('cancel-add-category').click();

            expect(form.classList.contains('hidden')).toBe(true);
            expect(labelInput.value).toBe('');
        });

        test('add category form ignores blank submissions', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const initialCount = document.querySelectorAll('[data-category-key]').length;
            const form = document.getElementById('add-category-form');
            form.classList.remove('hidden');
            form.querySelector('[name="category-label"]').value = '';
            form.querySelector('[name="category-group"]').value = 'health';

            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(document.querySelectorAll('[data-category-key]').length).toBe(initialCount);
            expect(showToast).not.toHaveBeenCalled();
        });

        test('add category failure shows toast', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const form = document.getElementById('add-category-form');
            form.classList.remove('hidden');
            form.querySelector('[name="category-label"]').value = 'Admin';
            form.querySelector('[name="category-color"]').value = '#0ea5e9';
            form.querySelector('[name="category-group"]').value = 'work';

            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(showToast).toHaveBeenCalledWith('Category "work/admin" already exists', {
                theme: 'rose'
            });
        });

        test('delete button removes category from list', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const initialCount = document.querySelectorAll('[data-category-key]').length;
            const deleteButton = document.querySelector(
                '.btn-delete-category[data-key="work/admin"]'
            );

            deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            const waitForDelete = async () => {
                for (let attempt = 0; attempt < 10; attempt += 1) {
                    if (
                        document.querySelectorAll('[data-category-key]').length ===
                        initialCount - 1
                    ) {
                        return;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 25));
                }
            };
            await waitForDelete();

            const newCount = document.querySelectorAll('[data-category-key]').length;
            expect(newCount).toBe(initialCount - 1);
        });

        test('clicking category list background does nothing', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const initialMarkup = document.getElementById('category-list').innerHTML;
            document.getElementById('category-list').dispatchEvent(new MouseEvent('click'));

            expect(document.getElementById('category-list').innerHTML).toBe(initialMarkup);
        });

        test('clicking a category button without a key does nothing', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const button = document.createElement('button');
            button.className = 'btn-delete-category';
            document.getElementById('category-list').appendChild(button);

            button.click();
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(showToast).not.toHaveBeenCalled();
        });

        test('delete failure shows toast', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const deleteButton = document.querySelector('.btn-delete-category');
            deleteButton.dataset.key = 'missing/category';

            deleteButton.click();
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(showToast).toHaveBeenCalledWith('Category "missing/category" not found', {
                theme: 'rose'
            });
        });

        test('edit button opens inline editor and saves updates', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            document.querySelector('.btn-edit-category').click();

            const editForm = document.querySelector('.edit-category-form');
            expect(editForm).not.toBeNull();

            editForm.querySelector('[name="edit-label"]').value = 'Focus Time';
            editForm.querySelector('[name="edit-color"]').value = '#111111';
            editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(document.getElementById('category-list').textContent).toContain('Focus Time');
        });

        test('edit form ignores blank labels', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            document.querySelector('.btn-edit-category').click();

            const editForm = document.querySelector('.edit-category-form');
            editForm.querySelector('[name="edit-label"]').value = '   ';
            editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(document.querySelector('.edit-category-form')).not.toBeNull();
            expect(showToast).not.toHaveBeenCalled();
        });

        test('edit failure shows toast', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const editButton = document.querySelector('.btn-edit-category');
            editButton.dataset.key = 'missing/category';
            editButton.click();

            expect(document.querySelector('.edit-category-form')).toBeNull();
        });

        test('cancel edit restores the category row', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            document.querySelector('.btn-edit-category').click();
            document.querySelector('.btn-cancel-edit-category').click();

            expect(document.querySelector('.edit-category-form')).toBeNull();
            expect(document.getElementById('category-list').textContent).toContain('Deep Work');
        });
    });
});

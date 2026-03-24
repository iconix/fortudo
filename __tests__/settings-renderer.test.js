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
import { loadCategories, getGroupByKey, getCategoryByKey } from '../public/js/category-manager.js';
import { COLOR_FAMILIES } from '../public/js/category-colors.js';
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
                    <button id="close-settings-modal" type="button" class="text-slate-400 hover:text-slate-200 p-1">
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <div id="settings-content"></div>
            </div>
        </div>
        <div id="category-dropdown-row" class="hidden">
            <span id="category-color-indicator"></span>
            <select id="category-select" name="category">
                <option value="">No category</option>
            </select>
        </div>
    `;
}

async function renderEnabledSettings(options = {}) {
    setActivitiesEnabled(true);
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadCategories();
    renderSettingsContent(options);
}

async function submitForm(form) {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 25));
}

async function openInlineCategoryEditor(key) {
    const editButton = document.querySelector(`.btn-edit-category[data-key="${key}"]`);
    editButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return document.querySelector(`.edit-category-form[data-key="${key}"]`);
}

async function saveEditedCategoryColor(key, color) {
    const editForm = await openInlineCategoryEditor(key);
    editForm.querySelector('[name="edit-category-color"]').value = color;
    await submitForm(editForm);
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
            await renderEnabledSettings();

            const toggle = document.getElementById('activities-toggle');
            expect(toggle.checked).toBe(true);
        });

        test('renders groups and child categories in separate sections', async () => {
            await renderEnabledSettings({ onTaxonomyChanged: jest.fn() });

            expect(document.getElementById('groups-list')).not.toBeNull();
            expect(document.getElementById('categories-list')).not.toBeNull();
        });

        test('hides taxonomy management when Activities disabled', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const taxonomySection = document.getElementById('taxonomy-management-section');
            expect(taxonomySection.classList.contains('hidden')).toBe(true);
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

        test('toggling Activities off shows disabled reload message and hides taxonomy management', async () => {
            await renderEnabledSettings();

            const toggle = document.getElementById('activities-toggle');
            const taxonomySection = document.getElementById('taxonomy-management-section');
            const message = document.getElementById('reload-prompt-message');

            toggle.checked = false;
            toggle.dispatchEvent(new Event('change'));

            expect(taxonomySection.classList.contains('hidden')).toBe(true);
            expect(message.textContent).toContain('Activities disabled');
        });

        test('group add form creates a standalone selectable group', async () => {
            await renderEnabledSettings();

            document.getElementById('add-group-btn').click();

            const form = document.getElementById('add-group-form');
            form.querySelector('[name="group-label"]').value = 'Health';
            form.querySelector('[name="group-family"]').value = 'green';
            await submitForm(form);

            expect(getGroupByKey('health')).not.toBeNull();
            expect(document.querySelector('[data-group-key="health"]')).not.toBeNull();
        });

        test('group edit form changes family and refreshes linked children', async () => {
            await renderEnabledSettings();

            document.querySelector('.btn-edit-group[data-key="work"]').click();

            const form = document.querySelector('.edit-group-form[data-key="work"]');
            form.querySelector('[name="edit-group-family"]').value = 'amber';
            await submitForm(form);

            expect(getGroupByKey('work').colorFamily).toBe('amber');
            expect(getCategoryByKey('work/meetings').color).toBe(COLOR_FAMILIES.amber[1]);
        });

        test('category add form requires a parent group', async () => {
            await renderEnabledSettings();

            document.getElementById('add-category-btn').click();

            const form = document.getElementById('add-category-form');
            form.querySelector('[name="category-label"]').value = 'Exercise';
            form.querySelector('[name="parent-group"]').value = '';
            await submitForm(form);

            expect(getCategoryByKey('work/exercise')).toBeNull();
            expect(getCategoryByKey('health/exercise')).toBeNull();
            expect(showToast).toHaveBeenCalledWith('Parent group is required', {
                theme: 'rose'
            });
        });

        test('editing child color outside family unlinks the child', async () => {
            await renderEnabledSettings();

            await saveEditedCategoryColor('work/deep', '#22c55e');

            expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(false);
            expect(document.getElementById('categories-list').textContent).toContain('Unlinked');
        });

        test('editing child color back into family relinks the child', async () => {
            await renderEnabledSettings();

            await saveEditedCategoryColor('work/deep', '#22c55e');
            await saveEditedCategoryColor('work/deep', COLOR_FAMILIES.blue[0]);

            expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(true);
            expect(document.getElementById('categories-list').textContent).toContain('Linked');
        });

        test('taxonomy changes call onTaxonomyChanged callback', async () => {
            const onTaxonomyChanged = jest.fn();
            await renderEnabledSettings({ onTaxonomyChanged });

            document.getElementById('add-group-btn').click();
            const form = document.getElementById('add-group-form');
            form.querySelector('[name="group-label"]').value = 'Fitness';
            form.querySelector('[name="group-family"]').value = 'rose';
            await submitForm(form);

            expect(onTaxonomyChanged).toHaveBeenCalled();
        });
    });
});

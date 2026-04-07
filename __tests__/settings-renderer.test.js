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
import { COLOR_FAMILIES } from '../public/js/category-colors.js';
import { setActivitiesEnabled } from '../public/js/settings-manager.js';
import { showToast } from '../public/js/toast-manager.js';
import { loadTaxonomy } from '../public/js/taxonomy/taxonomy-store.js';
import { getGroupByKey, getCategoryByKey } from '../public/js/taxonomy/taxonomy-selectors.js';
import {
    openSettingsModal,
    closeSettingsModal,
    renderSettingsContent,
    getSettingsModalElement,
    initializeSettingsModalListeners
} from '../public/js/settings-renderer.js';
import {
    renderTaxonomyManagementContent,
    resetTaxonomySettingsViewState
} from '../public/js/settings/taxonomy-settings.js';

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
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await setActivitiesEnabled(true);
    await loadTaxonomy();
    renderSettingsContent(options);
}

async function submitForm(form) {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 25));
}

async function clickAndWait(element) {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
}

async function openInlineGroupEditor(key) {
    const editButton = document.querySelector(`.btn-edit-group[data-key="${key}"]`);
    await clickAndWait(editButton);
    return document.querySelector(`.edit-group-form[data-key="${key}"]`);
}

async function openInlineCategoryEditor(key) {
    const editButton = document.querySelector(`.btn-edit-category[data-key="${key}"]`);
    await clickAndWait(editButton);
    return document.querySelector(`.edit-category-form[data-key="${key}"]`);
}

async function saveEditedCategoryColor(key, color) {
    const editForm = await openInlineCategoryEditor(key);
    editForm.querySelector('[name="edit-category-color"]').value = color;
    await submitForm(editForm);
}

beforeEach(() => {
    setupSettingsDOM();
    resetTaxonomySettingsViewState();
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
            await loadTaxonomy();
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

        test('extracted taxonomy settings module renders taxonomy section content', async () => {
            await renderEnabledSettings({ onTaxonomyChanged: jest.fn() });

            const markup = renderTaxonomyManagementContent();

            expect(markup).toContain('Groups');
            expect(markup).toContain('Categories');
            expect(markup).toContain('add-group-form');
            expect(markup).toContain('add-category-form');
        });

        test('renderSettingsContent applies the custom settings scroll area class', async () => {
            await renderEnabledSettings({ onTaxonomyChanged: jest.fn() });

            expect(
                document
                    .getElementById('settings-content')
                    .classList.contains('settings-scroll-area')
            ).toBe(true);
        });

        test('category add form uses a compact group slash category row with placeholders', async () => {
            await renderEnabledSettings({ onTaxonomyChanged: jest.fn() });

            await clickAndWait(document.getElementById('add-category-btn'));

            const form = document.getElementById('add-category-form');
            const parentGroup = form.querySelector('[name="parent-group"]');
            const categoryLabel = form.querySelector('[name="category-label"]');
            const slash = form.querySelector('[data-category-path-separator]');

            expect(parentGroup.getAttribute('aria-label')).toBe('Parent group');
            expect(parentGroup.options[0].textContent).toBe('Group');
            expect(categoryLabel.getAttribute('placeholder')).toBe('Category name');
            expect(slash.textContent).toBe('/');
            expect(form.textContent).not.toContain('Parent group');
            expect(form.textContent).not.toContain('Category name');
        });

        test('hides taxonomy management when Activities disabled', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadTaxonomy();
            renderSettingsContent();

            const taxonomySection = document.getElementById('taxonomy-management-section');
            expect(taxonomySection.classList.contains('hidden')).toBe(true);
        });

        test('toggling Activities shows reload prompt', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadTaxonomy();
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

            await clickAndWait(document.getElementById('add-group-btn'));

            const form = document.getElementById('add-group-form');
            form.querySelector('[name="group-label"]').value = 'Health';
            form.querySelector('[name="group-family"]').value = 'green';
            await submitForm(form);
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(getGroupByKey('health')).not.toBeNull();
            expect(document.querySelector('[data-group-key="health"]')).not.toBeNull();
        });

        test('add group failure shows toast for duplicate groups', async () => {
            await renderEnabledSettings();

            await clickAndWait(document.getElementById('add-group-btn'));

            const form = document.getElementById('add-group-form');
            form.querySelector('[name="group-label"]').value = 'Work';
            form.querySelector('[name="group-family"]').value = 'blue';
            await submitForm(form);

            expect(showToast).toHaveBeenCalledWith('Group "work" already exists', {
                theme: 'rose'
            });
        });

        test('cancel add group hides and resets the form', async () => {
            await renderEnabledSettings();

            await clickAndWait(document.getElementById('add-group-btn'));

            const form = document.getElementById('add-group-form');
            const labelInput = form.querySelector('[name="group-label"]');
            labelInput.value = 'Temporary';

            await clickAndWait(document.getElementById('cancel-add-group'));

            expect(document.getElementById('add-group-form').classList.contains('hidden')).toBe(
                true
            );
            expect(document.querySelector('[name="group-label"]').value).toBe('');
        });

        test('group edit form changes family and refreshes linked children', async () => {
            await renderEnabledSettings();

            const form = await openInlineGroupEditor('work');
            form.querySelector('[name="edit-group-family"]').value = 'amber';
            await submitForm(form);

            expect(getGroupByKey('work').colorFamily).toBe('amber');
            expect(getCategoryByKey('work/meetings').color).toBe(COLOR_FAMILIES.amber[1]);
        });

        test('saving a group edit preserves an open category add draft', async () => {
            await renderEnabledSettings();

            await clickAndWait(document.getElementById('add-category-btn'));

            const categoryAddForm = document.getElementById('add-category-form');
            categoryAddForm.querySelector('[name="category-label"]').value = 'Draft Category';
            categoryAddForm.querySelector('[name="parent-group"]').value = 'work';

            const groupEditForm = await openInlineGroupEditor('work');
            groupEditForm.querySelector('[name="edit-group-family"]').value = 'amber';
            await submitForm(groupEditForm);

            const refreshedCategoryAddForm = document.getElementById('add-category-form');
            expect(refreshedCategoryAddForm.classList.contains('hidden')).toBe(false);
            expect(refreshedCategoryAddForm.querySelector('[name="category-label"]').value).toBe(
                'Draft Category'
            );
            expect(refreshedCategoryAddForm.querySelector('[name="parent-group"]').value).toBe(
                'work'
            );
        });

        test('saving a group edit preserves an open category edit draft', async () => {
            await renderEnabledSettings();

            const categoryEditForm = await openInlineCategoryEditor('work/deep');
            categoryEditForm.querySelector('[name="edit-category-label"]').value =
                'Draft Deep Work';
            categoryEditForm.querySelector('[name="edit-category-color"]').value = '#22c55e';

            const groupEditForm = await openInlineGroupEditor('work');
            groupEditForm.querySelector('[name="edit-group-family"]').value = 'amber';
            await submitForm(groupEditForm);

            const refreshedCategoryEditForm = document.querySelector(
                '.edit-category-form[data-key="work/deep"]'
            );
            expect(refreshedCategoryEditForm).not.toBeNull();
            expect(
                refreshedCategoryEditForm.querySelector('[name="edit-category-label"]').value
            ).toBe('Draft Deep Work');
            expect(
                refreshedCategoryEditForm.querySelector('[name="edit-category-color"]').value
            ).toBe('#22c55e');
        });

        test('category add form requires a parent group', async () => {
            await renderEnabledSettings();

            await clickAndWait(document.getElementById('add-category-btn'));

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

        test('add category failure shows toast for duplicate categories', async () => {
            await renderEnabledSettings();

            await clickAndWait(document.getElementById('add-category-btn'));

            const form = document.getElementById('add-category-form');
            form.querySelector('[name="category-label"]').value = 'Admin';
            form.querySelector('[name="parent-group"]').value = 'work';
            await submitForm(form);

            expect(showToast).toHaveBeenCalledWith('Category "work/admin" already exists', {
                theme: 'rose'
            });
        });

        test('cancel add category hides and resets the form', async () => {
            await renderEnabledSettings();

            await clickAndWait(document.getElementById('add-category-btn'));

            const form = document.getElementById('add-category-form');
            form.querySelector('[name="category-label"]').value = 'Temporary';
            form.querySelector('[name="parent-group"]').value = 'work';

            await clickAndWait(document.getElementById('cancel-add-category'));

            expect(document.getElementById('add-category-form').classList.contains('hidden')).toBe(
                true
            );
            expect(document.querySelector('[name="category-label"]').value).toBe('');
            expect(document.querySelector('[name="parent-group"]').value).toBe('');
        });

        test('delete failure shows toast', async () => {
            await renderEnabledSettings();

            const deleteButton = document.querySelector('.btn-delete-category');
            deleteButton.dataset.key = 'missing/category';

            await clickAndWait(deleteButton);

            expect(showToast).toHaveBeenCalledWith('Category "missing/category" not found', {
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

        test('cancel edit restores the category row', async () => {
            await renderEnabledSettings();

            await openInlineCategoryEditor('work/deep');
            await clickAndWait(document.querySelector('.btn-cancel-edit-category'));

            expect(document.querySelector('.edit-category-form[data-key="work/deep"]')).toBeNull();
            expect(document.querySelector('[data-category-key="work/deep"]')).not.toBeNull();
            expect(document.getElementById('categories-list').textContent).toContain('Deep Work');
        });

        test('close and reopen clears stale open forms and editors', async () => {
            const onOpen = jest.fn(() => renderSettingsContent());
            initializeSettingsModalListeners(onOpen);
            await renderEnabledSettings();

            await clickAndWait(document.getElementById('add-group-btn'));
            await openInlineCategoryEditor('work/deep');
            openSettingsModal();

            await clickAndWait(document.getElementById('close-settings-modal'));
            await clickAndWait(document.getElementById('settings-gear-btn'));

            expect(document.getElementById('add-group-form').classList.contains('hidden')).toBe(
                true
            );
            expect(document.querySelector('.edit-category-form[data-key="work/deep"]')).toBeNull();
        });

        test('taxonomy changes call onTaxonomyChanged callback', async () => {
            const onTaxonomyChanged = jest.fn();
            await renderEnabledSettings({ onTaxonomyChanged });

            await clickAndWait(document.getElementById('add-group-btn'));
            const form = document.getElementById('add-group-form');
            form.querySelector('[name="group-label"]').value = 'Fitness';
            form.querySelector('[name="group-family"]').value = 'rose';
            await submitForm(form);

            expect(onTaxonomyChanged).toHaveBeenCalled();
        });
    });
});

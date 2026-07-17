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
import * as settingsManager from '../public/js/settings-manager.js';
import { loadSettings, setActivitiesEnabled } from '../public/js/settings-manager.js';
import { showToast } from '../public/js/toast-manager.js';
import { loadTaxonomy } from '../public/js/taxonomy/taxonomy-store.js';
import { getGroupByKey, getCategoryByKey } from '../public/js/taxonomy/taxonomy-selectors.js';
import {
    openSettingsModal,
    closeSettingsModal,
    renderSettingsContent,
    getSettingsModalElement,
    initializeSettingsModalListeners,
    openSettingsAfterActivitiesReloadIfNeeded
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

async function renderDisabledSettings(options = {}) {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadSettings();
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

async function waitForCondition(predicate, { timeoutMs = 1000, intervalMs = 10 } = {}) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (predicate()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Timed out waiting for expected condition.');
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
    editForm.querySelector('[name="edit-category-color-mode"]').value = 'custom';
    editForm
        .querySelector('[name="edit-category-color-mode"]')
        .dispatchEvent(new Event('change', { bubbles: true }));
    editForm.querySelector('[name="edit-category-color"]').value = color;
    await submitForm(editForm);
}

beforeEach(() => {
    setupSettingsDOM();
    resetTaxonomySettingsViewState();
    localStorage.clear();
    sessionStorage.clear();
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
            await renderDisabledSettings();

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

        test('visually separates Activity tracking from shared Organization settings', async () => {
            await renderEnabledSettings({ onTaxonomyChanged: jest.fn() });

            const activitySection = document.querySelector(
                '[data-settings-domain="activity-tracking"]'
            );
            const organizationSection = document.querySelector(
                '[data-settings-domain="organization"]'
            );

            expect(activitySection.textContent).toContain('Activity tracking');
            expect(activitySection.textContent).toContain('Track time spent and view insights');
            expect(organizationSection.textContent).toContain('Organization');
            expect(organizationSection.textContent).toContain(
                'Groups and categories shared by tasks and activities.'
            );
            expect(organizationSection.className).toContain('border-t');
            expect(
                activitySection.querySelector('label[for="activities-toggle"]').className
            ).toContain('text-base');
            expect(organizationSection.querySelector('h4').className).toContain('text-base');
            expect(
                organizationSection.querySelector('[data-taxonomy-section="groups"] h4').className
            ).toContain('text-sm');
        });

        test('left aligns Settings sections and nested category group headings', async () => {
            await renderEnabledSettings({ onTaxonomyChanged: jest.fn() });

            const activitiesCopy = document.querySelector('[data-activities-setting-copy]');
            const taxonomySections = document.querySelectorAll('[data-taxonomy-section]');
            const workCategoryGroup = document.querySelector('[data-category-group-key="work"]');
            const workHeading = workCategoryGroup.querySelector('[data-category-group-heading]');

            expect(activitiesCopy.className).toContain('text-left');
            expect(taxonomySections).toHaveLength(2);
            taxonomySections.forEach((section) => {
                expect(section.className).toContain('text-left');
            });
            expect(workHeading.className).toContain('text-left');
            expect(workHeading.className).not.toContain('uppercase');
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

        test('uses activity sky for the switch and brand violet for shared add actions', async () => {
            await renderEnabledSettings({ onTaxonomyChanged: jest.fn() });

            const switchTrack = document
                .querySelector('label[for="activities-toggle"]')
                .parentElement.nextElementSibling.querySelector('div');
            const addGroupButton = document.getElementById('add-group-btn');
            const addCategoryButton = document.getElementById('add-category-btn');

            expect(switchTrack.className).toContain('peer-checked:bg-sky-500');
            expect(switchTrack.className).not.toContain('peer-checked:bg-violet-500');
            [addGroupButton, addCategoryButton].forEach((button) => {
                expect(button.className).toContain('text-violet-300');
                expect(button.className).toContain('hover:text-violet-200');
                expect(button.className).not.toContain('text-sky-300');
            });
        });

        test('uses violet Tint+ styling for the reload-to-apply action', async () => {
            await renderDisabledSettings();

            const reloadButton = document.getElementById('reload-apply-btn');

            expect(reloadButton.className).toContain('bg-violet-500/30');
            expect(reloadButton.className).toContain('border-violet-400/60');
            expect(reloadButton.className).toContain('text-violet-200');
            expect(reloadButton.className).toContain('hover:bg-violet-500/40');
            expect(reloadButton.classList.contains('bg-violet-500')).toBe(false);
            expect(reloadButton.classList.contains('text-white')).toBe(false);
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
            await renderDisabledSettings();

            const taxonomySection = document.getElementById('taxonomy-management-section');
            expect(taxonomySection.classList.contains('hidden')).toBe(true);
        });

        test('toggling Activities shows reload prompt', async () => {
            await renderDisabledSettings();

            const toggle = document.getElementById('activities-toggle');
            const taxonomySection = document.getElementById('taxonomy-management-section');
            const message = document.getElementById('reload-prompt-message');

            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));
            await waitForCondition(() => {
                const reloadPrompt = document.getElementById('reload-prompt');
                return reloadPrompt && !reloadPrompt.classList.contains('hidden');
            });

            const reloadPrompt = document.getElementById('reload-prompt');
            expect(reloadPrompt).not.toBeNull();
            expect(reloadPrompt.classList.contains('hidden')).toBe(false);
            expect(reloadPrompt.classList.contains('settings-reload-prompt')).toBe(true);
            expect(reloadPrompt.classList.contains('settings-reload-prompt--visible')).toBe(true);
            expect(message.textContent).toContain('Activities enabled');
            expect(message.textContent).toContain('taxonomy controls will be available');
            expect(taxonomySection.classList.contains('hidden')).toBe(true);
        });

        test('toggling Activities off shows disabled reload message and hides taxonomy management', async () => {
            await renderEnabledSettings();

            const toggle = document.getElementById('activities-toggle');
            const taxonomySection = document.getElementById('taxonomy-management-section');
            const message = document.getElementById('reload-prompt-message');

            toggle.checked = false;
            toggle.dispatchEvent(new Event('change'));
            await waitForCondition(
                () =>
                    taxonomySection.classList.contains('hidden') &&
                    message.textContent.includes('Activities disabled')
            );

            expect(taxonomySection.classList.contains('hidden')).toBe(true);
            expect(message.textContent).toContain('Activities disabled');
        });

        test('reload after enabling Activities does not record a return to settings', async () => {
            const reloadWindow = jest.fn();
            await renderDisabledSettings({ reloadWindow });

            const toggle = document.getElementById('activities-toggle');
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));
            await waitForCondition(() => {
                const reloadPrompt = document.getElementById('reload-prompt');
                return reloadPrompt && !reloadPrompt.classList.contains('hidden');
            });

            document.getElementById('reload-apply-btn').click();

            expect(sessionStorage.getItem('fortudo-open-settings-after-activities-reload')).toBe(
                null
            );
            expect(reloadWindow).toHaveBeenCalledTimes(1);
        });

        test('does not record settings return when reloading after disabling Activities', async () => {
            const reloadWindow = jest.fn();
            await renderEnabledSettings({ reloadWindow });

            const toggle = document.getElementById('activities-toggle');
            toggle.checked = false;
            toggle.dispatchEvent(new Event('change'));
            await waitForCondition(() => {
                const reloadPrompt = document.getElementById('reload-prompt');
                return reloadPrompt && !reloadPrompt.classList.contains('hidden');
            });

            document.getElementById('reload-apply-btn').click();

            expect(sessionStorage.getItem('fortudo-open-settings-after-activities-reload')).toBe(
                null
            );
            expect(reloadWindow).toHaveBeenCalledTimes(1);
        });

        test('clears stale Activities reload return flag without opening settings', async () => {
            const waitForIdleSync = jest.fn(() => Promise.resolve());
            const renderContent = jest.fn(() => renderSettingsContent());
            sessionStorage.setItem('fortudo-open-settings-after-activities-reload', 'true');
            await renderEnabledSettings();

            await openSettingsAfterActivitiesReloadIfNeeded({ waitForIdleSync, renderContent });

            expect(waitForIdleSync).not.toHaveBeenCalled();
            expect(renderContent).not.toHaveBeenCalled();
            expect(getSettingsModalElement().classList.contains('hidden')).toBe(true);
            expect(sessionStorage.getItem('fortudo-open-settings-after-activities-reload')).toBe(
                null
            );
        });

        test('toggle failure restores previous state and shows toast', async () => {
            await renderDisabledSettings();

            const toggle = document.getElementById('activities-toggle');
            const taxonomySection = document.getElementById('taxonomy-management-section');
            const reloadPrompt = document.getElementById('reload-prompt');
            const setActivitiesEnabledSpy = jest
                .spyOn(settingsManager, 'setActivitiesEnabled')
                .mockRejectedValueOnce(new Error('write failed'));

            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));
            await waitForCondition(() => showToast.mock.calls.length > 0);

            expect(toggle.checked).toBe(false);
            expect(taxonomySection.classList.contains('hidden')).toBe(true);
            expect(reloadPrompt.classList.contains('hidden')).toBe(true);
            expect(showToast).toHaveBeenCalledWith('Could not update Activities setting', {
                theme: 'rose'
            });

            setActivitiesEnabledSpy.mockRestore();
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

        test('group color family options use familiar user-facing color names', async () => {
            await renderEnabledSettings();
            await clickAndWait(document.getElementById('add-group-btn'));

            const options = Array.from(document.querySelector('[name="group-family"]').options).map(
                (option) => option.textContent
            );

            expect(options).toEqual(
                expect.arrayContaining(['Blue', 'Green', 'Orange', 'Red', 'Gray', 'Purple'])
            );
            expect(options).not.toContain('Amber');
            expect(options).not.toContain('Rose');
            expect(options).not.toContain('Violet');
        });

        test('taxonomy settings use product language instead of data-model terminology', async () => {
            await renderEnabledSettings();

            const content = document.getElementById('taxonomy-management-section').textContent;
            expect(content).toContain('Top-level task categories.');
            expect(content).toContain('Optional categories within a group.');
            expect(content).not.toContain('Standalone selectable');
            expect(content).not.toContain('Child categories linked');

            const groupForm = await openInlineGroupEditor('work');
            expect(groupForm.querySelector('label[for^="edit-group-family-"]').textContent).toBe(
                'Group color'
            );
        });

        test('keeps group cards compact while naming color dots accessibly', async () => {
            await renderEnabledSettings();

            [
                ['work', 'Blue'],
                ['personal', 'Red'],
                ['break', 'Green']
            ].forEach(([groupKey, colorName]) => {
                const groupRow = document.querySelector(`[data-group-key="${groupKey}"]`);
                const colorDot = groupRow.querySelector('[data-group-color-dot]');

                expect(groupRow.querySelector('[data-group-color-name]')).toBeNull();
                expect(groupRow.textContent).not.toContain(colorName);
                expect(colorDot.getAttribute('role')).toBe('img');
                expect(colorDot.getAttribute('aria-label')).toBe(`${colorName} group color`);
                expect(colorDot.getAttribute('title')).toBe(colorName);
            });
        });

        test('shows the default tone family once per group instead of on every category', async () => {
            await renderEnabledSettings();

            const categoriesList = document.getElementById('categories-list');
            const workCategoryGroup = document.querySelector('[data-category-group-key="work"]');
            const colorDefaultNotes = workCategoryGroup.querySelectorAll(
                '[data-category-color-default]'
            );
            const deepWorkRow = document.querySelector('[data-category-key="work/deep"]');

            expect(categoriesList.className).toContain('space-y-5');
            expect(colorDefaultNotes).toHaveLength(1);
            expect(colorDefaultNotes[0].textContent).toContain('Blue tones by default');
            expect(colorDefaultNotes[0].parentElement).toBe(
                workCategoryGroup.querySelector('[data-category-group-heading]')
            );
            expect(colorDefaultNotes[0].parentElement.className).toContain('flex');
            expect(colorDefaultNotes[0].className).toContain('text-slate-500');
            expect(colorDefaultNotes[0].querySelector('.fa-link')).toBeNull();
            expect(deepWorkRow.querySelector('[data-custom-color-label]')).toBeNull();
            expect(deepWorkRow.textContent).not.toContain('Inherits');
            expect(deepWorkRow.textContent).not.toContain('Follows');
            expect(deepWorkRow.textContent).not.toContain('work/deep');
        });

        test('taxonomy action buttons have specific accessible names', async () => {
            await renderEnabledSettings();

            expect(document.getElementById('add-group-btn').getAttribute('aria-label')).toBe(
                'Add group'
            );
            expect(document.getElementById('add-category-btn').getAttribute('aria-label')).toBe(
                'Add category'
            );
            expect(
                document
                    .querySelector('.btn-edit-group[data-key="work"]')
                    .getAttribute('aria-label')
            ).toBe('Edit Work group');
            expect(
                document
                    .querySelector('.btn-delete-group[data-key="work"]')
                    .getAttribute('aria-label')
            ).toBe('Delete Work group');
            expect(
                document
                    .querySelector('.btn-edit-category[data-key="work/deep"]')
                    .getAttribute('aria-label')
            ).toBe('Edit Deep Work category');
            expect(
                document
                    .querySelector('.btn-delete-category[data-key="work/deep"]')
                    .getAttribute('aria-label')
            ).toBe('Delete Deep Work category');
        });

        test('taxonomy group and category rows keep names left aligned', async () => {
            await renderEnabledSettings();

            expect(document.querySelector('[data-group-key="work"]').className).toContain(
                'text-left'
            );
            expect(document.querySelector('[data-category-key="work/deep"]').className).toContain(
                'text-left'
            );
        });

        test('taxonomy controls reserve room for mobile actions and truncate inline metadata', async () => {
            await renderEnabledSettings();

            const addGroupButton = document.getElementById('add-group-btn');
            const addCategoryButton = document.getElementById('add-category-btn');
            const groupRow = document.querySelector('[data-group-key="work"]');
            const categoryRow = document.querySelector('[data-category-key="work/deep"]');

            expect(addGroupButton.parentElement.className).toContain('items-start');
            expect(addGroupButton.parentElement.className).toContain('gap-3');
            expect(addGroupButton.className).toContain('shrink-0');
            expect(addCategoryButton.className).toContain('shrink-0');
            expect(groupRow.lastElementChild.className).toContain('shrink-0');
            expect(categoryRow.lastElementChild.className).toContain('shrink-0');
            expect(document.querySelector('[data-category-color-default]').className).toContain(
                'truncate'
            );
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
            categoryEditForm.querySelector('[name="edit-category-color-mode"]').value = 'custom';
            categoryEditForm
                .querySelector('[name="edit-category-color-mode"]')
                .dispatchEvent(new Event('change', { bubbles: true }));
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
            expect(
                refreshedCategoryEditForm.querySelector('[name="edit-category-color-mode"]').value
            ).toBe('custom');
            expect(
                refreshedCategoryEditForm
                    .querySelector('[data-custom-color-field]')
                    .classList.contains('hidden')
            ).toBe(false);
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
            const customColorLabel = document.querySelector(
                '[data-category-key="work/deep"] [data-custom-color-label]'
            );
            expect(customColorLabel.textContent).toBe('custom color');
            expect(customColorLabel.className).toContain('text-slate-500');
            expect(customColorLabel.className).not.toContain('border');
            expect(customColorLabel.className).not.toContain('rounded');
            expect(customColorLabel.className).not.toContain('bg-');
            expect(customColorLabel.querySelector('.fa-palette')).toBeNull();
            expect(customColorLabel.parentElement.querySelector('.text-xs')).toBeNull();
        });

        test('category editor explicitly switches between following group and custom colors', async () => {
            await renderEnabledSettings();

            const linkedForm = await openInlineCategoryEditor('work/deep');
            const modeSelect = linkedForm.querySelector('[name="edit-category-color-mode"]');
            const customColorField = linkedForm.querySelector('[data-custom-color-field]');

            expect(modeSelect.value).toBe('follow');
            expect(modeSelect.options[0].textContent).toBe('Inherit blue tones from Work');
            expect(customColorField.classList).toContain('hidden');

            modeSelect.value = 'custom';
            modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(customColorField.classList).not.toContain('hidden');
            expect(linkedForm.querySelector('[name="edit-category-color"]').disabled).toBe(false);
        });

        test('choosing inherited tones deliberately relinks a custom category', async () => {
            await renderEnabledSettings();

            await saveEditedCategoryColor('work/deep', '#22c55e');

            const customForm = await openInlineCategoryEditor('work/deep');
            customForm.querySelector('[name="edit-category-color-mode"]').value = 'follow';
            await submitForm(customForm);

            expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(true);
            expect(COLOR_FAMILIES.blue).toContain(getCategoryByKey('work/deep').color);
            const workCategoryGroup = document.querySelector('[data-category-group-key="work"]');
            expect(
                workCategoryGroup.querySelector('[data-category-color-default]').textContent
            ).toContain('Blue tones by default');
            expect(
                document.querySelector('[data-category-key="work/deep"] [data-custom-color-label]')
            ).toBeNull();
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
            await waitForCondition(() => onTaxonomyChanged.mock.calls.length > 0);

            expect(onTaxonomyChanged).toHaveBeenCalled();
        });
    });
});

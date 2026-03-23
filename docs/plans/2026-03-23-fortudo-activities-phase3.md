# Phase 3: Categories & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category management and a settings UI so users can configure activity tracking and assign categories to tasks.

**Architecture:** Two new manager modules (`category-manager.js`, `settings-manager.js`) encapsulate state and persistence. A settings modal provides the UI for toggling Activities and managing categories. The category dropdown appears on the task form only when Activities are enabled. Category pill badges render on tasks in both scheduled and unscheduled lists.

**Tech Stack:** Vanilla JS/ES modules, PouchDB (via existing `storage.js` primitives), Tailwind CSS, Font Awesome icons, Jest + jsdom for tests.

**Spec reference:** `docs/plans/2026-03-16-fortudo-activities-design.md` (Phase 3 section, lines 327-334; Settings section, lines 192-202; Category data model, lines 69-91; Category dropdown, lines 210-214).

---

## File Structure

```
public/js/
  settings-manager.js    (CREATE) - Activities toggle read/write via localStorage
  category-manager.js    (CREATE) - Category CRUD, default seeding, config-doc persistence, badge rendering helper
  settings-renderer.js   (CREATE) - Settings modal rendering and event handling
  tasks/form-utils.js    (MODIFY) - Extract category from form, populate dropdown, category color indicator listener
  tasks/manager.js       (MODIFY) - Pass category through task creation
  tasks/scheduled-renderer.js   (MODIFY) - Render category pill badge on scheduled tasks
  tasks/unscheduled-renderer.js (MODIFY) - Render category pill badge on unscheduled tasks
  app.js                 (MODIFY) - Import and initialize settings + categories at boot
public/index.html        (MODIFY) - Add settings gear icon, settings modal, category dropdown on form

__tests__/
  settings-manager.test.js    (CREATE)
  category-manager.test.js    (CREATE)
  settings-renderer.test.js   (CREATE)
```

---

## Chunk 1: Core Managers (Tasks 1-3)

### Task 1: settings-manager.js

**Files:**
- Create: `public/js/settings-manager.js`
- Test: `__tests__/settings-manager.test.js`

- [ ] **Step 1: Write the test file with initial tests**

```js
// __tests__/settings-manager.test.js
/**
 * @jest-environment jsdom
 */

import {
    isActivitiesEnabled,
    setActivitiesEnabled
} from '../public/js/settings-manager.js';

describe('settings-manager', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('isActivitiesEnabled returns false by default', () => {
        expect(isActivitiesEnabled()).toBe(false);
    });

    test('setActivitiesEnabled(true) makes isActivitiesEnabled return true', () => {
        setActivitiesEnabled(true);
        expect(isActivitiesEnabled()).toBe(true);
    });

    test('setActivitiesEnabled(false) makes isActivitiesEnabled return false', () => {
        setActivitiesEnabled(true);
        setActivitiesEnabled(false);
        expect(isActivitiesEnabled()).toBe(false);
    });

    test('setting persists across reads via localStorage', () => {
        setActivitiesEnabled(true);
        // Simulate fresh read by clearing any in-memory cache
        expect(localStorage.getItem('fortudo-activities-enabled')).toBe('true');
    });

    test('handles corrupted localStorage value gracefully', () => {
        localStorage.setItem('fortudo-activities-enabled', 'not-a-boolean');
        expect(isActivitiesEnabled()).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/settings-manager.test.js --verbose`
Expected: FAIL - module not found

- [ ] **Step 3: Implement settings-manager.js**

```js
// public/js/settings-manager.js

const STORAGE_KEY = 'fortudo-activities-enabled';

/**
 * Check whether the Activities feature is enabled.
 * @returns {boolean}
 */
export function isActivitiesEnabled() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
}

/**
 * Enable or disable the Activities feature.
 * @param {boolean} enabled
 */
export function setActivitiesEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, String(!!enabled));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/settings-manager.test.js --verbose`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/settings-manager.js __tests__/settings-manager.test.js
git commit -m "feat: add settings-manager with Activities toggle (TDD)"
```

---

### Task 2: category-manager.js — core logic

**Files:**
- Create: `public/js/category-manager.js`
- Test: `__tests__/category-manager.test.js`

The category manager depends on `storage.js` for config doc persistence. Tests use PouchDB memory adapter (same pattern as `storage-config.test.js`).

- [ ] **Step 1: Write the test file**

```js
// __tests__/category-manager.test.js
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

import { initStorage, destroyStorage, loadConfig } from '../public/js/storage.js';
import {
    loadCategories,
    getCategories,
    getCategoryByKey,
    getCategoryGroups,
    addCategory,
    updateCategory,
    deleteCategory,
    renderCategoryBadge,
    DEFAULT_CATEGORIES
} from '../public/js/category-manager.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `cat-room-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('category-manager', () => {
    describe('loadCategories', () => {
        test('seeds default categories when config doc does not exist', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const categories = getCategories();
            expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
            expect(categories[0].key).toBe('work/deep');

            // Verify persisted to config doc
            const config = await loadConfig('config-categories');
            expect(config).not.toBeNull();
            expect(config.categories).toHaveLength(DEFAULT_CATEGORIES.length);
        });

        test('loads existing categories from config doc without overwriting', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });

            // Pre-seed a custom config
            const { putConfig } = await import('../public/js/storage.js');
            await putConfig({
                id: 'config-categories',
                categories: [
                    { key: 'custom/one', label: 'Custom', color: '#ff0000', group: 'custom' }
                ]
            });

            await loadCategories();
            const categories = getCategories();
            expect(categories).toHaveLength(1);
            expect(categories[0].key).toBe('custom/one');
        });
    });

    describe('getCategoryByKey', () => {
        test('returns the category matching the key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const cat = getCategoryByKey('work/deep');
            expect(cat).not.toBeNull();
            expect(cat.label).toBe('Deep Work');
        });

        test('returns null for unknown key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            expect(getCategoryByKey('nonexistent')).toBeNull();
        });
    });

    describe('getCategoryGroups', () => {
        test('returns categories grouped by group field', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const groups = getCategoryGroups();
            expect(groups).toHaveProperty('work');
            expect(groups).toHaveProperty('personal');
            expect(groups).toHaveProperty('break');
            expect(groups.work.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('addCategory', () => {
        test('adds a new category and persists', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const initial = getCategories().length;
            await addCategory({ key: 'health/exercise', label: 'Exercise', color: '#10b981', group: 'health' });

            expect(getCategories()).toHaveLength(initial + 1);
            expect(getCategoryByKey('health/exercise')).not.toBeNull();

            // Verify persisted
            const config = await loadConfig('config-categories');
            expect(config.categories).toHaveLength(initial + 1);
        });

        test('rejects duplicate key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            await expect(
                addCategory({ key: 'work/deep', label: 'Dup', color: '#000', group: 'work' })
            ).rejects.toThrow('already exists');
        });
    });

    describe('updateCategory', () => {
        test('updates label and color by key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            await updateCategory('work/deep', { label: 'Focus Time', color: '#0000ff' });
            const updated = getCategoryByKey('work/deep');
            expect(updated.label).toBe('Focus Time');
            expect(updated.color).toBe('#0000ff');
        });

        test('throws for unknown key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            await expect(
                updateCategory('nonexistent', { label: 'X' })
            ).rejects.toThrow('not found');
        });
    });

    describe('renderCategoryBadge', () => {
        test('returns empty string for null or undefined key', async () => {
            expect(renderCategoryBadge(null)).toBe('');
            expect(renderCategoryBadge(undefined)).toBe('');
        });

        test('returns empty string for unknown key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            expect(renderCategoryBadge('nonexistent')).toBe('');
        });

        test('returns HTML badge with label and color for valid key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const badge = renderCategoryBadge('work/deep');
            expect(badge).toContain('Deep Work');
            expect(badge).toContain('#0ea5e9');
            expect(badge).toContain('category');
        });
    });

    describe('deleteCategory', () => {
        test('removes category by key and persists', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            const initial = getCategories().length;
            await deleteCategory('break');

            expect(getCategories()).toHaveLength(initial - 1);
            expect(getCategoryByKey('break')).toBeNull();
        });

        test('throws for unknown key', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();

            await expect(deleteCategory('nonexistent')).rejects.toThrow('not found');
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/category-manager.test.js --verbose`
Expected: FAIL - module not found

- [ ] **Step 3: Implement category-manager.js**

```js
// public/js/category-manager.js

import { loadConfig, putConfig } from './storage.js';

const CONFIG_ID = 'config-categories';

export const DEFAULT_CATEGORIES = Object.freeze([
    { key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' },
    { key: 'work/meetings', label: 'Meetings', color: '#6366f1', group: 'work' },
    { key: 'work/comms', label: 'Comms', color: '#f59e0b', group: 'work' },
    { key: 'work/admin', label: 'Admin', color: '#64748b', group: 'work' },
    { key: 'personal', label: 'Personal', color: '#ec4899', group: 'personal' },
    { key: 'break', label: 'Break', color: '#22c55e', group: 'break' }
]);

/** @type {Array<{key: string, label: string, color: string, group: string}>} */
let categories = [];

/**
 * Load categories from the config doc, seeding defaults if none exist.
 */
export async function loadCategories() {
    const config = await loadConfig(CONFIG_ID);
    if (config && Array.isArray(config.categories) && config.categories.length > 0) {
        categories = config.categories;
    } else {
        categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
        await persistCategories();
    }
}

/**
 * Get the current in-memory categories list.
 * @returns {Array<{key: string, label: string, color: string, group: string}>}
 */
export function getCategories() {
    return categories;
}

/**
 * Look up a single category by its key.
 * @param {string} key
 * @returns {{key: string, label: string, color: string, group: string}|null}
 */
export function getCategoryByKey(key) {
    return categories.find((c) => c.key === key) || null;
}

/**
 * Return categories grouped by their group field.
 * @returns {Object<string, Array>}
 */
export function getCategoryGroups() {
    const groups = {};
    for (const cat of categories) {
        if (!groups[cat.group]) {
            groups[cat.group] = [];
        }
        groups[cat.group].push(cat);
    }
    return groups;
}

/**
 * Add a new category. Throws if key already exists.
 * @param {{key: string, label: string, color: string, group: string}} category
 */
export async function addCategory(category) {
    if (categories.some((c) => c.key === category.key)) {
        throw new Error(`Category "${category.key}" already exists`);
    }
    categories.push({ ...category });
    await persistCategories();
}

/**
 * Update an existing category's label and/or color. Throws if key not found.
 * @param {string} key
 * @param {{label?: string, color?: string}} updates
 */
export async function updateCategory(key, updates) {
    const cat = categories.find((c) => c.key === key);
    if (!cat) {
        throw new Error(`Category "${key}" not found`);
    }
    if (updates.label !== undefined) cat.label = updates.label;
    if (updates.color !== undefined) cat.color = updates.color;
    await persistCategories();
}

/**
 * Delete a category by key. Throws if key not found.
 * @param {string} key
 */
export async function deleteCategory(key) {
    const index = categories.findIndex((c) => c.key === key);
    if (index === -1) {
        throw new Error(`Category "${key}" not found`);
    }
    categories.splice(index, 1);
    await persistCategories();
}

/**
 * Render a category pill badge as an HTML string.
 * Shared by scheduled-renderer, unscheduled-renderer, and future activity renderer.
 * @param {string|null|undefined} categoryKey
 * @returns {string} HTML string (empty if no category)
 */
export function renderCategoryBadge(categoryKey) {
    if (!categoryKey) return '';
    const cat = getCategoryByKey(categoryKey);
    if (!cat) return '';
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs" style="background-color: ${cat.color}20; color: ${cat.color}; border: 1px solid ${cat.color}40;">
        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background-color: ${cat.color}"></span>
        ${cat.label}
    </span>`;
}

async function persistCategories() {
    await putConfig({ id: CONFIG_ID, categories });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/category-manager.test.js --verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/category-manager.js __tests__/category-manager.test.js
git commit -m "feat: add category-manager with CRUD and default seeding (TDD)"
```

---

### Task 3: Settings renderer — modal logic

**Files:**
- Create: `public/js/settings-renderer.js`
- Test: `__tests__/settings-renderer.test.js`

The settings renderer owns the settings modal DOM: opening/closing, rendering the Activities toggle, rendering the category list, and handling add/edit/delete category actions. It reads from `settings-manager.js` and `category-manager.js`.

- [ ] **Step 1: Write the test file**

```js
// __tests__/settings-renderer.test.js
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

import { initStorage, destroyStorage } from '../public/js/storage.js';
import { loadCategories, getCategories } from '../public/js/category-manager.js';
import { isActivitiesEnabled, setActivitiesEnabled } from '../public/js/settings-manager.js';
import {
    openSettingsModal,
    closeSettingsModal,
    renderSettingsContent,
    getSettingsModalElement
} from '../public/js/settings-renderer.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `settings-ui-${testDbCounter++}-${Date.now()}`;
}

function setupSettingsDOM() {
    // Minimal DOM for settings modal
    document.body.innerHTML = `
        <div id="settings-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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

beforeEach(async () => {
    setupSettingsDOM();
    localStorage.clear();
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

    describe('renderSettingsContent', () => {
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
            expect(categoryItems.length).toBe(getCategories().length);
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

        test('category color dots render with correct color', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const firstDot = document.querySelector('[data-category-key="work/deep"] .category-dot');
            expect(firstDot).not.toBeNull();
            expect(firstDot.style.backgroundColor).toBeTruthy();
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/settings-renderer.test.js --verbose`
Expected: FAIL - module not found

- [ ] **Step 3: Implement settings-renderer.js**

```js
// public/js/settings-renderer.js

import { isActivitiesEnabled, setActivitiesEnabled } from './settings-manager.js';
import { getCategories, getCategoryGroups, addCategory, updateCategory, deleteCategory } from './category-manager.js';
import { showToast } from './toast-manager.js';

/**
 * Get the settings modal element.
 * @returns {HTMLElement|null}
 */
export function getSettingsModalElement() {
    return document.getElementById('settings-modal');
}

/**
 * Open the settings modal.
 */
export function openSettingsModal() {
    const modal = getSettingsModalElement();
    if (modal) modal.classList.remove('hidden');
}

/**
 * Close the settings modal.
 */
export function closeSettingsModal() {
    const modal = getSettingsModalElement();
    if (modal) modal.classList.add('hidden');
}

/**
 * Render the full settings content into #settings-content.
 */
export function renderSettingsContent() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    const enabled = isActivitiesEnabled();

    container.innerHTML = `
        <div class="space-y-6">
            <!-- Activities Toggle -->
            <div class="flex items-center justify-between">
                <div>
                    <label for="activities-toggle" class="text-slate-200 font-medium">Enable Activities</label>
                    <p class="text-xs text-slate-400 mt-0.5">Track time spent and view insights</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="activities-toggle" class="sr-only peer" ${enabled ? 'checked' : ''} />
                    <div class="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                </label>
            </div>

            <!-- Reload Prompt (hidden until toggle changes) -->
            <div id="reload-prompt" class="hidden bg-slate-700/50 border border-slate-600 rounded-lg p-3 text-sm">
                <p class="text-slate-300 mb-2" id="reload-prompt-message"></p>
                <button id="reload-apply-btn" class="bg-teal-500 hover:bg-teal-400 text-white px-4 py-1.5 rounded-lg text-sm transition-colors">
                    Reload to Apply
                </button>
            </div>

            <!-- Category Management -->
            <div id="category-management-section" class="${enabled ? '' : 'hidden'}">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-slate-300 font-medium text-sm">Categories</h4>
                    <button id="add-category-btn" class="text-teal-400 hover:text-teal-300 text-sm flex items-center gap-1 transition-colors">
                        <i class="fa-solid fa-plus text-xs"></i> Add
                    </button>
                </div>
                <div id="category-list" class="space-y-1.5">
                    ${renderCategoryList()}
                </div>
                <!-- Add Category Form (hidden by default) -->
                <form id="add-category-form" class="hidden mt-3 space-y-2 bg-slate-700/30 rounded-lg p-3 border border-slate-600">
                    <input type="text" name="category-label" placeholder="Category label" class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm" required />
                    <div class="flex items-center gap-2">
                        <label class="text-slate-400 text-xs">Color</label>
                        <input type="color" name="category-color" value="#0ea5e9" class="h-8 w-8 rounded cursor-pointer bg-transparent border-0" />
                    </div>
                    <input type="text" name="category-group" placeholder="Group (e.g. work)" class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm" required />
                    <div class="flex gap-2 pt-1">
                        <button type="submit" class="bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">Save</button>
                        <button type="button" id="cancel-add-category" class="bg-slate-600 hover:bg-slate-500 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    wireSettingsEvents();
}

function renderCategoryList() {
    const groups = getCategoryGroups();
    let html = '';

    for (const [groupName, cats] of Object.entries(groups)) {
        html += `<div class="text-xs text-slate-500 uppercase tracking-wide mt-2 mb-1 first:mt-0">${groupName}</div>`;
        for (const cat of cats) {
            html += `
                <div data-category-key="${cat.key}" class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-700/30 transition-colors group">
                    <div class="flex items-center gap-2">
                        <span class="category-dot w-3 h-3 rounded-full inline-block" style="background-color: ${cat.color}"></span>
                        <span class="text-sm text-slate-200">${cat.label}</span>
                    </div>
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="btn-edit-category text-slate-400 hover:text-slate-200 p-1 text-xs" data-key="${cat.key}">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-delete-category text-slate-400 hover:text-rose-400 p-1 text-xs" data-key="${cat.key}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }
    }
    return html;
}

function wireSettingsEvents() {
    // Activities toggle
    const toggle = document.getElementById('activities-toggle');
    if (toggle) {
        toggle.addEventListener('change', () => {
            const newValue = toggle.checked;
            setActivitiesEnabled(newValue);

            const reloadPrompt = document.getElementById('reload-prompt');
            const message = document.getElementById('reload-prompt-message');
            const categorySection = document.getElementById('category-management-section');

            if (reloadPrompt) {
                reloadPrompt.classList.remove('hidden');
                if (message) {
                    message.textContent = newValue
                        ? 'Activities enabled. Category tracking and insights will be available after reload.'
                        : 'Activities disabled. Category and activity features will be hidden after reload.';
                }
            }

            if (categorySection) {
                if (newValue) {
                    categorySection.classList.remove('hidden');
                } else {
                    categorySection.classList.add('hidden');
                }
            }
        });
    }

    // Reload button
    const reloadBtn = document.getElementById('reload-apply-btn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }

    // Close modal
    const closeBtn = document.getElementById('close-settings-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettingsModal);
    }

    // Add category button
    const addBtn = document.getElementById('add-category-btn');
    const addForm = document.getElementById('add-category-form');
    if (addBtn && addForm) {
        addBtn.addEventListener('click', () => {
            addForm.classList.toggle('hidden');
        });
    }

    // Cancel add category
    const cancelAddBtn = document.getElementById('cancel-add-category');
    if (cancelAddBtn && addForm) {
        cancelAddBtn.addEventListener('click', () => {
            addForm.classList.add('hidden');
            addForm.reset();
        });
    }

    // Add category form submit
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(addForm);
            const label = formData.get('category-label')?.toString().trim();
            const color = formData.get('category-color')?.toString();
            const group = formData.get('category-group')?.toString().trim().toLowerCase();

            if (!label || !group) return;

            const key = group === label.toLowerCase() ? group : `${group}/${label.toLowerCase().replace(/\s+/g, '-')}`;

            try {
                await addCategory({ key, label, color, group });
                addForm.classList.add('hidden');
                addForm.reset();
                refreshCategoryList();
            } catch (err) {
                showToast(err.message || 'Failed to add category', { theme: 'rose' });
            }
        });
    }

    // Category edit/delete via event delegation
    const categoryList = document.getElementById('category-list');
    if (categoryList) {
        categoryList.addEventListener('click', async (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            const key = target.dataset.key;
            if (!key) return;

            if (target.classList.contains('btn-delete-category')) {
                try {
                    await deleteCategory(key);
                    refreshCategoryList();
                } catch (err) {
                    showToast(err.message || 'Failed to delete category', { theme: 'rose' });
                }
            }

            if (target.classList.contains('btn-edit-category')) {
                // Inline edit: replace the row with an edit form
                const row = categoryList.querySelector(`[data-category-key="${key}"]`);
                const cat = getCategories().find((c) => c.key === key);
                if (!row || !cat) return;

                row.innerHTML = `
                    <form class="flex items-center gap-2 w-full edit-category-form" data-key="${key}">
                        <input type="color" name="edit-color" value="${cat.color}" class="h-6 w-6 rounded cursor-pointer bg-transparent border-0" />
                        <input type="text" name="edit-label" value="${cat.label}" class="bg-slate-700 p-1 rounded text-sm border border-slate-600 focus:border-teal-400 focus:outline-none flex-1" />
                        <button type="submit" class="text-teal-400 hover:text-teal-300 p-1 text-xs"><i class="fa-solid fa-check"></i></button>
                        <button type="button" class="btn-cancel-edit-category text-slate-400 hover:text-slate-200 p-1 text-xs"><i class="fa-solid fa-xmark"></i></button>
                    </form>
                `;

                const editForm = row.querySelector('.edit-category-form');
                editForm.addEventListener('submit', async (ev) => {
                    ev.preventDefault();
                    const fd = new FormData(editForm);
                    const newLabel = fd.get('edit-label')?.toString().trim();
                    const newColor = fd.get('edit-color')?.toString();
                    if (newLabel) {
                        try {
                            await updateCategory(key, { label: newLabel, color: newColor });
                            refreshCategoryList();
                        } catch (err) {
                            showToast(err.message || 'Failed to update category', { theme: 'rose' });
                        }
                    }
                });

                const cancelBtn = row.querySelector('.btn-cancel-edit-category');
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => refreshCategoryList());
                }
            }
        });
    }
}

function refreshCategoryList() {
    const listEl = document.getElementById('category-list');
    if (listEl) {
        listEl.innerHTML = renderCategoryList();
    }
}

/**
 * Initialize settings modal event listeners (gear icon click).
 * Call once during app boot.
 * @param {Function} [onOpen] - Optional callback when modal opens (e.g. to call renderSettingsContent)
 */
export function initializeSettingsModalListeners(onOpen) {
    const gearBtn = document.getElementById('settings-gear-btn');
    if (gearBtn) {
        gearBtn.addEventListener('click', () => {
            if (onOpen) onOpen();
            openSettingsModal();
        });
    }

    // Close on backdrop click
    const modal = getSettingsModalElement();
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeSettingsModal();
            }
        });
    }

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = getSettingsModalElement();
            if (modal && !modal.classList.contains('hidden')) {
                closeSettingsModal();
            }
        }
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/settings-renderer.test.js --verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/settings-renderer.js __tests__/settings-renderer.test.js
git commit -m "feat: add settings-renderer with modal, toggle, and category list (TDD)"
```

---

## Chunk 2: HTML & Form Integration (Tasks 4-6)

### Task 4: Add settings gear icon and modal to index.html

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add gear icon button after the sync-status-indicator**

In `public/index.html`, find the `<div class="mt-2 flex items-center justify-center gap-2">` block (around line 78) that contains `room-code-badge` and `sync-status-indicator`. Add the gear icon button after the sync-status-indicator closing `</button>` tag (around line 95):

```html
                        <button
                            id="settings-gear-btn"
                            type="button"
                            class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs hover:bg-slate-700/50 transition-colors"
                            title="Settings"
                        >
                            <i class="fa-solid fa-gear text-slate-500 hover:text-slate-300 transition-colors"></i>
                        </button>
```

- [ ] **Step 2: Add settings modal before the closing `</div><!-- end #main-app -->` tag**

Add the settings modal markup before `<!-- end #main-app -->` and after the footer closing tag (after line 416). This follows the same pattern as the other modals (schedule-modal, gap-task-picker-modal):

```html
        <!-- Settings Modal -->
        <div
            id="settings-modal"
            class="hidden fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50"
        >
            <div class="bg-slate-800 border border-slate-700 p-6 rounded-lg max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-normal text-slate-200 flex items-center gap-2">
                        <i class="fa-solid fa-gear text-slate-400"></i>Settings
                    </h3>
                    <button
                        id="close-settings-modal"
                        class="text-slate-400 hover:text-slate-200 p-1"
                    >
                        <i class="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <div id="settings-content"></div>
            </div>
        </div>
```

- [ ] **Step 3: Add category dropdown to the task form**

In the task form, after the description input `<div class="mb-2 sm:mb-3">` block (around line 148), add a category dropdown row. This row will be hidden by default and shown only when Activities are enabled (controlled by JS at boot):

```html
                    <!-- Category dropdown (shown when Activities enabled) -->
                    <div id="category-dropdown-row" class="hidden mb-2 sm:mb-3">
                        <div class="flex items-center gap-2">
                            <span id="category-color-indicator" class="w-3 h-3 rounded-full bg-slate-500 shrink-0"></span>
                            <select
                                name="category"
                                id="category-select"
                                class="bg-slate-700 p-2 rounded-lg flex-1 border border-slate-600 focus:border-teal-400 focus:outline-none transition-all text-sm"
                            >
                                <option value="">No category</option>
                                <!-- Options populated by JS -->
                            </select>
                        </div>
                    </div>
```

- [ ] **Step 4: Verify the page loads without errors**

Open the app in a browser, confirm:
- Gear icon appears after sync indicator in header
- Clicking gear opens an empty settings modal (content not rendered yet at this point without boot wiring)
- Category dropdown row is hidden on the form
- No console errors

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: add settings gear icon, settings modal, and category dropdown to HTML"
```

---

### Task 5: Wire category dropdown population and form extraction

**Files:**
- Modify: `public/js/tasks/form-utils.js`

- [ ] **Step 1: Add category dropdown population helper to form-utils.js**

Add these functions to the end of `public/js/tasks/form-utils.js`:

```js
/**
 * Populates the category <select> dropdown with grouped options.
 * @param {HTMLSelectElement} selectElement
 * @param {Object<string, Array<{key: string, label: string}>>} groups - Grouped categories from getCategoryGroups()
 */
export function populateCategoryDropdown(selectElement, groups) {
    // Preserve current selection if any
    const currentValue = selectElement.value;

    // Remove all options except the first "No category" option
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    for (const [groupName, cats] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName.charAt(0).toUpperCase() + groupName.slice(1);
        for (const cat of cats) {
            const option = document.createElement('option');
            option.value = cat.key;
            option.textContent = cat.label;
            optgroup.appendChild(option);
        }
        selectElement.appendChild(optgroup);
    }

    // Restore selection if it still exists
    if (currentValue) {
        selectElement.value = currentValue;
    }
}
```

- [ ] **Step 2: Modify extractTaskFormData to include category**

In `public/js/tasks/form-utils.js`, find the `extractTaskFormData` function. After the line:

```js
    let taskData = { description, taskType };
```

Add:

```js
    const category = formData.get('category')?.toString() || null;
    if (category) {
        taskData.category = category;
    }
```

This works for both scheduled and unscheduled task types since the category dropdown sits above the type-specific fields.

- [ ] **Step 3: Add category color indicator listener to form-utils.js**

This lives in `form-utils.js` alongside `populateCategoryDropdown` so all category-form concerns are co-located (avoids adding a feature-module import to the general-purpose `dom-renderer.js`).

Add this import at the top of `public/js/tasks/form-utils.js`:

```js
import { getCategoryByKey } from '../category-manager.js';
```

Then add this exported function at the end of the file:

```js
/**
 * Update the category color indicator dot when the dropdown selection changes.
 */
export function initializeCategoryDropdownListener() {
    const select = document.getElementById('category-select');
    const dot = document.getElementById('category-color-indicator');
    if (!select || !dot) return;

    select.addEventListener('change', () => {
        const cat = getCategoryByKey(select.value);
        if (cat) {
            dot.style.backgroundColor = cat.color;
        } else {
            dot.style.backgroundColor = '#64748b'; // slate-500 default
        }
    });
}
```

- [ ] **Step 4: Add test for category extraction and run form-utils tests**

Add a new test to `__tests__/form-utils.test.js` in the `extractTaskFormData` describe block:

```js
test('extractTaskFormData includes category when set', () => {
    // Set up a category select in the form
    const form = document.getElementById('task-form');
    const categorySelect = document.createElement('select');
    categorySelect.name = 'category';
    const opt = document.createElement('option');
    opt.value = 'work/deep';
    opt.selected = true;
    categorySelect.appendChild(opt);
    form.appendChild(categorySelect);

    // Fill required fields
    form.querySelector('input[name="description"]').value = 'Test task';
    form.querySelector('input[name="start-time"]').value = '09:00';
    form.querySelector('input[name="duration-hours"]').value = '1';
    form.querySelector('input[name="duration-minutes"]').value = '0';

    const result = extractTaskFormData(form);
    expect(result).not.toBeNull();
    expect(result.category).toBe('work/deep');
});

test('extractTaskFormData omits category when empty', () => {
    const form = document.getElementById('task-form');
    form.querySelector('input[name="description"]').value = 'Test task';
    form.querySelector('input[name="start-time"]').value = '09:00';
    form.querySelector('input[name="duration-hours"]').value = '1';
    form.querySelector('input[name="duration-minutes"]').value = '0';

    const result = extractTaskFormData(form);
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('category');
});
```

Run: `npx jest __tests__/form-utils.test.js --verbose`
Expected: All tests PASS including the two new category tests

- [ ] **Step 5: Commit**

```bash
git add public/js/tasks/form-utils.js
git commit -m "feat: add category dropdown population, color indicator, and form extraction"
```

---

### Task 6: Category pill badges on rendered tasks

**Files:**
- Modify: `public/js/tasks/scheduled-renderer.js`
- Modify: `public/js/tasks/unscheduled-renderer.js`

Category pill badges are small colored pills that appear next to the task description. They look like: `<span class="category-badge ...">Deep Work</span>`.

- [ ] **Step 1: Import the shared badge helper**

The `renderCategoryBadge` function lives in `category-manager.js` (added in Task 2) so both renderers and the future activity renderer share a single implementation.

In `public/js/tasks/scheduled-renderer.js`, add near the top imports:

```js
import { renderCategoryBadge } from '../category-manager.js';
```

- [ ] **Step 2: Insert badge into scheduled task view-mode rendering**

In `scheduled-renderer.js`, find where the task description is rendered in view mode. Look for the `font-medium` div that shows `task.description`. After the description text, add:

```js
${renderCategoryBadge(task.category)}
```

The exact insertion point depends on the template literal structure. Find the description line and append the badge call right after it. For example, if the line is:

```js
<div class="font-medium">${task.description}</div>
```

Change to:

```js
<div class="font-medium flex items-center gap-2 flex-wrap">${task.description} ${renderCategoryBadge(task.category)}</div>
```

- [ ] **Step 3: Add the same badge to unscheduled task rendering**

In `public/js/tasks/unscheduled-renderer.js`, add the import:

```js
import { renderCategoryBadge } from '../category-manager.js';
```

Find the description rendering in the unscheduled task card. The unscheduled renderer uses a `.task-display-view` div with the task description inside. Look for where `task.description` appears in the template literal inside the `renderUnscheduledTasks` function. The description is typically in a `<span>` or `<div>` with a truncate/font-medium class. Add the badge call after it, following the same pattern as Step 2:

```js
${task.description} ${renderCategoryBadge(task.category)}
```

Wrap in a flex container if needed for alignment.

- [ ] **Step 4: Run existing renderer tests to verify no regressions**

Run: `npx jest __tests__/scheduled-task-renderer.test.js __tests__/unscheduled-task-renderer.test.js --verbose`
Expected: All existing tests PASS. Badge calls with undefined/null category return empty string, so no visual change for existing tasks.

- [ ] **Step 5: Commit**

```bash
git add public/js/tasks/scheduled-renderer.js public/js/tasks/unscheduled-renderer.js
git commit -m "feat: add category pill badges to scheduled and unscheduled task rendering"
```

---

## Chunk 3: Boot Wiring & Integration (Tasks 7-8)

### Task 7: Wire settings and categories into app boot

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: Add imports to app.js**

Add these imports at the top of `public/js/app.js`, after the existing imports:

```js
import { loadCategories, getCategoryGroups } from './category-manager.js';
import { isActivitiesEnabled } from './settings-manager.js';
import { initializeSettingsModalListeners, renderSettingsContent } from './settings-renderer.js';
import { populateCategoryDropdown, initializeCategoryDropdownListener } from './tasks/form-utils.js';
```

- [ ] **Step 2: Load categories after storage is prepared**

In the `initAndBootApp` function, after `await loadTasksIntoState();` add:

```js
    // Load categories from config doc (seeds defaults on first run)
    await loadCategories();
```

- [ ] **Step 3: Show category dropdown when Activities enabled**

After the existing form wiring (after the overlap warning setup block), add:

```js
    // Show category dropdown if Activities enabled
    if (isActivitiesEnabled()) {
        const categoryRow = document.getElementById('category-dropdown-row');
        const categorySelect = document.getElementById('category-select');
        if (categoryRow && categorySelect) {
            categoryRow.classList.remove('hidden');
            populateCategoryDropdown(categorySelect, getCategoryGroups());
            initializeCategoryDropdownListener();
        }
    }
```

- [ ] **Step 4: Initialize settings modal listeners**

In the `DOMContentLoaded` handler, after the sync-status-indicator click listener setup, add:

```js
    // Settings gear icon
    initializeSettingsModalListeners(() => {
        renderSettingsContent();
    });
```

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx jest --verbose`
Expected: All tests PASS. The new imports are conditional (category dropdown hidden by default, settings modal not opened in tests).

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js
git commit -m "feat: wire settings and category managers into app boot"
```

---

### Task 8: Integration testing and polish

**Files:**
- Modify: `__tests__/settings-renderer.test.js` (extend)
- Modify: `__tests__/test-utils.js` (add settings modal DOM)

- [ ] **Step 1: Add settings modal to test-utils.js DOM setup**

In `__tests__/test-utils.js`, in the `setupDOM()` function, add the settings modal markup inside the `#main-app` div (before the `</div>` that closes `#main-app`). Also add the gear button and category dropdown to the form:

After the sync-status-indicator button in the test DOM, add:
```html
        <button id="settings-gear-btn" type="button"><i class="fa-solid fa-gear"></i></button>
```

After the description input in the test form, add:
```html
        <div id="category-dropdown-row" class="hidden">
          <span id="category-color-indicator"></span>
          <select name="category" id="category-select">
            <option value="">No category</option>
          </select>
        </div>
```

After the custom-confirm-modal in the test DOM, add:
```html
      <div id="settings-modal" class="hidden">
        <div id="settings-content"></div>
        <button id="close-settings-modal"></button>
      </div>
```

- [ ] **Step 2: Add integration-level tests for settings flow**

Add to `__tests__/settings-renderer.test.js`:

```js
    describe('add category flow', () => {
        test('add category form creates new category and refreshes list', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const initialCount = document.querySelectorAll('[data-category-key]').length;

            // Show the add form
            const addBtn = document.getElementById('add-category-btn');
            addBtn.click();

            const form = document.getElementById('add-category-form');
            expect(form.classList.contains('hidden')).toBe(false);

            // Fill and submit
            form.querySelector('[name="category-label"]').value = 'Exercise';
            form.querySelector('[name="category-color"]').value = '#10b981';
            form.querySelector('[name="category-group"]').value = 'health';
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

            // Wait for async persist
            await new Promise((r) => setTimeout(r, 50));

            const newCount = document.querySelectorAll('[data-category-key]').length;
            expect(newCount).toBe(initialCount + 1);
        });
    });

    describe('delete category flow', () => {
        test('delete button removes category from list', async () => {
            setActivitiesEnabled(true);
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await loadCategories();
            renderSettingsContent();

            const initialCount = document.querySelectorAll('[data-category-key]').length;

            const deleteBtn = document.querySelector('.btn-delete-category');
            deleteBtn.click();

            await new Promise((r) => setTimeout(r, 50));

            const newCount = document.querySelectorAll('[data-category-key]').length;
            expect(newCount).toBe(initialCount - 1);
        });
    });
```

- [ ] **Step 3: Run the full test suite**

Run: `npx jest --verbose`
Expected: All tests PASS including new integration tests

- [ ] **Step 4: Run coverage check**

Run: `npx jest --coverage`
Expected: Coverage thresholds met (90/90/79 for statements/lines/branches)

- [ ] **Step 5: Manual smoke test**

Open the app in a browser and verify:
1. Gear icon visible in header
2. Click gear: settings modal opens with Activities toggle (off by default)
3. Toggle Activities on: category management section appears with 6 default categories
4. Reload prompt appears with "Reload to Apply" button
5. Click Reload: page reloads, Activities is now enabled
6. Task form now shows category dropdown with grouped options
7. Selecting a category updates the color dot
8. Create a task with a category: pill badge appears on the task
9. Settings modal: edit a category label/color, verify it updates
10. Settings modal: delete a category, verify it disappears
11. Settings modal: add a new category, verify it appears
12. Close modal with X button, backdrop click, or Escape key

- [ ] **Step 6: Commit**

```bash
git add __tests__/settings-renderer.test.js __tests__/test-utils.js
git commit -m "feat: add settings integration tests and test-utils DOM updates"
```

---

## Notes for the implementer

- **Keyboard shortcuts deferred:** The spec mentions "Add keyboard shortcuts for form modes if the UI is stable enough" in Phase 3. This plan intentionally defers keyboard shortcuts to Phase 5 or 6, when the third form mode (Activity) and the Insights tab toggle are in place. Adding shortcuts for only 2 modes now would need reworking when the 3rd arrives.
- **Renderer badge placement:** The exact insertion point for `renderCategoryBadge()` in each renderer depends on the current template literal structure. Search for the description rendering line and add the badge call adjacent to it. If the description is in a `<div class="font-medium">`, wrap it in a flex container.
- **Category dropdown in edit forms:** This phase does NOT add category dropdowns to the inline edit forms for scheduled or unscheduled tasks. That can come as a follow-up if needed. For now, categories are set at creation time.
- **`window.location.reload()` in tests:** The reload button calls `window.location.reload()`. Tests that trigger the toggle change event don't need to test the actual reload; just verify the prompt appears. If tests fail due to reload, mock `window.location.reload` as `jest.fn()`.
- **Unscheduled renderer structure:** You'll need to fetch `public/js/tasks/unscheduled-renderer.js` to find the exact description rendering location. It follows a similar pattern to the scheduled renderer.
- **Feature-off smoke test:** During manual testing (Task 8 Step 5), also verify the feature-off path: with Activities disabled, confirm no category dropdown appears on the task form and no badge rendering occurs on tasks.

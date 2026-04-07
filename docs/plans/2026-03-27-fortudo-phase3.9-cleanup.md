# Phase 3.9: Pre-Phase 4 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `category-manager.js` compatibility facade and migrate the Activities toggle from localStorage to a PouchDB config document, so the codebase is clean and settings sync across devices before Phase 4 lands.

**Architecture:** Two independent cleanup items. (1) Facade removal: move `renderCategoryBadge` into `taxonomy/taxonomy-selectors.js`, rewire all 9 import sites (5 source, 4 test) to import directly from taxonomy modules, then delete the facade. (2) Settings migration: rewrite `settings-manager.js` to use a PouchDB config doc with in-memory cache, add async `loadSettings()` to the boot sequence, and handle one-time localStorage migration.

**Tech Stack:** Vanilla JS ES modules, PouchDB (memory adapter in tests), Jest 30

---

## File Structure

**Chunk 1 — Facade Removal:**

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `public/js/taxonomy/taxonomy-selectors.js` | Add `renderCategoryBadge` + `escapeHtml` |
| Modify | `public/js/app.js` | Import `loadTaxonomy` from taxonomy-store instead of `loadCategories` from facade |
| Modify | `public/js/tasks/scheduled-renderer.js` | Import `renderCategoryBadge` from taxonomy-selectors instead of facade |
| Modify | `public/js/tasks/unscheduled-renderer.js` | Import `renderCategoryBadge` from taxonomy-selectors instead of facade |
| Modify | `public/js/tasks/form-utils.js` | Import `resolveCategoryKey` from taxonomy-selectors instead of facade |
| Modify | `public/js/settings/taxonomy-settings.js` | Split imports across taxonomy-selectors + taxonomy-mutations |
| Modify | `__tests__/taxonomy-selectors.test.js` | Add renderCategoryBadge tests, import `loadTaxonomy` from taxonomy-store |
| Modify | `__tests__/taxonomy-mutations.test.js` | Import `loadTaxonomy` from taxonomy-store instead of facade |
| Modify | `__tests__/form-utils.test.js` | Mock + import from taxonomy-selectors instead of facade |
| Modify | `__tests__/settings-renderer.test.js` | Import from taxonomy-store + taxonomy-selectors instead of facade |
| Delete | `public/js/category-manager.js` | Facade being removed |
| Delete | `__tests__/category-manager.test.js` | Tests for removed facade (coverage already in taxonomy test files) |

**Chunk 2 — Settings Migration:**

| Action | File | Responsibility |
|--------|------|----------------|
| Rewrite | `public/js/settings-manager.js` | PouchDB config doc + in-memory cache (was localStorage) |
| Rewrite | `__tests__/settings-manager.test.js` | PouchDB-backed tests with migration coverage |
| Modify | `public/js/app.js` | Add `loadSettings()` to boot sequence |
| Modify | `public/js/settings-renderer.js` | Make toggle handler async |
| Modify | `__tests__/settings-renderer.test.js` | Reorder setup for async setActivitiesEnabled |

---

## Chunk 1: Facade Removal

### Task 1: Move renderCategoryBadge to taxonomy-selectors.js

**Files:**
- Modify: `__tests__/taxonomy-selectors.test.js`
- Modify: `public/js/taxonomy/taxonomy-selectors.js`

- [ ] **Step 1: Add renderCategoryBadge test to taxonomy-selectors.test.js**

Add `renderCategoryBadge` to the existing import from `taxonomy-selectors.js`, then add this test at the end of the `describe` block:

```js
// In the import block, add renderCategoryBadge:
import {
    resolveCategoryKey,
    getSelectableCategoryOptions,
    getCategoryBadgeData,
    renderCategoryBadge
} from '../public/js/taxonomy/taxonomy-selectors.js';

// Add at end of describe('taxonomy-selectors', () => { ... }):

    test('renderCategoryBadge returns empty string for null or unknown keys', async () => {
        await initAndLoadTaxonomy();

        expect(renderCategoryBadge(null)).toBe('');
        expect(renderCategoryBadge('missing')).toBe('');
    });

    test('renderCategoryBadge renders group keys with label and dark theme styling', async () => {
        await initAndLoadTaxonomy();

        const badge = renderCategoryBadge('work');
        expect(badge).toContain('Work');
        expect(badge).toContain('color: #e2e8f0');
        expect(badge).toContain('background-color: rgba(15, 23, 42, 0.9)');
    });

    test('renderCategoryBadge renders child category keys with child label', async () => {
        await initAndLoadTaxonomy();

        const badge = renderCategoryBadge('work/deep');
        expect(badge).toContain('Deep Work');
        expect(badge).toContain('color: #e2e8f0');
    });

    test('renderCategoryBadge escapes HTML in labels', async () => {
        await initAndLoadTaxonomy();

        // Add a group with HTML in the label to test escaping
        const { addGroup } = await import('../public/js/taxonomy/taxonomy-mutations.js');
        await addGroup({ label: '<script>alert("xss")</script>', colorFamily: 'gray' });

        const badge = renderCategoryBadge('scriptalertxssscript');
        expect(badge).not.toContain('<script>');
        expect(badge).toContain('&lt;script&gt;');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/taxonomy-selectors.test.js --verbose`
Expected: FAIL — `renderCategoryBadge` is not exported from taxonomy-selectors.js

- [ ] **Step 3: Add renderCategoryBadge + escapeHtml to taxonomy-selectors.js**

Add at the end of `public/js/taxonomy/taxonomy-selectors.js`:

```js
export function renderCategoryBadge(categoryKey) {
    if (!categoryKey) {
        return '';
    }

    const badgeData = getCategoryBadgeData(categoryKey);
    if (!badgeData) {
        return '';
    }

    const safeLabel = escapeHtml(badgeData.label);
    const color = badgeData.color;

    return `<span class="category-badge inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs" style="background-color: rgba(15, 23, 42, 0.9); color: #e2e8f0; border: 1px solid ${color}55; box-shadow: inset 0 0 0 1px ${color}22;">
        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background-color: ${color}"></span>
        ${safeLabel}
    </span>`;
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/taxonomy-selectors.test.js --verbose`
Expected: PASS — all tests including the new renderCategoryBadge tests

- [ ] **Step 5: Commit**

```bash
git add public/js/taxonomy/taxonomy-selectors.js __tests__/taxonomy-selectors.test.js
git commit -m "feat: move renderCategoryBadge to taxonomy-selectors

Prepares for category-manager.js facade removal by moving
renderCategoryBadge and escapeHtml to their natural home alongside
getCategoryBadgeData."
```

---

### Task 2: Update source file imports from facade to taxonomy modules

**Files:**
- Modify: `public/js/app.js`
- Modify: `public/js/tasks/scheduled-renderer.js`
- Modify: `public/js/tasks/unscheduled-renderer.js`
- Modify: `public/js/tasks/form-utils.js`
- Modify: `public/js/settings/taxonomy-settings.js`

- [ ] **Step 1: Update app.js**

Replace the facade import:

```js
// OLD:
import { loadCategories } from './category-manager.js';

// NEW:
import { loadTaxonomy } from './taxonomy/taxonomy-store.js';
```

Update the call site in `initAndBootApp()`:

```js
// OLD:
    await loadCategories();

// NEW:
    await loadTaxonomy();
```

- [ ] **Step 2: Update scheduled-renderer.js**

Replace the facade import (line 15):

```js
// OLD:
import { renderCategoryBadge } from '../category-manager.js';

// NEW:
import { renderCategoryBadge } from '../taxonomy/taxonomy-selectors.js';
```

No other changes needed — the function signature and usage are identical.

- [ ] **Step 3: Update unscheduled-renderer.js**

Replace the facade import (line 3):

```js
// OLD:
import { renderCategoryBadge } from '../category-manager.js';

// NEW:
import { renderCategoryBadge } from '../taxonomy/taxonomy-selectors.js';
```

No other changes needed.

- [ ] **Step 4: Update form-utils.js**

Replace the facade import (line 13):

```js
// OLD:
import { resolveCategoryKey } from '../category-manager.js';

// NEW:
import { resolveCategoryKey } from '../taxonomy/taxonomy-selectors.js';
```

No other changes needed — `resolveCategoryKey` is used at lines 172 and 265, both unchanged.

- [ ] **Step 5: Update taxonomy-settings.js**

Replace the single facade import block with two imports from the actual modules. Also rename `getCategories` → `getTaxonomySnapshot` (the canonical function name):

```js
// OLD (lines 2-11):
import {
    getCategories,
    getSelectableCategoryOptions,
    addGroup,
    updateGroup,
    deleteGroup,
    addCategory,
    updateCategory,
    deleteCategory
} from '../category-manager.js';

// NEW:
import { getTaxonomySnapshot, getSelectableCategoryOptions } from '../taxonomy/taxonomy-selectors.js';
import {
    addGroup,
    updateGroup,
    deleteGroup,
    addCategory,
    updateCategory,
    deleteCategory
} from '../taxonomy/taxonomy-mutations.js';
```

Then find-and-replace `getCategories` → `getTaxonomySnapshot` at the 3 call sites:
- Line 98: `const { groups } = getCategories();` → `const { groups } = getTaxonomySnapshot();`
- Line 195: `const { groups, categories } = getCategories();` → `const { groups, categories } = getTaxonomySnapshot();`
- Line 286: `const { groups } = getCategories();` → `const { groups } = getTaxonomySnapshot();`

- [ ] **Step 6: Run all tests**

Run: `npx jest --verbose`
Expected: PASS — all tests pass. The facade is still present (tests import from it), but source files no longer use it.

- [ ] **Step 7: Commit**

```bash
git add public/js/app.js public/js/tasks/scheduled-renderer.js public/js/tasks/unscheduled-renderer.js public/js/tasks/form-utils.js public/js/settings/taxonomy-settings.js
git commit -m "refactor: rewire source imports from facade to taxonomy modules

All 5 source files now import directly from taxonomy-store,
taxonomy-selectors, or taxonomy-mutations. category-manager.js
is no longer imported by any production code."
```

---

### Task 3: Update test file imports from facade to taxonomy modules

**Files:**
- Modify: `__tests__/taxonomy-selectors.test.js`
- Modify: `__tests__/taxonomy-mutations.test.js`
- Modify: `__tests__/form-utils.test.js`
- Modify: `__tests__/settings-renderer.test.js`

- [ ] **Step 1: Update taxonomy-selectors.test.js**

Replace the facade import:

```js
// OLD (line 22):
import { loadCategories } from '../public/js/category-manager.js';

// NEW:
import { loadTaxonomy } from '../public/js/taxonomy/taxonomy-store.js';
```

Update the helper function:

```js
// OLD:
async function initAndLoadTaxonomy() {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadCategories();
}

// NEW:
async function initAndLoadTaxonomy() {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadTaxonomy();
}
```

- [ ] **Step 2: Update taxonomy-mutations.test.js**

Replace the facade import:

```js
// OLD (line 23):
import { loadCategories } from '../public/js/category-manager.js';

// NEW:
import { loadTaxonomy } from '../public/js/taxonomy/taxonomy-store.js';
```

Find-and-replace `loadCategories` → `loadTaxonomy` in the helper function and any call sites (line 41 and similar).

- [ ] **Step 3: Update form-utils.test.js**

Replace both the import and the mock:

```js
// OLD (line 22):
import { resolveCategoryKey } from '../public/js/category-manager.js';

// NEW:
import { resolveCategoryKey } from '../public/js/taxonomy/taxonomy-selectors.js';

// OLD (lines 30-32):
jest.mock('../public/js/category-manager.js', () => ({
    resolveCategoryKey: jest.fn()
}));

// NEW:
jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    resolveCategoryKey: jest.fn()
}));
```

- [ ] **Step 4: Update settings-renderer.test.js**

Replace the facade import:

```js
// OLD (line 26):
import { loadCategories, getGroupByKey, getCategoryByKey } from '../public/js/category-manager.js';

// NEW:
import { loadTaxonomy } from '../public/js/taxonomy/taxonomy-store.js';
import { getGroupByKey, getCategoryByKey } from '../public/js/taxonomy/taxonomy-selectors.js';
```

Find-and-replace `loadCategories` → `loadTaxonomy` throughout the file. Call sites are at lines 76, 173, 236, 245.

- [ ] **Step 5: Run all tests**

Run: `npx jest --verbose`
Expected: PASS — no test imports from `category-manager.js` remain.

- [ ] **Step 6: Commit**

```bash
git add __tests__/taxonomy-selectors.test.js __tests__/taxonomy-mutations.test.js __tests__/form-utils.test.js __tests__/settings-renderer.test.js
git commit -m "refactor: rewire test imports from facade to taxonomy modules

All 4 test files now import directly from taxonomy-store and
taxonomy-selectors. category-manager.js has zero remaining importers."
```

---

### Task 4: Delete the facade

**Files:**
- Delete: `public/js/category-manager.js`
- Delete: `__tests__/category-manager.test.js`

- [ ] **Step 1: Delete the facade and its test file**

```bash
rm public/js/category-manager.js __tests__/category-manager.test.js
```

- [ ] **Step 2: Run full test suite with coverage**

Run: `npx jest --coverage`
Expected: PASS — all tests pass, coverage thresholds met (90/90/90/79). The deleted facade's behavior is already covered by taxonomy-store.test.js, taxonomy-selectors.test.js, and taxonomy-mutations.test.js.

If coverage drops, check which lines lost coverage. The only unique function in the facade was `getCategoryGroups()` (dead code, not used by any source file) and `DEFAULT_CATEGORIES` (unused export). Neither needs replacement coverage.

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: PASS — no broken imports referencing the deleted file.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: delete category-manager.js facade

The facade re-exported taxonomy modules without meaningful abstraction.
All imports now go directly to taxonomy-store, taxonomy-selectors, or
taxonomy-mutations. getCategoryGroups (unused by source) and
DEFAULT_CATEGORIES (unused export) are removed as dead code."
```

---

## Chunk 2: Settings Migration (localStorage → PouchDB)

### Task 5: Write failing tests for PouchDB-backed settings-manager

**Files:**
- Rewrite: `__tests__/settings-manager.test.js`

- [ ] **Step 1: Rewrite settings-manager.test.js**

Replace the entire file with PouchDB-backed tests:

```js
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

import {
    initStorage,
    destroyStorage,
    loadConfig,
    putConfig
} from '../public/js/storage.js';
import {
    loadSettings,
    isActivitiesEnabled,
    setActivitiesEnabled,
    SETTINGS_CONFIG_ID
} from '../public/js/settings-manager.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `settings-room-${testDbCounter++}-${Date.now()}`;
}

async function initAndLoadSettings() {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadSettings();
}

afterEach(async () => {
    localStorage.clear();
    await destroyStorage();
});

describe('settings-manager', () => {
    test('loadSettings defaults to activities disabled when no config exists', async () => {
        await initAndLoadSettings();

        expect(isActivitiesEnabled()).toBe(false);
    });

    test('loadSettings reads activitiesEnabled from PouchDB config doc', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled: true });
        await loadSettings();

        expect(isActivitiesEnabled()).toBe(true);
    });

    test('loadSettings migrates from localStorage when no PouchDB config exists', async () => {
        localStorage.setItem('fortudo-activities-enabled', 'true');
        await initAndLoadSettings();

        expect(isActivitiesEnabled()).toBe(true);

        // Verify persisted to PouchDB
        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config).not.toBeNull();
        expect(config.activitiesEnabled).toBe(true);
    });

    test('loadSettings removes localStorage key after migration', async () => {
        localStorage.setItem('fortudo-activities-enabled', 'true');
        await initAndLoadSettings();

        expect(localStorage.getItem('fortudo-activities-enabled')).toBeNull();
    });

    test('loadSettings prefers PouchDB config over localStorage', async () => {
        localStorage.setItem('fortudo-activities-enabled', 'true');
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled: false });
        await loadSettings();

        expect(isActivitiesEnabled()).toBe(false);
    });

    test('isActivitiesEnabled returns cached value synchronously', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled: true });
        await loadSettings();

        // Synchronous read — no await needed
        const result = isActivitiesEnabled();
        expect(result).toBe(true);
        expect(typeof result).toBe('boolean');
    });

    test('setActivitiesEnabled updates cache and persists to PouchDB', async () => {
        await initAndLoadSettings();

        await setActivitiesEnabled(true);
        expect(isActivitiesEnabled()).toBe(true);

        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config.activitiesEnabled).toBe(true);
    });

    test('setActivitiesEnabled(false) after true updates both cache and PouchDB', async () => {
        await initAndLoadSettings();

        await setActivitiesEnabled(true);
        await setActivitiesEnabled(false);
        expect(isActivitiesEnabled()).toBe(false);

        const config = await loadConfig(SETTINGS_CONFIG_ID);
        expect(config.activitiesEnabled).toBe(false);
    });

    test('handles corrupted localStorage value gracefully during migration', async () => {
        localStorage.setItem('fortudo-activities-enabled', 'not-a-boolean');
        await initAndLoadSettings();

        expect(isActivitiesEnabled()).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npx jest __tests__/settings-manager.test.js --verbose`
Expected: FAIL — `loadSettings` and `SETTINGS_CONFIG_ID` are not exported from the current settings-manager.js, and `setActivitiesEnabled` is synchronous (doesn't return a Promise).

---

### Task 6: Implement PouchDB-backed settings-manager

**Files:**
- Rewrite: `public/js/settings-manager.js`

- [ ] **Step 1: Rewrite settings-manager.js**

Replace the entire file:

```js
import { loadConfig, putConfig } from './storage.js';

export const SETTINGS_CONFIG_ID = 'config-settings';
const LEGACY_STORAGE_KEY = 'fortudo-activities-enabled';

let activitiesEnabled = false;

/**
 * Load settings from PouchDB config doc, migrating from localStorage if needed.
 * Must be called after initStorage/prepareStorage and before any isActivitiesEnabled() check.
 */
export async function loadSettings() {
    const config = await loadConfig(SETTINGS_CONFIG_ID);
    if (config) {
        activitiesEnabled = !!config.activitiesEnabled;
        return;
    }

    // One-time migration from localStorage (clean up legacy key regardless of value)
    if (typeof localStorage !== 'undefined') {
        const legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        if (legacyValue === 'true') {
            activitiesEnabled = true;
            await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled: true });
            return;
        }
    }

    activitiesEnabled = false;
}

/**
 * Check whether the Activities feature is enabled.
 * Synchronous: reads from in-memory cache populated by loadSettings().
 * @returns {boolean}
 */
export function isActivitiesEnabled() {
    return activitiesEnabled;
}

/**
 * Enable or disable the Activities feature.
 * Updates in-memory cache immediately and persists to PouchDB.
 * @param {boolean} enabled
 */
export async function setActivitiesEnabled(enabled) {
    activitiesEnabled = !!enabled;
    await putConfig({ id: SETTINGS_CONFIG_ID, activitiesEnabled: activitiesEnabled });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest __tests__/settings-manager.test.js --verbose`
Expected: PASS — all 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add public/js/settings-manager.js __tests__/settings-manager.test.js
git commit -m "feat: migrate Activities toggle from localStorage to PouchDB

Settings now sync across devices sharing a room via PouchDB replication.
isActivitiesEnabled() stays synchronous via in-memory cache populated
by loadSettings() at boot. One-time migration from localStorage on
first load after update."
```

---

### Task 7: Wire loadSettings into boot sequence and update callers

**Files:**
- Modify: `public/js/app.js`
- Modify: `public/js/settings-renderer.js`
- Modify: `__tests__/settings-renderer.test.js`

- [ ] **Step 1: Update app.js boot sequence**

Add `loadSettings` to the import from settings-manager:

```js
// OLD:
import { isActivitiesEnabled } from './settings-manager.js';

// NEW:
import { isActivitiesEnabled, loadSettings } from './settings-manager.js';
```

Add `await loadSettings()` to `initAndBootApp()`, right after `prepareStorage` and before `loadTasksIntoState`:

```js
    // Initialize storage (with optional CouchDB sync)
    const couchDbUrl = COUCHDB_URL || null;
    const storageRoomCode = getStorageRoomCode(roomCode);
    const remoteUrl = couchDbUrl ? `${couchDbUrl}/fortudo-${storageRoomCode}` : null;
    await prepareStorage(storageRoomCode, {}, remoteUrl);

    // Load settings from PouchDB (must be before any isActivitiesEnabled check)
    await loadSettings();

    // Load and initialize state
    await loadTasksIntoState();
    await loadTaxonomy();
```

- [ ] **Step 2: Update settings-renderer.js toggle handler**

In `wireSettingsEvents()`, make the toggle handler async so `setActivitiesEnabled` can be awaited:

```js
// OLD:
    if (toggle) {
        toggle.onchange = () => {
            const newValue = toggle.checked;
            setActivitiesEnabled(newValue);

// NEW:
    if (toggle) {
        toggle.onchange = async () => {
            const newValue = toggle.checked;
            await setActivitiesEnabled(newValue);
```

No other changes needed — the rest of the handler (reload prompt, taxonomy section toggle) runs after the await.

- [ ] **Step 3: Update settings-renderer.test.js setup**

The `renderEnabledSettings` helper currently calls `setActivitiesEnabled(true)` before `initStorage`. After migration, storage must be initialized first (since setActivitiesEnabled now writes to PouchDB):

```js
// OLD:
async function renderEnabledSettings(options = {}) {
    setActivitiesEnabled(true);
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadTaxonomy();
    renderSettingsContent(options);
}

// NEW:
async function renderEnabledSettings(options = {}) {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await setActivitiesEnabled(true);
    await loadTaxonomy();
    renderSettingsContent(options);
}
```

Note: by this point in the plan, `loadCategories` has already been renamed to `loadTaxonomy` in Chunk 1 Task 3 Step 4.

Also check for any other bare `setActivitiesEnabled(...)` calls in the test file that need `await`. The current file has `setActivitiesEnabled(true)` at line 74 inside the helper — that's the one above. If there are other call sites, add `await` to each.

- [ ] **Step 4: Run all tests**

Run: `npx jest --verbose`
Expected: PASS — all tests pass including settings-manager, settings-renderer, and app tests.

- [ ] **Step 5: Commit**

```bash
git add public/js/app.js public/js/settings-renderer.js __tests__/settings-renderer.test.js
git commit -m "feat: wire loadSettings into boot and update callers

loadSettings() runs after prepareStorage and before any
isActivitiesEnabled check. Toggle handler in settings-renderer
now awaits setActivitiesEnabled for reliable persistence."
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite with coverage**

Run: `npx jest --coverage`
Expected: PASS — all tests pass, thresholds met (90% statements, 90% lines, 90% functions, 79% branches).

- [ ] **Step 2: Run linter and formatter**

Run: `npm run lint && npm run format:check`
Expected: PASS — no lint errors, no formatting issues.

- [ ] **Step 3: Smoke test locally (manual)**

1. Start the app: `python -m http.server 8080 --directory public`
2. Open http://localhost:8080, enter a room code
3. Open Settings (gear icon), verify Activities toggle works
4. Toggle Activities on → "Reload to Apply" appears → reload
5. Verify category dropdown shows on task form
6. Toggle Activities off → reload → verify category dropdown hidden
7. Open a second browser tab with the same room code → verify toggle state synced

- [ ] **Step 4: Commit any final adjustments**

If Steps 1-2 required fixes, commit them:

```bash
git add -u
git commit -m "chore: fix lint/coverage issues from Phase 3.9 cleanup"
```

If no fixes were needed, skip this step.

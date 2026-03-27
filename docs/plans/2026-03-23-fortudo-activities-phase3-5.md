# Phase 3.5: Group Taxonomy & Color Families Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade activities taxonomy so groups are selectable categories, groups can exist without children, and child colors can inherit from a group color family while remaining editable.

**Architecture:** Add a focused color-family utility module and evolve `category-manager.js` from a flat category list into a split taxonomy manager with schema-aware loading, migration, and deletion safety. Refactor the settings modal to manage groups and child categories separately, then update the task form and badge rendering to resolve both group keys and child keys while refreshing live UI after taxonomy edits.

**Tech Stack:** Vanilla JS/ES modules, PouchDB config persistence via `storage.js`, Tailwind CSS, Font Awesome, Jest + jsdom.

**Spec reference:** `docs/plans/2026-03-23-fortudo-activities-phase3-5-design.md`

---

## File Structure

```
public/js/
  category-colors.js            (CREATE) - color family registry, family membership checks, color picking helpers
  category-manager.js           (MODIFY) - schema v3.5 loading, migration, groups/categories CRUD, dropdown + badge resolution
  settings-renderer.js          (MODIFY) - explicit groups/categories UI, group family editing, category color linking
  app.js                        (MODIFY) - boot taxonomy with live refresh callback wiring
public/
  index.html                    (MODIFY) - ensure settings modal + category selector mount points exist in production DOM
  js/tasks/add-handler.js       (MODIFY) - preserve selected taxonomy keys through add/reset flows
  js/tasks/form-utils.js        (MODIFY) - flattened selectable dropdown rendering + stale-key validation
  js/tasks/manager.js           (MODIFY) - keep group/child category keys intact in created task objects
  js/tasks/scheduled-renderer.js   (MODIFY) - render badges for group and child keys through new resolver
  js/tasks/unscheduled-renderer.js (MODIFY) - render badges for group and child keys through new resolver

__tests__/
  category-colors.test.js            (CREATE)
  category-manager.test.js           (MODIFY heavily)
  settings-renderer.test.js          (MODIFY heavily)
  add-task-handler.test.js           (MODIFY)
  form-utils.test.js                 (MODIFY)
  app.test.js                        (MODIFY)
  scheduled-task-renderer.test.js    (MODIFY)
  unscheduled-task-renderer.test.js  (MODIFY)
  integration.test.js                (MODIFY)
  task-management.test.js            (MODIFY if task storage assumptions change)
  test-utils.js                      (MODIFY shared DOM fixtures if needed)
```

## Implementation Notes

- Keep `task.category` as a single stored key. Do not add a second task field.
- Introduce `schemaVersion: '3.5'` to taxonomy config docs so missing vs legacy vs v3.5 loading is deterministic.
- Preserve stable keys after creation in phase 3.5. Group/category edits update labels and colors only.
- Block deleting referenced groups/categories instead of trying to recategorize tasks in this phase.
- Validate selected taxonomy keys before persisting tasks. Invalid or stale keys should fail with a user-visible error instead of being silently dropped.
- `public/js/category-manager.js`, `public/js/settings-renderer.js`, and `initializeSettingsModalListeners()` already exist from phase 3; phase 3.5 extends those entry points rather than introducing a second parallel settings stack.

---

## Task 1: Add Color Family Utilities

**Files:**
- Create: `public/js/category-colors.js`
- Test: `__tests__/category-colors.test.js`

- [ ] **Step 1: Write the failing color utility tests**

```js
/**
 * @jest-environment jsdom
 */

import {
    COLOR_FAMILIES,
    getFamilyBaseColor,
    pickLinkedChildColor,
    isColorInFamily,
    normalizeFamilyName
} from '../public/js/category-colors.js';

describe('category-colors', () => {
    test('normalizeFamilyName accepts known families and falls back to blue', () => {
        expect(normalizeFamilyName('green')).toBe('green');
        expect(normalizeFamilyName('unknown')).toBe('blue');
    });

    test('getFamilyBaseColor returns a concrete color from the family', () => {
        expect(COLOR_FAMILIES.blue).toContain(getFamilyBaseColor('blue'));
    });

    test('pickLinkedChildColor returns a family variation', () => {
        const color = pickLinkedChildColor('amber', 0);
        expect(COLOR_FAMILIES.amber).toContain(color);
    });

    test('pickLinkedChildColor varies by index but stays deterministic', () => {
        expect(pickLinkedChildColor('rose', 1)).toBe(pickLinkedChildColor('rose', 1));
        expect(pickLinkedChildColor('rose', 1)).not.toBe(pickLinkedChildColor('rose', 2));
    });

    test('isColorInFamily detects whether a concrete color belongs to the family', () => {
        expect(isColorInFamily('blue', COLOR_FAMILIES.blue[0])).toBe(true);
        expect(isColorInFamily('blue', '#22c55e')).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd jest __tests__/category-colors.test.js --runInBand`
Expected: FAIL with module-not-found errors for `category-colors.js`

- [ ] **Step 3: Implement the minimal color utility module**

```js
// public/js/category-colors.js
export const COLOR_FAMILIES = Object.freeze({
    blue: ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa'],
    green: ['#15803d', '#16a34a', '#22c55e', '#4ade80'],
    amber: ['#b45309', '#d97706', '#f59e0b', '#fbbf24'],
    rose: ['#be123c', '#e11d48', '#f43f5e', '#fb7185']
});

export function normalizeFamilyName(familyName) {
    return COLOR_FAMILIES[familyName] ? familyName : 'blue';
}

export function getFamilyBaseColor(familyName) {
    const family = COLOR_FAMILIES[normalizeFamilyName(familyName)];
    return family[1] || family[0];
}

export function pickLinkedChildColor(familyName, index = 0) {
    const family = COLOR_FAMILIES[normalizeFamilyName(familyName)];
    return family[index % family.length];
}

export function isColorInFamily(familyName, color) {
    const family = COLOR_FAMILIES[normalizeFamilyName(familyName)];
    return family.includes(color.toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd jest __tests__/category-colors.test.js --runInBand`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/category-colors.js __tests__/category-colors.test.js
git commit -m "feat: add category color family utilities"
```

---

## Task 2: Upgrade Taxonomy Persistence, Migration, and Safety Rules

**Files:**
- Modify: `public/js/category-manager.js`
- Test: `__tests__/category-manager.test.js`

- [ ] **Step 1: Replace the old flat-category tests with schema v3.5 tests**

Include tests for:

```js
test('seeds split taxonomy defaults for missing config doc', async () => {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await loadCategories();

    const taxonomy = getCategories();
    expect(taxonomy.groups.map((group) => group.key)).toEqual(['work', 'personal', 'break']);
    expect(taxonomy.categories.map((category) => category.key)).toEqual([
        'work/deep',
        'work/meetings',
        'work/comms',
        'work/admin'
    ]);
});

test('loads existing schemaVersion 3.5 config as-is even when arrays are empty', async () => {
    await putConfig({ id: 'config-categories', schemaVersion: '3.5', groups: [], categories: [] });
    await loadCategories();

    expect(getCategories().groups).toEqual([]);
    expect(getCategories().categories).toEqual([]);
});

test('reseeds canonical defaults for legacy docs with missing or empty categories', async () => {
    await putConfig({ id: 'config-categories', categories: [] });
    await loadCategories();

    expect(getCategories().groups.map((group) => group.key)).toEqual(['work', 'personal', 'break']);
    expect(getCategories().categories.map((category) => category.key)).toEqual([
        'work/deep',
        'work/meetings',
        'work/comms',
        'work/admin'
    ]);
});

test('migrates legacy standalone rows where key equals group into group records', async () => {
    await putConfig({
        id: 'config-categories',
        categories: [
            { key: 'personal', label: 'Personal', color: '#ec4899', group: 'personal' },
            { key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' }
        ]
    });
    await loadCategories();

    expect(getGroupByKey('personal')?.label).toBe('Personal');
    expect(getCategoryByKey('personal')).toBeNull();
    expect(getCategoryByKey('work/deep')?.groupKey).toBe('work');
});

test('deleteGroup blocks when a child category still belongs to it', async () => {
    await expect(deleteGroup('work')).rejects.toThrow('still has child categories');
});

test('deleteCategory blocks when tasks reference the key', async () => {
    await expect(deleteCategory('work/deep')).rejects.toThrow('referenced by tasks');
});

test('resolveCategoryKey returns group metadata for group keys and child metadata for child keys', async () => {
    expect(resolveCategoryKey('work').kind).toBe('group');
    expect(resolveCategoryKey('work/deep').kind).toBe('category');
});

test('getSelectableCategoryOptions returns groups followed by indented children', async () => {
    const options = getSelectableCategoryOptions();
    expect(options[0]).toEqual({ value: 'work', label: 'Work', indentLevel: 0 });
    expect(options.some((entry) => entry.value === 'work/deep' && entry.indentLevel === 1)).toBe(true);
});

test('updateGroup family cascades only to linked children', async () => {
    const linkedBefore = getCategoryByKey('work/deep').color;
    await updateCategory('work/deep', { color: '#22c55e' }); // should unlink
    await updateGroup('work', { colorFamily: 'amber' });

    expect(getGroupByKey('work').colorFamily).toBe('amber');
    expect(getCategoryByKey('work/meetings').color).not.toBe(linkedBefore);
    expect(getCategoryByKey('work/deep').color).toBe('#22c55e');
});

test('editing an unlinked child back into the family re-links it', async () => {
    await updateCategory('work/deep', { color: '#22c55e' });
    await updateCategory('work/deep', { color: COLOR_FAMILIES.blue[0] });

    expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd jest __tests__/category-manager.test.js --runInBand`
Expected: FAIL because the current manager exports flat categories and lacks group APIs

- [ ] **Step 3: Implement schema-aware taxonomy loading and CRUD in `category-manager.js`**

Add or update exports along these lines:

```js
export const TAXONOMY_CONFIG_ID = 'config-categories';
export const TAXONOMY_SCHEMA_VERSION = '3.5';

export function getCategories() {
    return {
        groups: groups.map((group) => ({ ...group })),
        categories: categories.map((category) => ({ ...category }))
    };
}

export function getGroupByKey(key) { /* ... */ }
export function getCategoryByKey(key) { /* ... */ }
export function resolveCategoryKey(key) { /* returns { kind, record } or null */ }
export function getSelectableCategoryOptions() { /* ordered groups + children */ }
export async function addGroup(input) { /* slugify name, fail on collision */ }
export async function updateGroup(key, updates) { /* label/family only, cascade linked children */ }
export async function deleteGroup(key) { /* block if children or referenced tasks */ }
export async function addCategory(input) { /* create child key `${groupKey}/${slug}` */ }
export async function updateCategory(key, updates) { /* label/color only; relink by family membership */ }
export async function deleteCategory(key) { /* block if referenced by tasks */ }
export function renderCategoryBadge(categoryKey) { /* group or child */ }
```

Implementation requirements:

- maintain separate `groups` and `categories` module state
- write `schemaVersion: '3.5'` when persisting
- for `loadCategories()`:
  - missing doc => seed defaults
  - legacy doc with missing/empty `categories` => seed defaults
  - legacy doc without `schemaVersion` => migrate
  - v3.5 doc => load as-is
- treat malformed v3.5 docs missing arrays as empty arrays, not as legacy docs
- during legacy migration:
  - `key === group` rows become group records
  - `key !== group` rows become child records
  - create one group record per distinct group string
  - set migrated child `isLinkedToGroupFamily = true` only when the preserved child color still belongs to the inferred family; otherwise preserve the color and set `isLinkedToGroupFamily = false`
- use `loadTasks()` from `storage.js` for delete-reference checks so safety rules do not depend on DOM state

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd jest __tests__/category-manager.test.js --runInBand`
Expected: PASS

- [ ] **Step 5: Run focused migration + storage regression coverage**

Run: `npx.cmd jest __tests__/category-manager.test.js __tests__/storage-config.test.js --runInBand`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/js/category-manager.js __tests__/category-manager.test.js
git commit -m "feat: add phase 3.5 taxonomy manager and migration"
```

---

## Task 3: Refactor Settings UI for Explicit Groups and Linked Children

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/settings-renderer.js`
- Test: `__tests__/settings-renderer.test.js`
- Modify: `__tests__/test-utils.js` if shared settings fixtures are missing required DOM nodes

- [ ] **Step 1: Add failing settings renderer tests for the new UI flows**

Add tests for:

```js
test('renders groups and child categories in separate sections', async () => {
    renderSettingsContent({ onTaxonomyChanged: jest.fn() });
    expect(document.getElementById('groups-list')).not.toBeNull();
    expect(document.getElementById('categories-list')).not.toBeNull();
});

test('group add form creates a standalone selectable group', async () => {
    // fill Group name + Color family, submit
    expect(getGroupByKey('health')).not.toBeNull();
});

test('group edit form changes family and refreshes linked children', async () => {
    // edit work -> amber
    expect(getGroupByKey('work').colorFamily).toBe('amber');
    expect(getCategoryByKey('work/meetings').color).toBe(COLOR_FAMILIES.amber[1]);
});

test('category add form requires a parent group', async () => {
    // blank parent group -> no create
});

test('editing child color outside family unlinks the child', async () => {
    await saveEditedCategoryColor('work/deep', '#22c55e');
    expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(false);
});

test('editing child color back into family relinks the child', async () => {
    await saveEditedCategoryColor('work/deep', COLOR_FAMILIES.blue[0]);
    expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(true);
});

test('taxonomy changes call onTaxonomyChanged callback', async () => {
    const onTaxonomyChanged = jest.fn();
    renderSettingsContent({ onTaxonomyChanged });
    // create group or category
    expect(onTaxonomyChanged).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd jest __tests__/settings-renderer.test.js --runInBand`
Expected: FAIL because the current settings UI only supports a flat category list

- [ ] **Step 3: Refactor `settings-renderer.js` to the split group/category UI**

Before touching renderer logic, make sure production and test DOM scaffolding exists:

```html
<!-- public/index.html -->
<button id="settings-gear-btn" type="button">...</button>
<div id="settings-modal" class="hidden ...">
  <button id="close-settings-modal" type="button">...</button>
  <div id="settings-content"></div>
</div>

<div id="category-dropdown-row" class="hidden ...">
  <span id="category-color-indicator"></span>
  <select id="category-select" name="category">
    <option value="">No category</option>
  </select>
</div>
```

Mirror the same IDs in `__tests__/test-utils.js` if the shared integration fixture does not already include them.

Implementation outline:

```js
export function renderSettingsContent(options = {}) {
    const { onTaxonomyChanged } = options;
    // render groups section, categories section, add/edit forms
    // pass onTaxonomyChanged into event wiring
}

function refreshSettingsLists() {
    // rerender groups and categories from current taxonomy state
}

async function applyAndRefresh(asyncOperation, onTaxonomyChanged) {
    await asyncOperation();
    refreshSettingsLists();
    onTaxonomyChanged?.();
}
```

UI requirements:

- separate `Groups` and `Categories` sections
- group create/edit forms include `Group name` and `Color family`
- category create form includes `Category name` and `Parent group`
- category edit form includes `Category name` and concrete color only
- display linked/unlinked badge text on child rows
- use `showToast(..., { theme: 'rose' })` for validation/storage errors
- no parent-group move UI for children in phase 3.5
- settings modal open/close wiring in `public/index.html` must still match the IDs expected by `app.js`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd jest __tests__/settings-renderer.test.js --runInBand`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/settings-renderer.js __tests__/settings-renderer.test.js __tests__/test-utils.js
git commit -m "feat: add phase 3.5 groups and linked category settings ui"
```

---

## Task 4: Update Task Dropdown, Live Refresh, and Badge Resolution

**Files:**
- Modify: `public/js/app.js`
- Modify: `public/js/tasks/form-utils.js`
- Modify: `public/js/tasks/add-handler.js`
- Modify: `public/js/tasks/manager.js`
- Modify: `public/js/tasks/scheduled-renderer.js`
- Modify: `public/js/tasks/unscheduled-renderer.js`
- Modify: `__tests__/form-utils.test.js`
- Modify: `__tests__/add-task-handler.test.js`
- Modify: `__tests__/app.test.js`
- Modify: `__tests__/scheduled-task-renderer.test.js`
- Modify: `__tests__/unscheduled-task-renderer.test.js`
- Modify: `__tests__/integration.test.js`
- Modify: `__tests__/test-utils.js` if fixture markup needs new IDs

- [ ] **Step 1: Write failing tests for flattened dropdown options**

Add tests like:

```js
test('populateCategoryDropdown renders a group option followed by indented children', () => {
    populateCategoryDropdown(select, [
        { value: 'work', label: 'Work', indentLevel: 0 },
        { value: 'work/deep', label: 'Deep Work', indentLevel: 1 }
    ]);

    expect(select.options[1].value).toBe('work');
    expect(select.options[2].textContent).toContain('Deep Work');
});

test('populateCategoryDropdown preserves a selected key when still present', () => {
    select.value = 'work/deep';
    populateCategoryDropdown(select, nextOptions);
    expect(select.value).toBe('work/deep');
});
```

- [ ] **Step 2: Write failing renderer/app tests for group keys and live refresh**

Add tests for:

```js
test('scheduled task badge resolves a group key', () => {
    task.category = 'work';
    expect(renderedBadge.textContent).toContain('Work');
});

test('unscheduled task badge resolves a child key', () => {
    task.category = 'work/deep';
    expect(renderedBadge.textContent).toContain('Deep Work');
});

test('opening settings and changing taxonomy refreshes the add-task dropdown', async () => {
    // add a group/category in settings
    expect(document.getElementById('category-select').querySelector('option[value="health"]')).not.toBeNull();
});
```

- [ ] **Step 3: Run focused tests to verify they fail**

Run: `npx.cmd jest __tests__/form-utils.test.js __tests__/add-task-handler.test.js __tests__/app.test.js __tests__/scheduled-task-renderer.test.js __tests__/unscheduled-task-renderer.test.js --runInBand`
Expected: FAIL because the current dropdown API and badge resolver only understand flat categories

- [ ] **Step 4: Update `tasks/form-utils.js` to accept flattened options**

Use a signature like:

```js
export function populateCategoryDropdown(selectElement, options) {
    const currentValue = selectElement.value;
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    for (const optionData of options) {
        const option = document.createElement('option');
        option.value = optionData.value;
        option.textContent =
            optionData.indentLevel > 0
                ? `${'  '.repeat(optionData.indentLevel)}${optionData.label}`
                : optionData.label;
        selectElement.appendChild(option);
    }

    if (currentValue && Array.from(selectElement.options).some((option) => option.value === currentValue)) {
        selectElement.value = currentValue;
    }
}
```

Also tighten task extraction validation:

```js
const categoryKey = formData.get('category')?.toString() || null;
if (categoryKey && !resolveCategoryKey(categoryKey)) {
    showAlert('Selected category is no longer available.', getThemeForTaskType(taskType));
    return null;
}
```

This prevents stale dropdown keys from being silently dropped.

- [ ] **Step 5: Ensure the selected taxonomy key persists through the add-task flow**

Update:

- `extractTaskFormData()` to keep a valid selected group or child key
- `handleAddTaskProcess()` to pass the selected key through create/reset flows without clearing it prematurely
- `createTaskObject()` / `addTask()` expectations in `public/js/tasks/manager.js` so `task.category` remains unchanged for either key type

Minimum regression tests:

```js
test('extractTaskFormData returns a valid group key', () => {
    expect(result.category).toBe('work');
});

test('extractTaskFormData rejects stale keys no longer present in taxonomy', () => {
    expect(result).toBeNull();
});

test('handleAddTaskProcess preserves a selected child category on the created task', async () => {
    expect(getTaskState()[0].category).toBe('work/deep');
});

test('handleAddTaskProcess preserves a selected group category on the created task', async () => {
    expect(getTaskState()[0].category).toBe('work');
});
```

Implementation path checklist:

- `extractTaskFormData()` validates the submitted key with `resolveCategoryKey()`
- `handleAddTaskProcess()` forwards the validated key into task creation and only resets the selector after success
- `createTaskObject()` preserves `category` on the returned task payload
- `addTask()` stores the provided `task.category` unchanged for both scheduled and unscheduled tasks

- [ ] **Step 6: Update `app.js` to refresh taxonomy-driven UI live**

When wiring settings modal open:

```js
initializeSettingsModalListeners(() => {
    renderSettingsContent({
        onTaxonomyChanged: () => {
            const categorySelect = document.getElementById('category-select');
            if (categorySelect instanceof HTMLSelectElement) {
                populateCategoryDropdown(categorySelect, getSelectableCategoryOptions());
                categorySelect.dispatchEvent(new Event('change'));
            }
            refreshUI();
        }
    });
});
```

Also update boot-time dropdown population to use `getSelectableCategoryOptions()`.

Make sure the category color indicator path also resolves group keys correctly so selecting `work` shows the group color and selecting `work/deep` shows the child color.

- [ ] **Step 7: Keep badge rendering path shared**

Do not duplicate taxonomy resolution in renderers. Keep:

```js
${renderCategoryBadge(task.category)}
```

but ensure `renderCategoryBadge()` now resolves group and child keys correctly.

- [ ] **Step 8: Run focused tests to verify they pass**

Run: `npx.cmd jest __tests__/form-utils.test.js __tests__/add-task-handler.test.js __tests__/app.test.js __tests__/scheduled-task-renderer.test.js __tests__/unscheduled-task-renderer.test.js --runInBand`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add public/js/app.js public/js/tasks/form-utils.js public/js/tasks/add-handler.js public/js/tasks/manager.js public/js/tasks/scheduled-renderer.js public/js/tasks/unscheduled-renderer.js __tests__/form-utils.test.js __tests__/add-task-handler.test.js __tests__/app.test.js __tests__/scheduled-task-renderer.test.js __tests__/unscheduled-task-renderer.test.js __tests__/test-utils.js
git commit -m "feat: wire phase 3.5 taxonomy into dropdowns and badges"
```

---

## Task 5: Add Integration Coverage and Final Verification

**Files:**
- Modify: `__tests__/integration.test.js`
- Modify: `__tests__/task-management.test.js` if task creation expectations need group-key coverage

- [ ] **Step 1: Add end-to-end taxonomy behavior tests**

Add tests for:

```js
test('user can add a task using a group key directly', async () => {
    // select 'work', submit task, assert stored category === 'work'
});

test('user can add a task using a child category key', async () => {
    // select 'work/deep', submit task, assert stored category === 'work/deep'
});

test('changing a group family in settings updates linked child badges without reload', async () => {
    // create task with linked child, edit group family, assert rendered badge color/label refreshes
});

test('deleting a referenced group or category shows an error and leaves taxonomy intact', async () => {
    // attempt delete, expect toast and unchanged option list
});

test('fresh install seeds canonical phase 3.5 taxonomy', async () => {
    // init empty storage, boot app, assert dropdown shows:
    // work
    //   work/deep
    //   work/meetings
    //   work/comms
    //   work/admin
    // personal
    // break
});
```

- [ ] **Step 2: Run the targeted integration tests to verify they fail**

Run: `npx.cmd jest __tests__/integration.test.js --runInBand`
Expected: FAIL on missing phase 3.5 UI behavior

- [ ] **Step 3: Implement only the missing glue needed to satisfy the new tests**

Likely minimal follow-up changes:

- ensure settings errors surface through `showToast`
- ensure dropdown refresh runs after both group and category edits
- ensure test fixtures include the updated settings modal DOM

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npx.cmd jest __tests__/integration.test.js __tests__/task-management.test.js --runInBand`
Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `npm.cmd test -- --runInBand`
Expected: PASS

Run: `npm.cmd test -- --coverage --runInBand`
Expected: PASS and remain above repo thresholds

Run: `npm.cmd run check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add __tests__/integration.test.js __tests__/task-management.test.js
git commit -m "test: cover phase 3.5 taxonomy interactions"
```

---

## Execution Notes

- Do not introduce parent-group moves or key renames for child categories.
- Do not add insights UI in this phase.
- Prefer blocking invalid delete operations over auto-migration of tasks.
- Keep new helpers small and focused. `category-colors.js` should remain pure and side-effect free.

## Ready State

Implementation is complete when:

- groups are first-class selectable keys
- groups can exist without child categories
- linked child colors follow group family changes
- out-of-family child colors unlink and can re-link automatically
- the settings modal manages groups and children separately
- the add-task dropdown lists groups first and indented children below
- deleting referenced groups/categories is blocked
- full tests, coverage, and lint/format checks pass

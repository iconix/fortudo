# Phase 3.7: Taxonomy Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the phase 3/3.5 taxonomy implementation into smaller, explicit modules so groups/categories remain easy to evolve for phase 4 insights without changing user-visible behavior.

**Architecture:** Keep the current taxonomy data model and UX semantics, but split the implementation only where the current files are genuinely overloaded: taxonomy persistence/migration, pure selectors/query helpers, mutation operations, and one extracted taxonomy-settings module under the existing settings shell. The refactor should preserve the existing config schema and task storage shape while reducing cross-module coupling without introducing unnecessary architectural layers for a small vanilla-JS app.

**Tech Stack:** Vanilla JS/ES modules, PouchDB config persistence via `storage.js`, Tailwind CSS, Font Awesome, Jest + jsdom.

**Spec reference:** `docs/plans/2026-03-23-fortudo-activities-phase3-5-design.md`

---

## File Structure

```
public/js/
  category-manager.js                 (MODIFY) - temporary compatibility shim during migration to focused taxonomy modules
  category-colors.js                  (KEEP) - family registry and color-family helpers
  settings-renderer.js                (MODIFY heavily) - thin settings shell + modal entry point
  app.js                              (MODIFY lightly) - remain orchestration-only; use at most a tiny private bridge during migration

  taxonomy/
    taxonomy-store.js                 (CREATE) - module state, load/persist, migration/normalization
    taxonomy-selectors.js             (CREATE) - pure read-model helpers for groups/categories/options/badges
    taxonomy-mutations.js             (CREATE) - add/update/delete operations with validation and cascade rules

  settings/
    taxonomy-settings.js              (CREATE) - taxonomy section markup, event binding, and draft preservation under one focused module

  js/tasks/
    form-utils.js                     (MODIFY) - consume selector output instead of taxonomy internals
    scheduled-renderer.js             (MODIFY lightly) - badge rendering stays on shared taxonomy selector path
    unscheduled-renderer.js           (MODIFY lightly) - badge rendering stays on shared taxonomy selector path

__tests__/
  taxonomy-store.test.js                    (CREATE)
  taxonomy-selectors.test.js                (CREATE)
  taxonomy-mutations.test.js                (CREATE)
  category-manager.test.js                  (MODIFY) - reduce to facade + compatibility coverage
  settings-renderer.test.js                 (MODIFY) - settings shell plus extracted taxonomy-settings coverage
  form-utils.test.js                        (MODIFY lightly)
  scheduled-task-renderer.test.js           (MODIFY lightly if badge selectors change)
  unscheduled-task-renderer.test.js         (MODIFY lightly if badge selectors change)
  app.test.js                               (MODIFY) - verify wiring through local taxonomy refresh helper
  integration.test.js                       (KEEP/VERIFY) - behavior parity coverage
```

## Refactor Rules

- Preserve current user-visible behavior from phases 3 and 3.5.
- Preserve task storage as a single `task.category` key.
- Preserve the existing taxonomy config schema (`schemaVersion: '3.5'`) and migration behavior.
- Do not change stable keys, seeded defaults, or deletion safety semantics in this phase.
- Prefer moving logic over rewriting it. The point is clearer boundaries and better test seams, not new behavior.
- Keep `app.js` as an orchestrator. New taxonomy UI refresh logic should live outside it; any private helper left in `app.js` must stay as a tiny call-through, not a new logic home.

## Target Architecture

### 1. Persistence and Migration

`taxonomy-store.js` owns:

- canonical in-memory taxonomy state
- loading persisted config
- normalizing malformed saved docs
- migrating legacy phase 3 docs into the phase 3.5 schema
- persisting the current taxonomy document

This module should not render UI or build dropdown/badge view models.

### 2. Selectors

`taxonomy-selectors.js` owns pure read helpers such as:

- `getTaxonomySnapshot()`
- `getGroupByKey()`
- `getCategoryByKey()`
- `resolveCategoryKey()`
- `getSelectableCategoryOptions()`
- `getCategoryBadgeData()`

These helpers should read current taxonomy state and return derived shapes without mutating anything. Keep this surface minimal; do not preserve overlapping helpers unless a real consumer still needs them after the refactor.

### 3. Mutations

`taxonomy-mutations.js` owns:

- `addGroup()`
- `updateGroup()`
- `deleteGroup()`
- `addCategory()`
- `updateCategory()`
- `deleteCategory()`

This module should enforce validation, linked-child cascade behavior, and delete-reference safety while delegating persistence to `taxonomy-store.js`.

### 4. Settings Taxonomy UI

Split the current `settings-renderer.js` responsibilities:

- `settings-renderer.js`: modal shell, activities toggle shell, entry points
- `settings/taxonomy-settings.js`: taxonomy section rendering, taxonomy-specific DOM events, and draft capture/restore

This keeps the settings refactor meaningful without oversplitting one modal workflow into several tiny files.

### 5. Main App Taxonomy Refresh

The main app still needs one explicit taxonomy refresh path for:

- refresh add-task dropdown options
- refresh category color indicator
- refresh scheduled/unscheduled task badges
- refresh active-task/gap visuals if taxonomy color changes affect them

That refresh contract should be explicit, but it should not turn `app.js` into the long-term home for taxonomy refresh behavior. Use at most a tiny private bridge in `app.js` while moving the actual refresh behavior behind existing focused modules.

---

## Task 1: Lock Down Current Behavior With Refactor Guard Tests

**Files:**
- Create: `__tests__/taxonomy-selectors.test.js`
- Modify: `__tests__/integration.test.js`
- Modify: `__tests__/app.test.js`

- [ ] **Step 1: Add failing selector tests that codify the current taxonomy read model**

Add tests like:

```js
test('resolveCategoryKey distinguishes group keys from child keys', async () => {
    await loadCategories();

    expect(resolveCategoryKey('work')).toMatchObject({
        kind: 'group',
        record: expect.objectContaining({ key: 'work', label: 'Work' })
    });
    expect(resolveCategoryKey('work/deep')).toMatchObject({
        kind: 'category',
        record: expect.objectContaining({ key: 'work/deep', groupKey: 'work' })
    });
});

test('getSelectableCategoryOptions returns groups followed by indented child options', async () => {
    await loadCategories();

    expect(getSelectableCategoryOptions()).toEqual([
        expect.objectContaining({ value: 'work', indentLevel: 0 }),
        expect.objectContaining({ value: 'work/deep', indentLevel: 1 }),
        expect.objectContaining({ value: 'work/meetings', indentLevel: 1 })
    ]);
});

test('getCategoryBadgeData returns null for missing keys', async () => {
    await loadCategories();
    expect(getCategoryBadgeData('missing')).toBeNull();
});
```

- [ ] **Step 2: Add failing app tests for an explicit taxonomy refresh helper**

Add tests like:

```js
test('app refreshTaxonomyUI updates the add-task dropdown and preserves a valid selection', async () => {
    categorySelect.value = 'work/deep';
    refreshTaxonomyUI();
    expect(categorySelect.value).toBe('work/deep');
});

test('app refreshTaxonomyUI rerenders visible task badges after a family change', async () => {
    await updateGroup('work', { colorFamily: 'amber' });
    refreshTaxonomyUI();
    expect(document.querySelector('.category-badge').textContent).toContain('Deep Work');
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npm.cmd test -- --runInBand __tests__/taxonomy-selectors.test.js __tests__/app.test.js`
Expected: FAIL because the new selector and app refresh seams do not exist yet.

- [ ] **Step 4: Expand integration parity coverage if any current behavior is still implicit**

Before refactoring internals further, add any missing tests for:

- settings taxonomy edits reflecting in the main task form without reload
- group and child badges rendering through the shared path
- delete safety for referenced groups/categories

Run: `npm.cmd test -- --runInBand __tests__/integration.test.js`
Expected: PASS after adding only parity assertions; no production changes yet.

- [ ] **Step 5: Commit**

```bash
git add __tests__/taxonomy-selectors.test.js __tests__/integration.test.js __tests__/app.test.js
git commit -m "test: lock phase 3.5 taxonomy behavior for refactor"
```

---

## Task 2: Extract Taxonomy Store and Selector Layer

**Files:**
- Create: `public/js/taxonomy/taxonomy-store.js`
- Create: `public/js/taxonomy/taxonomy-selectors.js`
- Modify: `public/js/category-manager.js`
- Create: `__tests__/taxonomy-store.test.js`
- Modify: `__tests__/category-manager.test.js`
- Modify: `__tests__/taxonomy-selectors.test.js`

- [ ] **Step 1: Write failing taxonomy store tests for schema handling and migration**

Add tests like:

```js
test('loadTaxonomy seeds defaults when config doc is missing', async () => {
    await loadTaxonomy();
    expect(getTaxonomyState().groups.map((group) => group.key)).toEqual(['work', 'personal', 'break']);
});

test('loadTaxonomy preserves empty schemaVersion 3.5 arrays', async () => {
    await putConfig({ id: 'config-categories', schemaVersion: '3.5', groups: [], categories: [] });
    await loadTaxonomy();
    expect(getTaxonomyState()).toEqual({ groups: [], categories: [] });
});

test('loadTaxonomy migrates legacy rows into split group/category records', async () => {
    await putConfig({
        id: 'config-categories',
        categories: [{ key: 'personal', label: 'Personal', color: '#ec4899', group: 'personal' }]
    });
    await loadTaxonomy();
    expect(getTaxonomyState().groups[0]).toEqual(expect.objectContaining({ key: 'personal' }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- --runInBand __tests__/taxonomy-store.test.js __tests__/category-manager.test.js`
Expected: FAIL with missing module/export errors.

- [ ] **Step 3: Implement taxonomy constants and store**

Create focused APIs along these lines:

```js
// taxonomy-store.js
export const TAXONOMY_CONFIG_ID = 'config-categories';
export const TAXONOMY_SCHEMA_VERSION = '3.5';
export const DEFAULT_GROUP_DEFINITIONS = [/* current defaults */];
export const DEFAULT_CHILD_CATEGORY_DEFINITIONS = [/* current defaults */];
export async function loadTaxonomy() { /* load/migrate/normalize */ }
export function getTaxonomyState() { /* deep-cloned snapshot */ }
export function replaceTaxonomyState(nextState) { /* normalize + persist */ }
export async function persistTaxonomyState() { /* write config doc */ }
```

Implementation requirements:

- keep module-private canonical state
- move schema detection/migration/normalization out of `category-manager.js`
- normalize malformed `groups`/`categories` arrays in saved v3.5 docs
- preserve seeded defaults and legacy migration behavior exactly

- [ ] **Step 4: Implement pure selectors**

Create `taxonomy-selectors.js` with pure read helpers:

```js
export function getTaxonomySnapshot() { /* state snapshot */ }
export function getGroupByKey(key) { /* read-only lookup */ }
export function getCategoryByKey(key) { /* read-only lookup */ }
export function resolveCategoryKey(key) { /* group/category discriminated result */ }
export function getSelectableCategoryOptions() { /* flattened ordered options */ }
export function getCategoryBadgeData(key) { /* label + color + kind or null */ }
```

Do not carry over redundant selector APIs just to preserve old structure. If `getCategoryGroups()` or an HTML-producing `renderCategoryBadge()` has no clear consumer after the refactor, remove it instead of rehoming it.

- [ ] **Step 5: Reduce `category-manager.js` to a compatibility facade**

Keep existing public imports stable where possible:

```js
export { loadTaxonomy as loadCategories } from './taxonomy/taxonomy-store.js';
export {
    getTaxonomySnapshot as getCategories,
    getGroupByKey,
    getCategoryByKey,
    resolveCategoryKey,
    getSelectableCategoryOptions,
    getCategoryBadgeData
} from './taxonomy/taxonomy-selectors.js';
```

If any current API names cannot map cleanly, keep the minimum wrapper functions needed in `category-manager.js` while the migration is in progress. The end state should be simpler call sites, not a permanent facade layer.

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `npm.cmd test -- --runInBand __tests__/taxonomy-store.test.js __tests__/taxonomy-selectors.test.js __tests__/category-manager.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add public/js/taxonomy/taxonomy-store.js public/js/taxonomy/taxonomy-selectors.js public/js/category-manager.js __tests__/taxonomy-store.test.js __tests__/taxonomy-selectors.test.js __tests__/category-manager.test.js
git commit -m "refactor: extract taxonomy store and selectors"
```

---

## Task 3: Extract Taxonomy Mutations From Category Manager

**Files:**
- Create: `public/js/taxonomy/taxonomy-mutations.js`
- Modify: `public/js/category-manager.js`
- Create: `__tests__/taxonomy-mutations.test.js`
- Modify: `__tests__/category-manager.test.js`

- [ ] **Step 1: Write failing mutation tests for current behavior**

Add tests for:

```js
test('updateGroup cascades family changes only to linked children', async () => {
    await loadCategories();
    await updateCategory('work/deep', { color: '#22c55e' });
    await updateGroup('work', { colorFamily: 'amber' });

    expect(getCategoryByKey('work/deep').color).toBe('#22c55e');
    expect(getCategoryByKey('work/meetings').color).toMatch(/^#/);
});

test('deleteGroup blocks when tasks reference the group key', async () => {
    await expect(deleteGroup('work')).rejects.toThrow('referenced by tasks');
});

test('editing a child color back into the family relinks the child', async () => {
    await updateCategory('work/deep', { color: '#22c55e' });
    await updateCategory('work/deep', { color: COLOR_FAMILIES.blue[0] });
    expect(getCategoryByKey('work/deep').isLinkedToGroupFamily).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- --runInBand __tests__/taxonomy-mutations.test.js`
Expected: FAIL because mutation functions are not exported from the new module yet.

- [ ] **Step 3: Implement `taxonomy-mutations.js`**

Move validation and mutation logic out of `category-manager.js`:

```js
export async function addGroup(input) { /* validate, mutate state, persist */ }
export async function updateGroup(key, updates) { /* relabel/family cascade */ }
export async function deleteGroup(key) { /* child/task safety checks */ }
export async function addCategory(input) { /* group-bound child creation */ }
export async function updateCategory(key, updates) { /* relabel/recolor/relink */ }
export async function deleteCategory(key) { /* task reference safety */ }
```

Implementation requirements:

- delegate state reads/writes through `taxonomy-store.js`
- keep delete safety checks using persisted tasks from `storage.js`
- keep key stability rules unchanged
- keep linked/unlinked family behavior unchanged

- [ ] **Step 4: Re-export mutation APIs through `category-manager.js`**

Current call sites should continue to work without broad churn:

```js
export {
    addGroup,
    updateGroup,
    deleteGroup,
    addCategory,
    updateCategory,
    deleteCategory
} from './taxonomy/taxonomy-mutations.js';
```

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `npm.cmd test -- --runInBand __tests__/taxonomy-mutations.test.js __tests__/category-manager.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/js/taxonomy/taxonomy-mutations.js public/js/category-manager.js __tests__/taxonomy-mutations.test.js __tests__/category-manager.test.js
git commit -m "refactor: extract taxonomy mutation operations"
```

---

## Task 4: Extract One Focused Taxonomy Settings Module

**Files:**
- Create: `public/js/settings/taxonomy-settings.js`
- Modify: `public/js/settings-renderer.js`
- Modify: `__tests__/settings-renderer.test.js`

- [ ] **Step 1: Write failing tests that pin the extracted taxonomy settings flows**

Add tests for:

```js
test('renderSettingsContent still renders activities toggle and taxonomy section shell', async () => {
    renderSettingsContent({ onTaxonomyChanged: jest.fn() });
    expect(document.getElementById('activities-toggle')).not.toBeNull();
    expect(document.getElementById('taxonomy-management-section')).not.toBeNull();
});

test('taxonomy settings preserves add-group draft state across rerenders', async () => {
    // open add-group form, type values, trigger rerender, assert values restored
});

test('taxonomy settings closes edit state on successful save and calls onTaxonomyChanged', async () => {
    // edit group or category, submit, assert callback called
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- --runInBand __tests__/settings-renderer.test.js`
Expected: FAIL because the extracted taxonomy-settings seam does not exist yet.

- [ ] **Step 3: Extract one focused `taxonomy-settings.js` module**

Create one module with APIs along these lines:

```js
export function renderTaxonomyManagementContent(viewState) { /* groups + categories markup */ }
export function bindTaxonomySettingsEvents(options) { /* add/edit/delete flows */ }
export function refreshTaxonomySettingsSection(options) { /* rerender taxonomy section and restore drafts */ }
```

Responsibilities:

- own view-state flags like add/edit visibility
- coordinate add/update/delete flows
- call mutation APIs
- rerender taxonomy section
- preserve drafts across section refreshes
- invoke `onTaxonomyChanged` after successful mutations

- [ ] **Step 4: Shrink `settings-renderer.js` to shell responsibilities**

Keep:

- modal open/close
- activities toggle shell
- reload prompt shell
- settings modal listener bootstrapping
- handoff into the extracted taxonomy settings helpers

Remove:

- taxonomy row markup generation
- taxonomy-specific event binding
- taxonomy draft preservation internals

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `npm.cmd test -- --runInBand __tests__/settings-renderer.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/js/settings/taxonomy-settings.js public/js/settings-renderer.js __tests__/settings-renderer.test.js
git commit -m "refactor: extract taxonomy settings module"
```

---

## Task 5: Thin App Wiring Around an Explicit Taxonomy Refresh Path

**Files:**
- Modify: `public/js/app.js`
- Modify: `public/js/tasks/form-utils.js`
- Modify: `public/js/tasks/scheduled-renderer.js`
- Modify: `public/js/tasks/unscheduled-renderer.js`
- Modify: `__tests__/app.test.js`
- Modify: `__tests__/form-utils.test.js`

- [ ] **Step 1: Write failing tests for the taxonomy refresh path through visible UI effects**

Add tests like:

```js
test('taxonomy changes repopulate dropdown options from selector output', async () => {
    // trigger a taxonomy change through the settings path
    expect(document.querySelector('#category-select option[value=\"work/deep\"]')).not.toBeNull();
});

test('settings taxonomy changes rerender visible badges without exposing app internals', async () => {
    // mutate taxonomy through UI and assert badge/dropdown DOM updates
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- --runInBand __tests__/app.test.js __tests__/form-utils.test.js`
Expected: FAIL because taxonomy-change effects are not yet routed through one clear refresh path.

- [ ] **Step 3: Implement the refresh path with `app.js` limited to a tiny bridge**

If needed, keep only a short private bridge in `app.js`:

```js
function refreshTaxonomyUI() {
    // call existing focused module APIs only
}
```

Concrete responsibilities:

- keep real taxonomy refresh behavior in focused modules rather than inside `app.js`
- if a private bridge remains in `app.js`, it should only sequence existing APIs
- avoid resetting unrelated form draft state
- keep the bridge private; test it through visible DOM effects, not exports/spies

- [ ] **Step 4: Keep `app.js` orchestration-only around that refresh path**

Replace manual inline callback bodies with:

```js
initializeSettingsModalListeners(() => {
    renderSettingsContent({
        onTaxonomyChanged: () => {
            refreshTaxonomyUI();
        }
    });
});
```

- [ ] **Step 5: Keep renderers and form utils on shared selector outputs**

Do not reintroduce taxonomy internals into task modules.

- `form-utils.js` should consume flattened selectable options
- renderers should resolve badge presentation via selectors/shared helpers only
- if the refresh sequence grows beyond a tiny bridge, move it into an existing focused module instead of expanding `app.js`

- [ ] **Step 6: Run focused tests to verify they pass**

Run: `npm.cmd test -- --runInBand __tests__/app.test.js __tests__/form-utils.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add public/js/app.js public/js/tasks/form-utils.js public/js/tasks/scheduled-renderer.js public/js/tasks/unscheduled-renderer.js __tests__/app.test.js __tests__/form-utils.test.js
git commit -m "refactor: simplify taxonomy refresh wiring"
```

---

## Task 6: Final Compatibility Pass and Full Verification

**Files:**
- Modify: `__tests__/integration.test.js` as needed for parity assertions only
- Modify: `__tests__/scheduled-task-renderer.test.js` if selector seams changed
- Modify: `__tests__/unscheduled-task-renderer.test.js` if selector seams changed
- Modify: `__tests__/category-manager.test.js` for any remaining facade expectations

- [ ] **Step 1: Run compatibility-focused test batch**

Run: `npm.cmd test -- --runInBand __tests__/integration.test.js __tests__/category-manager.test.js __tests__/scheduled-task-renderer.test.js __tests__/unscheduled-task-renderer.test.js`
Expected: PASS or reveal any missed parity regression.

- [ ] **Step 2: Fix only compatibility regressions**

Allowed fixes:

- temporary compatibility wrappers in `category-manager.js` while imports are migrated
- stale import paths in existing consumers
- selector/helper bugs that change current phase 3.5 behavior

Not allowed:

- changing UX semantics
- changing schema shape
- leaving redundant compatibility layers in place without a consumer

- [ ] **Step 3: Run full verification**

Run: `npm.cmd test -- --runInBand`
Expected: PASS

Run: `npm.cmd test -- --coverage --runInBand`
Expected: PASS and remain above repo thresholds

Run: `npm.cmd run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add public/js/category-manager.js public/js/settings-renderer.js public/js/app.js public/js/taxonomy public/js/settings __tests__
git commit -m "refactor: stabilize taxonomy architecture for phase 4"
```

---

## Execution Notes

- Favor wrappers and re-exports to keep the refactor incremental.
- Remove transitional wrappers from `category-manager.js` when the remaining consumers no longer need them.
- If extracting `settings/taxonomy-settings.js` reveals a very small leftover shell, that is acceptable. The goal is clearer ownership, not maximizing file count.
- Preserve all current ids and DOM hooks used by integration tests unless there is a strong reason to rename them.

## Ready State

Implementation is complete when:

- taxonomy persistence/migration lives outside `category-manager.js`
- pure selectors are separated from mutation logic
- mutation operations are isolated and independently tested
- selector helpers are minimal and non-overlapping
- `settings-renderer.js` is reduced to shell responsibilities
- taxonomy-specific settings logic is moved into one focused module under the shell
- `app.js` remains orchestration-only and contains at most a tiny private bridge for taxonomy refresh
- `category-manager.js` is removed entirely or reduced to negligible compatibility glue by the end of the refactor
- phase 3/3.5 user-visible behavior remains unchanged
- full tests, coverage, and lint/format checks pass

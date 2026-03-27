# Fortudo Activities Phase 3.5 Design

## Goal

Extend phase 3 category management so groups become first-class selectable categories, groups can exist without child categories, and each group owns a color family that can drive linked child colors while still allowing child-level color overrides.

## Why Phase 3.5 Exists

Phase 3 introduced flat categories with a `group` string primarily used for organization. That model is not enough for the next UX and insights requirements:

- a group itself must be selectable as a task category
- a group must be allowed to exist without any child categories
- child categories should inherit a color family from their group
- child categories should still store and expose an editable concrete color
- insights later need to understand that child categories still roll up to their parent group

This is a data-model and behavior refinement on top of phase 3, not a brand new subsystem.

## User Requirements

### Confirmed Requirements

- A group is its own category key, distinct from its child categories.
- A group can exist with no child categories.
- In insights, child categories still belong to their parent group.
- Each group has a color family, such as `blue`.
- New child categories should receive a concrete color variation from the group family.
- Children should store their own concrete color because users can edit it.
- A child stays linked to the group family if its edited concrete color is still inside that family.
- A child becomes unlinked if its edited concrete color moves outside the family.
- An unlinked child should re-link automatically if its edited color moves back into the family.
- When a group family changes, linked children update but unlinked children keep their exact color.
- In the task form dropdown, the group itself appears as a selectable top-level option and children appear indented beneath it.
- The group should appear only once in the dropdown, not as both a header and an option.
- Groups and child categories should be explicitly different concepts in the settings UI.

### UX Intent

The UI should remain compact and elegant despite the richer model. The user should not need to reason about internal inheritance mechanics unless they are actively editing colors.

## Recommended Approach

Use explicit `group` and `category` records in the config document, with child categories carrying both a concrete color and an inheritance flag.

This is preferred over continuing with a single flat record type because it makes the requested behavior explicit instead of inferring structure from string keys. It also gives the insights phase a cleaner hierarchy to aggregate later.

## Data Model

Persist a single config document for activities taxonomy, but split the payload into two arrays.

```js
{
    id: 'config-categories',
    schemaVersion: '3.5',
    groups: [
        {
            key: 'work',
            label: 'Work',
            colorFamily: 'blue',
            color: '#2563eb'
        }
    ],
    categories: [
        {
            key: 'work/deep',
            label: 'Deep Work',
            groupKey: 'work',
            color: '#1d4ed8',
            isLinkedToGroupFamily: true
        }
    ]
}
```

### Group Record

- `key`: stable identifier, also the selectable task category key for the group itself
- `label`: display name
- `colorFamily`: symbolic family name such as `blue`, `green`, `amber`, `rose`
- `color`: the concrete display color currently representing the group itself

### Child Category Record

- `key`: stable identifier, typically `<groupKey>/<slug>`
- `label`: display name
- `groupKey`: foreign key to parent group
- `color`: concrete stored child color
- `isLinkedToGroupFamily`: whether group family changes should continue to update this child

### Task Storage

Tasks continue to store only one selected key in `task.category`.

That key may now refer to either:

- a group key such as `work`
- a child category key such as `work/deep`

Resolver helpers must determine whether the selected key maps to a group or a child category when rendering badges and, later, computing insights.

## Color Family Model

### Family Representation

Introduce a small fixed palette registry in code, for example:

```js
const COLOR_FAMILIES = {
    blue: ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa'],
    green: ['#15803d', '#16a34a', '#22c55e', '#4ade80'],
    amber: ['#b45309', '#d97706', '#f59e0b', '#fbbf24'],
    rose: ['#be123c', '#e11d48', '#f43f5e', '#fb7185']
};
```

The exact palette can be adjusted for the app’s visual style, but the implementation should use named families rather than unrestricted color generation.

### Group Color

Each group gets a concrete `color` from the selected family. This color is used:

- for the group’s own badge and dropdown indicator
- in the settings UI

### Child Color Assignment

When creating a child category:

- choose a concrete color variation from the parent group’s family
- store that concrete color on the child
- set `isLinkedToGroupFamily: true`

The variation does not need to be cryptographically random. It only needs to feel varied and reasonably well distributed within the family. A simple deterministic or pseudo-random picker is acceptable.

## Linking and Unlinking Rules

### Child Creation

New children start linked.

### Child Color Edit

When a child color is edited:

- if the new color still belongs to the parent group’s family, keep `isLinkedToGroupFamily: true`
- if the new color is outside the parent group’s family, set `isLinkedToGroupFamily: false`

### Child Re-Linking

If an unlinked child is later edited to a color that belongs to the parent family again:

- set `isLinkedToGroupFamily: true`

### Group Family Change

When a group family changes:

- update the group’s own concrete `color`
- update every child with `isLinkedToGroupFamily === true`
- do not modify any child with `isLinkedToGroupFamily === false`

The child update may preserve rough variation ordering if convenient, but that is not required for phase 3.5. The simpler acceptable rule is to pick a valid family variation for each linked child.

## Category and Group Management Rules

### Group Creation

A user can create a group without creating any child categories.

### Category Creation

A child category must belong to an existing group.

### Group Deletion

For safety, phase 3.5 should block deleting a group if either of these are true:

- it still has child categories
- it is referenced by any task, directly or indirectly through child categories

This avoids orphaning tasks and avoids needing migration UI in the same phase.

### Child Deletion

Deleting a child category should be blocked if any tasks still reference that exact child key.

This is stricter than the current phase 3 implementation and is recommended to prevent silent orphaned task metadata.

## Settings UI Design

Keep one settings modal, but split management into two sections.

### Groups Section

Each group row shows:

- group label
- color-family preview
- edit action
- delete action

Add-group form fields:

- `Group name`
- `Color family`

Edit-group form fields:

- `Group name`
- `Color family`

Editable behavior:

- changing `Group name` updates only the group label, not the stable key
- changing `Color family` updates the group color and cascades to linked children
- changing both at once is allowed

The group edit flow is required for phase 3.5 because the linked-child cascade behavior depends on a concrete family-edit action in the UI.

### Categories Section

Display categories visually nested beneath their groups.

Each child row shows:

- child label
- concrete color swatch
- subtle linked/unlinked state indicator
- edit action
- delete action

Add-category form fields:

- `Category name`
- `Parent group`

Edit-category form fields:

- `Category name`
- `Concrete color`

Editable behavior:

- editing a child category may change its label
- editing a child category may change its concrete color
- editing a child category does not change its parent group in phase 3.5
- editing a child category does not change its stable key in phase 3.5

Moving a child category to a different parent group is explicitly out of scope for phase 3.5 because it would require coordinated key migration for all existing task references.

### Child Color Editing

When editing a child:

- allow direct concrete color editing
- re-evaluate linked state automatically after save

No separate “Link to family” toggle is required in phase 3.5 because color membership already determines link state.

## Task Form Dropdown

Replace the current grouped-optgroup rendering with a single flattened selectable list:

```text
Work
  Deep Work
  Meetings
Personal
  Errands
Break
```

Rules:

- group itself is selectable
- children render indented beneath the group
- no duplicate group label as both option and header
- if activities are disabled, the dropdown remains hidden as in phase 3

## Rendering Behavior

### Badge Rendering

Task badge rendering must resolve both group keys and child category keys.

- if `task.category` matches a group key, render the group badge
- if it matches a child key, render the child badge
- if it matches nothing, render no badge

### Live UI Refresh

Group/category CRUD in the settings modal should refresh:

- the modal list
- the main task form dropdown
- any currently rendered task badges whose labels/colors changed

This avoids requiring a full reload for ordinary taxonomy edits. Only the global activities enable/disable toggle should continue to require reload.

## Insights Compatibility

Phase 3.5 does not implement insights, but it must preserve the shape needed for that phase.

Future aggregation expectations:

- tasks tagged with a group key count directly toward that group
- tasks tagged with a child key count toward both the child and its parent group

This means the stored relationship between child category and `groupKey` must remain explicit and stable.

## Architecture Changes

### `category-manager.js`

Evolve this module from flat categories to taxonomy management.

New responsibilities:

- load and persist groups plus child categories
- resolve whether a key is a group or child category
- expose group lists and child lists
- expose flattened dropdown options
- expose family/color helpers used by settings and rendering
- enforce deletion safety rules

### `settings-renderer.js`

Refactor settings rendering to:

- manage groups and children separately
- support color family selection for groups
- support parent-group selection when creating child categories
- refresh task form and visible UI after taxonomy changes

### `tasks/form-utils.js`

Replace grouped `optgroup` population with explicit ordered options:

- top-level group option
- indented child options

### Task Renderers

Scheduled and unscheduled renderers should continue using a shared badge helper, but that helper must resolve both record types.

## Migration Strategy

Phase 3 already persists:

```js
{
    id: 'config-categories',
    categories: [
        { key, label, color, group }
    ]
}
```

Phase 3.5 should migrate this shape on load:

1. derive distinct groups from the old `group` field
2. create explicit group records
3. convert old child categories into new child records:
   - `group` -> `groupKey`
   - preserve existing `color`
   - initialize `isLinkedToGroupFamily` conservatively

### Explicit Legacy Classification Rules

Legacy phase 3 rows must be classified before conversion:

- if `row.key === row.group`, treat the row as an existing standalone group-category
- if `row.key !== row.group`, treat the row as a child category belonging to `row.group`

This avoids duplicate keys and duplicate dropdown entries during migration.

### Group Record Creation During Migration

For each distinct legacy `group` string:

- create exactly one group record with `key` equal to that group string
- if a legacy row already exists where `key === group`, use that row's label and color as the starting group label/color
- if no such standalone row exists, synthesize the group record from the group string:
  - `key`: the legacy group string
  - `label`: title-cased version of the group string
  - `colorFamily`: inferred from existing child colors if possible, otherwise assigned from the default family map
  - `color`: a concrete color from that family

### Child Record Creation During Migration

For legacy child rows where `key !== group`:

- preserve the original `key`
- preserve the original `label`
- convert `group` to `groupKey`
- preserve the original concrete `color`
- infer `isLinkedToGroupFamily` conservatively

### Fresh Install vs Existing Install

Migration rules apply only when loading a legacy phase 3 config shape.

For a fresh install or missing config document, phase 3.5 should seed the canonical taxonomy directly in the new split format.

### Config Shape Detection

Bootstrap logic should use the stored document shape to decide what to do:

- no config document found: seed canonical phase 3.5 defaults
- config document with legacy phase 3 shape (`categories` array, no `schemaVersion`): migrate
- config document with `schemaVersion: '3.5'`: load exactly as stored

This means an intentionally empty saved phase 3.5 taxonomy is preserved and not reseeded.

Recommended migration default:

- if the old child color is part of the inferred family, mark linked
- otherwise mark unlinked

If family inference is too ambiguous for legacy rows, default to:

- preserve existing concrete colors
- mark legacy children unlinked

This is safer than unexpectedly changing old category colors.

## Seeded Default Taxonomy

For fresh installs and empty config documents, phase 3.5 should seed these explicit groups and child categories:

### Groups

- `work` with family `blue`
- `personal` with family `rose`
- `break` with family `green`

### Child Categories

- `work/deep` labeled `Deep Work`
- `work/meetings` labeled `Meetings`
- `work/comms` labeled `Comms`
- `work/admin` labeled `Admin`

This preserves the spirit of the current defaults while making `personal` and `break` true standalone groups that happen to start without children.

Seeding behavior rules:

- missing config document: seed defaults
- existing legacy phase 3 config document: migrate
- existing legacy phase 3 config document with missing or empty `categories`: treat as legacy-invalid and seed defaults
- existing phase 3.5 config document, even if empty: preserve as-is and do not reseed

## Key Generation Rules

### Group Keys

New groups use a slugified form of the entered group name.

Examples:

- `Work` -> `work`
- `Deep Focus` -> `deep-focus`

If the generated group key already exists, creation should fail with a validation error and the user must choose a different name.

### Child Keys

New child categories use:

- `<groupKey>/<child-slug>`

Examples:

- parent `work` + label `Deep Work` -> `work/deep-work`
- parent `personal` + label `Errands` -> `personal/errands`

If the generated child key already exists, creation should fail with a validation error and the user must choose a different name.

Rename behavior:

- renaming a group or child category updates labels only
- keys remain stable after creation in phase 3.5

## Testing Strategy

### Category Manager Tests

Add coverage for:

- group creation without child categories
- child creation under a group
- group key resolution as selectable category
- linked child updates on group family change
- unlink on out-of-family child color edit
- re-link on in-family child color edit
- deletion blocking when groups/categories are still referenced
- legacy config migration

### Settings Renderer Tests

Add coverage for:

- separate group and category sections
- add group flow
- add child flow
- group-family edit cascading linked children
- child color edit causing unlink/re-link
- live dropdown refresh after taxonomy change

### Form Utils Tests

Add coverage for:

- flattened dropdown rendering
- group option plus indented child option ordering
- preserving current selection during refresh when still valid

### Integration Tests

Add coverage for:

- selecting a group directly for a task
- selecting a child category for a task
- badge rendering for both group and child selections
- settings edits reflected in the main app without reload
- fresh-install seed taxonomy matches the canonical phase 3.5 defaults

## Out of Scope

Phase 3.5 does not include:

- insights screens or analytics visualizations
- drag-and-drop taxonomy editing
- arbitrary user-defined color-family creation
- bulk task recategorization workflows
- automatic remapping of unlinked children during group family changes

## Open Implementation Notes

- A small curated family palette is sufficient. Do not over-engineer generalized color science here.
- The current phase 3 delete behavior should be tightened before merge with this model, because silent orphaning becomes even more confusing once groups are first-class.
- The current add-task form only supports category selection on creation, not task edit flows. That is acceptable for phase 3.5 if deletion safety rules prevent orphaned selections.

## Recommended Execution Order

1. Upgrade taxonomy persistence and migration logic.
2. Add color-family utilities and linkage rules.
3. Refactor settings UI for groups and categories.
4. Refresh task form dropdown rendering and live updates.
5. Add rendering/integration coverage.

# Taxonomy Manager UX Point of View

- **Status:** Deferred product-design note
- **Last reviewed:** 2026-07-23
- **Implementation authorization:** None

## Purpose

Fortudo's taxonomy identity hardening made groups and categories durable identity records rather
than labels whose meaning is inferred from key text. The current manager exposes the operations
needed to work with those records, but it also exposes implementation concepts that may not match
how a person thinks about organizing work.

This note records:

- how the taxonomy manager works today;
- the product point of view that emerged while exercising it;
- architectural constraints a future UX must respect; and
- questions to answer before redesigning the experience.

It is not an implementation plan or a decision to redesign the taxonomy data model.

## Point of view

The taxonomy manager should be organized around user intentions, not identity-management
mechanics.

A person generally wants to:

- correct a name or presentation;
- organize something differently;
- stop using something;
- resume using something; or
- declare that something now means a genuinely different thing.

Immutable IDs, legacy keys, reference witnesses, and replacement identities are necessary
implementation details. The interface should apply their safety properties without requiring the
person to reason in those terms during ordinary use.

Historical meaning must never change accidentally. When an action does affect how historical
records are displayed, the interface should say so in language tied to the person's intent.

## Current implementation

### Persistence and identity

- The complete taxonomy is persisted as the singleton `config-categories` document.
- The document currently uses schema version `3.5` and taxonomy identity version `1`.
- Groups and categories have immutable UUID identities.
- Newly created records receive opaque keys derived from their identities rather than their
  labels.
- Categories link to their parent through both `groupId` and `groupKey`; the immutable `groupId` is
  the authoritative identity relationship.
- Tasks and activities carry the selected category's key, immutable ID, identity version, and
  writer-contract witness.
- A label rename does not change a group or category ID, key, or historical assignment. Historical
  records resolve through the retained identity and display the current label.
- Unknown JSON extensions are preserved across supported edits.

### Where the manager lives

The manager appears in Settings under Organization and presents separate Groups and Categories
sections. Both active and archived records remain visible in the manager. Archived records receive
an `Archived` badge.

The task/category selectors normally omit archived records. A currently selected archived record
may remain visible so an existing assignment can still be represented.

### Available operations

| Operation                      | Current behavior                                                                   | Historical effect                                             |
| ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Add group                      | Creates a new active group with a new opaque identity                              | None                                                          |
| Add category                   | Creates a new active category under an active group with a new opaque identity     | None                                                          |
| Rename group                   | Changes its label without changing identity                                        | Historical records display the new label                      |
| Rename category                | Changes its label without changing identity                                        | Historical records display the new label                      |
| Change group color family      | Updates the group and recolors child categories that follow the family             | Presentation only                                             |
| Change category color          | Follows the group family or uses a custom color                                    | Presentation only                                             |
| Archive                        | Retains identity and records an archive timestamp                                  | Existing history still resolves; new selection is hidden      |
| Restore                        | Reactivates the same identity if its label is available                            | Existing history and future use share the identity            |
| Archive and create replacement | Archives the edited record and creates a new active identity                       | Old history remains attached to the archived identity         |
| Delete category                | Removes the row if this client finds no task, activity, or running-timer reference | No normal restore path; a missed reference becomes unresolved |
| Delete group                   | Removes the row if it has no child categories and this client finds no references  | No normal restore path; a missed reference becomes unresolved |

The edit forms explain that renaming changes the label shown on historical records. The
implementation-shaped action **Archive and create replacement** appears inside the edit form when
the person may only have intended to change a name or color.

There is currently no category-reparenting control in the edit form. A category is assigned to a
group when created. A category replacement is created in the same group, while a group replacement
does not automatically transfer child categories.

### Current safeguards and limitations

- Active labels must be unique among groups, and among sibling categories within a group.
- Archived labels are locked until the record is restored.
- A category cannot be restored until its parent group is active.
- Deletion checks this replica's synchronized tasks, activities, and running timer.
- Group deletion also requires every child category to be removed first.
- Cloudant validates taxonomy structure, stable identities for retained records, and coherent
  entity witnesses.
- Cloudant cannot query other documents from `validate_doc_update`, so it cannot prove that a
  taxonomy identity is globally unreferenced.
- An offline replica may contain a reference that the deleting client cannot observe.
- The current document contract permits an existing taxonomy row to be removed. Removing only the
  UI affordance would therefore reduce accidental use but would not establish a cross-client
  invariant.

## Intent-first semantic model

| User intention                         | Identity-safe interpretation                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Correct a typo or improve a label      | Rename the existing identity                                                                    |
| Change color or visual treatment       | Edit presentation on the existing identity                                                      |
| Move an item                           | Preserve identity while changing organization, if the product decides this is semantically safe |
| Stop using an item                     | Archive the existing identity                                                                   |
| Resume using an item                   | Restore the archived identity                                                                   |
| Change what an item means              | Archive the old identity and create a new one                                                   |
| Undo an item that has never been saved | Cancel the draft before persistence                                                             |
| Permanently erase a persisted identity | Probably unsupported in normal product UX                                                       |

This model should guide future interaction design. It does not prescribe the final labels, screens,
or navigation.

## Current UX tensions

1. **Implementation language is prominent.** "Archive and create replacement" is accurate but asks
   the person to understand identity mechanics before acting.
2. **Rename and meaning change share one editor.** The common action and the exceptional semantic
   fork compete for attention.
3. **Delete looks simpler than it is.** A trash icon suggests ordinary row removal even though an
   offline replica prevents the client from proving global non-use.
4. **Archive is safer but less obviously primary.** It is the appropriate lifecycle action for
   real categories, yet the interface does not explain why it differs from delete.
5. **Historical impact is described, not demonstrated.** The copy warns that renaming changes
   historical labels, but the workflow does not help the person distinguish "same meaning, better
   name" from "new meaning."
6. **Archived records remain mixed into management lists.** This preserves access but may become
   noisy as the taxonomy grows.
7. **Hierarchy changes are not represented as a user intention.** Creation establishes parentage,
   but subsequent reorganization has no dedicated flow.

## Working recommendations

These are hypotheses for a future design review, not accepted implementation decisions.

### Prefer lifecycle over deletion

Once a taxonomy identity has been persisted, normal UX should probably offer archive and restore
instead of permanent deletion. Cancelling an unsaved draft remains ordinary and safe.

If permanent taxonomy deletion is removed as a true invariant, removing buttons is insufficient.
A compatible client release would need to precede a new document-contract version that rejects the
removal of existing group or category IDs. That would be a small compatibility rollout, not a
validator hot-patch.

### Translate identity operations into intent

The interface could ask whether the person is:

- correcting the same category; or
- creating a different category for future records.

The system can then apply rename or archive-and-replace semantics without making "replacement
identity" the primary call to action.

### Use progressive disclosure

Common presentation edits should remain direct. Historical and identity consequences should
appear when an action can change meaning, not as equal-weight controls beside every ordinary edit.

### Give archived records a deliberate home

Archived items should remain discoverable and restorable without dominating the active-management
view. A separate archived section, filter, or review flow may better express their lifecycle.

## Open questions

- What terminology best distinguishes "same thing, better name" from "different thing going
  forward"?
- Should replacement be a guided flow, and what preview of historical versus future behavior
  should it show?
- Should taxonomy deletion disappear completely after first persistence?
- If deletion remains, can it be restricted to an unsynced local draft rather than a persisted
  identity?
- Should moving a category between groups preserve identity, create a replacement, or depend on
  the stated intent?
- What happens to child categories when a group is archived, restored, or replaced?
- How should archived items be searched, filtered, and restored?
- Should the manager show reference counts or examples before lifecycle changes?
- How should conflicts or offline uncertainty be explained without exposing distributed-systems
  terminology?
- Which operations need undo, confirmation, or a recoverable grace period?

## Success criteria for a future redesign

- A person can perform common edits without learning Fortudo's identity model.
- The difference between correcting a label and changing meaning is clear before saving.
- Historical records never silently change meaning.
- Stopping and resuming future use is reversible and easy to understand.
- Destructive actions do not rely on one replica having globally complete knowledge.
- Archived records remain resolvable and manageable without cluttering ordinary selection.
- The same behavior is safe across offline clients, retries, and delayed synchronization.
- The Cloudant contract enforces every lifecycle invariant that cannot safely depend on client UX
  alone.

## Scope boundaries

The future review may reconsider taxonomy-management interaction and lifecycle rules. It should not
implicitly redesign room identity, Cloudant credentials, room authorization, task/activity
identity, or the taxonomy data model without an explicit architecture decision.

## Current implementation references

- `public/js/settings/taxonomy-settings.js`
- `public/js/taxonomy/taxonomy-mutations.js`
- `public/js/taxonomy/taxonomy-store.js`
- `public/js/taxonomy/taxonomy-identity.js`
- `public/js/taxonomy/taxonomy-selectors.js`
- `public/js/document-contract.js`
- `docs/OFFLINE-CLIENT-MIGRATION-SAFETY.md`

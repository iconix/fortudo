# Activity Summary Parent Expansion Design

Date: 2026-04-15
Branch: `feat/activities-phase4-5-timer`

## Goal

Change the activity category summary so the default view aggregates by taxonomy parent group, then allows a compact click-to-expand child breakdown for one selected parent group at a time.

This is intended as a lightweight lead-in to richer activity insights without turning the summary into a full analytics panel.

## Approved Interaction

- Default state shows one summary line bar for today's activities grouped by taxonomy parent group.
- The existing total duration remains visible.
- The parent legend remains visible in the default state.
- Parent bar segments and parent legend items are both valid click targets.
- Clicking a parent group toggles expansion for that group.
- Only one parent group is expanded at a time.
- Clicking the already-expanded parent collapses the child breakdown.
- Clicking a different parent swaps the child breakdown to that group.
- Uncategorized appears in the default summary but is non-interactive.
- Clicking uncategorized does nothing and does not affect the currently expanded parent group.

## Expanded State Shape

The expanded state follows the approved `A2` direction:

- Keep the top parent-group summary bar unchanged.
- Add a compact child-detail rail directly underneath, not a new card or full panel.
- The child-detail rail includes:
  - a small selected-group label
  - a minimal child line bar
  - a compact micro legend for the selected group's child categories that may wrap naturally within the rail width, but must remain part of the same lightweight rail rather than becoming a separate panel

The intent is to preserve the top-level overview while adding child detail at low vertical cost.

## Data Rules

### Parent Summary

Parent summary aggregation groups today's activities by:

- taxonomy parent group for child-category activities
- the group itself for activities logged directly against a parent group
- a dedicated uncategorized bucket for uncategorized activities

### Child Expansion

Expanded child detail is calculated only for the selected parent group.

Child items include:

- child categories belonging to the selected parent that have non-zero activity today
- a synthetic fallback bucket for activities logged directly to the parent group

The synthetic bucket is required so the child detail rail sums to the same total as the selected parent in the default summary.

Required label:

- `Unspecified <Group Label>`

Example:

- parent `Work`
- direct-to-group activity contributes to child bucket `Unspecified Work`

Uncategorized never expands and has no child rail.

## State Ownership

Expanded/collapsed state is view state only.

- Do not persist it to storage.
- Keep it in the activity UI/rendering layer.
- Resetting on refresh is acceptable.

## Implementation Shape

Keep this feature in the activity rendering/UI seam rather than introducing a new reporting module.

Primary files:

- `public/js/activities/renderer.js`
- `public/js/activities/ui-handlers.js` if click state handling needs to move out of pure rendering

Recommended internal helpers:

- parent summary aggregation helper
- selected-parent child aggregation helper
- compact expanded-rail renderer

The renderer should stay responsible for HTML generation, while the small piece of selected-parent state can live in the activity UI layer if needed for event handling.

## Testing

Add renderer/UI coverage for:

- default parent-group aggregation
- uncategorized bucket in default summary
- clicking a parent expands its child rail
- clicking the same parent collapses it
- clicking a different parent swaps the expanded child rail
- synthetic direct-to-parent bucket appears in child detail
- zero-activity child categories are excluded from expanded detail
- expanded child totals match the selected parent total
- uncategorized does not expand

## Non-Goals

- no persistence of expansion state
- no hover-only discovery model
- no multi-parent simultaneous expansion
- no full insights dashboard treatment
- no percentages or heavier analytics UI in this change

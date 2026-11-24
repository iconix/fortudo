# Inline editor design guidance

Scheduled tasks, unscheduled tasks, and activities use the same layout and editing behavior for
fields they share. Apply changes to those fields across all three editors so users can carry the
same expectations from one list to another.

## Layout and rationale

- Put the description first and the category directly below it on mobile. At 640 CSS px and up,
  place the picker beside the description to save a row while leaving room for the selected label.
  Activities introduced the side-by-side layout. The task editors adopted the same breakpoint
  during the consistency pass. [Activity logging PR](https://github.com/iconix/fortudo/pull/60)
  [Editor consistency PR](https://github.com/iconix/fortudo/pull/134)
- Keep the card inset, field height, field borders, and action sizes shared. The default inset is
  12 CSS px and the control height is 44 CSS px. Use the type's teal, indigo, or sky accent for the
  left rail, focus rings, and primary action. [Fortudo brand reference](BRAND.md)
- Use an equal-width Cancel and Save row on mobile. On wider screens, keep the actions at the
  end of the controls row. Give duration fields room to flex so the row can accommodate wider
  system fonts and the longer scheduled Reschedule label.
- Keep priority and estimated duration specific to unscheduled tasks. Allow a zero estimate.
  Scheduled tasks and activities use a start time, a positive duration, and an end-time preview
  directly below the duration fields. Scheduled overlaps use an amber warning and Reschedule action.

## Editing behavior

- Focus the description when opening an editor. Give fields accessible names, and make priority
  reachable with Tab and selectable with arrow keys.
- Use the same browser field validation for clicking Save and pressing Enter. After Save or
  Cancel, return focus to the item's actions or Edit button when focus would otherwise fall back
  to the page.
- Preserve the open editor's draft and active text selection during a list refresh. Cancel
  discards the draft. Store and reopen descriptions as literal text, including quotes.
- Expose scheduled overlap messages through a polite status region that stays available for
  updates when empty. Keep the empty region out of the layout so it adds no blank row.

## Changing an editor

The shared `inline-editor-*` rules own the layout. The three renderers supply the fields and
type-specific states. Compare all three in a narrow mobile window, at the 640 px breakpoint, and
in the desktop card. Include the scheduled overlap state, since its longer action label is the
tightest layout case. [Shared styles](../../public/css/custom.css)

The browser regressions cover the responsive layouts, input validation, focus, draft preservation,
and the overlap state. Regenerate Tailwind CSS and the service-worker precache metadata when
changing the relevant public assets. `npm run verify` checks the generated stylesheet and runs the
browser suite. [Task editor tests](../../tests/e2e/test_task_edit_layout.py)
[Activity editor tests](../../tests/e2e/test_activities.py)

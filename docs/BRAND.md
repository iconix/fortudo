# Fortudo brand reference

## Name

- **Prose / metadata:** `Fortudo` — capital F, no hyphen, no period. Used in `<title>`, manifest, alt text, running text.
- **Wordmark (visual only):** `fortudo.` — all lowercase, "do." in violet, terminal period. Never used in prose.
- `Fortu-do` is retired.

## Colors

| Token      | Hex       | Use                                          |
| ---------- | --------- | -------------------------------------------- |
| Slate 800  | `#1e293b` | Icon/tile background, app shell, theme-color |
| Slate 900  | `#0f172a` | Manifest background_color (unchanged)        |
| Violet 400 | `#a78bfa` | The mark, wordmark accent — all backgrounds  |
| Slate 100  | `#f1f5f9` | Wordmark "fortu" on dark                     |

Violet is the accent everywhere (per decision 2026-07-15: no darker violet on light backgrounds; logo text is WCAG-exempt).
Origin: the violet echoes the heart in "For Cristell". The dedication uses a custom **Jelly heart** with a violet-300 → violet-400 → violet-500 body, a soft violet-50 highlight, and a subtle 3-second breathing motion (static under reduced motion). It replaces the platform-dependent purple-heart emoji.

## Mark

- Base: Material Design Icons `arm-flex` glyph (Apache 2.0, Pictogrammers), check knocked out of the bicep.
- Source of truth: `fortudo-mark.svg` (transparent, masked knockout) and `fortudo-icon-512.svg` (full-bleed tile).
- Size ladder is hand-tuned: 32px uses a thicker/larger check; 16px drops the check entirely.
- 💪🏾 emoji: retired from brand surfaces; lives on as an easter egg in the all-tasks-done state.

## Icon files (in public/icons/)

- `icon-512.png`, `icon-192.png` — purpose "any", full-bleed slate
- `icon-maskable-512.png` — mark at ~55% for the safe zone
- `apple-touch-icon.png` — 180px full-bleed
- `favicon.svg` — rounded slate tile + mark
- `mark.svg` — transparent mark for in-app header

## In-app color scheme (rebrand, 2026-07-15)

- **Violet = brand + intentional interaction:** header lockup, active-tab text/border, primary buttons, and interaction hover/focus states. Primary buttons use tint+ style — `bg-violet-500/30 border border-violet-400/60 text-violet-200 hover:bg-violet-500/40` (solid `bg-violet-600` is the approved louder alternate). Active tabs use a neutral slate fill with violet text/border so they do not compete with the page's primary action.
- **Utility chrome stays neutral at rest:** the Settings scrollbar uses slate; taxonomy Add actions use slate until hover/focus; button keyboard focus uses a neutral slate outline. The Activities setting switch uses semantic sky rather than brand violet.
- **Action buttons use flat semantic tints:** gradients are retired from all CTAs. Type-context actions use the same tint+ construction in teal, slate, or sky; overlap warnings use amber; destructive confirmations use rose. Preserve the pattern across static markup, inline edit renderers, and dynamically themed modal buttons: `bg-{color}-500/30 border border-{color}-400/60 text-{color}-200 hover:bg-{color}-500/40`.
- **Toast hierarchy:** non-urgent default/slate, violet, teal, and sky toasts use a quiet `bg-slate-800/95` overlay with a semantic 400/60 border (slate uses 500/60) and 200 text. This keeps update and informational notices legible without outranking primary actions. Amber and rose retain denser 900/90 surfaces and 700 borders for warnings and errors.
- **Semantic colors unchanged:** priority badges stay High=rose / Med=amber / Low=teal; activity timer stays sky-300.
- **Type coding (form <-> sections):** Scheduled = teal-400, Activities = sky-400, and Unscheduled uses the neutral slate family (was indigo; slate = "not yet placed"). Indigo is retired because it collided with violet.
- **Unscheduled = Unified crisp:** Unscheduled work is equal in importance to scheduled work, not an inactive state. Use slate-300 consistently for its section heading, task-row left rail, checkbox, and overflow/actions trigger. The Unscheduled form chip remains a neutral slate selection treatment, while priority and category colors keep their existing semantic meaning.
- Old amber-300 title and teal accent are retired.

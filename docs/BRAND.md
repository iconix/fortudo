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
Origin: the violet echoes the 💜 in "For Cristell 💜".

## Mark

- Base: Material Design Icons `arm-flex` glyph (Apache 2.0, Pictogrammers), check knocked out of the bicep.
- Source of truth: `fortudo-mark.svg` (transparent, masked knockout) and `fortudo-icon-512.svg` (full-bleed tile).
- Size ladder is hand-tuned: 32px uses a thicker/larger check; 16px drops the check entirely.
- 💪🏾 emoji: retired from brand surfaces; lives on as easter egg (all-tasks-done state) and in the dedication line.

## Icon files (in public/icons/)

- `icon-512.png`, `icon-192.png` — purpose "any", full-bleed slate
- `icon-maskable-512.png` — mark at ~55% for the safe zone
- `apple-touch-icon.png` — 180px full-bleed
- `favicon.svg` — rounded slate tile + mark
- `mark.svg` — transparent mark for in-app header

## In-app color scheme (rebrand, 2026-07-15)

- **Violet = brand + interaction only:** header lockup, active tab (`bg-violet-500/20 text-violet-200 border-violet-400/40`), primary buttons: tint+ style — `bg-violet-500/30 border border-violet-400/60 text-violet-200 hover:bg-violet-500/40` (gradient dropped; solid `bg-violet-600` is the approved louder alternate).
- **Semantic colors unchanged:** priority badges stay High=rose / Med=amber / Low=teal; activity timer stays sky-300.
- **Type coding (form <-> sections):** Scheduled = teal-400, Activities = sky-400, and Unscheduled uses the neutral slate family (was indigo; slate = "not yet placed"). Indigo is retired because it collided with violet.
- **Unscheduled = Unified crisp:** Unscheduled work is equal in importance to scheduled work, not an inactive state. Use slate-300 consistently for its section heading, task-row left rail, checkbox, and overflow/actions trigger. The Unscheduled form chip remains a neutral slate selection treatment, while priority and category colors keep their existing semantic meaning.
- Old amber-300 title and teal accent are retired.

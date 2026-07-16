# Fortudo violet rebrand — implementation handoff

Date: 2026-07-15
Repo: `~/code/fortudo` (deployed at https://fortudo.web.app/)
Companion doc: `docs/BRAND.md` (durable brand reference — tokens, naming rules, mark provenance)

**Claude sessions:**

- `7c685f60-c59a-4aaa-8e5d-a248e7fe77da` (2026-07-15) — full rebrand design: logo iteration, icon kit, naming system, in-app color scheme, interactive mockups

## Pyramid Summary

> **~2w:** Fortudo rebrand.
>
> **~4w:** Execute violet rebrand in-app.
>
> **~8w:** Apply new logo, icons, and violet color system.
>
> **~16w:** Replace emoji branding with arm-check mark, wire icon kit, swap teal/amber accents to violet system.
>
> **~32w:** Step-by-step repo changes for the 2026-07 rebrand: verify pre-placed icon assets, wire favicon and OG tags, header lockup, tint+ violet buttons, type-coded sections, Tailwind rebuild, service worker bump.

## Context

The app's brand was the 💪🏾 emoji (screenshotted into PNGs by `scripts/generate_icons.py`) plus an amber "Fortu-do" wordmark and teal accents. The rebrand replaces this with an owned mark — a flexed-arm silhouette (MDI `arm-flex`, Apache 2.0) with a checkmark knocked out of the bicep — and a violet-on-slate color system. Design rationale and all decisions are in `fortudo-BRAND.md`; this doc is the execution plan.

## Repo state — read first

This work must start from a branch cut from up-to-date `origin/main` (e.g. `violet-rebrand`). If the files `public/icons/`, `manifest.webmanifest`, or the service worker are missing from the working tree, you are on the wrong branch: `git fetch origin && git switch -c violet-rebrand origin/main` before anything else.

## Assets (pre-placed by Nadja — verify, don't copy)

Production assets are placed at their final paths on the rebrand branch; confirm they exist before starting:

| File                                                                                         | Notes                                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | New mark, overwrote emoji versions; filenames match manifest — no manifest icon edits |
| `public/icons/favicon.svg`                                                                   | New SVG favicon (rounded slate tile + mark)                                           |
| `public/icons/mark.svg`                                                                      | Transparent mark for the in-app header lockup                                         |
| `public/icons/icon.svg`                                                                      | Canonical vector source for the icon set                                              |
| `public/og-image.png`                                                                        | 1200×630 social preview card                                                          |
| `docs/BRAND.md`                                                                              | Durable brand reference                                                               |
| `docs/plans/design/assets/2026-07-15-logo-concept.svg`                                       | Design artifact (hero, size ladder, lockups)                                          |

If any are missing, stop and ask — do not regenerate assets.

## Changes

### 1. `public/index.html`

- **Favicon:** replace the emoji data-URI `<link rel="icon" ...>` with `<link rel="icon" type="image/svg+xml" href="icons/favicon.svg" />`
- **Theme color:** `<meta name="theme-color" content="#0f766e" />` → `#1e293b`
- **Title:** ensure `<title>` is `Fortudo` (no hyphen, no emoji)
- **OG tags (new):**
  ```html
  <meta property="og:title" content="Fortudo" />
  <meta property="og:description" content="A daily time-blocking to-do app" />
  <meta property="og:image" content="https://fortudo.web.app/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  ```
- **Header:** both `<h1>` instances (`Fortu-do 💪🏾`, `text-amber-300`) become the lockup. Gotcha: with `flex` on the h1, keep the wordmark inside a single span or `gap` splits it:
  ```html
  <h1 class="flex items-center gap-3 text-4xl font-bold text-slate-100 mb-2">
    <img src="icons/mark.svg" alt="" class="h-10 w-10" />
    <span>fortu<span class="text-violet-400">do.</span></span>
  </h1>
  ```
- **Tagline:** keep "For Cristell 💜" — the 💜 is the origin of the brand color. Sentence-case the tagline if touched.

### 2. `public/manifest.webmanifest`

- `theme_color`: `#0f766e` → `#1e293b`. Nothing else.

### 3. Color system (Tailwind class swaps)

- **Primary buttons** (Add Task / Log Activity / Enter Room): replace `bg-gradient-to-r from-teal-500 to-teal-400 hover:...` with tint+ style: `bg-violet-500/30 border border-violet-400/60 text-violet-200 hover:bg-violet-500/40`. (Solid `bg-violet-600` is the approved louder alternate.)
- **Active tab:** `bg-teal-500/20 text-teal-200 border-teal-400/40` → `bg-violet-500/20 text-violet-200 border-violet-400/40`. Check JS for class toggling, not just HTML.
- **Type coding (form ↔ sections):** Scheduled stays teal-400; Activities stays sky-400; Unscheduled moves from indigo to the neutral slate family (indigo retired: collides with violet). Selected type radio/chip should tint with its type color (match the priority selector's `peer-checked` pattern). The final Unscheduled display treatment is **Unified crisp**: slate-300 for the section heading, task-row left rail, checkbox, and overflow/actions trigger.
- **Do not touch:** priority badges (rose/amber/teal), sky timer, card/section slate backgrounds.

### 4. Tailwind rebuild — critical gotcha

Generated stylesheets are committed to the repo. The violet classes above may not exist in the current CSS output. After editing markup, re-run the Tailwind build (see `package.json` scripts) and commit the regenerated CSS. If a class renders unstyled, this is why.

### 5. Service worker

Assets are precached (`sw.js` / `sw-precache.js`) and the new icons reuse old filenames. Regenerate the precache list / bump the cache version so deployed clients fetch the new assets.

### 6. `scripts/generate_icons.py`

Retire, or repoint at `public/icons/icon.svg` (rasterize SVG instead of screenshotting the emoji). If it also generates apple-touch-startup splash images, regenerate those from the new mark on `#1e293b` or drop them.

### 7. Sweep and README

- `grep -rn "Fortu-do\|💪🏾" public/ scripts/ README*` — brand surfaces get "Fortudo"/lockup; the emoji may stay in the dedication and as an all-tasks-done easter egg.
- README: add `og-image.png` or the lockup as a banner; use "Fortudo" in prose.

## Naming rule (from BRAND.md)

- Prose/metadata: **Fortudo**. Wordmark (visual only): **fortudo.** with violet "do.". Never "Fortu-do".

## Implementation clarifications (2026-07-16)

- Rebase the existing Android/PWA worktree onto `origin/main` before applying the rebrand so its prior mobile fixes remain in scope.
- Delete the emoji-based `scripts/generate_icons.py`. The committed `public/icons/icon.svg` is the canonical source for raster icons; README regeneration guidance should point to a general SVG rasterizer such as `rsvg-convert`.
- Keep the old generator reference in `docs/plans/implementation/2026-07-07-pwa.md` as a historical record.
- Post-implementation visual review selected **Unified crisp** for Unscheduled Tasks. The initial slate-400/slate-500 treatment read too much like an inactive scheduled state. Unscheduled work should carry equal visual importance, so its heading, row rail, checkbox, and overflow/actions trigger use slate-300 consistently. Priority badges, category colors, and the neutral Unscheduled form-chip treatment remain unchanged.

## Verification

1. `firebase deploy` (or preview channel), hard-refresh: favicon is the new mark, header shows the lockup, browser chrome is slate.
2. Lighthouse PWA audit passes icon checks (any + maskable).
3. Paste the URL into Slack/iMessage: OG card renders.
4. Toggle each task type: selected chip tints teal/slate/sky; submit button stays violet and relabels Add task / Log activity.
5. On a phone with the old install: remove and re-add to home screen; icon updates (installed icons don't refresh on their own).

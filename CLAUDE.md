# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fortudo is a daily time-blocking to-do app. It runs as a single-page application with no build step - vanilla JavaScript with ES modules served directly via Firebase Hosting.

## Environment Notes

- GitHub CLI (`gh`) is installed at `/c/Program Files/GitHub CLI/gh`

## Planning Docs

Plans live under `docs/plans/` by document type, not by the workflow or tool that
produced them:

- Design/specification docs go in `docs/plans/design/`
- Implementation plans, including superpowers-generated plans, go in
  `docs/plans/implementation/`

See `docs/plans/README.md` for the current convention. Do not create new plans under
`docs/superpowers/`.

## Commands

```bash
# Testing
npm test                    # Run Jest unit/integration suite
npm run test:coverage       # Jest coverage (90% statements/lines/functions, 79% branches)
npm run test:python         # Python helper unit and repository guard tests
npm run test:e2e            # Local Playwright E2E with an auto-started dynamic server
npm run test:preview        # Deployed-preview acceptance (requires preview environment)
npm run verify              # Run every pre-merge lint and test gate

# Linting & Formatting
npm run lint                # Run ESLint
npm run lint:fix            # Fix ESLint issues
npm run lint:python         # Run locked Ruff checks for Python
npm run format              # Format with Prettier
npm run check               # Run lint + format:check (CI validation)

# Local Development
npx http-server public -p 5000 -c-1  # Serve app at http://localhost:5000

# Deployment
firebase deploy             # Deploy to Firebase Hosting
```

## Architecture

### Module Structure

The app uses a modular architecture in `public/js/`:

- **app.js** - Main orchestrator. Initializes the app, wires up event callbacks, and coordinates between modules. **Keep this file thin** — it should only do orchestration (importing, wiring callbacks, calling init functions). Any DOM manipulation, event handler logic, or UI rendering belongs in `dom-renderer.js` or a dedicated file in `public/js/tasks/`. If app.js grows beyond ~150 lines, extract the new logic.
- **tasks/manager.js** - Central task state management. All task CRUD operations, rescheduling logic, and state mutations happen here. Exports pure functions that return result objects with `success`, `reason`, and `requiresConfirmation` fields.
- **dom-renderer.js** - DOM manipulation and event delegation. Uses two container-level event listeners instead of per-element listeners.
- **reschedule-engine.js** - Handles automatic rescheduling when tasks conflict or run late. Detects overlaps and calculates time adjustments.
- **modal-manager.js** - Custom modal dialogs (alerts, confirmations, schedule picker) replacing browser alerts.
- **storage.js** - PouchDB persistence layer. Each room code maps to a separate PouchDB database.
- **room-manager.js** - Room code management (generate, get/set active, saved rooms list). Uses localStorage for room metadata.
- **sync-manager.js** - CouchDB sync relay. Debounced bidirectional replication with status callbacks.
- **room-renderer.js** - Room entry screen UI, room switching, and sync status indicator.

### Key Patterns

**Event Callbacks**: The app passes callback objects (`scheduledTaskEventCallbacks`, `unscheduledTaskEventCallbacks`) through the rendering pipeline. Event delegation in `dom-renderer.js` invokes these callbacks.

**Result Objects**: Operations return `{ success, reason, requiresConfirmation, confirmationType }` objects. The `requiresConfirmation` pattern allows multi-step user confirmations (e.g., "reschedule other tasks?").

**Task Types**: Tasks are either `scheduled` (with start time, displayed in timeline) or `unscheduled` (backlog). Tasks can move between types via schedule/unschedule actions.

**DateTime Format**: Uses ISO format for proper midnight crossing support. See `docs/MIGRATION.md` for details on the dual-format migration.

### Test Structure

Test responsibilities are intentionally separated:

- `__tests__/` contains Jest/jsdom unit and integration coverage for JavaScript modules.
- Root `tests/test_*.py` files cover Python helpers and repository artifact/workflow guards.
- `tests/e2e/` contains local Playwright browser scenarios and explicitly requests the
  session app-server fixture.
- `tests/preview/` contains deployed Firebase/Cloudant acceptance coverage and never
  receives the local app-server fixture.

Python 3.12, pytest, Playwright, and Ruff are pinned by `pyproject.toml` and `uv.lock`.
Use the npm scripts above rather than ad hoc `pip install` or `uv run --with` commands.

## Code Style

- ESLint with Prettier integration (run `npm run check` before commits)
- Run `npm run format` or `npm run format:check` before attempting a commit; do not rely on the pre-commit hook to discover formatting issues
- Single quotes, 4-space indentation, 100 char line width
- `prefer-const`, `no-var`, strict equality (`===`)
- JSDoc comments for public functions
- Refactoring is cheap. Do not defer worthwhile structural cleanup just to save time or effort when the code you are touching would clearly benefit from it. Prefer the simplest design that keeps responsibilities clear.
- Do not over-engineer. Avoid adding layers, modules, abstractions, or public seams unless they solve a real problem in the current codebase. Simplicity is the default; extra structure must earn its keep.

## Test-Driven Development

When fixing bugs or adding features, follow strict TDD:

1. **Write failing tests first** - Cover both the detection/trigger AND the execution/handler
2. **Test all new functions** - Every new function needs unit tests, not just integration coverage
3. **Test error paths** - Include tests for edge cases (not found, invalid input, wrong state)
4. **Run the relevant focused checks during red/green** - Run `npm run verify` before push or merge; Jest coverage must remain at 90% for statements, lines, and functions and 79% for branches.

Example for a confirmation flow:

```
# Bug: Adding task overlapping completed task should offer truncation

# Tests needed:
1. addTask() returns requiresConfirmation when overlap detected
2. truncateCompletedTask() successfully truncates
3. truncateCompletedTask() returns error when task not found
4. truncateCompletedTask() returns error when task not completed
5. truncateCompletedTask() returns error when new end time invalid
```

**The pre-commit hook is staged-file aware.** It runs JavaScript formatting/lint plus
related Jest tests, or Python lint plus non-browser tests, depending on what is staged.
The complete coverage and browser suite remains the explicit `npm run verify` pre-push/CI gate.

## Working in Git Worktrees

This repo uses `.worktrees/` for isolated feature branches. Worktrees share the same `.git` but have separate working directories and `node_modules`.

### Gotchas

**Always `cd` into the worktree before running commands.** Tools like `npx` resolve from `node_modules` relative to the current working directory. Running `npx http-server <worktree-path>/public` from the main repo will resolve `http-server` from the main repo's `node_modules` and may serve stale or wrong files.

```bash
# Wrong — resolves npx from main repo
npx http-server .worktrees/schedule-tasks-in-gaps/public -p 9847

# Right — cd first so npx resolves from the worktree
cd .worktrees/schedule-tasks-in-gaps && npx http-server ./public -p 9847
```

**ESLint needs `root: true`.** Without it, ESLint traverses up and finds the main repo's config + `node_modules`, causing "couldn't determine plugin uniquely" errors. Each worktree's `.eslintrc.js` must have `root: true`.

**E2E tests start their own worktree-scoped server.** The fixture selects an available
local port by default, so do not start a server manually. For headed debugging, request
a stable free port explicitly:

```bash
FORTUDO_E2E_PORT=9847 E2E_BROWSER_CHANNEL=chrome npm run test:e2e
```

Deployed-preview tests live in `tests/preview/` and never depend on the local server or
port. Do not use a server-reuse flag; it can accidentally exercise another worktree.

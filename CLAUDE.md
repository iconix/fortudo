# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fortudo is a daily time-blocking to-do app. It runs as a single-page application with no build step - vanilla JavaScript with ES modules served directly via Firebase Hosting.

## Commands

```bash
# Testing
npm test                    # Run Jest test suite
npm test:watch              # Run tests in watch mode
npm test:coverage           # Generate coverage report (80% threshold (75% for branches) enforced)

# Linting & Formatting
npm run lint                # Run ESLint
npm run lint:fix            # Fix ESLint issues
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

- **app.js** - Main orchestrator. Initializes the app, wires up event callbacks, and coordinates between modules. All user interactions flow through callback objects defined here.
- **task-manager.js** - Central state management. All task CRUD operations, rescheduling logic, and state mutations happen here. Exports pure functions that return result objects with `success`, `reason`, and `requiresConfirmation` fields.
- **dom-handler.js** - DOM manipulation and event delegation. Uses two container-level event listeners instead of per-element listeners.
- **reschedule-engine.js** - Handles automatic rescheduling when tasks conflict or run late. Detects overlaps and calculates time adjustments.
- **modal-manager.js** - Custom modal dialogs (alerts, confirmations, schedule picker) replacing browser alerts.
- **storage.js** - localStorage persistence layer.

### Key Patterns

**Event Callbacks**: The app passes callback objects (`scheduledTaskEventCallbacks`, `unscheduledTaskEventCallbacks`) through the rendering pipeline. Event handlers in `dom-handler.js` invoke these callbacks.

**Result Objects**: Operations return `{ success, reason, requiresConfirmation, confirmationType }` objects. The `requiresConfirmation` pattern allows multi-step user confirmations (e.g., "reschedule other tasks?").

**Task Types**: Tasks are either `scheduled` (with start time, displayed in timeline) or `unscheduled` (backlog). Tasks can move between types via schedule/unschedule actions.

**DateTime Format**: Uses ISO format for proper midnight crossing support. See `docs/MIGRATION.md` for details on the dual-format migration.

### Test Structure

Tests are in `__tests__/` with a shared `test-utils.js` for mocks and helpers. Jest runs with jsdom environment. Each module has a corresponding test file.

## Code Style

- ESLint with Prettier integration (run `npm run check` before commits)
- Single quotes, 4-space indentation, 100 char line width
- `prefer-const`, `no-var`, strict equality (`===`)
- JSDoc comments for public functions

## Test-Driven Development

When fixing bugs or adding features, follow strict TDD:

1. **Write failing tests first** - Cover both the detection/trigger AND the execution/handler
2. **Test all new functions** - Every new function needs unit tests, not just integration coverage
3. **Test error paths** - Include tests for edge cases (not found, invalid input, wrong state)
4. **Run coverage check before committing** - `npm test -- --coverage` must pass 80% threshold (75% for branches)

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

**The pre-commit hook enforces both lint/format and coverage checks.** Commits will fail if coverage drops below 80% (75% for branches).

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

**E2E tests use port 9847.** All Playwright test files (`test_*.py`) expect the app on `http://127.0.0.1:9847`. Before running E2E tests, start a server from within the worktree:

```bash
cd .worktrees/<branch> && npx http-server ./public -p 9847 -c-1
```

**Verify what's being served.** If tests fail on element visibility or show unexpected UI, `curl -s http://127.0.0.1:<port>/ | head -15` to confirm the right `index.html` is being served.

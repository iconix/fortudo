# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fortudo is a daily time-blocking to-do app. It runs as a single-page application with no build step - vanilla JavaScript with ES modules served directly via Firebase Hosting.

## Commands

```bash
# Testing
npm test                    # Run Jest test suite
npm test:watch              # Run tests in watch mode
npm test:coverage           # Generate coverage report (70% threshold enforced)

# Linting & Formatting
npm run lint                # Run ESLint
npm run lint:fix            # Fix ESLint issues
npm run format              # Format with Prettier
npm run check               # Run lint + format:check (CI validation)

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

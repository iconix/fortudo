# Day-Focused Insights Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Phase 5 Insights so Trends owns the selected range while summary cards, timeline, and Activity Log are scoped to one selected day.

**Architecture:** Keep the existing vanilla JS Insights modules and renderer-local state. Extend the model with `selectedDate`, render trend days as selectable day cards, and keep timeline/log detail day-scoped. Preserve the Activity Log as the editable record and make the timeline a visual/day-detail companion.

**Tech Stack:** Vanilla JavaScript ES modules, PouchDB-backed activity/task state, Tailwind utility classes in rendered HTML, Jest/jsdom tests.

---

## File Structure

- Modify `public/js/activities/insights-model.js`
  - Accept `selectedDate`.
  - Build summary, planned blocks, actual blocks, issues, and activity log for that selected day instead of always today plus a separate log range.
  - Continue including a running activity only when it overlaps the selected day.
- Modify `public/js/activities/insights-trends.js`
  - Keep range aggregation behavior.
  - Ensure `dailyHours` day records include date, total minutes, category segments, and activity count data needed for day cards.
- Modify `public/js/activities/insights-renderer.js`
  - Replace collapsible Trends panel with visible range controls and selectable day cards.
  - Store `selectedInsightsDate` alongside `storedTrendDateRange`.
  - Render summary/timeline/log for selected day.
  - Add focused timeline viewport calculation and selected block detail row.
  - Remove multi-day Activity Log behavior from the main Insights detail.
- Modify `public/js/activities/app-wiring.js`
  - Wire day-card clicks to update selected date.
  - Wire timeline block clicks to update selected timeline block.
- Modify tests:
  - `__tests__/activity-insights-model.test.js`
  - `__tests__/activity-insights-renderer.test.js`
  - `__tests__/activity-insights-trends.test.js` if current trend coverage lacks activity count/day-card fields.

Do not commit mockup files:

- `public/phase5-insights-mockup.html`
- `public/phase5-timeline-mockup.html`
- `public/phase5-day-focused-insights-mockup.html`

## Current Behavior To Replace

- `buildInsightsModel()` always uses `today = extractDateFromDateTime(now)` for summary and timeline.
- `activityLogDateRange` can include multiple days, so the Activity Log can show many days without day delineation.
- Trends renders in a collapsible `<details>` panel and is not connected to the timeline/log selected day.
- Timeline blocks render against a 24-hour scale, making normal work blocks tiny and hard to read.

## Target Behavior

- Trend range controls determine which days are visible in Trends.
- One selected day controls Summary, Timeline, and Activity Log.
- Remove the separate Activity Log range controls from the main Insights interaction model. Trends owns the range; Activity Log is selected-day only.
- Default selected day:
  - today when today is inside the trend range
  - otherwise `dateRange.endDate`
- Selected day is session-local renderer state. Do not persist it across reloads.
- Clicking a trend day changes the selected day.
- Activity Log displays selected-day activities only.
- Timeline uses a focused viewport around selected-day planned/actual blocks with padding, not a full 24-hour scale.
- Clicking/tapping a timeline block shows a compact selected-block detail row.
- Clicking/tapping a timeline block does not scroll or highlight the matching Activity Log row in this pass.
- Empty selected days are valid: summary shows zeros, timeline shows an empty state, and Activity Log shows a selected-day empty message.
- 30-day Trends may horizontally scroll on desktop and mobile. Do not compress 30 day cards into unreadable columns.

---

### Task 1: Model Selected-Day Insights

**Files:**
- Modify: `public/js/activities/insights-model.js`
- Test: `__tests__/activity-insights-model.test.js`

- [ ] **Step 1: Add failing selected-date model test**

Add a test proving `buildInsightsModel()` can build details for a date that is not `now`:

```js
test('buildInsightsModel scopes summary timeline and log to selectedDate', () => {
    const now = new Date('2026-06-16T12:00:00');
    const tasks = [
        {
            id: 'today-task',
            type: 'scheduled',
            description: 'today plan',
            startDateTime: '2026-06-16T10:00:00',
            endDateTime: '2026-06-16T10:30:00',
            duration: 30,
            status: 'completed'
        },
        {
            id: 'yesterday-task',
            type: 'scheduled',
            description: 'yesterday plan',
            startDateTime: '2026-06-15T09:00:00',
            endDateTime: '2026-06-15T10:00:00',
            duration: 60,
            status: 'completed'
        }
    ];
    const activities = [
        {
            id: 'today-activity',
            description: 'today actual',
            startDateTime: '2026-06-16T10:00:00',
            endDateTime: '2026-06-16T10:30:00',
            duration: 30
        },
        {
            id: 'yesterday-activity',
            description: 'yesterday actual',
            startDateTime: '2026-06-15T09:00:00',
            endDateTime: '2026-06-15T09:45:00',
            duration: 45
        }
    ];

    const model = buildInsightsModel({
        tasks,
        activities,
        now,
        selectedDate: '2026-06-15'
    });

    expect(model.date).toBe('2026-06-15');
    expect(model.summary.totalPlannedMinutes).toBe(60);
    expect(model.summary.totalActualMinutes).toBe(45);
    expect(model.plannedBlocks.map((block) => block.id)).toEqual(['yesterday-task']);
    expect(model.actualBlocks.map((block) => block.id)).toEqual(['yesterday-activity']);
    expect(model.activityLog.map((activity) => activity.id)).toEqual(['yesterday-activity']);
});
```

- [ ] **Step 2: Run the focused model test and verify failure**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-model.test.js
```

Expected: FAIL because `selectedDate` is ignored.

- [ ] **Step 3: Implement selectedDate in `buildInsightsModel()`**

Change the signature to accept `selectedDate`:

```js
export function buildInsightsModel({
    tasks = [],
    activities = [],
    runningActivity = null,
    now = new Date(),
    selectedDate = null,
    activityLogDateRange = null
} = {}) {
    const today = extractDateFromDateTime(now);
    const detailDate = selectedDate || today;
    const detailInterval = getDayInterval(detailDate);
    const selectedLogRange = activityLogDateRange || {
        startDate: detailDate,
        endDate: detailDate
    };
    const detailTasks = tasks.filter((task) => isScheduledOnDate(task, detailInterval));
    const normalizedRunningActivity = normalizeRunningActivity(runningActivity, detailDate, now);
    const detailActivities = [
        ...activities.filter((activityItem) => isActivityOnDate(activityItem, detailInterval)),
        ...(normalizedRunningActivity ? [normalizedRunningActivity] : [])
    ];
    const selectedLogActivities = activities
        .filter(isCompletedActivity)
        .filter((activityItem) => isActivityVisibleInLogRange(activityItem, selectedLogRange))
        .sort(compareNewestFirst);

    return {
        date: detailDate,
        activityLogDateRange: selectedLogRange,
        summary: {
            totalPlannedMinutes: detailTasks.reduce(
                (total, task) => total + getOverlapDuration(task, detailInterval, now),
                0
            ),
            totalActualMinutes: detailActivities.reduce(
                (total, activityItem) =>
                    total + getOverlapDuration(activityItem, detailInterval, now),
                0
            ),
            completedTaskCount: detailTasks.filter((task) => task.status === 'completed').length,
            currentlyLateTaskCount: detailTasks.filter((task) => isCurrentlyLate(task, now)).length
        },
        plannedBlocks: detailTasks.map((task) => buildTimelineBlock(task, detailInterval, now)),
        actualBlocks: detailActivities.map((activityItem) =>
            buildTimelineBlock(activityItem, detailInterval, now)
        ),
        activityLog: selectedLogActivities,
        issues: detectActivityDataIssues(detailActivities),
        activityLogIssues: detectActivityDataIssues(selectedLogActivities)
    };
}
```

If existing tests depend on `activityLogDateRange` showing multiple days, update them to reflect the new design: main Insights Activity Log is day-scoped.

- [ ] **Step 4: Add running-activity selected-day test**

Add/adjust a test:

```js
test('buildInsightsModel includes running activity only when it overlaps selectedDate', () => {
    const now = new Date('2026-06-16T10:30:00');
    const runningActivity = {
        id: 'config-running-activity',
        description: 'live work',
        startDateTime: '2026-06-16T10:00:00',
        category: null
    };

    const todayModel = buildInsightsModel({
        runningActivity,
        now,
        selectedDate: '2026-06-16'
    });
    const yesterdayModel = buildInsightsModel({
        runningActivity,
        now,
        selectedDate: '2026-06-15'
    });

    expect(todayModel.actualBlocks).toHaveLength(1);
    expect(yesterdayModel.actualBlocks).toHaveLength(0);
});
```

- [ ] **Step 5: Run model tests and commit**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-model.test.js
```

Expected: PASS.

Commit:

```bash
git add public/js/activities/insights-model.js __tests__/activity-insights-model.test.js
git commit -m "Scope insights model to selected day"
```

---

### Task 2: Render Selectable Trend Day Cards

**Files:**
- Modify: `public/js/activities/insights-trends.js`
- Modify: `public/js/activities/insights-renderer.js`
- Test: `__tests__/activity-insights-renderer.test.js`
- Test: `__tests__/activity-insights-trends.test.js` if needed

- [ ] **Step 1: Add failing renderer test for visible selected day cards**

In `__tests__/activity-insights-renderer.test.js`, render a 14-day range and assert:

```js
test('renderInsightsView renders selectable trend day cards with selected day', () => {
    renderInsightsView({
        activities: [
            {
                id: 'a-1',
                description: 'work',
                startDateTime: '2026-06-15T09:00:00',
                endDateTime: '2026-06-15T10:00:00',
                duration: 60,
                category: 'work'
            },
            {
                id: 'a-2',
                description: 'project',
                startDateTime: '2026-06-16T09:00:00',
                endDateTime: '2026-06-16T10:30:00',
                duration: 90,
                category: 'work'
            }
        ],
        now: new Date('2026-06-16T12:00:00'),
        dateRange: { startDate: '2026-06-03', endDate: '2026-06-16' },
        selectedDate: '2026-06-15'
    });

    const trends = document.getElementById('insights-trends');
    expect(trends.querySelector('details')).toBeNull();
    expect(trends.querySelectorAll('[data-trend-day]').length).toBe(14);
    expect(trends.querySelector('[data-trend-day="2026-06-15"]').dataset.selected).toBe('true');
});
```

- [ ] **Step 2: Run renderer test and verify failure**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js
```

Expected: FAIL because Trends still uses `<details>` and bars.

- [ ] **Step 3: Add selected-date renderer state**

In `public/js/activities/insights-renderer.js`, add module state:

```js
let storedTrendDateRange = null;
let storedSelectedInsightsDate = null;
let selectedTimelineBlockId = null;
```

Add helpers:

```js
function isDateWithinRange(date, dateRange) {
    return Boolean(
        date &&
            dateRange?.startDate &&
            dateRange?.endDate &&
            date >= dateRange.startDate &&
            date <= dateRange.endDate
    );
}

function resolveSelectedDate({ selectedDate = null, dateRange, now = new Date() }) {
    const today = extractDateFromDateTime(now);
    const candidate = selectedDate || storedSelectedInsightsDate;

    if (isDateWithinRange(candidate, dateRange)) {
        return candidate;
    }

    if (isDateWithinRange(today, dateRange)) {
        return today;
    }

    return dateRange?.endDate || today;
}
```

Import `extractDateFromDateTime` from `../utils.js`.

Export:

```js
export function setInsightsSelectedDate(date) {
    storedSelectedInsightsDate = date || null;
    selectedTimelineBlockId = null;
    activityLogVisibleLimit = DEFAULT_ACTIVITY_LOG_LIMIT;
}
```

- [ ] **Step 4: Update `renderInsightsView()` to pass selectedDate**

Change the signature to accept `selectedDate = null`.

Resolve:

```js
const effectiveDateRange = resolveDateRange({ dateRange, activityLogDateRange, now });
const effectiveSelectedDate = resolveSelectedDate({
    selectedDate,
    dateRange: effectiveDateRange,
    now
});
const model = buildInsightsModel({
    tasks,
    activities,
    runningActivity,
    now,
    selectedDate: effectiveSelectedDate
});
```

Do not pass `activityLogDateRange` into `buildInsightsModel()` for the main view unless a compatibility test requires it. The new main behavior is selected-day log.

- [ ] **Step 5: Replace `renderDailyTrendBars()` usage with day cards**

Implement in `insights-renderer.js`:

```js
function formatShortDate(date) {
    const parsed = new Date(`${date}T00:00:00`);
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatWeekday(date) {
    const parsed = new Date(`${date}T00:00:00`);
    return parsed.toLocaleDateString(undefined, { weekday: 'short' });
}

function renderTrendDayCard(day, selectedDate) {
    const minutes = Number(day.minutes) || 0;
    const segments = (day.categorySegments || [])
        .map((segment) => {
            const segmentMinutes = Number(segment.minutes) || 0;
            if (segmentMinutes <= 0 || minutes <= 0) {
                return '';
            }
            const width = Math.max(3, (segmentMinutes / minutes) * 100);
            return `<span class="block h-full" style="width: ${width}%; background-color: ${normalizeTimelineColor(
                segment.color
            )};"></span>`;
        })
        .join('');
    const selected = day.date === selectedDate;

    return `<button type="button" data-trend-day="${escapeHtml(day.date)}"
        data-selected="${selected ? 'true' : 'false'}"
        class="min-h-[7rem] rounded-lg border p-2 text-left ${
            selected
                ? 'border-cyan-400 bg-cyan-950/40 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45)]'
                : 'border-slate-700 bg-slate-950/80 hover:bg-slate-900'
        }">
        <div class="flex items-center justify-between text-[11px] font-semibold uppercase text-sky-300">
            <span>${escapeHtml(formatWeekday(day.date))}</span>
            <span>${escapeHtml(day.activityCount || 0)}</span>
        </div>
        <div class="mt-1 text-sm font-semibold text-slate-100">${escapeHtml(formatShortDate(day.date))}</div>
        <div class="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-800">
            ${segments || '<span class="block h-full w-full bg-slate-700"></span>'}
        </div>
        <div class="mt-2 text-sm font-semibold text-slate-100">${escapeHtml(calculateHoursAndMinutes(minutes))}</div>
        <div class="text-[11px] text-slate-500">${escapeHtml((day.categorySegments || []).length)} categories</div>
    </button>`;
}
```

Update `renderTrends(trendModel, { selectedDate })` to render:

```js
<section class="rounded-lg border border-slate-700 bg-slate-950/80 p-4 shadow-sm">
  ...
  <div data-trend-day-strip class="grid grid-cols-7 gap-2 md:grid-cols-14 overflow-x-auto md:overflow-visible">
    ${dailyHours.map((day) => renderTrendDayCard(day, selectedDate)).join('')}
  </div>
</section>
```

For 14-day desktop, prefer `md:grid-cols-14`. For mobile, use fixed min width:

```html
class="grid auto-cols-[8.5rem] grid-flow-col overflow-x-auto md:grid-flow-row md:grid-cols-14 ..."
```

- [ ] **Step 6: Ensure trend model exposes `activityCount`**

If `buildTrendModel()` does not expose day activity count, add it in `public/js/activities/insights-trends.js`:

```js
activityCount: dayActivities.length
```

Add/update a test in `__tests__/activity-insights-trends.test.js`.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js __tests__/activity-insights-trends.test.js
```

Expected: PASS.

Commit:

```bash
git add public/js/activities/insights-renderer.js public/js/activities/insights-trends.js __tests__/activity-insights-renderer.test.js __tests__/activity-insights-trends.test.js
git commit -m "Render selectable insight trend days"
```

---

### Task 3: Wire Trend Day Selection

**Files:**
- Modify: `public/js/activities/app-wiring.js`
- Modify: `public/js/activities/insights-renderer.js`
- Test: `__tests__/activity-insights-renderer.test.js` or existing app-wiring test if present

- [ ] **Step 1: Add failing event-handler test**

Prefer testing renderer behavior with DOM events if no app-wiring test already covers Insights events:

```js
test('trend day click updates selected insights date on next render', () => {
    renderInsightsView({
        activities: [],
        now: new Date('2026-06-16T12:00:00'),
        dateRange: { startDate: '2026-06-10', endDate: '2026-06-16' }
    });

    setInsightsSelectedDate('2026-06-15');

    renderInsightsView({
        activities: [],
        now: new Date('2026-06-16T12:00:00'),
        dateRange: { startDate: '2026-06-10', endDate: '2026-06-16' }
    });

    expect(document.querySelector('[data-trend-day="2026-06-15"]').dataset.selected).toBe('true');
});
```

This tests state directly. Add a separate wiring test only if existing wiring tests have a clean pattern.

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js
```

Expected: FAIL until `setInsightsSelectedDate` export/state is complete.

- [ ] **Step 3: Wire clicks in `app-wiring.js`**

Import:

```js
import {
    expandInsightsActivityLogLimit,
    setInsightsTrendDateRange,
    setInsightsSelectedDate,
    setSelectedTimelineBlock
} from './insights-renderer.js';
```

Update `initializeInsightsTrendEventHandlers()` or create a delegated listener:

```js
export function initializeInsightsTrendEventHandlers(container, { onInsightsChanged, signal } = {}) {
    container?.addEventListener(
        'click',
        (event) => {
            const dayButton = event.target.closest('[data-trend-day]');
            if (dayButton) {
                setInsightsSelectedDate(dayButton.dataset.trendDay);
                onInsightsChanged?.();
                return;
            }
            // keep existing start/end date handling here
        },
        { signal }
    );
}
```

Use the existing callback already passed from `app.js`/activity wiring. Do not introduce a new app-global state object.

- [ ] **Step 4: Run focused wiring/renderer tests and commit**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js __tests__/activity-app-wiring.test.js
```

If `activity-app-wiring.test.js` does not exist, run only renderer and any existing app wiring test file discovered via `rg "initializeInsightsTrendEventHandlers" __tests__`.

Commit:

```bash
git add public/js/activities/app-wiring.js public/js/activities/insights-renderer.js __tests__/activity-insights-renderer.test.js
git commit -m "Wire insight trend day selection"
```

---

### Task 4: Focus Timeline Viewport And Selected Block Detail

**Files:**
- Modify: `public/js/activities/insights-renderer.js`
- Test: `__tests__/activity-insights-renderer.test.js`

- [ ] **Step 1: Add failing focused timeline test**

Add a renderer test:

```js
test('timeline renders focused range and compact narrow blocks', () => {
    renderInsightsView({
        tasks: [
            {
                id: 'planned-1',
                type: 'scheduled',
                description: 'meeting',
                startDateTime: '2026-06-16T10:20:00',
                endDateTime: '2026-06-16T10:40:00',
                duration: 20,
                status: 'pending'
            }
        ],
        activities: [
            {
                id: 'actual-1',
                description: 'standup',
                startDateTime: '2026-06-16T10:00:00',
                endDateTime: '2026-06-16T10:30:00',
                duration: 30
            },
            {
                id: 'actual-2',
                description: 'tiny review',
                startDateTime: '2026-06-16T10:39:00',
                endDateTime: '2026-06-16T10:48:00',
                duration: 9
            }
        ],
        now: new Date('2026-06-16T12:00:00'),
        selectedDate: '2026-06-16'
    });

    expect(document.querySelector('[data-timeline-range]').textContent).toContain('9:30 AM');
    const narrow = document.querySelector('[data-timeline-block-id="actual-2"]');
    expect(narrow.dataset.compact).toBe('true');
});
```

- [ ] **Step 2: Run renderer test and verify failure**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js
```

Expected: FAIL because viewport/compact data does not exist.

- [ ] **Step 3: Add viewport helpers**

In `insights-renderer.js`, add:

```js
const TIMELINE_VIEWPORT_PADDING_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;
const COMPACT_TIMELINE_BLOCK_PERCENT = 9;

function getMinutesFromDateTime(dateTime) {
    const date = new Date(dateTime);
    return date.getHours() * 60 + date.getMinutes();
}

function getTimelineViewport(blocks = []) {
    if (blocks.length === 0) {
        return { startMinutes: 0, endMinutes: MINUTES_PER_DAY };
    }

    const starts = blocks.map((block) => getMinutesFromDateTime(block.startDateTime));
    const ends = blocks.map((block) => getMinutesFromDateTime(block.endDateTime));
    const startMinutes = Math.max(0, Math.min(...starts) - TIMELINE_VIEWPORT_PADDING_MINUTES);
    const endMinutes = Math.min(
        MINUTES_PER_DAY,
        Math.max(...ends) + TIMELINE_VIEWPORT_PADDING_MINUTES
    );

    if (endMinutes <= startMinutes) {
        return { startMinutes: 0, endMinutes: MINUTES_PER_DAY };
    }

    return { startMinutes, endMinutes };
}

function getViewportBlockStyle(block, viewport) {
    const color = normalizeTimelineColor(block.categoryMeta?.color);
    const startMinutes = getMinutesFromDateTime(block.startDateTime);
    const endMinutes = getMinutesFromDateTime(block.endDateTime);
    const viewportMinutes = viewport.endMinutes - viewport.startMinutes;
    const leftPercent = Math.max(
        0,
        Math.min(100, ((startMinutes - viewport.startMinutes) / viewportMinutes) * 100)
    );
    const widthPercent = Math.max(
        0.8,
        Math.min(100 - leftPercent, ((endMinutes - startMinutes) / viewportMinutes) * 100)
    );

    return { style: `left: ${leftPercent}%; width: ${widthPercent}%; background-color: ${color};`, widthPercent };
}
```

- [ ] **Step 4: Render focused range header and compact labels**

Change `renderTimeline(model)`:

```js
const allBlocks = [...model.plannedBlocks, ...model.actualBlocks];
const viewport = getTimelineViewport(allBlocks);
timelineContainer.innerHTML = `<div class="rounded-lg border border-slate-700 bg-slate-950/80 p-4">
    <div class="mb-3 flex items-start justify-between gap-3">
        <div>
            <h3 class="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">Plan vs Actual</h3>
            <div data-timeline-range class="mt-1 text-xs text-slate-400">
                Focused range: ${escapeHtml(formatMinutesAsTime(viewport.startMinutes))} - ${escapeHtml(formatMinutesAsTime(viewport.endMinutes))}
            </div>
        </div>
        <div class="text-xs text-slate-500">Tap any block for details</div>
    </div>
    ${renderTimelineTicks(viewport)}
    <div class="space-y-3">
        ${renderTimelineRow('Planned', 'planned', model.plannedBlocks, viewport)}
        ${renderTimelineRow('Actual', 'actual', model.actualBlocks, viewport)}
    </div>
    ${renderSelectedTimelineBlockDetail(allBlocks)}
</div>`;
```

Implement `formatMinutesAsTime()` using existing `convertTo12HourTime()`:

```js
function formatMinutesAsTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return convertTo12HourTime(`${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`);
}
```

Update `renderTimelineBlock(block, type, viewport)` to:

- include `data-timeline-block-id="${escapeHtml(block.id)}"`
- include `data-compact="${widthPercent < COMPACT_TIMELINE_BLOCK_PERCENT ? 'true' : 'false'}"`
- use taller classes: `top-2 h-9 leading-9`
- hide inline label for compact blocks:

```js
${widthPercent < COMPACT_TIMELINE_BLOCK_PERCENT ? '' : escapeHtml(label)}
```

- [ ] **Step 5: Add selected block detail state and rendering**

Export:

```js
export function setSelectedTimelineBlock(blockId) {
    selectedTimelineBlockId = blockId || null;
}
```

Render:

```js
function renderSelectedTimelineBlockDetail(blocks) {
    const selectedBlock =
        blocks.find((block) => block.id === selectedTimelineBlockId) ||
        blocks.find((block) => block.id);

    if (!selectedBlock) {
        return '<div class="mt-3 rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-500">No timeline blocks for this day.</div>';
    }

    const label = getItemLabel(selectedBlock);
    const timeRange = `${formatTime(selectedBlock.startDateTime)} - ${formatTime(selectedBlock.endDateTime)}`;

    return `<div data-selected-timeline-block class="mt-3 rounded-lg border border-cyan-900/70 bg-cyan-950/20 px-3 py-2 text-sm text-cyan-100">
        <span class="text-slate-400">Selected block:</span>
        <span class="font-semibold text-white">${escapeHtml(label)}</span>
        <span>${escapeHtml(timeRange)}</span>
        <span>${escapeHtml(calculateHoursAndMinutes(selectedBlock.duration))}</span>
    </div>`;
}
```

- [ ] **Step 6: Wire timeline block click**

In `app-wiring.js`, add delegated click handling on `#insights-timeline`:

```js
export function initializeInsightsTimelineEventHandlers(container, { onInsightsChanged, signal } = {}) {
    container?.addEventListener(
        'click',
        (event) => {
            const block = event.target.closest('[data-timeline-block-id]');
            if (!block) {
                return;
            }
            setSelectedTimelineBlock(block.dataset.timelineBlockId);
            onInsightsChanged?.();
        },
        { signal }
    );
}
```

Wire it from the activity app setup where other insights handlers are initialized.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js
```

Expected: PASS.

Commit:

```bash
git add public/js/activities/insights-renderer.js public/js/activities/app-wiring.js __tests__/activity-insights-renderer.test.js
git commit -m "Focus insights timeline on selected day"
```

---

### Task 5: Day-Scoped Activity Log UI

**Files:**
- Modify: `public/js/activities/insights-renderer.js`
- Test: `__tests__/activity-insights-renderer.test.js`

- [ ] **Step 1: Add failing Activity Log scope/title test**

Add:

```js
test('activity log title and rows are scoped to selected day', () => {
    renderInsightsView({
        activities: [
            {
                id: 'selected-day',
                description: 'selected day activity',
                startDateTime: '2026-06-15T10:00:00',
                endDateTime: '2026-06-15T10:30:00',
                duration: 30
            },
            {
                id: 'other-day',
                description: 'other day activity',
                startDateTime: '2026-06-16T10:00:00',
                endDateTime: '2026-06-16T10:30:00',
                duration: 30
            }
        ],
        now: new Date('2026-06-16T12:00:00'),
        selectedDate: '2026-06-15'
    });

    expect(document.getElementById('insights-activity-log').textContent).toContain('Jun 15');
    expect(document.getElementById('insights-activity-list').textContent).toContain('selected day activity');
    expect(document.getElementById('insights-activity-list').textContent).not.toContain('other day activity');
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js
```

Expected: FAIL until Activity Log title is rendered and model selected-date behavior is connected.

- [ ] **Step 3: Render selected-day log heading**

Update `renderActivityLog(model, activityRenderOptions)` to set the wrapper heading before rendering rows. The current `index.html` already has:

```html
<div id="insights-activity-log">
    <h2 ...>Activity Log</h2>
    <div id="insights-activity-summary"></div>
    <div id="insights-activity-list"></div>
</div>
```

Use the existing heading if present:

```js
function formatLongDate(date) {
    const parsed = new Date(`${date}T00:00:00`);
    return parsed.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}
```

Set:

```js
const heading = document.querySelector('#insights-activity-log h2');
if (heading) {
    heading.textContent = `Activity Log · ${formatLongDate(model.date)}`;
}
```

Also make sure `summaryActivities: model.activityLog` remains selected-day only.

- [ ] **Step 4: Revisit Show More behavior**

Keep `DEFAULT_ACTIVITY_LOG_LIMIT = 50`. Because the log is day-scoped, show-more will rarely appear but remains useful for very large days. No new behavior needed.

- [ ] **Step 5: Add selected-day empty state**

Render a selected-day empty state when `model.activityLog.length === 0`:

```html
<div class="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-4 text-sm text-slate-400">
    No activities logged for Tue, Jun 16.
</div>
```

Add a renderer test:

```js
test('activity log renders selected-day empty state', () => {
    renderInsightsView({
        activities: [],
        now: new Date('2026-06-16T12:00:00'),
        selectedDate: '2026-06-15'
    });

    expect(document.getElementById('insights-activity-list').textContent).toContain(
        'No activities logged for'
    );
    expect(document.getElementById('insights-activity-list').textContent).toContain('Jun 15');
});
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js
```

Expected: PASS.

Commit:

```bash
git add public/js/activities/insights-renderer.js __tests__/activity-insights-renderer.test.js
git commit -m "Scope insights activity log to selected day"
```

---

### Task 6: Polish Mobile/Responsive Trends

**Files:**
- Modify: `public/js/activities/insights-renderer.js`
- Test: `__tests__/activity-insights-renderer.test.js`
- Optional manual check: browser/preview

- [ ] **Step 1: Add markup/class regression test**

Add a test asserting the day strip has horizontal-scroll affordance for small screens:

```js
test('trend day strip supports horizontal scrolling on small screens', () => {
    renderInsightsView({
        activities: [],
        now: new Date('2026-06-16T12:00:00'),
        dateRange: { startDate: '2026-06-03', endDate: '2026-06-16' }
    });

    const strip = document.querySelector('[data-trend-day-strip]');
    expect(strip.className).toContain('overflow-x-auto');
    expect(strip.className).toContain('auto-cols');
});
```

- [ ] **Step 2: Run test and verify failure/pass**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js
```

Expected: FAIL if classes are not final yet.

- [ ] **Step 3: Finalize responsive classes**

Use:

```html
class="grid auto-cols-[8.5rem] grid-flow-col gap-2 overflow-x-auto pb-1 md:auto-cols-auto md:grid-flow-row md:grid-cols-14 md:overflow-visible md:pb-0"
```

For 7-day ranges this still works. For 14-day ranges, desktop can show compact cards in a grid when space allows. For 30-day ranges, horizontal scroll is acceptable on desktop and mobile; do not compress 30 day cards into unreadable columns.

- [ ] **Step 4: Run focused tests and commit**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-renderer.test.js
```

Commit:

```bash
git add public/js/activities/insights-renderer.js __tests__/activity-insights-renderer.test.js
git commit -m "Polish responsive insight trend days"
```

---

### Task 7: Full Verification And PR Refresh

**Files:**
- No source edits unless verification finds issues.

- [ ] **Step 1: Run focused Insights suites**

Run:

```bash
npm.cmd test -- --runInBand __tests__/activity-insights-model.test.js __tests__/activity-insights-renderer.test.js __tests__/activity-insights-trends.test.js
```

Expected: PASS.

- [ ] **Step 2: Run repo check**

Run:

```bash
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 3: Run full Jest suite**

Run:

```bash
npm.cmd test -- --runInBand
```

Expected: PASS, currently around 54 suites / 1157 tests plus new tests.

- [ ] **Step 4: Optional browser check**

If local browser/server is working, run from the worktree:

```bash
npx http-server ./public -p 5000 -c-1
```

Open:

```txt
http://127.0.0.1:5000
```

Verify:

- Trends is visible without expanding details.
- Clicking a day updates summary/timeline/log.
- Activity Log heading includes the selected day.
- 14-day range day cards are usable on desktop width.
- Mobile width presents horizontal day scrolling and single-day log.

- [ ] **Step 5: Commit any verification fixes**

If fixes were needed, make a narrow commit:

```bash
git add <changed-files>
git commit -m "Fix day-focused insights verification issues"
```

- [ ] **Step 6: Push branch**

Run:

```bash
git push
```

- [ ] **Step 7: Update PR description**

Update PR #71 `Bundled Changes` or `Summary` to mention:

```md
- Rework Insights into a range-level Trends view with selected-day summary, focused timeline, and day-scoped Activity Log.
```

- [ ] **Step 8: Confirm GitHub checks and preview**

Run:

```bash
gh run list --repo iconix/fortudo --branch phase5-activities-insights --limit 3
```

Wait for CI/CD and Security Checks to pass. Fetch the PR preview comment and report the refreshed URL/expiry.

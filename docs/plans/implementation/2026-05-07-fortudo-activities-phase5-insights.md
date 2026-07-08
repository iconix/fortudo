# Phase 5 Activities Insights Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Activities Insights view that lets users compare today's planned schedule against actual tracked activity, review data issues, and inspect lightweight trend charts.

**Architecture:** Keep task rendering and activity editing in their current modules. Add a focused insights model/renderer pair under `public/js/activities/`, plus a small app-level view toggle module that shows either the existing task surface or the new insights surface. The existing activity list renderer remains the single owner of activity row markup and inline edit/delete UI, but it can render into either `#activity-list` or the new `#insights-activity-list`.

**Tech Stack:** Vanilla JavaScript ES modules, PouchDB-backed state already loaded in memory, Tailwind utility classes, Font Awesome icons, Jest 30 + jsdom, existing Python smoke suite.

**Design Source:** `docs/plans/design/2026-03-16-fortudo-activities-design.md`, "UI: Insights View" and "Next Planned Work / Phase 5".

**Visual Reference:** `public/phase5-insights-mockup.html` is the Phase 5 UI target. Treat it as the aesthetic and layout reference for the production implementation, while still using production modules and existing renderers rather than copying static mockup markup wholesale.

---

## File Map

**Create:**

| File                                           | Responsibility                                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `public/js/activities/insights-model.js`       | Pure selectors for today's planned/actual data, timeline blocks, summary stats, data issues, and trend buckets.            |
| `public/js/activities/insights-renderer.js`    | DOM rendering for the Insights dashboard, timeline, stats, inline activity-log data issues, trends, and activity-log slot. |
| `public/js/activities/view-toggle.js`          | Header Tasks/Insights toggle state, visibility sync, keyboard shortcut, and active-view rendering hook.                    |
| `__tests__/activity-insights-model.test.js`    | Pure model tests for summaries, timeline ranges, issues, trends, and live timer inclusion.                                 |
| `__tests__/activity-insights-renderer.test.js` | DOM rendering tests for Insights sections and empty states.                                                                |
| `__tests__/activity-view-toggle.test.js`       | View toggle state, DOM visibility, and keyboard shortcut tests.                                                            |

**Modify:**

| File                                  | Changes                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/index.html`                   | Add header Tasks/Insights segmented control and wrap task/activity content in `#tasks-view`; add hidden `#insights-view` with required containers. |
| `public/js/app.js`                    | Initialize the view toggle after activities UI setup; render Insights during refresh when Activities are enabled.                                  |
| `public/js/dom-renderer.js`           | Notify the view toggle after task/activity refreshes so Insights stays current.                                                                    |
| `public/js/activities/ui-handlers.js` | Make activity-list interactions work for both existing list and Insights list; expose shared activity render options for Insights reuse.           |
| `public/js/activities/app-wiring.js`  | Attach delegated submit/keydown/input listeners to both activity-list containers and wire Insights trend filter changes.                           |
| `public/js/activities/renderer.js`    | Optionally add a section-title/summary toggle option if Insights needs to omit duplicate heading chrome.                                           |
| `__tests__/test-utils.js`             | Add Tasks/Insights DOM containers and toggle buttons to `setupDOM()`.                                                                              |
| Existing tests                        | Update DOM expectations where the task surface is now wrapped in `#tasks-view`.                                                                    |

---

## Implementation Notes

- Activities disabled means no Insights tab and no Insights DOM rendering. The current task UI must continue to behave exactly as it does now.
- Match the improved Phase 5 mockup's visual direction: compact slate panels, Tailwind utility
  styling consistent with the existing app, Font Awesome icons in controls/status badges,
  category-colored timeline blocks, inline Activity Log issue rows, and lightweight hand-rolled
  chart visuals. Do not regress to the earlier plain/wireframe mockup treatment.
- The info panel's clock/date stays visible in both Tasks and Insights views, so do not place it inside
  `#tasks-view`. Task-specific footer actions such as Clear Schedule should be hidden while the
  Insights tab is active.
- Reuse `renderActivities(activities, container, options)` for the Insights Activity Log. Do not duplicate activity row/edit/delete markup.
- The Activity Log inside Insights is not today-only. It should follow the Insights date range so
  yesterday's and earlier activities can be reviewed and edited. Keep the visible list bounded with
  a "Show more" affordance for long ranges.
- Keep today's summary/timeline data separate from Activity Log range data. Summary stats and the
  Plan vs Actual timeline are today-scoped; the Activity Log and its inline row issue annotations
  are scoped to the selected Insights date range.
- `Show more` must be functional, not static chrome. It needs renderer state or callback-driven
  paging, tests that clicking it increases the rendered activity count, and continued edit/delete
  delegation after expansion.
- Data issues should be embedded into affected Activity Log rows with badges, warning row styling,
  and concise inline text. Keep a compact issue count in summary/header chrome, but do not add a
  separate data-issues pane unless row-level affordances prove insufficient.
- Summary totals and actual timeline blocks must include `getLiveTodayActivitySummary()` when a timer is running today.
- In-progress timer ranges use `now` as the display end time. Stored midnight rollover behavior stays owned by `app-lifecycle.js`.
- Fortudo does not currently persist late-task history. Phase 5 must explicitly decide whether the
  "late count" is only a live count of currently overdue incomplete scheduled tasks, or whether to
  add persisted completion metadata such as `completedAt` and original planned end time for
  historical completed-late insights.
- If Phase 5 keeps the v1 late count live-only, label it as currently late/overdue in UI copy and
  tests. Do not silently present it as historical completed-late behavior.
- Trends are v1 hand-rolled HTML/CSS/SVG. Do not add Chart.js in this phase.
- Timeline blocks must be colored by category, with a stable uncategorized fallback. Use
  planned/actual row labels and section chrome to distinguish rows rather than overriding block
  colors.
- Trends must follow the mockup direction: a hand-rolled time-by-category donut/legend visual, a
  stacked daily-hours bar chart with subtle gridlines, and a date-range filter.
- Keep `app.js` thin. It should wire the view toggle and pass callbacks; model/rendering logic belongs in the new activities modules.

---

## Task 1: Add Pure Insights Model

**Files:**

- Create: `public/js/activities/insights-model.js`
- Test: `__tests__/activity-insights-model.test.js`

- [ ] **Step 1: Write failing tests for summary stats**

Create `__tests__/activity-insights-model.test.js` with fixtures for scheduled tasks and activities on `2026-05-07`.

```js
/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
  getGroupByKey: jest.fn((key) => {
    if (key === 'work') {
      return { key: 'work', label: 'Work', color: '#0f172a' };
    }
    return null;
  }),
  resolveCategoryKey: jest.fn((key) => {
    const records = {
      'work/deep': {
        kind: 'category',
        record: {
          key: 'work/deep',
          label: 'Deep Work',
          groupKey: 'work',
          color: '#0ea5e9'
        }
      },
      work: {
        kind: 'group',
        record: { key: 'work', label: 'Work', color: '#0f172a' }
      }
    };
    return records[key] || null;
  })
}));

import {
  buildInsightsModel,
  detectActivityDataIssues,
  buildTrendModel,
  getDefaultTrendDateRange
} from '../public/js/activities/insights-model.js';

const today = new Date('2026-05-07T12:00:00.000Z');

describe('activity insights model', () => {
  test('builds today summary stats from planned tasks and actual activities', () => {
    const model = buildInsightsModel({
      tasks: [
        scheduledTask('sched-1', 'Deep work', '09:00', 60, 'completed'),
        scheduledTask('sched-2', 'Planning', '10:30', 30, 'incomplete')
      ],
      activities: [
        activity('activity-1', 'Deep work', '09:05', 50, 'auto', 'sched-1'),
        activity('activity-2', 'Admin', '11:00', 20, 'manual', null)
      ],
      runningActivity: null,
      now: today
    });

    expect(model.stats).toEqual(
      expect.objectContaining({
        totalPlannedMinutes: 90,
        totalActualMinutes: 70,
        completedTaskCount: 1,
        currentlyLateTaskCount: 0
      })
    );
    expect(model.timeline.plannedBlocks).toHaveLength(2);
    expect(model.timeline.actualBlocks).toHaveLength(2);
  });
});

test('filters insights activity log by selected date range', () => {
  const model = buildInsightsModel({
    tasks: [],
    activities: [
      activity('activity-today', 'Today', '09:00', 30),
      {
        ...activity('activity-yesterday', 'Yesterday', '09:00', 45),
        startDateTime: '2026-05-06T09:00:00.000Z',
        endDateTime: '2026-05-06T09:45:00.000Z'
      }
    ],
    activityLogDateRange: { startDate: '2026-05-06', endDate: '2026-05-06' },
    now: today
  });

  expect(model.activities).toHaveLength(1);
  expect(model.activities[0].id).toBe('activity-yesterday');
});

test('detects activity log issues inside the selected historical range', () => {
  const model = buildInsightsModel({
    tasks: [],
    activities: [
      {
        ...activity('old-1', 'Older overlap A', '09:00', 60),
        startDateTime: '2026-05-06T09:00:00.000Z',
        endDateTime: '2026-05-06T10:00:00.000Z'
      },
      {
        ...activity('old-2', 'Older overlap B', '09:30', 30),
        startDateTime: '2026-05-06T09:30:00.000Z',
        endDateTime: '2026-05-06T10:00:00.000Z'
      }
    ],
    activityLogDateRange: { startDate: '2026-05-06', endDate: '2026-05-06' },
    now: today
  });

  expect(model.activityLogIssues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'overlap', activityId: 'old-2' })
    ])
  );
});
```

Include local helpers in the test:

```js
function isoAt(time) {
  return `2026-05-07T${time}:00.000Z`;
}

function scheduledTask(
  id,
  description,
  startTime,
  duration,
  status = 'incomplete'
) {
  const startDateTime = isoAt(startTime);
  const endDateTime = new Date(
    new Date(startDateTime).getTime() + duration * 60000
  ).toISOString();
  return {
    id,
    type: 'scheduled',
    description,
    startDateTime,
    endDateTime,
    duration,
    status,
    category: 'work/deep'
  };
}

function activity(
  id,
  description,
  startTime,
  duration,
  source = 'manual',
  sourceTaskId = null
) {
  const startDateTime = isoAt(startTime);
  const endDateTime = new Date(
    new Date(startDateTime).getTime() + duration * 60000
  ).toISOString();
  return {
    id,
    docType: 'activity',
    description,
    startDateTime,
    endDateTime,
    duration,
    source,
    sourceTaskId,
    category: 'work/deep'
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx.cmd jest __tests__/activity-insights-model.test.js --runInBand`

Expected: FAIL because `activities/insights-model.js` does not exist.

- [ ] **Step 3: Implement the minimal insights model**

Create `public/js/activities/insights-model.js`:

```js
import { extractDateFromDateTime } from '../utils.js';
import {
  getGroupByKey,
  resolveCategoryKey
} from '../taxonomy/taxonomy-selectors.js';

function clone(value) {
  return value ? { ...value } : value;
}

function toDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameLocalDay(dateTime, now) {
  const parsed = toDate(dateTime);
  if (!parsed) return false;
  return extractDateFromDateTime(parsed) === extractDateFromDateTime(now);
}

function filterActivitiesByDateRange(activityItems, dateRange) {
  if (!dateRange?.startDate && !dateRange?.endDate) {
    return activityItems.slice();
  }

  return activityItems.filter((activityItem) => {
    const dateKey = extractDateFromDateTime(
      new Date(activityItem.startDateTime)
    );
    if (dateRange.startDate && dateKey < dateRange.startDate) return false;
    if (dateRange.endDate && dateKey > dateRange.endDate) return false;
    return true;
  });
}

export function getDefaultTrendDateRange(now = new Date(), days = 14) {
  const end = now instanceof Date ? now : new Date(now);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return {
    startDate: extractDateFromDateTime(start),
    endDate: extractDateFromDateTime(end)
  };
}

function durationBetween(startDateTime, endDateTime) {
  const start = toDate(startDateTime);
  const end = toDate(endDateTime);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

function resolveCategoryMetadata(categoryKey) {
  if (!categoryKey) {
    return {
      key: 'uncategorized',
      label: 'Uncategorized',
      color: '#64748b',
      isUncategorized: true
    };
  }

  const resolved = resolveCategoryKey(categoryKey);
  if (!resolved) {
    const parentKey = categoryKey.split('/')[0] || categoryKey;
    const parentGroup = getGroupByKey(parentKey);
    return {
      key: parentKey,
      label: parentGroup?.label || parentKey,
      color: parentGroup?.color || '#64748b',
      isUncategorized: false
    };
  }

  if (resolved.kind === 'group') {
    return {
      key: resolved.record.key,
      label: resolved.record.label,
      color: resolved.record.color,
      isUncategorized: false
    };
  }

  const parentGroup = getGroupByKey(resolved.record.groupKey);
  return {
    key: resolved.record.key,
    label: resolved.record.label,
    parentKey: resolved.record.groupKey,
    parentLabel: parentGroup?.label || resolved.record.groupKey,
    color: resolved.record.color,
    isUncategorized: false
  };
}

function buildTimelineBlock(item, kind, rangeStartMs, rangeEndMs, now) {
  const start = toDate(item.startDateTime);
  const end = toDate(item.endDateTime) || now;
  const safeEnd = end < start ? start : end;
  const rangeMs = Math.max(1, rangeEndMs - rangeStartMs);
  const left = ((start - rangeStartMs) / rangeMs) * 100;
  const width = ((safeEnd - start) / rangeMs) * 100;

  return {
    id: item.id,
    kind,
    description: item.description,
    category: item.category || null,
    categoryMeta: resolveCategoryMetadata(item.category || null),
    startDateTime: start.toISOString(),
    endDateTime: safeEnd.toISOString(),
    duration: durationBetween(start, safeEnd),
    leftPercent: Math.max(0, Math.min(100, left)),
    widthPercent: Math.max(0.5, Math.min(100, width)),
    source: item.source || null,
    sourceTaskId: item.sourceTaskId || null
  };
}

export function buildInsightsModel({
  tasks = [],
  activities = [],
  runningActivity = null,
  activityLogDateRange = null,
  now = new Date()
} = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const plannedTasks = tasks
    .filter(
      (task) =>
        task.type === 'scheduled' && isSameLocalDay(task.startDateTime, nowDate)
    )
    .map(clone);
  const todayCompletedActivities = activities
    .filter((activityItem) =>
      isSameLocalDay(activityItem.startDateTime, nowDate)
    )
    .map(clone);
  const allCompletedActivities = activities.map(clone);
  const liveActivity =
    runningActivity && isSameLocalDay(runningActivity.startDateTime, nowDate)
      ? {
          ...runningActivity,
          id: runningActivity.id || 'running-activity-summary',
          endDateTime: nowDate.toISOString(),
          duration: durationBetween(
            runningActivity.startDateTime,
            nowDate.toISOString()
          )
        }
      : null;
  const actualActivities = liveActivity
    ? [...todayCompletedActivities, liveActivity]
    : todayCompletedActivities;
  const allRangeDates = [...plannedTasks, ...actualActivities]
    .flatMap((item) => [toDate(item.startDateTime), toDate(item.endDateTime)])
    .filter(Boolean);
  const defaultRangeStart = new Date(nowDate);
  defaultRangeStart.setHours(8, 0, 0, 0);
  const defaultRangeEnd = new Date(nowDate);
  defaultRangeEnd.setHours(18, 0, 0, 0);
  const rangeStartMs = allRangeDates.length
    ? Math.min(...allRangeDates.map((date) => date.getTime()))
    : defaultRangeStart.getTime();
  const rangeEndMs = allRangeDates.length
    ? Math.max(...allRangeDates.map((date) => date.getTime()))
    : defaultRangeEnd.getTime();

  const logActivities = filterActivitiesByDateRange(
    allCompletedActivities,
    activityLogDateRange
  ).sort(
    (left, right) => new Date(right.endDateTime) - new Date(left.endDateTime)
  );

  return {
    stats: {
      totalPlannedMinutes: plannedTasks.reduce(
        (sum, task) => sum + (task.duration || 0),
        0
      ),
      totalActualMinutes: actualActivities.reduce(
        (sum, activityItem) => sum + (activityItem.duration || 0),
        0
      ),
      completedTaskCount: plannedTasks.filter(
        (task) => task.status === 'completed'
      ).length,
      currentlyLateTaskCount: plannedTasks.filter(
        (task) =>
          task.status !== 'completed' && toDate(task.endDateTime) < nowDate
      ).length
    },
    timeline: {
      rangeStartDateTime: new Date(rangeStartMs).toISOString(),
      rangeEndDateTime: new Date(rangeEndMs).toISOString(),
      plannedBlocks: plannedTasks.map((task) =>
        buildTimelineBlock(task, 'planned', rangeStartMs, rangeEndMs, nowDate)
      ),
      actualBlocks: actualActivities.map((activityItem) =>
        buildTimelineBlock(
          activityItem,
          'actual',
          rangeStartMs,
          rangeEndMs,
          nowDate
        )
      )
    },
    activities: logActivities,
    summaryActivities: actualActivities,
    issues: detectActivityDataIssues(actualActivities),
    activityLogIssues: detectActivityDataIssues(logActivities)
  };
}
```

- [ ] **Step 4: Add and test data issue detection**

Extend the test with:

```js
test('detects overlaps, invalid ranges, and duplicate auto logs', () => {
  const issues = detectActivityDataIssues([
    activity('activity-1', 'A', '09:00', 60, 'auto', 'sched-1'),
    activity('activity-2', 'B', '09:30', 30, 'manual', null),
    {
      ...activity('activity-3', 'C', '12:00', 20, 'manual', null),
      endDateTime: isoAt('11:50')
    },
    activity('activity-4', 'A duplicate', '13:00', 30, 'auto', 'sched-1')
  ]);

  expect(issues.map((issue) => issue.type)).toEqual(
    expect.arrayContaining(['overlap', 'invalid-range', 'duplicate-auto'])
  );
});
```

Implement:

```js
export function detectActivityDataIssues(activities = []) {
  const issues = [];
  const sorted = activities
    .slice()
    .sort(
      (left, right) =>
        new Date(left.startDateTime) - new Date(right.startDateTime)
    );
  const autoByTask = new Map();

  for (const activityItem of sorted) {
    const start = toDate(activityItem.startDateTime);
    const end = toDate(activityItem.endDateTime);
    if (!start || !end || end < start) {
      issues.push({
        type: 'invalid-range',
        activityId: activityItem.id,
        severity: 'warning'
      });
    }
    if (activityItem.source === 'auto' && activityItem.sourceTaskId) {
      const existing = autoByTask.get(activityItem.sourceTaskId);
      if (existing) {
        issues.push({
          type: 'duplicate-auto',
          activityId: activityItem.id,
          relatedActivityId: existing.id,
          sourceTaskId: activityItem.sourceTaskId,
          severity: 'warning'
        });
      } else {
        autoByTask.set(activityItem.sourceTaskId, activityItem);
      }
    }
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (toDate(current.startDateTime) < toDate(previous.endDateTime)) {
      issues.push({
        type: 'overlap',
        activityId: current.id,
        relatedActivityId: previous.id,
        severity: 'warning'
      });
    }
  }

  return issues;
}
```

- [ ] **Step 5: Add and test trend buckets**

Add tests:

```js
test('builds filtered trend buckets and category totals with labels and colors', () => {
  const model = buildTrendModel({
    activities: [
      activity('activity-1', 'Today', '09:00', 60),
      {
        ...activity('activity-2', 'Yesterday', '09:00', 30),
        startDateTime: '2026-05-06T09:00:00.000Z',
        endDateTime: '2026-05-06T09:30:00.000Z'
      }
    ],
    now: today,
    dateRange: { startDate: '2026-04-24', endDate: '2026-05-07' }
  });

  expect(model.dateRange).toEqual({
    startDate: '2026-04-24',
    endDate: '2026-05-07'
  });
  expect(model.dailyHours).toHaveLength(14);
  expect(model.dailyHours.at(-1)).toEqual(
    expect.objectContaining({
      date: '2026-05-07',
      minutes: 60,
      categorySegments: expect.arrayContaining([
        expect.objectContaining({ key: 'work', minutes: 60 })
      ])
    })
  );
  expect(model.categoryTotals[0]).toEqual(
    expect.objectContaining({
      key: 'work',
      label: 'Work',
      color: '#0f172a',
      minutes: 90
    })
  );
});

test('builds the default trend date range from the last 14 local days', () => {
  expect(getDefaultTrendDateRange(today)).toEqual({
    startDate: '2026-04-24',
    endDate: '2026-05-07'
  });
});
```

Implement `buildTrendModel({ activities, now, days = 14, dateRange = null })` using
`getDefaultTrendDateRange(now, days)` when no range is provided. It returns
`{ dateRange, dailyHours, categoryTotals }`. Each `dailyHours` item must include
`{ date, minutes, categorySegments }`, where `categorySegments` contains parent-category grouped
segments with `key`, `label`, `color`, and `minutes`. The default range is the last 14 local days
ending today. A provided range filters both the daily bars and category totals. Aggregate child
categories by parent group, and include `label` and `color` on each category total so the renderer
can draw the category chart without guessing from raw keys.

- [ ] **Step 6: Run targeted model tests**

Run: `npx.cmd jest __tests__/activity-insights-model.test.js --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/js/activities/insights-model.js __tests__/activity-insights-model.test.js
git commit -m "feat: add activity insights model selectors"
```

---

## Task 2: Add Insights DOM Shell

**Files:**

- Modify: `public/index.html`
- Modify: `__tests__/test-utils.js`
- Test: `__tests__/activity-view-toggle.test.js`

- [ ] **Step 1: Write failing DOM tests for required containers**

Create `__tests__/activity-view-toggle.test.js`:

```js
/**
 * @jest-environment jsdom
 */

import { setupDOM } from './test-utils.js';

describe('insights DOM shell', () => {
  test('test DOM includes view toggle and insights containers', () => {
    setupDOM();

    expect(document.getElementById('tasks-view')).not.toBeNull();
    expect(document.getElementById('insights-view')).not.toBeNull();
    expect(document.getElementById('view-toggle-tasks')).not.toBeNull();
    expect(document.getElementById('view-toggle-insights')).not.toBeNull();
    expect(document.getElementById('insights-summary')).not.toBeNull();
    expect(document.getElementById('insights-timeline')).not.toBeNull();
    expect(document.getElementById('insights-activity-list')).not.toBeNull();
    expect(document.getElementById('insights-trends')).not.toBeNull();
  });
});
```

Expected initial failure because `setupDOM()` does not include the new containers.

- [ ] **Step 2: Add real HTML shell**

In `public/index.html`, add the header toggle near the room/sync/settings controls:

```html
<div
  id="view-toggle"
  class="hidden mt-4 inline-flex rounded-lg border border-slate-700 bg-slate-800/80 p-1"
>
  <button
    id="view-toggle-tasks"
    type="button"
    class="px-3 py-1.5 rounded-md text-xs text-slate-200 bg-slate-700"
    data-view-toggle="tasks"
  >
    <i class="fa-regular fa-calendar-check mr-1"></i>Tasks
  </button>
  <button
    id="view-toggle-insights"
    type="button"
    class="px-3 py-1.5 rounded-md text-xs text-slate-400 hover:text-slate-200"
    data-view-toggle="insights"
  >
    <i class="fa-solid fa-chart-simple mr-1"></i>Insights
  </button>
</div>
```

Wrap the task form, scheduled list, unscheduled list, and existing activities container in:

```html
<div id="tasks-view">...</div>
```

Place this after `#tasks-view` and before `#info-panel`:

```html
<div id="insights-view" class="hidden text-left mb-4 sm:mb-6 px-2 sm:px-0">
  <div id="insights-summary" class="space-y-3"></div>
  <div id="insights-timeline" class="mt-4"></div>
  <div id="insights-activity-log" class="mt-4">
    <div class="flex justify-between items-center mb-2 sm:mb-3">
      <h3
        class="text-lg sm:text-xl font-normal text-sky-400 pl-2 flex items-center"
      >
        <i class="fa-regular fa-clock mr-2"></i>Activity Log
      </h3>
    </div>
    <div id="insights-activity-list" class="grid grid-cols-1 gap-2"></div>
  </div>
  <div id="insights-trends" class="mt-4"></div>
</div>
```

- [ ] **Step 3: Update `setupDOM()`**

Mirror the same IDs in `__tests__/test-utils.js`. Export `setupDOM` if it is not already exported by the bottom export list.

- [ ] **Step 4: Run DOM shell tests**

Run: `npx.cmd jest __tests__/activity-view-toggle.test.js --runInBand`

Expected: PASS.

- [ ] **Step 5: Run layout smoke unit tests**

Run: `npx.cmd jest __tests__/layout-mockups.test.js __tests__/activity-form-layout.test.js --runInBand`

Expected: PASS or update only test fixtures that assumed the task containers were direct children of `.container`.

- [ ] **Step 6: Commit**

```bash
git add public/index.html __tests__/test-utils.js __tests__/activity-view-toggle.test.js
git commit -m "feat: add activities insights view shell"
```

---

## Task 3: Implement View Toggle State

**Files:**

- Create: `public/js/activities/view-toggle.js`
- Modify: `public/js/app.js`
- Modify: `public/js/activities/ui-handlers.js`
- Test: `__tests__/activity-view-toggle.test.js`

- [ ] **Step 1: Add failing toggle behavior tests**

Extend `__tests__/activity-view-toggle.test.js`:

```js
import {
  initializeActivitiesViewToggle,
  syncActivitiesViewToggle,
  getActiveActivitiesView,
  resetActivitiesViewToggle
} from '../public/js/activities/view-toggle.js';

describe('activities view toggle', () => {
  beforeEach(() => {
    setupDOM();
    resetActivitiesViewToggle();
  });

  test('hides the toggle and forces tasks view when activities are disabled', () => {
    initializeActivitiesViewToggle({
      isActivitiesEnabled: () => false,
      renderInsights: jest.fn()
    });

    syncActivitiesViewToggle(false);

    expect(
      document.getElementById('view-toggle').classList.contains('hidden')
    ).toBe(true);
    expect(
      document.getElementById('tasks-view').classList.contains('hidden')
    ).toBe(false);
    expect(
      document.getElementById('insights-view').classList.contains('hidden')
    ).toBe(true);
    expect(getActiveActivitiesView()).toBe('tasks');
  });

  test('switches to insights and calls the render hook', () => {
    const renderInsights = jest.fn();
    initializeActivitiesViewToggle({
      isActivitiesEnabled: () => true,
      renderInsights
    });

    document.getElementById('view-toggle-insights').click();

    expect(getActiveActivitiesView()).toBe('insights');
    expect(
      document.getElementById('tasks-view').classList.contains('hidden')
    ).toBe(true);
    expect(
      document.getElementById('insights-view').classList.contains('hidden')
    ).toBe(false);
    expect(renderInsights).toHaveBeenCalled();
  });

  test('hides clear schedule actions while insights is active', () => {
    initializeActivitiesViewToggle({
      isActivitiesEnabled: () => true,
      renderInsights: jest.fn()
    });

    document.getElementById('view-toggle-insights').click();

    expect(
      document
        .getElementById('clear-schedule-button')
        .classList.contains('hidden')
    ).toBe(true);
    expect(
      document
        .getElementById('clear-options-dropdown-trigger-btn')
        .classList.contains('hidden')
    ).toBe(true);

    document.getElementById('view-toggle-tasks').click();

    expect(
      document
        .getElementById('clear-schedule-button')
        .classList.contains('hidden')
    ).toBe(false);
  });

  test('Tab toggles views when activities are enabled and no editable field has focus', () => {
    initializeActivitiesViewToggle({
      isActivitiesEnabled: () => true,
      renderInsights: jest.fn()
    });

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    );

    expect(getActiveActivitiesView()).toBe('insights');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx.cmd jest __tests__/activity-view-toggle.test.js --runInBand`

Expected: FAIL because `view-toggle.js` does not exist.

- [ ] **Step 3: Implement `view-toggle.js`**

```js
let activeView = 'tasks';
let renderInsightsCallback = () => {};
let activitiesEnabledCallback = () => false;
let abortController = null;

function isEditableTarget(target) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

function setButtonState(button, active) {
  if (!button) return;
  button.classList.toggle('bg-slate-700', active);
  button.classList.toggle('text-slate-200', active);
  button.classList.toggle('text-slate-400', !active);
}

export function getActiveActivitiesView() {
  return activeView;
}

export function resetActivitiesViewToggle() {
  activeView = 'tasks';
  renderInsightsCallback = () => {};
  activitiesEnabledCallback = () => false;
  abortController?.abort();
  abortController = null;
}

export function setActiveActivitiesView(nextView) {
  activeView = nextView === 'insights' ? 'insights' : 'tasks';
  syncActivitiesViewToggle(activitiesEnabledCallback());
  if (activeView === 'insights') {
    renderInsightsCallback();
  }
}

export function syncActivitiesViewToggle(activitiesEnabled) {
  const viewToggle = document.getElementById('view-toggle');
  const tasksView = document.getElementById('tasks-view');
  const insightsView = document.getElementById('insights-view');
  const tasksButton = document.getElementById('view-toggle-tasks');
  const insightsButton = document.getElementById('view-toggle-insights');
  const clearScheduleButton = document.getElementById('clear-schedule-button');
  const clearOptionsButton = document.getElementById(
    'clear-options-dropdown-trigger-btn'
  );
  const clearTasksDropdown = document.getElementById('clear-tasks-dropdown');

  if (!activitiesEnabled) {
    activeView = 'tasks';
  }

  viewToggle?.classList.toggle('hidden', !activitiesEnabled);
  tasksView?.classList.toggle('hidden', activeView !== 'tasks');
  insightsView?.classList.toggle(
    'hidden',
    !activitiesEnabled || activeView !== 'insights'
  );
  setButtonState(tasksButton, activeView === 'tasks');
  setButtonState(insightsButton, activeView === 'insights');

  const hideTaskActions = activeView === 'insights';
  clearScheduleButton?.classList.toggle('hidden', hideTaskActions);
  clearOptionsButton?.classList.toggle('hidden', hideTaskActions);
  if (hideTaskActions) {
    clearTasksDropdown?.classList.add('hidden');
  }
}

export function renderActiveInsightsView() {
  if (activitiesEnabledCallback() && activeView === 'insights') {
    renderInsightsCallback();
  }
}

export function initializeActivitiesViewToggle({
  isActivitiesEnabled,
  renderInsights
}) {
  resetActivitiesViewToggle();
  activitiesEnabledCallback = isActivitiesEnabled;
  renderInsightsCallback = renderInsights;
  abortController = new AbortController();
  const { signal } = abortController;

  document
    .getElementById('view-toggle-tasks')
    ?.addEventListener('click', () => setActiveActivitiesView('tasks'), {
      signal
    });
  document
    .getElementById('view-toggle-insights')
    ?.addEventListener('click', () => setActiveActivitiesView('insights'), {
      signal
    });
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key !== 'Tab' ||
        event.defaultPrevented ||
        isEditableTarget(event.target)
      )
        return;
      if (!activitiesEnabledCallback()) return;
      event.preventDefault();
      setActiveActivitiesView(activeView === 'tasks' ? 'insights' : 'tasks');
    },
    { signal }
  );
  syncActivitiesViewToggle(isActivitiesEnabled());
}
```

- [ ] **Step 4: Wire toggle visibility into activity enablement**

In `public/js/activities/ui-handlers.js`, import `syncActivitiesViewToggle` and call it at the end of `syncActivitiesUI(enabled)`:

```js
syncActivitiesViewToggle(enabled);
```

- [ ] **Step 5: Wire initialization in `app.js`**

Import:

```js
import {
  initializeActivitiesViewToggle,
  renderActiveInsightsView
} from './activities/view-toggle.js';
import { renderInsightsView } from './activities/insights-renderer.js';
import { getActivityRenderOptions } from './activities/ui-handlers.js';
```

After `initializeActivityUi(...)`, call:

```js
initializeActivitiesViewToggle({
  isActivitiesEnabled: () => isActivitiesEnabled(),
  renderInsights: () =>
    renderInsightsView({
      tasks: getTaskState(),
      activityRenderOptions: getActivityRenderOptions(),
      now: new Date()
    })
});
```

After `refreshTaskDisplays()` in places where the UI refreshes, call `renderActiveInsightsView()` rather than always rerendering hidden Insights.

- [ ] **Step 6: Run view toggle tests**

Run: `npx.cmd jest __tests__/activity-view-toggle.test.js --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/js/activities/view-toggle.js public/js/activities/ui-handlers.js public/js/app.js __tests__/activity-view-toggle.test.js
git commit -m "feat: add activities tasks-insights view toggle"
```

---

## Task 4: Render Summary Stats And Timeline

**Files:**

- Create: `public/js/activities/insights-renderer.js`
- Modify: `public/js/app.js`
- Test: `__tests__/activity-insights-renderer.test.js`

- [ ] **Step 1: Write failing renderer tests**

Create `__tests__/activity-insights-renderer.test.js`:

```js
/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/activities/manager.js', () => ({
  getActivityState: jest.fn(() => []),
  getRunningActivity: jest.fn(() => null)
}));

jest.mock('../public/js/activities/renderer.js', () => ({
  renderActivities: jest.fn()
}));

import { setupDOM } from './test-utils.js';
import {
  expandInsightsActivityLogLimit,
  renderInsightsView
} from '../public/js/activities/insights-renderer.js';
import { renderActivities } from '../public/js/activities/renderer.js';

describe('activity insights renderer', () => {
  beforeEach(() => {
    setupDOM();
    jest.clearAllMocks();
    expandInsightsActivityLogLimit(0);
  });

  test('renders summary stats and timeline blocks', () => {
    renderInsightsView({
      tasks: [scheduledTask('sched-1', 'Deep work', '09:00', 60, 'completed')],
      activities: [activity('activity-1', 'Deep work actual', '09:05', 45)],
      runningActivity: null,
      now: new Date('2026-05-07T12:00:00.000Z')
    });

    expect(document.getElementById('insights-summary').textContent).toContain(
      'Planned'
    );
    expect(document.getElementById('insights-summary').textContent).toContain(
      '1h'
    );
    expect(
      document
        .getElementById('insights-timeline')
        .querySelector('[data-timeline-block="planned"]')
    ).not.toBeNull();
    expect(
      document
        .getElementById('insights-timeline')
        .querySelector('[data-timeline-block="actual"]')
    ).not.toBeNull();
    expect(
      document
        .getElementById('insights-timeline')
        .querySelector('[data-timeline-block="planned"]')
        .getAttribute('style')
    ).toContain('#0ea5e9');
    expect(renderActivities).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'activity-1' })]),
      document.getElementById('insights-activity-list'),
      expect.objectContaining({ summaryActivities: expect.any(Array) })
    );
  });

  test('bounds long activity logs and expands after show more', () => {
    const activities = Array.from({ length: 55 }, (_, index) =>
      activity(`activity-${index}`, `Activity ${index}`, '09:00', 5)
    );

    renderInsightsView({
      tasks: [],
      activities,
      activityLogLimit: 50,
      now: new Date('2026-05-07T12:00:00.000Z')
    });

    expect(renderActivities.mock.calls.at(-1)[0]).toHaveLength(50);
    expect(
      document.querySelector('[data-show-more-activities]')
    ).not.toBeNull();

    expandInsightsActivityLogLimit(50);
    renderInsightsView({
      tasks: [],
      activities,
      now: new Date('2026-05-07T12:00:00.000Z')
    });

    expect(renderActivities.mock.calls.at(-1)[0]).toHaveLength(55);
    expect(document.querySelector('[data-show-more-activities]')).toBeNull();
  });

  test('uses the default trend range for the initial activity log', () => {
    renderInsightsView({
      tasks: [],
      activities: [
        activity('activity-recent', 'Recent', '09:00', 30),
        {
          ...activity('activity-old', 'Old', '09:00', 30),
          startDateTime: '2026-04-20T09:00:00.000Z',
          endDateTime: '2026-04-20T09:30:00.000Z'
        }
      ],
      now: new Date('2026-05-07T12:00:00.000Z')
    });

    const renderedActivities = renderActivities.mock.calls.at(-1)[0];
    expect(renderedActivities.map((activityItem) => activityItem.id)).toEqual([
      'activity-recent'
    ]);
  });
});
```

Use the same `scheduledTask`, `activity`, and `isoAt` helpers from the model test.

- [ ] **Step 2: Run renderer tests to verify they fail**

Run: `npx.cmd jest __tests__/activity-insights-renderer.test.js --runInBand`

Expected: FAIL because `insights-renderer.js` does not exist.

- [ ] **Step 3: Implement `renderInsightsView`**

Create `public/js/activities/insights-renderer.js`:

```js
import {
  calculateHoursAndMinutes,
  convertTo12HourTime,
  extractTimeFromDateTime
} from '../utils.js';
import { renderCategoryBadge } from '../taxonomy/taxonomy-selectors.js';
import { getActivityState, getRunningActivity } from './manager.js';
import { renderActivities } from './renderer.js';
import {
  buildInsightsModel,
  buildTrendModel,
  getDefaultTrendDateRange
} from './insights-model.js';

const insightsActivityLogState = {
  visibleLimit: 50
};

const trendsState = {
  dateRange: null
};

export function expandInsightsActivityLogLimit(increment = 50) {
  if (increment <= 0) {
    insightsActivityLogState.visibleLimit = 50;
    return;
  }
  insightsActivityLogState.visibleLimit += increment;
}

export function setInsightsTrendDateRange(dateRange) {
  trendsState.dateRange = dateRange;
  insightsActivityLogState.visibleLimit = 50;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function groupIssuesByActivityId(issues = []) {
  return issues.reduce((groups, issue) => {
    if (issue.activityId) {
      groups[issue.activityId] = [...(groups[issue.activityId] || []), issue];
    }
    if (issue.relatedActivityId) {
      groups[issue.relatedActivityId] = [
        ...(groups[issue.relatedActivityId] || []),
        issue
      ];
    }
    return groups;
  }, {});
}

function renderStat(label, value, iconClass, colorClass) {
  return `<div class="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-3">
        <div class="text-[11px] uppercase tracking-[0.18em] text-slate-400"><i class="${iconClass} ${colorClass} mr-1"></i>${escapeHtml(label)}</div>
        <div class="mt-1 text-lg text-slate-100">${escapeHtml(value)}</div>
    </div>`;
}

function renderSummary(stats) {
  return `<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        ${renderStat('Planned', calculateHoursAndMinutes(stats.totalPlannedMinutes), 'fa-regular fa-calendar-check', 'text-teal-400')}
        ${renderStat('Actual', calculateHoursAndMinutes(stats.totalActualMinutes), 'fa-regular fa-clock', 'text-sky-400')}
        ${renderStat('Completed', String(stats.completedTaskCount), 'fa-solid fa-check', 'text-emerald-400')}
        ${renderStat('Currently Late', String(stats.currentlyLateTaskCount), 'fa-solid fa-triangle-exclamation', 'text-amber-300')}
    </div>`;
}

function renderTimelineBlock(block) {
  const start = convertTo12HourTime(
    extractTimeFromDateTime(new Date(block.startDateTime))
  );
  const end = convertTo12HourTime(
    extractTimeFromDateTime(new Date(block.endDateTime))
  );
  const categoryColor = block.categoryMeta?.color || '#64748b';
  const opacity = block.kind === 'planned' ? '0.72' : '0.88';
  const borderOpacity = block.kind === 'planned' ? 55 : 75;
  return `<div data-timeline-block="${block.kind}" class="absolute top-1 h-8 min-w-[0.5rem] rounded border" style="left: ${block.leftPercent}%; width: ${block.widthPercent}%; background-color: ${categoryColor}; border-color: color-mix(in srgb, ${categoryColor} ${borderOpacity}%, white); opacity: ${opacity};" title="${escapeHtml(`${block.description} ${start} - ${end}`)}">
        <span class="sr-only">${escapeHtml(block.description)} ${escapeHtml(start)} - ${escapeHtml(end)}</span>
    </div>`;
}

function renderTimeline(timeline) {
  const planned = timeline.plannedBlocks.map(renderTimelineBlock).join('');
  const actual = timeline.actualBlocks.map(renderTimelineBlock).join('');
  return `<section class="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
        <h3 class="text-lg font-normal text-slate-100 mb-3">Today</h3>
        <div class="space-y-3 overflow-x-auto pb-1">
            <div class="min-w-[34rem]">
                <div class="mb-1 text-xs text-teal-300">Planned</div>
                <div class="relative h-10 rounded-lg bg-slate-950/70">${planned}</div>
                <div class="mt-3 mb-1 text-xs text-sky-300">Actual</div>
                <div class="relative h-10 rounded-lg bg-slate-950/70">${actual}</div>
            </div>
        </div>
    </section>`;
}

export function renderInsightsView({
  tasks = [],
  activities = getActivityState(),
  runningActivity = getRunningActivity(),
  activityRenderOptions = {},
  activityLogDateRange = null,
  now = new Date()
} = {}) {
  const effectiveDateRange =
    activityLogDateRange ||
    trendsState.dateRange ||
    getDefaultTrendDateRange(now);
  const model = buildInsightsModel({
    tasks,
    activities,
    runningActivity,
    activityLogDateRange: effectiveDateRange,
    now
  });
  const summaryContainer = document.getElementById('insights-summary');
  const timelineContainer = document.getElementById('insights-timeline');
  const activityListContainer = document.getElementById(
    'insights-activity-list'
  );

  if (summaryContainer) summaryContainer.innerHTML = renderSummary(model.stats);
  if (timelineContainer)
    timelineContainer.innerHTML = renderTimeline(model.timeline);
  if (activityListContainer) {
    const visibleLimit = Math.max(50, insightsActivityLogState.visibleLimit);
    const visibleActivities = model.activities.slice(0, visibleLimit);
    renderActivities(visibleActivities, activityListContainer, {
      ...activityRenderOptions,
      summaryActivities: model.summaryActivities,
      activityIssuesById: groupIssuesByActivityId(model.activityLogIssues)
    });
    if (model.activities.length > visibleActivities.length) {
      activityListContainer.insertAdjacentHTML(
        'beforeend',
        `<button type="button" data-show-more-activities class="mt-2 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200">Show more (${model.activities.length - visibleActivities.length})</button>`
      );
    }
  }

  renderTrends(
    buildTrendModel({ activities, now, dateRange: effectiveDateRange })
  );
}
```

Leave `renderTrends()` as a local no-op export or empty section for this task:

```js
export function renderTrends() {
  const container = document.getElementById('insights-trends');
  if (container) container.innerHTML = '';
}
```

Do not leave the "Show more" button as a dead element in the final feature. Task 7 wires its
delegated click handler; Task 4 introduces the bounded list markup only so the renderer has a
stable target for that later behavior.

- [ ] **Step 4: Run renderer tests**

Run: `npx.cmd jest __tests__/activity-insights-renderer.test.js --runInBand`

Expected: PASS.

- [ ] **Step 5: Wire real render in `app.js`**

Ensure the render callback receives `getTaskState()` and the shared activity render options:

```js
renderInsights: () =>
  renderInsightsView({
    tasks: getTaskState(),
    activityRenderOptions: getActivityRenderOptions(),
    now: new Date()
  });
```

- [ ] **Step 6: Commit**

```bash
git add public/js/activities/insights-renderer.js public/js/app.js __tests__/activity-insights-renderer.test.js
git commit -m "feat: render activities insights summary and timeline"
```

---

## Task 5: Reuse Activity Log Editing State In Insights

**Files:**

- Modify: `public/js/activities/app-wiring.js`
- Modify: `public/js/activities/ui-handlers.js`
- Test: `__tests__/activity-app-wiring.test.js`
- Test: `__tests__/activity-view-toggle.test.js`

- [ ] **Step 1: Add failing tests for shared activity render options**

In `__tests__/activity-view-toggle.test.js` or a focused `activity-ui-handlers` test, prove that
the same render options used by the Tasks activity list can be passed into the Insights list:

```js
test('exposes activity render options for alternate activity-list containers', () => {
  setupDOM();
  // Clicks through the summary parent state in the existing handler path.
  // Use direct UI handler calls if the existing tests already cover summary expansion.
  const options = getActivityRenderOptions({
    summaryActivities: [activity('activity-1', 'Deep work', '09:00', 30)]
  });

  expect(options).toEqual(
    expect.objectContaining({
      editingActivityId: null,
      confirmingDeleteActivityId: null,
      expandedParentGroupKey: null,
      summaryActivities: expect.any(Array)
    })
  );
});
```

- [ ] **Step 2: Implement `getActivityRenderOptions()`**

In `public/js/activities/ui-handlers.js`, add an exported helper that returns the private
`activityUiState` values needed by any activity list renderer:

```js
export function getActivityRenderOptions(overrides = {}) {
  return {
    editingActivityId: activityUiState.editingActivityId,
    expandedParentGroupKey: activityUiState.expandedParentGroupKey,
    confirmingDeleteActivityId: activityUiState.confirmingDeleteActivityId,
    ...overrides
  };
}
```

Then update `renderTodayActivities(enabled)` and `refreshTodayActivitySummary(enabled)` to call
`getActivityRenderOptions({ summaryActivities: getActivitiesForSummary() })` rather than
duplicating option construction.

- [ ] **Step 3: Add failing listener tests for both activity lists**

In `__tests__/activity-app-wiring.test.js`, update setup DOM to include `#insights-activity-list`, then add:

```js
test('delegates activity list form events from the insights activity list too', () => {
  const signal = new AbortController().signal;
  initializeActivityUi({
    signal,
    refreshUI: jest.fn(),
    refreshTaskDisplays: jest.fn(),
    getActivitiesEnabled: () => true
  });

  document
    .getElementById('insights-activity-list')
    .dispatchEvent(new Event('submit', { bubbles: true }));
  document
    .getElementById('insights-activity-list')
    .dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
  document
    .getElementById('insights-activity-list')
    .dispatchEvent(new Event('input', { bubbles: true }));

  expect(handleActivityListSubmit).toHaveBeenCalled();
  expect(handleActivityListKeydown).toHaveBeenCalled();
  expect(handleActivityListInput).toHaveBeenCalled();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx.cmd jest __tests__/activity-app-wiring.test.js --runInBand`

Expected: FAIL because only `#activity-list` gets direct delegated listeners.

- [ ] **Step 5: Attach listeners to both containers**

In `public/js/activities/app-wiring.js`, replace the single-container listener block with a helper:

```js
function initializeActivityListEvents(activityListElement, signal, refreshUI) {
  if (!activityListElement) return;
  activityListElement.addEventListener(
    'submit',
    (event) => handleActivityListSubmit(event, { refreshUI }),
    { signal }
  );
  activityListElement.addEventListener(
    'keydown',
    (event) => handleActivityListKeydown(event, { refreshUI }),
    { signal }
  );
  activityListElement.addEventListener('input', handleActivityListInput, {
    signal
  });
}
```

Then call it for both:

```js
initializeActivityListEvents(
  document.getElementById('activity-list'),
  signal,
  refreshUI
);
initializeActivityListEvents(
  document.getElementById('insights-activity-list'),
  signal,
  refreshUI
);
```

- [ ] **Step 6: Ensure click handling refreshes the active Insights view**

`handleActivityListClick()` already uses the global document click callback. Make sure the `refreshUI` dependency passed by `createActivityAppCallbacks()` calls both the normal refresh and `renderActiveInsightsView()` via the app-level `refreshUI` path.

- [ ] **Step 7: Pass shared activity options into Insights render**

In `app.js`, import `getActivityRenderOptions` from `activities/ui-handlers.js` and pass it into
`renderInsightsView()`:

```js
renderInsightsView({
  tasks: getTaskState(),
  activityRenderOptions: getActivityRenderOptions(),
  now: new Date()
});
```

In `insights-renderer.js`, merge those options into the call to `renderActivities()`:

```js
renderActivities(model.activities, activityListContainer, {
  ...activityRenderOptions,
  summaryActivities: model.summaryActivities
});
```

- [ ] **Step 8: Run activity wiring and renderer tests**

Run: `npx.cmd jest __tests__/activity-app-wiring.test.js __tests__/activity-renderer.test.js --runInBand`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add public/js/activities/app-wiring.js __tests__/activity-app-wiring.test.js
git commit -m "feat: reuse activity log editing inside insights"
```

---

## Task 6: Embed Data Issues In Activity Log Rows

**Files:**

- Modify: `public/js/activities/insights-renderer.js`
- Modify: `public/js/activities/renderer.js`
- Test: `__tests__/activity-insights-renderer.test.js`
- Test: `__tests__/activity-renderer.test.js`

- [ ] **Step 1: Add failing tests for inline issue rendering**

Data issues are most actionable next to the affected activity. The Insights renderer should pass
an issue map from `model.activityLogIssues` into `renderActivities()`, and the activity renderer
should style affected rows with an inline badge and concise issue text.

```js
test('passes activity issue annotations into the insights activity log', () => {
  renderInsightsView({
    tasks: [],
    activities: [
      activity('activity-1', 'A', '09:00', 60),
      activity('activity-2', 'B', '09:30', 30)
    ],
    now: new Date('2026-05-07T12:00:00.000Z')
  });

  expect(renderActivities).toHaveBeenCalledWith(
    expect.any(Array),
    document.getElementById('insights-activity-list'),
    expect.objectContaining({
      activityIssuesById: expect.objectContaining({
        'activity-1': expect.arrayContaining([
          expect.objectContaining({ type: 'overlap' })
        ]),
        'activity-2': expect.arrayContaining([
          expect.objectContaining({ type: 'overlap' })
        ])
      })
    })
  );
});
```

- [ ] **Step 2: Add failing activity renderer row tests**

In `__tests__/activity-renderer.test.js`, add:

```js
test('renders inline data issue badges on affected activity rows', () => {
  const container = document.getElementById('activity-list');

  renderActivities(
    [activity('activity-1', 'Overlap row', '09:00', 30)],
    container,
    {
      activityIssuesById: {
        'activity-1': [{ type: 'overlap', severity: 'warning' }]
      }
    }
  );

  const row = container.querySelector('[data-activity-id="activity-1"]');
  expect(row.className).toContain('border-amber');
  expect(row.textContent).toContain('Data issue');
  expect(row.textContent).toContain('Overlapping activity');
});
```

- [ ] **Step 3: Implement issue labels and grouping**

Add local helper:

```js
function getIssueLabel(issue) {
  if (issue.type === 'overlap') return 'Overlapping activity';
  if (issue.type === 'invalid-range') return 'Activity ends before it starts';
  if (issue.type === 'duplicate-auto')
    return 'Duplicate auto-logged task activity';
  return 'Activity data issue';
}
```

Add grouping in `insights-renderer.js` if it was not already introduced in Task 4:

```js
function groupIssuesByActivityId(issues = []) {
  return issues.reduce((groups, issue) => {
    if (issue.activityId) {
      groups[issue.activityId] = [...(groups[issue.activityId] || []), issue];
    }
    if (issue.relatedActivityId) {
      groups[issue.relatedActivityId] = [
        ...(groups[issue.relatedActivityId] || []),
        issue
      ];
    }
    return groups;
  }, {});
}
```

Pass the grouped map into activity rendering:

```js
renderActivities(visibleActivities, activityListContainer, {
  ...activityRenderOptions,
  summaryActivities: model.summaryActivities,
  activityIssuesById: groupIssuesByActivityId(model.activityLogIssues)
});
```

In `activities/renderer.js`, read `options.activityIssuesById?.[activity.id] || []`, add an amber
border/background class when issues exist, and append:

```html
<div class="mt-1 text-xs text-amber-300" data-activity-data-issue>
  <i class="fa-solid fa-triangle-exclamation mr-1"></i>Data issue: Overlapping
  activity
</div>
```

Keep this row-level. Do not render a separate `#insights-data-issues` section.

- [ ] **Step 4: Run renderer tests**

Run: `npx.cmd jest __tests__/activity-insights-renderer.test.js __tests__/activity-renderer.test.js --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/activities/insights-renderer.js public/js/activities/renderer.js __tests__/activity-insights-renderer.test.js __tests__/activity-renderer.test.js
git commit -m "feat: show activity data issues inline in activity log"
```

---

## Task 7: Render Trends Section With Date Filtering

**Files:**

- Modify: `public/js/activities/insights-renderer.js`
- Modify: `public/js/activities/app-wiring.js`
- Modify: `public/js/app.js`
- Test: `__tests__/activity-insights-renderer.test.js`
- Test: `__tests__/activity-app-wiring.test.js`

- [ ] **Step 1: Add failing trend rendering tests**

```js
test('renders collapsed trends with category chart, daily bars, and date filter', () => {
  renderInsightsView({
    tasks: [],
    activities: [
      activity('activity-1', 'Today', '09:00', 60),
      {
        ...activity('activity-2', 'Yesterday', '09:00', 30),
        startDateTime: '2026-05-06T09:00:00.000Z',
        endDateTime: '2026-05-06T09:30:00.000Z'
      }
    ],
    now: new Date('2026-05-07T12:00:00.000Z')
  });

  const trends = document.getElementById('insights-trends');
  expect(trends.textContent).toContain('Trends');
  expect(trends.querySelector('details').open).toBe(false);
  expect(trends.querySelector('[data-trend-start-date]')).not.toBeNull();
  expect(trends.querySelector('[data-trend-end-date]')).not.toBeNull();
  expect(trends.querySelector('[data-category-trend-chart]')).not.toBeNull();
  expect(trends.querySelectorAll('[data-category-trend-segment]')).toHaveLength(
    1
  );
  expect(trends.querySelectorAll('[data-daily-trend-bar]')).toHaveLength(14);
  expect(
    trends.querySelectorAll('[data-daily-trend-segment]')
  ).not.toHaveLength(0);
  expect(trends.querySelector('[data-daily-trend-grid]')).not.toBeNull();
  expect(trends.textContent).toContain('Work');
});
```

- [ ] **Step 2: Verify shared date-range state drives both Trends and Activity Log**

`trendsState`, `setInsightsTrendDateRange()`, and the effective date-range calculation were
introduced when `insights-renderer.js` was created in Task 4. Confirm `renderInsightsView()` still
computes one `effectiveDateRange` from the explicit argument, stored trend range, or
`getDefaultTrendDateRange(now)`, then passes that same range to both `buildInsightsModel()` and
`buildTrendModel()`. Do not reintroduce separate default ranges for Trends and Activity Log.

- [ ] **Step 3: Implement trend markup**

Update `renderTrends(trendModel)`:

```js
export function renderTrends(
  trendModel = { dateRange: null, dailyHours: [], categoryTotals: [] }
) {
  const container = document.getElementById('insights-trends');
  if (!container) return;
  const maxMinutes = Math.max(
    1,
    ...trendModel.dailyHours.map((day) => day.minutes)
  );
  const dailyBars = trendModel.dailyHours
    .map((day) => {
      const height = Math.max(4, (day.minutes / maxMinutes) * 64);
      const segments = (day.categorySegments || [])
        .map((segment) => {
          const segmentHeight =
            day.minutes > 0 ? (segment.minutes / day.minutes) * 100 : 0;
          return `<div data-daily-trend-segment class="w-full" style="height: ${segmentHeight}%; background: ${escapeHtml(segment.color || '#64748b')}" title="${escapeHtml(`${segment.label}: ${calculateHoursAndMinutes(segment.minutes)}`)}"></div>`;
        })
        .join('');
      return `<div class="flex h-full min-w-0 flex-col items-center justify-end gap-1 text-[10px] text-slate-500">
                <div data-daily-trend-bar class="flex w-3 flex-col-reverse overflow-hidden rounded-t" style="height: ${height}px" title="${escapeHtml(`${day.date}: ${calculateHoursAndMinutes(day.minutes)}`)}">
                    ${segments || '<div data-daily-trend-segment class="h-full w-full bg-slate-600"></div>'}
                </div>
                <div>${escapeHtml(day.date.slice(-2))}</div>
            </div>`;
    })
    .join('');
  const totalCategoryMinutes = trendModel.categoryTotals.reduce(
    (sum, item) => sum + item.minutes,
    0
  );
  let offset = 0;
  const categorySegments = trendModel.categoryTotals
    .map((item) => {
      const percentage =
        totalCategoryMinutes > 0
          ? (item.minutes / totalCategoryMinutes) * 100
          : 0;
      const segment = `<circle data-category-trend-segment cx="18" cy="18" r="15.9155" fill="transparent" stroke="${escapeHtml(item.color || '#64748b')}" stroke-width="8" stroke-dasharray="${percentage} ${100 - percentage}" stroke-dashoffset="${-offset}" />`;
      offset += percentage;
      return segment;
    })
    .join('');
  const categoryRows = trendModel.categoryTotals
    .map(
      (
        item
      ) => `<div class="flex items-center justify-between text-sm text-slate-300">
            <span>${renderCategoryBadge(item.key)} ${escapeHtml(item.label || item.key)}</span>
            <span>${escapeHtml(calculateHoursAndMinutes(item.minutes))}</span>
        </div>`
    )
    .join('');

  container.innerHTML = `<details class="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
        <summary class="cursor-pointer text-sm font-medium text-slate-200">Trends</summary>
        <div class="mt-3 space-y-4">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label class="text-xs text-slate-400">Start
                    <input data-trend-start-date type="date" value="${escapeHtml(trendModel.dateRange?.startDate || '')}" class="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-slate-100">
                </label>
                <label class="text-xs text-slate-400">End
                    <input data-trend-end-date type="date" value="${escapeHtml(trendModel.dateRange?.endDate || '')}" class="mt-1 w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-slate-100">
                </label>
            </div>
            <div class="flex items-center gap-4">
                <svg data-category-trend-chart viewBox="0 0 36 36" class="h-24 w-24 -rotate-90">
                    ${categorySegments || '<circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="#475569" stroke-width="8" />'}
                </svg>
                <div class="flex-1 space-y-2">${categoryRows || '<div class="text-sm text-slate-500 italic">No trend data yet.</div>'}</div>
            </div>
            <div class="relative h-24">
                <div data-daily-trend-grid class="pointer-events-none absolute inset-0 flex flex-col justify-between">
                    <div class="border-t border-dashed border-slate-700"></div>
                    <div class="border-t border-dashed border-slate-700"></div>
                    <div class="border-t border-dashed border-slate-700"></div>
                    <div class="border-t border-dashed border-slate-700"></div>
                </div>
                <div class="relative z-10 grid h-full items-end gap-1" style="grid-template-columns: repeat(${trendModel.dailyHours.length || 1}, minmax(0, 1fr))">${dailyBars}</div>
            </div>
        </div>
    </details>`;
}
```

- [ ] **Step 4: Wire trend filter input handling**

The Trends date range also controls the Insights Activity Log. Changing the date filter should
rerender charts and replace the activity log with activities from the selected range so older
entries can be edited.

Add a failing test in `__tests__/activity-app-wiring.test.js`:

```js
test('updates trend date range and rerenders insights when trend filter changes', () => {
  document.body.innerHTML += `
    <div id="insights-trends">
      <input data-trend-start-date type="date" value="2026-05-01">
      <input data-trend-end-date type="date" value="2026-05-07">
    </div>
  `;
  const renderInsights = jest.fn();
  initializeActivityUi({
    signal: new AbortController().signal,
    refreshUI: jest.fn(),
    refreshTaskDisplays: jest.fn(),
    getActivitiesEnabled: () => true,
    renderInsights
  });

  document.querySelector('[data-trend-start-date]').value = '2026-05-03';
  document
    .querySelector('[data-trend-start-date]')
    .dispatchEvent(new Event('change', { bubbles: true }));

  expect(setInsightsTrendDateRange).toHaveBeenCalledWith({
    startDate: '2026-05-03',
    endDate: '2026-05-07'
  });
  expect(renderInsights).toHaveBeenCalled();
});

test('expands insights activity log when show more is clicked', () => {
  document.body.innerHTML += `
    <div id="insights-activity-list">
      <button type="button" data-show-more-activities>Show more</button>
    </div>
  `;
  const renderInsights = jest.fn();
  initializeActivityUi({
    signal: new AbortController().signal,
    refreshUI: jest.fn(),
    refreshTaskDisplays: jest.fn(),
    getActivitiesEnabled: () => true,
    renderInsights
  });

  document
    .querySelector('[data-show-more-activities]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));

  expect(expandInsightsActivityLogLimit).toHaveBeenCalledWith(50);
  expect(renderInsights).toHaveBeenCalled();
});
```

In `public/js/activities/app-wiring.js`, add a delegated `change` listener on `#insights-trends`.
When either date input changes, call `setInsightsTrendDateRange({ startDate, endDate })` and then
`renderInsights()` through a callback passed from `app.js`. Keep this routing in app wiring; do not
make `insights-renderer.js` import task state.

Import the range setter and activity-log expander:

```js
import {
  expandInsightsActivityLogLimit,
  setInsightsTrendDateRange
} from './insights-renderer.js';
```

Update `initializeActivityUi()` to accept `renderInsights = () => {}` and wire:

```js
const trendsContainer = document.getElementById('insights-trends');
trendsContainer?.addEventListener(
  'change',
  (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!event.target.matches('[data-trend-start-date], [data-trend-end-date]'))
      return;
    const startDate =
      trendsContainer.querySelector('[data-trend-start-date]')?.value || '';
    const endDate =
      trendsContainer.querySelector('[data-trend-end-date]')?.value || '';
    setInsightsTrendDateRange({ startDate, endDate });
    renderInsights();
  },
  { signal }
);
```

Also add a delegated `click` listener on `#insights-activity-list` for
`[data-show-more-activities]`. It should call `expandInsightsActivityLogLimit(50)` and then
`renderInsights()`. This keeps pagination state in the Insights renderer while event delegation
stays with the activity UI wiring.

Pass the callback from `app.js`:

```js
initializeActivityUi({
  signal,
  refreshUI,
  refreshTaskDisplays,
  getActivitiesEnabled: () => isActivitiesEnabled(),
  renderInsights: () =>
    renderInsightsView({
      tasks: getTaskState(),
      activityRenderOptions: getActivityRenderOptions(),
      now: new Date()
    })
});
```

- [ ] **Step 5: Run renderer tests**

Run: `npx.cmd jest __tests__/activity-insights-renderer.test.js __tests__/activity-app-wiring.test.js --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/activities/insights-renderer.js public/js/activities/app-wiring.js public/js/app.js __tests__/activity-insights-renderer.test.js __tests__/activity-app-wiring.test.js
git commit -m "feat: add lightweight trends to activity insights"
```

---

## Task 8: Keep Insights Fresh During Refreshes And Timer Ticks

**Files:**

- Modify: `public/js/dom-renderer.js`
- Modify: `public/js/app.js`
- Modify: `public/js/activities/timer-ui.js`
- Test: `__tests__/app.test.js`
- Test: `__tests__/activity-timer-ui.test.js`

- [ ] **Step 1: Add failing tests for active Insights refresh**

In the most appropriate existing app or view-toggle test, mock `renderActiveInsightsView()` and assert it is called after `refreshUI()` when Activities are enabled and the active view is Insights.

```js
jest.mock('../public/js/activities/view-toggle.js', () => ({
  renderActiveInsightsView: jest.fn(),
  syncActivitiesViewToggle: jest.fn()
}));
```

Then exercise `refreshUI()` after enabling Activities.

- [ ] **Step 2: Update `dom-renderer.refreshUI()`**

Import:

```js
import { renderActiveInsightsView } from './activities/view-toggle.js';
```

At the end of the `if (isActivitiesEnabled())` block:

```js
renderActiveInsightsView();
```

- [ ] **Step 3: Ensure task-display refresh path also updates active Insights**

In `app.js`, after `refreshTaskDisplays()` finishes rendering tasks, activities, active colors, and gaps, call:

```js
renderActiveInsightsView();
```

Guard against circular import issues by keeping `view-toggle.js` independent from `dom-renderer.js`.

- [ ] **Step 4: Timer summary refresh**

`timer-ui.js` already receives `refreshActivitySummary`. Extend its timer tick callback only if the elapsed summary currently updates without a full refresh. The callback should stay cheap:

```js
refreshActivitySummary();
renderActiveInsightsView();
```

If importing `renderActiveInsightsView()` into `timer-ui.js` creates an import cycle, pass a `refreshInsights` dependency through `initializeTimerUI()` from `app-wiring.js` instead.

- [ ] **Step 5: Run targeted tests**

Run: `npx.cmd jest __tests__/app.test.js __tests__/activity-timer-ui.test.js __tests__/activity-view-toggle.test.js --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/dom-renderer.js public/js/app.js public/js/activities/timer-ui.js __tests__/app.test.js __tests__/activity-timer-ui.test.js
git commit -m "feat: keep active insights view refreshed"
```

---

## Task 9: Add Phase 5 Smoke Coverage

**Files:**

- Modify: `scripts/playwright_preview_smoke.py`
- Test: `test_playwright_preview_smoke.py`

- [ ] **Step 1: Add a focused smoke assertion**

Add a Phase 5 smoke helper that:

- Enables Activities.
- Creates one scheduled task and completes it so auto-logging creates an activity.
- Starts a live timer or seeds one through existing smoke hooks if the script already has that helper.
- Clicks the Insights tab.
- Asserts the Insights view shows planned/actual summary, a planned timeline row, an actual timeline row, and the activity log entry.

Keep this focused; do not expand cross-device sync coverage in Phase 5.

- [ ] **Step 2: Run the smoke unit wrapper**

Run: `uv run python -m unittest test_playwright_preview_smoke.py`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/playwright_preview_smoke.py test_playwright_preview_smoke.py
git commit -m "test: add phase 5 insights smoke coverage"
```

---

## Task 10: Final Verification And Documentation Check

**Files:**

- Create: `docs/plans/implementation/2026-05-07-fortudo-activities-phase5-insights.md`

- [ ] **Step 1: Run targeted test set**

Run:

```bash
npx.cmd jest __tests__/activity-insights-model.test.js __tests__/activity-insights-renderer.test.js __tests__/activity-view-toggle.test.js __tests__/activity-app-wiring.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run full Jest suite**

Run:

```bash
npm.cmd test -- --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run lint and format check**

Run:

```bash
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 4: Run coverage**

Run:

```bash
npm.cmd test -- --coverage --runInBand
```

Expected: PASS with repo thresholds maintained.

- [ ] **Step 5: Review diff**

Run:

```bash
git diff --stat
git diff -- public/index.html public/js/activities public/js/app.js public/js/dom-renderer.js __tests__ scripts/playwright_preview_smoke.py test_playwright_preview_smoke.py
```

Expected: Only Phase 5 code, tests, smoke, and this plan changed. Existing user modifications to `docs/plans/design/2026-03-16-fortudo-activities-design.md` must remain untouched unless the user explicitly asks to update the design doc.

---

## Acceptance Checklist

- [ ] Activities disabled: Tasks view behaves as before, Insights toggle is hidden, no Insights render errors.
- [ ] Activities enabled: header shows Tasks / Insights toggle.
- [ ] Tasks view: existing task form, scheduled tasks, unscheduled tasks, and today's activity list still work.
- [ ] Insights view: clock/date info panel remains visible; task form/task lists and Clear Schedule
      controls are hidden.
- [ ] Today's Summary shows planned time, actual time, completed count, and late count.
- [ ] Plan-vs-actual timeline shows planned task blocks and actual activity blocks sized by duration.
- [ ] Live timer appears in actual totals and timeline while running.
- [ ] Activity Log in Insights follows the selected date range, supports editing older activities,
      and bounds long lists with a Show more affordance.
- [ ] Activity summary bars still support parent expansion and include live timer duration.
- [ ] Data Issues reports overlaps, invalid ranges, and duplicate auto-log rows inline on affected
      Activity Log entries.
- [ ] Trends section is collapsed by default and uses hand-rolled daily/category visuals.
- [ ] Existing timer baselines remain intact: restored timers, stop-on-start, unscheduled task timer promotion, overlap auto-stop, and midnight rollover behavior.

import {
    calculateHoursAndMinutes,
    convertTo12HourTime,
    extractTimeFromDateTime
} from '../utils.js';
import { getActivityState, getRunningActivity } from './manager.js';
import { renderActivities } from './renderer.js';
import { buildInsightsModel, buildTrendModel, getDefaultTrendDateRange } from './insights-model.js';

const DEFAULT_ACTIVITY_LOG_LIMIT = 50;
const FALLBACK_TIMELINE_COLOR = '#64748b';

let activityLogVisibleLimit = DEFAULT_ACTIVITY_LOG_LIMIT;
let storedTrendDateRange = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatTime(dateTime) {
    return convertTo12HourTime(extractTimeFromDateTime(new Date(dateTime)));
}

function getItemLabel(block) {
    return block.description || block.title || 'Untitled';
}

function normalizeTimelineColor(color) {
    const value = String(color ?? '').trim();

    if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) {
        return value;
    }

    return FALLBACK_TIMELINE_COLOR;
}

function renderSummaryStat({ label, value }) {
    return `<div class="rounded-lg border border-slate-700/70 bg-slate-900/75 px-3 py-2">
        <div class="text-[11px] font-medium uppercase text-slate-400">${escapeHtml(label)}</div>
        <div class="mt-1 text-lg font-semibold text-slate-100">${escapeHtml(value)}</div>
    </div>`;
}

function renderSummary(model) {
    const summaryContainer = document.getElementById('insights-summary');
    if (!summaryContainer) {
        return;
    }

    const stats = [
        {
            label: 'Planned',
            value: calculateHoursAndMinutes(model.summary.totalPlannedMinutes)
        },
        {
            label: 'Actual',
            value: calculateHoursAndMinutes(model.summary.totalActualMinutes)
        },
        {
            label: 'Completed',
            value: model.summary.completedTaskCount
        },
        {
            label: 'Currently Late',
            value: model.summary.currentlyLateTaskCount
        }
    ];

    summaryContainer.innerHTML = `<div class="grid grid-cols-2 gap-2 md:grid-cols-4">
        ${stats.map(renderSummaryStat).join('')}
    </div>`;
}

function getTimelineBlockStyle(block) {
    const color = normalizeTimelineColor(block.categoryMeta?.color);
    const leftPercent = Math.max(0, Math.min(100, block.leftPercent || 0));
    const widthPercent = Math.max(0.25, Math.min(100 - leftPercent, block.widthPercent || 0));

    return `left: ${leftPercent}%; width: ${widthPercent}%; background-color: ${color};`;
}

function renderTimelineBlock(block, type) {
    const label = getItemLabel(block);
    const timeRange = `${formatTime(block.startDateTime)} - ${formatTime(block.endDateTime)}`;
    const duration = calculateHoursAndMinutes(block.duration);
    const title = `${label}, ${timeRange}, ${duration}`;

    return `<div data-timeline-block="${type}" role="img" class="absolute top-1 h-8 overflow-hidden rounded border border-white/20 px-2 text-[11px] font-medium leading-8 text-white shadow-sm"
        style="${getTimelineBlockStyle(block)}"
        title="${escapeHtml(title)}"
        aria-label="${escapeHtml(title)}">
        ${escapeHtml(label)}
        <span class="sr-only">${escapeHtml(title)}</span>
    </div>`;
}

function renderTimelineRow(label, type, blocks) {
    const blocksHtml = blocks.map((block) => renderTimelineBlock(block, type)).join('');

    return `<div class="grid grid-cols-[4.5rem_1fr] items-center gap-3">
        <div class="text-xs font-medium uppercase text-slate-400">${escapeHtml(label)}</div>
        <div class="relative h-10 rounded-lg border border-slate-700/70 bg-slate-950/60">
            ${blocksHtml}
        </div>
    </div>`;
}

function renderTimeline(model) {
    const timelineContainer = document.getElementById('insights-timeline');
    if (!timelineContainer) {
        return;
    }

    timelineContainer.innerHTML = `<div class="space-y-3">
        ${renderTimelineRow('Planned', 'planned', model.plannedBlocks)}
        ${renderTimelineRow('Actual', 'actual', model.actualBlocks)}
    </div>`;
}

function groupIssuesByActivityId(issues = []) {
    const issuesById = {};

    for (const issue of issues) {
        if (!issue) {
            continue;
        }

        const relatedActivityId = issue.relatedActivityId || issue.overlappingActivityId;
        const activityIds = [issue.activityId, relatedActivityId].filter(Boolean);

        for (const activityId of activityIds) {
            issuesById[activityId] = issuesById[activityId] || [];
            issuesById[activityId].push(issue);
        }
    }

    return issuesById;
}

function mergeActivityIssuesById(existingIssuesById, modelIssues = []) {
    const mergedIssuesById = {};

    if (existingIssuesById instanceof Map) {
        for (const [activityId, issues] of existingIssuesById) {
            mergedIssuesById[activityId] = [...issues];
        }
    } else {
        for (const [activityId, issues] of Object.entries(existingIssuesById || {})) {
            mergedIssuesById[activityId] = [...issues];
        }
    }

    const modelIssuesById = groupIssuesByActivityId(modelIssues);

    for (const [activityId, issues] of Object.entries(modelIssuesById)) {
        mergedIssuesById[activityId] = [...(mergedIssuesById[activityId] || []), ...issues];
    }

    return mergedIssuesById;
}

function renderShowMoreButton(hiddenCount) {
    const listContainer = document.getElementById('insights-activity-list');
    if (!listContainer) {
        return;
    }

    listContainer.querySelector('[data-show-more-activities]')?.remove();

    if (hiddenCount <= 0) {
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.showMoreActivities = 'true';
    button.className =
        'mt-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800';
    button.textContent = `Show ${hiddenCount} more`;
    listContainer.append(button);
}

function renderActivityLog(model, activityRenderOptions = {}) {
    const listContainer = document.getElementById('insights-activity-list');
    if (!listContainer) {
        return;
    }

    const visibleActivities = model.activityLog.slice(0, activityLogVisibleLimit);
    const hiddenCount = Math.max(0, model.activityLog.length - visibleActivities.length);

    renderActivities(visibleActivities, listContainer, {
        ...activityRenderOptions,
        summaryActivities: model.activityLog,
        activityIssuesById: mergeActivityIssuesById(
            activityRenderOptions.activityIssuesById,
            model.activityLogIssues
        )
    });
    renderShowMoreButton(hiddenCount);
}

function resolveDateRange({ dateRange = null, activityLogDateRange = null, now = new Date() }) {
    return (
        dateRange || activityLogDateRange || storedTrendDateRange || getDefaultTrendDateRange(now)
    );
}

/**
 * Expands the visible Insights Activity Log item limit.
 * @param {number} increment
 */
export function expandInsightsActivityLogLimit(increment = DEFAULT_ACTIVITY_LOG_LIMIT) {
    if (Number(increment) === 0) {
        activityLogVisibleLimit = DEFAULT_ACTIVITY_LOG_LIMIT;
        return;
    }

    activityLogVisibleLimit += Math.max(0, Number(increment) || 0);
}

/**
 * Stores the Insights trend date range used by subsequent renders.
 * @param {{startDate: string, endDate: string}|null} dateRange
 */
export function setInsightsTrendDateRange(dateRange) {
    storedTrendDateRange = dateRange || null;
    activityLogVisibleLimit = DEFAULT_ACTIVITY_LOG_LIMIT;
}

/**
 * Renders the Activities Insights view.
 * @param {Object} options
 */
export function renderInsightsView({
    tasks = [],
    activities = getActivityState(),
    runningActivity = getRunningActivity(),
    activityRenderOptions = {},
    dateRange = null,
    activityLogDateRange = null,
    now = new Date()
} = {}) {
    const effectiveDateRange = resolveDateRange({ dateRange, activityLogDateRange, now });
    const model = buildInsightsModel({
        tasks,
        activities,
        runningActivity,
        now,
        activityLogDateRange: effectiveDateRange
    });
    const trendModel = buildTrendModel({
        activities,
        now,
        dateRange: effectiveDateRange
    });

    renderSummary(model);
    renderTimeline(model);
    renderActivityLog(model, activityRenderOptions);
    renderTrends(trendModel);
}

function getTotalMinutes(items = []) {
    return items.reduce((total, item) => total + (Number(item.minutes) || 0), 0);
}

function renderCategoryTrendChart(categoryTotals = []) {
    const totalMinutes = getTotalMinutes(categoryTotals);
    let consumedPercent = 0;

    const segments = categoryTotals
        .map((category) => {
            const minutes = Number(category.minutes) || 0;
            if (minutes <= 0 || totalMinutes <= 0) {
                return '';
            }

            const percent = (minutes / totalMinutes) * 100;
            const dashArray = `${percent} ${100 - percent}`;
            const dashOffset = -consumedPercent;
            consumedPercent += percent;

            return `<circle data-category-trend-segment
                class="origin-center -rotate-90"
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke-width="7"
                stroke="${normalizeTimelineColor(category.color)}"
                stroke-dasharray="${dashArray}"
                stroke-dashoffset="${dashOffset}"></circle>`;
        })
        .join('');

    const legend = categoryTotals
        .map(
            (category) => `<div class="flex items-center justify-between gap-3 text-xs">
                <span class="flex min-w-0 items-center gap-2 text-slate-300">
                    <span class="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style="background-color: ${normalizeTimelineColor(category.color)};"></span>
                    <span class="truncate">${escapeHtml(category.label)}</span>
                </span>
                <span class="shrink-0 font-medium text-slate-100">
                    ${escapeHtml(calculateHoursAndMinutes(category.minutes))}
                </span>
            </div>`
        )
        .join('');

    return `<div class="grid grid-cols-[4.5rem_1fr] items-center gap-4">
        <svg data-category-trend-chart viewBox="0 0 36 36" class="h-16 w-16 text-slate-800">
            <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" stroke-width="7"></circle>
            ${segments}
        </svg>
        <div class="space-y-2">${legend || '<div class="text-xs text-slate-400">No activity</div>'}</div>
    </div>`;
}

function renderDailyTrendBars(dailyHours = []) {
    const maxMinutes = Math.max(1, ...dailyHours.map((day) => Number(day.minutes) || 0));

    const bars = dailyHours
        .map((day) => {
            const dayMinutes = Number(day.minutes) || 0;
            const barHeight = Math.max(3, (dayMinutes / maxMinutes) * 100);
            const segments = (day.categorySegments || [])
                .map((segment) => {
                    const minutes = Number(segment.minutes) || 0;
                    if (minutes <= 0 || dayMinutes <= 0) {
                        return '';
                    }

                    const height = Math.max(3, (minutes / dayMinutes) * barHeight);

                    return `<span data-daily-trend-segment class="block w-full"
                        title="${escapeHtml(segment.label)} ${escapeHtml(calculateHoursAndMinutes(minutes))}"
                        style="height: ${height}%; background-color: ${normalizeTimelineColor(
                            segment.color
                        )};"></span>`;
                })
                .join('');

            return `<div class="flex min-w-0 flex-col items-center gap-2">
                <div data-daily-trend-bar
                    class="flex h-24 w-full max-w-8 items-end overflow-hidden rounded bg-slate-800/80">
                    <div class="flex w-full flex-col-reverse">${segments}</div>
                </div>
                <div class="truncate text-[10px] text-slate-500">${escapeHtml(day.date.slice(5))}</div>
            </div>`;
        })
        .join('');

    return `<div class="relative">
        <div data-daily-trend-grid
            class="pointer-events-none absolute inset-x-0 top-0 h-24 rounded border-y border-slate-700/60 bg-[linear-gradient(to_top,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[length:100%_33.333%]">
        </div>
        <div class="relative grid grid-cols-7 gap-2 md:grid-cols-14">${bars}</div>
    </div>`;
}

/**
 * Renders the lightweight Trends panel for activity insights.
 * @param {Object} trendModel
 */
export function renderTrends(trendModel = {}) {
    const trendsContainer = document.getElementById('insights-trends');
    if (!trendsContainer) {
        return;
    }

    const dateRange = trendModel.dateRange || {};

    trendsContainer.innerHTML = `<details class="rounded-lg border border-slate-700 bg-slate-950/80 p-4 shadow-sm">
        <summary class="cursor-pointer text-sm font-semibold text-slate-100">Trends</summary>
        <div class="mt-4 space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <label class="text-xs font-medium uppercase text-slate-400">
                    Start
                    <input data-trend-start-date type="date" value="${escapeHtml(dateRange.startDate)}"
                        class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm normal-case text-slate-100">
                </label>
                <label class="text-xs font-medium uppercase text-slate-400">
                    End
                    <input data-trend-end-date type="date" value="${escapeHtml(dateRange.endDate)}"
                        class="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm normal-case text-slate-100">
                </label>
            </div>
            ${renderCategoryTrendChart(trendModel.categoryTotals || [])}
            ${renderDailyTrendBars(trendModel.dailyHours || [])}
        </div>
    </details>`;
}

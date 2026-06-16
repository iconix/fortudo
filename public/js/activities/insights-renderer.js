import {
    calculateHoursAndMinutes,
    convertTo12HourTime,
    extractDateFromDateTime,
    extractTimeFromDateTime
} from '../utils.js';
import { getActivityState, getRunningActivity } from './manager.js';
import { renderActivities } from './renderer.js';
import { buildInsightsModel } from './insights-model.js';
import { mergeActivityIssuesById } from './insights-issues.js';
import { buildTrendModel, getDefaultTrendDateRange } from './insights-trends.js';

const DEFAULT_ACTIVITY_LOG_LIMIT = 50;
const FALLBACK_TIMELINE_COLOR = '#64748b';

let activityLogVisibleLimit = DEFAULT_ACTIVITY_LOG_LIMIT;
let storedTrendDateRange = null;
let storedSelectedInsightsDate = null;

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
    storedSelectedInsightsDate = null;
    activityLogVisibleLimit = DEFAULT_ACTIVITY_LOG_LIMIT;
}

/**
 * Stores the selected Insights detail date used by subsequent renders.
 * @param {string|null} date
 */
export function setInsightsSelectedDate(date) {
    storedSelectedInsightsDate = date || null;
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
    selectedDate = null,
    now = new Date()
} = {}) {
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
    const trendModel = buildTrendModel({
        activities,
        now,
        dateRange: effectiveDateRange
    });

    renderSummary(model);
    renderTimeline(model);
    renderActivityLog(model, activityRenderOptions);
    renderTrends(trendModel, { selectedDate: effectiveSelectedDate });
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
                pathLength="100"
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

            return `<span data-daily-trend-segment class="block h-full"
                title="${escapeHtml(segment.label)} ${escapeHtml(calculateHoursAndMinutes(segmentMinutes))}"
                style="width: ${width}%; background-color: ${normalizeTimelineColor(
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
        <div class="mt-2 text-sm font-semibold text-slate-100">
            ${escapeHtml(calculateHoursAndMinutes(minutes))}
        </div>
        <div class="text-[11px] text-slate-500">
            ${escapeHtml((day.categorySegments || []).length)} categories
        </div>
    </button>`;
}

/**
 * Renders the lightweight Trends panel for activity insights.
 * @param {Object} trendModel
 */
export function renderTrends(trendModel = {}, { selectedDate = null } = {}) {
    const trendsContainer = document.getElementById('insights-trends');
    if (!trendsContainer) {
        return;
    }

    const dateRange = trendModel.dateRange || {};
    const dailyHours = trendModel.dailyHours || [];

    trendsContainer.innerHTML = `<section class="rounded-lg border border-slate-700 bg-slate-950/80 p-4 shadow-sm">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 class="text-sm font-semibold text-slate-100">Trends</h2>
                <p class="mt-1 text-xs text-slate-400">Click a day to inspect its timeline and activity log.</p>
            </div>
            <div class="text-xs text-slate-500">
                ${escapeHtml(dateRange.startDate)} - ${escapeHtml(dateRange.endDate)}
            </div>
        </div>
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
            <div data-trend-day-strip
                class="grid auto-cols-[8.5rem] grid-flow-col gap-2 overflow-x-auto pb-1 md:auto-cols-auto md:grid-flow-row md:grid-cols-14 md:overflow-visible md:pb-0">
                ${dailyHours.map((day) => renderTrendDayCard(day, selectedDate)).join('')}
            </div>
        </div>
    </section>`;
}

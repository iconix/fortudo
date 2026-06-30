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
const MINUTES_PER_DAY = 24 * 60;
const TIMELINE_VIEWPORT_PADDING_MINUTES = 30;
const COMPACT_TIMELINE_BLOCK_PERCENT = 9;
const TREND_RANGE_PRESETS = [7, 14, 30];

let activityLogVisibleLimit = DEFAULT_ACTIVITY_LOG_LIMIT;
let storedTrendDateRange = null;
let storedSelectedInsightsDate = null;
let selectedTimelineBlockId = null;

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

function formatMinutesAsTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return convertTo12HourTime(
        `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
    );
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

    return {
        style: `left: ${leftPercent}%; width: ${widthPercent}%; background-color: ${color};`,
        widthPercent
    };
}

function renderTimelineBlock(block, type, viewport) {
    const label = getItemLabel(block);
    const timeRange = `${formatTime(block.startDateTime)} - ${formatTime(block.endDateTime)}`;
    const duration = calculateHoursAndMinutes(block.duration);
    const title = `${label}, ${timeRange}, ${duration}`;
    const { style, widthPercent } = getViewportBlockStyle(block, viewport);
    const compact = widthPercent < COMPACT_TIMELINE_BLOCK_PERCENT;
    const selected = block.id === selectedTimelineBlockId;
    const selectedClasses = selected
        ? ' outline outline-2 outline-offset-2 outline-cyan-300 shadow-cyan-300/40'
        : '';

    return `<div data-timeline-block="${type}" data-timeline-block-id="${escapeHtml(block.id)}"
        data-compact="${compact ? 'true' : 'false'}"
        data-selected="${selected ? 'true' : 'false'}"
        role="img" class="absolute top-2 h-9 cursor-pointer overflow-hidden rounded border border-white/20 px-2 text-[11px] font-medium leading-9 text-white shadow-sm${selectedClasses}"
        style="${style}"
        title="${escapeHtml(title)}"
        aria-label="${escapeHtml(title)}">
        ${compact ? '' : `<span data-timeline-visible-label>${escapeHtml(label)}</span>`}
        <span class="sr-only">${escapeHtml(title)}</span>
    </div>`;
}

function renderTimelineTicks(viewport) {
    const midpoint = Math.round((viewport.startMinutes + viewport.endMinutes) / 2);

    return `<div class="grid grid-cols-3 pl-[5.25rem] pr-1 pb-2 text-[10px] text-slate-500">
        <span>${escapeHtml(formatMinutesAsTime(viewport.startMinutes))}</span>
        <span class="text-center">${escapeHtml(formatMinutesAsTime(midpoint))}</span>
        <span class="text-right">${escapeHtml(formatMinutesAsTime(viewport.endMinutes))}</span>
    </div>`;
}

function renderTimelineRow(label, type, blocks, viewport) {
    const blocksHtml = blocks.map((block) => renderTimelineBlock(block, type, viewport)).join('');

    return `<div class="grid grid-cols-[4.5rem_1fr] items-center gap-3">
        <div class="text-xs font-medium uppercase text-slate-400">${escapeHtml(label)}</div>
        <div class="relative h-12 rounded-lg border border-slate-700/70 bg-slate-950/60">
            ${blocksHtml}
        </div>
    </div>`;
}

function renderSelectedTimelineBlockDetail(blocks) {
    const selectedBlock =
        blocks.find((block) => block.id === selectedTimelineBlockId) ||
        blocks.find((block) => block.id);

    if (!selectedBlock) {
        return `<div class="mt-3 rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-500">
            No timeline blocks for this day.
        </div>`;
    }

    const label = getItemLabel(selectedBlock);
    const timeRange = `${formatTime(selectedBlock.startDateTime)} - ${formatTime(selectedBlock.endDateTime)}`;

    return `<div data-selected-timeline-block
        class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-900/70 bg-cyan-950/20 px-3 py-2 text-sm text-cyan-100">
        <span class="text-slate-400">Selected block:</span>
        <span class="font-semibold text-white">${escapeHtml(label)}</span>
        <span>${escapeHtml(timeRange)}</span>
        <span>${escapeHtml(calculateHoursAndMinutes(selectedBlock.duration))}</span>
    </div>`;
}

function renderTimeline(model) {
    const timelineContainer = document.getElementById('insights-timeline');
    if (!timelineContainer) {
        return;
    }

    const allBlocks = [...model.plannedBlocks, ...model.actualBlocks];
    const viewport = getTimelineViewport(allBlocks);

    timelineContainer.innerHTML = `<div class="rounded-lg border border-slate-700 bg-slate-950/80 p-4">
        <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
                <h3 class="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">Plan vs Actual</h3>
                <div data-timeline-range class="mt-1 text-xs text-slate-400">
                    Focused range: ${escapeHtml(formatMinutesAsTime(viewport.startMinutes))} -
                    ${escapeHtml(formatMinutesAsTime(viewport.endMinutes))}
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
    const formattedDate = formatLongDate(model.date);
    const heading = document.querySelector('#insights-activity-log h2, #insights-activity-log h3');

    if (heading) {
        heading.textContent = 'Activity Log';
    }

    if (model.activityLog.length === 0) {
        listContainer.innerHTML = `<div class="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-4 text-sm text-slate-400">
            No activities logged for ${escapeHtml(formattedDate)}.
        </div>`;
        renderShowMoreButton(0);
        return;
    }

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
    selectedTimelineBlockId = null;
    activityLogVisibleLimit = DEFAULT_ACTIVITY_LOG_LIMIT;
}

/**
 * Stores the selected timeline block used by subsequent renders.
 * @param {string|null} blockId
 */
export function setSelectedTimelineBlock(blockId) {
    selectedTimelineBlockId = blockId || null;
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

    renderSelectedDayContext(effectiveSelectedDate);
    renderSummary(model);
    renderTimeline(model);
    renderActivityLog(model, activityRenderOptions);
    renderTrends(trendModel, { selectedDate: effectiveSelectedDate, now });
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

function formatLongDate(date) {
    const parsed = new Date(`${date}T00:00:00`);
    return parsed.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

function renderSelectedDayContext(selectedDate) {
    const contextContainer = document.getElementById('insights-selected-day');
    if (!contextContainer) {
        return;
    }

    contextContainer.innerHTML = `<section class="rounded-lg border border-slate-700/70 bg-slate-900/70 px-4 py-3">
        <div class="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Selected day
        </div>
        <div class="mt-1 text-lg font-semibold text-slate-100">
            ${escapeHtml(formatLongDate(selectedDate))}
        </div>
        <div class="mt-1 text-xs text-slate-400">
            Summary, timeline, and activity log are scoped to this day.
        </div>
    </section>`;
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
        class="min-h-[7rem] snap-start rounded-lg border p-2 text-left ${
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

function isSameDateRange(left, right) {
    return left?.startDate === right?.startDate && left?.endDate === right?.endDate;
}

function renderTrendRangeControls(activeDateRange, now) {
    const buttons = TREND_RANGE_PRESETS.map((days) => {
        const presetRange = getDefaultTrendDateRange(now, days);
        const selected = isSameDateRange(activeDateRange, presetRange);

        return `<button type="button"
            data-trend-range-days="${days}"
            data-trend-range-start="${escapeHtml(presetRange.startDate)}"
            data-trend-range-end="${escapeHtml(presetRange.endDate)}"
            data-selected="${selected ? 'true' : 'false'}"
            class="rounded-md px-3 py-2 text-sm ${
                selected
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-sky-200 hover:bg-slate-900 hover:text-slate-100'
            }">
            ${days} days
        </button>`;
    }).join('');

    return `<div data-trend-range-controls
        class="inline-flex rounded-lg border border-slate-700 bg-slate-950/80 p-1">
        ${buttons}
    </div>`;
}

function scrollSelectedTrendDayIntoView(trendsContainer) {
    const trendDayStrip = trendsContainer.querySelector('[data-trend-day-strip]');
    const selectedDay = trendsContainer.querySelector('[data-trend-day][data-selected="true"]');
    if (!(trendDayStrip instanceof HTMLElement) || !(selectedDay instanceof HTMLElement)) {
        return;
    }

    const scrollSelectedDay = () => {
        if (!trendDayStrip.isConnected || !selectedDay.isConnected) {
            return;
        }

        const centeredScrollLeft =
            selectedDay.offsetLeft - (trendDayStrip.clientWidth - selectedDay.offsetWidth) / 2;

        trendDayStrip.scrollLeft = Math.max(0, centeredScrollLeft);
    };

    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(scrollSelectedDay);
    } else {
        window.setTimeout(scrollSelectedDay, 0);
    }
}

/**
 * Renders the lightweight Trends panel for activity insights.
 * @param {Object} trendModel
 */
export function renderTrends(trendModel = {}, { selectedDate = null, now = new Date() } = {}) {
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
            <div class="flex flex-wrap items-center justify-between gap-3">
                ${renderTrendRangeControls(dateRange, now)}
                <div class="text-xs text-slate-400">Range summary stays broad; selected day drives details.</div>
            </div>
            ${renderCategoryTrendChart(trendModel.categoryTotals || [])}
            <div data-trend-day-strip
                class="scrollbar-hidden grid snap-x auto-cols-[10.25rem] grid-flow-col gap-2 overflow-x-auto pb-2">
                ${dailyHours.map((day) => renderTrendDayCard(day, selectedDate)).join('')}
            </div>
        </div>
    </section>`;
    scrollSelectedTrendDayIntoView(trendsContainer);
}

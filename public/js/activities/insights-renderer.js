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

function renderShowMoreButton(hiddenCount) {
    const logContainer = document.getElementById('insights-activity-log');
    if (!logContainer) {
        return;
    }

    logContainer.querySelector('[data-show-more-activities]')?.remove();

    if (hiddenCount <= 0) {
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.showMoreActivities = 'true';
    button.className =
        'mt-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800';
    button.textContent = `Show ${hiddenCount} more`;
    logContainer.append(button);
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
        activityIssuesById: groupIssuesByActivityId(model.activityLogIssues)
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

/**
 * Placeholder for Phase 5 trend rendering.
 */
export function renderTrends() {}

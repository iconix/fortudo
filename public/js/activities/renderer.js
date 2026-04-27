import {
    renderCategoryBadge,
    getSelectableCategoryOptions,
    resolveCategoryKey
} from '../taxonomy/taxonomy-selectors.js';
import {
    calculateHoursAndMinutes,
    extractTimeFromDateTime,
    convertTo12HourTime,
    extractDateFromDateTime
} from '../utils.js';
import { computeEndTimePreview, renderCategoryOptionsHtml } from '../tasks/form-utils.js';
import { buildActivitySummaryModel } from './summary.js';

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatTimeRange(startDateTime, endDateTime) {
    const startTime = extractTimeFromDateTime(new Date(startDateTime));
    const endTime = extractTimeFromDateTime(new Date(endDateTime));
    return `${convertTo12HourTime(startTime)} - ${convertTo12HourTime(endTime)}`;
}

function getSummarySwatchStyle(summaryItem) {
    if (summaryItem.isUncategorized) {
        return 'background: repeating-linear-gradient(135deg, #64748b 0, #64748b 6px, #334155 6px, #334155 12px); border: 1px solid rgba(148, 163, 184, 0.35);';
    }

    return `background-color: ${summaryItem.color};`;
}

function getSummarySegmentStyle(summaryItem, totalDuration) {
    const widthPercentage = totalDuration > 0 ? (summaryItem.duration / totalDuration) * 100 : 0;

    if (summaryItem.isUncategorized) {
        return `width: ${widthPercentage}%; background: repeating-linear-gradient(135deg, #64748b 0, #64748b 6px, #334155 6px, #334155 12px);`;
    }

    return `width: ${widthPercentage}%; background-color: ${summaryItem.color};`;
}

function getParentSummaryInteractionClasses(summaryItem) {
    if (summaryItem.isUncategorized) {
        return {
            segment: 'cursor-default',
            legend: 'cursor-default'
        };
    }

    return {
        segment: 'cursor-pointer',
        legend: 'cursor-pointer'
    };
}

function renderParentSummarySegment(summaryItem, totalDuration) {
    const interactionClasses = getParentSummaryInteractionClasses(summaryItem);
    const commonAttributes = `data-summary-segment="${escapeHtml(summaryItem.key)}" data-summary-parent-segment="${escapeHtml(summaryItem.key)}" data-summary-parent-key="${escapeHtml(summaryItem.key)}"`;
    const commonStyle = getSummarySegmentStyle(summaryItem, totalDuration);

    if (summaryItem.isUncategorized) {
        return `<div ${commonAttributes} class="h-full ${interactionClasses.segment}" style="${commonStyle}"></div>`;
    }

    return `<button type="button" ${commonAttributes} class="block h-full appearance-none border-0 bg-transparent p-0 ${interactionClasses.segment}" style="${commonStyle}"></button>`;
}

function renderParentSummaryLegendItem(summaryItem) {
    const interactionClasses = getParentSummaryInteractionClasses(summaryItem);
    const commonAttributes = `data-summary-parent-legend="${escapeHtml(summaryItem.key)}" data-summary-parent-key="${escapeHtml(summaryItem.key)}"`;
    const content = `<span data-summary-legend-swatch="${escapeHtml(summaryItem.key)}" class="h-2 w-2 rounded-full shrink-0" style="${getSummarySwatchStyle(summaryItem)}"></span>
                    ${escapeHtml(summaryItem.label)} ${escapeHtml(calculateHoursAndMinutes(summaryItem.duration))}
                    <span data-summary-parent-count="${escapeHtml(summaryItem.key)}" class="inline-flex min-w-[1.25rem] items-center justify-center rounded-full border border-slate-600/80 bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-300">${escapeHtml(summaryItem.count)}</span>`;

    if (summaryItem.isUncategorized) {
        return `<span ${commonAttributes} class="inline-flex items-center gap-2 ${interactionClasses.legend}">
                    ${content}
                </span>`;
    }

    return `<button type="button" ${commonAttributes} class="inline-flex items-center gap-2 appearance-none border-0 bg-transparent p-0 text-left ${interactionClasses.legend}">
                    ${content}
                </button>`;
}

function renderExpandedChildRail(expandedGroup) {
    if (!expandedGroup) {
        return '';
    }
    const segmentsHtml = expandedGroup.items
        .map(
            (item) =>
                `<div data-summary-child-segment="${escapeHtml(item.key)}" class="h-full rounded-full" style="${getSummarySegmentStyle(item, expandedGroup.totalDuration)}"></div>`
        )
        .join('');
    const legendHtml = expandedGroup.items
        .map(
            (item) =>
                `<span data-summary-child-legend="${escapeHtml(item.key)}" class="inline-flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 rounded-full shrink-0" style="background-color: ${item.color};"></span>
                    ${escapeHtml(item.label)} ${escapeHtml(calculateHoursAndMinutes(item.duration))}
                </span>`
        )
        .join('');

    return `<div data-summary-expanded-group="${escapeHtml(expandedGroup.key)}" class="mt-2 space-y-1.5">
        <div class="flex items-center justify-between gap-3 text-[11px] text-slate-400">
            <span class="uppercase tracking-[0.18em] text-slate-300">${escapeHtml(expandedGroup.label)}</span>
            <span>${escapeHtml(calculateHoursAndMinutes(expandedGroup.totalDuration))}</span>
        </div>
        <div class="flex h-1.5 overflow-hidden rounded-full bg-slate-950/90">
            ${segmentsHtml}
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
            ${legendHtml}
        </div>
    </div>`;
}

function renderActivitySummary(activities, options = {}) {
    const { summaryItems, totalDuration, totalCount, expandedGroup } = buildActivitySummaryModel(
        activities,
        options.expandedParentGroupKey
    );

    if (summaryItems.length === 0 || totalDuration <= 0) {
        return '';
    }

    const segmentsHtml = summaryItems
        .map((item) => renderParentSummarySegment(item, totalDuration))
        .join('');

    const legendHtml = summaryItems.map((item) => renderParentSummaryLegendItem(item)).join('');
    const expandedRailHtml = renderExpandedChildRail(expandedGroup);

    return `<div data-activity-summary class="px-3 py-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
        <div class="flex items-end justify-between gap-3 mb-3">
            <div class="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-sky-300">
                <span>Activity Breakdown</span>
                <span data-summary-total-count class="inline-flex min-w-[1.35rem] items-center justify-center rounded-full border border-sky-700/60 bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-200 normal-case tracking-normal">${escapeHtml(totalCount)}</span>
            </div>
            <div class="text-xs text-slate-300">Total <span class="font-medium text-slate-100">${escapeHtml(calculateHoursAndMinutes(totalDuration))}</span></div>
        </div>
        <div class="flex h-3 overflow-hidden rounded-full border border-slate-700 bg-slate-950/90">
            ${segmentsHtml}
        </div>
        <div class="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-xs text-slate-300 sm:grid-cols-2">
            ${legendHtml}
        </div>
        ${expandedRailHtml}
    </div>`;
}

export function renderActivitySummaryOnly(activities, container, options = {}) {
    const targetContainer = container || document.getElementById('activity-list');
    if (!targetContainer) {
        return;
    }

    const summaryActivities = Array.isArray(options.summaryActivities)
        ? options.summaryActivities
        : activities;
    const summaryHtml = renderActivitySummary(summaryActivities, options);
    const existingSummary = targetContainer.querySelector('[data-activity-summary]');

    if (!summaryHtml) {
        existingSummary?.remove();
        return;
    }

    if (existingSummary) {
        existingSummary.outerHTML = summaryHtml;
        return;
    }

    targetContainer.insertAdjacentHTML('afterbegin', summaryHtml);
}

function renderInlineEditActivityItem(activity) {
    const durationHours = Math.floor(activity.duration / 60);
    const durationMinutes = activity.duration % 60;
    const displayStartTime = extractTimeFromDateTime(new Date(activity.startDateTime));
    const activityDate = extractDateFromDateTime(new Date(activity.startDateTime));
    const resolvedCategory = activity.category ? resolveCategoryKey(activity.category) : null;
    const categoryColor = resolvedCategory?.record?.color || '#64748b';
    const categoryOptionsHtml = renderCategoryOptionsHtml(
        getSelectableCategoryOptions(),
        activity.category || ''
    );
    const endTimeHint = computeEndTimePreview(
        displayStartTime,
        durationHours.toString(),
        durationMinutes.toString()
    );
    const isAuto = activity.source === 'auto';
    const provenanceHtml = isAuto
        ? `<div class="flex items-center gap-2 text-xs text-sky-400/70">
               <span class="activity-source-link italic cursor-default" data-source-task-id="${escapeHtml(activity.sourceTaskId || '')}" title="Auto-logged from task">
                   <i class="fa-solid fa-link mr-0.5"></i>auto
               </span>
               <span class="text-slate-500">Edited copy of a completed task</span>
           </div>`
        : '';

    return `<form class="activity-inline-edit-form activity-item px-3 py-3 rounded-lg bg-slate-800/70 border border-sky-700/40 shadow-md space-y-3" data-activity-id="${escapeHtml(activity.id)}" data-activity-date="${escapeHtml(activityDate)}" data-activity-edit="true" autocomplete="off">
        ${provenanceHtml}
        <div class="flex flex-col sm:flex-row gap-3">
            <div class="relative sm:flex-[1.8]">
                <i class="fa-regular fa-pen-to-square absolute left-3 top-1/2 -translate-y-1/2 text-sky-400"></i>
                <input type="text" name="description" value="${escapeHtml(activity.description)}" placeholder="What did you work on?"
                    class="bg-slate-700 pl-10 pr-4 py-2.5 rounded-lg w-full border border-slate-600 focus:outline-none focus:border-sky-400 transition-all text-slate-100" required>
            </div>
            <div class="sm:flex-1 sm:min-w-[13rem]">
                <div class="flex items-center gap-2">
                <span class="activity-edit-category-dot w-3 h-3 rounded-full shrink-0" style="background-color: ${escapeHtml(categoryColor)};"></span>
                <select name="category" class="bg-slate-700 px-3 py-2.5 rounded-lg w-full border border-slate-600 focus:outline-none focus:border-sky-400 transition-all text-slate-100">
                    <option value="">No category</option>
                    ${categoryOptionsHtml}
                </select>
                </div>
            </div>
        </div>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:pb-5">
            <div class="relative sm:w-40">
                <i class="fa-regular fa-clock absolute left-3 top-1/2 -translate-y-1/2 text-sky-400"></i>
                <input type="time" name="start-time" value="${escapeHtml(displayStartTime)}"
                    class="bg-slate-700 pl-10 pr-3 py-2 rounded-lg w-full border border-slate-600 focus:outline-none focus:border-sky-400 transition-all text-slate-100" required>
            </div>
            <div class="relative pb-5 sm:pb-0 sm:w-44">
                <div class="flex items-center gap-2">
                <div class="relative flex-1">
                    <i class="fa-regular fa-hourglass absolute left-3 top-1/2 -translate-y-1/2 text-sky-400"></i>
                    <input type="number" name="duration-hours" value="${durationHours}" min="0" placeholder="HH"
                        class="bg-slate-700 pl-10 pr-2 py-2 rounded-lg w-full border border-slate-600 focus:outline-none focus:border-sky-400 transition-all text-slate-100">
                </div>
                <span class="text-slate-400 text-lg">:</span>
                <div class="relative flex-1">
                    <input type="number" name="duration-minutes" value="${durationMinutes.toString().padStart(2, '0')}" min="0" max="59" placeholder="MM"
                        class="bg-slate-700 px-3 py-2 rounded-lg w-full border border-slate-600 focus:outline-none focus:border-sky-400 transition-all text-slate-100">
                </div>
                <span class="edit-end-time-hint absolute top-full mt-1 right-0 text-xs text-sky-400/70 transition-opacity duration-300 whitespace-nowrap pointer-events-none ${endTimeHint ? '' : 'opacity-0'}">${endTimeHint ? `&#9656; ${escapeHtml(endTimeHint)}` : ''}</span>
                </div>
            </div>
            <div class="flex items-center gap-2 sm:ml-auto">
                <button type="button" class="btn-cancel-activity-edit px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100">
                    <i class="fa-solid fa-xmark mr-2"></i>Cancel
                </button>
                <button type="submit" class="btn-save-activity-edit px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-white">
                    <i class="fa-solid fa-check mr-2"></i>Save
                </button>
            </div>
        </div>
    </form>`;
}

function renderActivityItem(activity, options = {}) {
    const timeRange = formatTimeRange(activity.startDateTime, activity.endDateTime);
    const durationText = calculateHoursAndMinutes(activity.duration);
    const badge = renderCategoryBadge(activity.category);
    const isConfirmingDelete = options.confirmingDeleteActivityId === activity.id;
    const isAuto = activity.source === 'auto';
    const provenanceHtml = isAuto
        ? `<span class="activity-source-link text-xs text-sky-400/60 italic cursor-default" data-source-task-id="${escapeHtml(activity.sourceTaskId || '')}" title="Auto-logged from task">
               <i class="fa-solid fa-link mr-0.5"></i>auto
           </span>`
        : '';
    const actionsHtml = `<div class="flex items-center gap-2">
               ${provenanceHtml}
               <button class="btn-edit-activity text-slate-400 hover:text-slate-200 transition-colors text-xs" data-activity-id="${escapeHtml(activity.id)}" title="Edit activity">
                   <i class="fa-solid fa-pen"></i>
               </button>
               <button class="btn-delete-activity ${isConfirmingDelete ? 'text-rose-400' : 'text-rose-400/60 hover:text-rose-400'} transition-colors text-xs" data-activity-id="${escapeHtml(activity.id)}" title="Delete activity">
                   <i class="fa-${isConfirmingDelete ? 'regular fa-check-circle' : 'solid fa-trash-can'}"></i>
               </button>
           </div>`;

    return `<div class="activity-item flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-sky-700/30 transition-colors" data-activity-id="${escapeHtml(activity.id)}">
        <div class="flex-grow min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm text-slate-200 truncate">${escapeHtml(activity.description)}</span>
                ${badge}
            </div>
            <div class="text-xs text-slate-400 mt-0.5">
                ${escapeHtml(timeRange)} · ${escapeHtml(durationText)}
            </div>
        </div>
        <div class="shrink-0">
            ${actionsHtml}
        </div>
    </div>`;
}

export function renderActivities(activities, container, options = {}) {
    const targetContainer = container || document.getElementById('activity-list');

    if (!targetContainer) {
        return;
    }

    const summaryActivities = Array.isArray(options.summaryActivities)
        ? options.summaryActivities
        : activities;
    const summaryHtml = renderActivitySummary(summaryActivities, options);

    if (!activities || activities.length === 0) {
        const emptyStateMessage = summaryHtml
            ? 'No completed activities logged today yet.'
            : 'No activities tracked today. Log one or complete a scheduled task.';
        targetContainer.innerHTML = `
            ${summaryHtml}
            <div class="py-6 text-slate-500 text-sm italic px-2">
                <i class="fa-regular fa-clock mr-1"></i>
                ${emptyStateMessage}
            </div>`;
        return;
    }

    const editingActivityId = options.editingActivityId || null;
    const activitiesHtml = activities
        .map((activity) =>
            activity.id === editingActivityId
                ? renderInlineEditActivityItem(activity)
                : renderActivityItem(activity, options)
        )
        .join('');
    targetContainer.innerHTML = `${summaryHtml}${activitiesHtml}`;
}

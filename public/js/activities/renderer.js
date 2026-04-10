import {
    renderCategoryBadge,
    getSelectableCategoryOptions
} from '../taxonomy/taxonomy-selectors.js';
import {
    calculateHoursAndMinutes,
    extractTimeFromDateTime,
    convertTo12HourTime,
    extractDateFromDateTime
} from '../utils.js';

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

function renderCategoryOptions(selectedCategory) {
    const options = getSelectableCategoryOptions();
    const baseOption = '<option value="">No category</option>';
    const renderedOptions = options
        .map((option) => {
            const indent = option.indentLevel > 0 ? '&nbsp;&nbsp;' : '';
            const selected = option.value === selectedCategory ? ' selected' : '';
            return `<option value="${escapeHtml(option.value)}"${selected}>${indent}${escapeHtml(option.label)}</option>`;
        })
        .join('');

    return `${baseOption}${renderedOptions}`;
}

function renderInlineEditActivityItem(activity) {
    const durationHours = Math.floor(activity.duration / 60);
    const durationMinutes = activity.duration % 60;
    const displayStartTime = extractTimeFromDateTime(new Date(activity.startDateTime));
    const activityDate = extractDateFromDateTime(new Date(activity.startDateTime));
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
                <select name="category" class="bg-slate-700 px-3 py-2.5 rounded-lg w-full border border-slate-600 focus:outline-none focus:border-sky-400 transition-all text-slate-100">
                    ${renderCategoryOptions(activity.category)}
                </select>
            </div>
        </div>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div class="relative sm:w-40">
                <i class="fa-regular fa-clock absolute left-3 top-1/2 -translate-y-1/2 text-sky-400"></i>
                <input type="time" name="start-time" value="${escapeHtml(displayStartTime)}"
                    class="bg-slate-700 pl-10 pr-3 py-2 rounded-lg w-full border border-slate-600 focus:outline-none focus:border-sky-400 transition-all text-slate-100" required>
            </div>
            <div class="flex items-center gap-2 sm:w-44">
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
            </div>
            <div class="flex items-center gap-2 sm:ml-auto">
                <button type="button" class="btn-cancel-activity-edit px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-100">
                    <i class="fa-solid fa-xmark mr-2"></i>Cancel
                </button>
                <button type="button" class="btn-save-activity-edit px-4 py-2 rounded-lg font-medium transition-all duration-300 shadow flex items-center bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-white">
                    <i class="fa-solid fa-check mr-2"></i>Save
                </button>
            </div>
        </div>
    </form>`;
}

function renderActivityItem(activity) {
    const timeRange = formatTimeRange(activity.startDateTime, activity.endDateTime);
    const durationText = calculateHoursAndMinutes(activity.duration);
    const badge = renderCategoryBadge(activity.category);
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
               <button class="btn-delete-activity text-rose-400/60 hover:text-rose-400 transition-colors text-xs" data-activity-id="${escapeHtml(activity.id)}" title="Delete activity">
                   <i class="fa-solid fa-trash-can"></i>
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

    if (!activities || activities.length === 0) {
        targetContainer.innerHTML = `
            <div class="text-center py-6 text-slate-500 text-sm">
                <i class="fa-regular fa-clock mr-1"></i>
                No activities tracked today. Log one or complete a scheduled task.
            </div>`;
        return;
    }

    const editingActivityId = options.editingActivityId || null;
    targetContainer.innerHTML = activities
        .map((activity) =>
            activity.id === editingActivityId
                ? renderInlineEditActivityItem(activity)
                : renderActivityItem(activity)
        )
        .join('');
}

import { renderCategoryBadge } from '../taxonomy/taxonomy-selectors.js';
import {
    calculateHoursAndMinutes,
    extractTimeFromDateTime,
    convertTo12HourTime
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

function renderActivityItem(activity) {
    const timeRange = formatTimeRange(activity.startDateTime, activity.endDateTime);
    const durationText = calculateHoursAndMinutes(activity.duration);
    const badge = renderCategoryBadge(activity.category);
    const isAuto = activity.source === 'auto';

    const actionsHtml = isAuto
        ? `<span class="activity-source-link text-xs text-sky-400/60 italic cursor-default" data-source-task-id="${escapeHtml(activity.sourceTaskId || '')}" title="Auto-logged from task">
               <i class="fa-solid fa-link mr-0.5"></i>auto
           </span>`
        : `<div class="flex items-center gap-2">
               <button class="btn-edit-activity text-sky-400/60 hover:text-sky-400 transition-colors text-xs" data-activity-id="${escapeHtml(activity.id)}" title="Edit activity">
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

export function renderActivities(activities, container) {
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

    targetContainer.innerHTML = activities.map((activity) => renderActivityItem(activity)).join('');
}

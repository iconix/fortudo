import {
    calculateHoursAndMinutes,
    convertTo12HourTime,
    extractTimeFromDateTime
} from '../utils.js';

function createElement(tagName, className = '', text = '') {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
}

function formatTime(dateTime) {
    return convertTo12HourTime(extractTimeFromDateTime(new Date(dateTime)));
}

function formatChangeDuration(change, key) {
    if (key === 'nextDuration' && change.isSubMinute) {
        return '<1m';
    }
    return calculateHoursAndMinutes(change[key]);
}

function appendRepairRow(list, change) {
    const isCurrentTimerBoundary = change.boundaryType === 'current-timer';
    const row = createElement(
        'label',
        `block cursor-pointer rounded-lg border border-slate-700 bg-slate-900/70 p-3 transition-colors hover:border-slate-500 hover:bg-slate-900${
            isCurrentTimerBoundary
                ? ' relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-sky-400/50'
                : ''
        }`
    );
    const layout = createElement('div', 'flex items-start gap-3');
    const selection = document.createElement('input');
    selection.type = 'checkbox';
    selection.checked = true;
    selection.dataset.confirmSelection = '';
    selection.dataset.overlapRepairId = change.activityId;
    selection.className = 'mt-1 h-5 w-5 shrink-0 accent-violet-400';
    selection.setAttribute('aria-label', `Repair ${change.description}`);

    const details = createElement('div', 'min-w-0 flex-1');
    const heading = createElement('div', 'flex flex-wrap items-center gap-2');
    heading.append(createElement('span', 'font-medium text-slate-100', change.description));
    if (change.isLargeAdjustment) {
        const largeAdjustment = createElement(
            'span',
            'text-xs font-medium text-slate-400',
            'Large adjustment'
        );
        largeAdjustment.dataset.overlapLargeAdjustment = '';
        heading.append(largeAdjustment);
    }

    const start = formatTime(change.startDateTime);
    const previousEnd = formatTime(change.previousEndDateTime);
    const nextEnd = formatTime(change.nextEndDateTime);
    const durationDetail = createElement('div', 'mt-1 text-xs text-slate-400');
    durationDetail.append(
        document.createTextNode(
            `${formatChangeDuration(change, 'previousDuration')} → ${formatChangeDuration(change, 'nextDuration')} · `
        )
    );
    const boundaryCopy = createElement(
        'span',
        isCurrentTimerBoundary ? 'text-sky-300/80' : '',
        isCurrentTimerBoundary
            ? 'ends at current timer start'
            : `ends before ${change.overlappingActivityDescription}`
    );
    if (isCurrentTimerBoundary) {
        boundaryCopy.dataset.overlapCurrentTimerBoundary = '';
    }
    durationDetail.append(boundaryCopy);
    details.append(
        heading,
        createElement(
            'div',
            'mt-1 text-sm text-slate-300',
            `${start}–${previousEnd} → ${start}–${nextEnd}`
        ),
        durationDetail
    );

    layout.append(selection, details);
    row.append(layout);
    list.append(row);
}

function getUnresolvedActivityNames(overlap) {
    if (overlap.reason === 'same-start') {
        return (
            overlap.descriptions ||
            [overlap.description, overlap.overlappingActivityDescription].filter(Boolean)
        );
    }

    return [overlap.description, overlap.overlappingActivityDescription].filter(Boolean);
}

function getUnresolvedExplanation(overlap) {
    if (overlap.reason === 'same-start') {
        return 'These activities start together. Edit or delete one manually.';
    }

    if (overlap.reason === 'containment') {
        return 'One activity contains the other. Because one was manually or automatically logged, edit it manually.';
    }

    if (overlap.reason === 'current-timer-protected') {
        return 'The current timer started first, so this repair will not change either item. Stop the timer or edit the saved activity manually.';
    }

    if (overlap.reason === 'current-timer-same-start') {
        return 'The current timer and saved activity start together. Edit the saved activity manually, or stop the timer before deciding which time to keep.';
    }

    return 'These activities overlap. Edit one manually.';
}

function appendCurrentTimerReference(content, currentTimerReference) {
    if (!currentTimerReference) {
        return;
    }

    const reference = createElement(
        'div',
        'rounded-lg border border-slate-700 bg-slate-800/50 p-3'
    );
    reference.dataset.overlapCurrentTimerReference = '';
    const heading = createElement('div', 'flex flex-wrap items-center gap-2');
    const label = createElement(
        'span',
        'inline-flex items-center gap-1.5 text-sm font-medium text-slate-200'
    );
    const icon = createElement('i', 'fa-regular fa-clock text-slate-400');
    icon.setAttribute('aria-hidden', 'true');
    label.append(icon, document.createTextNode('Current timer'));
    heading.append(
        label,
        createElement(
            'span',
            'rounded bg-slate-700/70 px-1.5 py-0.5 text-xs font-medium text-slate-300',
            'Protected'
        )
    );
    reference.append(
        heading,
        createElement(
            'p',
            'mt-1 text-sm text-slate-300',
            `${currentTimerReference.description} · started ${formatTime(currentTimerReference.startDateTime)}`
        )
    );
    content.append(reference);
}

function appendUnresolvedActivityNames(container, overlap) {
    const names = getUnresolvedActivityNames(overlap);
    names.forEach((name, index) => {
        if (index > 0) {
            container.append(createElement('span', 'text-xs text-slate-500', '+'));
        }
        const nameElement = createElement(
            'span',
            'rounded-md bg-slate-700/70 px-2 py-1 text-sm font-medium text-slate-100',
            name
        );
        nameElement.dataset.overlapUnresolvedActivityName = '';
        container.append(nameElement);
    });
}

function appendUnresolvedSection(content, unresolvedOverlaps, hasSelectableRepairs) {
    if (unresolvedOverlaps.length === 0) {
        return;
    }

    const section = createElement(
        'section',
        hasSelectableRepairs
            ? 'border-t border-slate-700 pt-4'
            : 'rounded-lg border border-slate-600/70 bg-slate-800/40 p-3'
    );
    section.dataset.overlapUnresolvedList = '';
    const heading = createElement(
        'h4',
        'text-sm font-medium text-slate-200',
        hasSelectableRepairs ? 'Not included in this repair' : 'Needs manual review'
    );
    heading.dataset.overlapUnresolvedHeading = '';
    section.append(heading);

    if (hasSelectableRepairs) {
        section.append(
            createElement(
                'p',
                'mt-1 text-xs leading-relaxed text-slate-400',
                'These activities will not change when you repair the selected items.'
            )
        );
    }

    const list = createElement('div', 'mt-3 space-y-2');
    unresolvedOverlaps.forEach((overlap) => {
        const item = createElement(
            'div',
            'rounded-lg border border-slate-700/80 bg-slate-900/40 p-3'
        );
        const names = createElement('div', 'flex flex-wrap items-center gap-2');
        appendUnresolvedActivityNames(names, overlap);
        item.append(
            names,
            createElement(
                'p',
                'mt-2 text-sm leading-relaxed text-slate-300',
                getUnresolvedExplanation(overlap)
            )
        );
        list.append(item);
    });
    section.append(list);
    content.append(section);
}

/**
 * Builds the interactive, mobile-friendly review content for overlap repair.
 * @param {Object} preview
 * @returns {HTMLElement}
 */
export function buildActivityOverlapRepairPreview(preview) {
    const changes = preview?.changes || [];
    const unresolvedOverlaps = preview?.unresolvedOverlaps || [];
    const content = createElement('div', 'space-y-4 text-left');
    content.dataset.overlapRepairPreview = '';

    content.append(
        createElement(
            'p',
            'text-sm leading-relaxed text-slate-300',
            changes.length > 0
                ? 'Review the proposed repairs. Uncheck anything you want to leave unchanged.'
                : 'These overlaps need your input before they can be changed.'
        )
    );

    appendCurrentTimerReference(content, preview?.currentTimerReference);

    if (changes.length > 0) {
        const list = createElement('div', 'space-y-2');
        list.dataset.overlapRepairList = '';
        changes.forEach((change) => appendRepairRow(list, change));
        content.append(list);
    }

    appendUnresolvedSection(content, unresolvedOverlaps, changes.length > 0);

    if (changes.length > 0) {
        const hasCurrentTimerRepair = changes.some(
            (change) => change.boundaryType === 'current-timer'
        );
        content.append(
            createElement(
                'p',
                'text-xs leading-relaxed text-slate-400',
                hasCurrentTimerRepair
                    ? 'Only selected saved activity end times and durations will change. The current timer will keep running and will not change.'
                    : 'Only selected end times and durations will change. Activities will not be deleted or moved.'
            )
        );
    }

    return content;
}

/**
 * Reads the currently selected repair IDs from rendered preview content.
 * @param {ParentNode} content
 * @returns {string[]}
 */
export function getSelectedOverlapRepairActivityIds(content) {
    return [...content.querySelectorAll('[data-overlap-repair-id]:checked')].map(
        (selection) => selection.dataset.overlapRepairId
    );
}

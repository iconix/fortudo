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
    const row = createElement(
        'label',
        'block cursor-pointer rounded-lg border border-slate-700 bg-slate-900/70 p-3 transition-colors hover:border-amber-400/60 hover:bg-slate-900'
    );
    const layout = createElement('div', 'flex items-start gap-3');
    const selection = document.createElement('input');
    selection.type = 'checkbox';
    selection.checked = true;
    selection.dataset.confirmSelection = '';
    selection.dataset.overlapRepairId = change.activityId;
    selection.className = 'mt-1 h-5 w-5 shrink-0 accent-amber-400';
    selection.setAttribute('aria-label', `Repair ${change.description}`);

    const details = createElement('div', 'min-w-0 flex-1');
    const heading = createElement('div', 'flex flex-wrap items-center gap-2');
    heading.append(createElement('span', 'font-medium text-slate-100', change.description));
    if (change.isLargeAdjustment) {
        heading.append(
            createElement(
                'span',
                'rounded-full border border-amber-400/60 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200',
                'Large adjustment'
            )
        );
    }

    const start = formatTime(change.startDateTime);
    const previousEnd = formatTime(change.previousEndDateTime);
    const nextEnd = formatTime(change.nextEndDateTime);
    details.append(
        heading,
        createElement(
            'div',
            'mt-1 text-sm text-slate-300',
            `${start}–${previousEnd} → ${start}–${nextEnd}`
        ),
        createElement(
            'div',
            'mt-1 text-xs text-slate-400',
            `${formatChangeDuration(change, 'previousDuration')} → ${formatChangeDuration(change, 'nextDuration')} · ends before ${change.overlappingActivityDescription}`
        )
    );

    layout.append(selection, details);
    row.append(layout);
    list.append(row);
}

function joinDescriptions(descriptions) {
    if (descriptions.length <= 1) {
        return descriptions[0] || 'These activities';
    }
    if (descriptions.length === 2) {
        return `${descriptions[0]} and ${descriptions[1]}`;
    }
    return `${descriptions.slice(0, -1).join(', ')}, and ${descriptions.at(-1)}`;
}

function getUnresolvedDescription(overlap) {
    if (overlap.reason === 'same-start') {
        const descriptions =
            overlap.descriptions ||
            [overlap.description, overlap.overlappingActivityDescription].filter(Boolean);
        return `${joinDescriptions(descriptions)} start together. Edit or delete one manually.`;
    }

    if (overlap.reason === 'containment') {
        return `${overlap.description} contains ${overlap.overlappingActivityDescription}. Because one was manually or automatically logged, edit it manually.`;
    }

    return `${overlap.description} overlaps ${overlap.overlappingActivityDescription}. Edit it manually.`;
}

function appendUnresolvedSection(content, unresolvedOverlaps) {
    if (unresolvedOverlaps.length === 0) {
        return;
    }

    const section = createElement(
        'section',
        'rounded-lg border border-amber-500/40 bg-amber-500/10 p-3'
    );
    section.dataset.overlapUnresolvedList = '';
    section.append(
        createElement('h4', 'text-sm font-semibold text-amber-200', 'Needs manual review')
    );

    const list = createElement('div', 'mt-2 space-y-2');
    unresolvedOverlaps.forEach((overlap) => {
        list.append(
            createElement(
                'p',
                'text-sm leading-relaxed text-slate-300',
                getUnresolvedDescription(overlap)
            )
        );
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
                : 'These overlaps cannot be repaired safely without your judgment.'
        )
    );

    if (changes.length > 0) {
        const list = createElement('div', 'space-y-2');
        list.dataset.overlapRepairList = '';
        changes.forEach((change) => appendRepairRow(list, change));
        content.append(list);
    }

    appendUnresolvedSection(content, unresolvedOverlaps);

    if (changes.length > 0) {
        content.append(
            createElement(
                'p',
                'text-xs leading-relaxed text-slate-400',
                'Only selected end times and durations will change. Activities will not be deleted or moved.'
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

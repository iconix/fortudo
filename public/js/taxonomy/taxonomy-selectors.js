import { getTaxonomyState } from './taxonomy-store.js';

export function getTaxonomySnapshot() {
    return getTaxonomyState();
}

export function getGroupByKey(key) {
    const group = getTaxonomyState().groups.find((entry) => entry.key === key);
    return group || null;
}

export function getCategoryByKey(key) {
    const category = getTaxonomyState().categories.find((entry) => entry.key === key);
    return category || null;
}

export function resolveCategoryKey(key) {
    const group = getGroupByKey(key);
    if (group) {
        return { kind: 'group', record: group };
    }

    const category = getCategoryByKey(key);
    if (category) {
        return { kind: 'category', record: category };
    }

    return null;
}

export function getSelectableCategoryOptions() {
    const { groups, categories } = getTaxonomyState();
    const options = [];

    for (const group of groups) {
        options.push({ value: group.key, label: group.label, indentLevel: 0 });

        const childCategories = categories.filter((category) => category.groupKey === group.key);
        for (const category of childCategories) {
            options.push({ value: category.key, label: category.label, indentLevel: 1 });
        }
    }

    return options;
}

export function getCategoryBadgeData(key) {
    const resolved = resolveCategoryKey(key);
    if (!resolved) {
        return null;
    }

    return {
        kind: resolved.kind,
        key: resolved.record.key,
        label: resolved.record.label,
        color: resolved.record.color
    };
}

export function renderCategoryBadge(categoryKey) {
    if (!categoryKey) {
        return '';
    }

    const badgeData = getCategoryBadgeData(categoryKey);
    if (!badgeData) {
        return '';
    }

    const safeLabel = escapeHtml(badgeData.label);
    const color = badgeData.color;

    return `<span class="category-badge inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs" style="background-color: rgba(15, 23, 42, 0.9); color: #e2e8f0; border: 1px solid ${color}55; box-shadow: inset 0 0 0 1px ${color}22;">
        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background-color: ${color}"></span>
        ${safeLabel}
    </span>`;
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

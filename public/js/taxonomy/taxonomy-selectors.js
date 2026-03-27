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

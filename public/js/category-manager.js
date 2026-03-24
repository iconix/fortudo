import { pickLinkedChildColor } from './category-colors.js';
import {
    loadTaxonomy,
    getTaxonomyState,
    TAXONOMY_CONFIG_ID,
    TAXONOMY_SCHEMA_VERSION,
    DEFAULT_CHILD_CATEGORY_DEFINITIONS
} from './taxonomy/taxonomy-store.js';
import {
    getTaxonomySnapshot,
    getGroupByKey,
    getCategoryByKey,
    resolveCategoryKey,
    getSelectableCategoryOptions,
    getCategoryBadgeData
} from './taxonomy/taxonomy-selectors.js';
export {
    addGroup,
    updateGroup,
    deleteGroup,
    addCategory,
    updateCategory,
    deleteCategory
} from './taxonomy/taxonomy-mutations.js';

export { TAXONOMY_CONFIG_ID, TAXONOMY_SCHEMA_VERSION };

export const DEFAULT_CATEGORIES = Object.freeze(
    DEFAULT_CHILD_CATEGORY_DEFINITIONS.map((category, index) =>
        Object.freeze({
            key: category.key,
            label: category.label,
            color: pickLinkedChildColor('blue', index),
            group: category.groupKey
        })
    )
);

export async function loadCategories() {
    await loadTaxonomy();
}

export function getCategories() {
    return getTaxonomySnapshot();
}

export { getGroupByKey, getCategoryByKey, resolveCategoryKey, getSelectableCategoryOptions };

export function getCategoryGroups() {
    const { groups, categories } = getTaxonomyState();

    return groups.reduce((result, group) => {
        const childCategories = categories.filter((category) => category.groupKey === group.key);
        result[group.key] = [
            {
                key: group.key,
                label: group.label,
                color: group.color,
                group: group.key,
                groupKey: group.key,
                isLinkedToGroupFamily: false,
                isGroupRecord: true,
                isStandaloneGroup: childCategories.length === 0
            },
            ...childCategories.map((category) => ({
                key: category.key,
                label: category.label,
                color: category.color,
                group: category.groupKey,
                groupKey: category.groupKey,
                isLinkedToGroupFamily: category.isLinkedToGroupFamily,
                isGroupRecord: false,
                isStandaloneGroup: false
            }))
        ];
        return result;
    }, {});
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

    return `<span class="category-badge inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}40;">
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

import {
    COLOR_FAMILIES,
    getFamilyBaseColor,
    isColorInFamily,
    normalizeFamilyName,
    pickLinkedChildColor
} from './category-colors.js';
import {
    loadTaxonomy,
    getTaxonomyState,
    getMutableTaxonomyState,
    persistTaxonomyState,
    isTaxonomyKeyReferencedByTasks,
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

export async function addGroup(input) {
    const label = input?.label?.trim();
    if (!label) {
        throw new Error('Group label is required');
    }

    const key = slugify(input.key || label);
    ensureKeyAvailable(key, `Group "${key}" already exists`);

    const colorFamily = normalizeFamilyName(input.colorFamily || 'blue');
    const state = getMutableTaxonomyState();
    state.groups.push({
        key,
        label,
        colorFamily,
        color: getFamilyBaseColor(colorFamily)
    });

    await persistTaxonomyState();
}

export async function updateGroup(key, updates) {
    const state = getMutableTaxonomyState();
    const group = state.groups.find((entry) => entry.key === key);
    if (!group) {
        throw new Error(`Group "${key}" not found`);
    }

    if (typeof updates.label === 'string' && updates.label.trim()) {
        group.label = updates.label.trim();
    }

    if (updates.colorFamily !== undefined) {
        const colorFamily = normalizeFamilyName(updates.colorFamily);
        group.colorFamily = colorFamily;
        group.color = getFamilyBaseColor(colorFamily);

        getChildCategories(group.key).forEach((category, index) => {
            if (!category.isLinkedToGroupFamily) {
                return;
            }

            category.color = pickLinkedChildColor(colorFamily, index);
        });
    }

    await persistTaxonomyState();
}

export async function deleteGroup(key) {
    const state = getMutableTaxonomyState();
    const index = state.groups.findIndex((entry) => entry.key === key);
    if (index === -1) {
        throw new Error(`Group "${key}" not found`);
    }

    if (state.categories.some((category) => category.groupKey === key)) {
        throw new Error(`Group "${key}" still has child categories`);
    }

    if (await isTaxonomyKeyReferencedByTasks(key)) {
        throw new Error(`Group "${key}" is referenced by tasks`);
    }

    state.groups.splice(index, 1);
    await persistTaxonomyState();
}

export async function addCategory(input) {
    const label = input?.label?.trim();
    if (!label) {
        throw new Error('Category label is required');
    }

    const requestedGroupKey = (input.groupKey || input.group || '').trim();
    const normalizedGroupKey = slugify(requestedGroupKey);
    if (!normalizedGroupKey) {
        throw new Error('Category group is required');
    }

    const state = getMutableTaxonomyState();
    let group = state.groups.find((entry) => entry.key === normalizedGroupKey);
    if (!group) {
        if (!input.allowCreateGroup) {
            throw new Error(`Group "${normalizedGroupKey}" not found`);
        }

        group = createCompatibilityGroup(normalizedGroupKey, requestedGroupKey, input.color);
        state.groups.push(group);
    }

    const key = (input.key || `${group.key}/${slugify(label)}`).trim();
    ensureKeyAvailable(key, `Category "${key}" already exists`);

    const color =
        input.color ||
        pickLinkedChildColor(group.colorFamily, getChildCategories(group.key).length);
    state.categories.push({
        key,
        label,
        color,
        groupKey: group.key,
        isLinkedToGroupFamily: isColorInFamily(group.colorFamily, color)
    });

    await persistTaxonomyState();
}

export async function updateCategory(key, updates) {
    const state = getMutableTaxonomyState();
    const category = state.categories.find((entry) => entry.key === key);
    if (!category) {
        throw new Error(`Category "${key}" not found`);
    }

    if (typeof updates.label === 'string' && updates.label.trim()) {
        category.label = updates.label.trim();
    }

    if (updates.color !== undefined) {
        const group = state.groups.find((entry) => entry.key === category.groupKey);
        category.color = updates.color;
        category.isLinkedToGroupFamily =
            !!group && isColorInFamily(group.colorFamily, updates.color);
    }

    await persistTaxonomyState();
}

export async function deleteCategory(key) {
    const state = getMutableTaxonomyState();
    const index = state.categories.findIndex((entry) => entry.key === key);
    if (index === -1) {
        throw new Error(`Category "${key}" not found`);
    }

    if (await isTaxonomyKeyReferencedByTasks(key)) {
        throw new Error(`Category "${key}" is referenced by tasks`);
    }

    state.categories.splice(index, 1);
    await persistTaxonomyState();
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

function createCompatibilityGroup(groupKey, requestedLabel, color) {
    const colorFamily = normalizeFamilyName(
        inferFamilyFromColor(color, defaultColorFamilyForGroup(groupKey))
    );

    return {
        key: groupKey,
        label: titleCase(requestedLabel || groupKey),
        colorFamily,
        color: typeof color === 'string' && color ? color : getFamilyBaseColor(colorFamily)
    };
}

function getChildCategories(groupKey) {
    return getMutableTaxonomyState().categories.filter(
        (category) => category.groupKey === groupKey
    );
}

function ensureKeyAvailable(key, message) {
    if (resolveCategoryKey(key)) {
        throw new Error(message);
    }
}

function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function titleCase(value) {
    return value
        .split(/[-/_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function inferFamilyFromColor(color, fallback = 'blue') {
    if (typeof color !== 'string') {
        return fallback;
    }

    const normalizedColor = color.toLowerCase();
    for (const [familyName, familyColors] of Object.entries(COLOR_FAMILIES)) {
        if (familyColors.includes(normalizedColor)) {
            return familyName;
        }
    }

    return fallback;
}

function defaultColorFamilyForGroup(groupKey) {
    return getTaxonomyState().groups.find((group) => group.key === groupKey)?.colorFamily || 'blue';
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

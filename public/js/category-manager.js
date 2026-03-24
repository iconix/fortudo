import { loadConfig, putConfig, loadTasks } from './storage.js';
import {
    COLOR_FAMILIES,
    getFamilyBaseColor,
    isColorInFamily,
    normalizeFamilyName,
    pickLinkedChildColor
} from './category-colors.js';

export const TAXONOMY_CONFIG_ID = 'config-categories';
export const TAXONOMY_SCHEMA_VERSION = '3.5';

const DEFAULT_GROUP_DEFINITIONS = Object.freeze([
    { key: 'work', label: 'Work', colorFamily: 'blue' },
    { key: 'personal', label: 'Personal', colorFamily: 'rose' },
    { key: 'break', label: 'Break', colorFamily: 'green' }
]);

const DEFAULT_CATEGORY_DEFINITIONS = Object.freeze([
    { key: 'work/deep', label: 'Deep Work', groupKey: 'work' },
    { key: 'work/meetings', label: 'Meetings', groupKey: 'work' },
    { key: 'work/comms', label: 'Comms', groupKey: 'work' },
    { key: 'work/admin', label: 'Admin', groupKey: 'work' }
]);

export const DEFAULT_CATEGORIES = Object.freeze(
    DEFAULT_CATEGORY_DEFINITIONS.map((category, index) =>
        Object.freeze({
            key: category.key,
            label: category.label,
            color: pickLinkedChildColor('blue', index),
            group: category.groupKey
        })
    )
);

/** @type {Array<{key: string, label: string, colorFamily: string, color: string}>} */
let groups = [];

/** @type {Array<{key: string, label: string, color: string, groupKey: string, isLinkedToGroupFamily: boolean}>} */
let categories = [];

/**
 * Load taxonomy from config, migrating legacy documents when necessary.
 * @returns {Promise<void>}
 */
export async function loadCategories() {
    const config = await loadConfig(TAXONOMY_CONFIG_ID);

    if (!config) {
        seedDefaultTaxonomy();
        await persistTaxonomy();
        return;
    }

    if (config.schemaVersion === TAXONOMY_SCHEMA_VERSION) {
        groups = normalizeGroups(config.groups);
        categories = normalizeCategories(config.categories, groups);
        return;
    }

    if (!Array.isArray(config.categories) || config.categories.length === 0) {
        seedDefaultTaxonomy();
        await persistTaxonomy();
        return;
    }

    const migratedTaxonomy = migrateLegacyTaxonomy(config.categories);
    groups = migratedTaxonomy.groups;
    categories = migratedTaxonomy.categories;
    await persistTaxonomy();
}

/**
 * Get the in-memory split taxonomy.
 * @returns {{groups: Array<Object>, categories: Array<Object>}}
 */
export function getCategories() {
    return {
        groups: groups.map(cloneGroup),
        categories: categories.map(cloneCategory)
    };
}

/**
 * Look up a group by key.
 * @param {string} key
 * @returns {{key: string, label: string, colorFamily: string, color: string}|null}
 */
export function getGroupByKey(key) {
    const group = groups.find((entry) => entry.key === key);
    return group ? cloneGroup(group) : null;
}

/**
 * Look up a child category by key.
 * @param {string} key
 * @returns {{key: string, label: string, color: string, groupKey: string, isLinkedToGroupFamily: boolean}|null}
 */
export function getCategoryByKey(key) {
    const category = categories.find((entry) => entry.key === key);
    return category ? cloneCategory(category) : null;
}

/**
 * Resolve a selectable taxonomy key to its backing record.
 * @param {string} key
 * @returns {{kind: 'group'|'category', record: Object}|null}
 */
export function resolveCategoryKey(key) {
    const group = groups.find((entry) => entry.key === key);
    if (group) {
        return { kind: 'group', record: cloneGroup(group) };
    }

    const category = categories.find((entry) => entry.key === key);
    if (category) {
        return { kind: 'category', record: cloneCategory(category) };
    }

    return null;
}

/**
 * Build a flattened, ordered list of selectable taxonomy options.
 * @returns {Array<{value: string, label: string, indentLevel: number}>}
 */
export function getSelectableCategoryOptions() {
    const options = [];

    for (const group of groups) {
        options.push({ value: group.key, label: group.label, indentLevel: 0 });
        for (const category of getChildCategories(group.key)) {
            options.push({ value: category.key, label: category.label, indentLevel: 1 });
        }
    }

    return options;
}

/**
 * Compatibility helper for phase 3 consumers that still expect grouped child categories.
 * @returns {Object<string, Array<{key: string, label: string, color: string, group: string, groupKey: string}>>}
 */
export function getCategoryGroups() {
    return groups.reduce((result, group) => {
        const childCategories = getChildCategories(group.key);
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

/**
 * Add a new group and persist it.
 * @param {{label: string, colorFamily?: string, key?: string}} input
 * @returns {Promise<void>}
 */
export async function addGroup(input) {
    const label = input?.label?.trim();
    if (!label) {
        throw new Error('Group label is required');
    }

    const key = slugify(input.key || label);
    ensureKeyAvailable(key, `Group "${key}" already exists`);

    const colorFamily = normalizeFamilyName(input.colorFamily || 'blue');
    groups.push({
        key,
        label,
        colorFamily,
        color: getFamilyBaseColor(colorFamily)
    });

    await persistTaxonomy();
}

/**
 * Update an existing group and cascade family changes to linked children.
 * @param {string} key
 * @param {{label?: string, colorFamily?: string}} updates
 * @returns {Promise<void>}
 */
export async function updateGroup(key, updates) {
    const group = groups.find((entry) => entry.key === key);
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

    await persistTaxonomy();
}

/**
 * Delete a group when it is safe to do so.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteGroup(key) {
    const index = groups.findIndex((entry) => entry.key === key);
    if (index === -1) {
        throw new Error(`Group "${key}" not found`);
    }

    if (categories.some((category) => category.groupKey === key)) {
        throw new Error(`Group "${key}" still has child categories`);
    }

    if (await isTaxonomyKeyReferencedByTasks(key)) {
        throw new Error(`Group "${key}" is referenced by tasks`);
    }

    groups.splice(index, 1);
    await persistTaxonomy();
}

/**
 * Add a new child category and persist it.
 * Supports the new `{ groupKey, label }` shape and the legacy phase 3 call shape.
 * @param {{groupKey?: string, label: string, color?: string, key?: string, group?: string, allowCreateGroup?: boolean}} input
 * @returns {Promise<void>}
 */
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

    let group = groups.find((entry) => entry.key === normalizedGroupKey);
    if (!group) {
        if (!input.allowCreateGroup) {
            throw new Error(`Group "${normalizedGroupKey}" not found`);
        }

        group = createCompatibilityGroup(normalizedGroupKey, requestedGroupKey, input.color);
        groups.push(group);
    }

    const key = (input.key || `${group.key}/${slugify(label)}`).trim();
    ensureKeyAvailable(key, `Category "${key}" already exists`);

    const color =
        input.color ||
        pickLinkedChildColor(group.colorFamily, getChildCategories(group.key).length);
    categories.push({
        key,
        label,
        color,
        groupKey: group.key,
        isLinkedToGroupFamily: isColorInFamily(group.colorFamily, color)
    });

    await persistTaxonomy();
}

/**
 * Update an existing child category by key.
 * @param {string} key
 * @param {{label?: string, color?: string}} updates
 * @returns {Promise<void>}
 */
export async function updateCategory(key, updates) {
    const category = categories.find((entry) => entry.key === key);
    if (!category) {
        throw new Error(`Category "${key}" not found`);
    }

    if (typeof updates.label === 'string' && updates.label.trim()) {
        category.label = updates.label.trim();
    }

    if (updates.color !== undefined) {
        const group = groups.find((entry) => entry.key === category.groupKey);
        category.color = updates.color;
        category.isLinkedToGroupFamily =
            !!group && isColorInFamily(group.colorFamily, updates.color);
    }

    await persistTaxonomy();
}

/**
 * Delete a child category when it is not referenced by tasks.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteCategory(key) {
    const index = categories.findIndex((entry) => entry.key === key);
    if (index === -1) {
        throw new Error(`Category "${key}" not found`);
    }

    if (await isTaxonomyKeyReferencedByTasks(key)) {
        throw new Error(`Category "${key}" is referenced by tasks`);
    }

    categories.splice(index, 1);
    await persistTaxonomy();
}

/**
 * Render a category badge for a task/activity card.
 * @param {string|null|undefined} categoryKey
 * @returns {string}
 */
export function renderCategoryBadge(categoryKey) {
    if (!categoryKey) {
        return '';
    }

    const resolved = resolveCategoryKey(categoryKey);
    if (!resolved) {
        return '';
    }

    const safeLabel = escapeHtml(resolved.record.label);
    const color = resolved.record.color;

    return `<span class="category-badge inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}40;">
        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background-color: ${color}"></span>
        ${safeLabel}
    </span>`;
}

function seedDefaultTaxonomy() {
    groups = DEFAULT_GROUP_DEFINITIONS.map((group) => ({
        key: group.key,
        label: group.label,
        colorFamily: group.colorFamily,
        color: getFamilyBaseColor(group.colorFamily)
    }));

    categories = DEFAULT_CATEGORY_DEFINITIONS.map((category, index) => ({
        key: category.key,
        label: category.label,
        groupKey: category.groupKey,
        color: pickLinkedChildColor(getGroupRecord(category.groupKey).colorFamily, index),
        isLinkedToGroupFamily: true
    }));
}

/**
 * @param {Array<Object>|undefined} storedGroups
 * @returns {Array<{key: string, label: string, colorFamily: string, color: string}>}
 */
function normalizeGroups(storedGroups) {
    if (!Array.isArray(storedGroups)) {
        return [];
    }

    return storedGroups
        .filter((group) => typeof group?.key === 'string' && group.key.trim())
        .map((group) => {
            const colorFamily = normalizeFamilyName(
                group.colorFamily || inferFamilyFromColor(group.color)
            );
            return {
                key: group.key.trim(),
                label:
                    typeof group.label === 'string' && group.label.trim()
                        ? group.label.trim()
                        : titleCase(group.key),
                colorFamily,
                color:
                    typeof group.color === 'string' && group.color
                        ? group.color
                        : getFamilyBaseColor(colorFamily)
            };
        });
}

/**
 * @param {Array<Object>|undefined} storedCategories
 * @param {Array<{key: string, colorFamily: string}>} availableGroups
 * @returns {Array<{key: string, label: string, color: string, groupKey: string, isLinkedToGroupFamily: boolean}>}
 */
function normalizeCategories(storedCategories, availableGroups = groups) {
    if (!Array.isArray(storedCategories)) {
        return [];
    }

    const groupMap = new Map(availableGroups.map((group) => [group.key, group]));

    return storedCategories
        .filter((category) => typeof category?.key === 'string' && category.key.trim())
        .map((category) => {
            const groupKey = typeof category.groupKey === 'string' ? category.groupKey.trim() : '';
            const group = groupMap.get(groupKey);
            const color =
                typeof category.color === 'string' ? category.color : group?.color || '#64748b';

            return {
                key: category.key.trim(),
                label:
                    typeof category.label === 'string' && category.label.trim()
                        ? category.label.trim()
                        : titleCase(category.key.split('/').pop() || category.key),
                color,
                groupKey,
                isLinkedToGroupFamily:
                    typeof category.isLinkedToGroupFamily === 'boolean'
                        ? category.isLinkedToGroupFamily
                        : !!group && isColorInFamily(group.colorFamily, color)
            };
        })
        .filter((category) => groupMap.has(category.groupKey));
}

/**
 * @param {Array<{key: string, label: string, color: string, group: string}>} legacyRows
 * @returns {{groups: Array<Object>, categories: Array<Object>}}
 */
function migrateLegacyTaxonomy(legacyRows) {
    const normalizedLegacyRows = legacyRows
        .filter(
            (row) =>
                typeof row?.key === 'string' &&
                row.key.trim() &&
                typeof row.group === 'string' &&
                row.group.trim()
        )
        .map((row) => ({
            key: row.key.trim(),
            label:
                typeof row.label === 'string' && row.label.trim()
                    ? row.label.trim()
                    : titleCase(row.key),
            color: typeof row.color === 'string' ? row.color : '#64748b',
            group: row.group.trim()
        }));

    const legacyGroups = Array.from(new Set(normalizedLegacyRows.map((row) => row.group)));
    const migratedGroups = legacyGroups.map((groupKey) => {
        const standaloneRow = normalizedLegacyRows.find(
            (row) => row.group === groupKey && row.key === groupKey
        );
        const groupColorFamily = inferLegacyGroupFamily(groupKey, normalizedLegacyRows);

        if (standaloneRow) {
            return {
                key: groupKey,
                label: standaloneRow.label,
                colorFamily: groupColorFamily,
                color: standaloneRow.color
            };
        }

        return {
            key: groupKey,
            label: titleCase(groupKey),
            colorFamily: groupColorFamily,
            color: getFamilyBaseColor(groupColorFamily)
        };
    });

    const groupMap = new Map(migratedGroups.map((group) => [group.key, group]));
    const migratedCategories = normalizedLegacyRows
        .filter((row) => row.key !== row.group)
        .map((row) => {
            const parentGroup = groupMap.get(row.group);
            return {
                key: row.key,
                label: row.label,
                color: row.color,
                groupKey: row.group,
                isLinkedToGroupFamily: isColorInFamily(parentGroup.colorFamily, row.color)
            };
        });

    return {
        groups: migratedGroups,
        categories: migratedCategories
    };
}

/**
 * @param {string} groupKey
 * @param {Array<{group: string, color: string}>} legacyRows
 * @returns {string}
 */
function inferLegacyGroupFamily(groupKey, legacyRows) {
    const matchingRows = legacyRows.filter((row) => row.group === groupKey);
    for (const row of matchingRows) {
        const inferredFamily = inferFamilyFromColor(row.color, null);
        if (inferredFamily) {
            return inferredFamily;
        }
    }

    return defaultColorFamilyForGroup(groupKey);
}

/**
 * @param {string|undefined} color
 * @param {string|null} [fallback='blue']
 * @returns {string|null}
 */
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
    return DEFAULT_GROUP_DEFINITIONS.find((group) => group.key === groupKey)?.colorFamily || 'blue';
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
    return categories.filter((category) => category.groupKey === groupKey);
}

function getGroupRecord(groupKey) {
    const group = groups.find((entry) => entry.key === groupKey);
    if (!group) {
        throw new Error(`Group "${groupKey}" not found`);
    }
    return group;
}

async function isTaxonomyKeyReferencedByTasks(key) {
    const tasks = await loadTasks();
    return tasks.some((task) => task.category === key);
}

function ensureKeyAvailable(key, message) {
    if (resolveCategoryKey(key)) {
        throw new Error(message);
    }
}

async function persistTaxonomy() {
    await putConfig({
        id: TAXONOMY_CONFIG_ID,
        schemaVersion: TAXONOMY_SCHEMA_VERSION,
        groups: groups.map(cloneGroup),
        categories: categories.map(cloneCategory)
    });
}

function cloneGroup(group) {
    return { ...group };
}

function cloneCategory(category) {
    return { ...category };
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

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

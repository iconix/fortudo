import { loadConfig, putConfig, loadTasks } from '../storage.js';
import {
    COLOR_FAMILIES,
    getFamilyBaseColor,
    isColorInFamily,
    normalizeFamilyName,
    pickLinkedChildColor
} from '../category-colors.js';

export const TAXONOMY_CONFIG_ID = 'config-categories';
export const TAXONOMY_SCHEMA_VERSION = '3.5';

export const DEFAULT_GROUP_DEFINITIONS = Object.freeze([
    { key: 'work', label: 'Work', colorFamily: 'blue' },
    { key: 'personal', label: 'Personal', colorFamily: 'rose' },
    { key: 'break', label: 'Break', colorFamily: 'green' }
]);

export const DEFAULT_CHILD_CATEGORY_DEFINITIONS = Object.freeze([
    { key: 'work/deep', label: 'Deep Work', groupKey: 'work' },
    { key: 'work/meetings', label: 'Meetings', groupKey: 'work' },
    { key: 'work/comms', label: 'Comms', groupKey: 'work' },
    { key: 'work/admin', label: 'Admin', groupKey: 'work' }
]);

let groups = [];
let categories = [];

export async function loadTaxonomy() {
    const config = await loadConfig(TAXONOMY_CONFIG_ID);

    if (!config) {
        seedDefaultTaxonomy();
        await persistTaxonomyState();
        return;
    }

    if (config.schemaVersion === TAXONOMY_SCHEMA_VERSION) {
        groups = normalizeGroups(config.groups);
        categories = normalizeCategories(config.categories, groups);
        return;
    }

    if (!Array.isArray(config.categories) || config.categories.length === 0) {
        seedDefaultTaxonomy();
        await persistTaxonomyState();
        return;
    }

    const migratedTaxonomy = migrateLegacyTaxonomy(config.categories);
    groups = migratedTaxonomy.groups;
    categories = migratedTaxonomy.categories;
    await persistTaxonomyState();
}

export function getTaxonomyState() {
    return {
        groups: groups.map(cloneGroup),
        categories: categories.map(cloneCategory)
    };
}

export function getMutableTaxonomyState() {
    return { groups, categories };
}

export function replaceTaxonomyState(nextState) {
    groups = normalizeGroups(nextState?.groups);
    categories = normalizeCategories(nextState?.categories, groups);
}

export async function persistTaxonomyState() {
    await putConfig({
        id: TAXONOMY_CONFIG_ID,
        schemaVersion: TAXONOMY_SCHEMA_VERSION,
        groups: groups.map(cloneGroup),
        categories: categories.map(cloneCategory)
    });
}

export async function isTaxonomyKeyReferencedByTasks(key) {
    const tasks = await loadTasks();
    return tasks.some((task) => task.category === key);
}

function seedDefaultTaxonomy() {
    groups = DEFAULT_GROUP_DEFINITIONS.map((group) => ({
        key: group.key,
        label: group.label,
        colorFamily: group.colorFamily,
        color: getFamilyBaseColor(group.colorFamily)
    }));

    categories = DEFAULT_CHILD_CATEGORY_DEFINITIONS.map((category, index) => ({
        key: category.key,
        label: category.label,
        groupKey: category.groupKey,
        color: pickLinkedChildColor(getGroupRecord(category.groupKey).colorFamily, index),
        isLinkedToGroupFamily: true
    }));
}

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

function getGroupRecord(groupKey) {
    const group = groups.find((entry) => entry.key === groupKey);
    if (!group) {
        throw new Error(`Group "${groupKey}" not found`);
    }
    return group;
}

function cloneGroup(group) {
    return { ...group };
}

function cloneCategory(category) {
    return { ...category };
}

function titleCase(value) {
    return value
        .split(/[-/_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

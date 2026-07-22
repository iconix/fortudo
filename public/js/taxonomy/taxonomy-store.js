import { loadActivities, loadConfig, putConfig, loadTasks } from '../storage.js';
import {
    COLOR_FAMILIES,
    getFamilyBaseColor,
    isColorInFamily,
    normalizeFamilyName,
    pickLinkedChildColor
} from '../category-colors.js';
import { createLegacyTaxonomyId } from './taxonomy-identity.js';

export const TAXONOMY_CONFIG_ID = 'config-categories';
export const TAXONOMY_SCHEMA_VERSION = '3.5';
export const TAXONOMY_IDENTITY_VERSION = 1;

export const DEFAULT_GROUP_DEFINITIONS = Object.freeze([
    { key: 'work', label: 'Work', colorFamily: 'blue' },
    { key: 'personal', label: 'Personal', colorFamily: 'rose' },
    { key: 'break', label: 'Break', colorFamily: 'green' }
]);

export const DEFAULT_CHILD_CATEGORY_DEFINITIONS = Object.freeze([
    { key: 'work/deep', label: 'Deep Work', groupKey: 'work' },
    { key: 'work/meetings', label: 'Comms', groupKey: 'work' },
    { key: 'work/comms', label: 'Meetings', groupKey: 'work' },
    { key: 'work/admin', label: 'Admin', groupKey: 'work' }
]);

let groups = [];
let categories = [];

const ROOT_OWNED_FIELDS = new Set([
    'id',
    'docType',
    'category',
    'categoryId',
    'categoryIdentityVersion',
    'schemaVersion',
    'identityVersion',
    'groups',
    'categories'
]);
const GROUP_OWNED_FIELDS = new Set([
    'id',
    'key',
    'legacyKeys',
    'label',
    'colorFamily',
    'color',
    'status',
    'archivedAt'
]);
const CATEGORY_OWNED_FIELDS = new Set([
    'id',
    'key',
    'legacyKeys',
    'label',
    'color',
    'groupKey',
    'groupId',
    'isLinkedToGroupFamily',
    'status',
    'archivedAt'
]);

let rootExtensions = {};
let groupExtensions = new Map();
let categoryExtensions = new Map();

function cloneJson(value) {
    if (value === undefined) {
        return undefined;
    }
    return JSON.parse(JSON.stringify(value));
}

function extractExtensions(record, ownedFields) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return {};
    }
    return Object.fromEntries(
        Object.entries(record)
            .filter(([key]) => !ownedFields.has(key))
            .map(([key, value]) => [key, cloneJson(value)])
    );
}

function resetExtensionState() {
    rootExtensions = {};
    groupExtensions = new Map();
    categoryExtensions = new Map();
}

function captureRowExtensions(sourceRows, normalizedRows, ownedFields) {
    const result = new Map();
    const normalizedById = new Map(normalizedRows.map((row) => [row.id, row]));
    const normalizedByKey = new Map(normalizedRows.map((row) => [row.key, row]));
    for (const source of Array.isArray(sourceRows) ? sourceRows : []) {
        const normalized = normalizedById.get(source?.id) || normalizedByKey.get(source?.key);
        if (!normalized) {
            continue;
        }
        const extensions = extractExtensions(source, ownedFields);
        if (Object.keys(extensions).length > 0) {
            result.set(normalized.id, extensions);
        }
    }
    return result;
}

function captureExtensionState(config) {
    rootExtensions = extractExtensions(config, ROOT_OWNED_FIELDS);
    groupExtensions = captureRowExtensions(config.groups, groups, GROUP_OWNED_FIELDS);
    categoryExtensions = captureRowExtensions(config.categories, categories, CATEGORY_OWNED_FIELDS);
}

function mergeExtensions(extensions, canonical) {
    return { ...cloneJson(extensions || {}), ...canonical };
}

export async function loadTaxonomy() {
    resetExtensionState();
    const config = await loadConfig(TAXONOMY_CONFIG_ID);

    if (!config) {
        seedDefaultTaxonomy();
        await persistTaxonomyState();
        return;
    }

    if (config.schemaVersion === TAXONOMY_SCHEMA_VERSION) {
        const hasIdentity = config.identityVersion === TAXONOMY_IDENTITY_VERSION;
        groups = normalizeGroups(config.groups, hasIdentity);
        categories = normalizeCategories(config.categories, groups, hasIdentity);
        captureExtensionState(config);
        return;
    }

    if (!Array.isArray(config.categories) || config.categories.length === 0) {
        seedDefaultTaxonomy();
        await persistTaxonomyState();
        return;
    }

    const migratedTaxonomy = migrateLegacyTaxonomy(config.categories);
    groups = normalizeGroups(migratedTaxonomy.groups, false);
    categories = normalizeCategories(migratedTaxonomy.categories, groups, false);
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
    resetExtensionState();
    groups = normalizeGroups(nextState?.groups, true);
    categories = normalizeCategories(nextState?.categories, groups, true);
}

export async function persistTaxonomyState() {
    const currentGroupIds = new Set(groups.map((group) => group.id));
    const currentCategoryIds = new Set(categories.map((category) => category.id));
    groupExtensions = new Map([...groupExtensions].filter(([id]) => currentGroupIds.has(id)));
    categoryExtensions = new Map(
        [...categoryExtensions].filter(([id]) => currentCategoryIds.has(id))
    );

    await putConfig(
        mergeExtensions(rootExtensions, {
            id: TAXONOMY_CONFIG_ID,
            schemaVersion: TAXONOMY_SCHEMA_VERSION,
            identityVersion: TAXONOMY_IDENTITY_VERSION,
            groups: groups.map((group) =>
                mergeExtensions(groupExtensions.get(group.id), cloneGroup(group))
            ),
            categories: categories.map((category) =>
                mergeExtensions(categoryExtensions.get(category.id), cloneCategory(category))
            )
        })
    );
}

export async function isTaxonomyKeyReferencedByTasks(key) {
    const tasks = await loadTasks();
    return tasks.some((task) => task.category === key);
}

export async function getTaxonomyReferenceCounts(record) {
    const [tasks, activities, runningActivity] = await Promise.all([
        loadTasks(),
        loadActivities(),
        loadConfig('config-running-activity')
    ]);
    const matches = (entity) =>
        Boolean(
            entity &&
            ((record.id && entity.categoryId === record.id) ||
                entity.category === record.key ||
                record.legacyKeys?.includes(entity.category))
        );

    return {
        tasks: tasks.filter(matches).length,
        activities: activities.filter(matches).length,
        runningTimer: matches(runningActivity) ? 1 : 0
    };
}

function seedDefaultTaxonomy() {
    groups = DEFAULT_GROUP_DEFINITIONS.map((group) => ({
        id: createLegacyTaxonomyId('group', group.key),
        key: group.key,
        legacyKeys: [group.key],
        label: group.label,
        colorFamily: group.colorFamily,
        color: getFamilyBaseColor(group.colorFamily),
        status: 'active',
        archivedAt: null
    }));

    categories = DEFAULT_CHILD_CATEGORY_DEFINITIONS.map((category, index) => ({
        id: createLegacyTaxonomyId('category', category.key),
        key: category.key,
        legacyKeys: [category.key],
        label: category.label,
        groupKey: category.groupKey,
        groupId: getGroupRecord(category.groupKey).id,
        color: pickLinkedChildColor(getGroupRecord(category.groupKey).colorFamily, index),
        isLinkedToGroupFamily: true,
        status: 'active',
        archivedAt: null
    }));
}

function normalizeLegacyKeys(storedLegacyKeys, key, hasIdentity) {
    if (hasIdentity && Array.isArray(storedLegacyKeys)) {
        return [...new Set(storedLegacyKeys.filter((value) => typeof value === 'string' && value))];
    }
    return [key];
}

function normalizeStatus(record) {
    const status = record?.status === 'archived' ? 'archived' : 'active';
    return {
        status,
        archivedAt:
            status === 'archived' && typeof record?.archivedAt === 'string'
                ? record.archivedAt
                : null
    };
}

function normalizeGroups(storedGroups, hasIdentity = false) {
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
                id:
                    typeof group.id === 'string' && group.id
                        ? group.id
                        : createLegacyTaxonomyId('group', group.key.trim()),
                key: group.key.trim(),
                legacyKeys: normalizeLegacyKeys(group.legacyKeys, group.key.trim(), hasIdentity),
                label:
                    typeof group.label === 'string' && group.label.trim()
                        ? group.label.trim()
                        : 'Unnamed group',
                colorFamily,
                color:
                    typeof group.color === 'string' && group.color
                        ? group.color
                        : getFamilyBaseColor(colorFamily),
                ...normalizeStatus(group)
            };
        });
}

function normalizeCategories(storedCategories, availableGroups = groups, hasIdentity = false) {
    if (!Array.isArray(storedCategories)) {
        return [];
    }

    const groupMap = new Map(availableGroups.map((group) => [group.key, group]));
    const groupIdMap = new Map(availableGroups.map((group) => [group.id, group]));

    return storedCategories
        .filter((category) => typeof category?.key === 'string' && category.key.trim())
        .map((category) => {
            const storedGroupKey =
                typeof category.groupKey === 'string' ? category.groupKey.trim() : '';
            const group = groupMap.get(storedGroupKey) || groupIdMap.get(category.groupId);
            const groupKey = group?.key || storedGroupKey;
            const color =
                typeof category.color === 'string' ? category.color : group?.color || '#64748b';

            return {
                id:
                    typeof category.id === 'string' && category.id
                        ? category.id
                        : createLegacyTaxonomyId('category', category.key.trim()),
                key: category.key.trim(),
                legacyKeys: normalizeLegacyKeys(
                    category.legacyKeys,
                    category.key.trim(),
                    hasIdentity
                ),
                label:
                    typeof category.label === 'string' && category.label.trim()
                        ? category.label.trim()
                        : 'Unnamed category',
                color,
                groupKey,
                groupId: group?.id || null,
                isLinkedToGroupFamily:
                    typeof category.isLinkedToGroupFamily === 'boolean'
                        ? category.isLinkedToGroupFamily
                        : !!group && isColorInFamily(group.colorFamily, color),
                ...normalizeStatus(category)
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
        .map((row) => {
            const key = row.key.trim();
            const group = row.group.trim();
            return {
                key,
                label:
                    typeof row.label === 'string' && row.label.trim()
                        ? row.label.trim()
                        : key === group
                          ? 'Unnamed group'
                          : 'Unnamed category',
                color: typeof row.color === 'string' ? row.color : '#64748b',
                group
            };
        });

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
            label: 'Unnamed group',
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

    return 'blue';
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

function getGroupRecord(groupKey) {
    const group = groups.find((entry) => entry.key === groupKey);
    if (!group) {
        throw new Error(`Group "${groupKey}" not found`);
    }
    return group;
}

function cloneGroup(group) {
    return { ...group, legacyKeys: [...(group.legacyKeys || [])] };
}

function cloneCategory(category) {
    return { ...category, legacyKeys: [...(category.legacyKeys || [])] };
}

import {
    COLOR_FAMILIES,
    getFamilyBaseColor,
    isColorInFamily,
    normalizeFamilyName,
    pickLinkedChildColor
} from '../category-colors.js';
import {
    getMutableTaxonomyState,
    persistTaxonomyState,
    getTaxonomyReferenceCounts,
    getTaxonomyState
} from './taxonomy-store.js';
import { createNewCategoryIdentity, createNewGroupIdentity } from './taxonomy-identity.js';
import { resolveCategoryKey } from './taxonomy-selectors.js';

function cloneRecord(record) {
    return { ...record, legacyKeys: [...(record.legacyKeys || [])] };
}

function normalizeComparableLabel(label) {
    return label.trim().toLocaleLowerCase();
}

function ensureActiveGroupLabelAvailable(label, excludedId = null) {
    const normalized = normalizeComparableLabel(label);
    const duplicate = getMutableTaxonomyState().groups.find(
        (group) =>
            group.status === 'active' &&
            group.id !== excludedId &&
            normalizeComparableLabel(group.label) === normalized
    );
    if (duplicate) {
        throw new Error(`Active group label "${label}" already exists`);
    }
}

function ensureActiveCategoryLabelAvailable(groupId, label, excludedId = null) {
    const normalized = normalizeComparableLabel(label);
    const duplicate = getMutableTaxonomyState().categories.find(
        (category) =>
            category.status === 'active' &&
            category.groupId === groupId &&
            category.id !== excludedId &&
            normalizeComparableLabel(category.label) === normalized
    );
    if (duplicate) {
        throw new Error(`Active category label "${label}" already exists in this group`);
    }
}

function makeGroup({ label, colorFamily = 'blue', color = null }) {
    const identity = createNewGroupIdentity();
    const normalizedFamily = normalizeFamilyName(colorFamily);
    return {
        ...identity,
        label,
        colorFamily: normalizedFamily,
        color: color || getFamilyBaseColor(normalizedFamily),
        status: 'active',
        archivedAt: null
    };
}

function makeCategory({ group, label, color = null }) {
    const identity = createNewCategoryIdentity(group.key);
    const categoryColor =
        color || pickLinkedChildColor(group.colorFamily, getChildCategories(group.id).length);
    return {
        ...identity,
        label,
        color: categoryColor,
        groupKey: group.key,
        groupId: group.id,
        isLinkedToGroupFamily: isColorInFamily(group.colorFamily, categoryColor),
        status: 'active',
        archivedAt: null
    };
}

export async function addGroup(input) {
    const label = input?.label?.trim();
    if (!label) {
        throw new Error('Group label is required');
    }
    ensureActiveGroupLabelAvailable(label);

    const group = makeGroup({ label, colorFamily: input.colorFamily || 'blue' });
    getMutableTaxonomyState().groups.push(group);
    await persistTaxonomyState();
    return cloneRecord(group);
}

export async function updateGroup(key, updates) {
    const state = getMutableTaxonomyState();
    const group = state.groups.find((entry) => entry.key === key);
    if (!group) {
        throw new Error(`Group "${key}" not found`);
    }

    if (typeof updates.label === 'string' && updates.label.trim()) {
        if (group.status === 'archived') {
            throw new Error('Archived group labels are locked until restored');
        }
        const label = updates.label.trim();
        ensureActiveGroupLabelAvailable(label, group.id);
        group.label = label;
    }

    if (updates.colorFamily !== undefined) {
        const colorFamily = normalizeFamilyName(updates.colorFamily);
        group.colorFamily = colorFamily;
        group.color = getFamilyBaseColor(colorFamily);

        getChildCategories(group.id).forEach((category, index) => {
            if (category.isLinkedToGroupFamily) {
                category.color = pickLinkedChildColor(colorFamily, index);
            }
        });
    }

    await persistTaxonomyState();
    return cloneRecord(group);
}

export async function archiveGroup(key, archivedAt = new Date().toISOString()) {
    const group = getMutableTaxonomyState().groups.find((entry) => entry.key === key);
    if (!group) {
        throw new Error(`Group "${key}" not found`);
    }
    group.status = 'archived';
    group.archivedAt = archivedAt;
    await persistTaxonomyState();
    return cloneRecord(group);
}

export async function restoreGroup(key) {
    const group = getMutableTaxonomyState().groups.find((entry) => entry.key === key);
    if (!group) {
        throw new Error(`Group "${key}" not found`);
    }
    ensureActiveGroupLabelAvailable(group.label, group.id);
    group.status = 'active';
    group.archivedAt = null;
    await persistTaxonomyState();
    return cloneRecord(group);
}

export async function archiveAndCreateGroupReplacement(key, input) {
    const state = getMutableTaxonomyState();
    const group = state.groups.find((entry) => entry.key === key);
    if (!group) {
        throw new Error(`Group "${key}" not found`);
    }
    const label = input?.label?.trim();
    if (!label) {
        throw new Error('Group label is required');
    }
    ensureActiveGroupLabelAvailable(label, group.id);

    const replacement = makeGroup({
        label,
        colorFamily: input.colorFamily || group.colorFamily
    });
    group.status = 'archived';
    group.archivedAt = input.archivedAt || new Date().toISOString();
    state.groups.push(replacement);
    await persistTaxonomyState();
    return cloneRecord(replacement);
}

function formatReferenceBlock(record, counts) {
    if (counts.tasks) {
        return `${record.kind} "${record.label}" is referenced by tasks`;
    }
    if (counts.activities) {
        return `${record.kind} "${record.label}" is referenced by activities`;
    }
    if (counts.runningTimer) {
        return `${record.kind} "${record.label}" is referenced by the running timer`;
    }
    return null;
}

export async function deleteGroup(key) {
    const state = getMutableTaxonomyState();
    const index = state.groups.findIndex((entry) => entry.key === key);
    if (index === -1) {
        throw new Error(`Group "${key}" not found`);
    }
    const group = state.groups[index];

    if (state.categories.some((category) => category.groupId === group.id)) {
        throw new Error(`Group "${key}" still has child categories`);
    }

    const referenceBlock = formatReferenceBlock(
        { ...group, kind: 'Group' },
        await getTaxonomyReferenceCounts(group)
    );
    if (referenceBlock) {
        throw new Error(referenceBlock);
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
    if (!requestedGroupKey) {
        throw new Error('Category group is required');
    }

    const state = getMutableTaxonomyState();
    let group = state.groups.find((entry) => entry.key === requestedGroupKey);
    if (!group) {
        if (!input.allowCreateGroup) {
            throw new Error(`Group "${requestedGroupKey}" not found`);
        }

        const compatibilityLabel = input.groupLabel?.trim();
        if (!compatibilityLabel) {
            throw new Error('Group label is required');
        }
        ensureActiveGroupLabelAvailable(compatibilityLabel);
        group = makeGroup({
            label: compatibilityLabel,
            colorFamily: inferFamilyFromColor(input.color, 'blue'),
            color: input.color || null
        });
        state.groups.push(group);
    }
    if (group.status !== 'active') {
        throw new Error('New categories require an active group');
    }
    ensureActiveCategoryLabelAvailable(group.id, label);

    const category = makeCategory({ group, label, color: input.color || null });
    ensureKeyAvailable(category.key, `Category "${category.key}" already exists`);
    state.categories.push(category);

    await persistTaxonomyState();
    return cloneRecord(category);
}

export async function updateCategory(key, updates) {
    const state = getMutableTaxonomyState();
    const category = state.categories.find((entry) => entry.key === key);
    if (!category) {
        throw new Error(`Category "${key}" not found`);
    }

    if (typeof updates.label === 'string' && updates.label.trim()) {
        if (category.status === 'archived') {
            throw new Error('Archived category labels are locked until restored');
        }
        const label = updates.label.trim();
        ensureActiveCategoryLabelAvailable(category.groupId, label, category.id);
        category.label = label;
    }

    if (updates.linkToGroupFamily === true) {
        const group = state.groups.find((entry) => entry.id === category.groupId);
        if (!group) {
            throw new Error(`Group "${category.groupKey}" not found`);
        }

        const linkedIndex = getChildCategories(group.id).findIndex(
            (entry) => entry.id === category.id
        );
        category.color = pickLinkedChildColor(group.colorFamily, linkedIndex);
        category.isLinkedToGroupFamily = true;
    } else if (updates.color !== undefined) {
        const group = state.groups.find((entry) => entry.id === category.groupId);
        category.color = updates.color;
        category.isLinkedToGroupFamily =
            !!group && isColorInFamily(group.colorFamily, updates.color);
    }

    await persistTaxonomyState();
    return cloneRecord(category);
}

export async function archiveCategory(key, archivedAt = new Date().toISOString()) {
    const category = getMutableTaxonomyState().categories.find((entry) => entry.key === key);
    if (!category) {
        throw new Error(`Category "${key}" not found`);
    }
    category.status = 'archived';
    category.archivedAt = archivedAt;
    await persistTaxonomyState();
    return cloneRecord(category);
}

export async function restoreCategory(key) {
    const category = getMutableTaxonomyState().categories.find((entry) => entry.key === key);
    if (!category) {
        throw new Error(`Category "${key}" not found`);
    }
    const group = getMutableTaxonomyState().groups.find((entry) => entry.id === category.groupId);
    if (!group || group.status !== 'active') {
        throw new Error('Restore the parent group before restoring this category');
    }
    ensureActiveCategoryLabelAvailable(category.groupId, category.label, category.id);
    category.status = 'active';
    category.archivedAt = null;
    await persistTaxonomyState();
    return cloneRecord(category);
}

export async function archiveAndCreateCategoryReplacement(key, input) {
    const state = getMutableTaxonomyState();
    const category = state.categories.find((entry) => entry.key === key);
    if (!category) {
        throw new Error(`Category "${key}" not found`);
    }
    const label = input?.label?.trim();
    if (!label) {
        throw new Error('Category label is required');
    }
    const group = state.groups.find((entry) => entry.id === category.groupId);
    if (!group || group.status !== 'active') {
        throw new Error('Replacement categories require an active group');
    }
    ensureActiveCategoryLabelAvailable(group.id, label, category.id);

    const replacement = makeCategory({ group, label, color: input.color || null });
    category.status = 'archived';
    category.archivedAt = input.archivedAt || new Date().toISOString();
    state.categories.push(replacement);
    await persistTaxonomyState();
    return cloneRecord(replacement);
}

export async function deleteCategory(key) {
    const state = getMutableTaxonomyState();
    const index = state.categories.findIndex((entry) => entry.key === key);
    if (index === -1) {
        throw new Error(`Category "${key}" not found`);
    }
    const category = state.categories[index];

    const referenceBlock = formatReferenceBlock(
        { ...category, kind: 'Category' },
        await getTaxonomyReferenceCounts(category)
    );
    if (referenceBlock) {
        throw new Error(referenceBlock);
    }

    state.categories.splice(index, 1);
    await persistTaxonomyState();
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

function getChildCategories(groupId) {
    return getMutableTaxonomyState().categories.filter((category) => category.groupId === groupId);
}

function ensureKeyAvailable(key, message) {
    if (resolveCategoryKey(key)) {
        throw new Error(message);
    }
}

export function getDefaultColorFamilyForGroup(groupKey) {
    return getTaxonomyState().groups.find((group) => group.key === groupKey)?.colorFamily || 'blue';
}

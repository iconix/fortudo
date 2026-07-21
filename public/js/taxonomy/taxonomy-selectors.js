import { TAXONOMY_IDENTITY_VERSION, getTaxonomyState } from './taxonomy-store.js';

export function getTaxonomySnapshot() {
    return getTaxonomyState();
}

export function getGroupByKey(key) {
    const group = getTaxonomyState().groups.find(
        (entry) => entry.key === key || entry.legacyKeys?.includes(key)
    );
    return group || null;
}

export function getGroupById(id) {
    return getTaxonomyState().groups.find((entry) => entry.id === id) || null;
}

export function getCategoryByKey(key) {
    const category = getTaxonomyState().categories.find(
        (entry) => entry.key === key || entry.legacyKeys?.includes(key)
    );
    return category || null;
}

export function getCategoryById(id) {
    return getTaxonomyState().categories.find((entry) => entry.id === id) || null;
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

export function resolveCategoryId(id) {
    const group = getGroupById(id);
    if (group) {
        return { kind: 'group', record: group };
    }

    const category = getCategoryById(id);
    if (category) {
        return { kind: 'category', record: category };
    }

    return null;
}

function repairedFields(record) {
    return {
        category: record.key,
        categoryId: record.id,
        categoryIdentityVersion: TAXONOMY_IDENTITY_VERSION
    };
}

/**
 * Resolve a task/activity/timer taxonomy reference without inferring meaning from key text.
 * @param {{category?: string|null, categoryId?: string|null, categoryIdentityVersion?: number}|null} reference
 * @returns {Object|null}
 */
export function resolveCategoryReference(reference) {
    if (!reference || (!reference.category && !reference.categoryId)) {
        return null;
    }

    const legacyResolution = reference.category ? resolveCategoryKey(reference.category) : null;
    const idResolution = reference.categoryId ? resolveCategoryId(reference.categoryId) : null;

    if (legacyResolution && idResolution && legacyResolution.record.id === idResolution.record.id) {
        const needsRepair =
            reference.category !== idResolution.record.key ||
            reference.categoryIdentityVersion !== TAXONOMY_IDENTITY_VERSION;
        return {
            ...idResolution,
            label: idResolution.record.label,
            resolution: 'id',
            needsRepair,
            integrityIssue: null,
            repairedFields: repairedFields(idResolution.record)
        };
    }

    if (legacyResolution) {
        const mismatch = Boolean(reference.categoryId);
        return {
            ...legacyResolution,
            label: legacyResolution.record.label,
            resolution: mismatch ? 'legacy-mismatch' : 'legacy',
            needsRepair: true,
            integrityIssue: mismatch ? 'category-mismatch' : null,
            repairedFields: repairedFields(legacyResolution.record)
        };
    }

    if (idResolution) {
        return {
            ...idResolution,
            label: idResolution.record.label,
            resolution: 'id-only',
            needsRepair: true,
            integrityIssue: reference.category ? 'unknown-legacy-category' : null,
            repairedFields: repairedFields(idResolution.record)
        };
    }

    return {
        kind: null,
        record: null,
        label: 'Unknown category',
        resolution: 'unknown',
        needsRepair: false,
        integrityIssue: 'unknown-category',
        repairedFields: null
    };
}

export function getCategoryReferenceFields(reference) {
    if (!reference || (!reference.category && !reference.categoryId)) {
        return { category: null };
    }

    const resolved = resolveCategoryReference(reference);
    if (resolved?.repairedFields) {
        return resolved.repairedFields;
    }

    return {
        category: reference.category || null,
        ...(reference.categoryId ? { categoryId: reference.categoryId } : {}),
        ...(reference.categoryIdentityVersion
            ? { categoryIdentityVersion: reference.categoryIdentityVersion }
            : {})
    };
}

export function getSelectableCategoryOptions(selectedReference = null) {
    const { groups, categories } = getTaxonomyState();
    const selected = resolveCategoryReference(selectedReference);
    const selectedRecord = selected?.record || null;
    const selectedGroupId =
        selected?.kind === 'group' ? selectedRecord.id : selectedRecord?.groupId || null;
    const options = [];

    for (const group of groups) {
        const includeGroup = group.status === 'active' || group.id === selectedGroupId;
        if (!includeGroup) {
            continue;
        }
        options.push({
            value: group.key,
            identityId: group.id,
            label: group.label,
            indentLevel: 0,
            archived: group.status === 'archived'
        });

        const childCategories = categories.filter(
            (category) =>
                category.groupId === group.id &&
                (category.id === selectedRecord?.id ||
                    (group.status === 'active' && category.status === 'active'))
        );
        for (const category of childCategories) {
            options.push({
                value: category.key,
                identityId: category.id,
                label: category.label,
                indentLevel: 1,
                archived: category.status === 'archived' || group.status === 'archived'
            });
        }
    }

    return options;
}

export function getCategoryBadgeData(reference) {
    const normalizedReference = typeof reference === 'string' ? { category: reference } : reference;
    const resolved = resolveCategoryReference(normalizedReference);
    if (!resolved) {
        return null;
    }
    if (!resolved.record) {
        return typeof reference === 'string'
            ? null
            : {
                  kind: 'unknown',
                  id: normalizedReference?.categoryId || null,
                  key: null,
                  label: 'Unknown category',
                  color: '#64748b',
                  integrityIssue: resolved.integrityIssue
              };
    }

    return {
        kind: resolved.kind,
        id: resolved.record.id,
        key: resolved.record.key,
        label: resolved.record.label,
        color: resolved.record.color,
        integrityIssue: resolved.integrityIssue
    };
}

export function renderCategoryBadge(reference) {
    if (!reference) {
        return '';
    }

    const badgeData = getCategoryBadgeData(reference);
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

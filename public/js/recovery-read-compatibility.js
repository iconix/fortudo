// Read compatibility deliberately does not inspect writerContract. Historical
// remote revisions stay byte-for-byte unchanged; new writes use document-contract.
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isPresent = (value) => value !== null && value !== undefined;
const isOptionalText = (value) => !isPresent(value) || typeof value === 'string';
const isOptionalDuration = (value) => !isPresent(value) || (Number.isFinite(value) && value >= 0);

function failure(kind, field) {
    return { ok: false, kind, field };
}

function taxonomyField(document) {
    if (isPresent(document.identityVersion) && document.identityVersion !== 1)
        return 'identityVersion';
    if (isPresent(document.schemaVersion) && !/^3\.[0-5]$/.test(document.schemaVersion))
        return 'schemaVersion';
    if (!Array.isArray(document.categories)) return 'categories';
    const modern = document.schemaVersion === '3.5';
    const groups = document.groups;
    if (modern && (!Array.isArray(groups) || groups.some((row) => !isText(row?.key))))
        return 'groups';
    const keys = new Set();
    const ids = new Set();
    for (const row of [...(modern ? groups : []), ...document.categories]) {
        if (!isText(row?.key) || keys.has(row.key) || !isOptionalText(row.label))
            return 'categories';
        keys.add(row.key);
        if (document.identityVersion === 1) {
            if (!isText(row.id) || ids.has(row.id)) return 'identityVersion';
            ids.add(row.id);
        }
        if (
            isPresent(row.legacyKeys) &&
            (!Array.isArray(row.legacyKeys) || row.legacyKeys.some((key) => !isText(key)))
        )
            return 'legacyKeys';
        if (isPresent(row.status) && !['active', 'archived'].includes(row.status)) return 'status';
    }
    for (const row of document.categories) {
        if (!modern && !isText(row.group)) return 'categories';
        if (
            modern &&
            !groups.some(
                (group) =>
                    group.key === row.groupKey &&
                    (document.identityVersion !== 1 || group.id === row.groupId)
            )
        )
            return 'categories';
    }
    return null;
}

/**
 * Validate supported persisted read shapes without modifying a revision or
 * returning IDs, descriptions, credentials, or other record contents.
 * @param {Object} document
 * @returns {{ok: boolean, kind?: string, field?: string}}
 */
export function validateRecoveryDocument(document) {
    if (!document || Array.isArray(document) || !isText(document._id))
        return failure('record', 'document');
    if (document._deleted === true || document._id.startsWith('_design/')) return { ok: true };
    const kind = Object.prototype.hasOwnProperty.call(document, 'docType')
        ? document.docType
        : ['scheduled', 'unscheduled'].includes(document.type) ||
            ['sched-', 'unsched-'].some((prefix) => document._id.startsWith(prefix))
          ? 'task'
          : null;
    if (!['task', 'activity', 'config'].includes(kind)) return failure('record', 'docType');
    for (const field of ['category', 'categoryId', 'source', 'sourceTaskId']) {
        if (!isOptionalText(document[field])) return failure(kind, field);
    }
    if (isPresent(document.categoryIdentityVersion) && document.categoryIdentityVersion !== 1)
        return failure(kind, 'categoryIdentityVersion');
    if (kind === 'task') {
        if (!isText(document.description)) return failure(kind, 'description');
        if (!['scheduled', 'unscheduled'].includes(document.type)) return failure(kind, 'type');
        if (isPresent(document.status) && !['incomplete', 'completed'].includes(document.status))
            return failure(kind, 'status');
        if (
            isPresent(document.priority) &&
            !['high', 'medium', 'low', 'normal'].includes(document.priority)
        )
            return failure(kind, 'priority');
        if (!isOptionalDuration(document.estDuration)) return failure(kind, 'estDuration');
        if (isPresent(document.manualOrder) && !isOptionalDuration(document.manualOrder))
            return failure(kind, 'manualOrder');
    }
    if (kind === 'activity' || (kind === 'task' && document.type === 'scheduled')) {
        if (kind === 'activity' && !isOptionalText(document.description))
            return failure(kind, 'description');
        if (!isDate(document.startDateTime)) return failure(kind, 'startDateTime');
        if (
            !isDate(document.endDateTime) ||
            Date.parse(document.endDateTime) < Date.parse(document.startDateTime)
        )
            return failure(kind, 'endDateTime');
        if (
            !isOptionalDuration(document.duration) ||
            (kind === 'task' && !Number.isFinite(document.duration))
        )
            return failure(kind, 'duration');
    }
    if (kind === 'config') {
        if (document._id === 'config-categories') {
            const field = taxonomyField(document);
            if (field) return failure(kind, field);
        } else if (document._id === 'config-settings') {
            for (const field of ['activitiesEnabled', 'onboardingDismissed']) {
                if (isPresent(document[field]) && typeof document[field] !== 'boolean')
                    return failure(kind, field);
            }
            if (
                isPresent(document.onboardingSnoozedUntil) &&
                !isDate(document.onboardingSnoozedUntil)
            )
                return failure(kind, 'onboardingSnoozedUntil');
        } else if (document._id === 'config-running-activity') {
            if (!isDate(document.startDateTime)) return failure(kind, 'startDateTime');
            if (!isOptionalText(document.description)) return failure(kind, 'description');
            if (!isOptionalText(document.activityId)) return failure(kind, 'activityId');
        } else if (document._id === 'config-unscheduled-sequence') {
            if (document.schemaVersion !== 1) return failure(kind, 'schemaVersion');
            if (
                !Array.isArray(document.orderedTaskIds) ||
                document.orderedTaskIds.some((id) => !isText(id))
            )
                return failure(kind, 'orderedTaskIds');
        } else if (document._id !== 'config-taxonomy-identity-migration-v1') {
            return failure(kind, 'configuration');
        }
        // The completed migration marker is retained verbatim and has no app reader.
    }
    return { ok: true };
}

import { SYNC_REPLICATION_OPTIONS } from './sync-transport.js';
import {
    buildLocalRecoveryBundle,
    verifyLocalRecoveryBundle,
    canonicalJson
} from './local-recovery.js';
import {
    inspectRemoteDocumentContract,
    auditLocalDivergence,
    enumerateCurrentLocalLeaves
} from './sync-contract.js';
import {
    applyWriterContract,
    runCloudantContractValidator,
    validateLocalDocumentContract
} from './document-contract.js';
import { generateSecureUuid } from './entity-id.js';
import { createLegacyTaxonomyId } from './taxonomy/taxonomy-identity.js';

export const RECOVERY_ARCHIVE_DATABASE = 'fortudo-recovery-archives-v1';

/** The active replica pointer contains no task data or remote credentials. */
export function recoveryRouteKey(logicalName) {
    return `fortudo-recovery-route:${logicalName}`;
}

/** Read the durable replica selection, failing closed on an invalid pointer. */
export function getRecoveryRoute(logicalName, store = localStorage) {
    const raw = store.getItem(recoveryRouteKey(logicalName));
    if (!raw) return null;
    const route = JSON.parse(raw);
    if (
        typeof route.archiveId !== 'string' ||
        !route.archiveId.startsWith('recovery-') ||
        route.databaseName !== `${logicalName}-repaired-${route.archiveId}`
    ) {
        throw new Error('The saved recovery location is invalid. Your original data is retained.');
    }
    return route;
}

async function currentDocument(database, id) {
    const result = await database.allDocs({ keys: [id], include_docs: true, attachments: true });
    const row = result.rows[0];
    if (row?.value?.deleted) return { _id: id, _rev: row.value.rev, _deleted: true };
    return row?.doc || null;
}

function content(document) {
    if (!document) return null;
    return Object.fromEntries(
        Object.entries(document)
            .filter(
                ([key]) => !key.startsWith('_') || ['_id', '_deleted', '_attachments'].includes(key)
            )
            .filter(([key]) => key !== 'writerContract')
    );
}

function recoverTaxonomy(saved, current) {
    if (!Array.isArray(saved.categories)) return saved;
    const oldGroups = Array.isArray(saved.groups)
        ? saved.groups
        : [...new Set(saved.categories.map((row) => row.group).filter(Boolean))].map((key) => ({
              key,
              label: key
          }));
    const merge = (rows, existing, kind, groups = []) => {
        const result = [...existing];
        for (const row of rows) {
            if (typeof row?.key !== 'string' || !row.key.trim())
                throw new Error('A saved category needs a valid key.');
            const prior = existing.find(
                (item) =>
                    item.id === row.id || item.key === row.key || item.legacyKeys?.includes(row.key)
            );
            const key = prior?.key || row.key;
            const group = groups.find(
                (item) =>
                    item.id === row.groupId ||
                    item.key === (row.groupKey || row.group) ||
                    item.legacyKeys?.includes(row.groupKey || row.group)
            );
            const status = row.status === 'archived' ? 'archived' : 'active';
            const next = {
                ...prior,
                ...row,
                id: prior?.id || row.id || createLegacyTaxonomyId(kind, key),
                key,
                legacyKeys: [
                    ...new Set([
                        ...(prior?.legacyKeys || []),
                        ...(row.legacyKeys || []),
                        row.key,
                        key
                    ])
                ],
                status,
                archivedAt:
                    status === 'archived' ? row.archivedAt || new Date().toISOString() : null,
                ...(kind === 'category'
                    ? { groupKey: group?.key || row.groupKey, groupId: group?.id || row.groupId }
                    : {})
            };
            const index = result.findIndex((item) => item.id === next.id);
            if (index < 0) result.push(next);
            else result[index] = next;
        }
        return result;
    };
    const groups = merge(oldGroups, current?.groups || [], 'group');
    return {
        ...saved,
        docType: 'config',
        schemaVersion: '3.5',
        identityVersion: 1,
        groups,
        categories: merge(saved.categories, current?.categories || [], 'category', groups)
    };
}

function propose(document, taxonomy) {
    let result = content(document);
    const warnings = [];
    if (result._deleted) return { document: applyWriterContract(result), warnings };
    if (result._id === 'config-categories') {
        try {
            result = recoverTaxonomy(result, taxonomy);
            warnings.push(
                'Saved categories are merged with current categories, preserving their identities and existing references.'
            );
        } catch {
            warnings.push(
                'Some saved categories need correction before this setting can be restored.'
            );
        }
    }
    if (!result.docType && ['scheduled', 'unscheduled'].includes(result.type))
        result.docType = 'task';
    if (result.category) {
        const records = [...(taxonomy?.groups || []), ...(taxonomy?.categories || [])];
        const matches = records.filter((record) =>
            result.categoryId
                ? record.id === result.categoryId
                : record.key === result.category || record.legacyKeys?.includes(result.category)
        );
        if (matches.length === 1) {
            result.category = matches[0].key;
            result.categoryId = matches[0].id;
            result.categoryIdentityVersion = 1;
        } else {
            warnings.push(
                `The saved category “${result.category}” is unavailable. This restores without a category.`
            );
            result.category = null;
            result.categoryId = null;
            result.categoryIdentityVersion = null;
        }
    }
    if (result.docType === 'task') {
        result.editing = false;
        result.confirmingDelete = false;
        result.status = result.status || 'incomplete';
        if (result.type === 'unscheduled') {
            result.priority = result.priority || 'medium';
            result.estDuration = result.estDuration ?? 0;
        }
    }
    return { document: applyWriterContract(result), warnings };
}

function validateRestore(document, previous) {
    try {
        runCloudantContractValidator(document, previous);
    } catch {
        throw new Error(
            'This record needs correction to match this room’s safety rules. Check its category and record fields before restoring.'
        );
    }
    if (document._deleted) return;
    if (document.docType === 'task') {
        if (
            typeof document.description !== 'string' ||
            !document.description.trim() ||
            !['scheduled', 'unscheduled'].includes(document.type)
        )
            throw new Error('Add a task description and a valid task type before restoring.');
        if (!['incomplete', 'completed'].includes(document.status))
            throw new Error('Choose a valid task status before restoring.');
        if (
            document.type === 'unscheduled' &&
            (!['high', 'medium', 'low'].includes(document.priority) ||
                !Number.isFinite(document.estDuration) ||
                document.estDuration < 0)
        )
            throw new Error(
                'Choose High, Medium or Low priority and a nonnegative estimated duration before restoring.'
            );
        if (
            document.type === 'scheduled' &&
            (!Number.isFinite(document.duration) ||
                document.duration < 0 ||
                !Number.isFinite(Date.parse(document.startDateTime)) ||
                !Number.isFinite(Date.parse(document.endDateTime)) ||
                Date.parse(document.endDateTime) < Date.parse(document.startDateTime))
        ) {
            throw new Error('Check the saved task’s start, end and duration before restoring.');
        }
    }
    if (
        document.docType === 'activity' &&
        (!Number.isFinite(Date.parse(document.startDateTime)) ||
            !Number.isFinite(Date.parse(document.endDateTime)) ||
            Date.parse(document.endDateTime) < Date.parse(document.startDateTime))
    ) {
        throw new Error('Check the saved activity’s start and end before restoring.');
    }
}

/** Preserve originals, stage a checked cloud replica, and journal explicit recovery decisions. */
export function createGuidedRecovery({
    source,
    remote,
    archive,
    logicalName,
    makeDatabase,
    routeStorage = localStorage,
    digest,
    assertCurrent = () => {},
    onActivate = () => {},
    assertWritable = () => {},
    afterWrite = () => {},
    newId = () => `recovery-${generateSecureUuid()}`
}) {
    const verificationOptions = digest ? { digest } : {};
    async function load(id) {
        const saved = await archive.get(id);
        if (saved.logicalName !== logicalName)
            throw new Error('This recovery copy belongs to another room.');
        await verifyLocalRecoveryBundle(saved.bundle, verificationOptions);
        for (const supplement of saved.supplements || []) {
            await verifyLocalRecoveryBundle(supplement, verificationOptions);
        }
        return saved;
    }
    async function preserve(audit) {
        assertCurrent();
        const bundle = await buildLocalRecoveryBundle(source, audit, verificationOptions);
        const id = newId();
        await archive.put({ _id: id, logicalName, bundle, decisions: {}, phase: 'saved' });
        const saved = await load(id);
        assertCurrent();
        return saved;
    }
    async function rebuild(id) {
        const saved = await load(id);
        assertCurrent();
        if (saved.bundle.manifest.localDatabaseName !== source.name)
            throw new Error(
                'This recovery copy belongs to an earlier local copy. Start a new repair to preserve your current changes.'
            );
        if (!remote) throw new Error('Connect to the cloud before rebuilding this room.');
        if (
            canonicalJson((await source.info()).update_seq) !==
            canonicalJson(saved.bundle.manifest.localUpdateSequence)
        ) {
            throw new Error(
                'Local changes arrived after the recovery copy was saved. Save a new copy before rebuilding.'
            );
        }
        const contract = await inspectRemoteDocumentContract(remote);
        if (!contract.compatible)
            throw new Error(
                'Cloud safety checks did not pass. Your original local copy is unchanged.'
            );
        const databaseName = `${logicalName}-repaired-${id}`;
        const staged = makeDatabase(databaseName);
        try {
            const result = await staged.replicate.from(remote, { ...SYNC_REPLICATION_OPTIONS });
            if (result?.ok !== true || result?.errors?.length || result?.status !== 'complete')
                throw new Error('The cloud copy could not be downloaded completely.');
            const after = await inspectRemoteDocumentContract(remote);
            if (!after.compatible || after.contractRevision !== contract.contractRevision)
                throw new Error('Cloud safety settings changed. Please try rebuilding again.');
            const leaves = await enumerateCurrentLocalLeaves(staged);
            if (leaves.leaves.some((leaf) => !validateLocalDocumentContract(leaf.document).ok)) {
                throw new Error(
                    'The cloud copy contains records this app cannot safely use. Update Fortudo or fix the cloud setup.'
                );
            }
            const audit = await auditLocalDivergence(staged, remote);
            if (audit.state !== 'compatible' || audit.eligible.length)
                throw new Error('The rebuilt copy could not be verified against the cloud.');
            if (
                canonicalJson((await source.info()).update_seq) !==
                canonicalJson(saved.bundle.manifest.localUpdateSequence)
            ) {
                throw new Error(
                    'Local data changed while rebuilding. Save a new recovery copy and try again.'
                );
            }
            assertCurrent();
            await archive.put({ ...(await load(id)), phase: 'review', databaseName });
            // No source database is deleted. A failed pointer write also leaves the staged copy intact.
            const route = JSON.stringify({ databaseName, archiveId: id });
            assertCurrent();
            routeStorage.setItem(recoveryRouteKey(logicalName), route);
            if (routeStorage.getItem(recoveryRouteKey(logicalName)) !== route)
                throw new Error(
                    'The new local copy could not be selected safely. Reload to check its status.'
                );
            onActivate();
        } finally {
            await staged.close();
        }
    }
    async function review(id, database) {
        let saved = await load(id);
        if (saved.phase === 'review') {
            // A write already in flight in an older tab may finish after replica selection.
            // The original stays intact; capture and verify any additional leaves as well.
            const original = makeDatabase(saved.bundle.manifest.localDatabaseName);
            try {
                const previous = saved.supplements?.at(-1) || saved.bundle;
                if (
                    canonicalJson((await original.info()).update_seq) !==
                    canonicalJson(previous.manifest.localUpdateSequence)
                ) {
                    const audit = remote ? await auditLocalDivergence(original, remote) : null;
                    const supplement = await buildLocalRecoveryBundle(
                        original,
                        audit,
                        verificationOptions
                    );
                    await archive.put({
                        ...saved,
                        supplements: [...(saved.supplements || []), supplement]
                    });
                    saved = await load(id);
                }
            } finally {
                await original.close();
            }
        }
        const taxonomy = await currentDocument(database, 'config-categories');
        const entries = [];
        const seen = new Set();
        for (const bundle of [saved.bundle, ...(saved.supplements || [])]) {
            for (let index = 0; index < bundle.documents.length; index += 1) {
                const local = bundle.documents[index];
                const leaf = bundle.manifest.leaves[index];
                const key = `${leaf.id}@${leaf.revision}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (
                    local._id.startsWith('_') ||
                    leaf.classification === 'remote-present' ||
                    saved.decisions[key]
                )
                    continue;
                const current = await currentDocument(database, local._id);
                const proposed = propose(local, taxonomy);
                const comparable = (document) => {
                    const value = content(document);
                    if (value) {
                        delete value.editing;
                        delete value.confirmingDelete;
                    }
                    return canonicalJson(value);
                };
                if (
                    (!current && local._deleted) ||
                    comparable(proposed.document) === comparable(current)
                )
                    continue;
                entries.push({
                    key,
                    id: local._id,
                    local,
                    current,
                    expectedRevision: current?._rev || null,
                    proposed: proposed.document,
                    warnings: proposed.warnings
                });
            }
        }
        return entries;
    }
    async function decide(id, entry, decision) {
        const saved = await load(id);
        if (
            ![saved.bundle, ...(saved.supplements || [])].some((bundle) =>
                bundle.manifest.leaves.some((leaf) => `${leaf.id}@${leaf.revision}` === entry.key)
            )
        )
            throw new Error('The saved change was not found.');
        await archive.put({ ...saved, decisions: { ...saved.decisions, [entry.key]: decision } });
    }
    async function restore(id, entry, database, edited) {
        assertCurrent();
        assertWritable();
        const saved = await load(id);
        if (saved.decisions[entry.key]) return;
        if (
            ![saved.bundle, ...(saved.supplements || [])].some((bundle) =>
                bundle.manifest.leaves.some(
                    (leaf) => `${leaf.id}@${leaf.revision}` === entry.key && leaf.id === entry.id
                )
            )
        )
            throw new Error('The saved change was not found.');
        const current = await currentDocument(database, entry.id);
        if ((current?._rev || null) !== entry.expectedRevision)
            throw new Error(
                'The current record changed. Close and reopen the review before restoring.'
            );
        if (edited?._id !== entry.id) throw new Error('Keep the saved record’s ID when restoring.');
        const document = applyWriterContract(content(edited));
        if (current) document._rev = current._rev;
        validateRestore(document, current);
        if (!document._deleted && document.categoryId) {
            const taxonomy = await currentDocument(database, 'config-categories');
            if (
                ![...(taxonomy?.groups || []), ...(taxonomy?.categories || [])].some(
                    (row) => row.id === document.categoryId && row.key === document.category
                )
            ) {
                throw new Error(
                    'Choose a current category or clear its category fields before restoring.'
                );
            }
        }
        assertCurrent();
        assertWritable();
        const result = await database.put(document);
        assertCurrent();
        await afterWrite(document._id, result.rev);
        await decide(id, entry, 'restored');
    }
    async function reconsider(id) {
        const saved = await load(id);
        await archive.put({
            ...saved,
            decisions: Object.fromEntries(
                Object.entries(saved.decisions).filter(([, decision]) => decision !== 'kept')
            )
        });
    }
    return {
        preserve,
        load,
        rebuild,
        review,
        restore,
        reconsider,
        keep: (id, entry) => decide(id, entry, 'kept')
    };
}

import {
    DOCUMENT_CONTRACT_CHECKSUM,
    DOCUMENT_CONTRACT_DESIGN_ID,
    DOCUMENT_CONTRACT_VERSION,
    getDocumentContractValidatorSource,
    validateLocalDocumentContract
} from './document-contract.js';

export const COMPATIBILITY_RELEASE_ALLOWS_MISSING_VALIDATOR = true;

function isNotFound(error) {
    return error?.status === 404 || error?.name === 'not_found';
}

function sameOpaqueSequence(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
}

function publicLeaf(leaf, extra = {}) {
    return {
        id: leaf.id,
        revision: leaf.revision,
        deleted: Boolean(leaf.document?._deleted),
        ...extra
    };
}

/**
 * Inspect only contract metadata. No remote document content is returned or logged.
 */
export async function inspectRemoteDocumentContract(remoteDb) {
    let info;
    try {
        info = await remoteDb.info();
    } catch (error) {
        if (isNotFound(error)) {
            return { state: 'unprovisioned', compatible: false, contractRevision: null };
        }
        return { state: 'offline', compatible: false, contractRevision: null };
    }

    if (info?.partitioned === true || info?.props?.partitioned === true) {
        return { state: 'validator-mismatch', compatible: false, contractRevision: null };
    }

    let design;
    try {
        design = await remoteDb.get(DOCUMENT_CONTRACT_DESIGN_ID);
    } catch (error) {
        if (isNotFound(error)) {
            return {
                state: 'missing-validator',
                compatible: COMPATIBILITY_RELEASE_ALLOWS_MISSING_VALIDATOR,
                contractRevision: null
            };
        }
        return { state: 'offline', compatible: false, contractRevision: null };
    }

    const metadata = design?.fortudoDocumentContract;
    if (Number.isInteger(metadata?.version) && metadata.version > DOCUMENT_CONTRACT_VERSION) {
        return {
            state: 'update-required',
            compatible: false,
            contractRevision: design._rev || null
        };
    }
    if (
        metadata?.version !== DOCUMENT_CONTRACT_VERSION ||
        metadata?.checksum !== DOCUMENT_CONTRACT_CHECKSUM ||
        design.validate_doc_update !== getDocumentContractValidatorSource()
    ) {
        return {
            state: 'validator-mismatch',
            compatible: false,
            contractRevision: design._rev || null
        };
    }
    return {
        state: 'compatible',
        compatible: true,
        contractRevision: design._rev || null
    };
}

/**
 * Capture every current local leaf body, including deleted and conflicting leaves.
 */
export async function enumerateCurrentLocalLeaves(localDb) {
    const changes = await localDb.changes({ since: 0, style: 'all_docs' });
    if (
        !Array.isArray(changes?.results) ||
        !Object.prototype.hasOwnProperty.call(changes, 'last_seq')
    ) {
        throw new Error('invalid-changes-enumeration');
    }

    const leaves = [];
    const designLeaves = [];
    const seen = new Set();
    for (const change of changes.results) {
        if (!change || typeof change.id !== 'string' || !Array.isArray(change.changes)) {
            throw new Error('invalid-changes-enumeration');
        }
        if (change.id.startsWith('_local/')) {
            continue;
        }
        if (change.changes.length === 0) {
            throw new Error('invalid-changes-enumeration');
        }
        for (const item of change.changes) {
            const revision = item?.rev;
            const identity = `${change.id}@${revision}`;
            if (typeof revision !== 'string' || seen.has(identity)) {
                if (seen.has(identity)) continue;
                throw new Error('invalid-changes-enumeration');
            }
            seen.add(identity);
            let document;
            try {
                document = await localDb.get(change.id, {
                    rev: revision,
                    revs: true,
                    attachments: true,
                    binary: false
                });
            } catch (error) {
                throw new Error('leaf-body-unreadable');
            }
            if (!document || document._id !== change.id || document._rev !== revision) {
                throw new Error('leaf-body-inconsistent');
            }
            const leaf = { id: change.id, revision, document };
            if (change.id.startsWith('_design/')) {
                designLeaves.push(leaf);
            } else {
                leaves.push(leaf);
            }
        }
    }
    const byIdentity = (first, second) =>
        first.id.localeCompare(second.id) || first.revision.localeCompare(second.revision);
    leaves.sort(byIdentity);
    designLeaves.sort(byIdentity);
    return { leaves, designLeaves, lastSequence: changes.last_seq };
}

async function revsDiffInBatches(remoteDb, leaves, batchSize) {
    const missing = new Set();
    for (let index = 0; index < leaves.length; index += batchSize) {
        const batch = leaves.slice(index, index + batchSize);
        const request = {};
        for (const leaf of batch) {
            if (!request[leaf.id]) request[leaf.id] = [];
            request[leaf.id].push(leaf.revision);
        }
        const response = await remoteDb.revsDiff(request);
        if (!response || typeof response !== 'object' || Array.isArray(response)) {
            throw new Error('invalid-revs-diff');
        }
        for (const [id, detail] of Object.entries(response)) {
            if (!Array.isArray(detail?.missing)) {
                throw new Error('invalid-revs-diff');
            }
            for (const revision of detail.missing) {
                missing.add(`${id}@${revision}`);
            }
        }
    }
    return missing;
}

export async function findRemoteMissingLeaves(remoteDb, leaves, { batchSize = 100 } = {}) {
    const missing = await revsDiffInBatches(remoteDb, leaves, batchSize);
    return leaves.filter((leaf) => missing.has(`${leaf.id}@${leaf.revision}`));
}

function emptyAudit(state, designLeaves = []) {
    return {
        state,
        remotePresent: [],
        eligible: [],
        recoveryRequired: [],
        designLeaves: designLeaves.map((leaf) => publicLeaf(leaf))
    };
}

/**
 * Compare a stable local leaf snapshot to exact remote revisions before any push.
 */
export async function auditLocalDivergence(
    localDb,
    remoteDb,
    { maxRetries = 3, batchSize = 100, rejectedLeaves = new Set() } = {}
) {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        let start;
        let enumeration;
        try {
            start = (await localDb.info()).update_seq;
            enumeration = await enumerateCurrentLocalLeaves(localDb);
        } catch (error) {
            return { ...emptyAudit('audit-error'), code: error.message || 'local-audit-failed' };
        }

        let missing;
        try {
            missing = await revsDiffInBatches(remoteDb, enumeration.leaves, batchSize);
        } catch (error) {
            return emptyAudit('offline', enumeration.designLeaves);
        }

        let finish;
        try {
            finish = (await localDb.info()).update_seq;
        } catch (error) {
            return { ...emptyAudit('audit-error'), code: 'local-info-unreadable' };
        }
        if (!sameOpaqueSequence(start, finish)) {
            continue;
        }
        if (!sameOpaqueSequence(start, enumeration.lastSequence)) {
            continue;
        }

        const result = emptyAudit('compatible', enumeration.designLeaves);
        for (const leaf of enumeration.leaves) {
            const identity = `${leaf.id}@${leaf.revision}`;
            if (!missing.has(identity)) {
                result.remotePresent.push(publicLeaf(leaf));
                continue;
            }
            if (rejectedLeaves.has(identity)) {
                result.recoveryRequired.push(publicLeaf(leaf, { code: 'remote-denied' }));
                continue;
            }
            const structural = validateLocalDocumentContract(leaf.document);
            if (structural.ok) {
                result.eligible.push(publicLeaf(leaf));
            } else {
                result.recoveryRequired.push(publicLeaf(leaf, { code: structural.code }));
            }
        }
        if (result.recoveryRequired.length > 0) {
            result.state = 'recovery-required';
        }
        result.updateSequence = finish;
        return result;
    }

    return { ...emptyAudit('audit-error'), code: 'local-state-unstable' };
}

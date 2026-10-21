import { enumerateCurrentLocalLeaves } from './sync-contract.js';

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .filter((key) => value[key] !== undefined)
                .map((key) => [key, canonicalize(value[key])])
        );
    }
    return value;
}

export function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}

async function sha256(value) {
    if (!globalThis.crypto?.subtle) {
        throw new Error('Secure recovery hashing is unavailable.');
    }
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
        ''
    );
}

function auditClassifications(audit) {
    const classifications = new Map();
    for (const leaf of audit?.remotePresent || []) {
        classifications.set(`${leaf.id}@${leaf.revision}`, 'remote-present');
    }
    for (const leaf of audit?.eligible || []) {
        classifications.set(`${leaf.id}@${leaf.revision}`, 'remote-missing-eligible');
    }
    for (const leaf of audit?.recoveryRequired || []) {
        classifications.set(`${leaf.id}@${leaf.revision}`, 'remote-missing-rejected');
    }
    for (const leaf of audit?.designLeaves || []) {
        classifications.set(`${leaf.id}@${leaf.revision}`, 'contract-exempt');
    }
    return classifications;
}

/**
 * Build a self-contained sensitive export. Callers must never log or upload the result.
 */
export async function buildLocalRecoveryBundle(
    database,
    audit,
    { digest = sha256, now = () => new Date().toISOString(), maxRetries = 3 } = {}
) {
    let info;
    let enumeration;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        const before = await database.info();
        const candidate = await enumerateCurrentLocalLeaves(database);
        const after = await database.info();
        if (
            canonicalJson(before.update_seq) === canonicalJson(candidate.lastSequence) &&
            canonicalJson(before.update_seq) === canonicalJson(after.update_seq)
        ) {
            info = after;
            enumeration = candidate;
            break;
        }
    }
    if (!info || !enumeration) {
        throw new Error('Local data changed during recovery export. Please try again.');
    }
    const allLeaves = [...enumeration.leaves, ...enumeration.designLeaves].sort(
        (first, second) =>
            first.id.localeCompare(second.id) || first.revision.localeCompare(second.revision)
    );
    const classifications = auditClassifications(audit);
    const manifestLeaves = [];
    const documents = [];
    for (const leaf of allLeaves) {
        const body = JSON.parse(JSON.stringify(leaf.document));
        documents.push(body);
        manifestLeaves.push({
            id: leaf.id,
            revision: leaf.revision,
            deleted: Boolean(body._deleted),
            classification:
                classifications.get(`${leaf.id}@${leaf.revision}`) || 'remote-status-unknown',
            bodyChecksum: await digest(canonicalJson(body))
        });
    }

    const manifest = {
        format: 'fortudo-local-recovery-v1',
        createdAt: now(),
        localDatabaseName: info.db_name,
        localUpdateSequence: info.update_seq,
        leafCount: manifestLeaves.length,
        leaves: manifestLeaves
    };
    return {
        format: 'fortudo-local-recovery-v1',
        manifest,
        manifestChecksum: await digest(canonicalJson(manifest)),
        documents
    };
}

/** Verify a saved copy after reading it back from independent durable storage. */
export async function verifyLocalRecoveryBundle(bundle, { digest = sha256 } = {}) {
    const invalid = () =>
        new Error('The recovery copy could not be verified. Keep the original local data.');
    if (
        bundle?.format !== 'fortudo-local-recovery-v1' ||
        bundle.manifest?.format !== bundle.format ||
        !Array.isArray(bundle.documents) ||
        !Array.isArray(bundle.manifest.leaves) ||
        bundle.manifest.leafCount !== bundle.documents.length ||
        bundle.documents.length !== bundle.manifest.leaves.length ||
        (await digest(canonicalJson(bundle.manifest))) !== bundle.manifestChecksum
    )
        throw invalid();
    const identities = new Set();
    for (let index = 0; index < bundle.documents.length; index += 1) {
        const body = bundle.documents[index];
        const leaf = bundle.manifest.leaves[index];
        const identity = `${leaf.id}@${leaf.revision}`;
        if (
            !body ||
            body._id !== leaf.id ||
            body._rev !== leaf.revision ||
            Boolean(body._deleted) !== leaf.deleted ||
            identities.has(identity) ||
            (await digest(canonicalJson(body))) !== leaf.bodyChecksum
        )
            throw invalid();
        identities.add(identity);
    }
    return true;
}

export function downloadLocalRecoveryBundle(bundle) {
    const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], {
        type: 'application/json'
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `fortudo-local-recovery-v1-${Date.now()}.json`;
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
}

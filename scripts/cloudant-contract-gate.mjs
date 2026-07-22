/**
 * Destructive only to two exact, randomly named disposable preview databases.
 * Runs the document-contract conformance gate through PouchDB 9 and prints
 * aggregate results only. Credentials, URLs, rejection objects, and bodies are
 * never logged.
 */

import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import PouchDB from 'pouchdb';
import memoryAdapter from 'pouchdb-adapter-memory';

PouchDB.plugin(memoryAdapter);

const DESIGN_ID = '_design/fortudo-document-contract';
const PREFIX = 'fortudo-preview-contract-gate-';
const credentialUrl = process.env.FORTUDO_CLOUDANT_URL;

class GateAssertionError extends Error {}

function assert(condition, message) {
    if (!condition) throw new GateAssertionError(message);
}

async function runSanitizedPhase(name, operation) {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof GateAssertionError) throw error;
        const rejectionCode = [error?.reason, error?.message].find(
            (value) => typeof value === 'string' && /^FDC_[A-Z_]+$/.test(value)
        );
        const safeStatus = Number.isInteger(error?.status) ? `HTTP ${error.status}` : null;
        const safeNames = [error?.name, error?.error].filter(
            (value) => typeof value === 'string' && /^[a-z_]{1,40}$/.test(value)
        );
        const compilerDetail = safeNames.includes('compilation_error')
            ? String(error?.reason || '')
                  .replace(/https?:\/\/\S+/g, '<url>')
                  .replace(/[^\x20-\x7e]/g, ' ')
                  .slice(0, 240)
            : '';
        const safeFailure =
            rejectionCode || [safeStatus, ...new Set(safeNames)].filter(Boolean).join(' ');
        const suffix = safeFailure ? ` with ${safeFailure}` : ' unexpectedly';
        const detail = compilerDetail ? `: ${compilerDetail}` : '';
        throw new GateAssertionError(`${name} failed${suffix}${detail}`);
    }
}

async function remoteOperation(operation) {
    const retryDelays = [500, 1000, 2000, 4000, 8000];
    for (let attempt = 0; ; attempt += 1) {
        try {
            const result = await operation();
            await new Promise((resolve) => setTimeout(resolve, 150));
            return result;
        } catch (error) {
            const rateLimited = error?.status === 429 || error?.name === 'too_many_requests';
            if (!rateLimited || attempt >= retryDelays.length) throw error;
            await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
        }
    }
}

function contracted(document) {
    const result = { ...document };
    if (result._deleted) {
        result.writerContract = { version: 1 };
        return result;
    }
    result.category ??= null;
    result.categoryId ??= null;
    result.categoryIdentityVersion ??= null;
    result.writerContract = {
        version: 1,
        categoryReference:
            result.category === null &&
            result.categoryId === null &&
            result.categoryIdentityVersion === null
                ? null
                : {
                      key: result.category,
                      id: result.categoryId,
                      identityVersion: result.categoryIdentityVersion
                  }
    };
    return result;
}

async function designDocument() {
    const moduleUrl = new URL('../public/js/document-contract.js', import.meta.url);
    const source = (await readFile(moduleUrl, 'utf8')).replace(/\r\n/g, '\n');
    const start = source.indexOf('function cloudantValidateDocUpdate');
    const marker = '\n}\n\n/**\n * Add persistence metadata';
    const end = source.indexOf(marker, start) + 2;
    assert(start >= 0 && end > start, 'contract source boundary is invalid');
    const validator = source
        .slice(start, end)
        .replace(/^function cloudantValidateDocUpdate/, 'function');
    const checksum = createHash('sha256').update(validator).digest('hex');
    const declared = source.match(/DOCUMENT_CONTRACT_CHECKSUM\s*=\s*\n?\s*'([a-f0-9]{64})'/)?.[1];
    assert(checksum === declared, 'contract checksum does not match source');
    return {
        _id: DESIGN_ID,
        language: 'javascript',
        fortudoDocumentContract: { version: 1, checksum },
        validate_doc_update: validator
    };
}

async function goldenCorpus() {
    const corpusUrl = new URL('../contracts/document-contract-golden.json', import.meta.url);
    const corpus = JSON.parse(await readFile(corpusUrl, 'utf8'));
    assert(corpus.formatVersion === 1 && Array.isArray(corpus.cases), 'golden corpus is invalid');
    return corpus;
}

function databaseUrl(root, name) {
    const base = new URL(root);
    base.pathname = `${base.pathname.replace(/\/?$/, '/')}${encodeURIComponent(name)}`;
    return base.href;
}

async function listDisposableGateDatabases() {
    const inventoryUrl = new URL(credentialUrl);
    const authorization = Buffer.from(
        `${decodeURIComponent(inventoryUrl.username)}:${decodeURIComponent(inventoryUrl.password)}`
    ).toString('base64');
    inventoryUrl.username = '';
    inventoryUrl.password = '';
    inventoryUrl.pathname = `${inventoryUrl.pathname.replace(/\/?$/, '/')}_all_dbs`;
    const response = await fetch(inventoryUrl, {
        headers: { Authorization: `Basic ${authorization}` }
    });
    assert(response.ok, 'disposable preview inventory failed');
    const databases = await response.json();
    assert(Array.isArray(databases), 'disposable preview inventory was invalid');
    return databases.filter((name) => typeof name === 'string' && name.startsWith(PREFIX)).sort();
}

function disposableInventorySummary(databases) {
    return {
        count: databases.length,
        identitySetChecksum: createHash('sha256').update(databases.join('\n')).digest('hex')
    };
}

async function cleanupDisposableGateDatabases() {
    const databases = await listDisposableGateDatabases();
    for (const name of databases) {
        const database = new PouchDB(databaseUrl(credentialUrl, name), { skip_setup: true });
        await runSanitizedPhase('orphan cleanup', () => destroyExactWithBackoff(database, name));
    }
    const remaining = await listDisposableGateDatabases();
    assert(remaining.length === 0, 'disposable preview cleanup verification failed');
    console.log(
        JSON.stringify({
            mode: 'disposable-preview-cleanup',
            ...disposableInventorySummary(databases)
        })
    );
}

function rejectionCode(result) {
    return result?.reason || result?.message || null;
}

async function expectDenied(operation, code) {
    try {
        const result = await remoteOperation(operation);
        if (Array.isArray(result)) {
            const failure = result.find((row) => row.error);
            assert(failure && rejectionCode(failure) === code, `expected ${code}`);
            return;
        }
    } catch (error) {
        assert(rejectionCode(error) === code, `expected ${code}`);
        return;
    }
    throw new GateAssertionError(`expected ${code}`);
}

async function runGoldenCorpusGate(database, corpus, counts) {
    for (const [index, testCase] of corpus.cases.entries()) {
        const document = structuredClone(testCase.document);
        document._id = `golden-${index}-${document._id}`;
        if (document._deleted) {
            const seed = await remoteOperation(() =>
                database.put(contracted({ _id: document._id, docType: 'task', goldenSeed: true }))
            );
            document._rev = seed.rev;
        }
        if (testCase.expected === 'allow') {
            const result = await runSanitizedPhase(`golden case ${index}`, () =>
                remoteOperation(() => database.put(document))
            );
            assert(result.ok, 'golden corpus allow case was rejected');
            counts.allowed += 1;
        } else {
            await expectDenied(() => database.put(document), testCase.expected);
            counts.denied += 1;
        }
        counts.goldenCases += 1;
    }
}

async function runPrimaryGate(database, counts) {
    let current = await remoteOperation(() =>
        database.put(contracted({ _id: 'task-current', docType: 'task' }))
    );
    current = await remoteOperation(() =>
        database.put(
            contracted({ _id: 'task-current', _rev: current.rev, docType: 'task', note: 'updated' })
        )
    );
    await remoteOperation(() =>
        database.put(contracted({ _id: 'task-current', _rev: current.rev, _deleted: true }))
    );
    counts.allowed += 3;

    await expectDenied(
        () => database.put({ _id: 'task-legacy', docType: 'task' }),
        'FDC_CONTRACT_VERSION'
    );
    const staleCategory = contracted({
        _id: 'task-stale-category',
        docType: 'task',
        category: 'work/meetings',
        categoryId: '9c52c0e9-c389-54e1-927f-52c16b13de99',
        categoryIdentityVersion: 1
    });
    staleCategory.category = 'work/comms';
    await expectDenied(() => database.put(staleCategory), 'FDC_CATEGORY_REFERENCE');
    const deleteTarget = await remoteOperation(() =>
        database.put(contracted({ _id: 'task-bare-delete', docType: 'task' }))
    );
    await expectDenied(
        () =>
            database.put({
                _id: 'task-bare-delete',
                _rev: deleteTarget.rev,
                _deleted: true
            }),
        'FDC_TOMBSTONE_CONTRACT'
    );
    const taxonomy = contracted({
        _id: 'config-categories',
        docType: 'config',
        schemaVersion: '3.5',
        identityVersion: 1,
        groups: [
            {
                id: '3930ae01-aef6-5c5f-8db3-d91be139ea84',
                key: 'work',
                legacyKeys: ['work'],
                label: 'Work',
                colorFamily: 'blue',
                color: '#0ea5e9',
                status: 'active',
                archivedAt: null
            }
        ],
        categories: [
            {
                id: '9c52c0e9-c389-54e1-927f-52c16b13de99',
                key: 'work/meetings',
                legacyKeys: ['work/meetings'],
                label: 'Comms',
                groupKey: 'work',
                groupId: '3930ae01-aef6-5c5f-8db3-d91be139ea84',
                color: '#38bdf8',
                isLinkedToGroupFamily: true,
                status: 'active',
                archivedAt: null
            }
        ]
    });
    const taxonomyResult = await remoteOperation(() => database.put(taxonomy));
    const lossyTaxonomy = contracted({
        _id: taxonomy._id,
        _rev: taxonomyResult.rev,
        docType: 'config',
        schemaVersion: '3.5',
        groups: [{ key: 'work', label: 'Work' }],
        categories: [{ key: 'work/meetings', groupKey: 'work', label: 'Comms' }]
    });
    await expectDenied(() => database.put(lossyTaxonomy), 'FDC_TAXONOMY_SCHEMA');
    counts.allowed += 1;
    counts.denied += 4;

    const mixed = await remoteOperation(() =>
        database.bulkDocs([
            contracted({ _id: 'task-mixed-valid', docType: 'task' }),
            { _id: 'task-mixed-invalid', docType: 'task' }
        ])
    );
    assert(mixed.filter((row) => row.ok).length === 1, 'mixed batch valid sibling did not commit');
    assert(
        mixed.filter((row) => row.error).length === 1 &&
            rejectionCode(mixed.find((row) => row.error)) === 'FDC_CONTRACT_VERSION',
        'mixed batch rejection code was not preserved'
    );
    counts.allowed += 1;
    counts.denied += 1;
    counts.mixedBatches += 1;
}

async function runCheckpointAndQuarantineGate(database, design, counts) {
    const base = {
        _id: 'task-offline-branch',
        _rev: '1-11111111111111111111111111111111',
        docType: 'task',
        note: 'base'
    };
    const validBase = {
        _id: 'task-valid-conflict',
        _rev: '1-22222222222222222222222222222222',
        docType: 'task',
        note: 'base'
    };
    await runSanitizedPhase('quarantine legacy seed', () =>
        remoteOperation(() => database.bulkDocs([base, validBase], { new_edits: false }))
    );

    const local = new PouchDB(`contract-gate-local-${randomBytes(8).toString('hex')}`, {
        adapter: 'memory'
    });
    try {
        await local.bulkDocs([base, validBase], { new_edits: false });
        await runSanitizedPhase('quarantine validator installation', () =>
            remoteOperation(() => database.put(design))
        );
        const remoteBase = await runSanitizedPhase('quarantine legacy base read', () =>
            remoteOperation(() => database.get(base._id))
        );
        await runSanitizedPhase('quarantine migrated successor', () =>
            remoteOperation(() =>
                database.put(
                    contracted({
                        ...remoteBase,
                        docType: 'task',
                        category: null,
                        categoryId: null,
                        categoryIdentityVersion: null,
                        note: 'migrated winner'
                    })
                )
            )
        );
        const localBase = await local.get(base._id);
        const offlineResult = await local.put({ ...localBase, note: 'offline legacy edit' });
        const remoteValidBase = await runSanitizedPhase('quarantine valid base read', () =>
            remoteOperation(() => database.get(validBase._id))
        );
        await runSanitizedPhase('quarantine valid remote successor', () =>
            remoteOperation(() =>
                database.put(contracted({ ...remoteValidBase, note: 'remote current edit' }))
            )
        );
        const localValidBase = await local.get(validBase._id);
        const validConflict = await local.put(
            contracted({ ...localValidBase, note: 'offline current edit' })
        );

        const push = await local.replicate.to(database);
        assert(push.doc_write_failures > 0, 'legacy branch was not denied');
        const validDifference = await remoteOperation(() =>
            database.revsDiff({ [validBase._id]: [validConflict.rev] })
        );
        assert(!validDifference[validBase._id], 'valid successor conflict was not replicated');
        await local.replicate.from(database);
        const difference = await remoteOperation(() =>
            database.revsDiff({ [base._id]: [offlineResult.rev] })
        );
        const stranded = difference[base._id]?.missing?.includes(offlineResult.rev);
        const strandedBody = await local.get(base._id, { rev: offlineResult.rev });
        assert(stranded && !strandedBody.writerContract, 'stranded denied leaf was not detectable');
        counts.denied += 1;
        counts.allowed += 1;
        counts.strandedLeavesDetected += 1;
        counts.validatorLastReconstructions += 1;
    } finally {
        await local.destroy();
    }
}

async function destroyExact(database, expectedName) {
    assert(expectedName.startsWith(PREFIX), 'cleanup target prefix is invalid');
    const info = await database.info();
    assert(info.db_name === expectedName, 'cleanup target identity changed');
    await database.destroy();
}

async function destroyExactWithBackoff(database, expectedName) {
    const retryDelays = [500, 1000, 2000, 4000, 8000];
    for (let attempt = 0; ; attempt += 1) {
        try {
            await destroyExact(database, expectedName);
            return;
        } catch (error) {
            const rateLimited = error?.status === 429 || error?.name === 'too_many_requests';
            if (!rateLimited || attempt >= retryDelays.length) throw error;
            await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
        }
    }
}

async function main() {
    assert(
        typeof credentialUrl === 'string' && credentialUrl.startsWith('https://'),
        'credential URL missing'
    );
    if (process.argv.includes('--audit-orphans')) {
        const databases = await listDisposableGateDatabases();
        console.log(
            JSON.stringify({
                mode: 'disposable-preview-audit',
                ...disposableInventorySummary(databases)
            })
        );
        return;
    }
    if (process.argv.includes('--cleanup-orphans')) {
        await cleanupDisposableGateDatabases();
        return;
    }
    const existingGateDatabases = await listDisposableGateDatabases();
    assert(
        existingGateDatabases.length === 0,
        'existing disposable preview databases require cleanup'
    );
    const nonce = randomBytes(12).toString('hex');
    const primaryName = `${PREFIX}${nonce}-primary`;
    const quarantineName = `${PREFIX}${nonce}-quarantine`;
    const primary = new PouchDB(databaseUrl(credentialUrl, primaryName));
    const quarantine = new PouchDB(databaseUrl(credentialUrl, quarantineName));
    const counts = {
        allowed: 0,
        denied: 0,
        goldenCases: 0,
        mixedBatches: 0,
        strandedLeavesDetected: 0,
        validatorLastReconstructions: 0,
        disposableDatabases: 2
    };
    const design = await designDocument();
    const corpus = await goldenCorpus();
    let primaryCreated = false;
    let quarantineCreated = false;
    try {
        await runSanitizedPhase('primary database setup', () =>
            remoteOperation(() => primary.info())
        );
        primaryCreated = true;
        await runSanitizedPhase('quarantine database setup', () =>
            remoteOperation(() => quarantine.info())
        );
        quarantineCreated = true;
        await runSanitizedPhase('primary validator installation', () =>
            remoteOperation(() => primary.put(design))
        );
        await runSanitizedPhase('golden corpus', () =>
            runGoldenCorpusGate(primary, corpus, counts)
        );
        await runSanitizedPhase('primary contract behavior', () => runPrimaryGate(primary, counts));
        await runSanitizedPhase('checkpoint and quarantine behavior', () =>
            runCheckpointAndQuarantineGate(quarantine, design, counts)
        );
        console.log(
            JSON.stringify(
                {
                    mode: 'real-cloudant-document-contract-gate',
                    counts,
                    validatorChecksum: design.fortudoDocumentContract.checksum
                },
                null,
                2
            )
        );
    } finally {
        const cleanupFailures = [];
        if (primaryCreated) {
            try {
                const cleanupDatabase = new PouchDB(databaseUrl(credentialUrl, primaryName), {
                    skip_setup: true
                });
                await runSanitizedPhase('primary cleanup', () =>
                    destroyExactWithBackoff(cleanupDatabase, primaryName)
                );
            } catch (error) {
                cleanupFailures.push(error.message);
            }
        }
        if (quarantineCreated) {
            try {
                const cleanupDatabase = new PouchDB(databaseUrl(credentialUrl, quarantineName), {
                    skip_setup: true
                });
                await runSanitizedPhase('quarantine cleanup', () =>
                    destroyExactWithBackoff(cleanupDatabase, quarantineName)
                );
            } catch (error) {
                cleanupFailures.push(error.message);
            }
        }
        assert(
            cleanupFailures.length === 0,
            `disposable preview cleanup failed: ${cleanupFailures.join(',')}`
        );
    }
}

main().catch((error) => {
    const detail = error instanceof GateAssertionError ? ` ${error.message}.` : '';
    console.error(`Cloudant contract gate blocked.${detail}`);
    process.exitCode = 2;
});

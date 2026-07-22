import {
    CONTRACT_REJECTION_CODES,
    DOCUMENT_CONTRACT_VERSION,
    applyWriterContract,
    buildDocumentContractDesignDoc,
    DOCUMENT_CONTRACT_CHECKSUM,
    runCloudantContractValidator,
    stripWriterContract,
    validateLocalDocumentContract
} from '../public/js/document-contract.js';

const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const path = require('path');
const goldenCorpus = require('../contracts/document-contract-golden.json');

const CATEGORY_ID = '0dfac102-30f3-56d9-86c0-c3b414aeaf6e';
const GROUP_ID = '24b2d3dd-d761-56f5-905d-5972e9b97233';

function categorized(overrides = {}) {
    return applyWriterContract({
        _id: 'task-1',
        docType: 'task',
        category: 'work/meetings',
        categoryId: CATEGORY_ID,
        categoryIdentityVersion: 1,
        ...overrides
    });
}

function taxonomy(overrides = {}) {
    return applyWriterContract({
        _id: 'config-categories',
        docType: 'config',
        category: null,
        categoryId: null,
        categoryIdentityVersion: null,
        schemaVersion: '3.5',
        identityVersion: 1,
        groups: [
            {
                id: GROUP_ID,
                key: 'work',
                legacyKeys: ['work'],
                label: 'Work',
                colorFamily: 'blue',
                color: '#1d4ed8',
                status: 'active',
                archivedAt: null
            }
        ],
        categories: [
            {
                id: CATEGORY_ID,
                key: 'work/meetings',
                legacyKeys: ['work/meetings'],
                label: 'Comms',
                groupKey: 'work',
                groupId: GROUP_ID,
                color: '#2563eb',
                isLinkedToGroupFamily: true,
                status: 'active',
                archivedAt: null
            }
        ],
        ...overrides
    });
}

function expectDenied(doc, code, oldDoc = null) {
    expect(() => runCloudantContractValidator(doc, oldDoc)).toThrow(code);
}

describe('document persistence contract', () => {
    test('stamps categorized and canonical uncategorized documents', () => {
        expect(categorized().writerContract).toEqual({
            version: DOCUMENT_CONTRACT_VERSION,
            categoryReference: {
                key: 'work/meetings',
                id: CATEGORY_ID,
                identityVersion: 1
            }
        });

        const uncategorized = applyWriterContract({ _id: 'task-2', docType: 'task' });
        expect(uncategorized).toMatchObject({
            category: null,
            categoryId: null,
            categoryIdentityVersion: null,
            writerContract: { version: 1, categoryReference: null }
        });
    });

    test('stamps tombstones without inventing a category witness', () => {
        expect(applyWriterContract({ _id: 'task-1', _rev: '2-a', _deleted: true })).toEqual({
            _id: 'task-1',
            _rev: '2-a',
            _deleted: true,
            writerContract: { version: 1 }
        });
    });

    test('strips persistence-only metadata without mutating the stored document', () => {
        const stored = categorized();
        const domain = stripWriterContract(stored);
        expect(domain.writerContract).toBeUndefined();
        expect(stored.writerContract).toBeDefined();
    });

    test('local structural validation accepts current documents and rejects stale witnesses', () => {
        expect(validateLocalDocumentContract(categorized())).toEqual({ ok: true });
        const stale = { ...categorized(), category: 'work/comms' };
        expect(validateLocalDocumentContract(stale)).toEqual({
            ok: false,
            code: CONTRACT_REJECTION_CODES.CATEGORY_REFERENCE
        });
    });
});

describe('golden local/Cloudant conformance corpus', () => {
    test.each(goldenCorpus.cases)('$name', ({ document, expected }) => {
        const local = validateLocalDocumentContract(document);
        if (expected === 'allow') {
            expect(local).toEqual({ ok: true });
            expect(() => runCloudantContractValidator(document)).not.toThrow();
        } else {
            expect(local).toEqual({ ok: false, code: expected });
            expect(() => runCloudantContractValidator(document)).toThrow(expected);
        }
    });
});

describe('Cloudant document contract validator', () => {
    test('exempts design and local documents', () => {
        expect(() => runCloudantContractValidator({ _id: '_design/example' })).not.toThrow();
        expect(() => runCloudantContractValidator({ _id: '_local/checkpoint' })).not.toThrow();
    });

    test('rejects unsupported types, legacy entities, stale recategorization, and bare tombstones', () => {
        expectDenied(
            applyWriterContract({ _id: 'other-1', docType: 'other' }),
            CONTRACT_REJECTION_CODES.UNSUPPORTED_TYPE
        );
        expectDenied(
            { _id: 'task-legacy', docType: 'task', category: null },
            CONTRACT_REJECTION_CODES.CONTRACT_VERSION
        );
        expectDenied(
            { ...categorized(), category: 'work/comms' },
            CONTRACT_REJECTION_CODES.CATEGORY_REFERENCE
        );
        expectDenied(
            { _id: 'task-1', _rev: '2-a', _deleted: true },
            CONTRACT_REJECTION_CODES.TOMBSTONE_CONTRACT
        );
    });

    test('accepts harmless edits that preserve a coherent inherited witness', () => {
        const oldDoc = categorized({ description: 'before' });
        const newDoc = { ...oldDoc, _rev: '2-a', description: 'after' };
        expect(() => runCloudantContractValidator(newDoc, oldDoc)).not.toThrow();
    });

    test('rejects application-created underscore ids', () => {
        expectDenied(
            applyWriterContract({ _id: '_secret', docType: 'config' }),
            CONTRACT_REJECTION_CODES.APPLICATION_ID
        );
    });

    test('enforces taxonomy uniqueness, parent relationships, and status state', () => {
        expect(() => runCloudantContractValidator(taxonomy())).not.toThrow();

        expectDenied(
            taxonomy({
                categories: [
                    taxonomy().categories[0],
                    { ...taxonomy().categories[0], key: 'work/other' }
                ]
            }),
            CONTRACT_REJECTION_CODES.TAXONOMY_ID
        );
        expectDenied(
            taxonomy({
                categories: [
                    {
                        ...taxonomy().categories[0],
                        groupId: 'wrong-group-id'
                    }
                ]
            }),
            CONTRACT_REJECTION_CODES.TAXONOMY_GROUP
        );
        expectDenied(
            taxonomy({
                groups: [{ ...taxonomy().groups[0], status: 'active', archivedAt: '2026-01-01' }]
            }),
            CONTRACT_REJECTION_CODES.TAXONOMY_STATUS
        );
    });

    test('enforces current keys in monotonic, unambiguous legacy ownership', () => {
        const oldDoc = taxonomy();
        const renamed = taxonomy({
            categories: [
                {
                    ...taxonomy().categories[0],
                    key: 'work/communication',
                    legacyKeys: ['work/meetings', 'work/communication']
                }
            ]
        });
        expect(() => runCloudantContractValidator(renamed, oldDoc)).not.toThrow();

        expectDenied(
            taxonomy({
                categories: [
                    {
                        ...taxonomy().categories[0],
                        key: 'work/communication',
                        legacyKeys: ['work/communication']
                    }
                ]
            }),
            CONTRACT_REJECTION_CODES.TAXONOMY_LEGACY,
            oldDoc
        );
        expectDenied(
            taxonomy({
                groups: [
                    taxonomy().groups[0],
                    {
                        ...taxonomy().groups[0],
                        id: '9ce59a13-a3c9-4a36-913e-dca8baf2f53c',
                        key: 'personal',
                        legacyKeys: ['personal', 'work/meetings']
                    }
                ]
            }),
            CONTRACT_REJECTION_CODES.TAXONOMY_LEGACY
        );
    });

    test('builds a versioned design document with stable checksum metadata', () => {
        const first = buildDocumentContractDesignDoc();
        const second = buildDocumentContractDesignDoc();
        expect(first._id).toBe('_design/fortudo-document-contract');
        expect(first.fortudoDocumentContract).toMatchObject({ version: 1 });
        expect(first.fortudoDocumentContract.checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(second).toEqual(first);
        expect(first.validate_doc_update).toContain('FDC_CONTRACT_VERSION');
        const moduleSource = readFileSync(
            path.join(__dirname, '..', 'public', 'js', 'document-contract.js'),
            'utf8'
        );
        const start = moduleSource.indexOf('function cloudantValidateDocUpdate');
        const marker = '\n}\n\n/**\n * Add persistence metadata';
        const canonicalSource = moduleSource
            .slice(start, moduleSource.indexOf(marker, start) + 2)
            .replace(/^function cloudantValidateDocUpdate/, 'function');
        expect(createHash('sha256').update(canonicalSource).digest('hex')).toBe(
            DOCUMENT_CONTRACT_CHECKSUM
        );
    });
});

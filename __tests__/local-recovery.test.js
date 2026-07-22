/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

import { applyWriterContract } from '../public/js/document-contract.js';
import {
    buildLocalRecoveryBundle,
    downloadLocalRecoveryBundle,
    hasDownloadedLocalRecoveryBundle,
    requireRecoveryResetConfirmation
} from '../public/js/local-recovery.js';

let counter = 0;

function fakeDigest(value) {
    let total = 0;
    for (const character of value) total = (total + character.codePointAt(0)) % 256;
    return Promise.resolve(total.toString(16).padStart(2, '0').repeat(32));
}

describe('sensitive local recovery bundle', () => {
    let db;

    beforeEach(() => {
        db = new PouchDB(`recovery-${counter++}-${Date.now()}`, { adapter: 'memory' });
    });

    afterEach(async () => {
        await db.destroy();
        jest.restoreAllMocks();
    });

    test('captures live, deleted, conflict leaves, attachments, ancestry, and private classification', async () => {
        await db.put({
            ...applyWriterContract({ _id: 'task-live', docType: 'task' }),
            _attachments: {
                'note.txt': { content_type: 'text/plain', data: btoa('private attachment') }
            }
        });
        const deletion = await db.put(
            applyWriterContract({ _id: 'task-deleted', docType: 'task' })
        );
        await db.put(
            applyWriterContract({
                _id: 'task-deleted',
                _rev: deletion.rev,
                _deleted: true
            })
        );
        await db.bulkDocs(
            [
                applyWriterContract({ _id: 'task-conflict', _rev: '1-a', docType: 'task' }),
                { _id: 'task-conflict', _rev: '1-b', docType: 'task' }
            ],
            { new_edits: false }
        );

        const bundle = await buildLocalRecoveryBundle(
            db,
            {
                remotePresent: [{ id: 'task-live', revision: (await db.get('task-live'))._rev }],
                eligible: [],
                recoveryRequired: [
                    { id: 'task-conflict', revision: '1-b', code: 'FDC_CONTRACT_VERSION' }
                ]
            },
            { digest: fakeDigest, now: () => '2026-07-21T12:00:00.000Z' }
        );

        expect(bundle.format).toBe('fortudo-local-recovery-v1');
        expect(bundle.documents).toHaveLength(4);
        expect(bundle.documents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ _id: 'task-deleted', _deleted: true }),
                expect.objectContaining({
                    _id: 'task-live',
                    _attachments: {
                        'note.txt': expect.objectContaining({ data: expect.any(String) })
                    },
                    _revisions: expect.any(Object)
                })
            ])
        );
        expect(bundle.manifest.leaves).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'task-live', classification: 'remote-present' }),
                expect.objectContaining({
                    id: 'task-conflict',
                    revision: '1-b',
                    classification: 'remote-missing-rejected'
                })
            ])
        );
        expect(bundle.manifestChecksum).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(bundle)).not.toContain('https://');
        expect(JSON.stringify(bundle)).not.toContain('credentials');
    });

    test('download is local-only and reset requires both download and exact confirmation', async () => {
        await db.put(applyWriterContract({ _id: 'task-1', docType: 'task' }));
        const bundle = await buildLocalRecoveryBundle(db, {}, { digest: fakeDigest });
        const click = jest.fn();
        jest.spyOn(document, 'createElement').mockReturnValue({ click, remove: jest.fn() });
        const createObjectURL = jest.fn().mockReturnValue('blob:local-only');
        const revokeObjectURL = jest.fn();
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: createObjectURL
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: revokeObjectURL
        });

        expect(hasDownloadedLocalRecoveryBundle(db)).toBe(false);
        expect(() => requireRecoveryResetConfirmation(db, 'RESET LOCAL DATA')).toThrow(
            'Download the recovery bundle first'
        );
        downloadLocalRecoveryBundle(db, bundle);
        expect(click).toHaveBeenCalledTimes(1);
        expect(hasDownloadedLocalRecoveryBundle(db)).toBe(true);
        expect(() => requireRecoveryResetConfirmation(db, 'wrong')).toThrow(
            'confirmation did not match'
        );
        expect(() => requireRecoveryResetConfirmation(db, 'RESET LOCAL DATA')).not.toThrow();
    });

    test('fails closed when local state never stabilizes during export', async () => {
        await db.put(applyWriterContract({ _id: 'task-changing', docType: 'task' }));
        let sequence = 10;
        jest.spyOn(db, 'info').mockImplementation(async () => ({
            db_name: 'changing-local',
            update_seq: sequence++
        }));

        await expect(
            buildLocalRecoveryBundle(db, {}, { digest: fakeDigest, maxRetries: 2 })
        ).rejects.toThrow('Local data changed during recovery export');
    });
});

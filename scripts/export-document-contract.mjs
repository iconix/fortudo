// Canonical, credential-free v1 design-document exporter.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocumentContractDesignDoc } from '../public/js/contracts/remote-contract-v1.js';

const ARTIFACT = new URL('../contracts/document-contract-v1.json', import.meta.url);
// Pin the reviewed artifact independently of editable declarations in the browser module.
const REVIEWED_V1_CHECKSUM = 'c0bf4717ff74c9daa32b850b059df95a45f2156b3491c91f5c658990c0e26a75';

/** Build only the reviewed v1 artifact; never emit a silently changed validator. */
export function buildVerifiedDocumentContract() {
    const document = buildDocumentContractDesignDoc();
    const checksum = createHash('sha256').update(document.validate_doc_update).digest('hex');
    if (
        checksum !== REVIEWED_V1_CHECKSUM ||
        document.fortudoDocumentContract.checksum !== checksum ||
        document.fortudoDocumentContract.version !== 1 ||
        document._id !== '_design/fortudo-document-contract' ||
        document.language !== 'javascript'
    ) {
        throw new Error('Reviewed v1 document contract changed.');
    }
    return document;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const args = process.argv.slice(2);
        if (args.length > 1 || (args.length === 1 && !['--check', '--write'].includes(args[0]))) {
            throw new Error('Usage: node scripts/export-document-contract.mjs [--check|--write]');
        }
        const serialized = JSON.stringify(buildVerifiedDocumentContract(), null, 4) + '\n';
        if (args[0] === '--check') {
            if (readFileSync(ARTIFACT, 'utf8').replace(/\r\n/g, '\n') !== serialized) {
                throw new Error('Document-contract artifact is stale; run with --write.');
            }
        } else if (args[0] === '--write') {
            writeFileSync(ARTIFACT, serialized);
        } else {
            process.stdout.write(serialized);
        }
    } catch {
        console.error(
            'Document-contract export failed. Check the v1 source, artifact, and arguments.'
        );
        process.exitCode = 1;
    }
}

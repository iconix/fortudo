import {
    CONTRACT_REJECTION_CODES,
    REMOTE_DOCUMENT_CONTRACT_VERSION,
    runCloudantContractValidator
} from './contracts/remote-contract-v1.js';

export {
    CONTRACT_REJECTION_CODES,
    DOCUMENT_CONTRACT_CHECKSUM,
    DOCUMENT_CONTRACT_DESIGN_ID,
    REMOTE_DOCUMENT_CONTRACT_VERSION,
    buildDocumentContractDesignDoc,
    getDocumentContractValidatorSource,
    runCloudantContractValidator
} from './contracts/remote-contract-v1.js';

// Compatibility alias: remote policy and writer encoding are separate version axes.
export const DOCUMENT_CONTRACT_VERSION = REMOTE_DOCUMENT_CONTRACT_VERSION;
export const WRITER_ENVELOPE_VERSION = 1;

/**
 * Add persistence metadata without mutating the caller's domain object.
 * @param {Object} document
 * @returns {Object}
 */
export function applyWriterContract(document) {
    const contracted = { ...document };
    if (contracted._deleted) {
        contracted.writerContract = { version: WRITER_ENVELOPE_VERSION };
        return contracted;
    }

    contracted.category = contracted.category ?? null;
    contracted.categoryId = contracted.categoryId ?? null;
    contracted.categoryIdentityVersion = contracted.categoryIdentityVersion ?? null;
    const categoryReference =
        contracted.category === null &&
        contracted.categoryId === null &&
        contracted.categoryIdentityVersion === null
            ? null
            : {
                  key: contracted.category,
                  id: contracted.categoryId,
                  identityVersion: contracted.categoryIdentityVersion
              };
    contracted.writerContract = {
        version: WRITER_ENVELOPE_VERSION,
        categoryReference
    };
    return contracted;
}

/**
 * Remove persistence-only metadata before returning a domain object.
 * @param {Object} document
 * @returns {Object}
 */
export function stripWriterContract(document) {
    const stripped = { ...document };
    delete stripped.writerContract;
    return stripped;
}

/**
 * Structural local validation. It intentionally cannot prove remote oldDoc constraints.
 */
export function validateLocalDocumentContract(document) {
    try {
        runCloudantContractValidator(document, null);
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            code:
                Object.values(CONTRACT_REJECTION_CODES).find((code) => error.message === code) ||
                CONTRACT_REJECTION_CODES.CONTRACT_VERSION
        };
    }
}

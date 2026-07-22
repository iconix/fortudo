export const DOCUMENT_CONTRACT_VERSION = 1;
export const DOCUMENT_CONTRACT_DESIGN_ID = '_design/fortudo-document-contract';

// SHA-256 of the reviewed contract source. Operational tooling recomputes and verifies it.
export const DOCUMENT_CONTRACT_CHECKSUM =
    '404609a41178c355464a1a78cf96b6223d63a3bb7ea1d7eca7faf964c3bd22cc';

export const CONTRACT_REJECTION_CODES = Object.freeze({
    APPLICATION_ID: 'FDC_APPLICATION_ID',
    CATEGORY_CANONICAL: 'FDC_CATEGORY_CANONICAL',
    CATEGORY_IDENTITY: 'FDC_CATEGORY_IDENTITY',
    CATEGORY_REFERENCE: 'FDC_CATEGORY_REFERENCE',
    CONTRACT_VERSION: 'FDC_CONTRACT_VERSION',
    TAXONOMY_GROUP: 'FDC_TAXONOMY_GROUP',
    TAXONOMY_ID: 'FDC_TAXONOMY_ID',
    TAXONOMY_KEY: 'FDC_TAXONOMY_KEY',
    TAXONOMY_LEGACY: 'FDC_TAXONOMY_LEGACY',
    TAXONOMY_SCHEMA: 'FDC_TAXONOMY_SCHEMA',
    TAXONOMY_STABLE_ID: 'FDC_TAXONOMY_STABLE_ID',
    TAXONOMY_STATUS: 'FDC_TAXONOMY_STATUS',
    TOMBSTONE_CONTRACT: 'FDC_TOMBSTONE_CONTRACT',
    UNSUPPORTED_TYPE: 'FDC_UNSUPPORTED_TYPE'
});

/**
 * This function is deliberately self-contained: Cloudant receives its source verbatim.
 * Keep it compatible with CouchDB's validate_doc_update JavaScript environment.
 */
/* eslint-disable no-var */
function cloudantValidateDocUpdate(newDoc, oldDoc) {
    function deny(code) {
        throw { forbidden: code };
    }

    function own(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
    }

    function nonemptyString(value) {
        return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
    }

    function validateStatus(row) {
        if (row.status === 'active') {
            if (row.archivedAt !== null) deny('FDC_TAXONOMY_STATUS');
            return;
        }
        if (row.status === 'archived' && nonemptyString(row.archivedAt)) return;
        deny('FDC_TAXONOMY_STATUS');
    }

    function taxonomyRows(document) {
        return document.groups.concat(document.categories);
    }

    function validateTaxonomy(document, previous) {
        // Fortudo's current domain schema remains 3.5; identity metadata is v1.
        if (
            document.schemaVersion !== '3.5' ||
            document.identityVersion !== 1 ||
            !Array.isArray(document.groups) ||
            !Array.isArray(document.categories)
        ) {
            deny('FDC_TAXONOMY_SCHEMA');
        }

        var rows = taxonomyRows(document);
        var ids = {};
        var keys = {};
        var ownership = {};
        var groupsById = {};
        var groupsByKey = {};
        var index;
        var legacyIndex;
        var row;

        for (index = 0; index < rows.length; index += 1) {
            row = rows[index];
            if (!row || !nonemptyString(row.id)) deny('FDC_TAXONOMY_ID');
            if (ids[row.id]) deny('FDC_TAXONOMY_ID');
            ids[row.id] = true;

            if (!nonemptyString(row.key) || keys[row.key]) deny('FDC_TAXONOMY_KEY');
            keys[row.key] = true;
            validateStatus(row);

            if (!Array.isArray(row.legacyKeys) || row.legacyKeys.indexOf(row.key) === -1) {
                deny('FDC_TAXONOMY_LEGACY');
            }
            for (legacyIndex = 0; legacyIndex < row.legacyKeys.length; legacyIndex += 1) {
                var legacyKey = row.legacyKeys[legacyIndex];
                if (!nonemptyString(legacyKey)) deny('FDC_TAXONOMY_LEGACY');
                if (ownership[legacyKey] && ownership[legacyKey] !== row.id) {
                    deny('FDC_TAXONOMY_LEGACY');
                }
                ownership[legacyKey] = row.id;
            }
        }

        for (index = 0; index < document.groups.length; index += 1) {
            row = document.groups[index];
            groupsById[row.id] = row;
            groupsByKey[row.key] = row;
        }
        for (index = 0; index < document.categories.length; index += 1) {
            row = document.categories[index];
            if (
                !groupsById[row.groupId] ||
                !groupsByKey[row.groupKey] ||
                groupsById[row.groupId].key !== row.groupKey ||
                groupsByKey[row.groupKey].id !== row.groupId
            ) {
                deny('FDC_TAXONOMY_GROUP');
            }
        }

        if (!previous || previous._deleted) return;
        if (!Array.isArray(previous.groups) || !Array.isArray(previous.categories)) {
            deny('FDC_TAXONOMY_SCHEMA');
        }

        var oldRows = previous.groups.concat(previous.categories);
        var newById = {};
        var oldOwnership = {};
        for (index = 0; index < rows.length; index += 1) newById[rows[index].id] = rows[index];

        for (index = 0; index < oldRows.length; index += 1) {
            var oldRow = oldRows[index];
            if (!oldRow || !nonemptyString(oldRow.id) || !nonemptyString(oldRow.key)) {
                deny('FDC_TAXONOMY_SCHEMA');
            }
            var oldKeys = Array.isArray(oldRow.legacyKeys)
                ? oldRow.legacyKeys.slice()
                : [oldRow.key];
            if (oldKeys.indexOf(oldRow.key) === -1) oldKeys.push(oldRow.key);
            for (legacyIndex = 0; legacyIndex < oldKeys.length; legacyIndex += 1) {
                oldOwnership[oldKeys[legacyIndex]] = oldRow.id;
            }

            var retained = newById[oldRow.id];
            if (!retained) continue;
            for (legacyIndex = 0; legacyIndex < oldKeys.length; legacyIndex += 1) {
                if (retained.legacyKeys.indexOf(oldKeys[legacyIndex]) === -1) {
                    deny('FDC_TAXONOMY_LEGACY');
                }
            }
        }

        for (index = 0; index < rows.length; index += 1) {
            row = rows[index];
            var claimedKeys = row.legacyKeys.slice();
            if (claimedKeys.indexOf(row.key) === -1) claimedKeys.push(row.key);
            for (legacyIndex = 0; legacyIndex < claimedKeys.length; legacyIndex += 1) {
                var formerOwner = oldOwnership[claimedKeys[legacyIndex]];
                if (formerOwner && formerOwner !== row.id) deny('FDC_TAXONOMY_STABLE_ID');
            }
        }
    }

    var id = newDoc && newDoc._id;
    if (typeof id === 'string' && (id.indexOf('_design/') === 0 || id.indexOf('_local/') === 0)) {
        return;
    }
    if (!nonemptyString(id) || id.charAt(0) === '_') deny('FDC_APPLICATION_ID');

    var contract = newDoc.writerContract;
    if (newDoc._deleted) {
        if (!contract || contract.version !== 1) deny('FDC_TOMBSTONE_CONTRACT');
        return;
    }

    if (!contract || contract.version !== 1) deny('FDC_CONTRACT_VERSION');
    if (newDoc.docType !== 'task' && newDoc.docType !== 'activity' && newDoc.docType !== 'config') {
        deny('FDC_UNSUPPORTED_TYPE');
    }

    if (
        !own(newDoc, 'category') ||
        !own(newDoc, 'categoryId') ||
        !own(newDoc, 'categoryIdentityVersion')
    ) {
        deny('FDC_CATEGORY_CANONICAL');
    }

    var categoryIsNull = newDoc.category === null;
    var idIsNull = newDoc.categoryId === null;
    var versionIsNull = newDoc.categoryIdentityVersion === null;
    if (categoryIsNull || idIsNull || versionIsNull) {
        if (!categoryIsNull || !idIsNull || !versionIsNull || contract.categoryReference !== null) {
            deny('FDC_CATEGORY_CANONICAL');
        }
    } else {
        if (
            !nonemptyString(newDoc.category) ||
            !nonemptyString(newDoc.categoryId) ||
            newDoc.categoryIdentityVersion !== 1
        ) {
            deny('FDC_CATEGORY_IDENTITY');
        }
        var reference = contract.categoryReference;
        if (
            !reference ||
            reference.key !== newDoc.category ||
            reference.id !== newDoc.categoryId ||
            reference.identityVersion !== newDoc.categoryIdentityVersion
        ) {
            deny('FDC_CATEGORY_REFERENCE');
        }
    }

    if (id === 'config-categories') validateTaxonomy(newDoc, oldDoc);
}

/**
 * Add persistence metadata without mutating the caller's domain object.
 * @param {Object} document
 * @returns {Object}
 */
export function applyWriterContract(document) {
    const contracted = { ...document };
    if (contracted._deleted) {
        contracted.writerContract = { version: DOCUMENT_CONTRACT_VERSION };
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
        version: DOCUMENT_CONTRACT_VERSION,
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
 * Execute the same self-contained function installed in Cloudant.
 * @throws {Error} with a sanitized contract code
 */
export function runCloudantContractValidator(newDoc, oldDoc = null) {
    try {
        cloudantValidateDocUpdate(newDoc, oldDoc, {}, {});
    } catch (error) {
        if (typeof error?.forbidden === 'string') {
            throw new Error(error.forbidden);
        }
        throw error;
    }
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

export function getDocumentContractValidatorSource() {
    return cloudantValidateDocUpdate
        .toString()
        .replace(/\r\n/g, '\n')
        .replace(/^function cloudantValidateDocUpdate/, 'function');
}

export function buildDocumentContractDesignDoc() {
    return {
        _id: DOCUMENT_CONTRACT_DESIGN_ID,
        language: 'javascript',
        fortudoDocumentContract: {
            version: DOCUMENT_CONTRACT_VERSION,
            checksum: DOCUMENT_CONTRACT_CHECKSUM
        },
        validate_doc_update: getDocumentContractValidatorSource()
    };
}

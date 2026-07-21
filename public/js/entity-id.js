const SUPPORTED_ENTITY_TYPES = new Set(['task', 'activity']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getDefaultCryptoProvider() {
    return typeof globalThis !== 'undefined' ? globalThis.crypto : null;
}

function formatUuid(bytes) {
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20)
    ].join('-');
}

/**
 * Generate an RFC 4122 UUID using only cryptographically secure browser APIs.
 * @param {Crypto|null} [cryptoProvider]
 * @returns {string}
 */
export function generateSecureUuid(cryptoProvider = getDefaultCryptoProvider()) {
    if (typeof cryptoProvider?.randomUUID === 'function') {
        const uuid = cryptoProvider.randomUUID();
        if (typeof uuid === 'string' && UUID_PATTERN.test(uuid)) {
            return uuid.toLowerCase();
        }
        throw new Error('crypto.randomUUID() returned an invalid UUID');
    }

    if (typeof cryptoProvider?.getRandomValues !== 'function') {
        throw new Error('Secure randomness is unavailable');
    }

    const bytes = new Uint8Array(16);
    cryptoProvider.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuid(bytes);
}

/**
 * Create a stable opaque entity ID whose prefix describes immutable entity type.
 * @param {'task'|'activity'} entityType
 * @param {Crypto|null} [cryptoProvider]
 * @returns {string}
 */
export function createEntityId(entityType, cryptoProvider = getDefaultCryptoProvider()) {
    if (!SUPPORTED_ENTITY_TYPES.has(entityType)) {
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
    return `${entityType}_${generateSecureUuid(cryptoProvider)}`;
}

export function createTaskId(cryptoProvider = getDefaultCryptoProvider()) {
    return createEntityId('task', cryptoProvider);
}

export function createActivityId(cryptoProvider = getDefaultCryptoProvider()) {
    return createEntityId('activity', cryptoProvider);
}

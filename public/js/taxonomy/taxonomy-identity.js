import { generateSecureUuid } from '../entity-id.js';

export const TAXONOMY_ID_NAMESPACE = '8e2e8b7a-5c3f-4f3e-9c5d-7a1b2e4f6c80';

const VALID_KINDS = new Set(['group', 'category']);

function uuidToBytes(uuid) {
    const compact = uuid.replaceAll('-', '');
    if (!/^[0-9a-f]{32}$/i.test(compact)) {
        throw new Error('Invalid UUID namespace');
    }
    return Uint8Array.from(compact.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
}

function bytesToUuid(bytes) {
    const hex = Array.from(bytes.slice(0, 16), (value) => value.toString(16).padStart(2, '0')).join(
        ''
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
        16,
        20
    )}-${hex.slice(20)}`;
}

function encodeUtf8(value) {
    const bytes = [];
    for (const symbol of value) {
        const codePoint = symbol.codePointAt(0);
        if (codePoint <= 0x7f) {
            bytes.push(codePoint);
        } else if (codePoint <= 0x7ff) {
            bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
        } else if (codePoint <= 0xffff) {
            bytes.push(
                0xe0 | (codePoint >> 12),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f)
            );
        } else {
            bytes.push(
                0xf0 | (codePoint >> 18),
                0x80 | ((codePoint >> 12) & 0x3f),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f)
            );
        }
    }
    return bytes;
}

function rotateLeft(value, count) {
    return (value << count) | (value >>> (32 - count));
}

function sha1(inputBytes) {
    const message = [...inputBytes];
    const bitLength = message.length * 8;
    message.push(0x80);
    while (message.length % 64 !== 56) {
        message.push(0);
    }
    const highBits = Math.floor(bitLength / 0x100000000);
    const lowBits = bitLength >>> 0;
    for (let shift = 24; shift >= 0; shift -= 8) {
        message.push((highBits >>> shift) & 0xff);
    }
    for (let shift = 24; shift >= 0; shift -= 8) {
        message.push((lowBits >>> shift) & 0xff);
    }

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;

    for (let offset = 0; offset < message.length; offset += 64) {
        const words = new Uint32Array(80);
        for (let index = 0; index < 16; index += 1) {
            const start = offset + index * 4;
            words[index] =
                (message[start] << 24) |
                (message[start + 1] << 16) |
                (message[start + 2] << 8) |
                message[start + 3];
        }
        for (let index = 16; index < 80; index += 1) {
            words[index] = rotateLeft(
                words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16],
                1
            );
        }

        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;

        for (let index = 0; index < 80; index += 1) {
            let f;
            let k;
            if (index < 20) {
                f = (b & c) | (~b & d);
                k = 0x5a827999;
            } else if (index < 40) {
                f = b ^ c ^ d;
                k = 0x6ed9eba1;
            } else if (index < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8f1bbcdc;
            } else {
                f = b ^ c ^ d;
                k = 0xca62c1d6;
            }
            const temp = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
            e = d;
            d = c;
            c = rotateLeft(b, 30) >>> 0;
            b = a;
            a = temp;
        }

        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
    }

    const digest = new Uint8Array(20);
    [h0, h1, h2, h3, h4].forEach((word, wordIndex) => {
        for (let byteIndex = 0; byteIndex < 4; byteIndex += 1) {
            digest[wordIndex * 4 + byteIndex] = (word >>> (24 - byteIndex * 8)) & 0xff;
        }
    });
    return digest;
}

/**
 * Return a deterministic UUIDv5 for a compatibility-era taxonomy key.
 * @param {'group'|'category'} kind
 * @param {string} key
 * @returns {string}
 */
export function createLegacyTaxonomyId(kind, key) {
    if (!VALID_KINDS.has(kind)) {
        throw new Error(`Unsupported taxonomy kind: ${kind}`);
    }
    if (typeof key !== 'string' || !key.trim()) {
        throw new Error('A taxonomy key is required');
    }

    const namespaceBytes = uuidToBytes(TAXONOMY_ID_NAMESPACE);
    const nameBytes = encodeUtf8(`${kind}:${key.trim()}`);
    const digest = sha1([...namespaceBytes, ...nameBytes]);
    digest[6] = (digest[6] & 0x0f) | 0x50;
    digest[8] = (digest[8] & 0x3f) | 0x80;
    return bytesToUuid(digest);
}

export function createNewGroupIdentity(cryptoProvider) {
    const id = generateSecureUuid(cryptoProvider);
    return { id, key: `g-${id}`, legacyKeys: [] };
}

export function createNewCategoryIdentity(groupKey, cryptoProvider) {
    if (typeof groupKey !== 'string' || !groupKey.trim()) {
        throw new Error('A parent group key is required');
    }
    const id = generateSecureUuid(cryptoProvider);
    return { id, key: `${groupKey}/c-${id}`, legacyKeys: [] };
}

/**
 * @jest-environment jsdom
 */

import {
    createActivityId,
    createEntityId,
    createTaskId,
    generateSecureUuid
} from '../public/js/entity-id.js';

describe('secure entity identity', () => {
    test('uses crypto.randomUUID when available and applies stable entity prefixes', () => {
        const cryptoProvider = {
            randomUUID: jest.fn(() => '123e4567-e89b-42d3-a456-426614174000')
        };

        expect(createTaskId(cryptoProvider)).toBe('task_123e4567-e89b-42d3-a456-426614174000');
        expect(createActivityId(cryptoProvider)).toBe(
            'activity_123e4567-e89b-42d3-a456-426614174000'
        );
        expect(cryptoProvider.randomUUID).toHaveBeenCalledTimes(2);
    });

    test('falls back to RFC 4122 v4 bytes from crypto.getRandomValues', () => {
        let seed = 0;
        const cryptoProvider = {
            getRandomValues: jest.fn((bytes) => {
                for (let index = 0; index < bytes.length; index += 1) {
                    bytes[index] = seed;
                    seed += 1;
                }
                return bytes;
            })
        };

        const uuid = generateSecureUuid(cryptoProvider);

        expect(uuid).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );
        expect(cryptoProvider.getRandomValues).toHaveBeenCalledTimes(1);
    });

    test('produces unique IDs when secure random bytes differ', () => {
        let counter = 0;
        const cryptoProvider = {
            getRandomValues(bytes) {
                bytes.fill(counter);
                counter += 1;
                return bytes;
            }
        };

        const ids = new Set(Array.from({ length: 20 }, () => createTaskId(cryptoProvider)));
        expect(ids.size).toBe(20);
    });

    test('fails closed when secure randomness is unavailable', () => {
        expect(() => generateSecureUuid({})).toThrow('Secure randomness is unavailable');
        expect(() => generateSecureUuid(null)).toThrow('Secure randomness is unavailable');
    });

    test('rejects unsupported entity prefixes', () => {
        expect(() =>
            createEntityId('scheduled', {
                randomUUID: () => '123e4567-e89b-42d3-a456-426614174000'
            })
        ).toThrow('Unsupported entity type');
    });
});

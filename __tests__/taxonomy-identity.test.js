/**
 * @jest-environment jsdom
 */

import {
    TAXONOMY_ID_NAMESPACE,
    createLegacyTaxonomyId,
    createNewCategoryIdentity,
    createNewGroupIdentity
} from '../public/js/taxonomy/taxonomy-identity.js';

describe('taxonomy identity', () => {
    test('uses the fixed namespace and deterministic UUIDv5 IDs for legacy keys', () => {
        expect(TAXONOMY_ID_NAMESPACE).toBe('8e2e8b7a-5c3f-4f3e-9c5d-7a1b2e4f6c80');
        expect(createLegacyTaxonomyId('group', 'work')).toBe(
            '3930ae01-aef6-5c5f-8db3-d91be139ea84'
        );
        expect(createLegacyTaxonomyId('category', 'work/meetings')).toBe(
            '9c52c0e9-c389-54e1-927f-52c16b13de99'
        );
        expect(createLegacyTaxonomyId('category', 'work/comms')).toBe(
            '0dfac102-30f3-56d9-86c0-c3b414aeaf6e'
        );
    });

    test('new groups use one random UUID for the opaque ID and compatibility key', () => {
        const cryptoProvider = {
            randomUUID: () => '123e4567-e89b-42d3-a456-426614174000'
        };

        expect(createNewGroupIdentity(cryptoProvider)).toEqual({
            id: '123e4567-e89b-42d3-a456-426614174000',
            key: 'g-123e4567-e89b-42d3-a456-426614174000',
            legacyKeys: []
        });
    });

    test('new categories use a nonsemantic compatibility key under the selected group', () => {
        const cryptoProvider = {
            randomUUID: () => '123e4567-e89b-42d3-a456-426614174000'
        };

        expect(createNewCategoryIdentity('g-parent', cryptoProvider)).toEqual({
            id: '123e4567-e89b-42d3-a456-426614174000',
            key: 'g-parent/c-123e4567-e89b-42d3-a456-426614174000',
            legacyKeys: []
        });
    });

    test('legacy identity rejects unknown record kinds and empty keys', () => {
        expect(() => createLegacyTaxonomyId('room', 'work')).toThrow('taxonomy kind');
        expect(() => createLegacyTaxonomyId('group', '')).toThrow('taxonomy key');
    });
});

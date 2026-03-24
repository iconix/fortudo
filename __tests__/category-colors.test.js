/**
 * @jest-environment jsdom
 */

import {
    COLOR_FAMILIES,
    getFamilyBaseColor,
    pickLinkedChildColor,
    isColorInFamily,
    normalizeFamilyName
} from '../public/js/category-colors.js';

describe('category-colors', () => {
    test('normalizeFamilyName accepts known families and falls back to blue', () => {
        expect(normalizeFamilyName('green')).toBe('green');
        expect(normalizeFamilyName('unknown')).toBe('blue');
        expect(normalizeFamilyName('__proto__')).toBe('blue');
    });

    test('getFamilyBaseColor returns a concrete color from the family', () => {
        expect(COLOR_FAMILIES.blue).toContain(getFamilyBaseColor('blue'));
    });

    test('COLOR_FAMILIES family arrays are frozen', () => {
        expect(Object.isFrozen(COLOR_FAMILIES.blue)).toBe(true);
        expect(Object.isFrozen(COLOR_FAMILIES.green)).toBe(true);
    });

    test('pickLinkedChildColor returns a family variation', () => {
        const color = pickLinkedChildColor('amber', 0);
        expect(COLOR_FAMILIES.amber).toContain(color);
    });

    test('pickLinkedChildColor varies by index but stays deterministic', () => {
        expect(pickLinkedChildColor('rose', 1)).toBe(pickLinkedChildColor('rose', 1));
        expect(pickLinkedChildColor('rose', 1)).not.toBe(pickLinkedChildColor('rose', 2));
    });

    test('pickLinkedChildColor handles negative and non-integer indices safely', () => {
        expect(COLOR_FAMILIES.rose).toContain(pickLinkedChildColor('rose', -1));
        expect(pickLinkedChildColor('rose', 1.7)).toBe(COLOR_FAMILIES.rose[1]);
        expect(pickLinkedChildColor('rose', '1')).toBe(COLOR_FAMILIES.rose[1]);
    });

    test('isColorInFamily detects whether a concrete color belongs to the family', () => {
        expect(isColorInFamily('blue', COLOR_FAMILIES.blue[0])).toBe(true);
        expect(isColorInFamily('blue', '#22c55e')).toBe(false);
    });

    test('isColorInFamily returns false for non-string colors', () => {
        expect(isColorInFamily('blue', null)).toBe(false);
        expect(isColorInFamily('blue', undefined)).toBe(false);
        expect(isColorInFamily('blue', 123)).toBe(false);
    });
});

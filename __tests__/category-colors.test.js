/**
 * @jest-environment jsdom
 */

import {
    COLOR_FAMILIES,
    getFamilyBaseColor,
    getNextLinkedChildColor,
    pickLinkedChildColor,
    isColorInFamily,
    normalizeFamilyName
} from '../public/js/category-colors.js';

describe('category-colors', () => {
    test('exposes gray and violet as supported families', () => {
        expect(COLOR_FAMILIES.gray).toEqual(
            expect.arrayContaining([expect.stringMatching(/^#/), expect.stringMatching(/^#/)])
        );
        expect(COLOR_FAMILIES.violet).toEqual(
            expect.arrayContaining([expect.stringMatching(/^#/), expect.stringMatching(/^#/)])
        );
        expect(normalizeFamilyName('gray')).toBe('gray');
        expect(normalizeFamilyName('violet')).toBe('violet');
    });

    test('normalizeFamilyName accepts known families and falls back to blue', () => {
        expect(normalizeFamilyName('green')).toBe('green');
        expect(normalizeFamilyName('unknown')).toBe('blue');
        expect(normalizeFamilyName('__proto__')).toBe('blue');
    });

    test('getFamilyBaseColor returns a concrete color from the family', () => {
        expect(COLOR_FAMILIES.blue).toContain(getFamilyBaseColor('blue'));
    });

    test('COLOR_FAMILIES family arrays are frozen', () => {
        for (const familyName of ['blue', 'green', 'amber', 'rose', 'gray', 'violet']) {
            expect(Object.isFrozen(COLOR_FAMILIES[familyName])).toBe(true);
        }
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
        expect(isColorInFamily('blue', '#3b82f6')).toBe(true);
        expect(isColorInFamily('blue', '#22c55e')).toBe(false);
    });

    test('isColorInFamily returns false for non-string colors', () => {
        expect(isColorInFamily('blue', null)).toBe(false);
        expect(isColorInFamily('blue', undefined)).toBe(false);
        expect(isColorInFamily('blue', 123)).toBe(false);
    });

    test('linked family colors provide six alternating tones with visible separation', () => {
        Object.values(COLOR_FAMILIES).forEach((colors) => {
            expect(colors).toHaveLength(6);
            expect(new Set(colors).size).toBe(6);

            colors.forEach((color, index) => {
                const nextColor = colors[(index + 1) % colors.length];
                expect(getRgbDistance(color, nextColor)).toBeGreaterThan(70);
            });
        });
    });

    test('getNextLinkedChildColor cycles within the selected family', () => {
        const first = COLOR_FAMILIES.blue[0];

        expect(getNextLinkedChildColor('blue', first)).toBe(COLOR_FAMILIES.blue[1]);
        expect(getNextLinkedChildColor('blue', COLOR_FAMILIES.blue.at(-1))).toBe(first);
        expect(getNextLinkedChildColor('blue', '#ffffff')).toBe(first);
    });
});

function getRgbDistance(left, right) {
    const parse = (color) =>
        [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
    const leftRgb = parse(left);
    const rightRgb = parse(right);

    return Math.sqrt(
        leftRgb.reduce((total, channel, index) => total + (channel - rightRgb[index]) ** 2, 0)
    );
}

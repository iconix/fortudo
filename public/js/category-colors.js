export const COLOR_FAMILIES = Object.freeze({
    blue: ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa'],
    green: ['#15803d', '#16a34a', '#22c55e', '#4ade80'],
    amber: ['#b45309', '#d97706', '#f59e0b', '#fbbf24'],
    rose: ['#be123c', '#e11d48', '#f43f5e', '#fb7185']
});

/**
 * Normalize a requested family name to a known family.
 * @param {string} familyName
 * @returns {keyof typeof COLOR_FAMILIES}
 */
export function normalizeFamilyName(familyName) {
    return COLOR_FAMILIES[familyName] ? familyName : 'blue';
}

/**
 * Get a representative color for a family.
 * @param {string} familyName
 * @returns {string}
 */
export function getFamilyBaseColor(familyName) {
    const family = COLOR_FAMILIES[normalizeFamilyName(familyName)];
    return family[1] || family[0];
}

/**
 * Pick a deterministic child color from a family.
 * @param {string} familyName
 * @param {number} [index=0]
 * @returns {string}
 */
export function pickLinkedChildColor(familyName, index = 0) {
    const family = COLOR_FAMILIES[normalizeFamilyName(familyName)];
    return family[index % family.length];
}

/**
 * Check whether a concrete color belongs to the requested family.
 * @param {string} familyName
 * @param {string} color
 * @returns {boolean}
 */
export function isColorInFamily(familyName, color) {
    const family = COLOR_FAMILIES[normalizeFamilyName(familyName)];
    return family.includes(color.toLowerCase());
}

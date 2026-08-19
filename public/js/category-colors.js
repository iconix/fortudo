const COLOR_FAMILIES_RAW = {
    blue: ['#1d4ed8', '#7dd3fc', '#2563eb', '#38bdf8', '#1e40af', '#60a5fa', '#0369a1', '#93c5fd'],
    green: ['#166534', '#86efac', '#15803d', '#4ade80', '#047857', '#22c55e', '#065f46', '#6ee7b7'],
    amber: ['#b45309', '#fde047', '#92400e', '#fbbf24', '#c2410c', '#fb923c', '#a16207', '#fcd34d'],
    rose: ['#9f1239', '#fda4af', '#be123c', '#fb7185', '#881337', '#f43f5e', '#b91c1c', '#fecdd3'],
    violet: [
        '#5b21b6',
        '#c4b5fd',
        '#6d28d9',
        '#a78bfa',
        '#4c1d95',
        '#8b5cf6',
        '#7e22ce',
        '#ddd6fe'
    ],
    gray: ['#1f2937', '#cbd5e1', '#374151', '#9ca3af', '#111827', '#94a3b8', '#475569', '#e2e8f0']
};

const LEGACY_COLOR_FAMILIES = Object.freeze({
    blue: Object.freeze(['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa']),
    green: Object.freeze(['#15803d', '#16a34a', '#22c55e', '#4ade80']),
    amber: Object.freeze(['#b45309', '#d97706', '#f59e0b', '#fbbf24']),
    rose: Object.freeze(['#be123c', '#e11d48', '#f43f5e', '#fb7185']),
    violet: Object.freeze(['#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa']),
    gray: Object.freeze(['#374151', '#4b5563', '#6b7280', '#9ca3af'])
});

export const COLOR_FAMILIES = Object.freeze(
    Object.fromEntries(
        Object.entries(COLOR_FAMILIES_RAW).map(([familyName, colors]) => [
            familyName,
            Object.freeze(colors)
        ])
    )
);

/**
 * Normalize a requested family name to a known family.
 * @param {string} familyName
 * @returns {keyof typeof COLOR_FAMILIES}
 */
export function normalizeFamilyName(familyName) {
    return Object.prototype.hasOwnProperty.call(COLOR_FAMILIES, familyName) ? familyName : 'blue';
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
    const numericIndex = Number(index);
    const normalizedIndex = Number.isFinite(numericIndex) ? Math.trunc(numericIndex) : 0;
    const safeIndex = ((normalizedIndex % family.length) + family.length) % family.length;
    return family[safeIndex];
}

/**
 * Pick the next linked color in a family, wrapping to the first tone.
 * @param {string} familyName
 * @param {string} currentColor
 * @param {string[]} [unavailableColors=[]]
 * @returns {string}
 */
export function getNextLinkedChildColor(familyName, currentColor, unavailableColors = []) {
    const family = COLOR_FAMILIES[normalizeFamilyName(familyName)];
    const normalizedColor = typeof currentColor === 'string' ? currentColor.toLowerCase() : '';
    const currentIndex = family.indexOf(normalizedColor);
    const unavailable = new Set(
        unavailableColors
            .filter((color) => typeof color === 'string')
            .map((color) => color.toLowerCase())
    );
    const startIndex = currentIndex === -1 ? family.length - 1 : currentIndex;

    for (let offset = 1; offset <= family.length; offset += 1) {
        const candidate = family[(startIndex + offset) % family.length];
        if (!unavailable.has(candidate)) {
            return candidate;
        }
    }

    return currentIndex === -1 ? family[0] : normalizedColor;
}

/**
 * Check whether a concrete color belongs to the requested family.
 * @param {string} familyName
 * @param {string} color
 * @returns {boolean}
 */
export function isColorInFamily(familyName, color) {
    if (typeof color !== 'string') {
        return false;
    }

    const normalizedFamily = normalizeFamilyName(familyName);
    const normalizedColor = color.toLowerCase();
    return (
        COLOR_FAMILIES[normalizedFamily].includes(normalizedColor) ||
        LEGACY_COLOR_FAMILIES[normalizedFamily].includes(normalizedColor)
    );
}

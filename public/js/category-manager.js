import { loadConfig, putConfig } from './storage.js';

const CONFIG_ID = 'config-categories';

export const DEFAULT_CATEGORIES = Object.freeze([
    { key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' },
    { key: 'work/meetings', label: 'Meetings', color: '#6366f1', group: 'work' },
    { key: 'work/comms', label: 'Comms', color: '#f59e0b', group: 'work' },
    { key: 'work/admin', label: 'Admin', color: '#64748b', group: 'work' },
    { key: 'personal', label: 'Personal', color: '#ec4899', group: 'personal' },
    { key: 'break', label: 'Break', color: '#22c55e', group: 'break' }
]);

/** @type {Array<{key: string, label: string, color: string, group: string}>} */
let categories = [];

/**
 * Load categories from config doc or seed the defaults.
 * @returns {Promise<void>}
 */
export async function loadCategories() {
    const config = await loadConfig(CONFIG_ID);
    if (config && Array.isArray(config.categories) && config.categories.length > 0) {
        categories = config.categories.map((category) => ({ ...category }));
        return;
    }

    categories = DEFAULT_CATEGORIES.map((category) => ({ ...category }));
    await persistCategories();
}

/**
 * Get the in-memory categories.
 * @returns {Array<{key: string, label: string, color: string, group: string}>}
 */
export function getCategories() {
    return categories;
}

/**
 * Look up a category by key.
 * @param {string} key
 * @returns {{key: string, label: string, color: string, group: string}|null}
 */
export function getCategoryByKey(key) {
    return categories.find((category) => category.key === key) || null;
}

/**
 * Group categories by the `group` field.
 * @returns {Object<string, Array<{key: string, label: string, color: string, group: string}>>}
 */
export function getCategoryGroups() {
    return categories.reduce((groups, category) => {
        if (!groups[category.group]) {
            groups[category.group] = [];
        }
        groups[category.group].push(category);
        return groups;
    }, {});
}

/**
 * Add a new category and persist it.
 * @param {{key: string, label: string, color: string, group: string}} category
 * @returns {Promise<void>}
 */
export async function addCategory(category) {
    if (getCategoryByKey(category.key)) {
        throw new Error(`Category "${category.key}" already exists`);
    }

    categories.push({ ...category });
    await persistCategories();
}

/**
 * Update an existing category by key.
 * @param {string} key
 * @param {{label?: string, color?: string}} updates
 * @returns {Promise<void>}
 */
export async function updateCategory(key, updates) {
    const category = getCategoryByKey(key);
    if (!category) {
        throw new Error(`Category "${key}" not found`);
    }

    if (updates.label !== undefined) {
        category.label = updates.label;
    }
    if (updates.color !== undefined) {
        category.color = updates.color;
    }

    await persistCategories();
}

/**
 * Delete a category by key.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteCategory(key) {
    const index = categories.findIndex((category) => category.key === key);
    if (index === -1) {
        throw new Error(`Category "${key}" not found`);
    }

    categories.splice(index, 1);
    await persistCategories();
}

/**
 * Render a category badge for a task/activity card.
 * @param {string|null|undefined} categoryKey
 * @returns {string}
 */
export function renderCategoryBadge(categoryKey) {
    if (!categoryKey) {
        return '';
    }

    const category = getCategoryByKey(categoryKey);
    if (!category) {
        return '';
    }

    const safeLabel = escapeHtml(category.label);
    return `<span class="category-badge inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs" style="background-color: ${category.color}20; color: ${category.color}; border: 1px solid ${category.color}40;">
        <span class="w-1.5 h-1.5 rounded-full inline-block" style="background-color: ${category.color}"></span>
        ${safeLabel}
    </span>`;
}

async function persistCategories() {
    await putConfig({
        id: CONFIG_ID,
        categories: categories.map((category) => ({ ...category }))
    });
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

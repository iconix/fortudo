import { isActivitiesEnabled, setActivitiesEnabled } from './settings-manager.js';
import {
    getCategories,
    getCategoryGroups,
    addCategory,
    updateCategory,
    deleteCategory
} from './category-manager.js';
import { showToast } from './toast-manager.js';

/**
 * Get the settings modal element.
 * @returns {HTMLElement|null}
 */
export function getSettingsModalElement() {
    return document.getElementById('settings-modal');
}

/**
 * Open the settings modal.
 */
export function openSettingsModal() {
    const modal = getSettingsModalElement();
    if (modal) {
        modal.classList.remove('hidden');
    }
}

/**
 * Close the settings modal.
 */
export function closeSettingsModal() {
    const modal = getSettingsModalElement();
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Render the settings panel content.
 */
export function renderSettingsContent() {
    const container = document.getElementById('settings-content');
    if (!container) {
        return;
    }

    const enabled = isActivitiesEnabled();
    container.innerHTML = `
        <div class="space-y-6">
            <div class="flex items-center justify-between">
                <div>
                    <label for="activities-toggle" class="text-slate-200 font-medium">Enable Activities</label>
                    <p class="text-xs text-slate-400 mt-0.5">Track time spent and view insights</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="activities-toggle" class="sr-only peer" ${enabled ? 'checked' : ''} />
                    <div class="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                </label>
            </div>

            <div id="reload-prompt" class="hidden bg-slate-700/50 border border-slate-600 rounded-lg p-3 text-sm">
                <p class="text-slate-300 mb-2" id="reload-prompt-message"></p>
                <button id="reload-apply-btn" class="bg-teal-500 hover:bg-teal-400 text-white px-4 py-1.5 rounded-lg text-sm transition-colors">
                    Reload to Apply
                </button>
            </div>

            <div id="category-management-section" class="${enabled ? '' : 'hidden'}">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-slate-300 font-medium text-sm">Categories</h4>
                    <button id="add-category-btn" class="text-teal-400 hover:text-teal-300 text-sm flex items-center gap-1 transition-colors">
                        <i class="fa-solid fa-plus text-xs"></i> Add
                    </button>
                </div>

                <div id="category-list" class="space-y-1.5">
                    ${renderCategoryList()}
                </div>

                <form id="add-category-form" class="hidden mt-3 space-y-2 bg-slate-700/30 rounded-lg p-3 border border-slate-600">
                    <input type="text" name="category-label" placeholder="Category label" class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm" required />
                    <div class="flex items-center gap-2">
                        <label class="text-slate-400 text-xs">Color</label>
                        <input type="color" name="category-color" value="#0ea5e9" class="h-8 w-8 rounded cursor-pointer bg-transparent border-0" />
                    </div>
                    <input type="text" name="category-group" placeholder="Group (e.g. work)" class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm" required />
                    <div class="flex gap-2 pt-1">
                        <button type="submit" class="bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">Save</button>
                        <button type="button" id="cancel-add-category" class="bg-slate-600 hover:bg-slate-500 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    wireSettingsEvents();
}

function renderCategoryList() {
    const groups = getCategoryGroups();
    let html = '';

    for (const [groupName, categories] of Object.entries(groups)) {
        html += `<div class="text-xs text-slate-500 uppercase tracking-wide mt-2 mb-1 first:mt-0">${escapeHtml(groupName)}</div>`;
        for (const category of categories) {
            html += `
                <div data-category-key="${escapeHtml(category.key)}" class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-700/30 transition-colors group">
                    <div class="flex items-center gap-2">
                        <span class="category-dot w-3 h-3 rounded-full inline-block" style="background-color: ${category.color}"></span>
                        <span class="text-sm text-slate-200">${escapeHtml(category.label)}</span>
                    </div>
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="btn-edit-category text-slate-400 hover:text-slate-200 p-1 text-xs" data-key="${escapeHtml(category.key)}">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-delete-category text-slate-400 hover:text-rose-400 p-1 text-xs" data-key="${escapeHtml(category.key)}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }
    }

    return html;
}

function wireSettingsEvents() {
    const toggle = document.getElementById('activities-toggle');
    if (toggle) {
        toggle.addEventListener('change', () => {
            const newValue = toggle.checked;
            setActivitiesEnabled(newValue);

            const reloadPrompt = document.getElementById('reload-prompt');
            const message = document.getElementById('reload-prompt-message');
            const categorySection = document.getElementById('category-management-section');

            if (reloadPrompt) {
                reloadPrompt.classList.remove('hidden');
            }
            if (message) {
                message.textContent = newValue
                    ? 'Activities enabled. Category tracking and insights will be available after reload.'
                    : 'Activities disabled. Category and activity features will be hidden after reload.';
            }
            if (categorySection) {
                categorySection.classList.toggle('hidden', !newValue);
            }
        });
    }

    const reloadButton = document.getElementById('reload-apply-btn');
    if (reloadButton) {
        reloadButton.addEventListener('click', () => {
            window.location.reload();
        });
    }

    const closeButton = document.getElementById('close-settings-modal');
    if (closeButton) {
        closeButton.addEventListener('click', closeSettingsModal);
    }

    const addButton = document.getElementById('add-category-btn');
    const addForm = document.getElementById('add-category-form');
    if (addButton && addForm) {
        addButton.addEventListener('click', () => {
            addForm.classList.toggle('hidden');
        });
    }

    const cancelAddButton = document.getElementById('cancel-add-category');
    if (cancelAddButton && addForm) {
        cancelAddButton.addEventListener('click', () => {
            addForm.classList.add('hidden');
            addForm.reset();
        });
    }

    if (addForm) {
        addForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(addForm);
            const label = formData.get('category-label')?.toString().trim();
            const color = formData.get('category-color')?.toString() || '#0ea5e9';
            const group = formData.get('category-group')?.toString().trim().toLowerCase();

            if (!label || !group) {
                return;
            }

            const slug = label.toLowerCase().replace(/\s+/g, '-');
            const key = group === slug ? group : `${group}/${slug}`;

            try {
                await addCategory({ key, label, color, group });
                addForm.classList.add('hidden');
                addForm.reset();
                refreshCategoryList();
            } catch (error) {
                showToast(error.message || 'Failed to add category', { theme: 'rose' });
            }
        });
    }

    const categoryList = document.getElementById('category-list');
    if (categoryList) {
        categoryList.addEventListener('click', async (event) => {
            const button = event.target.closest('button');
            if (!button) {
                return;
            }

            const key = button.dataset.key;
            if (!key) {
                return;
            }

            if (button.classList.contains('btn-delete-category')) {
                try {
                    await deleteCategory(key);
                    refreshCategoryList();
                } catch (error) {
                    showToast(error.message || 'Failed to delete category', { theme: 'rose' });
                }
                return;
            }

            if (button.classList.contains('btn-edit-category')) {
                renderInlineCategoryEditor(key);
            }
        });
    }
}

function renderInlineCategoryEditor(key) {
    const categoryList = document.getElementById('category-list');
    const row = Array.from(categoryList?.querySelectorAll('[data-category-key]') || []).find(
        (element) => element.dataset.categoryKey === key
    );
    const category = getCategories().find((entry) => entry.key === key);
    if (!row || !category) {
        return;
    }

    row.innerHTML = `
        <form class="edit-category-form flex items-center gap-2 w-full" data-key="${escapeHtml(key)}">
            <input type="color" name="edit-color" value="${category.color}" class="h-6 w-6 rounded cursor-pointer bg-transparent border-0" />
            <input type="text" name="edit-label" value="${escapeAttribute(category.label)}" class="bg-slate-700 p-1 rounded text-sm border border-slate-600 focus:border-teal-400 focus:outline-none flex-1" />
            <button type="submit" class="text-teal-400 hover:text-teal-300 p-1 text-xs"><i class="fa-solid fa-check"></i></button>
            <button type="button" class="btn-cancel-edit-category text-slate-400 hover:text-slate-200 p-1 text-xs"><i class="fa-solid fa-xmark"></i></button>
        </form>
    `;

    const editForm = row.querySelector('.edit-category-form');
    if (editForm) {
        editForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(editForm);
            const label = formData.get('edit-label')?.toString().trim();
            const color = formData.get('edit-color')?.toString();
            if (!label) {
                return;
            }

            try {
                await updateCategory(key, { label, color });
                refreshCategoryList();
            } catch (error) {
                showToast(error.message || 'Failed to update category', { theme: 'rose' });
            }
        });
    }

    const cancelButton = row.querySelector('.btn-cancel-edit-category');
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            refreshCategoryList();
        });
    }
}

function refreshCategoryList() {
    const categoryList = document.getElementById('category-list');
    if (!categoryList) {
        return;
    }

    categoryList.innerHTML = renderCategoryList();
}

/**
 * Initialize modal listeners shared across app boot.
 * @param {Function} [onOpen]
 */
export function initializeSettingsModalListeners(onOpen) {
    const gearButton = document.getElementById('settings-gear-btn');
    if (gearButton) {
        gearButton.addEventListener('click', () => {
            if (onOpen) {
                onOpen();
            }
            openSettingsModal();
        });
    }

    const modal = getSettingsModalElement();
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeSettingsModal();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const activeModal = getSettingsModalElement();
            if (activeModal && !activeModal.classList.contains('hidden')) {
                closeSettingsModal();
            }
        }
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

function escapeAttribute(value) {
    return escapeHtml(value);
}

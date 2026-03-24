import { isActivitiesEnabled, setActivitiesEnabled } from './settings-manager.js';
import { COLOR_FAMILIES } from './category-colors.js';
import {
    getCategories,
    addGroup,
    updateGroup,
    deleteGroup,
    addCategory,
    updateCategory,
    deleteCategory
} from './category-manager.js';
import { showToast } from './toast-manager.js';

let currentRenderOptions = {};
let isAddGroupFormVisible = false;
let isAddCategoryFormVisible = false;
let editingGroupKey = null;
let editingCategoryKey = null;

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
 * @param {{ onTaxonomyChanged?: Function }} [options]
 */
export function renderSettingsContent(options = {}) {
    currentRenderOptions = options;

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
                <button id="reload-apply-btn" type="button" class="bg-teal-500 hover:bg-teal-400 text-white px-4 py-1.5 rounded-lg text-sm transition-colors">
                    Reload to Apply
                </button>
            </div>

            <div id="taxonomy-management-section" class="space-y-6 ${enabled ? '' : 'hidden'}">
                <section class="space-y-3">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-slate-200 font-medium text-sm">Groups</h4>
                            <p class="text-xs text-slate-400">Standalone selectable groups and their color families.</p>
                        </div>
                        <button id="add-group-btn" type="button" class="text-teal-400 hover:text-teal-300 text-sm flex items-center gap-1 transition-colors">
                            <i class="fa-solid fa-plus text-xs"></i> Add
                        </button>
                    </div>
                    <div id="groups-list" class="space-y-2">
                        ${renderGroupsList()}
                    </div>
                    ${renderAddGroupForm()}
                </section>

                <section class="space-y-3">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="text-slate-200 font-medium text-sm">Categories</h4>
                            <p class="text-xs text-slate-400">Child categories linked to a parent group family.</p>
                        </div>
                        <button id="add-category-btn" type="button" class="text-teal-400 hover:text-teal-300 text-sm flex items-center gap-1 transition-colors">
                            <i class="fa-solid fa-plus text-xs"></i> Add
                        </button>
                    </div>
                    <div id="categories-list" class="space-y-3">
                        ${renderCategoriesList()}
                    </div>
                    ${renderAddCategoryForm()}
                </section>
            </div>
        </div>
    `;

    wireSettingsEvents();
}

function renderGroupsList() {
    const { groups } = getCategories();
    if (groups.length === 0) {
        return '<p class="text-sm text-slate-400">No groups yet.</p>';
    }

    return groups
        .map((group) => {
            if (editingGroupKey === group.key) {
                return renderGroupEditor(group);
            }

            return `
                <div data-group-key="${escapeHtml(group.key)}" class="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-slate-700 bg-slate-800/40">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${group.color}"></span>
                        <div class="min-w-0">
                            <div class="text-sm text-slate-200">${escapeHtml(group.label)}</div>
                            <div class="text-xs text-slate-400">${escapeHtml(group.key)} · ${escapeHtml(group.colorFamily)}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" class="btn-edit-group text-slate-400 hover:text-slate-200 p-1 text-xs" data-key="${escapeHtml(group.key)}">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="btn-delete-group text-slate-400 hover:text-rose-400 p-1 text-xs" data-key="${escapeHtml(group.key)}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        })
        .join('');
}

function renderGroupEditor(group) {
    return `
        <form class="edit-group-form space-y-3 py-3 px-3 rounded-lg border border-slate-600 bg-slate-700/30" data-key="${escapeHtml(group.key)}">
            <div class="space-y-1">
                <label class="text-xs text-slate-400" for="edit-group-label-${escapeHtml(group.key)}">Group name</label>
                <input
                    id="edit-group-label-${escapeHtml(group.key)}"
                    type="text"
                    name="edit-group-label"
                    value="${escapeAttribute(group.label)}"
                    class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm"
                />
            </div>
            <div class="space-y-1">
                <label class="text-xs text-slate-400" for="edit-group-family-${escapeHtml(group.key)}">Color family</label>
                <select
                    id="edit-group-family-${escapeHtml(group.key)}"
                    name="edit-group-family"
                    class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm"
                >
                    ${renderColorFamilyOptions(group.colorFamily)}
                </select>
            </div>
            <div class="flex gap-2 pt-1">
                <button type="submit" class="bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">Save</button>
                <button type="button" class="btn-cancel-edit-group bg-slate-600 hover:bg-slate-500 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors">Cancel</button>
            </div>
        </form>
    `;
}

function renderAddGroupForm() {
    return `
        <form id="add-group-form" class="${isAddGroupFormVisible ? '' : 'hidden '}space-y-3 bg-slate-700/30 rounded-lg p-3 border border-slate-600">
            <div class="space-y-1">
                <label class="text-xs text-slate-400" for="group-label">Group name</label>
                <input
                    id="group-label"
                    type="text"
                    name="group-label"
                    placeholder="Group name"
                    class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm"
                />
            </div>
            <div class="space-y-1">
                <label class="text-xs text-slate-400" for="group-family">Color family</label>
                <select
                    id="group-family"
                    name="group-family"
                    class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm"
                >
                    ${renderColorFamilyOptions('blue')}
                </select>
            </div>
            <div class="flex gap-2 pt-1">
                <button type="submit" class="bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">Save</button>
                <button type="button" id="cancel-add-group" class="bg-slate-600 hover:bg-slate-500 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors">Cancel</button>
            </div>
        </form>
    `;
}

function renderCategoriesList() {
    const { groups, categories } = getCategories();
    if (categories.length === 0) {
        return '<p class="text-sm text-slate-400">No child categories yet.</p>';
    }

    return groups
        .map((group) => {
            const childCategories = categories.filter(
                (category) => category.groupKey === group.key
            );
            if (childCategories.length === 0) {
                return '';
            }

            return `
                <div class="space-y-2">
                    <div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(group.label)}</div>
                    <div class="space-y-2">
                        ${childCategories.map((category) => renderCategoryRow(category, group)).join('')}
                    </div>
                </div>
            `;
        })
        .filter(Boolean)
        .join('');
}

function renderCategoryRow(category, group) {
    if (editingCategoryKey === category.key) {
        return renderCategoryEditor(category);
    }

    const linkState = category.isLinkedToGroupFamily ? 'Linked' : 'Unlinked';
    const linkTheme = category.isLinkedToGroupFamily
        ? 'text-teal-300 border-teal-500/30 bg-teal-500/10'
        : 'text-amber-300 border-amber-500/30 bg-amber-500/10';

    return `
        <div data-category-key="${escapeHtml(category.key)}" class="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-slate-700 bg-slate-800/40">
            <div class="flex items-center gap-3 min-w-0">
                <span class="category-dot w-3 h-3 rounded-full shrink-0" style="background-color: ${category.color}"></span>
                <div class="min-w-0">
                    <div class="text-sm text-slate-200">${escapeHtml(category.label)}</div>
                    <div class="text-xs text-slate-400">${escapeHtml(group.label)} · ${escapeHtml(category.key)}</div>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-[11px] px-2 py-0.5 rounded-full border ${linkTheme}">${linkState}</span>
                <button type="button" class="btn-edit-category text-slate-400 hover:text-slate-200 p-1 text-xs" data-key="${escapeHtml(category.key)}">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button type="button" class="btn-delete-category text-slate-400 hover:text-rose-400 p-1 text-xs" data-key="${escapeHtml(category.key)}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function renderCategoryEditor(category) {
    return `
        <form class="edit-category-form space-y-3 py-3 px-3 rounded-lg border border-slate-600 bg-slate-700/30" data-key="${escapeHtml(category.key)}">
            <div class="space-y-1">
                <label class="text-xs text-slate-400" for="edit-category-label-${escapeHtml(category.key)}">Category name</label>
                <input
                    id="edit-category-label-${escapeHtml(category.key)}"
                    type="text"
                    name="edit-category-label"
                    value="${escapeAttribute(category.label)}"
                    class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm"
                />
            </div>
            <div class="space-y-1">
                <label class="text-xs text-slate-400" for="edit-category-color-${escapeHtml(category.key)}">Concrete color</label>
                <input
                    id="edit-category-color-${escapeHtml(category.key)}"
                    type="color"
                    name="edit-category-color"
                    value="${category.color}"
                    class="h-10 w-full rounded cursor-pointer bg-transparent border border-slate-600"
                />
            </div>
            <div class="flex gap-2 pt-1">
                <button type="submit" class="bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">Save</button>
                <button type="button" class="btn-cancel-edit-category bg-slate-600 hover:bg-slate-500 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors">Cancel</button>
            </div>
        </form>
    `;
}

function renderAddCategoryForm() {
    const { groups } = getCategories();

    return `
        <form id="add-category-form" class="${isAddCategoryFormVisible ? '' : 'hidden '}space-y-3 bg-slate-700/30 rounded-lg p-3 border border-slate-600">
            <div class="space-y-1">
                <label class="text-xs text-slate-400" for="category-label">Category name</label>
                <input
                    id="category-label"
                    type="text"
                    name="category-label"
                    placeholder="Category name"
                    class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm"
                />
            </div>
            <div class="space-y-1">
                <label class="text-xs text-slate-400" for="parent-group">Parent group</label>
                <select
                    id="parent-group"
                    name="parent-group"
                    class="bg-slate-700 p-2 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none text-sm"
                >
                    <option value="">Select a group</option>
                    ${groups
                        .map(
                            (group) =>
                                `<option value="${escapeHtml(group.key)}">${escapeHtml(group.label)}</option>`
                        )
                        .join('')}
                </select>
            </div>
            <div class="flex gap-2 pt-1">
                <button type="submit" class="bg-teal-500 hover:bg-teal-400 text-white px-3 py-1.5 rounded-lg text-sm transition-colors">Save</button>
                <button type="button" id="cancel-add-category" class="bg-slate-600 hover:bg-slate-500 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition-colors">Cancel</button>
            </div>
        </form>
    `;
}

function renderColorFamilyOptions(selectedFamily) {
    return Object.keys(COLOR_FAMILIES)
        .map((familyName) => {
            const selected = familyName === selectedFamily ? 'selected' : '';
            return `<option value="${familyName}" ${selected}>${titleCase(familyName)}</option>`;
        })
        .join('');
}

function wireSettingsEvents() {
    const toggle = document.getElementById('activities-toggle');
    if (toggle) {
        toggle.onchange = () => {
            const newValue = toggle.checked;
            setActivitiesEnabled(newValue);

            const reloadPrompt = document.getElementById('reload-prompt');
            const message = document.getElementById('reload-prompt-message');
            const taxonomySection = document.getElementById('taxonomy-management-section');

            if (reloadPrompt) {
                reloadPrompt.classList.remove('hidden');
            }
            if (message) {
                message.textContent = newValue
                    ? 'Activities enabled. Category tracking and insights will be available after reload.'
                    : 'Activities disabled. Category and activity features will be hidden after reload.';
            }
            if (taxonomySection) {
                taxonomySection.classList.toggle('hidden', !newValue);
            }
        };
    }

    const reloadButton = document.getElementById('reload-apply-btn');
    if (reloadButton) {
        reloadButton.onclick = () => {
            window.location.reload();
        };
    }

    const closeButton = document.getElementById('close-settings-modal');
    if (closeButton) {
        closeButton.onclick = closeSettingsModal;
    }

    bindGroupEvents();
    bindCategoryEvents();
}

function bindGroupEvents() {
    const addButton = document.getElementById('add-group-btn');
    if (addButton) {
        addButton.onclick = () => {
            isAddGroupFormVisible = !isAddGroupFormVisible;
            editingGroupKey = null;
            refreshSettingsLists();
        };
    }

    const addForm = document.getElementById('add-group-form');
    if (addForm) {
        addForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(addForm);
            const label = formData.get('group-label')?.toString().trim();
            const colorFamily = formData.get('group-family')?.toString() || 'blue';

            if (!label) {
                showToast('Group name is required', { theme: 'rose' });
                return;
            }

            try {
                await applyAndRefresh(async () => {
                    await addGroup({ label, colorFamily });
                    isAddGroupFormVisible = false;
                }, currentRenderOptions.onTaxonomyChanged);
            } catch (error) {
                showToast(error.message || 'Failed to add group', { theme: 'rose' });
            }
        });
    }

    const cancelAddButton = document.getElementById('cancel-add-group');
    if (cancelAddButton) {
        cancelAddButton.onclick = () => {
            isAddGroupFormVisible = false;
            refreshSettingsLists();
        };
    }

    document.querySelectorAll('.btn-edit-group').forEach((button) => {
        button.addEventListener('click', () => {
            editingGroupKey = button.dataset.key || null;
            isAddGroupFormVisible = false;
            refreshSettingsLists();
        });
    });

    document.querySelectorAll('.btn-delete-group').forEach((button) => {
        button.addEventListener('click', async () => {
            const key = button.dataset.key;
            if (!key) {
                return;
            }

            try {
                await applyAndRefresh(
                    () => deleteGroup(key),
                    currentRenderOptions.onTaxonomyChanged
                );
            } catch (error) {
                showToast(error.message || 'Failed to delete group', { theme: 'rose' });
            }
        });
    });

    document.querySelectorAll('.edit-group-form').forEach((form) => {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const key = form.dataset.key;
            const formData = new FormData(form);
            const label = formData.get('edit-group-label')?.toString().trim();
            const colorFamily = formData.get('edit-group-family')?.toString() || 'blue';

            if (!key) {
                return;
            }

            if (!label) {
                showToast('Group name is required', { theme: 'rose' });
                return;
            }

            try {
                await applyAndRefresh(async () => {
                    await updateGroup(key, { label, colorFamily });
                    editingGroupKey = null;
                }, currentRenderOptions.onTaxonomyChanged);
            } catch (error) {
                showToast(error.message || 'Failed to update group', { theme: 'rose' });
            }
        });
    });

    document.querySelectorAll('.btn-cancel-edit-group').forEach((button) => {
        button.addEventListener('click', () => {
            editingGroupKey = null;
            refreshSettingsLists();
        });
    });
}

function bindCategoryEvents() {
    const addButton = document.getElementById('add-category-btn');
    if (addButton) {
        addButton.onclick = () => {
            isAddCategoryFormVisible = !isAddCategoryFormVisible;
            editingCategoryKey = null;
            refreshSettingsLists();
        };
    }

    const addForm = document.getElementById('add-category-form');
    if (addForm) {
        addForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(addForm);
            const label = formData.get('category-label')?.toString().trim();
            const parentGroup = formData.get('parent-group')?.toString().trim();

            if (!label) {
                showToast('Category name is required', { theme: 'rose' });
                return;
            }

            if (!parentGroup) {
                showToast('Parent group is required', { theme: 'rose' });
                return;
            }

            try {
                await applyAndRefresh(async () => {
                    await addCategory({ groupKey: parentGroup, label });
                    isAddCategoryFormVisible = false;
                }, currentRenderOptions.onTaxonomyChanged);
            } catch (error) {
                showToast(error.message || 'Failed to add category', { theme: 'rose' });
            }
        });
    }

    const cancelAddButton = document.getElementById('cancel-add-category');
    if (cancelAddButton) {
        cancelAddButton.onclick = () => {
            isAddCategoryFormVisible = false;
            refreshSettingsLists();
        };
    }

    document.querySelectorAll('.btn-edit-category').forEach((button) => {
        button.addEventListener('click', () => {
            editingCategoryKey = button.dataset.key || null;
            isAddCategoryFormVisible = false;
            refreshSettingsLists();
        });
    });

    document.querySelectorAll('.btn-delete-category').forEach((button) => {
        button.addEventListener('click', async () => {
            const key = button.dataset.key;
            if (!key) {
                return;
            }

            try {
                await applyAndRefresh(
                    () => deleteCategory(key),
                    currentRenderOptions.onTaxonomyChanged
                );
            } catch (error) {
                showToast(error.message || 'Failed to delete category', { theme: 'rose' });
            }
        });
    });

    document.querySelectorAll('.edit-category-form').forEach((form) => {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const key = form.dataset.key;
            const formData = new FormData(form);
            const label = formData.get('edit-category-label')?.toString().trim();
            const color = formData.get('edit-category-color')?.toString();

            if (!key) {
                return;
            }

            if (!label) {
                showToast('Category name is required', { theme: 'rose' });
                return;
            }

            try {
                await applyAndRefresh(async () => {
                    await updateCategory(key, { label, color });
                    editingCategoryKey = null;
                }, currentRenderOptions.onTaxonomyChanged);
            } catch (error) {
                showToast(error.message || 'Failed to update category', { theme: 'rose' });
            }
        });
    });

    document.querySelectorAll('.btn-cancel-edit-category').forEach((button) => {
        button.addEventListener('click', () => {
            editingCategoryKey = null;
            refreshSettingsLists();
        });
    });
}

function refreshSettingsLists() {
    renderSettingsContent(currentRenderOptions);
}

async function applyAndRefresh(asyncOperation, onTaxonomyChanged) {
    await asyncOperation();
    refreshSettingsLists();
    onTaxonomyChanged?.();
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

function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

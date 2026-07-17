const ACTIVE_BUTTON_CLASSES = [
    'bg-slate-700/70',
    'text-violet-200',
    'border',
    'border-violet-400/40'
];
const INACTIVE_BUTTON_CLASSES = ['text-slate-400', 'hover:text-slate-200'];

let activeView = 'tasks';
let renderInsightsCallback = () => {};
let activitiesEnabledCallback = () => false;
let abortController = null;

export function getActiveActivitiesView() {
    return activeView;
}

export function resetActivitiesViewToggle() {
    activeView = 'tasks';
    renderInsightsCallback = () => {};
    activitiesEnabledCallback = () => false;
    abortController?.abort();
    abortController = null;
}

export function setActiveActivitiesView(nextView) {
    activeView = nextView === 'insights' ? 'insights' : 'tasks';
    syncActivitiesViewToggle(activitiesEnabledCallback());

    if (activeView === 'insights') {
        renderInsightsCallback();
    }
}

export function syncActivitiesViewToggle(activitiesEnabled) {
    const viewToggle = document.getElementById('view-toggle');
    const tasksView = document.getElementById('tasks-view');
    const insightsView = document.getElementById('insights-view');
    const tasksButton = document.getElementById('view-toggle-tasks');
    const insightsButton = document.getElementById('view-toggle-insights');
    const clearScheduleButton = document.getElementById('clear-schedule-button');
    const clearOptionsButton = document.getElementById('clear-options-dropdown-trigger-btn');
    const clearTasksDropdown = document.getElementById('clear-tasks-dropdown');

    if (!activitiesEnabled) {
        activeView = 'tasks';
    }

    viewToggle?.classList.toggle('hidden', !activitiesEnabled);

    const showTasks = activeView === 'tasks';
    const showInsights = activitiesEnabled && activeView === 'insights';

    if (tasksView) {
        tasksView.classList.toggle('view-panel--visible', showTasks);
        tasksView.classList.toggle('view-panel--hidden', !showTasks);
        tasksView.classList.remove('hidden');
    }
    if (insightsView) {
        insightsView.classList.toggle('view-panel--visible', showInsights);
        insightsView.classList.toggle('view-panel--hidden', !showInsights);
        insightsView.classList.remove('hidden');
    }

    setButtonState(tasksButton, activeView === 'tasks');
    setButtonState(insightsButton, activeView === 'insights');

    const hideTaskActions = activitiesEnabled && activeView === 'insights';
    clearScheduleButton?.classList.toggle('hidden', hideTaskActions);
    clearOptionsButton?.classList.toggle('hidden', hideTaskActions);

    if (hideTaskActions) {
        clearTasksDropdown?.classList.add('hidden');
        clearOptionsButton?.setAttribute('aria-expanded', 'false');
    } else if (clearTasksDropdown?.style.display === 'none') {
        clearTasksDropdown.style.display = '';
    }
}

export function renderActiveInsightsView() {
    if (activitiesEnabledCallback() && activeView === 'insights') {
        renderInsightsCallback();
    }
}

export function initializeActivitiesViewToggle({
    isActivitiesEnabled,
    getActivitiesEnabled,
    renderInsights = () => {}
} = {}) {
    resetActivitiesViewToggle();
    activitiesEnabledCallback = isActivitiesEnabled || getActivitiesEnabled || (() => false);
    renderInsightsCallback = renderInsights;
    abortController = new AbortController();
    const { signal } = abortController;

    document
        .getElementById('view-toggle-tasks')
        ?.addEventListener('click', () => setActiveActivitiesView('tasks'), { signal });
    document
        .getElementById('view-toggle-insights')
        ?.addEventListener('click', () => setActiveActivitiesView('insights'), { signal });
    document.addEventListener(
        'keydown',
        (event) => {
            if (
                event.key !== 'Tab' ||
                event.defaultPrevented ||
                isEditableOrInteractiveTarget(event.target) ||
                !activitiesEnabledCallback()
            ) {
                return;
            }

            event.preventDefault();
            setActiveActivitiesView(activeView === 'tasks' ? 'insights' : 'tasks');
        },
        { signal }
    );

    syncActivitiesViewToggle(activitiesEnabledCallback());
}

function setButtonState(button, isActive) {
    if (!(button instanceof HTMLElement)) {
        return;
    }

    button.classList.toggle('active', isActive);
    button.classList.remove(...(isActive ? INACTIVE_BUTTON_CLASSES : ACTIVE_BUTTON_CLASSES));
    button.classList.add(...(isActive ? ACTIVE_BUTTON_CLASSES : INACTIVE_BUTTON_CLASSES));
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
}

function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') !== null
    );
}

function isEditableOrInteractiveTarget(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return isEditableTarget(target) || target.closest(getInteractiveSelector()) !== null;
}

function getInteractiveSelector() {
    return [
        'a[href]',
        'area[href]',
        'button',
        'input',
        'select',
        'textarea',
        'summary',
        '[tabindex]:not([tabindex="-1"])',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[role="tab"]'
    ].join(',');
}

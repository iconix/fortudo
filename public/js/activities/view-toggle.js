const ACTIVE_BUTTON_CLASSES = ['bg-teal-500/20', 'text-teal-200', 'border', 'border-teal-400/40'];
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
    tasksView?.classList.toggle('hidden', activeView !== 'tasks');
    insightsView?.classList.toggle('hidden', !activitiesEnabled || activeView !== 'insights');
    setButtonState(tasksButton, activeView === 'tasks');
    setButtonState(insightsButton, activeView === 'insights');

    const hideTaskActions = activitiesEnabled && activeView === 'insights';
    clearScheduleButton?.classList.toggle('hidden', hideTaskActions);
    clearOptionsButton?.classList.toggle('hidden', hideTaskActions);

    if (hideTaskActions) {
        clearTasksDropdown?.classList.add('hidden');
        if (clearTasksDropdown) {
            clearTasksDropdown.style.display = 'none';
        }
        clearOptionsButton?.setAttribute('aria-expanded', 'false');
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
                isEditableTarget(event.target) ||
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

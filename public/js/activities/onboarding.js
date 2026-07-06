import {
    isOnboardingDismissed,
    isOnboardingSnoozed,
    setOnboardingDismissed,
    snoozeOnboarding
} from '../settings-manager.js';

const ONBOARDING_ROOT_ID = 'activity-onboarding';
const TARGET_CLASS = 'activity-onboarding-target';
const HIGHLIGHT_CLASS = 'activity-onboarding-highlight';

const STEPS = [
    {
        selector: '#activity-toggle-option',
        prepare: selectActivityMode,
        title: 'Activity mode',
        body: 'Use this form mode to log what actually happened without changing your plan.'
    },
    {
        selector: '#start-timer-btn',
        prepare: selectActivityMode,
        title: 'Live timer',
        body: 'Start a timer from an activity or an unscheduled task when you begin focused work.'
    },
    {
        selector: '#view-toggle-insights',
        prepare: selectInsightsView,
        title: 'Insights',
        body: 'Compare planned blocks with actual activity and review each selected day.'
    }
];

let currentTarget = null;

function removeExistingOnboarding() {
    document.getElementById(ONBOARDING_ROOT_ID)?.remove();
    currentTarget?.classList.remove(TARGET_CLASS, HIGHLIGHT_CLASS);
    currentTarget = null;
}

function getStepTarget(step) {
    const target = document.querySelector(step.selector);
    return target instanceof HTMLElement ? target : null;
}

function selectActivityMode() {
    const activityRadio = document.getElementById('activity');
    if (!(activityRadio instanceof HTMLInputElement)) {
        return;
    }

    activityRadio.checked = true;
    activityRadio.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectInsightsView() {
    const insightsButton = document.getElementById('view-toggle-insights');
    if (!(insightsButton instanceof HTMLElement)) {
        return;
    }

    insightsButton.click();
}

async function dismissOnboarding() {
    removeExistingOnboarding();
    await setOnboardingDismissed(true);
}

async function remindLater() {
    removeExistingOnboarding();
    await snoozeOnboarding();
}

function renderStep(stepIndex, { signal }) {
    removeExistingOnboarding();

    const step = STEPS[stepIndex];
    step.prepare?.();
    const target = getStepTarget(step);
    if (!target) {
        return;
    }

    currentTarget = target;
    target.classList.add(TARGET_CLASS, HIGHLIGHT_CLASS);

    const root = document.createElement('div');
    root.id = ONBOARDING_ROOT_ID;
    root.dataset.activityOnboarding = 'true';
    root.className =
        'fixed left-1/2 bottom-5 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-sky-400/40 bg-slate-900 p-4 text-left shadow-2xl shadow-sky-950/50 sm:right-5 sm:left-auto sm:w-96 sm:translate-x-0';

    const isLastStep = stepIndex === STEPS.length - 1;
    root.innerHTML = `
        <p class="text-xs font-semibold uppercase tracking-wide text-sky-300">${stepIndex + 1} of ${STEPS.length}</p>
        <h3 class="mt-1 text-base font-semibold text-slate-100">${step.title}</h3>
        <p class="mt-2 text-sm leading-6 text-slate-300">${step.body}</p>
        <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button type="button" data-activity-onboarding-skip class="rounded-md px-3 py-2 text-sm text-slate-400 hover:text-slate-200">Skip</button>
            <button type="button" data-activity-onboarding-snooze class="rounded-md px-3 py-2 text-sm text-slate-400 hover:text-slate-200">Remind me later</button>
            <button type="button" data-activity-onboarding-next class="rounded-md bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400">${isLastStep ? 'Done' : 'Next'}</button>
        </div>
    `;

    document.body.appendChild(root);

    root.querySelector('[data-activity-onboarding-skip]')?.addEventListener(
        'click',
        () => {
            void dismissOnboarding();
        },
        { signal }
    );
    root.querySelector('[data-activity-onboarding-snooze]')?.addEventListener(
        'click',
        () => {
            void remindLater();
        },
        { signal }
    );
    root.querySelector('[data-activity-onboarding-next]')?.addEventListener(
        'click',
        () => {
            if (isLastStep) {
                void dismissOnboarding();
                return;
            }

            renderStep(stepIndex + 1, { signal });
        },
        { signal }
    );
}

/**
 * Shows the one-time Activities onboarding walkthrough for this room.
 * @param {{ activitiesEnabled?: boolean, signal?: AbortSignal }} [options]
 */
export async function maybeShowOnboarding({ activitiesEnabled = false, signal } = {}) {
    if (!activitiesEnabled || isOnboardingDismissed() || isOnboardingSnoozed() || signal?.aborted) {
        return;
    }

    signal?.addEventListener('abort', removeExistingOnboarding, { once: true });
    renderStep(0, { signal });
}

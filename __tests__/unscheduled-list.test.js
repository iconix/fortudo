/**
 * @jest-environment jsdom
 */

import {
    mountUnscheduledList,
    renderUnscheduledList,
    destroyUnscheduledList
} from '../public/js/tasks/unscheduled-list.js';

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    getSelectableCategoryOptions: jest.fn(() => []),
    renderCategoryBadge: jest.fn(() => ''),
    resolveCategoryKey: jest.fn(() => null)
}));

const MODE_KEY = 'fortudo-unscheduled-sort-mode';

function installDom() {
    document.body.innerHTML = `
        <div id="unscheduled-sort-control" role="group" aria-label="Unscheduled order">
            <span>Sort:</span>
            <button type="button" data-unscheduled-mode="manual" aria-pressed="false">
                My order
            </button>
            <button type="button" data-unscheduled-mode="priority" aria-pressed="true">
                Priority
            </button>
        </div>
        <div id="unscheduled-order-status" aria-live="polite"></div>
        <div id="unscheduled-task-list"></div>
    `;
}

function task(id, overrides = {}) {
    return {
        id,
        type: 'unscheduled',
        description: id,
        status: 'incomplete',
        priority: 'medium',
        estDuration: 30,
        ...overrides
    };
}

function view(tasks = [task('a')]) {
    return {
        tasks,
        movementByTaskId: new Map(
            tasks.map((item, index) => [
                item.id,
                {
                    position: index + 1,
                    total: tasks.length,
                    canMoveUp: index > 0,
                    canMoveDown: index < tasks.length - 1
                }
            ])
        )
    };
}

function createOptions(overrides = {}) {
    const actions = {
        schedule: jest.fn(),
        startTimer: jest.fn(),
        edit: jest.fn(),
        delete: jest.fn(),
        confirmSchedule: jest.fn(),
        saveEdit: jest.fn(),
        cancelEdit: jest.fn(),
        toggleComplete: jest.fn()
    };
    return {
        readView: jest.fn(() => view()),
        moveTask: jest.fn(),
        actions,
        getRunningActivity: jest.fn(() => null),
        showError: jest.fn(),
        ...overrides
    };
}

function renderWith(options = createOptions()) {
    mountUnscheduledList(options);
    renderUnscheduledList();
    return options;
}

function useManualMode() {
    localStorage.setItem(MODE_KEY, 'manual');
}

function taskOrder() {
    return [...document.querySelectorAll('#unscheduled-task-list .task-card')].map(
        (card) => card.dataset.taskId
    );
}

function pointer(type, target, values = {}) {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: values.clientX ?? 0,
        clientY: values.clientY ?? 0,
        button: values.button ?? 0
    });
    Object.defineProperty(event, 'pointerId', { value: values.pointerId ?? 1 });
    Object.defineProperty(event, 'isPrimary', { value: values.isPrimary ?? true });
    target.dispatchEvent(event);
    return event;
}

function setCardRects(cards, height = 40, gap = 10) {
    cards.forEach((card, index) => {
        const top = index * (height + gap);
        card.getBoundingClientRect = () => ({
            top,
            bottom: top + height,
            height,
            left: 0,
            right: 300,
            width: 300
        });
    });
}

function cardById(taskId) {
    return [...document.querySelectorAll('#unscheduled-task-list .task-card')].find(
        (card) => card.dataset.taskId === taskId
    );
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}

describe('Unscheduled list UI interface', () => {
    beforeEach(() => {
        destroyUnscheduledList();
        installDom();
        localStorage.clear();
        window.scrollBy = jest.fn();
    });

    afterEach(() => destroyUnscheduledList());

    test('render before mount and mounting without required roots are safe no-ops', () => {
        expect(() => renderUnscheduledList()).not.toThrow();
        document.body.innerHTML = '<div id="unrelated-root"></div>';
        const options = createOptions();

        expect(() => mountUnscheduledList(options)).not.toThrow();
        expect(() => renderUnscheduledList()).not.toThrow();
        expect(options.readView).not.toHaveBeenCalled();
    });

    test.each([
        ['a missing preference', null],
        ['an invalid preference', 'invalid']
    ])('defaults %s to Priority', (_description, savedMode) => {
        if (savedMode) localStorage.setItem(MODE_KEY, savedMode);
        const options = renderWith();

        expect(options.readView).toHaveBeenCalledWith('priority');
        expect(
            document
                .querySelector('[data-unscheduled-mode="priority"]')
                .getAttribute('aria-pressed')
        ).toBe('true');
        expect(
            document.querySelector('[data-unscheduled-mode="manual"]').getAttribute('aria-pressed')
        ).toBe('false');
    });

    test('defaults storage read failures to Priority', () => {
        const storage = {
            getItem: jest.fn(() => {
                throw new Error('Storage unavailable');
            }),
            setItem: jest.fn()
        };
        const options = renderWith(createOptions({ storage }));

        expect(options.readView).toHaveBeenCalledWith('priority');
    });

    test('guards access to the default localStorage property', () => {
        const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('Storage access denied');
            }
        });
        const options = createOptions();

        try {
            expect(() => mountUnscheduledList(options)).not.toThrow();
            expect(() => renderUnscheduledList()).not.toThrow();
            expect(options.readView).toHaveBeenCalledWith('priority');
        } finally {
            Object.defineProperty(window, 'localStorage', localStorageDescriptor);
        }
    });

    test('restores a saved My order preference on mount', () => {
        localStorage.setItem(MODE_KEY, 'manual');

        const options = renderWith();

        expect(options.readView).toHaveBeenCalledWith('manual');
        expect(
            document.querySelector('[data-unscheduled-mode="manual"]').getAttribute('aria-pressed')
        ).toBe('true');
        expect(
            document
                .querySelector('[data-unscheduled-mode="priority"]')
                .getAttribute('aria-pressed')
        ).toBe('false');
    });

    test('mode selection persists locally and changes the rendered projection', () => {
        const options = createOptions();
        mountUnscheduledList(options);

        document.querySelector('[data-unscheduled-mode="manual"]').click();

        expect(localStorage.getItem(MODE_KEY)).toBe('manual');
        expect(options.readView).toHaveBeenLastCalledWith('manual');
        expect(
            document.querySelector('[data-unscheduled-mode="manual"]').getAttribute('aria-pressed')
        ).toBe('true');
    });

    test('keeps the selected mode for the session when storage writes fail', () => {
        const storage = {
            getItem: jest.fn(() => 'priority'),
            setItem: jest.fn(() => {
                throw new Error('Storage full');
            })
        };
        const options = createOptions({ storage });
        mountUnscheduledList(options);

        expect(() =>
            document.querySelector('[data-unscheduled-mode="manual"]').click()
        ).not.toThrow();
        expect(options.readView).toHaveBeenLastCalledWith('manual');
    });

    test('routes existing card and inline actions through the named-actions adapter', () => {
        const { actions } = renderWith();

        document.querySelector('.btn-start-unscheduled-timer').click();
        document.querySelector('.btn-schedule-task').click();
        document.querySelector('.btn-edit-unscheduled').click();
        document.querySelector('.btn-delete-unscheduled').click();
        document.querySelector('.task-checkbox-unscheduled').click();
        document.querySelector('.btn-save-inline-edit').click();
        document.querySelector('.btn-cancel-inline-edit').click();

        expect(actions.startTimer).toHaveBeenCalledWith('a');
        expect(actions.schedule).toHaveBeenCalledWith('a');
        expect(actions.edit).toHaveBeenCalledWith('a');
        expect(actions.delete).toHaveBeenCalledWith('a');
        expect(actions.toggleComplete).toHaveBeenCalledWith('a');
        expect(actions.saveEdit).toHaveBeenCalledWith('a');
        expect(actions.cancelEdit).toHaveBeenCalledWith('a');
    });

    test('does not route disabled task actions', () => {
        const options = createOptions({
            readView: jest.fn(() => view([task('done', { status: 'completed' })]))
        });
        renderWith(options);

        document
            .querySelector('.btn-start-unscheduled-timer i')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document
            .querySelector('.btn-schedule-task i')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(options.actions.startTimer).not.toHaveBeenCalled();
        expect(options.actions.schedule).not.toHaveBeenCalled();
    });

    test('toggles menus with the expected classes and restores trigger focus on Escape', () => {
        renderWith();
        const trigger = document.querySelector('.btn-unscheduled-task-actions-menu');
        const menu = document.querySelector('.unscheduled-task-actions-menu');

        trigger.click();
        expect(menu.hidden).toBe(false);
        expect(menu.classList).toContain('action-menu-content--open');
        expect(menu.classList).not.toContain('action-menu-content--closed');
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        menu.querySelector('.btn-edit-unscheduled').focus();
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(menu.hidden).toBe(true);
        expect(menu.classList).toContain('action-menu-content--closed');
        expect(menu.classList).not.toContain('action-menu-content--open');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);
    });

    test('an outside click closes an open action menu', () => {
        renderWith();
        const trigger = document.querySelector('.btn-unscheduled-task-actions-menu');
        const menu = document.querySelector('.unscheduled-task-actions-menu');
        trigger.click();

        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(menu.hidden).toBe(true);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    test('inline Enter and form submission route saves without browser submission', () => {
        const { actions } = renderWith();
        const form = document.querySelector('.inline-edit-unscheduled-form form');
        const input = form.querySelector('[name="inline-edit-description"]');
        const enter = new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true
        });

        input.dispatchEvent(enter);
        const submit = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submit);

        expect(enter.defaultPrevented).toBe(true);
        expect(submit.defaultPrevented).toBe(true);
        expect(actions.saveEdit).toHaveBeenCalledTimes(2);
        expect(actions.saveEdit).toHaveBeenNthCalledWith(1, 'a');
        expect(actions.saveEdit).toHaveBeenNthCalledWith(2, 'a');
    });

    test('renders the empty state through the list seam', () => {
        renderWith(createOptions({ readView: jest.fn(() => view([])) }));

        expect(document.getElementById('unscheduled-task-list').textContent).toContain(
            'No unscheduled tasks yet'
        );
    });

    test('passes the current running activity to card rendering', () => {
        const runningActivity = { sourceTaskId: 'a' };
        renderWith(createOptions({ getRunningActivity: () => runningActivity }));

        const card = document.querySelector('[data-task-id="a"]');
        expect(card.classList).toContain('opacity-70');
        expect(card.querySelector('.unscheduled-in-progress-badge').textContent).toContain(
            'In progress'
        );
    });

    test('renders move handles and menu commands only in My order', () => {
        const options = renderWith(
            createOptions({ readView: jest.fn(() => view([task('a'), task('b')])) })
        );

        expect(document.querySelectorAll('.unscheduled-drag-handle')).toHaveLength(0);
        expect(document.querySelectorAll('[data-move-kind]')).toHaveLength(0);

        document.querySelector('[data-unscheduled-mode="manual"]').click();

        expect(options.readView).toHaveBeenLastCalledWith('manual');
        expect(document.querySelectorAll('.unscheduled-drag-handle')).toHaveLength(2);
        expect(document.querySelectorAll('[data-move-kind]')).toHaveLength(8);
        const menu = document.querySelector('[data-task-id="a"] .unscheduled-task-actions-menu');
        expect(menu.getAttribute('role')).toBe('menu');
        expect(menu.classList).toContain('action-menu-content');
        menu.querySelectorAll('[data-move-kind]').forEach((button) => {
            expect(button.getAttribute('role')).toBe('menuitem');
            expect(button.classList).toContain('unscheduled-task-actions-menu-item');
        });
    });

    test('escapes the description in handle markup and labels it with the original text', () => {
        useManualMode();
        const description = 'Review <draft> & "approve"';
        renderWith(
            createOptions({
                readView: jest.fn(() => view([task('safe-id', { description })]))
            })
        );

        const handle = document.querySelector('.unscheduled-drag-handle');
        expect(handle.getAttribute('aria-label')).toBe(`Move ${description}`);
        expect(handle.querySelectorAll('script, img')).toHaveLength(0);
    });

    test('disables move commands accurately at sequence boundaries', () => {
        useManualMode();
        renderWith(
            createOptions({
                readView: jest.fn(() => view([task('first'), task('middle'), task('last')]))
            })
        );

        const disabledKinds = (id) =>
            [...document.querySelectorAll(`[data-task-id="${id}"] [data-move-kind]`)]
                .filter((button) => button.disabled)
                .map((button) => button.dataset.moveKind);
        expect(disabledKinds('first')).toEqual(['up', 'top']);
        expect(disabledKinds('middle')).toEqual([]);
        expect(disabledKinds('last')).toEqual(['down', 'bottom']);
    });

    test('keeps completed tasks visibly checked and movable in My order', () => {
        useManualMode();
        renderWith(
            createOptions({
                readView: jest.fn(() =>
                    view([task('first'), task('done', { status: 'completed' }), task('last')])
                )
            })
        );

        const completedCard = document.querySelector('[data-task-id="done"]');
        expect(completedCard.querySelector('.task-checkbox-unscheduled i').className).toContain(
            'fa-check-square'
        );
        expect(completedCard.querySelector('.unscheduled-drag-handle').disabled).toBe(false);
        completedCard.querySelectorAll('[data-move-kind]').forEach((button) => {
            expect(button.disabled).toBe(false);
        });
    });

    test.each([
        ['inline editing', task('blocked', { isEditingInline: true }), null],
        ['a running source', task('blocked'), { sourceTaskId: 'blocked' }]
    ])('disables movement while task is %s', (_label, blockedTask, runningActivity) => {
        useManualMode();
        renderWith(
            createOptions({
                readView: jest.fn(() => view([task('first'), blockedTask, task('last')])),
                getRunningActivity: () => runningActivity
            })
        );

        const card = document.querySelector('[data-task-id="blocked"]');
        expect(card.querySelector('.unscheduled-drag-handle').disabled).toBe(true);
        card.querySelectorAll('[data-move-kind]').forEach((button) => {
            expect(button.disabled).toBe(true);
        });
    });

    test.each([
        ['movement metadata is missing', new Map()],
        [
            'the task has no available movement',
            new Map([
                [
                    'only',
                    {
                        position: 1,
                        total: 1,
                        canMoveUp: false,
                        canMoveDown: false
                    }
                ]
            ])
        ]
    ])('disables the handle when %s', (_label, movementByTaskId) => {
        useManualMode();
        renderWith(
            createOptions({
                readView: jest.fn(() => ({
                    tasks: [task('only')],
                    movementByTaskId
                }))
            })
        );

        const card = document.querySelector('[data-task-id="only"]');
        expect(card.querySelector('.unscheduled-drag-handle').disabled).toBe(true);
        card.querySelectorAll('[data-move-kind]').forEach((button) => {
            expect(button.disabled).toBe(true);
        });
    });

    test('activating an enabled handle opens its menu and focuses the first move command', () => {
        useManualMode();
        const options = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')]))
        });
        renderWith(options);
        const card = document.querySelector('[data-task-id="moving"]');
        const handle = card.querySelector('.unscheduled-drag-handle');
        const menu = card.querySelector('.unscheduled-task-actions-menu');
        const firstMove = card.querySelector('[data-move-kind="up"]');
        const actionTrigger = card.querySelector('.btn-unscheduled-task-actions-menu');

        expect(handle.tagName).toBe('BUTTON');
        expect(handle.type).toBe('button');
        expect(handle.getAttribute('aria-haspopup')).toBe('menu');
        expect(handle.getAttribute('aria-expanded')).toBe('false');
        handle.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })
        );

        expect(menu.hidden).toBe(false);
        expect(menu.classList).toContain('action-menu-content--open');
        expect(handle.getAttribute('aria-expanded')).toBe('true');
        expect(actionTrigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(firstMove);
        expect(options.moveTask).not.toHaveBeenCalled();

        firstMove.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(menu.hidden).toBe(true);
        expect(handle.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(handle);
    });

    test.each(['up', 'down', 'top', 'bottom'])(
        'routes the %s command to the matching sequence destination',
        (kind) => {
            useManualMode();
            const options = createOptions({
                readView: jest.fn(() => view([task('first'), task('moving'), task('last')])),
                moveTask: jest.fn(() => ({ success: true, changed: false }))
            });
            renderWith(options);

            document.querySelector(`[data-task-id="moving"] [data-move-kind="${kind}"]`).click();

            expect(options.moveTask).toHaveBeenCalledWith('moving', { kind });
        }
    );

    test('renders and announces an accepted optimistic move before settlement and restores focus', async () => {
        useManualMode();
        const settlement = deferred();
        const hostileId = 'hostile"]';
        let tasks = [task('ordinary'), task(hostileId)];
        const options = createOptions({
            readView: jest.fn(() => view(tasks)),
            moveTask: jest.fn((taskId, destination) => {
                expect(taskId).toBe(hostileId);
                expect(destination).toEqual({ kind: 'top' });
                tasks = [tasks[1], tasks[0]];
                return {
                    success: true,
                    changed: true,
                    taskId,
                    position: 1,
                    total: 2,
                    settled: settlement.promise
                };
            })
        });
        renderWith(options);

        cardById(hostileId).querySelector('[data-move-kind="top"]').click();

        expect(taskOrder()).toEqual([hostileId, 'ordinary']);
        expect(document.getElementById('unscheduled-order-status').textContent).toBe('');
        await Promise.resolve();
        expect(document.getElementById('unscheduled-order-status').textContent).toBe(
            `Moved ${hostileId} to position 1 of 2.`
        );
        expect(document.activeElement).toBe(
            cardById(hostileId).querySelector('.btn-unscheduled-task-actions-menu')
        );
        expect(options.showError).not.toHaveBeenCalled();
        settlement.resolve({ success: true });
    });

    test('clears and reannounces identical accepted move feedback', async () => {
        useManualMode();
        const message = 'Moved moving to position 1 of 3.';
        const options = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')])),
            moveTask: jest.fn(() => ({
                success: true,
                changed: true,
                taskId: 'moving',
                position: 1,
                total: 3,
                settled: Promise.resolve({ success: true })
            }))
        });
        renderWith(options);

        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();
        await Promise.resolve();
        expect(document.getElementById('unscheduled-order-status').textContent).toBe(message);

        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();
        expect(document.getElementById('unscheduled-order-status').textContent).toBe('');
        await Promise.resolve();

        expect(document.getElementById('unscheduled-order-status').textContent).toBe(message);
        expect(options.moveTask).toHaveBeenCalledTimes(2);
    });

    test('does not deliver a stale optimistic announcement after remount', async () => {
        useManualMode();
        const first = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')])),
            moveTask: jest.fn(() => ({
                success: true,
                changed: true,
                taskId: 'moving',
                position: 1,
                total: 3,
                settled: Promise.resolve({ success: true })
            }))
        });
        renderWith(first);
        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();

        const second = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')]))
        });
        mountUnscheduledList(second);
        renderUnscheduledList();
        await Promise.resolve();

        expect(document.getElementById('unscheduled-order-status').textContent).toBe('');
    });

    test.each([
        ['a no-op', { success: true, changed: false }],
        ['an unavailable move', { success: false, code: 'unavailable' }]
    ])('does not rerender or announce %s', (_label, operation) => {
        useManualMode();
        const readView = jest.fn(() => view([task('first'), task('moving'), task('last')]));
        const options = createOptions({
            readView,
            moveTask: jest.fn(() => operation)
        });
        renderWith(options);

        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();

        expect(readView).toHaveBeenCalledTimes(1);
        expect(document.getElementById('unscheduled-order-status').textContent).toBe('');
        expect(options.showError).not.toHaveBeenCalled();
    });

    test.each([
        [
            'a restored snapshot',
            { success: false, rolledBack: true, reloaded: false },
            'Order could not be saved. Your previous order was restored.'
        ],
        [
            'a durable reload',
            { success: false, rolledBack: false, reloaded: true },
            'Order could not be saved. Fortudo reloaded the stored order.'
        ],
        [
            'a failed durable recovery',
            {
                success: false,
                rolledBack: true,
                reloaded: false,
                recoveryFailed: true
            },
            'Order could not be recovered from storage. Reload Fortudo before making more changes.'
        ]
    ])('rerenders after settlement reports %s', async (_label, settlementResult, message) => {
        useManualMode();
        const settlement = deferred();
        const settledTasks = [task('first'), task('last'), task('moving')];
        let tasks = [task('first'), task('moving'), task('last')];
        const readView = jest.fn(() => view(tasks));
        const options = createOptions({
            readView,
            moveTask: jest.fn(() => {
                tasks = [tasks[1], tasks[0], tasks[2]];
                return {
                    success: true,
                    changed: true,
                    taskId: 'moving',
                    position: 1,
                    total: 3,
                    settled: settlement.promise
                };
            })
        });
        renderWith(options);
        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();
        const optimisticTrigger = document.activeElement;
        expect(taskOrder()).toEqual(['moving', 'first', 'last']);
        expect(readView).toHaveBeenCalledTimes(2);

        tasks = settledTasks;
        settlement.resolve(settlementResult);
        await settlement.promise;
        await Promise.resolve();

        expect(readView).toHaveBeenCalledTimes(3);
        expect(taskOrder()).toEqual(['first', 'last', 'moving']);
        const settledTrigger = document.querySelector(
            '[data-task-id="moving"] .btn-unscheduled-task-actions-menu'
        );
        expect(settledTrigger).not.toBe(optimisticTrigger);
        expect(document.activeElement).toBe(settledTrigger);
        expect(document.getElementById('unscheduled-order-status').textContent).toBe(message);
        expect(options.showError).toHaveBeenCalledWith(message, { theme: 'rose' });
    });

    test('focuses the active mode control when failed settlement removes the moved task', async () => {
        useManualMode();
        const settlement = deferred();
        let tasks = [task('first'), task('moving'), task('last')];
        const options = createOptions({
            readView: jest.fn(() => view(tasks)),
            moveTask: jest.fn(() => ({
                success: true,
                changed: true,
                taskId: 'moving',
                position: 1,
                total: 3,
                settled: settlement.promise
            }))
        });
        renderWith(options);
        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();

        tasks = [task('first'), task('last')];
        settlement.resolve({ success: false, rolledBack: false, reloaded: true });
        await settlement.promise;
        await Promise.resolve();

        expect(document.activeElement).toBe(
            document.querySelector('[data-unscheduled-mode="manual"]')
        );
        expect(document.getElementById('unscheduled-order-status').textContent).toBe(
            'Order could not be saved. Fortudo reloaded the stored order.'
        );
    });

    test('focuses the active mode when the recovered moved task action becomes disabled', async () => {
        useManualMode();
        const settlement = deferred();
        let runningActivity = null;
        const options = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')])),
            getRunningActivity: () => runningActivity,
            moveTask: jest.fn(() => ({
                success: true,
                changed: true,
                taskId: 'moving',
                position: 1,
                total: 3,
                settled: settlement.promise
            }))
        });
        renderWith(options);
        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();

        runningActivity = { sourceTaskId: 'moving' };
        settlement.resolve({ success: false, rolledBack: true, reloaded: false });
        await settlement.promise;
        await Promise.resolve();

        expect(
            document.querySelector('[data-task-id="moving"] .btn-unscheduled-task-actions-menu')
                .disabled
        ).toBe(true);
        expect(document.activeElement).toBe(
            document.querySelector('[data-unscheduled-mode="manual"]')
        );
        expect(document.getElementById('unscheduled-order-status').textContent).toBe(
            'Order could not be saved. Your previous order was restored.'
        );
        expect(options.showError).toHaveBeenCalledWith(
            'Order could not be saved. Your previous order was restored.',
            { theme: 'rose' }
        );
    });

    test('successful settlement does not rerender again or show an error', async () => {
        useManualMode();
        const readView = jest.fn(() => view([task('first'), task('moving'), task('last')]));
        const options = createOptions({
            readView,
            moveTask: jest.fn(() => ({
                success: true,
                changed: true,
                taskId: 'moving',
                position: 1,
                total: 3,
                settled: Promise.resolve({ success: true })
            }))
        });
        renderWith(options);
        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(readView).toHaveBeenCalledTimes(2);
        expect(options.showError).not.toHaveBeenCalled();
    });

    test('unexpected settlement rejection is handled as the strongest recovery failure', async () => {
        useManualMode();
        const settlement = deferred();
        const options = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')])),
            moveTask: jest.fn(() => ({
                success: true,
                changed: true,
                taskId: 'moving',
                position: 1,
                total: 3,
                settled: settlement.promise
            }))
        });
        renderWith(options);
        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();

        settlement.reject(new Error('adapter contract violated'));
        await expect(settlement.promise).rejects.toThrow('adapter contract violated');
        await Promise.resolve();

        expect(options.showError).toHaveBeenCalledWith(
            'Order could not be recovered from storage. Reload Fortudo before making more changes.',
            { theme: 'rose' }
        );
    });

    test('dragging by an enabled handle sends an identity-safe before destination', async () => {
        useManualMode();
        const targetId = 'target"]';
        const sourceId = 'source"]';
        let tasks = [task(targetId), task('middle'), task(sourceId)];
        const settlement = deferred();
        const options = createOptions({
            readView: jest.fn(() => view(tasks)),
            moveTask: jest.fn((taskId, destination) => {
                expect(taskId).toBe(sourceId);
                expect(destination).toEqual({ kind: 'before', taskId: targetId });
                tasks = [tasks[2], tasks[0], tasks[1]];
                return {
                    success: true,
                    changed: true,
                    taskId,
                    position: 1,
                    total: 3,
                    settled: settlement.promise
                };
            })
        });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        const cards = [...root.querySelectorAll('.task-card')];
        setCardRects(cards);
        const handle = cardById(sourceId).querySelector('.unscheduled-drag-handle');
        handle.setPointerCapture = jest.fn();
        handle.releasePointerCapture = jest.fn();
        const scrollBy = jest.spyOn(window, 'scrollBy').mockImplementation(() => {});

        pointer('pointerdown', handle, { pointerId: 7, clientX: 10, clientY: 110 });
        expect(handle.setPointerCapture).toHaveBeenCalledWith(7);
        pointer('pointermove', root, { pointerId: 7, clientX: 10, clientY: 5 });

        const marker = root.querySelector('.unscheduled-drop-marker');
        expect(marker).not.toBeNull();
        expect(marker.nextElementSibling.dataset.taskId).toBe(targetId);
        expect(cardById(sourceId).classList).toContain('unscheduled-task--dragging');
        expect(scrollBy).toHaveBeenCalledWith({ top: -24, behavior: 'auto' });

        pointer('pointerup', root, { pointerId: 7, clientX: 10, clientY: 5 });

        expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);
        expect(options.moveTask).toHaveBeenCalledTimes(1);
        expect(taskOrder()).toEqual([sourceId, targetId, 'middle']);
        expect(document.querySelector('.unscheduled-drop-marker')).toBeNull();
        expect(document.activeElement).toBe(
            cardById(sourceId).querySelector('.unscheduled-drag-handle')
        );
        await Promise.resolve();
        expect(document.getElementById('unscheduled-order-status').textContent).toBe(
            `Moved ${sourceId} to position 1 of 3.`
        );

        settlement.resolve({ success: true });
        scrollBy.mockRestore();
    });

    test('auto-scrolls at both viewport edges while dragging', () => {
        useManualMode();
        const options = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')])),
            moveTask: jest.fn(() => ({ success: true, changed: false }))
        });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        const cards = [...root.querySelectorAll('.task-card')];
        setCardRects(cards);
        const handle = cardById('moving').querySelector('.unscheduled-drag-handle');
        const scrollBy = jest.spyOn(window, 'scrollBy').mockImplementation(() => {});

        pointer('pointerdown', handle, { pointerId: 8, clientY: 60 });
        pointer('pointermove', root, { pointerId: 8, clientY: 5 });
        pointer('pointermove', root, { pointerId: 8, clientY: window.innerHeight - 5 });
        pointer('pointerup', root, { pointerId: 8, clientY: window.innerHeight - 5 });

        expect(scrollBy).toHaveBeenCalledWith({ top: -24, behavior: 'auto' });
        expect(scrollBy).toHaveBeenCalledWith({ top: 24, behavior: 'auto' });
        scrollBy.mockRestore();
    });

    test('does not initiate a drag from the card or a disabled handle', () => {
        useManualMode();
        const options = createOptions({
            readView: jest.fn(() => view([task('only')]))
        });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        const card = cardById('only');
        const handle = card.querySelector('.unscheduled-drag-handle');
        handle.setPointerCapture = jest.fn();

        pointer('pointerdown', card, { pointerId: 2, clientY: 10 });
        pointer('pointermove', root, { pointerId: 2, clientY: 50 });
        pointer('pointerup', root, { pointerId: 2, clientY: 50 });
        pointer('pointerdown', handle, { pointerId: 3, clientY: 10 });

        expect(handle.disabled).toBe(true);
        expect(handle.setPointerCapture).not.toHaveBeenCalled();
        expect(card.classList).not.toContain('unscheduled-task--dragging');
        expect(document.querySelector('.unscheduled-drop-marker')).toBeNull();
        expect(options.moveTask).not.toHaveBeenCalled();
    });

    test.each([
        ['a secondary pointer button', { button: 2, isPrimary: true }],
        ['a non-primary pointer', { button: 0, isPrimary: false }]
    ])('does not initiate a drag for %s', (_label, pointerState) => {
        useManualMode();
        const options = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')]))
        });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        const handle = cardById('moving').querySelector('.unscheduled-drag-handle');
        handle.setPointerCapture = jest.fn();

        pointer('pointerdown', handle, { pointerId: 16, clientY: 60, ...pointerState });
        pointer('pointermove', root, { pointerId: 16, clientY: 5, ...pointerState });
        pointer('pointerup', root, { pointerId: 16, clientY: 5, ...pointerState });

        expect(handle.setPointerCapture).not.toHaveBeenCalled();
        expect(cardById('moving').classList).not.toContain('unscheduled-task--dragging');
        expect(options.moveTask).not.toHaveBeenCalled();
    });

    test('a non-drag handle activation opens Move while a post-drag click is suppressed', () => {
        useManualMode();
        const options = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')])),
            moveTask: jest.fn(() => ({ success: true, changed: false }))
        });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        setCardRects([...root.querySelectorAll('.task-card')]);
        let handle = cardById('moving').querySelector('.unscheduled-drag-handle');

        pointer('pointerdown', handle, { pointerId: 9, clientX: 10, clientY: 60 });
        pointer('pointerup', root, { pointerId: 9, clientX: 10, clientY: 60 });
        handle.click();
        expect(cardById('moving').querySelector('.unscheduled-task-actions-menu').hidden).toBe(
            false
        );

        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        pointer('pointerdown', handle, { pointerId: 10, clientX: 10, clientY: 60 });
        pointer('pointermove', root, { pointerId: 10, clientX: 30, clientY: 5 });
        pointer('pointerup', root, { pointerId: 10, clientX: 30, clientY: 5 });
        handle = cardById('moving').querySelector('.unscheduled-drag-handle');
        handle.click();

        expect(cardById('moving').querySelector('.unscheduled-task-actions-menu').hidden).toBe(
            true
        );
        expect(options.moveTask).toHaveBeenCalledTimes(1);
    });

    test.each(['pointercancel', 'Escape', 'destroy'])(
        '%s cleans pointer capture, marker, and drag state without dropping',
        (cleanupKind) => {
            useManualMode();
            const options = createOptions({
                readView: jest.fn(() => view([task('first'), task('moving'), task('last')]))
            });
            renderWith(options);
            const root = document.getElementById('unscheduled-task-list');
            setCardRects([...root.querySelectorAll('.task-card')]);
            const handle = cardById('moving').querySelector('.unscheduled-drag-handle');
            handle.releasePointerCapture = jest.fn();

            pointer('pointerdown', handle, { pointerId: 12, clientY: 60 });
            pointer('pointermove', root, { pointerId: 12, clientY: 5 });
            expect(cardById('moving').classList).toContain('unscheduled-task--dragging');

            if (cleanupKind === 'pointercancel') {
                pointer('pointercancel', root, { pointerId: 12, clientY: 5 });
            } else if (cleanupKind === 'Escape') {
                root.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'Escape',
                        bubbles: true,
                        cancelable: true
                    })
                );
            } else {
                destroyUnscheduledList();
            }

            expect(handle.releasePointerCapture).toHaveBeenCalledWith(12);
            expect(document.querySelector('.unscheduled-task--dragging')).toBeNull();
            expect(document.querySelector('.unscheduled-drop-marker')).toBeNull();
            pointer('pointerup', root, { pointerId: 12, clientY: 5 });
            expect(options.moveTask).not.toHaveBeenCalled();
        }
    );

    test('lost pointer capture cancels safely, applies the latest view, and restores focus', () => {
        useManualMode();
        const pendingTasks = [task('first'), task('moving'), task('remote'), task('last')];
        const readView = jest
            .fn()
            .mockReturnValueOnce(view([task('first'), task('moving'), task('last')]))
            .mockReturnValueOnce(view(pendingTasks));
        const options = createOptions({ readView });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        setCardRects([...root.querySelectorAll('.task-card')]);
        const handle = cardById('moving').querySelector('.unscheduled-drag-handle');
        handle.releasePointerCapture = jest.fn(() => {
            const nestedLost = new Event('lostpointercapture', { bubbles: true });
            Object.defineProperty(nestedLost, 'pointerId', { value: 17 });
            handle.dispatchEvent(nestedLost);
        });

        pointer('pointerdown', handle, { pointerId: 17, clientY: 60 });
        pointer('pointermove', root, { pointerId: 17, clientY: 5 });
        renderUnscheduledList();
        expect(taskOrder()).toEqual(['first', 'moving', 'last']);

        const lostCapture = new Event('lostpointercapture', { bubbles: true });
        Object.defineProperty(lostCapture, 'pointerId', { value: 17 });
        handle.dispatchEvent(lostCapture);

        expect(handle.releasePointerCapture).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.unscheduled-task--dragging')).toBeNull();
        expect(document.querySelector('.unscheduled-drop-marker')).toBeNull();
        expect(taskOrder()).toEqual(['first', 'moving', 'remote', 'last']);
        expect(document.activeElement).toBe(
            cardById('moving').querySelector('.unscheduled-drag-handle')
        );

        pointer('pointerup', root, { pointerId: 17, clientY: 5 });
        expect(options.moveTask).not.toHaveBeenCalled();
    });

    test('render requests during drag apply only the latest view after cancellation', () => {
        useManualMode();
        const readView = jest
            .fn()
            .mockReturnValueOnce(view([task('a'), task('b')]))
            .mockReturnValueOnce(view([task('a'), task('c')]))
            .mockReturnValueOnce(view([task('a'), task('d')]));
        const options = createOptions({ readView });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        const handle = cardById('a').querySelector('.unscheduled-drag-handle');

        pointer('pointerdown', handle, { pointerId: 3, clientY: 10 });
        pointer('pointermove', root, { pointerId: 3, clientY: 50 });
        renderUnscheduledList();
        renderUnscheduledList();

        expect(taskOrder()).toEqual(['a', 'b']);
        pointer('pointercancel', root, { pointerId: 3, clientY: 50 });
        expect(taskOrder()).toEqual(['a', 'd']);
        expect(readView).toHaveBeenCalledTimes(3);
        expect(document.activeElement).toBe(
            cardById('a').querySelector('.unscheduled-drag-handle')
        );
    });

    test('a remote view that removes the dragged task cancels safely', () => {
        useManualMode();
        let currentView = view([task('a'), task('b')]);
        const options = createOptions({ readView: jest.fn(() => currentView) });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        const handle = cardById('a').querySelector('.unscheduled-drag-handle');
        handle.releasePointerCapture = jest.fn();

        pointer('pointerdown', handle, { pointerId: 4, clientY: 10 });
        pointer('pointermove', root, { pointerId: 4, clientY: 50 });
        currentView = view([task('b')]);
        renderUnscheduledList();

        expect(taskOrder()).toEqual(['b']);
        expect(document.querySelector('.unscheduled-task--dragging')).toBeNull();
        expect(handle.releasePointerCapture).toHaveBeenCalledWith(4);
        expect(options.moveTask).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(
            document.querySelector('[data-unscheduled-mode="manual"]')
        );
    });

    test.each([
        ['a no-op', { success: true, changed: false }, true],
        ['an unavailable drop', { success: false, code: 'unavailable' }, false]
    ])('restores logical focus after %s', (_label, operation, taskRemains) => {
        useManualMode();
        const initialTasks = [task('first'), task('moving'), task('last')];
        const readView = taskRemains
            ? jest.fn(() => view(initialTasks))
            : jest
                  .fn()
                  .mockReturnValueOnce(view(initialTasks))
                  .mockReturnValueOnce(view([task('first'), task('last')]));
        const options = createOptions({
            readView,
            moveTask: jest.fn(() => operation)
        });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        setCardRects([...root.querySelectorAll('.task-card')]);
        const handle = cardById('moving').querySelector('.unscheduled-drag-handle');

        pointer('pointerdown', handle, { pointerId: 18, clientY: 60 });
        pointer('pointermove', root, { pointerId: 18, clientY: 5 });
        pointer('pointerup', root, { pointerId: 18, clientY: 5 });

        expect(document.activeElement).toBe(
            taskRemains
                ? cardById('moving').querySelector('.unscheduled-drag-handle')
                : document.querySelector('[data-unscheduled-mode="manual"]')
        );
        expect(document.getElementById('unscheduled-order-status').textContent).toBe('');
    });

    test('drag settlement failure reuses rollback rendering and feedback', async () => {
        useManualMode();
        const settlement = deferred();
        let tasks = [task('first'), task('moving'), task('last')];
        const options = createOptions({
            readView: jest.fn(() => view(tasks)),
            moveTask: jest.fn(() => {
                tasks = [tasks[1], tasks[0], tasks[2]];
                return {
                    success: true,
                    changed: true,
                    taskId: 'moving',
                    position: 1,
                    total: 3,
                    settled: settlement.promise
                };
            })
        });
        renderWith(options);
        const root = document.getElementById('unscheduled-task-list');
        setCardRects([...root.querySelectorAll('.task-card')]);
        const handle = cardById('moving').querySelector('.unscheduled-drag-handle');

        pointer('pointerdown', handle, { pointerId: 14, clientY: 60 });
        pointer('pointermove', root, { pointerId: 14, clientY: 5 });
        pointer('pointerup', root, { pointerId: 14, clientY: 5 });
        expect(taskOrder()).toEqual(['moving', 'first', 'last']);

        tasks = [task('first'), task('moving'), task('last')];
        settlement.resolve({ success: false, rolledBack: true, reloaded: false });
        await settlement.promise;
        await Promise.resolve();

        expect(taskOrder()).toEqual(['first', 'moving', 'last']);
        expect(options.showError).toHaveBeenCalledWith(
            'Order could not be saved. Your previous order was restored.',
            { theme: 'rose' }
        );
    });

    test('remounting keeps exactly one move listener', () => {
        useManualMode();
        const first = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')]))
        });
        const second = createOptions({
            readView: jest.fn(() => view([task('first'), task('moving'), task('last')])),
            moveTask: jest.fn(() => ({ success: true, changed: false }))
        });
        mountUnscheduledList(first);
        mountUnscheduledList(second);
        renderUnscheduledList();

        document.querySelector('[data-task-id="moving"] [data-move-kind="top"]').click();

        expect(first.moveTask).not.toHaveBeenCalled();
        expect(second.moveTask).toHaveBeenCalledTimes(1);
    });

    test('remounting replaces listeners instead of duplicating them', () => {
        const first = createOptions();
        const second = createOptions();
        mountUnscheduledList(first);
        mountUnscheduledList(second);
        renderUnscheduledList();

        document.querySelector('.btn-edit-unscheduled').click();

        expect(first.actions.edit).not.toHaveBeenCalled();
        expect(second.actions.edit).toHaveBeenCalledTimes(1);
    });

    test('destroy removes controls, list, and document listeners', () => {
        const options = renderWith();
        const menu = document.querySelector('.unscheduled-task-actions-menu');
        const trigger = document.querySelector('.btn-unscheduled-task-actions-menu');
        trigger.click();
        destroyUnscheduledList();

        document.querySelector('[data-unscheduled-mode="manual"]').click();
        document.querySelector('.btn-edit-unscheduled').click();
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(options.readView).toHaveBeenCalledTimes(1);
        expect(options.actions.edit).not.toHaveBeenCalled();
        expect(menu.hidden).toBe(false);
    });
});

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
    renderCategoryBadge: jest.fn(() => '')
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

describe('Unscheduled list UI interface', () => {
    beforeEach(() => {
        destroyUnscheduledList();
        installDom();
        localStorage.clear();
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

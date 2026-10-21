import { initializeTaskEditing } from '../public/js/task-editing-ui.js';
import { getEditReadiness } from '../public/js/edit-readiness.js';
import { updateStartTimeField } from '../public/js/dom-renderer.js';

describe('task editing UI', () => {
    let controller;
    let pending;
    let status;
    let abort;
    let notify;
    let form;

    beforeEach(() => {
        sessionStorage.clear();
        document.body.innerHTML = `
            <form id="task-form">
                <input name="description"><input name="start-time" type="time">
                <input name="task-type" type="radio" value="scheduled" checked>
                <input name="task-type" type="radio" value="unscheduled">
                <select name="category"><option value="">None</option><option value="work">Work</option></select>
                <button type="submit">Add</button>
            </form>
            <div id="scheduled-task-list"><button>Edit</button></div>
            <div id="unscheduled-task-list"></div>
            <button id="clear-schedule-button">Clear</button>`;
        pending = true;
        status = 'checking';
        abort = new AbortController();
        notify = jest.fn();
        form = document.getElementById('task-form');
        controller = initializeTaskEditing({
            roomCode: 'room-a',
            signal: abort.signal,
            readState: () => getEditReadiness(status, pending),
            notify
        });
    });

    afterEach(() => abort.abort());

    test('clears the previous room draft marker while retaining its saved draft', () => {
        form.elements.description.value = 'Room A draft';
        form.dispatchEvent(new Event('input', { bubbles: true }));
        expect(form.dataset.hasTaskDraft).toBe('true');
        abort.abort();
        abort = new AbortController();
        initializeTaskEditing({
            roomCode: 'room-b',
            signal: abort.signal,
            readState: () => getEditReadiness(status, pending),
            notify
        });
        expect(form.dataset.hasTaskDraft).toBeUndefined();
        updateStartTimeField('11:30', true);
        expect(form.elements['start-time'].value).toBe('11:30');
        expect(form.elements.description.value).toBe('');
        expect(sessionStorage.getItem('fortudo-task-draft:room-a')).toContain('Room A draft');
    });

    test('initializes an untouched blank start time after an early description draft, including reload', () => {
        form.elements.description.value = 'Early draft';
        form.elements.description.dispatchEvent(new Event('input', { bubbles: true }));
        updateStartTimeField('11:30', true);
        controller.restoreDraft();
        expect(form.elements['start-time'].value).toBe('11:30');
        abort.abort();
        abort = new AbortController();
        controller = initializeTaskEditing({
            roomCode: 'room-a',
            signal: abort.signal,
            readState: () => getEditReadiness(status, pending),
            notify
        });
        updateStartTimeField('12:30', true);
        controller.restoreDraft();
        expect(form.elements['start-time'].value).toBe('12:30');
        expect(form.elements.description.value).toBe('Early draft');
    });

    test('preserves a deliberately cleared start time through initialization and reload', () => {
        const time = form.elements['start-time'];
        time.value = '10:00';
        time.dispatchEvent(new Event('input', { bubbles: true }));
        time.value = '';
        time.dispatchEvent(new Event('change', { bubbles: true }));
        updateStartTimeField('11:30', true);
        controller.restoreDraft();
        expect(time.value).toBe('');
        abort.abort();
        abort = new AbortController();
        controller = initializeTaskEditing({
            roomCode: 'room-a',
            signal: abort.signal,
            readState: () => getEditReadiness(status, pending),
            notify
        });
        updateStartTimeField('12:30', true);
        controller.restoreDraft();
        expect(time.value).toBe('');
    });

    test('routes an audit toast through the shared dispatcher without running a second check', async () => {
        status = 'audit-error';
        pending = false;
        const requestRetry = jest.fn();
        const retrySync = jest.fn();
        controller = initializeTaskEditing({
            roomCode: 'room-a',
            signal: abort.signal,
            readState: () => getEditReadiness(status, pending),
            notify,
            retrySync,
            requestRetry
        });
        await notify.mock.calls[0][1].action.onClick();
        expect(requestRetry).toHaveBeenCalledTimes(1);
        expect(retrySync).not.toHaveBeenCalled();
        await controller.retry();
        expect(retrySync).toHaveBeenCalledTimes(1);
    });

    test('allows drafting but intercepts premature saves before handlers run', () => {
        const save = jest.fn();
        form.addEventListener('submit', save);
        form.elements.description.value = 'My draft';
        form.elements.description.dispatchEvent(new Event('input', { bubbles: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(save).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith(expect.stringMatching(/wait/i), expect.any(Object));
        expect(form.elements.description.value).toBe('My draft');
        expect(document.getElementById('scheduled-task-list').hasAttribute('inert')).toBe(true);
        expect(form.querySelector('button').getAttribute('aria-disabled')).toBe('true');
        expect(form.querySelector('button').textContent).toBe('Loading…');
        expect(form.querySelector('button').getAttribute('aria-busy')).toBe('true');
        expect(document.getElementById('edit-readiness')).toBeNull();
    });

    test('opens editing while sync is still running, but preserves safety blocks', () => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<div data-toast-key="task-edit-readiness">Please wait</div>'
        );
        status = 'syncing';
        pending = false;
        controller.refresh();
        expect(form.querySelector('button').textContent).toBe('Add');
        expect(form.querySelector('button').hasAttribute('aria-busy')).toBe(false);
        expect(document.querySelector('[data-toast-key="task-edit-readiness"]')).toBeNull();
        expect(document.getElementById('scheduled-task-list').hasAttribute('inert')).toBe(false);
        const save = jest.fn();
        form.addEventListener('submit', save);
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(save).toHaveBeenCalledTimes(1);
        status = 'recovery-required';
        controller.refresh();
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        expect(save).toHaveBeenCalledTimes(1);
        expect(form.querySelector('button').getAttribute('aria-disabled')).toBe('true');
        expect(form.querySelector('button').textContent).toBe('Add');
    });

    test('keeps Loading visible through mode and preview updates, then restores the current action', () => {
        const button = form.querySelector('button');
        button.innerHTML = '<i></i>Log Activity';
        form.dispatchEvent(new Event('change', { bubbles: true }));
        expect(button.textContent).toBe('Loading…');
        button.innerHTML = '<i></i>Reschedule';
        form.elements['start-time'].dispatchEvent(new Event('input', { bubbles: true }));
        expect(button.textContent).toBe('Loading…');
        pending = false;
        status = 'synced';
        controller.refresh();
        expect(button.textContent).toBe('Reschedule');
        expect(button.hasAttribute('aria-describedby')).toBe(false);
        expect(notify).not.toHaveBeenCalled();
    });

    test('reports an audit retry in progress and explains a repeated failure', async () => {
        let finish;
        const retrySync = jest.fn(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        abort.abort();
        abort = new AbortController();
        status = 'audit-error';
        controller = initializeTaskEditing({
            roomCode: 'room-a',
            signal: abort.signal,
            readState: () => getEditReadiness(status, pending),
            notify,
            retrySync
        });
        controller.refresh();
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(
            expect.stringMatching(/retry/i),
            expect.objectContaining({ action: expect.objectContaining({ label: 'Retry check' }) })
        );
        const retry = notify.mock.calls[0][1].action.onClick();
        expect(retrySync).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenLastCalledWith('Checking local changes…', expect.any(Object));
        controller.refresh();
        expect(notify).toHaveBeenCalledTimes(2);
        finish();
        await retry;
        expect(notify).toHaveBeenLastCalledWith(
            expect.stringMatching(/check failed again/i),
            expect.objectContaining({ action: expect.objectContaining({ label: 'Retry check' }) })
        );
        status = 'update-required';
        controller.refresh();
        expect(notify).toHaveBeenCalledTimes(3);
    });

    test('configuration errors explain the required fix without a retry action', () => {
        status = 'validator-mismatch';
        controller.refresh();
        expect(notify).toHaveBeenCalledWith(
            expect.stringMatching(/configuration.*fix/i),
            expect.not.objectContaining({ action: expect.anything() })
        );
    });

    test.each(['success', 'offline', 'rejection', 'aborted', 'configuration', 'update'])(
        'handles the %s outcome of retrying a safety check',
        async (outcome) => {
            abort.abort();
            abort = new AbortController();
            pending = false;
            status = 'audit-error';
            const retrySync = jest.fn(async () => {
                if (outcome === 'aborted') abort.abort();
                else if (outcome === 'rejection') throw new Error('private diagnostic');
                else
                    status = {
                        success: 'synced',
                        offline: 'offline',
                        configuration: 'validator-mismatch',
                        update: 'update-required'
                    }[outcome];
            });
            controller = initializeTaskEditing({
                roomCode: 'room-a',
                signal: abort.signal,
                readState: () => getEditReadiness(status, pending),
                notify,
                retrySync
            });
            const retryAction = notify.mock.calls[0][1].action;
            const retry = retryAction.onClick();
            await retryAction.onClick();
            await retry;
            expect(retrySync).toHaveBeenCalledTimes(1);
            if (outcome === 'success') {
                expect(notify).toHaveBeenLastCalledWith(
                    'Check passed. You can edit tasks again.',
                    expect.not.objectContaining({ action: expect.anything() })
                );
                expect(form.querySelector('button').getAttribute('aria-disabled')).toBe('false');
                document.body.insertAdjacentHTML(
                    'beforeend',
                    '<div data-toast-key="task-edit-readiness">Check passed. You can edit tasks again.</div>'
                );
                controller.refresh();
                expect(
                    document.querySelector('[data-toast-key="task-edit-readiness"]')
                ).not.toBeNull();
            } else if (outcome === 'offline') {
                expect(notify).toHaveBeenLastCalledWith(
                    expect.stringMatching(/connection/i),
                    expect.objectContaining({
                        action: expect.objectContaining({ label: 'Retry check' })
                    })
                );
            } else if (outcome === 'rejection') {
                expect(notify).toHaveBeenLastCalledWith(
                    expect.stringMatching(/could not finish/i),
                    expect.objectContaining({ action: expect.any(Object) })
                );
            } else if (outcome === 'configuration') {
                expect(notify).toHaveBeenLastCalledWith(
                    expect.stringMatching(/configuration/i),
                    expect.not.objectContaining({ action: expect.anything() })
                );
            } else {
                expect(notify).toHaveBeenCalledTimes(2);
            }
        }
    );

    test('restores complete input after startup refresh and reload, and clears it after success', () => {
        form.elements.description.value = 'Keep me';
        form.elements['start-time'].value = '14:30';
        form.elements['task-type'].value = 'unscheduled';
        form.elements.category.value = 'work';
        form.elements.description.dispatchEvent(new Event('input', { bubbles: true }));
        form.elements.description.value = '';
        form.elements['start-time'].value = '09:00';
        controller.restoreDraft();
        expect(form.elements.description.value).toBe('Keep me');
        expect(form.elements['start-time'].value).toBe('14:30');
        abort.abort();
        abort = new AbortController();
        controller = initializeTaskEditing({
            roomCode: 'room-a',
            signal: abort.signal,
            readState: () => getEditReadiness(status, pending),
            notify
        });
        controller.restoreDraft();
        expect(form.elements.description.value).toBe('Keep me');
        expect(form.elements['task-type'].value).toBe('unscheduled');
        expect(form.elements.category.value).toBe('work');
        form.reset();
        controller.restoreDraft();
        expect(form.elements.description.value).toBe('');
        expect(sessionStorage.getItem('fortudo-task-draft:room-a')).toBeNull();
    });

    test('keeps drafts scoped to the room and handles unavailable storage', () => {
        form.elements.description.value = 'Room A';
        form.elements.description.dispatchEvent(new Event('input', { bubbles: true }));
        abort.abort();
        abort = new AbortController();
        const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('full');
        });
        controller = initializeTaskEditing({
            roomCode: 'room-b',
            signal: abort.signal,
            readState: () => getEditReadiness(status, pending),
            notify
        });
        expect(form.elements.description.value).toBe('');
        form.elements.description.value = 'Room B';
        form.elements.description.dispatchEvent(new Event('input', { bubbles: true }));
        form.elements.description.value = '';
        controller.restoreDraft();
        expect(form.elements.description.value).toBe('Room B');
        get.mockRestore();
        set.mockRestore();
    });

    test('keeps a removed category visible and safely ignores malformed saved entries', () => {
        abort.abort();
        sessionStorage.setItem(
            'fortudo-task-draft:room-a',
            JSON.stringify([
                null,
                { name: 12, value: false },
                { name: 'category', value: 'removed', label: '<Old category>' }
            ])
        );
        abort = new AbortController();
        controller = initializeTaskEditing({
            roomCode: 'room-a',
            signal: abort.signal,
            readState: () => getEditReadiness(status, pending),
            notify
        });
        expect(form.elements.category.value).toBe('removed');
        expect(form.elements.category.selectedOptions[0].textContent).toBe('<Old category>');
        expect(form.elements.category.querySelector('old')).toBeNull();
    });

    test('guards the timer start shortcut and removes listeners on room teardown', () => {
        const button = document.createElement('button');
        button.id = 'start-timer-btn';
        button.type = 'button';
        form.append(button);
        const start = jest.fn();
        button.addEventListener('click', start);
        button.click();
        expect(start).not.toHaveBeenCalled();
        abort.abort();
        button.click();
        expect(start).toHaveBeenCalledTimes(1);
    });

    test('tolerates missing UI and invalid stored JSON', () => {
        abort.abort();
        document.body.innerHTML = '';
        sessionStorage.setItem('fortudo-task-draft:room-a', '{invalid');
        abort = new AbortController();
        expect(() =>
            initializeTaskEditing({
                roomCode: 'room-a',
                signal: abort.signal,
                readState: () => getEditReadiness(status, pending),
                notify
            })
        ).not.toThrow();
    });
});

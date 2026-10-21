import { createStartupRetry } from '../public/js/startup-retry-ui.js';

describe('startup retry feedback', () => {
    let abort;
    let notify;
    let retry;
    let readState;
    let actions;

    beforeEach(() => {
        abort = new AbortController();
        notify = jest.fn();
        retry = jest.fn().mockResolvedValue(false);
        readState = jest.fn(() => ({ allowed: true, message: 'Ready' }));
        actions = createStartupRetry({
            signal: abort.signal,
            notify,
            retry,
            readState,
            enqueue: (run) => Promise.resolve().then(run)
        });
    });

    test('shows progress and a distinct repeated failure, while retaining Retry', async () => {
        let finish;
        retry.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        actions.showFailure();
        const action = notify.mock.calls[0][1].action;
        const operation = action.onClick();
        await action.onClick();
        expect(notify).toHaveBeenLastCalledWith('Retrying startup…', expect.any(Object));
        await Promise.resolve();
        expect(retry).toHaveBeenCalledTimes(1);
        finish(false);
        await operation;
        expect(notify).toHaveBeenLastCalledWith(
            expect.stringMatching(/still could not load/i),
            expect.objectContaining({ action: expect.objectContaining({ label: 'Retry' }) })
        );
    });

    test.each(['loaded', 'blocked', 'rejected', 'aborted', 'aborted-before-start'])(
        'handles %s without losing the outcome',
        async (outcome) => {
            retry.mockImplementation(async () => {
                if (outcome === 'rejected') throw new Error('private details');
                if (outcome === 'aborted') abort.abort();
                return true;
            });
            if (outcome === 'blocked')
                readState.mockReturnValue({
                    allowed: false,
                    message: 'Reload Fortudo to edit this room.'
                });
            actions.showFailure();
            if (outcome === 'aborted-before-start') abort.abort();
            await notify.mock.calls[0][1].action.onClick();
            if (outcome === 'loaded')
                expect(notify).toHaveBeenLastCalledWith(
                    'Tasks loaded. You can edit tasks again.',
                    expect.any(Object)
                );
            else if (outcome === 'blocked')
                expect(notify).toHaveBeenLastCalledWith(
                    'Reload Fortudo to edit this room.',
                    expect.any(Object)
                );
            else if (outcome === 'rejected')
                expect(notify).toHaveBeenLastCalledWith(
                    expect.stringMatching(/still could not load/i),
                    expect.objectContaining({ action: expect.any(Object) })
                );
            else expect(notify).toHaveBeenCalledTimes(outcome === 'aborted' ? 2 : 1);
        }
    );

    test('does not start a queued retry after leaving the room', async () => {
        let runQueued;
        actions = createStartupRetry({
            signal: abort.signal,
            notify,
            retry,
            readState,
            enqueue: (run) => {
                runQueued = run;
                return Promise.resolve();
            }
        });
        actions.showFailure();
        await notify.mock.calls[0][1].action.onClick();
        abort.abort();
        await runQueued();
        expect(retry).not.toHaveBeenCalled();
    });

    test('routes the toast through the shared retry dispatcher', async () => {
        const requestRetry = jest.fn();
        actions = createStartupRetry({
            signal: abort.signal,
            notify,
            retry,
            readState,
            enqueue: (run) => run(),
            requestRetry
        });
        actions.showFailure();
        await notify.mock.calls[0][1].action.onClick();
        expect(requestRetry).toHaveBeenCalledTimes(1);
        expect(retry).not.toHaveBeenCalled();
        await actions.retry();
        expect(retry).toHaveBeenCalledTimes(1);
    });
});

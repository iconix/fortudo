import { createContractSafetyActions } from '../public/js/contract-safety-ui.js';

function createDependencies(overrides = {}) {
    return {
        toast: jest.fn(),
        exportRecovery: jest.fn().mockResolvedValue({ leafCount: 3 }),
        resetReplica: jest.fn().mockResolvedValue(undefined),
        log: { error: jest.fn() },
        promptForReset: jest.fn().mockReturnValue('RESET LOCAL DATA'),
        getRegistration: jest.fn().mockResolvedValue(null),
        reload: jest.fn(),
        ...overrides
    };
}

describe('contract safety UI', () => {
    test('downloads before offering an explicitly confirmed local reset', async () => {
        const dependencies = createDependencies();
        const actions = createContractSafetyActions(dependencies);

        await actions.handleRecoveryRequired();
        await dependencies.toast.mock.calls[0][1].action.onClick();
        await dependencies.toast.mock.calls[1][1].action.onClick();

        expect(dependencies.exportRecovery).toHaveBeenCalledTimes(1);
        expect(dependencies.promptForReset).toHaveBeenCalledWith(expect.stringContaining('RESET'));
        expect(dependencies.resetReplica).toHaveBeenCalledWith('RESET LOCAL DATA');
    });

    test('does not reset when the destructive confirmation is cancelled', async () => {
        const dependencies = createDependencies({
            promptForReset: jest.fn().mockReturnValue(null)
        });
        const actions = createContractSafetyActions(dependencies);

        await actions.handleRecoveryRequired();
        await dependencies.toast.mock.calls[0][1].action.onClick();
        await dependencies.toast.mock.calls[1][1].action.onClick();

        expect(dependencies.resetReplica).not.toHaveBeenCalled();
    });

    test('surfaces export and reset failures without logging bundle contents', async () => {
        const exportDependencies = createDependencies({
            exportRecovery: jest.fn().mockRejectedValue(new Error('private bundle detail'))
        });
        await createContractSafetyActions(exportDependencies).handleRecoveryRequired();
        await exportDependencies.toast.mock.calls[0][1].action.onClick();

        expect(exportDependencies.log.error).toHaveBeenCalledWith('Local recovery export failed.');
        expect(exportDependencies.toast).toHaveBeenLastCalledWith(
            'Could not create the local recovery bundle',
            { theme: 'rose' }
        );

        const resetDependencies = createDependencies({
            resetReplica: jest.fn().mockRejectedValue(new Error('Local reset was blocked'))
        });
        await createContractSafetyActions(resetDependencies).handleRecoveryRequired();
        await resetDependencies.toast.mock.calls[0][1].action.onClick();
        await resetDependencies.toast.mock.calls[1][1].action.onClick();
        expect(resetDependencies.toast).toHaveBeenLastCalledWith('Local reset was blocked', {
            theme: 'rose'
        });
    });

    test('activates a waiting worker or reloads when activation is unavailable', async () => {
        const waiting = { postMessage: jest.fn() };
        const waitingDependencies = createDependencies({
            getRegistration: jest.fn().mockResolvedValue({ waiting })
        });
        createContractSafetyActions(waitingDependencies).handleContractUpdateRequired();
        await waitingDependencies.toast.mock.calls[0][1].action.onClick();
        expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(waitingDependencies.reload).not.toHaveBeenCalled();

        const reloadDependencies = createDependencies({
            getRegistration: jest.fn().mockRejectedValue(new Error('unavailable'))
        });
        createContractSafetyActions(reloadDependencies).handleContractUpdateRequired();
        await reloadDependencies.toast.mock.calls[0][1].action.onClick();
        expect(reloadDependencies.reload).toHaveBeenCalledTimes(1);
    });
});

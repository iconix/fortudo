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
    test('offers guided recovery without a destructive reset or a claimed download', async () => {
        const openRecovery = jest.fn();
        const dependencies = createDependencies({ openRecovery });
        await createContractSafetyActions(dependencies).handleRecoveryRequired();
        expect(dependencies.toast).toHaveBeenCalledWith(
            expect.stringMatching(/recover/i),
            expect.objectContaining({
                action: expect.objectContaining({ label: 'Recover changes' })
            })
        );
        await dependencies.toast.mock.calls[0][1].action.onClick();
        expect(openRecovery).toHaveBeenCalledTimes(1);
        expect(dependencies.exportRecovery).not.toHaveBeenCalled();
        expect(dependencies.resetReplica).not.toHaveBeenCalled();
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

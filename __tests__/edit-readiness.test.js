import { getEditReadiness } from '../public/js/edit-readiness.js';

describe('edit readiness', () => {
    test.each([
        'idle',
        'compatible',
        'syncing',
        'synced',
        'unsynced',
        'offline',
        'error',
        'missing-validator',
        'unprovisioned'
    ])('%s allows edits after local preparation', (status) => {
        expect(getEditReadiness(status, false)).toMatchObject({
            allowed: true,
            label: 'Ready to edit'
        });
        expect(getEditReadiness(status, true)).toMatchObject({
            allowed: false,
            label: 'Loading tasks'
        });
    });

    test.each([
        'checking',
        'preparation-error',
        'update-required',
        'update-required-available',
        'validator-mismatch',
        'recovery-required',
        'audit-error'
    ])('%s blocks edits even after local preparation', (status) => {
        const readiness = getEditReadiness(status, false);
        expect(readiness.allowed).toBe(false);
        expect(readiness.message).toBeTruthy();
        expect(getEditReadiness(status, true)).toEqual(readiness);
    });

    test('explains the action for each blocked state', () => {
        expect(getEditReadiness('checking', true).message).toMatch(/draft.*wait/i);
        expect(getEditReadiness('preparation-error', false).message).toMatch(/retry/i);
        expect(getEditReadiness('update-required', false).message).toMatch(/reload/i);
        expect(getEditReadiness('recovery-required', false).message).toMatch(/recover changes/i);
        expect(getEditReadiness('audit-error', false).message).toMatch(/retry/i);
        expect(getEditReadiness('validator-mismatch', false).message).toMatch(/configuration/i);
    });
});

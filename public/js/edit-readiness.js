const BLOCKED_STATES = {
    checking: [
        'Loading tasks',
        'You can draft a task while we check this room. Please wait before saving.'
    ],
    'preparation-error': [
        'Loading paused',
        'Tasks could not finish loading. Retry to enable editing.'
    ],
    'replica-replaced': [
        'Reload to continue',
        'This room was repaired in another tab. Reload to use its current local copy.'
    ],
    'update-required': [
        'Update to edit',
        'Reload the latest Fortudo version to edit this room. Your task draft is kept in this tab.'
    ],
    'update-required-available': [
        'Update to edit',
        'Reload the latest Fortudo version to edit this room. Your task draft is kept in this tab.'
    ],
    'validator-mismatch': [
        'Editing paused',
        'This room needs a sync configuration fix before editing can resume.'
    ],
    'recovery-required': [
        'Recover to edit',
        'Some local changes need recovery. Use Recover changes to save a copy and review them safely.'
    ],
    'audit-error': [
        'Editing paused',
        'We could not verify your local changes. Retry the check to continue.'
    ]
};

/** Describe edit readiness independently of cloud transport status. */
export function getEditReadiness(status, preparationPending) {
    const blocked = BLOCKED_STATES[status];
    if (blocked) {
        return {
            allowed: false,
            label: blocked[0],
            message: blocked[1],
            status,
            retryable: status === 'audit-error'
        };
    }
    if (preparationPending) {
        return {
            allowed: false,
            status,
            label: 'Loading tasks',
            message: 'You can draft a task while tasks load. Please wait before saving.'
        };
    }
    return {
        allowed: true,
        status,
        label: 'Ready to edit',
        message: 'You can add and edit tasks. Changes save on this device.'
    };
}

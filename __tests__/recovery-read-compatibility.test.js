import { validateRecoveryDocument } from '../public/js/recovery-read-compatibility.js';

const interval = {
    startDateTime: '2026-11-09T09:00:00Z',
    endDateTime: '2026-11-09T09:30:00Z'
};
const task = { _id: 'unsched-old', type: 'unscheduled', description: 'Saved work' };

describe('recovery read compatibility without writer metadata', () => {
    test.each([
        task,
        { ...task, docType: 'task', priority: 'normal', estDuration: 0, manualOrder: 1 },
        { _id: '_design/existing', views: {} },
        { _id: 'config-taxonomy-identity-migration-v1', docType: 'config', migrationVersion: 1 },
        { ...task, docType: 'task', status: 'completed', priority: 'medium', estDuration: null },
        { ...task, type: 'scheduled', ...interval, duration: 30 },
        { _id: 'activity-old', docType: 'activity', description: '', ...interval, duration: 30 },
        { _id: 'deleted-old', _deleted: true },
        { _id: 'config-settings', docType: 'config', activitiesEnabled: true },
        {
            _id: 'config-running-activity',
            docType: 'config',
            description: 'Timer',
            startDateTime: interval.startDateTime
        },
        {
            _id: 'config-unscheduled-sequence',
            docType: 'config',
            schemaVersion: 1,
            orderedTaskIds: ['unsched-old']
        },
        {
            _id: 'config-categories',
            docType: 'config',
            categories: [{ key: 'work/deep', group: 'work' }]
        },
        {
            _id: 'config-categories',
            docType: 'config',
            schemaVersion: '3.5',
            groups: [{ key: 'work' }],
            categories: [{ key: 'work/deep', groupKey: 'work' }]
        },
        {
            _id: 'config-categories',
            docType: 'config',
            schemaVersion: '3.5',
            identityVersion: 1,
            groups: [{ id: 'g', key: 'work' }],
            categories: [{ id: 'c', key: 'work/deep', groupKey: 'work', groupId: 'g' }]
        }
    ])('accepts a supported historical shape unchanged: %j', (document) => {
        const original = JSON.stringify(document);
        expect(validateRecoveryDocument(document)).toEqual({ ok: true });
        expect(JSON.stringify(document)).toBe(original);
    });

    test.each([
        [{ ...task, type: 'scheduled', ...interval }, 'duration'],
        [null, 'document'],
        [[], 'document'],
        [{ _id: '' }, 'document'],
        [{ ...task, docType: null }, 'docType'],
        [{ ...task, category: {} }, 'category'],
        [{ ...task, categoryIdentityVersion: 2 }, 'categoryIdentityVersion'],
        [{ ...task, manualOrder: -1 }, 'manualOrder'],
        [{ _id: 'activity-bad', docType: 'activity', ...interval, description: {} }, 'description'],
        [{ _id: 'activity-bad', docType: 'activity', ...interval, duration: '30' }, 'duration'],
        [
            {
                _id: 'config-running-activity',
                docType: 'config',
                startDateTime: interval.startDateTime,
                description: {}
            },
            'description'
        ],
        [
            {
                _id: 'config-running-activity',
                docType: 'config',
                startDateTime: interval.startDateTime,
                activityId: 42
            },
            'activityId'
        ],
        [
            { _id: 'config-settings', docType: 'config', onboardingSnoozedUntil: 'bad' },
            'onboardingSnoozedUntil'
        ],
        [
            { _id: 'config-categories', docType: 'config', identityVersion: 2, categories: [] },
            'identityVersion'
        ],
        [
            { _id: 'config-categories', docType: 'config', schemaVersion: '99', categories: [] },
            'schemaVersion'
        ],
        [{ _id: 'config-categories', docType: 'config', categories: {} }, 'categories'],
        [
            { _id: 'config-categories', docType: 'config', schemaVersion: '3.5', categories: [] },
            'groups'
        ],
        [
            {
                _id: 'config-categories',
                docType: 'config',
                schemaVersion: '3.5',
                groups: [null],
                categories: []
            },
            'groups'
        ],
        [
            {
                _id: 'config-categories',
                docType: 'config',
                categories: [
                    { key: 'x', group: 'g' },
                    { key: 'x', group: 'g' }
                ]
            },
            'categories'
        ],
        [{ _id: 'config-categories', docType: 'config', categories: [{ key: 'x' }] }, 'categories'],
        [
            {
                _id: 'config-categories',
                docType: 'config',
                identityVersion: 1,
                categories: [{ key: 'x', group: 'g' }]
            },
            'identityVersion'
        ],
        [
            {
                _id: 'config-categories',
                docType: 'config',
                categories: [{ key: 'x', group: 'g', legacyKeys: [null] }]
            },
            'legacyKeys'
        ],
        [
            {
                _id: 'config-categories',
                docType: 'config',
                categories: [{ key: 'x', group: 'g', status: 'unknown' }]
            },
            'status'
        ],
        [{ ...task, description: {} }, 'description'],
        [{ ...task, type: 'unknown' }, 'type'],
        [{ ...task, status: 'unknown' }, 'status'],
        [{ ...task, priority: 42 }, 'priority'],
        [{ ...task, estDuration: -1 }, 'estDuration'],
        [{ ...task, estDuration: '15' }, 'estDuration'],
        [{ ...task, type: 'scheduled', ...interval, duration: -1 }, 'duration'],
        [{ ...task, type: 'scheduled', ...interval, startDateTime: 'bad' }, 'startDateTime'],
        [
            { _id: 'activity-bad', docType: 'activity', ...interval, endDateTime: '2026-11-08' },
            'endDateTime'
        ],
        [{ _id: 'config-settings', docType: 'config', activitiesEnabled: {} }, 'activitiesEnabled'],
        [
            { _id: 'config-running-activity', docType: 'config', startDateTime: 'bad' },
            'startDateTime'
        ],
        [
            {
                _id: 'config-unscheduled-sequence',
                docType: 'config',
                schemaVersion: 99,
                orderedTaskIds: []
            },
            'schemaVersion'
        ],
        [
            {
                _id: 'config-unscheduled-sequence',
                docType: 'config',
                schemaVersion: 1,
                orderedTaskIds: [null]
            },
            'orderedTaskIds'
        ],
        [
            {
                _id: 'config-categories',
                docType: 'config',
                schemaVersion: '3.5',
                groups: [],
                categories: [{ key: 'orphan', groupKey: 'missing' }]
            },
            'categories'
        ],
        [{ _id: 'config-categories', docType: 'config', categories: [null] }, 'categories'],
        [{ _id: 'unknown', docType: 'future' }, 'docType'],
        [{ _id: 'config-future', docType: 'config' }, 'configuration']
    ])('rejects unreadable fields even with current writer metadata: %j', (document, field) => {
        const result = validateRecoveryDocument(
            document && { ...document, writerContract: { version: 1 } }
        );
        expect(result).toMatchObject({ ok: false, field });
        expect(JSON.stringify(result)).not.toContain('Saved work');
    });
});

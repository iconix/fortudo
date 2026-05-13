/**
 * @jest-environment jsdom
 */

import {
    detectActivityDataIssues,
    getActivityIdsForIssue,
    groupIssuesByActivityId,
    mergeActivityIssuesById
} from '../public/js/activities/insights-issues.js';
import { calculateEndDateTime, timeToDateTime } from '../public/js/utils.js';

function isoAt(time) {
    return timeToDateTime(time, '2026-05-07');
}

function activity(overrides = {}) {
    const startDateTime = overrides.startDateTime || isoAt('09:00');
    const duration = overrides.duration || 30;
    const endDateTime = overrides.endDateTime || calculateEndDateTime(startDateTime, duration);

    return {
        id: 'activity-1',
        docType: 'activity',
        startDateTime,
        endDateTime,
        duration,
        source: 'task',
        sourceTaskId: 'task-1',
        ...overrides
    };
}

describe('activity insights issues', () => {
    test('detectActivityDataIssues detects overlap, invalid-range, and duplicate-auto', () => {
        const issues = detectActivityDataIssues([
            activity({
                id: 'activity-1',
                startDateTime: isoAt('09:00'),
                endDateTime: isoAt('10:00')
            }),
            activity({
                id: 'activity-2',
                startDateTime: isoAt('09:30'),
                endDateTime: isoAt('10:30'),
                source: 'manual',
                sourceTaskId: null
            }),
            activity({
                id: 'activity-3',
                startDateTime: isoAt('11:00'),
                endDateTime: isoAt('10:45')
            }),
            activity({
                id: 'activity-4',
                startDateTime: isoAt('12:00'),
                endDateTime: isoAt('12:30')
            })
        ]);

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'overlap',
                    activityId: 'activity-2',
                    overlappingActivityId: 'activity-1'
                }),
                expect.objectContaining({ type: 'invalid-range', activityId: 'activity-3' }),
                expect.objectContaining({
                    type: 'duplicate-auto',
                    activityId: 'activity-4',
                    sourceTaskId: 'task-1'
                })
            ])
        );
    });

    test('getActivityIdsForIssue returns primary and related activity ids', () => {
        expect(
            getActivityIdsForIssue({
                activityId: 'overlapping',
                overlappingActivityId: 'overlapped'
            })
        ).toEqual(['overlapping', 'overlapped']);
        expect(
            getActivityIdsForIssue({
                activityId: 'second-auto',
                duplicateActivityId: 'first-auto'
            })
        ).toEqual(['second-auto', 'first-auto']);
        expect(
            getActivityIdsForIssue({
                activityId: 'primary',
                relatedActivityId: 'related'
            })
        ).toEqual(['primary', 'related']);
    });

    test('groupIssuesByActivityId indexes issues under every affected activity id', () => {
        const duplicateIssue = {
            type: 'duplicate-auto',
            activityId: 'second-auto',
            duplicateActivityId: 'first-auto'
        };

        expect(groupIssuesByActivityId([duplicateIssue])).toEqual({
            'first-auto': [duplicateIssue],
            'second-auto': [duplicateIssue]
        });
    });

    test('mergeActivityIssuesById preserves caller issues and appends model issues', () => {
        const existingIssue = { type: 'manual-review', activityId: 'second-auto' };
        const duplicateIssue = {
            type: 'duplicate-auto',
            activityId: 'second-auto',
            duplicateActivityId: 'first-auto'
        };

        expect(
            mergeActivityIssuesById(
                {
                    'second-auto': [existingIssue]
                },
                [duplicateIssue]
            )
        ).toEqual({
            'first-auto': [duplicateIssue],
            'second-auto': [existingIssue, duplicateIssue]
        });
    });
});

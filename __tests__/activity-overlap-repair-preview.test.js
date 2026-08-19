/**
 * @jest-environment jsdom
 */

import {
    buildActivityOverlapRepairPreview,
    getSelectedOverlapRepairActivityIds
} from '../public/js/activities/overlap-repair-preview.js';

function preview(overrides = {}) {
    return {
        changes: [
            {
                activityId: 'activity-1',
                description: 'Writing',
                startDateTime: '2026-05-07T09:00:00.000Z',
                previousEndDateTime: '2026-05-07T10:30:00.000Z',
                nextEndDateTime: '2026-05-07T09:45:00.000Z',
                previousDuration: 90,
                nextDuration: 45,
                overlappingActivityId: 'activity-2',
                overlappingActivityDescription: 'Call',
                removedDurationMinutes: 45,
                isLargeAdjustment: true,
                isSubMinute: false
            },
            {
                activityId: 'activity-2',
                description: 'Call',
                startDateTime: '2026-05-07T09:45:00.000Z',
                previousEndDateTime: '2026-05-07T11:00:00.000Z',
                nextEndDateTime: '2026-05-07T10:30:00.000Z',
                previousDuration: 75,
                nextDuration: 45,
                overlappingActivityId: 'activity-3',
                overlappingActivityDescription: 'Break',
                removedDurationMinutes: 30,
                isLargeAdjustment: true,
                isSubMinute: false
            }
        ],
        unresolvedOverlaps: [],
        ...overrides
    };
}

describe('activity overlap repair preview', () => {
    test('renders safe repair rows selected by default with a large-adjustment label', () => {
        const content = buildActivityOverlapRepairPreview(preview());
        const selections = content.querySelectorAll('[data-overlap-repair-id]');

        expect(selections).toHaveLength(2);
        expect([...selections].every((selection) => selection.checked)).toBe(true);
        expect(content.textContent).toContain('Writing');
        expect(content.textContent).toContain('Call');
        expect(content.textContent).toContain('Large adjustment');
        expect(content.textContent).toContain('Only selected end times and durations will change');
        expect(getSelectedOverlapRepairActivityIds(content)).toEqual(['activity-1', 'activity-2']);
    });

    test('lets the caller omit individual safe repair rows', () => {
        const content = buildActivityOverlapRepairPreview(preview());
        content.querySelector('[data-overlap-repair-id="activity-2"]').checked = false;

        expect(getSelectedOverlapRepairActivityIds(content)).toEqual(['activity-1']);
    });

    test('renders unresolved same-start and containment cases separately and non-selectably', () => {
        const content = buildActivityOverlapRepairPreview(
            preview({
                changes: [],
                unresolvedOverlaps: [
                    {
                        reason: 'same-start',
                        activityIds: ['same-a', 'same-b', 'same-c'],
                        descriptions: ['Writing', 'Call', 'Break']
                    },
                    {
                        reason: 'containment',
                        description: 'Manual note',
                        overlappingActivityDescription: 'Timer'
                    }
                ]
            })
        );

        expect(content.querySelector('[data-overlap-unresolved-list]')).not.toBeNull();
        expect(content.textContent).toContain('Needs manual review');
        expect(content.textContent).toContain('Writing, Call, and Break start together');
        expect(content.textContent).toContain('Manual note contains Timer');
        expect(content.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    });

    test('places user descriptions in text nodes instead of interpreting markup', () => {
        const content = buildActivityOverlapRepairPreview(
            preview({
                changes: [
                    {
                        ...preview().changes[0],
                        description: '<img src=x onerror=alert(1)>'
                    }
                ]
            })
        );

        expect(content.querySelector('img')).toBeNull();
        expect(content.textContent).toContain('<img src=x onerror=alert(1)>');
    });
});

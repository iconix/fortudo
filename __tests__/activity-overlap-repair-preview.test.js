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
        expect(
            [...selections].every((selection) => selection.className.includes('accent-violet'))
        ).toBe(true);
        expect(
            [...selections].some((selection) => selection.className.includes('accent-amber'))
        ).toBe(false);
        const largeAdjustment = content.querySelector('[data-overlap-large-adjustment]');
        expect(largeAdjustment.textContent).toBe('Large adjustment');
        expect(largeAdjustment.className).toContain('text-slate-400');
        expect(largeAdjustment.className).not.toContain('uppercase');
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

        const unresolvedSection = content.querySelector('[data-overlap-unresolved-list]');
        expect(unresolvedSection).not.toBeNull();
        expect(unresolvedSection.className).toContain('border-slate-600');
        expect(unresolvedSection.className).not.toContain('bg-amber-500');
        expect(content.textContent).toContain(
            'These overlaps need your input before they can be changed.'
        );
        expect(content.textContent).toContain('Needs manual review');
        const unresolvedHeading = content.querySelector('[data-overlap-unresolved-heading]');
        expect(unresolvedHeading.className).toContain('text-slate-200');
        expect(unresolvedHeading.className).not.toContain('text-amber');
        const unresolvedNames = [
            ...content.querySelectorAll('[data-overlap-unresolved-activity-name]')
        ].map((element) => element.textContent);
        expect(unresolvedNames).toEqual(['Writing', 'Call', 'Break', 'Manual note', 'Timer']);
        expect(content.textContent).toContain(
            'These activities start together. Edit or delete one manually.'
        );
        expect(content.textContent).toContain('One activity contains the other.');
        expect(content.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    });

    test('clearly separates unresolved overlaps from selectable repairs', () => {
        const content = buildActivityOverlapRepairPreview(
            preview({
                changes: [preview().changes[0]],
                unresolvedOverlaps: [
                    {
                        reason: 'same-start',
                        activityIds: ['same-a', 'same-b'],
                        descriptions: ['Same-start review', 'Same-start planning']
                    }
                ]
            })
        );

        expect(content.textContent).toContain('Not included in this repair');
        expect(content.textContent).toContain(
            'These activities will not change when you repair the selected items.'
        );
        expect(content.querySelector('[data-overlap-unresolved-heading]').textContent).not.toBe(
            'Needs manual review'
        );
        const names = [...content.querySelectorAll('[data-overlap-unresolved-activity-name]')].map(
            (element) => element.textContent
        );
        expect(names).toEqual(['Same-start review', 'Same-start planning']);
        expect(content.textContent).toContain(
            'These activities start together. Edit or delete one manually.'
        );
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

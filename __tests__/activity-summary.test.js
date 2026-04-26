/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    getTaxonomySnapshot: jest.fn(() => ({
        categories: [
            { key: 'work/deep', groupKey: 'work' },
            { key: 'work/admin', groupKey: 'work' },
            { key: 'personal/planning', groupKey: 'personal' },
            { key: 'ghost/focus', groupKey: 'ghost' }
        ]
    })),
    getGroupByKey: jest.fn((key) => {
        if (key === 'work') {
            return { key: 'work', label: 'Work', color: '#0f172a' };
        }
        if (key === 'personal') {
            return { key: 'personal', label: 'Personal', color: '#f97316' };
        }
        if (key === 'solo') {
            return { key: 'solo', label: 'Solo', color: '#a855f7' };
        }

        return null;
    }),
    getCategoryByKey: jest.fn((key) => {
        if (key === 'work/deep') {
            return {
                key: 'work/deep',
                label: 'Deep Work',
                groupKey: 'work',
                color: '#0ea5e9'
            };
        }
        if (key === 'work/admin') {
            return {
                key: 'work/admin',
                label: 'Admin',
                groupKey: 'work',
                color: '#14b8a6'
            };
        }
        if (key === 'personal/planning') {
            return {
                key: 'personal/planning',
                label: 'Planning',
                groupKey: 'personal',
                color: '#f97316'
            };
        }
        if (key === 'ghost/focus') {
            return {
                key: 'ghost/focus',
                label: 'Focus',
                groupKey: 'ghost',
                color: '#22c55e'
            };
        }

        return null;
    }),
    resolveCategoryKey: jest.fn((key) => {
        if (key === 'work') {
            return {
                kind: 'group',
                record: { key: 'work', label: 'Work', color: '#0f172a' }
            };
        }
        if (key === 'work/deep') {
            return {
                kind: 'category',
                record: {
                    key: 'work/deep',
                    label: 'Deep Work',
                    groupKey: 'work',
                    color: '#0ea5e9'
                }
            };
        }
        if (key === 'work/admin') {
            return {
                kind: 'category',
                record: {
                    key: 'work/admin',
                    label: 'Admin',
                    groupKey: 'work',
                    color: '#14b8a6'
                }
            };
        }
        if (key === 'personal/planning') {
            return {
                kind: 'category',
                record: {
                    key: 'personal/planning',
                    label: 'Planning',
                    groupKey: 'personal',
                    color: '#f97316'
                }
            };
        }
        if (key === 'ghost/focus') {
            return {
                kind: 'category',
                record: {
                    key: 'ghost/focus',
                    label: 'Focus',
                    groupKey: 'ghost',
                    color: '#22c55e'
                }
            };
        }
        if (key === 'solo') {
            return {
                kind: 'group',
                record: { key: 'solo', label: 'Solo', color: '#a855f7' }
            };
        }

        return null;
    })
}));

import { buildActivitySummaryModel } from '../public/js/activities/summary.js';

describe('activity summary selectors', () => {
    test('builds a parent-group summary with counts and totals', () => {
        const model = buildActivitySummaryModel([
            {
                id: 'activity-1',
                category: 'work/deep',
                duration: 45
            },
            {
                id: 'activity-2',
                category: 'work',
                duration: 35
            },
            {
                id: 'activity-3',
                category: 'personal/planning',
                duration: 30
            },
            {
                id: 'activity-4',
                category: null,
                duration: 15
            }
        ]);

        expect(model.totalDuration).toBe(125);
        expect(model.totalCount).toBe(4);
        expect(model.summaryItems.map((item) => item.key)).toEqual([
            'work',
            'personal',
            'uncategorized'
        ]);
        expect(model.summaryItems[0]).toEqual(
            expect.objectContaining({
                key: 'work',
                label: 'Work',
                duration: 80,
                count: 2
            })
        );
    });

    test('rolls missing child categories and missing parent groups into stable buckets', () => {
        const model = buildActivitySummaryModel([
            {
                id: 'activity-1',
                category: 'work/missing',
                duration: 20
            },
            {
                id: 'activity-2',
                category: 'ghost/focus',
                duration: 20
            },
            {
                id: 'activity-3',
                category: 'ghost',
                duration: 25
            }
        ]);

        expect(model.summaryItems).toEqual([
            expect.objectContaining({ key: 'ghost', label: 'Ghost', duration: 45, count: 2 }),
            expect.objectContaining({ key: 'work', label: 'Work', duration: 20, count: 1 })
        ]);
    });

    test('builds expanded child detail for the selected group with unspecified fallback', () => {
        const model = buildActivitySummaryModel(
            [
                {
                    id: 'activity-1',
                    category: 'work/deep',
                    duration: 45
                },
                {
                    id: 'activity-2',
                    category: 'work/admin',
                    duration: 20
                },
                {
                    id: 'activity-3',
                    category: 'work',
                    duration: 15
                },
                {
                    id: 'activity-4',
                    category: 'personal/planning',
                    duration: 30
                }
            ],
            'work'
        );

        expect(model.expandedGroup).toEqual(
            expect.objectContaining({
                key: 'work',
                label: 'Work',
                totalDuration: 80
            })
        );
        expect(model.expandedGroup.items).toEqual([
            expect.objectContaining({ key: 'work/deep', label: 'Deep Work', duration: 45 }),
            expect.objectContaining({ key: 'work/admin', label: 'Admin', duration: 20 }),
            expect.objectContaining({
                key: 'work::__unspecified',
                label: 'Unspecified',
                duration: 15
            })
        ]);
    });

    test('uses the parent label when the expanded group has no children', () => {
        const model = buildActivitySummaryModel(
            [
                {
                    id: 'activity-1',
                    category: 'solo',
                    duration: 20
                }
            ],
            'solo'
        );

        expect(model.expandedGroup.items).toEqual([
            expect.objectContaining({ key: 'solo::__unspecified', label: 'Solo', duration: 20 })
        ]);
    });

    test('does not create expanded detail for uncategorized or unknown groups', () => {
        expect(
            buildActivitySummaryModel([{ id: 'a', category: null, duration: 10 }], 'uncategorized')
                .expandedGroup
        ).toBeNull();
        expect(
            buildActivitySummaryModel([{ id: 'a', category: 'work/deep', duration: 10 }], 'unknown')
                .expandedGroup
        ).toBeNull();
    });
});

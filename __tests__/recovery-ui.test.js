import { initializeRecoveryUI } from '../public/js/recovery-ui.js';

describe('guided repair dialog', () => {
    let signal, session, ui, reload, onChange;
    beforeEach(() => {
        document.body.innerHTML = '<button id="recovery-copies-btn">Recovery copies</button>';
        signal = new AbortController();
        reload = jest.fn();
        onChange = jest.fn();
        session = {
            archiveId: null,
            list: jest.fn().mockResolvedValue([]),
            close: jest.fn(),
            service: {
                preserve: jest.fn().mockResolvedValue({
                    _id: 'recovery-a',
                    bundle: { manifest: { leafCount: 2 } }
                }),
                load: jest.fn().mockResolvedValue({
                    phase: 'review',
                    decisions: {},
                    bundle: { manifest: { leafCount: 2 } }
                }),
                rebuild: jest.fn(),
                review: jest.fn().mockResolvedValue([]),
                restore: jest.fn(),
                reconsider: jest.fn(),
                keep: jest.fn()
            },
            download: jest.fn()
        };
        ui = initializeRecoveryUI({
            signal: signal.signal,
            openSession: async () => session,
            reload,
            onChange,
            notify: jest.fn()
        });
    });
    afterEach(() => signal.abort());
    test('failed verification never rebuilds and leaves an actionable retry', async () => {
        session.service.preserve.mockRejectedValue(new Error('Verification failed.'));
        await ui.open();
        document.querySelector('[data-action="repair"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.service.rebuild).not.toHaveBeenCalled();
        expect(document.querySelector('[role="alert"]').textContent).toMatch(/verification/i);
        expect(document.querySelector('[data-action="repair"]')).not.toBeNull();
    });

    test.each(['preserve', 'rebuild'])(
        'stops showing progress after %s fails and permits a successful retry',
        async (stage) => {
            session.service[stage].mockRejectedValueOnce(new Error('Could not finish this step.'));
            await ui.open();
            document.querySelector('[data-action="repair"]').click();
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(document.querySelector('h2').textContent).toBe('Repair couldn’t finish');
            expect(document.querySelector('dialog').textContent).toContain(
                'Your original local copy is unchanged.'
            );
            expect(document.querySelector('.recovery-progress')).toBeNull();
            expect(document.querySelector('[role="status"]')).toBeNull();
            expect(document.querySelector('[role="alert"]').textContent).toBe(
                'Could not finish this step.'
            );
            expect(document.querySelector('dialog').hasAttribute('aria-busy')).toBe(false);
            const retry = document.querySelector('[data-action="repair"]');
            expect(retry.disabled).toBe(false);
            expect(reload).not.toHaveBeenCalled();

            retry.click();
            expect(document.querySelector('h2').textContent).toBe('Repairing this room');
            expect(document.querySelector('.recovery-progress')).not.toBeNull();
            expect(document.querySelector('[role="alert"]')).toBeNull();
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(reload).toHaveBeenCalledTimes(1);
        }
    );

    test('finishes with a durable restored count and a prominent Done action', async () => {
        session.archiveId = 'recovery-a';
        session.service.load.mockResolvedValue({
            phase: 'review',
            decisions: { one: 'restored', two: 'kept' }
        });
        await ui.open();
        expect(document.querySelector('dialog').textContent).toMatch(/1 change restored/);
        expect(document.querySelector('dialog > p').textContent).toBe('1 change restored.');
        expect(document.querySelector('[data-action="close"]')).toBeNull();
        expect(document.querySelector('[data-action="reconsider"]').textContent).toBe(
            'Review skipped changes'
        );
        expect(document.querySelector('[data-action="reconsider"]').classList).toContain(
            'recovery-link'
        );
        expect(document.querySelector('[data-action="done"]')).not.toBeNull();
        expect(document.querySelector('[data-action="done"]').parentElement).toBe(
            document.querySelector('[data-action="reconsider"]').parentElement
        );
        expect(document.querySelector('[data-action="done"]').parentElement.classList).toContain(
            'recovery-actions'
        );
        document.querySelector('[data-action="done"]').click();
        expect(document.querySelector('dialog')).toBeNull();
    });

    test('shows readable saved and current versions with metadata collapsed', async () => {
        session.archiveId = 'recovery-a';
        session.service.review.mockResolvedValue([
            {
                id: 'task-a',
                local: {
                    description: 'Saved title',
                    status: 'completed',
                    type: 'scheduled',
                    priority: 'high',
                    duration: 30,
                    startDateTime: '2026-10-21T09:00:00Z',
                    category: 'Work'
                },
                current: { description: 'Current title' },
                proposed: { _id: 'task-a', description: 'Saved title' },
                warnings: []
            }
        ]);
        await ui.open();
        expect(document.querySelector('.recovery-comparison').textContent).toMatch(
            /Saved title.*Completed.*Scheduled task.*High priority.*30 min.*Current title/
        );
        expect(document.querySelector('section > p').textContent).toBe(
            'Your saved description differs.'
        );
        expect(document.querySelector('details').open).toBe(false);
        expect(
            [...document.querySelectorAll('details summary')].map((node) => node.textContent)
        ).toEqual(['Edit description', 'Troubleshooting details']);
        expect(document.querySelector('[data-action="restore"]').classList).toContain(
            'recovery-primary'
        );
    });
    test.each(['keep', 'restore'])(
        'preserves other review drafts during %s, including edits made while waiting',
        async (action) => {
            session.archiveId = 'recovery-a';
            const entries = ['one', 'two', 'three'].map((id) => ({
                key: `${id}@1-a`,
                id,
                local: { description: id },
                current: null,
                proposed: { _id: id, description: id, priority: 'medium' },
                warnings: []
            }));
            session.service.review
                .mockResolvedValueOnce(entries)
                .mockResolvedValue(entries.slice(1));
            let finish;
            session.service[action].mockImplementation(
                () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    })
            );
            await ui.open();
            const descriptionEditor = document
                .querySelector('[aria-label="Saved description: two"]')
                .closest('details');
            expect(descriptionEditor).not.toBeNull();
            expect(descriptionEditor.open).toBe(false);
            descriptionEditor.open = true;
            document.querySelector('[aria-label="Saved description: two"]').value = 'Edited second';
            const editor = document.querySelector('[aria-label="Record to restore: three"]');
            editor.value = JSON.stringify({ ...entries[2].proposed, priority: 'high' });
            editor.closest('details').open = true;
            document.querySelector(`[data-action="${action}"]`).click();
            document.querySelector('[aria-label="Saved description: two"]').value =
                'Edited while waiting';
            finish();
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(document.querySelector('[aria-label="Saved description: two"]').value).toBe(
                'Edited while waiting'
            );
            expect(
                JSON.parse(document.querySelector('[aria-label="Record to restore: three"]').value)
                    .priority
            ).toBe('high');
            expect(
                document.querySelector('[aria-label="Record to restore: three"]').closest('details')
                    .open
            ).toBe(true);
            expect(
                document.querySelector('[aria-label="Saved description: two"]').closest('details')
                    .open
            ).toBe(true);
            expect(document.activeElement.textContent).toBe('two');
        }
    );

    test('refreshes untouched proposals after category mapping changes', async () => {
        session.archiveId = 'recovery-a';
        const entry = {
            id: 'task',
            local: { description: 'Task' },
            current: null,
            proposed: { _id: 'task', description: 'Task', category: null },
            warnings: []
        };
        session.service.review
            .mockResolvedValueOnce([entry])
            .mockResolvedValue([{ ...entry, proposed: { ...entry.proposed, category: 'work' } }]);
        await ui.open();
        document.querySelector('[data-action="keep"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(JSON.parse(document.querySelector('textarea').value).category).toBe('work');
    });

    test('shows category names, group membership and archived state outside advanced JSON', async () => {
        session.archiveId = 'recovery-a';
        session.service.review.mockResolvedValue([
            {
                id: 'config-categories',
                local: {
                    _id: 'config-categories',
                    groups: [{ id: 'g', key: 'work', label: 'Office' }],
                    categories: [
                        { key: 'writing', label: 'Writing', groupId: 'g', status: 'archived' }
                    ]
                },
                current: {
                    _id: 'config-categories',
                    groups: [{ id: 'g', key: 'work', label: 'Work' }],
                    categories: [{ key: 'meetings', label: 'Meetings', groupKey: 'work' }]
                },
                proposed: { _id: 'config-categories' },
                warnings: []
            }
        ]);
        await ui.open();
        const comparison = document.querySelector('.recovery-comparison');
        expect(comparison.textContent).toMatch(
            /Office.*Writing.*Office.*Archived.*Work.*Meetings.*Work/
        );
        expect(comparison.querySelector('details')).toBeNull();
    });

    test('keeps malformed category records reviewable for correction', async () => {
        session.archiveId = 'recovery-a';
        session.service.review.mockResolvedValue([
            {
                id: 'config-categories',
                local: {
                    _id: 'config-categories',
                    groups: {},
                    categories: [null, { key: 'loose' }]
                },
                current: { _id: 'config-categories', groups: [null], categories: {} },
                proposed: { _id: 'config-categories' },
                warnings: []
            }
        ]);
        await ui.open();
        expect(document.querySelector('.recovery-comparison').textContent).toMatch(
            /No groups.*loose.*No categories/
        );
        expect(document.querySelector('textarea')).not.toBeNull();
    });

    test('requires a verified local archive before offering rebuild and never requires a claimed disk save', async () => {
        await ui.open();
        expect(document.querySelector('dialog').textContent).toMatch(/original.*kept/i);
        document.querySelector('[data-action="repair"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.service.preserve).toHaveBeenCalledTimes(1);
        expect(document.querySelector('dialog').textContent).not.toMatch(/saved and verified/i);
        expect(document.querySelector('[data-action="download"]')).toBeNull();
        expect(document.querySelector('dialog').textContent).not.toMatch(/safekeeping/i);
        expect(session.service.rebuild).toHaveBeenCalledWith('recovery-a');
        expect(reload).toHaveBeenCalledTimes(1);
    });
    test('reviews choices, escapes saved content, and keeps the archive after restoring', async () => {
        session.archiveId = 'recovery-a';
        session.service.load.mockResolvedValue({ bundle: { manifest: { leafCount: 1 } } });
        session.service.review
            .mockResolvedValueOnce([
                {
                    key: 'task-a@1-a',
                    id: 'task-a',
                    local: { description: '<script>bad()</script>' },
                    current: null,
                    proposed: { _id: 'task-a', description: 'Draft' },
                    warnings: []
                }
            ])
            .mockResolvedValue([]);
        await ui.open();
        expect(document.querySelector('dialog script')).toBeNull();
        document.querySelector('[data-action="restore"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.service.restore).toHaveBeenCalledWith(
            'recovery-a',
            expect.any(Object),
            undefined,
            { _id: 'task-a', description: 'Draft' }
        );
        expect(onChange).toHaveBeenCalled();
        expect(document.querySelector('dialog').textContent).toMatch(/room repaired/i);
        expect(document.querySelector('[data-action="download"]')).toBeNull();
    });
    test('shows failures without losing the review or edited input', async () => {
        session.archiveId = 'recovery-a';
        session.service.load.mockResolvedValue({ bundle: { manifest: { leafCount: 1 } } });
        session.service.review.mockResolvedValue([
            {
                key: 'task-a@1-a',
                id: 'task-a',
                local: { description: 'Draft' },
                current: null,
                proposed: { _id: 'task-a' },
                warnings: []
            }
        ]);
        session.service.restore.mockRejectedValue(new Error('Current record changed.'));
        await ui.open();
        document.querySelector('textarea').value = '{"_id":"task-a","description":"Kept input"}';
        document.querySelector('[data-action="restore"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(document.querySelector('[role="alert"]').textContent).toMatch(/changed/i);
        expect(document.querySelector('textarea').value).toContain('Kept input');
        signal.abort();
        expect(document.querySelector('dialog')).toBeNull();
    });

    test('opens a saved copy from Settings, supports downloads and reconsidering kept changes', async () => {
        session.list.mockResolvedValue([
            { id: 'recovery-a', createdAt: '2026-10-21T13:20:15.394Z', count: 2 }
        ]);
        session.service.load.mockResolvedValue({
            _id: 'recovery-a',
            phase: 'saved',
            bundle: { manifest: { leafCount: 2 } }
        });
        document.getElementById('recovery-copies-btn').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(document.querySelector('.recovery-history').open).toBe(false);
        expect(document.querySelector('.recovery-history summary').textContent).toBe(
            'Saved copies'
        );
        expect(document.querySelector('option').textContent).not.toContain('2026-10-21T');
        expect(document.querySelector('[data-action="download"]').closest('details')).toBe(
            document.querySelector('.recovery-history')
        );
        document.querySelector('[data-action="open-copy"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        document.querySelector('[data-action="download"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.download).toHaveBeenCalledWith('recovery-a');
        document.querySelector('[data-action="close"]').click();
        expect(document.querySelector('dialog')).toBeNull();
        session.archiveId = 'recovery-a';
        session.service.load.mockResolvedValue({ decisions: { one: 'kept' } });
        await ui.open();
        expect(document.querySelector('[data-action="download"]')).toBeNull();
        document.querySelector('[data-action="reconsider"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.service.reconsider).toHaveBeenCalledWith('recovery-a');
    });

    test('omits skipped-change action when there are no skipped decisions', async () => {
        session.archiveId = 'recovery-a';
        await ui.open();
        expect(document.querySelector('[data-action="reconsider"]')).toBeNull();
        expect(document.querySelector('.recovery-history')).toBeNull();
        expect(document.querySelector('[data-action="download"]')).toBeNull();
    });

    test('starts a fresh repair when a saved copy belongs to an earlier replica', async () => {
        session.database = { name: 'current-replica' };
        session.list.mockResolvedValue([{ id: 'old', createdAt: 'yesterday', count: 2 }]);
        session.service.load.mockResolvedValue({
            _id: 'old',
            phase: 'saved',
            bundle: {
                manifest: { leafCount: 2, localDatabaseName: 'original-replica' }
            }
        });
        await ui.open({ fromSettings: true });
        document.querySelector('[data-action="open-copy"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(document.querySelector('[data-action="continue"]')).toBeNull();
        expect(document.querySelector('dialog').textContent).toMatch(/earlier local copy/i);
        document.querySelector('[data-action="repair"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.service.preserve).toHaveBeenCalledTimes(1);
        expect(session.service.rebuild).toHaveBeenCalledWith('recovery-a');
    });

    test('can continue an interrupted repair from its existing verified archive', async () => {
        session.list.mockResolvedValue([{ id: 'recovery-a', createdAt: 'today', count: 2 }]);
        session.service.load.mockResolvedValue({
            _id: 'recovery-a',
            phase: 'saved',
            bundle: { manifest: { leafCount: 2 } }
        });
        await ui.open({ fromSettings: true });
        document.querySelector('[data-action="open-copy"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        document.querySelector('[data-action="continue"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.service.preserve).not.toHaveBeenCalled();
        expect(session.service.rebuild).toHaveBeenCalledWith('recovery-a');
        expect(reload).toHaveBeenCalledTimes(1);
    });

    test('can keep a record and handles invalid edited JSON without a write', async () => {
        session.archiveId = 'recovery-a';
        session.service.review.mockResolvedValue([
            {
                key: 'x',
                id: 'x',
                local: { _deleted: true },
                current: { description: 'Cloud' },
                proposed: { _id: 'x', _deleted: true },
                warnings: ['Review deletion']
            }
        ]);
        await ui.open();
        document.querySelector('textarea').value = 'bad JSON';
        document.querySelector('[data-action="restore"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.service.restore).not.toHaveBeenCalled();
        expect(document.querySelector('[role="alert"]').textContent).toMatch(/valid JSON/i);
        session.service.review.mockResolvedValue([]);
        document.querySelector('[data-action="keep"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.service.keep).toHaveBeenCalledWith('recovery-a', expect.any(Object));
    });

    test('resumes only pending reviews and closes its independent handles', async () => {
        await ui.resume();
        expect(session.close).toHaveBeenCalledTimes(1);
        session.archiveId = 'recovery-a';
        session.service.review.mockResolvedValue([{ id: 'pending' }]);
        await ui.resume();
        expect(session.close).toHaveBeenCalledTimes(2);
        signal.abort();
        await ui.open();
        expect(document.querySelector('dialog')).toBeNull();
    });

    test('prevents duplicate operations, closing and Escape while a copy is being verified', async () => {
        let finish;
        session.service.preserve.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        await ui.open();
        const repairButton = document.querySelector('[data-action="repair"]');
        repairButton.click();
        repairButton.click();
        document.querySelector('[data-action="close"]').click();
        const dialog = document.querySelector('dialog');
        const cancel = new Event('cancel', { cancelable: true });
        dialog.dispatchEvent(cancel);
        expect(cancel.defaultPrevented).toBe(true);
        expect(session.service.preserve).toHaveBeenCalledTimes(1);
        finish({ _id: 'recovery-a', bundle: { manifest: { leafCount: 1 } } });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(session.service.rebuild).toHaveBeenCalledWith('recovery-a');
    });

    test('offers a fresh archive if a previously repaired room needs repair again', async () => {
        session.archiveId = 'recovery-previous';
        session.needsRepair = true;
        await ui.open();
        expect(document.querySelector('[data-action="repair"]')).not.toBeNull();
        expect(session.service.review).not.toHaveBeenCalled();
    });
});

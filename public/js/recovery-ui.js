/** Accessible, resumable recovery review. Record content is always rendered as text. */
export function initializeRecoveryUI({
    signal,
    openSession,
    notify,
    onChange,
    reload = () => window.location.reload()
}) {
    let dialog = null;
    let session = null;
    let opening = false;
    let busy = false;
    let archiveId = null;
    let openedFromSettings = false;
    let copies = [];
    let previousFocus;
    const reviewDrafts = new Map();
    const reviewFields = new Map();
    const settingsButton = document.getElementById('recovery-copies-btn');

    function close() {
        if (busy && !signal.aborted) return;
        dialog?.remove();
        dialog = null;
        void Promise.resolve(session?.close()).catch(() => {});
        session = null;
        previousFocus?.focus();
    }
    signal.addEventListener('abort', close, { once: true });
    document.addEventListener(
        'fortudo-replica-replaced',
        () => {
            notify(
                'This room was repaired in another tab. Reload to continue. Your draft is kept.',
                {
                    theme: 'violet',
                    dedupeKey: 'replica-replaced',
                    action: { label: 'Reload', onClick: reload }
                }
            );
        },
        { signal }
    );

    function element(tag, text, parent = dialog) {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        parent.append(node);
        return node;
    }
    function button(label, action, run, parent = dialog) {
        const node = element('button', label, parent);
        node.type = 'button';
        node.disabled = busy;
        node.dataset.action = action;
        node.className =
            'px-3 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-700';
        node.addEventListener('click', () => {
            if (action === 'close' || action === 'done') close();
            else void perform(run);
        });
        if (['repair', 'restore', 'done', 'continue'].includes(action))
            node.classList.add('recovery-primary');
        else if (action === 'keep') node.classList.add('recovery-secondary');
        return node;
    }
    async function perform(run) {
        if (busy || signal.aborted) return;
        busy = true;
        const activeDialog = dialog;
        activeDialog.setAttribute('aria-busy', 'true');
        activeDialog.querySelectorAll('button').forEach((node) => {
            node.disabled = true;
        });
        activeDialog.querySelector('[role="alert"]')?.remove();
        try {
            await run();
        } catch (error) {
            if (!signal.aborted && dialog === activeDialog) {
                const alert = element(
                    'p',
                    error.message || 'Recovery could not finish. Your saved copy is kept.'
                );
                alert.setAttribute('role', 'alert');
                alert.className = 'text-rose-400';
            }
        } finally {
            busy = false;
            if (dialog === activeDialog) {
                activeDialog.removeAttribute('aria-busy');
                activeDialog.querySelectorAll('button').forEach((node) => {
                    node.disabled = false;
                });
            }
        }
    }
    function shell(title, focusHeading = true, showClose = true) {
        if (signal.aborted) return false;
        dialog.replaceChildren();
        delete dialog.dataset.recoveryStage;
        const header = element('header');
        const heading = element('h2', title, header);
        heading.id = 'recovery-dialog-title';
        heading.className = 'text-xl text-violet-300 mb-4';
        if (showClose) button('Close', 'close', close, header);
        heading.tabIndex = -1;
        if (focusHeading) heading.focus();
        return true;
    }
    function savedCopies() {
        if (!openedFromSettings || !copies.length) return;
        const details = element('details');
        details.className = 'recovery-history';
        element('summary', 'Saved copies', details);
        const label = element('label', 'Recovery copy', details);
        const select = element('select', null, label);
        select.className = 'bg-slate-900 border border-slate-600 p-2 rounded-lg';
        for (const copy of copies) {
            const date = new Date(copy.createdAt);
            const when = Number.isFinite(date.getTime())
                ? date.toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                  })
                : 'Date unavailable';
            const option = element(
                'option',
                `${when} · ${copy.count} ${copy.count === 1 ? 'record' : 'records'}`,
                select
            );
            option.value = copy.id;
        }
        if (copies.some((copy) => copy.id === archiveId)) select.value = archiveId;
        const actions = element('div', null, details);
        actions.className = 'recovery-actions';
        button(
            'Open saved copy',
            'open-copy',
            async () => {
                const saved = await session.service.load(select.value);
                archiveId = saved._id;
                if (
                    saved.phase === 'saved' ||
                    (session.database &&
                        session.database.name === saved.bundle.manifest.localDatabaseName)
                )
                    showSaved(saved);
                else await showReview();
            },
            actions
        );
        button('Download debug copy', 'download', () => session.download(select.value), actions);
    }
    function describeRecord(record, parent, other = null, savedVersion = false) {
        if (!record || record._deleted) {
            element('p', 'Not in this room', parent);
            return;
        }
        if (record.description) element('p', record.description, parent);
        if (record._id === 'config-categories') {
            for (const [field, heading] of [
                ['groups', 'Groups'],
                ['categories', 'Categories']
            ]) {
                element('h4', heading, parent);
                const rows = Array.isArray(record[field]) ? record[field] : [];
                if (!rows.length) element('p', `No ${heading.toLowerCase()}`, parent);
                const list = element('ul', null, parent);
                list.className = 'recovery-taxonomy';
                for (const row of rows) {
                    if (!row || typeof row !== 'object') continue;
                    const group = (Array.isArray(record.groups) ? record.groups : []).find(
                        (group) =>
                            row.groupId
                                ? group?.id === row.groupId
                                : group?.key === (row.groupKey || row.group)
                    );
                    const parts = [
                        row.label || row.key || 'Unnamed',
                        field === 'categories' ? group?.label || row.groupKey || row.group : null,
                        row.status === 'archived' ? 'Archived' : 'Active'
                    ];
                    const prior = (Array.isArray(other?.[field]) ? other[field] : []).find(
                        (item) => item && ((row.id && item.id === row.id) || item.key === row.key)
                    );
                    if (!prior) parts.push(savedVersion ? 'Saved only' : 'Current only');
                    else if (
                        ['label', 'status', 'groupId', 'groupKey', 'group', 'color'].some(
                            (key) => row[key] !== prior[key]
                        )
                    )
                        parts.push('Changed');
                    element('li', parts.filter(Boolean).join(' · '), list);
                }
            }
            return;
        }
        const labels = {
            incomplete: 'To do',
            completed: 'Completed',
            scheduled: 'Scheduled task',
            unscheduled: 'Unscheduled task',
            high: 'High priority',
            medium: 'Medium priority',
            low: 'Low priority'
        };
        const values = [labels[record.status], labels[record.type], labels[record.priority]];
        if (record.category) values.push(record.category);
        if (Number.isFinite(record.duration)) values.push(`${record.duration} min`);
        if (Number.isFinite(record.estDuration) && record.estDuration > 0)
            values.push(`Est. ${record.estDuration} min`);
        if (record.startDateTime && Number.isFinite(Date.parse(record.startDateTime)))
            values.push(new Date(record.startDateTime).toLocaleString());
        element('p', values.filter(Boolean).join(' · '), parent).className = 'recovery-meta';
    }
    function rememberReviewDrafts() {
        for (const [key, fields] of reviewFields) {
            if (!fields.editor.isConnected) continue;
            reviewDrafts.set(key, {
                description:
                    fields.description?.value !== fields.initialDescription
                        ? fields.description?.value
                        : undefined,
                json: fields.editor.value !== fields.initialJson ? fields.editor.value : undefined,
                expanded: fields.advanced.open,
                descriptionOpen: fields.descriptionEditor?.open
            });
        }
        reviewFields.clear();
    }
    async function showReview(decidedKey = null) {
        const entries = await session.service.review(archiveId, session.database);
        const saved = await session.service.load(archiveId);
        if (signal.aborted || !dialog) return;
        const previousKeys = [...reviewFields.keys()];
        const decidedIndex = previousKeys.indexOf(decidedKey);
        const scrollTop = dialog.scrollTop;
        const bounds = dialog.getBoundingClientRect();
        const anchorTop = Math.max(
            bounds.top + 12,
            Math.min(
                bounds.bottom - 44,
                reviewFields.get(decidedKey)?.section.getBoundingClientRect().top ?? bounds.top + 12
            )
        );
        // Capture at redraw time, including edits made while a decision was saving.
        // Only retain changed fields so newly mapped category proposals can refresh.
        rememberReviewDrafts();
        if (decidedKey) reviewDrafts.delete(decidedKey);
        const restored = Object.values(saved.decisions || {}).filter(
            (value) => value === 'restored'
        ).length;
        if (
            !shell(
                entries.length
                    ? `Review ${entries.length} saved ${entries.length === 1 ? 'change' : 'changes'}`
                    : 'Room repaired',
                !decidedKey || !entries.length,
                entries.length > 0
            )
        )
            return;
        dialog.dataset.recoveryStage = entries.length ? 'review' : 'complete';
        element(
            'p',
            entries.length
                ? 'Choose what to bring back. Your original copy stays saved.'
                : `${restored} ${restored === 1 ? 'change restored' : 'changes restored'}.`
        );
        if (!entries.length) {
            const actions = element('div');
            actions.className = 'recovery-actions';
            button('Done', 'done', close, actions);
            if (Object.values(saved.decisions || {}).includes('kept'))
                button(
                    'Review skipped changes',
                    'reconsider',
                    async () => {
                        await session.service.reconsider(archiveId);
                        await showReview();
                    },
                    actions
                ).classList.add('recovery-link');
        }
        const sections = [];
        for (const entry of entries) {
            const draftKey = JSON.stringify([archiveId, entry.key || entry.id]);
            const draft = reviewDrafts.get(draftKey);
            const section = element('section');
            sections.push(section);
            section.className = 'border border-slate-600 rounded-lg p-3 my-3';
            const title =
                entry.local.description ||
                { 'config-categories': 'Categories', 'config-running-activity': 'Saved timer' }[
                    entry.id
                ] ||
                'Saved setting';
            element('h3', title, section).tabIndex = -1;
            element(
                'p',
                entry.local._deleted
                    ? 'You deleted this on this device. Applying it will remove the current version.'
                    : entry.current && !entry.current._deleted
                      ? entry.local.description !== entry.current.description
                          ? 'Your saved description differs.'
                          : 'Your saved changes differ from the refreshed room.'
                      : 'Not in the refreshed room.',
                section
            );
            if (entry.id === 'config-running-activity')
                element('p', 'Restoring this setting may resume a saved timer.', section);
            for (const warning of entry.warnings) element('p', warning, section);
            if (entry.current && !entry.current._deleted) {
                const comparison = element('div', null, section);
                comparison.className = 'recovery-comparison';
                const localVersion = element('div', null, comparison);
                element('h4', 'Your saved version', localVersion);
                describeRecord(entry.local, localVersion, entry.current, true);
                const currentVersion = element('div', null, comparison);
                element('h4', 'Current version', currentVersion);
                describeRecord(entry.current, currentVersion, entry.local);
            } else describeRecord({ ...entry.local, description: null }, section, null, true);
            let description = null;
            let descriptionEditor = null;
            if (!entry.local._deleted && typeof entry.proposed.description === 'string') {
                descriptionEditor = element('details', null, section);
                descriptionEditor.open = draft?.descriptionOpen || false;
                element('summary', 'Edit description', descriptionEditor);
                const descriptionLabel = element('label', 'Description', descriptionEditor);
                description = element('input', null, descriptionLabel);
                description.value = draft?.description ?? entry.proposed.description;
                description.className =
                    'bg-slate-900 border border-slate-600 rounded-lg p-3 w-full';
                description.setAttribute('aria-label', `Saved description: ${entry.id}`);
            }
            const advanced = element('details', null, section);
            advanced.open = draft?.expanded || false;
            element('summary', 'Troubleshooting details', advanced);
            element('h4', 'Saved record', advanced);
            element('pre', JSON.stringify(entry.local, null, 2), advanced).style.whiteSpace =
                'pre-wrap';
            element('h4', 'Current record', advanced);
            element('pre', JSON.stringify(entry.current, null, 2), advanced).style.whiteSpace =
                'pre-wrap';
            const editorLabel = element('label', 'Record fields (advanced)', advanced);
            const editor = element('textarea', null, editorLabel);
            const initialJson = JSON.stringify(entry.proposed, null, 2);
            editor.value = draft?.json ?? initialJson;
            editor.className =
                'bg-slate-900 text-slate-200 border border-slate-600 rounded-lg p-3 w-full';
            editor.rows = 7;
            editor.setAttribute('aria-label', `Record to restore: ${entry.id}`);
            reviewFields.set(draftKey, {
                description,
                descriptionEditor,
                section,
                editor,
                advanced,
                initialJson,
                initialDescription: entry.proposed.description
            });
            const actions = element('div', null, section);
            actions.className = 'recovery-actions';
            button(
                entry.local._deleted ? 'Apply saved deletion' : 'Restore change',
                'restore',
                async () => {
                    let edited;
                    try {
                        edited = JSON.parse(editor.value);
                    } catch {
                        throw new Error(
                            'The record needs valid JSON. Correct it before restoring.'
                        );
                    }
                    if (description && description.value !== entry.proposed.description)
                        edited.description = description.value;
                    await session.service.restore(archiveId, entry, session.database, edited);
                    await onChange();
                    await showReview(draftKey);
                },
                actions
            );
            button(
                'Keep current',
                'keep',
                async () => {
                    await session.service.keep(archiveId, entry);
                    await showReview(draftKey);
                },
                actions
            );
        }
        if (decidedIndex >= 0 && sections.length) {
            const next = sections[Math.min(decidedIndex, sections.length - 1)];
            dialog.scrollTop = scrollTop;
            next.querySelector('h3').focus({ preventScroll: true });
            dialog.scrollTop += next.getBoundingClientRect().top - anchorTop;
        }
        savedCopies();
    }
    function showSaved(saved) {
        archiveId = saved._id;
        if (!shell('Saved recovery copy')) return;
        element(
            'p',
            `${saved.bundle.manifest.leafCount} records are saved and verified on this device. Your original copy is kept.`
        );
        element('p', 'Keep this browser’s data until review is complete.');
        if (session.database && saved.bundle.manifest.localDatabaseName !== session.database.name) {
            element(
                'p',
                'This is an earlier local copy. A new repair will preserve your current changes; this saved copy stays available.'
            );
            button('Repair this room', 'repair', () => repair());
        } else button('Continue repair', 'continue', () => repair(saved));
        savedCopies();
    }
    async function repair(existing = null) {
        if (!shell('Repairing this room')) return;
        element('p', 'Your original copy stays safe while we refresh this room.');
        const status = element('p', existing ? 'Refreshing this room…' : 'Saving your changes…');
        status.className = 'recovery-progress';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        try {
            const saved = existing || (await session.service.preserve(session.audit));
            if (signal.aborted) return;
            archiveId = saved._id;
            status.textContent = 'Refreshing this room…';
            await session.service.rebuild(archiveId);
            if (!signal.aborted) {
                status.textContent = 'Ready to review.';
                reload();
            }
        } catch (error) {
            if (shell('Repair couldn’t finish')) {
                element('p', 'Your original local copy is unchanged.');
                button('Try repair again', 'repair', () => repair());
            }
            throw error;
        }
    }
    async function open({ fromSettings = false } = {}) {
        if (opening || signal.aborted) return;
        if (dialog) {
            dialog.focus();
            return;
        }
        opening = true;
        openedFromSettings = fromSettings;
        previousFocus = document.activeElement;
        try {
            session = await openSession();
            if (signal.aborted) {
                void session.close();
                return;
            }
            dialog = document.createElement('dialog');
            dialog.className =
                'recovery-dialog bg-slate-800 text-slate-200 border border-slate-600 rounded-lg p-4 sm:p-6';
            dialog.style.cssText =
                'width:min(48rem,calc(100vw - 2rem));max-height:85vh;overflow:auto;';
            dialog.setAttribute('aria-labelledby', 'recovery-dialog-title');
            document.body.append(dialog);
            dialog.addEventListener('cancel', (event) => {
                if (busy) event.preventDefault();
            });
            dialog.addEventListener('close', close);
            if (dialog.showModal) dialog.showModal();
            else dialog.setAttribute('open', '');
            copies = await session.list();
            if (signal.aborted) return;
            archiveId = session.archiveId;
            if (archiveId && !session.needsRepair) await showReview();
            else {
                shell('Repair this room');
                element(
                    'p',
                    'We’ll preserve your local changes, refresh from the cloud, then help you review anything missing. Your original copy is kept.'
                );
                button('Repair this room', 'repair', () => repair());
                savedCopies();
            }
        } catch {
            notify('Recovery could not open. Your local data is kept. Please try again.', {
                theme: 'rose'
            });
            close();
        } finally {
            opening = false;
        }
    }
    settingsButton?.addEventListener('click', () => open({ fromSettings: true }), { signal });
    async function resume() {
        const current = await openSession();
        try {
            const entries =
                current.archiveId && !current.needsRepair
                    ? await current.service.review(current.archiveId, current.database)
                    : [];
            if (!signal.aborted && entries.length)
                notify(
                    'Your recovery copy is saved. Review any missing changes when you’re ready.',
                    {
                        theme: 'violet',
                        dedupeKey: 'recovery-review',
                        action: { label: 'Review changes', onClick: open }
                    }
                );
        } finally {
            await current.close();
        }
    }
    return { open, resume };
}

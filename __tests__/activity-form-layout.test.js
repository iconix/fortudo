/**
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

describe('activity form layout', () => {
    test('activity layout keeps the production shared row and uses an explicit activity-only action group', () => {
        const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
        const customCss = fs.readFileSync(
            path.join(process.cwd(), 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(indexHtml).toContain('id="task-form-fields"');
        expect(indexHtml).toContain('id="task-form-main-row"');
        expect(indexHtml).not.toContain('id="task-form-actions-row"');
        expect(indexHtml).toContain('id="activity-action-group"');
        expect(customCss).toContain('#activity-action-group');
        expect(customCss).toContain('display: contents;');
        expect(customCss).toContain('#task-form.task-form--activity #task-form-main-row');
        expect(customCss).toContain('flex-direction: column;');
        expect(customCss).toContain('#task-form.task-form--activity #activity-action-group');
        expect(customCss).toContain('#task-form.task-form--activity #time-inputs');
        expect(customCss).toContain('grid-template-columns: minmax(8.5rem, 1fr) auto;');
        expect(customCss).toContain("#task-form.task-form--activity input[name='duration-hours']");
        expect(customCss).toContain(
            "#task-form.task-form--activity input[name='duration-minutes']"
        );
        expect(customCss).toContain('width: 4.5rem;');
        expect(customCss).toContain('@media (min-width: 640px)');
        expect(customCss).toContain('#task-form.task-form--activity #activity-action-group');
        expect(customCss).toContain('justify-content: flex-end;');
        expect(customCss).toContain('flex-direction: row;');
        expect(customCss).not.toContain('grid-template-columns: minmax(0, 1fr) auto auto;');
    });

    test('timer display actions stack on mobile before switching back to an inline row', () => {
        const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');

        expect(indexHtml).toContain('id="timer-action-group"');
        expect(indexHtml).toContain('class="flex flex-col gap-3 sm:flex-row sm:justify-end"');
    });
});

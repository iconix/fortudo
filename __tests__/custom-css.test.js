/**
 * @jest-environment node
 */

const fs = require('fs');
const path = require('path');

describe('custom CSS polish hooks', () => {
    test('defines reduced motion and transition utility hooks', () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('.view-panel');
        expect(css).toContain('.action-menu-content');
        expect(css).toContain('[data-timeline-block-id]');
        expect(css).toContain('.settings-reload-prompt');
        expect(css).toContain('.unscheduled-drag-handle');
        expect(css).toContain('.unscheduled-drag-handle:active');
        expect(css).toContain('.unscheduled-drag-handle:disabled');
        expect(css).toContain('touch-action: none');
        expect(css).toMatch(/\.unscheduled-drag-handle:disabled\s*{[^}]*cursor: not-allowed;/);
        expect(css).toContain('.unscheduled-task--dragging');
        expect(css).toContain('.unscheduled-drop-marker');
        expect(css).toMatch(
            /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.unscheduled-task--dragging[\s\S]*transform: none;/
        );
    });
});

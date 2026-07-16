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
        expect(css).toContain('.unscheduled-drag-placeholder');
        expect(css).toMatch(
            /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.unscheduled-task--dragging[\s\S]*transform: none;/
        );
    });

    test('presents the actively dragged task as elevated instead of de-emphasized', () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );
        const draggingRule = css.match(/\.unscheduled-task--dragging\s*{([^}]*)}/)?.[1];

        expect(draggingRule).toContain('opacity: 1;');
        expect(draggingRule).toContain('position: fixed;');
        expect(draggingRule).toContain('pointer-events: none;');
        expect(draggingRule).toContain('transition: none;');
        expect(draggingRule).toContain('transform: translateY(-2px) scale(1.006);');
        expect(draggingRule).not.toContain('background:');
        expect(draggingRule).toContain('outline: 2px solid rgb(129 140 248 / 0.85);');
        expect(draggingRule).toContain('outline-offset: 0;');
        expect(draggingRule).toContain('box-shadow:');
        expect(draggingRule).toContain('z-index: 20;');
        expect(css).toMatch(
            /\.unscheduled-task--dragging \.unscheduled-drag-handle\s*{[^}]*color: rgb\(224 231 255\);[^}]*background-color: rgb\(79 70 229 \/ 0\.22\);[^}]*box-shadow: inset 0 0 0 1px rgb\(165 180 252 \/ 0\.55\);[^}]*cursor: grabbing;/
        );
        expect(css).toMatch(
            /\.unscheduled-drag-placeholder\s*{[^}]*background-color: rgb\(129 140 248 \/ 0\.06\);[^}]*box-shadow: inset 0 0 0 1px rgb\(129 140 248 \/ 0\.3\);/
        );
    });
});

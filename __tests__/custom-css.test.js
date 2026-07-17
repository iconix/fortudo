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
        expect(draggingRule).toContain('outline: 2px solid rgb(232 121 249 / 0.85);');
        expect(draggingRule).toContain('outline-offset: 0;');
        expect(draggingRule).toContain('box-shadow:');
        expect(draggingRule).toContain('z-index: 20;');
        expect(css).toMatch(
            /\.unscheduled-task--dragging \.unscheduled-drag-handle\s*{[^}]*color: rgb\(240 171 252\);[^}]*background-color: rgb\(217 70 239 \/ 0\.16\);[^}]*box-shadow: inset 0 0 0 1px rgb\(232 121 249 \/ 0\.5\);[^}]*cursor: grabbing;/
        );
        expect(css).toMatch(
            /\.unscheduled-drag-placeholder\s*{[^}]*background-color: rgb\(232 121 249 \/ 0\.06\);[^}]*box-shadow: inset 0 0 0 1px rgb\(232 121 249 \/ 0\.3\);/
        );
    });

    test('does not retain unused pre-rebrand visual hooks', () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(css).not.toContain('.glassmorphism');
        expect(css).not.toContain('@keyframes pulse-green');
        expect(css).not.toContain('.pulse-animation');
    });

    test('allows long task descriptions such as URLs to wrap anywhere', () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(css).toMatch(
            /\.task-description\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s
        );
    });

    test('removes inactive view panels from the scrollable layout', () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(css).toMatch(/\.view-panel--hidden\s*\{[^}]*display:\s*none;/s);
    });

    test('reserves a compact mobile scrollbar gutter in settings', () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(css).toMatch(
            /\.settings-scroll-area\s*\{[^}]*overflow-x:\s*hidden;[^}]*scrollbar-gutter:\s*stable;/s
        );
        expect(css).toMatch(/\.settings-scroll-area::-webkit-scrollbar\s*\{[^}]*width:\s*6px;/s);
        expect(css).toMatch(
            /@media \(min-width:\s*640px\)[\s\S]*?\.settings-scroll-area::-webkit-scrollbar\s*\{[^}]*width:\s*10px;/s
        );
    });

    test('uses a neutral keyboard-only focus outline for buttons', () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(css).toMatch(/button:focus\s*\{[^}]*outline:\s*none;/s);
        expect(css).toMatch(
            /button:focus-visible\s*\{[^}]*outline:\s*2px solid rgb\(148 163 184 \/ 0\.85\);[^}]*outline-offset:\s*2px;/s
        );
    });

    test('styles the Jelly heart with brand violets and reduced-motion support', () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(css).toMatch(
            /\.dedication-heart\s*\{[^}]*animation:\s*dedication-heart-breathe 3s ease-in-out infinite;/s
        );
        expect(css).toMatch(
            /\.dedication-heart-stop--light\s*\{[^}]*stop-color:\s*rgb\(196 181 253\);/s
        );
        expect(css).toMatch(
            /\.dedication-heart-stop--base\s*\{[^}]*stop-color:\s*rgb\(167 139 250\);/s
        );
        expect(css).toMatch(
            /\.dedication-heart-stop--dark\s*\{[^}]*stop-color:\s*rgb\(139 92 246\);/s
        );
        expect(css).toContain('@keyframes dedication-heart-breathe');
        expect(css).toMatch(
            /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.dedication-heart\s*\{[^}]*animation:\s*none;/s
        );
    });
});

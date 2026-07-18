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
            /\.unscheduled-task--dragging \.unscheduled-drag-handle\s*{[^}]*color: rgb\(165 180 252\);[^}]*background-color: rgb\(79 70 229 \/ 0\.16\);[^}]*box-shadow: inset 0 0 0 1px rgb\(129 140 248 \/ 0\.5\);[^}]*cursor: grabbing;/
        );
        expect(css).toMatch(
            /\.unscheduled-drag-placeholder\s*{[^}]*background-color: rgb\(129 140 248 \/ 0\.06\);[^}]*box-shadow: inset 0 0 0 1px rgb\(129 140 248 \/ 0\.3\);/
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

    test("themes the What's New scrollbar with the Fortudo palette", () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(css).toMatch(
            /\.whats-new-scroll-area\s*\{[^}]*max-height:\s*min\(58vh,\s*24rem\);[^}]*scrollbar-gutter:\s*stable;[^}]*scrollbar-width:\s*thin;[^}]*scrollbar-color:\s*rgba\(167,\s*139,\s*250,\s*0\.78\)\s*rgba\(51,\s*65,\s*85,\s*0\.35\);/s
        );
        expect(css).toMatch(/\.whats-new-scroll-area::-webkit-scrollbar\s*\{[^}]*width:\s*8px;/s);
        expect(css).toMatch(
            /\.whats-new-scroll-area::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*rgba\(139,\s*92,\s*246,\s*0\.72\);[^}]*border-radius:\s*9999px;[^}]*border:\s*2px solid rgba\(30,\s*41,\s*59,\s*0\.9\);/s
        );
        expect(css).toMatch(
            /@media \(min-width:\s*640px\)[\s\S]*?\.whats-new-scroll-area\s*\{[^}]*max-height:\s*min\(65vh,\s*32rem\);/s
        );
    });

    test("gives the What's New alert a wider responsive layout", () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'css', 'custom.css'),
            'utf8'
        );

        expect(css).toMatch(
            /#custom-alert-modal\.custom-alert-modal--wide\s*\{[^}]*-webkit-backdrop-filter:\s*blur\(2px\);[^}]*backdrop-filter:\s*blur\(2px\);/s
        );
        expect(css).toMatch(
            /#custom-alert-modal\.custom-alert-modal--wide\s*>\s*div\s*\{[^}]*width:\s*min\(40rem,\s*calc\(100%\s*-\s*1\.5rem\)\);[^}]*max-width:\s*40rem;/s
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

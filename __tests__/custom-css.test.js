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
});

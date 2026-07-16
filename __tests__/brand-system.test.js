/**
 * @jest-environment node
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJavaScriptTree(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return readJavaScriptTree(entryPath);
        return entry.name.endsWith('.js') ? [fs.readFileSync(entryPath, 'utf8')] : [];
    });
}

describe('Fortudo brand system', () => {
    const indexHtml = read('public/index.html');

    test('uses Fortudo metadata, the SVG favicon, and social preview tags', () => {
        expect(indexHtml).toContain('<title>Fortudo</title>');
        expect(indexHtml).toContain(
            '<link rel="icon" type="image/svg+xml" href="icons/favicon.svg" />'
        );
        expect(indexHtml).toContain('<meta property="og:title" content="Fortudo" />');
        expect(indexHtml).toContain(
            '<meta property="og:description" content="A daily time-blocking to-do app" />'
        );
        expect(indexHtml).toContain(
            '<meta property="og:image" content="https://fortudo.web.app/og-image.png" />'
        );
        expect(indexHtml).toContain('<meta name="twitter:card" content="summary_large_image" />');
    });

    test('renders the mark and visual wordmark in both app headers', () => {
        expect(indexHtml.match(/data-brand-lockup/g)).toHaveLength(2);
        expect(indexHtml.match(/src="icons\/mark\.svg"/g)).toHaveLength(2);
        expect(
            indexHtml.match(/<span>fortu<span class="text-violet-400">do\.<\/span><\/span>/g)
        ).toHaveLength(2);
        expect(indexHtml).not.toContain('Fortu-do');
    });

    test('uses violet for primary actions and the active task view', () => {
        const primaryClasses =
            'bg-violet-500/30 border border-violet-400/60 text-violet-200 hover:bg-violet-500/40';
        const domRenderer = read('public/js/dom-renderer.js');
        const viewToggle = read('public/js/activities/view-toggle.js');

        expect(indexHtml).toContain(primaryClasses);
        expect(domRenderer).toContain(primaryClasses);
        expect(indexHtml).toContain(
            'bg-violet-500/20 px-3 py-1.5 text-sm text-violet-200 border border-violet-400/40'
        );
        expect(viewToggle).toContain("'bg-violet-500/20'");
        expect(viewToggle).toContain("'text-violet-200'");
        expect(viewToggle).toContain("'border-violet-400/40'");
    });

    test('connects each selected task type to its semantic color', () => {
        expect(indexHtml).toContain('peer-checked:bg-teal-500/20');
        expect(indexHtml).toContain('peer-checked:border-teal-400/40');
        expect(indexHtml).toContain('peer-checked:bg-slate-500/20');
        expect(indexHtml).toContain('peer-checked:border-slate-400/40');
        expect(indexHtml).toContain('peer-checked:bg-sky-500/20');
        expect(indexHtml).toContain('peer-checked:border-sky-400/40');
    });

    test('retires indigo from visible app styling', () => {
        const publicJavaScript = readJavaScriptTree(path.join(repoRoot, 'public', 'js')).join('\n');
        expect(`${indexHtml}\n${publicJavaScript}`).not.toMatch(/indigo-/);
    });

    test('documents the canonical SVG icon source and removes the emoji generator', () => {
        const readme = read('README.md');

        expect(readme).toContain('public/icons/icon.svg');
        expect(readme).toContain('rsvg-convert');
        expect(fs.existsSync(path.join(repoRoot, 'scripts', 'generate_icons.py'))).toBe(false);
    });

    test('includes every supplied brand asset at its production path', () => {
        [
            'public/icons/apple-touch-icon.png',
            'public/icons/favicon.svg',
            'public/icons/icon-192.png',
            'public/icons/icon-512.png',
            'public/icons/icon-maskable-512.png',
            'public/icons/icon.svg',
            'public/icons/mark.svg',
            'public/og-image.png'
        ].forEach((relativePath) => {
            const assetPath = path.join(repoRoot, relativePath);
            expect(fs.existsSync(assetPath)).toBe(true);
            expect(fs.statSync(assetPath).size).toBeGreaterThan(0);
        });
    });
});

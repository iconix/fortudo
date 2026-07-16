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

    test('uses violet for primary actions and active-view accents', () => {
        const primaryClasses =
            'bg-violet-500/30 border border-violet-400/60 text-violet-200 hover:bg-violet-500/40';
        const domRenderer = read('public/js/dom-renderer.js');
        const viewToggle = read('public/js/activities/view-toggle.js');

        expect(indexHtml).toContain(primaryClasses);
        expect(domRenderer).toContain(primaryClasses);
        expect(indexHtml).toContain(
            'bg-slate-700/70 px-3 py-1.5 text-sm text-violet-200 border border-violet-400/40'
        );
        expect(viewToggle).toContain("'bg-slate-700/70'");
        expect(viewToggle).toContain("'text-violet-200'");
        expect(viewToggle).toContain("'border-violet-400/40'");
        expect(viewToggle).not.toContain("'bg-violet-500/20'");
    });

    test('uses flat semantic tints for action buttons throughout the app', () => {
        const publicJavaScript = readJavaScriptTree(path.join(repoRoot, 'public', 'js')).join('\n');
        const appStyling = `${indexHtml}\n${publicJavaScript}`;

        expect(appStyling).not.toMatch(/bg-gradient-to-r/);
        [
            'bg-teal-500/30 border border-teal-400/60 text-teal-200 hover:bg-teal-500/40',
            'bg-sky-500/30 border border-sky-400/60 text-sky-200 hover:bg-sky-500/40',
            'bg-amber-500/30 border border-amber-400/60 text-amber-200 hover:bg-amber-500/40',
            'bg-slate-500/30 border border-slate-400/60 text-slate-200 hover:bg-slate-500/40',
            'bg-rose-500/30 border border-rose-400/60 text-rose-200 hover:bg-rose-500/40'
        ].forEach((semanticTint) => expect(appStyling).toContain(semanticTint));
    });

    test('uses sentence case for the in-app tagline', () => {
        expect(indexHtml).toContain('A daily time-blocking to-do app.');
        expect(indexHtml).not.toContain('A Daily Time-Blocking To-Do App.');
    });

    test('uses a neutral slate settings scrollbar', () => {
        const customCss = read('public/css/custom.css');

        expect(customCss).toContain(
            'scrollbar-color: rgba(100, 116, 139, 0.7) rgba(51, 65, 85, 0.35);'
        );
        expect(customCss).toContain('background: rgba(100, 116, 139, 0.72);');
        expect(customCss).toContain('background: rgba(148, 163, 184, 0.86);');
        expect(customCss).not.toMatch(/settings-scroll-area[\s\S]*?rgba\(139, 92, 246/);
    });

    test('keeps Settings utilities neutral until interaction', () => {
        const settingsRenderer = read('public/js/settings-renderer.js');
        const taxonomySettings = read('public/js/settings/taxonomy-settings.js');

        expect(settingsRenderer).toContain('peer-checked:bg-sky-500');
        expect(settingsRenderer).not.toContain('peer-checked:bg-violet-500');
        expect(taxonomySettings.match(/text-slate-300 hover:text-violet-300/g)).toHaveLength(2);
    });

    test('replaces browser-default button outlines with neutral keyboard focus', () => {
        const customCss = read('public/css/custom.css');

        expect(customCss).toMatch(/button:focus\s*\{[^}]*outline:\s*none;/s);
        expect(customCss).toMatch(
            /button:focus-visible\s*\{[^}]*outline:\s*2px solid rgb\(148 163 184 \/ 0\.85\);[^}]*outline-offset:\s*2px;/s
        );
    });

    test('connects each selected task type to its semantic color', () => {
        expect(indexHtml).toContain('peer-checked:bg-teal-500/20');
        expect(indexHtml).toContain('peer-checked:border-teal-400/40');
        expect(indexHtml).toContain('peer-checked:bg-slate-500/20');
        expect(indexHtml).toContain('peer-checked:border-slate-400/40');
        expect(indexHtml).toContain('peer-checked:bg-sky-500/20');
        expect(indexHtml).toContain('peer-checked:border-sky-400/40');
    });

    test('keeps all task-type controls on one compact mobile row', () => {
        expect(indexHtml).toContain(
            'data-task-type-toggle class="flex gap-1.5 sm:flex-wrap sm:gap-2 mb-2"'
        );
        expect(indexHtml.match(/min-w-0 flex-1 sm:flex-none/g)).toHaveLength(3);
        expect(indexHtml.match(/w-full justify-center[^"]*px-1 sm:px-3/g)).toHaveLength(3);
        expect(indexHtml.match(/mr-0\.5 sm:mr-1/g)).toHaveLength(3);
    });

    test('renders the branded Jelly dedication heart without orphaning it', () => {
        const brandGuide = read('docs/BRAND.md');

        expect(indexHtml).toMatch(
            /<span class="whitespace-nowrap">For Cristell<span class="dedication-heart"[\s\S]*?data-dedication-heart[\s\S]*?<\/svg>[\s\S]*?<\/span><\/span>/
        );
        expect(indexHtml).toContain('aria-label="Purple heart"');
        expect(indexHtml).toContain('fill="url(#dedication-heart-gradient)"');
        expect(indexHtml).toContain('class="dedication-heart-stop--light"');
        expect(indexHtml).toContain('class="dedication-heart-stop--base"');
        expect(indexHtml).toContain('class="dedication-heart-stop--dark"');
        expect(indexHtml).not.toContain('💜');
        expect(brandGuide).toContain('Jelly heart');
    });

    test('uses compact settings dialog spacing on mobile', () => {
        expect(indexHtml).toContain(
            'bg-slate-800 border border-slate-700 p-4 sm:p-6 rounded-lg max-w-md w-full mx-3 sm:mx-4 max-h-[80vh] overflow-hidden'
        );
    });

    test('raises mobile helper and idle-status contrast without changing desktop tone', () => {
        const roomRenderer = read('public/js/room-renderer.js');
        const activityRenderer = read('public/js/activities/renderer.js');
        const insightsRenderer = read('public/js/activities/insights-renderer.js');

        expect(indexHtml).toMatch(/id="sync-status-text" class="text-slate-400 sm:text-slate-500"/);
        expect(indexHtml).toMatch(
            /<footer class="text-sm pt-6 pb-4 text-slate-400 sm:text-slate-500">/
        );
        expect(roomRenderer).toContain("color: 'text-slate-400 sm:text-slate-500'");
        expect(activityRenderer).toContain(
            'py-6 text-slate-400 sm:text-slate-500 text-sm italic px-2'
        );
        expect(insightsRenderer).toContain('text-xs text-slate-400 sm:text-slate-500');
    });

    test('gives the unscheduled section the unified crisp slate treatment', () => {
        expect(indexHtml).toMatch(
            /text-lg sm:text-xl font-normal text-slate-300 pl-2 flex items-center[\s\S]*?Unscheduled Tasks/
        );
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

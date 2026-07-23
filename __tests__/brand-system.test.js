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

    test('reserves violet primary styling for global actions and active-view accents', () => {
        const globalPrimaryClasses =
            'bg-violet-500/30 border border-violet-400/60 text-violet-200 hover:bg-violet-500/40';
        const domRenderer = read('public/js/dom-renderer.js');
        const viewToggle = read('public/js/activities/view-toggle.js');

        expect(indexHtml).toContain(globalPrimaryClasses);
        expect(domRenderer).not.toContain(globalPrimaryClasses);
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
            'bg-indigo-500/30 border border-indigo-400/60 text-indigo-200 hover:bg-indigo-500/40',
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
        const settingsScrollbarRules = customCss.match(
            /\.settings-scroll-area\s*\{[\s\S]*?\.settings-scroll-area::-webkit-scrollbar-thumb:hover\s*\{[^}]*\}/
        )?.[0];

        expect(settingsScrollbarRules).toContain(
            'scrollbar-color: rgba(100, 116, 139, 0.7) rgba(51, 65, 85, 0.35);'
        );
        expect(settingsScrollbarRules).toContain('background: rgba(100, 116, 139, 0.72);');
        expect(settingsScrollbarRules).toContain('background: rgba(148, 163, 184, 0.86);');
        expect(settingsScrollbarRules).not.toContain('rgba(139, 92, 246');
    });

    test('uses brand violet for shared Settings utilities', () => {
        const settingsRenderer = read('public/js/settings-renderer.js');
        const taxonomySettings = read('public/js/settings/taxonomy-settings.js');

        expect(settingsRenderer).toContain('peer-checked:bg-sky-500');
        expect(settingsRenderer).not.toContain('peer-checked:bg-violet-500');
        expect(taxonomySettings.match(/text-violet-300 hover:text-violet-200/g)).toHaveLength(2);
    });

    test('replaces browser-default button outlines with neutral keyboard focus', () => {
        const customCss = read('public/css/custom.css');

        expect(customCss).toMatch(/button:focus\s*\{[^}]*outline:\s*none;/s);
        expect(customCss).toMatch(
            /button:focus-visible\s*\{[^}]*outline:\s*2px solid rgb\(148 163 184 \/ 0\.85\);[^}]*outline-offset:\s*2px;/s
        );
    });

    test('uses restrained type accents with contextual form actions and icons', () => {
        const domRenderer = read('public/js/dom-renderer.js');

        expect(indexHtml.match(/peer-checked:bg-slate-700\/70/g)).toHaveLength(3);
        expect(indexHtml).toContain('peer-checked:border-teal-400/50');
        expect(indexHtml).toContain('peer-checked:border-indigo-400/50');
        expect(indexHtml).toContain('peer-checked:border-sky-400/50');
        expect(indexHtml.match(/peer-checked:text-slate-100/g)).toHaveLength(3);

        expect(indexHtml).toMatch(
            /text-lg sm:text-xl font-normal text-slate-200[\s\S]*?text-teal-400\/75[\s\S]*?Today's Schedule/
        );
        expect(indexHtml).toMatch(
            /text-lg sm:text-xl font-normal text-slate-200[\s\S]*?text-indigo-400\/75[\s\S]*?Unscheduled Tasks/
        );
        expect(indexHtml).toMatch(
            /text-lg sm:text-xl font-normal text-slate-200[\s\S]*?text-sky-400\/75[\s\S]*?Today's Activities/
        );
        expect(indexHtml).toMatch(
            /text-lg sm:text-xl font-normal text-slate-200[\s\S]*?text-sky-400\/75[\s\S]*?Activity Log/
        );
        expect(indexHtml.match(/task-form-time-icon[^"]*text-teal-400\/75/g)).toHaveLength(2);
        expect(indexHtml).toMatch(/fa-signal text-indigo-400\/75 mr-1\.5/);
        expect(indexHtml).toMatch(/fa-hourglass text-indigo-400\/75 mr-1\.5/);
        expect(domRenderer).toContain(
            'bg-teal-500/30 border border-teal-400/60 text-teal-200 hover:bg-teal-500/40'
        );
        expect(domRenderer).toContain(
            'bg-indigo-500/30 border border-indigo-400/60 text-indigo-200 hover:bg-indigo-500/40'
        );
        expect(domRenderer).toContain(
            'bg-slate-700 hover:bg-slate-600 text-slate-100 border border-sky-400/30'
        );
        expect(indexHtml).toMatch(
            /id="start-timer-btn"[\s\S]*?bg-sky-500\/30[\s\S]*?border-sky-400\/60[\s\S]*?text-sky-200/
        );
        expect(indexHtml).toMatch(/id="start-timer-btn"[\s\S]*?px-5 py-2\.5/);
        expect(domRenderer).toContain(
            "submitButtonSizeClasses: 'px-4 py-2 text-sm sm:px-5 sm:py-2.5 sm:text-base'"
        );
        expect(indexHtml.indexOf('id="start-timer-btn"')).toBeLessThan(
            indexHtml.indexOf('id="add-task-btn"')
        );
        expect(domRenderer).toContain(
            'border border-slate-600 focus:border-slate-400 focus:outline-none'
        );
        expect(domRenderer).not.toContain('INPUT_FOCUS_CLASS_BY_THEME');
        expect(domRenderer).not.toContain('setInputTheme');
        [
            /<input[^>]*name="description"[^>]*class="[^"]*focus:border-slate-400/,
            /<select[^>]*id="category-select"[^>]*class="[^"]*focus:border-slate-400/,
            /<input[^>]*name="start-time"[^>]*class="[^"]*focus:border-slate-400/,
            /<input[^>]*name="duration-hours"[^>]*class="[^"]*focus:border-slate-400/,
            /<input[^>]*name="est-duration-hours"[^>]*class="[^"]*focus:border-slate-400/
        ].forEach((neutralFocusPattern) => expect(indexHtml).toMatch(neutralFocusPattern));
    });

    test('keeps all task-type controls on one compact mobile row', () => {
        expect(indexHtml).toContain(
            'data-task-type-toggle class="flex gap-1.5 sm:flex-wrap sm:gap-2 mb-2"'
        );
        expect(indexHtml.match(/min-w-0 flex-1 sm:flex-none/g)).toHaveLength(3);
        expect(indexHtml.match(/w-full justify-center[^"]*px-1 sm:px-3/g)).toHaveLength(3);
        expect(indexHtml.match(/mr-0\.5 sm:mr-1/g)).toHaveLength(3);
    });

    test('keeps Unscheduled sort controls quieter than its primary action', () => {
        const restrainedSortClasses =
            'aria-pressed:bg-slate-700/70 aria-pressed:border-indigo-400/50 aria-pressed:text-slate-100';

        expect(indexHtml.match(new RegExp(restrainedSortClasses, 'g'))).toHaveLength(2);
        expect(indexHtml).not.toContain('aria-pressed:bg-indigo-400/10');
        expect(indexHtml).not.toContain('aria-pressed:text-indigo-200');
    });

    test('uses one compact neutral treatment for empty task and activity lists', () => {
        const emptyStateClasses = 'px-2 py-2 text-sm text-slate-400 sm:text-slate-500';
        const scheduledRenderer = read('public/js/tasks/scheduled-renderer.js');
        const unscheduledRenderer = read('public/js/tasks/unscheduled-renderer.js');
        const activityRenderer = read('public/js/activities/renderer.js');

        [scheduledRenderer, unscheduledRenderer, activityRenderer].forEach((renderer) => {
            expect(renderer).toContain(emptyStateClasses);
            expect(renderer).not.toMatch(/empty[\s\S]{0,300}italic/i);
        });
    });

    test('renders the branded Jelly dedication heart without orphaning it', () => {
        const brandGuide = read('docs/reference/BRAND.md');

        expect(indexHtml).toMatch(
            /<span class="whitespace-nowrap"\s*>\s*For Cristell\s*<span\s+class="dedication-heart"[\s\S]*?data-dedication-heart[\s\S]*?<\/svg>[\s\S]*?<\/span>\s*<\/span>/
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

    test('names icon-only Settings controls for assistive technology', () => {
        expect(indexHtml).toMatch(/id="settings-gear-btn"[\s\S]*?aria-label="Open settings"/);
        expect(indexHtml).toMatch(/id="close-settings-modal"[\s\S]*?aria-label="Close settings"/);
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
        expect(activityRenderer).toContain('px-2 py-2 text-sm text-slate-400 sm:text-slate-500');
        expect(insightsRenderer).toContain('text-xs text-slate-400 sm:text-slate-500');
    });

    test('gives Unscheduled a restrained indigo identity', () => {
        const unscheduledRenderer = read('public/js/tasks/unscheduled-renderer.js');
        const brandGuide = read('docs/reference/BRAND.md');

        expect(indexHtml).toContain('peer-focus-visible:ring-indigo-400');
        expect(indexHtml).toContain('fa-solid fa-list-ul mr-0.5 sm:mr-1 text-indigo-400/75');
        expect(unscheduledRenderer).toContain('border-l-indigo-400');
        expect(unscheduledRenderer).toContain('fa-square text-indigo-400');
        expect(unscheduledRenderer).toContain('text-indigo-400 hover:text-indigo-300');
        expect(brandGuide).toMatch(/\| Indigo\s+\| Unscheduled work\s+\|/);
    });

    test('reserves indigo for Unscheduled and retires fuchsia from app styling', () => {
        const publicJavaScript = readJavaScriptTree(path.join(repoRoot, 'public', 'js')).join('\n');
        const appStyling = `${indexHtml}\n${publicJavaScript}`;

        expect(appStyling).toMatch(/indigo-/);
        expect(appStyling).not.toMatch(/fuchsia-/);
    });

    test('uses the canonical semantic color families instead of near-neighbor aliases', () => {
        const publicJavaScript = readJavaScriptTree(path.join(repoRoot, 'public', 'js')).join('\n');
        const appStyling = `${indexHtml}\n${publicJavaScript}`;

        expect(appStyling).not.toMatch(/\b(?:gray|cyan|blue|red)-\d/);
        expect(indexHtml).toContain('fa-circle-info text-teal-300/75');
    });

    test('keeps Low priority emerald and distinct from Scheduled teal everywhere', () => {
        const unscheduledRenderer = read('public/js/tasks/unscheduled-renderer.js');
        const modalManager = read('public/js/modal-manager.js');

        expect(indexHtml).toContain(
            'peer-checked:bg-emerald-500/20 peer-checked:border-emerald-500/70'
        );
        expect(indexHtml).toContain('fa-solid fa-minus text-emerald-400');
        expect(unscheduledRenderer).toContain("border: 'border-emerald-400'");
        expect(unscheduledRenderer).toContain('peer-checked:bg-emerald-500');
        expect(unscheduledRenderer).toContain('fa-minus text-emerald-400');
        expect(modalManager).toContain("low: 'text-emerald-400'");
    });

    test('uses emerald for positive readiness and documents the complete semantic palette', () => {
        const roomRenderer = read('public/js/room-renderer.js');
        const modalManager = read('public/js/modal-manager.js');
        const brandGuide = read('docs/reference/BRAND.md');

        expect(roomRenderer).toMatch(
            /synced:\s*\{[^}]*color: 'text-emerald-400'[^}]*label: 'Synced'/s
        );
        expect(modalManager).toContain(
            '\'<span class="text-emerald-400 text-xs whitespace-nowrap">Fits</span>\''
        );
        expect(brandGuide).toMatch(/\| Emerald\s+\| Low priority; positive\/safe outcomes\s+\|/);
        expect(brandGuide).toMatch(/\| Indigo\s+\| Unscheduled work\s+\|/);
        expect(brandGuide).toMatch(/\| Synced\s+\| Emerald \|/);
        expect(brandGuide).toContain('Category colors are a separate data-identity namespace');
        expect(brandGuide).toContain('Blue, Green, Orange, Red, Purple, and Gray');
        expect(brandGuide).toContain('Internal taxonomy keys never appear in visible labels');
    });

    test('deduplicates repeated app-update toasts', () => {
        const app = read('public/js/app.js');

        expect(app).toContain("dedupeKey: 'app-update'");
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

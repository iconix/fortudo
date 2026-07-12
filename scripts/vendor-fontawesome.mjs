import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_ROOT = join(REPO_ROOT, 'node_modules', '@fortawesome', 'fontawesome-free');
const DESTINATION_ROOT = join(REPO_ROOT, 'public', 'vendor', 'fontawesome');
const CSS_FILE = 'css/all.min.css';

function walk(root) {
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const full = join(root, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
    });
}

function toRelative(root, file) {
    return relative(root, file).split(sep).join('/');
}

function sourceFiles() {
    const css = join(SOURCE_ROOT, CSS_FILE);
    const webfonts = walk(join(SOURCE_ROOT, 'webfonts'));
    return [css, ...webfonts].map((file) => [toRelative(SOURCE_ROOT, file), file]);
}

function destinationFiles() {
    try {
        return walk(DESTINATION_ROOT).map((file) => [toRelative(DESTINATION_ROOT, file), file]);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

function check() {
    const expected = new Map(sourceFiles());
    const actual = new Map(destinationFiles());
    const problems = [];

    for (const relativePath of expected.keys()) {
        if (!actual.has(relativePath)) {
            problems.push(`missing destination file: ${relativePath}`);
        } else if (
            !readFileSync(expected.get(relativePath)).equals(readFileSync(actual.get(relativePath)))
        ) {
            problems.push(`content differs: ${relativePath}`);
        }
    }
    for (const relativePath of actual.keys()) {
        if (!expected.has(relativePath))
            problems.push(`unexpected destination file: ${relativePath}`);
    }

    if (problems.length) {
        console.error(
            `Font Awesome vendor snapshot is stale:\n${problems.map((problem) => `- ${problem}`).join('\n')}\nRun \`npm run vendor:fontawesome\` to refresh it.`
        );
        process.exitCode = 1;
        return;
    }

    console.log(`Font Awesome vendor snapshot is up to date (${expected.size} files).`);
}

function vendor() {
    rmSync(DESTINATION_ROOT, { recursive: true, force: true });
    mkdirSync(dirname(join(DESTINATION_ROOT, CSS_FILE)), { recursive: true });
    cpSync(join(SOURCE_ROOT, CSS_FILE), join(DESTINATION_ROOT, CSS_FILE));
    cpSync(join(SOURCE_ROOT, 'webfonts'), join(DESTINATION_ROOT, 'webfonts'), {
        recursive: true
    });
    console.log(`Vendored Font Awesome (${sourceFiles().length} files).`);
}

const args = process.argv.slice(2);
if (args.length === 0) vendor();
else if (args.length === 1 && args[0] === '--check') check();
else {
    console.error('Usage: node scripts/vendor-fontawesome.mjs [--check]');
    process.exitCode = 1;
}

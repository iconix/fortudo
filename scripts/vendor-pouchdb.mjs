import { copyFile, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = fileURLToPath(
    new URL('../node_modules/pouchdb/dist/pouchdb.min.js', import.meta.url)
);
const destinationDirectory = fileURLToPath(
    new URL('../public/vendor/pouchdb/', import.meta.url)
);
const destination = fileURLToPath(
    new URL('../public/vendor/pouchdb/pouchdb.min.js', import.meta.url)
);
const expectedFiles = ['pouchdb.min.js'];

async function checkVendor() {
    let entries;
    try {
        entries = await readdir(destinationDirectory, { withFileTypes: true });
    } catch (error) {
        console.error(`Vendored PouchDB directory is missing: ${destinationDirectory}`);
        process.exitCode = 1;
        return;
    }

    const actualFiles = entries.map((entry) => entry.name).sort();
    const hasOnlyExpectedFile =
        entries.every((entry) => entry.isFile()) &&
        JSON.stringify(actualFiles) === JSON.stringify(expectedFiles);
    if (!hasOnlyExpectedFile) {
        console.error(
            `Vendored PouchDB files are stale. Expected only ${expectedFiles.join(', ')}, ` +
                `found ${actualFiles.join(', ') || '(none)'}. Run npm run vendor:pouchdb.`
        );
        process.exitCode = 1;
        return;
    }

    const [sourceBytes, destinationBytes] = await Promise.all([
        readFile(source),
        readFile(destination)
    ]);
    if (!sourceBytes.equals(destinationBytes)) {
        console.error('Vendored PouchDB bytes are stale. Run npm run vendor:pouchdb.');
        process.exitCode = 1;
        return;
    }

    console.log(`Vendored PouchDB is fresh: ${destination.slice(root.length)}`);
}

async function vendor() {
    await rm(destinationDirectory, { recursive: true, force: true });
    await mkdir(destinationDirectory, { recursive: true });
    await copyFile(source, destination);
    console.log(`Vendored PouchDB: ${destination.slice(root.length)}`);
}

if (process.argv.includes('--check')) {
    await checkVendor();
} else {
    await vendor();
}

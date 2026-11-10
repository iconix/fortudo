/**
 * PouchDB 9 treats every failed first bulk read as an unsupported endpoint and
 * permanently falls back to individual reads for that origin. Only an explicit
 * unsupported-endpoint response should select that fallback. Keep this tiny
 * vendoring patch reproducible and fail closed when the upstream bundle changes.
 */
export function patchBulkGetDetection(source) {
    const original = 'e?(Xt[s]=!1,j(e.status,';
    if (!source.startsWith('// PouchDB 9.0.0\n') || source.split(original).length !== 2) {
        throw new Error('Unrecognized PouchDB bulk-get detection; review the vendoring patch.');
    }
    return source.replace(
        original,
        'e&&![404,405,501].includes(e.status)?t(e):e?(Xt[s]=!1,j(e.status,'
    );
}

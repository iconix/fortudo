const ACTIVITY_SMOKE_FAILURES_KEY = 'fortudo-smoke-activity-failures';
const SUPPORTED_FAILURE_KINDS = new Set(['manual-add', 'auto-log']);

function isSmokeHost(hostname = window.location.hostname) {
    const host = String(hostname || '');
    return (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        (host.startsWith('fortudo--') &&
            (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')))
    );
}

function readSmokeFailures(storage = window.localStorage) {
    try {
        const rawValue = storage?.getItem(ACTIVITY_SMOKE_FAILURES_KEY);
        if (!rawValue) {
            return {};
        }

        const parsed = JSON.parse(rawValue);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeSmokeFailures(failures, storage = window.localStorage) {
    const entries = Object.entries(failures).filter(
        ([kind, count]) => SUPPORTED_FAILURE_KINDS.has(kind) && Number(count) > 0
    );

    if (entries.length === 0) {
        storage?.removeItem(ACTIVITY_SMOKE_FAILURES_KEY);
        return;
    }

    storage?.setItem(ACTIVITY_SMOKE_FAILURES_KEY, JSON.stringify(Object.fromEntries(entries)));
}

export function consumeActivitySmokeFailure(
    kind,
    { storage = window.localStorage, hostname = window.location.hostname } = {}
) {
    if (!SUPPORTED_FAILURE_KINDS.has(kind) || !isSmokeHost(hostname)) {
        return false;
    }

    const failures = readSmokeFailures(storage);
    const count = Number(failures[kind] || 0);
    if (count <= 0) {
        return false;
    }

    failures[kind] = count - 1;
    writeSmokeFailures(failures, storage);
    return true;
}

export function queueActivitySmokeFailure(
    kind,
    count = 1,
    { storage = window.localStorage, hostname = window.location.hostname } = {}
) {
    if (!SUPPORTED_FAILURE_KINDS.has(kind) || !isSmokeHost(hostname) || count <= 0) {
        return false;
    }

    const failures = readSmokeFailures(storage);
    failures[kind] = Number(failures[kind] || 0) + count;
    writeSmokeFailures(failures, storage);
    return true;
}

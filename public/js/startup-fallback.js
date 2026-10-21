// A standalone classic script: no imports, app globals, or inline-script permission needed.
(() => {
    let failed = false;

    function showFailure(title = 'Fortudo couldn’t load') {
        const fallback = document.getElementById('startup-fallback');
        if (!fallback) return;
        fallback.dataset.visible = 'true';
        document.getElementById('startup-title').textContent = title;
        document.getElementById('startup-message').textContent =
            'Some app files couldn’t load. Reload to try again.';
    }

    function noteFailure() {
        failed = true;
        showFailure();
    }

    window.addEventListener(
        'error',
        (event) => {
            if (event.target instanceof HTMLScriptElement || event.target === window) noteFailure();
        },
        true
    );
    window.addEventListener('unhandledrejection', noteFailure);
    window.addEventListener(
        'DOMContentLoaded',
        () => {
            if (failed) showFailure();
        },
        { once: true }
    );
    window.setTimeout(() => {
        showFailure(failed ? undefined : 'Fortudo is taking longer to load');
    }, 15000);
})();

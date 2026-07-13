# fortudo: a daily time-blocking to-do app

[![CI/CD Pipeline](https://github.com/iconix/fortudo/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/iconix/fortudo/actions/workflows/ci-cd.yml)

## firebase hosting

```bash
nvm install --lts
nvm use --lts
npm install -g firebase-tools
firebase login
firebase init  # one-time setup
firebase deploy  # can also enable github actions to deploy
```

### PWA assets

Fortudo is installable and boots offline through `public/sw.js`. Its generated
precache manifest is committed to the repository; rebuild it with
`npm run build:sw-precache`. A freshness guard verifies the generated file.

Tailwind CSS is also generated and committed. Run `npm run build:css` after any
Tailwind class change; `npm run check:css` guards it in CI. Font Awesome is
vendored locally with `npm run vendor:fontawesome` and verified with
`npm run check:fontawesome`. Regenerate the app icons with
`uv run scripts/generate_icons.py`.

iOS splash images (`apple-touch-startup-image`) are deliberately out of scope.
Safari may return `false` from `navigator.storage.persist()`; this is normal and
does not prevent the app from working offline.

## testing

Three layers, each with a distinct job:

**Unit (Jest, `__tests__/`)** - pre-merge, runs in CI:

```bash
npm test
```

**E2E (pytest + Playwright, `tests/`)** - pre-merge, runs in CI against a local
server on `127.0.0.1:9847` started by a session fixture. New browser-level
coverage goes here by default. `tests/e2e/test_pwa.py` covers the manifest,
installability, service-worker lifecycle, and offline behavior:

```bash
uv run --with pytest --with playwright python -m pytest tests -q

# headed debugging with system Chrome
E2E_BROWSER_CHANNEL=chrome uv run --with pytest --with playwright python -m pytest tests/e2e -q
```

**Preview smoke (`scripts.preview_smoke`)** - post-deploy, run manually against a
Firebase preview URL. The preview smoke package owns deployed-environment
concerns such as CouchDB sync, room reset, and cross-room scenarios:

```bash
uv run --with pytest python -m pytest tests/test_preview_smoke_helpers.py
uv run --with playwright python -m scripts.preview_smoke <preview-url> --channel chrome
```

## roadmap

See `ROADMAP.md` for the full historical and planned task list.

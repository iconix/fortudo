# Fortudo: a daily time-blocking to-do app

![Fortudo violet arm-check mark and wordmark](public/og-image.png)

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
`npm run check:fontawesome`. The canonical app-icon source is
`public/icons/icon.svg`; rasterize it at the required output dimensions with
any SVG rasterizer, for example:

```bash
rsvg-convert --width 512 --height 512 --output public/icons/icon-512.png public/icons/icon.svg
```

iOS splash images (`apple-touch-startup-image`) are deliberately out of scope.
Safari may return `false` from `navigator.storage.persist()`; this is normal and
does not prevent the app from working offline.

## testing

Install the locked Python environment and Playwright browser once per checkout:

```bash
uv sync --locked
uv run --locked playwright install chromium
```

The test suite has four explicit layers:

**JavaScript unit and integration (`__tests__/`)** - Jest/jsdom coverage for app modules:

```bash
npm test
```

**Python unit and guard tests (`tests/test_*.py`)** - helper units, workflow contracts,
and generated/vendor artifact guards:

```bash
npm run test:python
```

**Local browser E2E (`tests/e2e/`)** - Playwright scenarios against this checkout.
An explicit session fixture starts the app on an available local port, so no manual
server is needed. Set `FORTUDO_E2E_PORT` only when a stable debugging port is useful:

```bash
npm run test:e2e

# headed debugging with system Chrome
E2E_BROWSER_CHANNEL=chrome FORTUDO_E2E_PORT=9847 npm run test:e2e
```

**Deployed-preview acceptance (`tests/preview/` and `scripts.preview_smoke`)** - remote
Firebase/Cloudant behavior. These tests never start or reuse the local E2E server:

```bash
FORTUDO_PREVIEW_URL=<preview-url> npm run test:preview
uv run --locked python -m scripts.preview_smoke <preview-url> --channel chrome
```

Run every pre-merge gate with:

```bash
npm run verify
```

## roadmap

See `ROADMAP.md` for the full historical and planned task list.

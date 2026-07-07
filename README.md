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

## testing

Three layers, each with a distinct job:

**Unit (Jest, `__tests__/`)** - pre-merge, runs in CI:

```bash
npm test
```

**E2E (pytest + Playwright, `tests/`)** - pre-merge, runs in CI against a local
server on `127.0.0.1:9847` started by a session fixture. New browser-level
coverage goes here by default:

```bash
uv run --with pytest --with playwright python -m pytest tests -q

# headed debugging with system Chrome
E2E_BROWSER_CHANNEL=chrome uv run --with pytest --with playwright python -m pytest tests/e2e -q
```

**Preview smoke (`scripts/playwright_preview_smoke.py`)** - post-deploy, run
manually against a Firebase preview URL. This owns deployed-environment concerns
such as CouchDB sync, room reset, and cross-room scenarios:

```bash
uv run --with pytest python -m pytest tests/test_preview_smoke_helpers.py
uv run --with playwright python -B scripts/playwright_preview_smoke.py <preview-url> --channel chrome
```

## roadmap

See `ROADMAP.md` for the full historical and planned task list.

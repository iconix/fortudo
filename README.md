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

## app tests

set up environment:

```bash
nvm install --lts
nvm use --lts
npm install --save-dev jest @babel/core @babel/preset-env babel-jest @testing-library/dom jest-environment-jsdom
```

run tests:

```bash
npm test
```

preview storage smoke:

```bash
uv run python -m unittest test_playwright_preview_smoke.py
uv run --with playwright python scripts/playwright_preview_smoke.py <preview-url> --channel chrome
```

## roadmap

See `ROADMAP.md` for the full historical and planned task list.

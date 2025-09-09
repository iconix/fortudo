# fortudo: a daily time-blocking to-do app

[![CI/CD Pipeline](https://github.com/iconix/fortudo/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/iconix/fortudo/actions/workflows/ci-cd.yml)

## firebase hosting

```bash
λ nvm install --lts
λ nvm use --lts
λ npm install -g firebase-tools
λ firebase login
λ firebase init  # one-time setup
λ firebase deploy  # can also enable github actions to deploy
```

## app tests

set up environment:

```bash
λ nvm install --lts
λ nvm use --lts
λ npm install --save-dev jest @babel/core @babel/preset-env babel-jest @testing-library/dom jest-environment-jsdom
```

run tests:

```bash
λ npm test
```

## repo tasks

- [x] switch css to tailwind
- [x] order tasks by time
- [x] disable checkboxes on all but the first task
  - so if you do something out of order, you gotta update the time for it so it's at the top, and then mark as done ...
- [x] click a task to modify details
- [x] initial reschedule algo:
  - if you complete something early, nothing happens; if you complete something late, all other tasks are bumped later too
  - if a task is modified to overlap with another task, confirm user wants to bump the existing task later, and accordingly bump rest of schedule as needed
- [x] what should happen when the day rolls over? for mvp, can just provide a manual "clear all" button
- [x] local storage for mvp
- [ ] fix responsiveness on iphone
- [x] host mvp on firebase
- [ ] add checkbox to "make a habit" → then we can have a second list that gets injected daily
- [x] on check, cross out task and enable next checkbox
- [x] constrain available hours
- [x] fix deleteTask is not defined on onclick event
- [x] label start time and duration inputs
- [x] max width for app ?
- [x] visually separate the creation ui (task-form)
- [x] move delete task button to the right ?
- [x] on-add/form validation
- [x] "tap again to delete"
- [x] if task is running late, switch to yellow text as warning

- [x] (v2) move away from browser alerts to custom modals
- [ ] (v2) automatically convert scheduled tasks to unscheduled when rescheduling pushes them past midnight
- [x] (v2) confetti burst animation when you check off a task
- [x] (v2) add a lock feature (🔒) that prevents a task from being auto-rescheduled
- [x] (v2) publish preview link under shortlink (https://tinyurl.com/fortudo-v2)
- [x] (v2) add un-schedule button (maybe a down arrow before the edit icon?)
- [x] (v2) clear all scheduled tasks only (drop down on main clear all button?)
- [ ] (v2) record some playwright tests (https://playwright.dev/docs/codegen-intro)
- [ ] (v2) clear schedule on a new day (unschedule incomplete tasks)
- [ ] (v2) consider highlighting gaps in a schedule in some way...

- [ ] (vNext) try https://tinybase.org/ for local-first sync, storage, conflict-free replicated data (crdt) (e.g., https://tinybase.org/demos/todo-app/todo-app-v6-collaboration/)
  - [ ] or https://github.com/yjs/yjs / https://automerge.org/ for just the crdt part

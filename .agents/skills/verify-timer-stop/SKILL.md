---
name: verify-timer-stop
description: Check single-room timer completion under overlapping stops, interrupted writes, and reloads when changing the activity manager or running-activity repository.
---

# Verify timer completion

Run `npm test -- --runInBand --runTestsByPath __tests__/timer-stop-retry-model.test.js`.
The Jest coverage job runs the same model in CI.

Two overlapping stop requests and a retry must leave one completed activity in
PouchDB and in the activity list. A retry after a successful activity write must
preserve that write's end time, even if the user retries later.

The model uses the production storage and activity manager with PouchDB's memory
adapter. It enumerates both running-config shapes (with and without an activity
ID), interruptions at each write before commit, and a retry with or without
resetting and reloading the manager. A competing stop runs while the first is in
flight. The 14 traces cover one room, one client, one interrupted write at most,
and one retry. Replication, browser process crashes mid-transaction, and changes
by another client are outside that bound.

For the duplicate-stop counterexample, use a disposable checkout of this revision,
restore only `public/js/activities/manager.js` from `ca904ca`, and run the case
`-t "legacy=false, failure=none, reload=false"`. It produces two completed
records. The manager at `7a9a7c7` rejects the overlapping stop, but interrupting
the cleanup of a legacy timer and reloading still produces two records. Restore
the checkout's manager and run the full model.

The coverage anchors are `stopTimerAt` and `loadActivitiesState` in
`public/js/activities/manager.js`, the running-config normalization in
`public/js/activities/running-activity-repository.js`, and the activity/config
write paths in `public/js/storage.js`. Last checked against base `7a9a7c7` with
manager blob `02f9c3ea912b26381a2c2c917620fcc8a1a47ed5`. If a write moves,
review the corresponding interruption and its persisted result before advancing
the coverage anchor.

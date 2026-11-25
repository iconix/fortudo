---
name: verify-sync-recreation
description: Check that a recreated local revision reaches the cloud after its sync request overlaps a push. Use when changing sync audit invalidation, debounce, deletion filtering, or follow-up retries.
---

# Verify sync recreation

A task recreated locally while a push excludes its old deletion must eventually reach the remote with its exact revision. If the follow-up transport fails, the local edit must survive and the user must see a sync error.

Run `uv run --locked pytest tests/e2e/test_sync_recreation_model.py -q` from the worktree. The pull-request E2E job collects the same file.

The model starts one room with a deleted local revision, an absent cloud ID, and a push paused after it selects its replication scope. The scheduler enumerates all orders of one recreation, its debounce firing, and completion of the initial sync, subject to the write preceding its debounce. Completion includes any immediate follow-up. One additional run interrupts the follow-up in the coalesced order. Each run uses the production sync module and two real IndexedDB databases in Chromium. The property compares local and remote revisions, deletion history, and the final status. Multiple rooms, arbitrary internal database interleavings, Cloudant retention timing, and HTTP transport behavior are outside this bound.

The counterexample from commit `693b424fb12da8a299e5e05978711680ca2c4ff8` is `recreate-debounce-finish`. The debounce joins the held push. Its deletion filter skips the recreated ID. The post-pull audit finds pending work, then an early return skips the follow-up. The remote has no task and the status remains unsynced.

For a historical replay in a **disposable worktree**, replace only `public/js/sync-manager.js` with the file from that commit using `git restore --source=693b424 -- public/js/sync-manager.js`. Run the command above with `-k recreate-debounce-finish`. Expect the remote revision and status assertions to fail. Restore the current version in the disposable worktree and rerun all schedules.

Last checked against `7a9a7c7f843ee4fbfd571c170e5c15c49ab0d2ab`. The scheduling boundaries are in `public/js/sync-manager.js` (`triggerSync`, `registerExpectedLocalRevision`, and `debouncedSync`). Obsolete deletion classification is in `public/js/sync-contract.js` (`auditLocalDivergence`). If a run fails, read the schedule in the pytest ID and compare its final database state with the property's expected outcome. If those boundaries change, update the scheduler, repeat the historical replay, then advance the checked commit.

---
name: verify-preflight-snapshot
description: Check the revision fingerprint and running timer in taxonomy migration preflight reports whenever the CLI reads, plans, or revalidates source state.
---

# Verify the migration preflight snapshot

Every published report must describe a source state that existed. A mixed report can approve a revision fingerprint taken before a timer started while claiming that the timer was already running.

Run `uv run --locked pytest tests/migrations/taxonomy_identity_v1/test_preflight_snapshot_model.py -q`. The Python CI suite collects this check. It runs the real read-only preflight CLI with an in-memory source that can start a single timer between any two Cloudant client reads. Stable states must produce the corresponding report. During a transition the CLI can reject the snapshot or return a matching fingerprint and timer state.

The bound is one timer start, a fixed security hash and validator state, and one preflight call. Each simulated client read is atomic. Network transport, changes within a client read, capture, and remote writes are outside the model.

PR #109, commit `3f4f8da`, returned the old revision graph with the new timer status when a timer started immediately after the graph read. For a local mutation replay on a disposable checkout, disable only the final source-state comparison in `execute_cli` and rerun the test. The model should report the read boundary that allowed the mixed report. Restore the comparison and rerun.

Reviewed against `7a9a7c7f843ee4fbfd571c170e5c15c49ab0d2ab`, in `scripts/migrations/taxonomy_identity_v1/dat_411_operation.py` (`execute_cli` and `_require_migration_preconditions`). Recheck these functions and the client read boundaries, run the mutation and restored checks, then advance the reviewed commit. If the command changes the facts in a report, update the allowed snapshots from source states that really exist.

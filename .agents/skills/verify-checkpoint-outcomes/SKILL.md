---
name: verify-checkpoint-outcomes
description: Check checkpoint PUT retries and acknowledgements when changing checkpoint recognition, confirmation, or retry handling in sync-transport.js.
---

# Verify checkpoint acknowledgements

Run `npm test -- --runInBand --runTestsByPath __tests__/checkpoint-transport.test.js`.
CI runs these cases in the Jest coverage job.

When a checkpoint PUT loses its acknowledgement, another PUT can overwrite another
replicator's progress. The transport may acknowledge the write only if it can read
back the exact checkpoint. An explicit HTTP 429 permits another attempt.

The model runs the production `createSyncFetch` against a single remote record.
For each bootstrap and versioned checkpoint it enumerates zero through three
explicit write rejections before a lost acknowledgement. The server either stores
the submitted body or leaves the record missing. Zero through four explicit
read rejections precede a confirmation result. Four exhausts the read budget.
Every trace checks the outcome, the stored document, and how many writes reached
the server. The case name gives the failure sequence. Jest's virtual clock lets
all 80 traces exercise the real backoff loop without waiting for wall time.

The model covers one request and one remote record. Other-session updates, aborts,
credentials, pacing, and actual PouchDB replication have separate coverage in the
same Jest suite and in `tests/e2e/test_checkpoint_throttling.py`.

For a historical counterexample, in a disposable checkout of this revision, take
only `public/js/sync-transport.js` from `79855f8` and run the same command with
`-t "1 rejected writes, committed=true, 1 rejected reads"`. That transport returns
the first 429 to PouchDB and never completes the checkpoint. Restore the checkout's
transport and rerun to see the confirmed 201.

Last matched `checkpointDocument` and `createSyncFetch` in
`public/js/sync-transport.js` at `a2a2fef`. When their protocol changes, check
the modeled transitions against both the code and PouchDB's observed behavior.
Update the bounds and record the new sync commit after rerunning the historical
counterexample and the current suite.

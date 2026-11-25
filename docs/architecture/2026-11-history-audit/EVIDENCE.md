# Evidence register

A historical replay exercises a specific archived failure. An inspected guard records the current code or test that addresses a historical family. Each family may include both. The [summary](README.md) gives replay outcomes and the [PR index](PR-INDEX.md) covers the branches that contributed evidence.

## Scheduling and form state

Early scheduler and form changes repeatedly disagreed on task identity, time, and the next valid action. Sources include #1–5, #12, #35, #39, #43, #48–49, #78 and #89.

| Source and cause | Guard and evidence |
| --- | --- |
| `650ac0f`, `e89a7bc`, `4c6dba7`. Cascading shifts could move locked or completed tasks. | **Inspected.** The reschedule engine computes the schedule before applying the confirmation result. `__tests__/reschedule-engine.test.js`, `__tests__/integration.test.js` and `__tests__/task-management.test.js` check resulting order, locked tasks and truncation. |
| `c75363c`, `17a9ed4`. Updating form suggestions could overwrite a draft or miss Clear All. | **Replayed.** #139 follows the confirmed deletion through reload in `tests/e2e/test_task_crud.py`. `tests/e2e/test_edit_readiness.py` covers typing before the first local read returns. |
| `433ffc4`, `6b5ca26`. UTC formatting selected the preceding local day. Tests also constructed “future” tasks from a near-midnight host clock. | **Replayed.** The archived input differed by a day in Auckland. The revised scheduling fixtures use a fixed browser clock in `tests/e2e/test_schedule_gaps.py`, `tests/e2e/test_task_editing.py` and `tests/e2e/test_ui_states.py`. |
| #43, #49. Refresh could reset a conflict action or ask for the same confirmation again. | **Browser check.** `tests/e2e/test_schedule_overlaps.py` checks the conflict action through refocus and submission; `__tests__/add-task-handler.test.js` checks the next form state. |
| Pre-PR fix `56d8c00`. Styling made the inactive completion control look disabled while it remained actionable. | **Historical replay and browser check.** `tests/e2e/test_scheduled_completion.py` checks the inactive row against IndexedDB, completes the active row with Space, and then completes the newly eligible row. |
| #4, #12, #35. Native validation, Enter submission, result payloads and confirmations drifted between scheduled and backlog modes. | **Replayed for Enter.** `tests/e2e/test_task_submit.py` exercises rejection of a fractional duration and persistence after correction. **Inspected for related behavior.** `__tests__/dom-interaction.test.js`, `__tests__/unscheduled-list.test.js` and `__tests__/scheduled-task-handlers.test.js` exercise the relevant form and confirmation paths. The #4 request to remove unwanted messaging and a TODO predates later feedback changes in #49. |

Additional inspected safeguards include `__tests__/time-utils.test.js` for active and late time intervals, `__tests__/scheduled-task-renderer.test.js` for consecutive schedule gaps, and `__tests__/storage.test.js` for restoring the room’s saved tasks rather than initial placeholder rows.

## UI lifetime and task text

| Source and cause | Guard and evidence |
| --- | --- |
| #4–5, #38, #40, #48. Reinitialization registered additional callbacks on surviving elements. | **Replayed.** #137 detects an old room callback firing after rebinding. `tests/e2e/test_room_switch.py` reproduces a separate doubled Clear-menu toggle when switching rooms, now wired at page lifetime. |
| #12, #40. Saved data entered an HTML parser through hand-built markup. | **Replayed.** #136 checks the original sink using ESLint; #140 parses archived HTML without executing it. In task UI, `__tests__/task-text-boundaries.test.js` checks identity and text containing punctuation. `__tests__/modal-manager.test.js` covers the task picker. Static data and parser-context-appropriate encoding preserve literal values. |
| #81, #85, #97, #115, #133–134. Long text, nested controls and hidden panels could expand the viewport. | **Replayed for #135.** `tests/e2e/test_long_text_layout.py` measures the cards and recovery dialog. **Replayed for #85.** The parent of `90460a3` overflowed an individual label by 39 px; `tests/e2e/test_insights.py` now measures the visible label inside its own timeline block. **Inspected for related failures.** `tests/e2e/test_task_edit_layout.py` and `tests/e2e/test_mobile_task_actions.py` check geometry, saving and touch actions. |
| #82/#84, #88, #99, #113–119. Onboarding, hidden actions, taxonomy styling and overlap warnings changed with product decisions. | **Inspected.** `tests/e2e/test_activities.py` covers persisted onboarding dismissal, category color changes and live overlap repair. A temporarily hidden repair action and intentional palette changes are recorded as product decisions. |

## Persistence and concurrent writers

| Source and cause | Guard and evidence |
| --- | --- |
| #40, #48, #52–53, #56, #59–60, #67, #77, #103. Bulk writes mixed entity families, refresh could rewrite pulled data, and edits or renamed categories lost identity. | **Inspected.** Typed writes scope revisions by family. Stable identity and shared selectors read both legacy and opaque keys. See `__tests__/storage-scoping.test.js`, `__tests__/taxonomy-lossless.test.js`, `__tests__/app-lifecycle.test.js` and `tests/preview/test_taxonomy_identity_sync.py`. |
| #62, #71, #79, #81, #102. Restoring or replacing a timer could use a stale clock or duplicate a stop after a partial write. | **Replayed for stop/retry.** `__tests__/timer-stop-retry-model.test.js` drives real PouchDB. **Inspected for time display.** `tests/e2e/test_activities.py` checks reload and a stale server Date header. |
| #89, #96. A multi-document ordering write could stop halfway or conflict with a task edit. | **Inspected.** Order now lives in a single PouchDB config document. `__tests__/unscheduled-sequence-repository.test.js`, `tests/e2e/test_unscheduled_order.py` and `tests/preview/test_unscheduled_order_sync.py` exercise conflict, order and reload. |
| #115–116, #119–120. A preview could become obsolete as the running timer or activity winners changed. | **Inspected.** Revision-bound repair protects the running timer. `__tests__/activity-overlap-repair-conflict.test.js` uses real PouchDB; `tests/e2e/test_activities.py` exercises live repair. |
| #113, #124, #128–131. Startup could block a local edit, abandon a draft or leave a recovery retry visible after it settled. | **Inspected.** `tests/e2e/test_edit_readiness.py` holds the initial read and retries a failed startup. `__tests__/startup-retry-ui.test.js`, `__tests__/recovery-retry-progress.test.js` and `tests/e2e/test_guided_recovery.py` cover stale retries, stop states and reviewed recovery. |
| #126/#128, #129, #131. Throttling triggered amplification; ambiguous acknowledgements and filtered checkpoints stranded work. | **Replayed for #138 and #141.** `tests/e2e/test_sync_recreation_model.py` and `__tests__/checkpoint-transport.test.js` exercise those bounds. `tests/e2e/test_sync_throttling.py` checks the bulk-read path. Closed #126 was incorporated in #128. |

## Contracts and migrations

| Source and cause | Guard and evidence |
| --- | --- |
| #104–105, #125. Validator consumers disagreed about the contract or hash; packaging broke invocation; malformed input escaped error sanitization. | **Inspected.** `scripts/export-document-contract.mjs` pins the reviewed v1 checksum independently of browser declarations. `tests/test_document_contract_ops.py` drives CLI verification and artifact drift from other working directories; `tests/test_cloudant_contract_gate.py` exercises orphan command reporting without remote access. Security and sanitization checks remain in the suite. |
| #106–111. Earlier capture tooling could accept a mismatched target or act on a stale preflight. | **Replayed for preflight.** `tests/migrations/taxonomy_identity_v1/test_preflight_snapshot_model.py` found the timer-start counterexample on `3f4f8da` and when only final graph validation was removed. **Inspected for other operations.** Scoped packages, deterministic successors and exact-name checks guard resume and safe deletion. See `tests/migrations/taxonomy_identity_v1/test_dat_411_operation.py` and `tests/test_cloudant_migration_architecture.py`. The older backup mechanism was retired in #108. |

## CI, previews and shipped assets

| Source and cause | Guard and evidence |
| --- | --- |
| #9, #34, #80, #95–96, #106, #120. Deployment scope and stable preview identity diverged between producers and consumers. | **Replayed.** The workflow selected a different channel's URL/expiry from a mixed inventory, and a truncated branch slug failed cleanup validation. `tests/test_ci_preview_comment.py` and `tests/test_firebase_preview_channels.py` check the actual result and cleanup grammar. |
| #36, #40, #83, #87, #98, #100–101. Reused servers, unpinned environments and copied runtime assertions produced misleading CI results. | **Replayed for the Node assertion.** `tests/test_test_infrastructure.py` checks shared runtime configuration while keeping the intentional test matrix. `tests/e2e/test_server_fixture.py` checks the worktree-scoped server. |
| #90–94, #97, #104, #113, #115, #133. Builds missed generated styles, referenced unavailable icons, or shipped an invalid worker during rebasing. | **Replayed for icon names and worker syntax.** `tests/test_fontawesome_vendor_guard.py` checks icon names against the shipped CSS and verifies vendor bytes. `tests/e2e/test_pwa.py` exercises registration and offline reload. **Inspected.** CI rebuilds Tailwind and `tests/test_sw_precache_guard.py` verifies the committed manifest. |
| Dependency and workflow maintenance throughout the index. | **Inspected.** Lockfiles, isolated Jest setup, real test collection, CodeQL, the dependency-review license allowlist, and production/development audits carry the applicable constraints. Early disabled-suite and shared-global failures (#3/#4/#12/#28) are covered by explicit CI gates and fixture teardown. The audit retained the security and license-policy checks. A routine bump, superseded branch or reported advisory alone does not establish an application regression. |
| #124. The async fallback helper could register after an app module or dependency failed. | **Replayed.** `tests/e2e/test_startup_fallback.py` holds the real network responses to exercise early, late, and unavailable observers. The old HTML missed both late failures. The repaired order delivers the error and preserves a static reload path and local data. |

Inspect the release status of each branch before relying on a gate in production. The deployed preview suites listed here require their designated remote environment. This evidence register does not report a live acceptance run.

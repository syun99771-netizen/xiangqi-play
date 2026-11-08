# Verification scope

Historical baseline verified 2026-11-05 with Node v24.22.1.
For the 2026-11-08 search update and fresh checks, see OPTIMIZATION-20261108.md.

## Reproducible commands

```sh
export XIANGQI_MODEL_PATH=/absolute/path/xiangqi-c07e94a5c7cb.nnue
npm run verify
npm run test:unit
npm test
npm run example
```

- Full packaged suite: **101 tests passed**, zero failures or skips.
- Without model: **90 tests passed** via `test:unit`.
- At initial import, all **34 engine files** matched the confirmed cumulative candidate byte-for-byte. Subsequent explicitly recorded changes preserve the original hash in provenance.
- C07 model hash matched the pinned SHA-256 before model-dependent tests.
- Self-import/export checks, static browser import closure, actual Node worker
  search, model-path override, cancellation, worker termination, whole-request
  watchdog, and documented limit boundaries passed.
- A Node-host shim exercised the browser-worker message protocol: terminal
  reply, bad-model error, concurrent busy rejection and recovery. This is not
  browser runtime validation.
- Actual public searches exercised movetime 1/25 ms, fixed node budgets, depth
  caps, and a 60,000 ms request bounded by one node. An injected Search clock
  independently checked 1/25/60,000 ms deadline propagation. This is not a
  60-second sustained performance test or a hard real-time guarantee.
- The separate integration audit compared this engine to the pre-FT4 baseline:
  **608 numerical cases**, 5 invalid-input rollback cases and 5 synthetic
  overflow cases passed, including intermediate diagnostics, incremental
  counters and full-refresh oracle. Large audit fixtures/logs are not shipped.

## Historical regression migration

Twelve available historical engine test files were migrated from the recovered
2026-10-29 source. Imports now point at `engine/`. They include legacy Search,
Board, adjudication, history, neural scaffolding and TT coverage; they are not a
claim that every historical test or all publicSearch behaviors are covered.

The first combined run was 98/100: two old test assumptions predated changes
already present in the recovered 2026-11-02 core. They were migrated explicitly,
without modifying engine code or skipping tests:

1. `search-limits`: direct qsearch fixture now initializes through real
   `Search.run({depth: 0, movetime: Infinity})` instead of an incomplete handwritten
   state. This creates the recovered core's required `publicPathMoves` and
   counters before checking the original checked-quiescence assertion.
2. `verified-check-search`: the quiet third occurrence is now checked against
   the pinned referee's explicit `public-repetition-draw`, with zero approximate
   guards and one strict/public terminal. The second occurrence continues;
   forged equal hashes still fail canonical verification. The former assertion
   expected the older approximate guard, which this recovered core replaced.

The original failing log is retained with the external validation evidence,
not hidden or bundled as source. Some legacy TT tests intentionally demonstrate
unsafe `ttBounds:true` behavior; they do not endorse that option. The public
facade rejects it.

## Not established

Actual browser/WebWorker execution remains **unverified**. Static closure and
Node tests do not establish browser compatibility, UI responsiveness, browser
performance, playing strength, Elo, a fixed-time strength improvement, complete
CCA rule compliance, or recovery of the lost latestSearch source.

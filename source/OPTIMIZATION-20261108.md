# Checked-quiescence evaluation, 2026-11-08

Base commit: `f4fcc09f756abd8d7713498d87c8e4da05e5fd7c`.

The public b562 search no longer evaluates a static stand-pat score when the
moving side is in check. Checked nodes must search legal evasions: their static
score was computed but never used. Move ordering, terminal-rule priority,
evasion search, limits, and non-check evaluation remain unchanged. Legacy
`search.js` is untouched. Custom evaluator call counts and static-cache activity
intentionally change; side-effectful evaluators must not depend on a call at
every checked node.

## Verification

- Node v24.22.1, original C07 model with pinned SHA-256.
- Full suite: 105/105; model-free suite: 94/94.
- Four new regressions cover checked evasions and restoration, ordinary score
  bounding, non-finite ordinary scores, checked no-move loss, and hard-ply stop.
- Two separate Node processes, each using 16 previously exposed saved-game
  histories, 16,384 nodes/search, depth cap 16, fresh Search/cache per call.
- Each run: one paired correctness pass, then five interleaved timing pairs per
  position (192 searches total). Root move, score, PV, completed iterations,
  node count, rule counters, and restored board/history matched baseline.
- CPU candidate/baseline: **0.9401**, independent repeat **0.9475** (about
  **5.3–6.0% less CPU** on this sample). Whole-request ratios: 0.9395 / 0.9470.
  Median per-position ratios: 0.9462 / 0.9417; 15/16 positions faster in both.
- Both met the predeclared gate: aggregate and root-median CPU ratio ≤0.95,
  at least 12/16 faster positions, worst root median ≤1.10.

The benchmark positions are exposed, not a held-out strength test. Evaluation
stream/cache counts intentionally differ, so no equality claim is made for
those. This is not evidence of Elo improvement, deeper search at every time
setting, browser performance, or recovery of the lost latestSearch source.
Actual browser execution needs its own validation.

`provenance/ENGINE-SOURCE.json` preserves the modified file's baseline hash and
records its new hash and transformation; the other 33 engine files are intact.

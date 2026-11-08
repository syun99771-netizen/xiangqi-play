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

## Leaf ordering-only TT bypass (second update)

Base: `cf13dbc127b94269940e93bcd0f8c80e8e3f408e`. After all existing
repetition, terminal, hard-ply and check-extension processing, a depth-zero
node now enters quiescence before constructing an unused position key or
reading an ordering-only transposition-table hint. Root/move ordering, TT
writes, quiescence evaluation and node accounting are unchanged. An explicit
`!ttBounds` guard retains the former branch for low-level option mutation.
Normal public profiles already disallow TT score bounds.

Two fresh-process runs of the same 16 exposed histories, each with 192 calls
(one correctness pair and five interleaved timing pairs per root), at 16,384
nodes/depth cap 16, preserved complete result, evaluation-stream, cache,
iteration, PV and restored-state signatures. Candidate/baseline CPU ratios:
**0.96495 / 0.97628**, or **2.37–3.50% less CPU** on this sample. Whole-request
ratios: 0.96541 / 0.97670. Root median ratios: 0.95434 / 0.97119; 14/16 and
15/16 roots faster; worst medians: 1.04384 / 1.00881. The predeclared gate for
this small change was >=2% aggregate and root-median improvement, >=12/16
faster roots, worst median <=1.05, confirmed in an independent process.

Six additional regressions exercise both TT storage modes, positive depth,
check extensions, actual repetition, terminal/hard-ply ordering, restored
state and low-level TT-bounds compatibility. Reproduce functional checks with
`npm run verify`, `npm run test:unit` and `npm test` (the latter needs C07).

This is reduced computation, not a new evaluation model or demonstrated Elo
increase. Fixed-time choices may change as more work fits in the budget.
These exposed positions are not a held-out strength sample. No Android/browser
speedup is inferred from Node timing. Low-level custom `key`/`ttGet` side effects
are not preserved on bypassed leaves; the public API uses standard internals.
The separately tested NNUE transform-fusion candidate was slower and is not
included in this update.

Final local checks for the second update: manifest 91 files, model-free suite
100/100, full C07 suite 128/128, and static Pages build passed. A fresh local
Chromium smoke attempt was blocked by the execution environment's process
socket restriction; no new real-browser runtime validation is claimed here.

## Transactional accumulator workspace (third update)

Base: production `fd8b70fa624cdc706c1c6bc827eb1b06daa9c5f3`. Only the
NNUE `forward.mjs` runtime module changes. Each incremental session privately
owns active/scratch Int16 accumulator and Int32 PSQT banks per perspective.
Delta copies into scratch with `set`, preserving the original column arithmetic;
refresh initializes scratch completely, retaining the original refresh decision.
Both perspectives and inference/diagnostic copies must succeed before commit.
Unchanged perspectives do not swap banks. Exceptions retain active state and
statistics; reset and arbitrary position jumps remain supported. Diagnostic
arrays never alias these banks. This is not ancestor/anchor caching, input fusion,
column fusion, a model change, or a search-policy change.

Two fresh-process runs used the same 16 previously exposed saved-game histories,
16,384 nodes/search, depth cap 16, fresh Search/TT/evaluator/cache per request,
no wall-time cutoff. Each included one correctness pair and five interleaved
AB/BA timing pairs per root: **192 calls per run**. Both retained identical
non-time search results, evaluation-stream digest, cache/accumulator statistics,
iterations, PV and restored board/history signatures.

| Metric, candidate/baseline | Screen | Separate-process confirmation |
| --- | ---: | ---: |
| Aggregate Search CPU | 0.921683 | 0.935890 |
| Median root CPU ratio | 0.921867 | 0.925239 |
| Faster roots | 16/16 | 15/16 |
| Worst root median | 0.983064 | 1.028457 |

Both passed the frozen gate: aggregate and root-median CPU ratios <=0.98,
at least 12/16 faster roots and worst root median <=1.05. The observed saving
is about **6.4–7.8% sampled Search CPU**, not an Elo, equal-time match, browser,
Android, or universally deeper-search claim. Confirmation used a separate
process, not independent held-out positions. No coefficient tuning, sample
extension or discarded slow-root rerun was used. Failed paired-feature and
adjusted-blend candidates are not included.

Numerical admission compared 608 cases with original incremental and full-refresh
oracles, including all diagnostic arrays/stats, 12 actual histories, five invalid
input rollbacks and five synthetic overflow cases. Six model-free regression
groups cover all nine red/black unchanged/delta/refresh combinations, eight
material buckets/both sides, arbitrary jumps/reset, diagnostic/session ownership,
overflow and exception/reentrancy rollback. Test-only fault injection loads a
private module instance; production has no debug switch or global mutation.
Original C07 weights and upstream GPL attribution remain unchanged. Provenance
retains the previous `forward.mjs` hash and records this transformation.

### Follow-up on the third update: time budget and playing-strength checks

The published905da0e accumulator-workspace version was separately compared with
fd8b70f at200ms/depth16/no node cap, fresh Search/cache, on the same16 exposed
histories:5 alternating pairs/root,160 calls, all retained. Total nodes increased
6.21%, median root node ratio1.05053,15/16 roots gained;4/80 pairs completed one
extra depth and76 matched, none lower. Baseline Search.run wall range was
200.062–201.773ms; candidate200.046–205.604ms. The worst5.604ms overshoot was
retained. This is soft-limit throughput evidence, not a strength result.

A separate preregistered24-game200ms self-play diagnostic used12 new seeded
quiet openings with colors reversed, baseline full-history public-b562 referee,
240-ply UNKNOWN cap and250ms whole-API timing ceiling. Candidate905 scored
**11 wins,12 losses,1 draw**, with0UNKNOWN/invalid/unstarted/timing violations,
only1 conservatively positive opening family: the frozen strength-screen gate
**failed**. Independent replay checked2924 played plies and10522 PV edges.
No stronger-play or Elo claim follows, and no extra games/retry were added.
This does not invalidate the separately verified exact computational saving.

## Incremental sorted-owned feature validation (fourth update)

Base: published905da0e transactional-accumulator version. Only `forward.mjs`
runtime changes. Incremental validation copies/range-checks the supplied indices,
sorts the owned Uint16Array and rejects adjacent duplicates without allocating
a Set. Transition consumes the already sorted snapshot. Full-refresh retains
its original Set validation and original feature-contribution order. No model,
search, rule, arithmetic, diagnostic ownership or public request option changes.

Compatibility boundary: on incremental inputs containing several faults, the
first reported fault or duplicate value can change; duplicate-then-late-getter
inputs may read further before throwing. Invalid inputs remain rejected and
both-perspective state/statistics rollback remains intact. Do not claim identical
error messages/order/getter call traces. Normal SDK inputs and valid stable
feature arrays retain exact numeric behavior. Full-refresh error order is
unchanged. Five new regression groups explicitly exercise these boundaries.

Two fresh processes, each192 calls on the same16 exposed histories at16384
nodes/depth16, retained exact non-time search, evaluation-stream, accumulator/
cache, iteration, PV and restored-state signatures. Each run used one correctness
pair and five alternating timing pairs per root, without discards or reruns.

| Metric, candidate/905 baseline | Screen | Separate-process confirmation |
| --- | ---: | ---: |
| Aggregate Search CPU | 0.941262 | 0.942872 |
| Median root CPU ratio | 0.944460 | 0.943913 |
| Faster roots | 15/16 | 15/16 |
| Worst root median | 1.041835 | 1.002870 |

Both pass the frozen gate aggregate/root-median<=0.98,at least12/16faster,
worst root<=1.05. This is **5.7–5.9% sampled Search CPU reduction relative to905**;
do not add percentages from different baselines into a cumulative claim.
Confirmation is independent-process, not held-out-position evidence. No new
browser, Android, equal-time playing-strength or Elo result is asserted.

Admission:670 independent original incremental/full-refresh diagnostic and stats
comparisons, including12 actual histories, random/reversed feature ordering,
all8 buckets/both perspectives,5invalid-input rollbacks and5synthetic overflow
cases. Focused11/11 includes the existing6 transaction groups plus5new groups.
Previous upstream attribution and original hash remain; provenance additionally
retains the intermediate905 forward hash/transformation in `priorVersions`.

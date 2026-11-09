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

## Paired Int16 FT delta lanes (1.0.1)

Against production15a, this change updates two independent Int16 accumulator
lanes per Uint32 operation. Bit16 carry/borrow correction preserves each lane's
modulo2^16 arithmetic. The original four-lane loop becomes two word operations;
column order, scalar full refresh, PSQT, inference and search stay unchanged.
Private views alias already-decoded native-endian arrays, not serialized model
bytes. Both host byte orders represent the same componentwise operation. Views
are allocated once per session; misaligned internal weight storage keeps scalar
fallback. Active/scratch bank transaction, failure rollback, stats, reset and
owned Int16 diagnostic snapshots are preserved. No weights or public API change.

| Metric, candidate/15a baseline | Screen | Separate-process confirmation |
| --- | ---: | ---: |
| Aggregate Search CPU | 0.903283 | 0.894197 |
| Median root CPU ratio | 0.892327 | 0.905913 |
| Faster roots | 16/16 | 16/16 |
| Worst root median | 0.941460 | 0.972001 |

Each process used192 calls on16 fixed exposed roots, including correctness and
alternating timing pairs; result/iterations/evaluation stream/cache/PV/restored
state signatures were exact. Both passed the frozen aggregate/root-median<=.98,
at least12faster, worst<=1.05 gate. This is **9.7–10.6% sampled Search CPU reduction
relative to15a**, not an accumulated percentage, browser claim or Elo estimate.
Fresh-process confirmation is not held-out strength evidence. A separate fixed200ms
Node throughput diagnostic against15a completed160 calls/80 alternating pairs
on the same16 exposed roots, with fresh Search/cache, depth16 and no node limit.
No samples were discarded. Both arms stopped on time in all80 calls each.

- Total nodes: baseline1,297,255 → candidate1,486,699; ratio1.1460345 (+14.60%).
- Median paired node ratio1.128047; median root ratio1.126232; all16 roots gained.
- Completed-depth differences:7 pairs +1,73 equal,0 lower.
- Candidate Search wall200.048–202.484ms; whole-call wall201.270–209.378ms.
- Legal moves/PVs, complete history, board/path restoration and limits passed.

The measurement's source/document manifest was preserved before this reporting
update and all measurement pins verified unchanged. This is throughput on
exposed Node fixtures, not independent playing-strength, Elo or browser evidence;
no percentages from different baselines are added.

Numerical admission:839 cases compared with original incremental and full
refresh, each in diagnostics/raw/diagnostics mode, including all8material
buckets and81king-bucket pairs/both sides, arbitrary jumps, overflow, invalid
rollback and unaligned fallback. Portable tests add89,604 actual-kernel paired
operations against independent BigInt lane arithmetic, plus synthetic alignment,
bank reuse/reset/ownership tests. Existing transaction fault-injection tests
remain active. Big-endian symmetry is established algebraically and with swapped
logical lanes, not execution on a physical big-endian machine. Provenance keeps
the original upstream source hash and both prior905 and15a forward versions.

### Closed experiments remain closed

The isolated quiet-mate detector finished24 equal-time games5W10L6D3UNKNOWN,
with no positive opening families; it failed and is not included. Subsequent
capture-history and incremental-feature shadows did not pass their fixed
opportunity gates. Forward move-geometry tables failed their resource gate
(CPU ratio1.001352, only5/16faster). None is enabled or retried here. Previous
905 equal-time match11W12L1D likewise did not establish stronger play. The present
change preserves fixed-node search results; speed evidence must not replace
playing-strength evidence.

## Exact Float64 output-paired first head (1.0.2)

Baseline is publishede173/1.0.1, including its existing paired FT delta lanes.
Only transposeFirstHead and sparseFirstAffine change: input-major adjacent
OUTPUT rows are encoded with fixedQ=2^26. Eight explicit Float64 accumulators
preserve ascending input order and zero-input skipping; every nonzero input
contributes to the common offset correction even when packed weights are zero.
Signed biases are added only after unpacking, then the original Int32 wrap.
Each unsigned lane<=1024*255*127=33,162,240<Q and every packed product/partial
sum<2^52, so binary64 integer arithmetic is exact. No input-pair Math.imul dot,
input transform fusion, search change, model edit or parameter sweep is involved.

The private Float64 tables replace rather than supplement the old Int8 transpose:
512KiB versus128KiB across8stacks, **net+384KiB per parsed model**. Diagnostics
remain owned arrays; original FT/full refresh/PSQT/transactions are unchanged.
Original source attribution, GPL license, C07 identity and the complete prior
forward hash chain remain in provenance.

| Metric, candidate/e173 baseline | Screen | Independent-process confirmation |
| --- | ---: | ---: |
| Aggregate Search CPU |0.8443202254|0.8460435007|
| Median root CPU ratio |0.8412463|0.8402070|
| Faster roots |16/16|16/16|
| Worst root median |0.8956516|0.9153968|

Each192-call process retained exact result/iterations/evaluation-stream/cache/
PV/restored-state signatures;195frozen input pins were reverified unchanged.
Both pass aggregate/rootmedian<=.98,>=12faster,worst<=1.05. This is
**15.4–15.6% sampled Node Search CPU reduction relative toe173**, not cumulative
with earlier percentages and not an Elo/browser claim. Fixed exposed roots and
independent processes do not establish independent playing strength. This
version's separate direct200ms Node throughput diagnostic completed160calls/
80pairs, relative to the samee173 baseline on16exposed roots, without sample
rejection or outcome-dependent reruns:

- Total nodes1,558,103→1,901,248, ratio1.22023255 (+22.023255%).
- Median paired node ratio1.217892, median root ratio1.212113;16/16roots gained.
- Completed depth14pairs+1,66same,0lower.
- Candidate Search wall200.061886–201.191870ms, whole-call201.157102–208.035785ms.
- Every call passed legal move/PV/history/state restoration checks. Measurement
  pins were verified unchanged and its pre-report manifest preserved separately.

This is a fixed-time throughput result, not a new match or strength/Elo claim;
no browser extrapolation or cumulative percentage addition is justified.

Numerical admission:80actual-kernel fixtures/1280output lanes against independent
row-major BigInt oracle, including1024input extremes, signed8endpoints,
asymmetric random weights and Int32bias boundaries. All839original full/inc
cases match in diagnostics/raw/diagnostics modes, across all material/king
buckets, arbitrary jumps, overflow and invalid rollback. Portable tests need no
external experimental directory/model and retain the existing FT/transaction
regressions. Historical failed packed-input/head-fusion proposals remain closed;
this entry records only the distinct output-pair mechanism.

# Exact optional NNUE numeric head

Only the existing three dense numeric NNUE layers may run in WASM SIMD.
Search, move generation, rules, feature extraction/transform, cache, PSQT/scaling
and UI remain JavaScript and the original C07 network is unchanged. This is not
a full Fairy-Stockfish backend. No model is embedded in the module.

The one allowed module is 1,184 bytes with SHA-256
`9e806804d5e5a0041c20165a2cc3481060ad63bf774b598dc7d99858d5eab046`.
It has zero imports and four pages (262,144 bytes) of unshared memory with the
same fixed maximum. One instance and copied parameters belong to each parsed
model. Each raw evaluation copies two 512-lane accumulators (2,048 bytes) and
makes one synchronous head call. Diagnostic outputs use the unchanged JS path.
`wasmHeadStats()` in the internal helper returns a frozen counters snapshot; it
is not a new public facade API and exposes no model data or memory.

## Fallback and failures

Unavailable WebAssembly APIs, SIMD validation, atob or little-endian typed
arrays select scalar JS. A native `WebAssembly.CompileError` during Module or
Instance construction also selects JS, including browsers that block WASM via
CSP. No CSP relaxation is requested. Other exceptions, layout or parameter
failures, copy errors, reentry and actual runtime traps propagate. They are not
silently retried as scalar evaluations. Failed session evaluations retain the
existing transactional rollback semantics. Fallback counters count model
initializations selecting JS, not individual scalar evaluations.

## Corresponding source and deterministic reproduction

The full C implementation is
`engine/experimental/fairy-cc0-sparse-head-v1/wasm-head-source.c`.
The bridge is the adjacent `wasm-head.mjs`. Both use GPL-3.0-or-later, alongside
this package's `LICENSE` and `NOTICE.md`. The original audited C file retains its
historical private-experiment comment; that comment does not limit the license.
Toolchain identity, source/binary hashes and all flags are in
`provenance/WASM-HEAD.json`. The exact compiler distribution is **Emscripten
7.0.0 for Linux x86-64**, emsdk commit
`1693ce7359fc9694f198694f902a2cc061239b86`, release hash
`6afbd83493d647051772d491124187d4e9a0cda9`.

Official archive:
https://storage.googleapis.com/webassembly/emscripten-releases-builds/linux/6afbd83493d647051772d491124187d4e9a0cda9/wasm-binaries.tar.xz

The archive is 322,310,412 bytes, SHA-256
`6e7c6d26cf8bde31e6cf6a377c113f913cb2d30f4c2d671c1042e1c4bcd16495`.
The independently published checksum is recorded at:
https://github.com/emscripten-core/emsdk/blob/1693ce7359fc9694f198694f902a2cc061239b86/bazel/revisions.bzl

The archive contains top-level `install/`; use `install/bin/clang` and its
sibling `wasm-ld`. This identifies how to acquire the same compiler distribution
without relying on a private workspace. The build script does not fetch or
extract it. The official LLVM compiler and linker must already be installed.
Supply the explicitly pinned compiler path:

```sh
WASM_CC=/absolute/path/to/installed/clang node scripts/build-wasm-head.mjs /tmp/head.wasm
node scripts/embed-wasm-head.mjs /tmp/head.wasm
npm run verify:wasm
npm run verify
npm test
```

The build script authenticates both executables and the C source before running,
then rejects any output whose bytes/hash differ from the audited module. It
does not download or install software. The embed command defaults to checking
byte equality. Append `--write` to regenerate only the identical pinned base64
payload. This cannot select another backend. Use the same toolchain to obtain
bit-identical bytes, including LLVM custom metadata sections.

Release manifests and source archives include the C, bridge, build/embed scripts,
toolchain pins, full GPL license, notices and CC0 license/provenance. They exclude
the separately authenticated model and external research logs. The package's
strict loader guard permits this exact helper and module only; any other WASM,
native loader, nonlocal or dynamic import remains prohibited.

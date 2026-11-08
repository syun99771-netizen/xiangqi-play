# License and provenance

This is recovered pure-JavaScript Xiangqi source with an external model input.
No model weights, native engine binary, WASM module, match corpus, training
dataset, or large evidence files are distributed in this source package.

## Code: GPL-3.0-or-later

Runtime/inference and derived engine source are GPL-3.0-or-later. Retain all
source headers and this notice. The full license is in `LICENSE`.

- The NNUE inference mathematics and format derive from Fairy-Stockfish commit
  `84dd49a4bd00b9959b07e1b917d362c46e6f6d75`, Copyright (C) 2004–2022 The Stockfish
  developers. Source: https://github.com/fairy-stockfish/Fairy-Stockfish/tree/84dd49a4bd00b9959b07e1b917d362c46e6f6d75/src/nnue
- The pinned public rule/chase policy derives from official-pikafish/Pikafish
  commit `b562d6aeac5401879e973dc53ddb56053f07bb6a`, Copyright Pikafish/Stockfish
  contributors. Source: https://github.com/official-pikafish/Pikafish/tree/b562d6aeac5401879e973dc53ddb56053f07bb6a
  This is not a claim of equivalence to the 2026-09-25 ChineseRule implementation.
- `provenance/ENGINE-SOURCE.json` records each of the 34 unchanged engine files
  from the confirmed cumulative candidate. The recovered source is the older
  2026-11-02 publicSearch baseline, not the lost latestSearch `b75bd4…` version.
- The facade, Node client and browser-worker example are reused from the
  recovered portable-reference handoff. Packaging changes shorten imports to
  `engine/`, re-export `SDK_LIMITS`, and add a tested local Node model-path option.

All JavaScript implementation modules required by this distribution are
included. This notice does not grant permission for closed-source distribution
of the combined code. Historical test cases demonstrating unsafe experimental
settings are not authorization to enable them in the public API.

## External C07 weights: CC0-1.0

The only accepted model is the original Fairy-Stockfish Xiangqi network,
11,261,932 bytes, SHA-256
`c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11`.

It is identified by Fairy-Stockfish-NNUE commit
`5fbbb9e15fd882cec18a2a5c3d4bfa25dc07169b`. Networks README at commit
`a238f8da2df269c28fec0e2bd2ca0ffd241f83fe` explicitly exempts these Fairy-Stockfish
Xiangqi weights from the restrictions on other Pikafish weights and declares
them CC0. That full statement is saved in
`licenses/Pikafish-Networks-README.md`; the CC0 text is in `licenses/CC0-1.0.txt`.
Pinned source URLs and identity are in `provenance/MODEL.json`.

The model is not trained by this project. CC0 weight permission does not
relicense GPL code, other networks, or underlying training data.

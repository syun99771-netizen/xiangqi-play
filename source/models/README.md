# External model, not distributed with source

Supply the separately provided original `xiangqi-c07e94a5c7cb.nnue` here, or use
`XIANGQI_MODEL_PATH` / `createNodeClient({modelPath})` with a local file.

Expected size: 11,261,932 bytes.

SHA-256: `c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11`.

The public facade verifies the hash before parsing. Nothing in this package
downloads weights. `.nnue` files are excluded from version control and the
explicit package file list. Do not replace this file with another network.

This Fairy-Stockfish Xiangqi model is separately CC0-1.0. Its original upstream
trainer description is not a claim that this project trained it. See
`../provenance/MODEL.json` and `../licenses/Pikafish-Networks-README.md` for the
specific scope. This permission does not extend to other Pikafish networks or
the underlying training data. Code remains GPL-3.0-or-later.

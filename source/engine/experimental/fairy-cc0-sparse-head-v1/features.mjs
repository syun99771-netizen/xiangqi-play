// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * Portable JavaScript adaptation of Fairy-Stockfish's HalfKAv2Variants
 * feature indexing, specialized to ordinary Xiangqi.
 * Copyright (C) 2004-2022 The Stockfish developers (upstream implementation).
 * JavaScript adaptation and validation: 2026 Xiangqi Evolve JS contributors.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. This program is distributed WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See <https://www.gnu.org/licenses/>.
 *
 * Source pin: fairy-stockfish/Fairy-Stockfish
 * 84dd49a4bd00b9959b07e1b917d362c46e6f6d75
 * src/nnue/features/half_ka_v2_variants.{cpp,h}, src/variant.cpp, src/types.h
 * https://github.com/fairy-stockfish/Fairy-Stockfish/tree/84dd49a4bd00b9959b07e1b917d362c46e6f6d75
 * The separately licensed model is xiangqi-c07e94a5c7cb.nnue (CC0-1.0).
 * That model license does not replace this source-derived module's GPL.
 */

export const BOARD_SQUARES = 90;
export const PIECE_SQUARE_GROUPS = 13;
export const KING_BUCKETS = 9;
export const FEATURES_PER_KING = BOARD_SQUARES * PIECE_SQUARE_GROUPS;
export const FEATURES_DIMENSIONS = KING_BUCKETS * FEATURES_PER_KING;

export const FEATURE_SOURCE = Object.freeze({
  featureSet: 'HalfKAv2Variants',
  engineCommit: '84dd49a4bd00b9959b07e1b917d362c46e6f6d75',
  network: 'xiangqi-c07e94a5c7cb.nnue',
  license: 'GPL-3.0-or-later',
  // SHA-256 of the pinned, inspected upstream .cpp, not of this JS file/net.
  upstreamFeatureCppSha256: '0db1773800327d8faa86987c49d48790786a879c6df4b92dd2459c66f5b28200',
});

// Board: P=1, A=2, B=3, N=4, C=5, R=6, K=7; positive=Red.
// Native NNUE order: ROOK, FERS, CANNON, SOLDIER, HORSE, ELEPHANT, KING.
// Each non-king has consecutive own/opponent groups; both kings use group 12.
const OWN_GROUP_BY_TYPE = Object.freeze([-1, 6, 2, 10, 8, 4, 0, 12]);

function validatePerspective(perspective) {
  if (perspective !== 1 && perspective !== -1) {
    throw new RangeError('Feature perspective must be +1 (Red) or -1 (Black)');
  }
}

function validateSquare(square, name) {
  if (!Number.isInteger(square) || square < 0 || square >= BOARD_SQUARES) {
    throw new RangeError(`${name} must be an integer Board square in [0, 89]`);
  }
}

function validatePiece(piece) {
  if (!Number.isInteger(piece) || piece === 0 || piece < -7 || piece > 7) {
    throw new RangeError('Feature piece must be a signed Board piece code in +/-[1, 7]');
  }
}

function orientedSquareUnchecked(square, perspective) {
  const row = Math.floor(square / 9);
  return square % 9 + 9 * (perspective === 1 ? 9 - row : row);
}

/**
 * Translate Board's row-zero-at-Black-home storage to native NNUE numbering.
 * Native rank zero is Red's home; Black reflects ranks, never files.
 * The upstream comment says "180", but its executable code uses flip_rank.
 */
export function orientedSquare(square, perspective) {
  validatePerspective(perspective);
  validateSquare(square, 'Piece square');
  return orientedSquareUnchecked(square, perspective);
}

/** All nine own-palace squares have distinct buckets; no file mirroring. */
export function kingBucket(ownKingSquare, perspective) {
  validatePerspective(perspective);
  validateSquare(ownKingSquare, 'Own king square');
  const oriented = orientedSquareUnchecked(ownKingSquare, perspective);
  const rank = Math.floor(oriented / 9);
  const file = oriented % 9;
  if (rank > 2 || file < 3 || file > 5) {
    throw new RangeError('Own king must be inside its Xiangqi palace');
  }
  return rank * 3 + file - 3;
}

function pieceGroupUnchecked(piece, perspective) {
  const type = Math.abs(piece);
  return OWN_GROUP_BY_TYPE[type] + (type !== 7 && piece * perspective < 0 ? 1 : 0);
}

function featureIndexUnchecked(piece, square, perspective, bucket) {
  return bucket * FEATURES_PER_KING
    + pieceGroupUnchecked(piece, perspective) * BOARD_SQUARES
    + orientedSquareUnchecked(square, perspective);
}

/**
 * Encode one raw piece-square feature. All squares are allowed for the
 * feature's piece, including kings, to expose the complete serialized space.
 * Only ownKingSquare selects a bucket and must be in the perspective's palace.
 * This low-level helper does not assert that a complete position is legal.
 */
export function featureIndex(piece, square, perspective, ownKingSquare) {
  validatePiece(piece);
  validateSquare(square, 'Piece square');
  const bucket = kingBucket(ownKingSquare, perspective);
  return featureIndexUnchecked(piece, square, perspective, bucket);
}

function inspectBoard(board, perspective) {
  validatePerspective(perspective);
  const squares = board?.squares;
  if ((!Array.isArray(squares) && !ArrayBuffer.isView(squares)) || squares.length !== BOARD_SQUARES) {
    throw new TypeError('Expected board.squares to be a 90-element Array or typed array');
  }
  let count = 0;
  let redKing = -1;
  let blackKing = -1;
  for (let square = 0; square < BOARD_SQUARES; square++) {
    const piece = squares[square];
    if (piece === 0) continue;
    validatePiece(piece);
    count++;
    if (piece === 7) {
      if (redKing !== -1) throw new RangeError('Duplicate Red king');
      redKing = square;
    } else if (piece === -7) {
      if (blackKing !== -1) throw new RangeError('Duplicate Black king');
      blackKing = square;
    }
  }
  if (redKing === -1 || blackKing === -1) {
    throw new RangeError('Exactly one Red king and one Black king are required');
  }
  const ownKingSquare = perspective === 1 ? redKing : blackKing;
  return {squares, count, ownKingSquare, bucket: kingBucket(ownKingSquare, perspective)};
}

/**
 * Full-refresh feature set for one perspective, including both kings.
 * Returns a fresh Uint16Array in ascending Board.squares order, not sorted
 * feature-index order. The set matches native indexing; native enumeration
 * order need not match Board's storage order. Does not inspect board.turn.
 *
 * Missing/duplicate kings, unsupported pieces, and an out-of-palace own king
 * are rejected. Stale board.kings metadata is deliberately ignored. This is
 * not a legality or material validator. The opponent's palace is validated
 * when requesting its perspective. The board is never mutated.
 *
 * In a future incremental path, moving the own king requires refreshing
 * every feature for that perspective. The other perspective only changes
 * the king's ordinary piece-square feature. Captures remove an extra feature;
 * a turn-only/null change affects neither feature set. No cache is used here.
 */
export function activeFeatures(board, perspective) {
  const {squares, count, bucket} = inspectBoard(board, perspective);
  const active = new Uint16Array(count);
  let next = 0;
  for (let square = 0; square < BOARD_SQUARES; square++) {
    const piece = squares[square];
    if (piece !== 0) active[next++] = featureIndexUnchecked(piece, square, perspective, bucket);
  }
  return active;
}

/** Allocating diagnostic description; not a search-node path. */
export function describeFeatures(board, perspective) {
  const {squares, count, ownKingSquare, bucket} = inspectBoard(board, perspective);
  const features = [];
  for (let square = 0; square < BOARD_SQUARES; square++) {
    const piece = squares[square];
    if (piece !== 0) features.push({
      piece,
      square,
      orientedSquare: orientedSquareUnchecked(square, perspective),
      group: pieceGroupUnchecked(piece, perspective),
      index: featureIndexUnchecked(piece, square, perspective, bucket),
    });
  }
  return {perspective, ownKingSquare, kingBucket: bucket, pieceCount: count, features};
}

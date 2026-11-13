import type { Color, PieceSymbol, Square } from 'chess.js';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MoveAnimationStep {
  from: Square;
  to: Square;
  /** Initial X offset in square units from `to` back to `from`. */
  dx: number;
  /** Initial Y offset in square units from `to` back to `from`. */
  dy: number;
}

const CASTLING_ROOK_MOVES: Record<string, { from: Square; to: Square }> = {
  'e1-g1': { from: 'h1', to: 'f1' },
  'e1-c1': { from: 'a1', to: 'd1' },
  'e8-g8': { from: 'h8', to: 'f8' },
  'e8-c8': { from: 'a8', to: 'd8' }
};

const PIECE_NAMES: Record<PieceSymbol, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn'
};

/**
 * All 64 squares in render order (top-left to bottom-right) for the given board orientation.
 * `w` puts white at the bottom, `b` puts black at the bottom.
 */
export function orderedSquares(orientation: Color): Square[] {
  const files = orientation === 'w' ? [...FILES] : [...FILES].reverse();
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square));
}

/** True for dark squares (a1 is dark). */
export function isDarkSquare(square: Square): boolean {
  return (FILES.indexOf(square[0] as (typeof FILES)[number]) + Number(square[1])) % 2 === 1;
}

/** Screen-reader label, e.g. "e4, white pawn" or "e5, empty". */
export function squareLabel(square: Square, piece?: { type: PieceSymbol; color: Color } | null): string {
  if (!piece) return `${square}, empty`;
  return `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type]}`;
}

/**
 * Moves one square in a visual direction (arrow keys). Directions follow the screen,
 * so "up" is toward rank 8 for white and toward rank 1 for black. Stays put at the edge.
 */
export function stepSquare(square: Square, direction: Direction, orientation: Color): Square {
  const flip = orientation === 'w' ? 1 : -1;
  let dFile = 0;
  let dRank = 0;
  if (direction === 'up') dRank = flip;
  else if (direction === 'down') dRank = -flip;
  else if (direction === 'right') dFile = flip;
  else dFile = -flip;

  const file = FILES.indexOf(square[0] as (typeof FILES)[number]) + dFile;
  const rank = Number(square[1]) + dRank;
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return square;
  return `${FILES[file]}${rank}` as Square;
}

function squareGridPos(square: Square, orientation: Color): { col: number; row: number } {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  return orientation === 'w'
    ? { col: file, row: 8 - rank }
    : { col: 7 - file, row: rank - 1 };
}

/**
 * Visual offset (in square units) placing a piece at `from` when rendered inside `to`,
 * matching the current board `orientation`.
 */
export function squareDelta(from: Square, to: Square, orientation: Color): { dx: number; dy: number } {
  const fromPos = squareGridPos(from, orientation);
  const toPos = squareGridPos(to, orientation);
  return {
    dx: fromPos.col - toPos.col,
    dy: fromPos.row - toPos.row
  };
}

/**
 * Returns the animated piece movements for `move`. Castling moves include both the king and rook.
 */
export function moveAnimationSteps(
  move: { from: Square; to: Square },
  movedPieceType: PieceSymbol | undefined,
  orientation: Color
): MoveAnimationStep[] {
  const steps: MoveAnimationStep[] = [{ ...move, ...squareDelta(move.from, move.to, orientation) }];
  if (movedPieceType === 'k') {
    const rookMove = CASTLING_ROOK_MOVES[`${move.from}-${move.to}`];
    if (rookMove) {
      steps.push({ ...rookMove, ...squareDelta(rookMove.from, rookMove.to, orientation) });
    }
  }
  return steps;
}

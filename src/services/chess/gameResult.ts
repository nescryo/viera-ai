import type { Chess, Color } from 'chess.js';

export type ChessOutcome = 'user-win' | 'deepseek-win' | 'draw';
export type ChessEndReason = 'checkmate' | 'draw' | 'resign';

export interface ChessResult {
  outcome: ChessOutcome;
  reason: ChessEndReason;
}

/** Result of the game so far, or undefined while it is still being played. */
export function computeResult(game: Chess, userColor: Color, resigned: boolean): ChessResult | undefined {
  if (resigned) return { outcome: 'deepseek-win', reason: 'resign' };
  if (game.isCheckmate()) {
    // The side to move is the one that got mated.
    return { outcome: game.turn() === userColor ? 'deepseek-win' : 'user-win', reason: 'checkmate' };
  }
  if (game.isDraw()) return { outcome: 'draw', reason: 'draw' };
  return undefined;
}

import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import { computeResult } from './gameResult';
import type { ChessResult } from './gameResult';

export type ChessSide = 'user' | 'deepseek';

export interface ChessHistoryEntry {
  san: string;
  by: ChessSide;
  from: Square;
  to: Square;
  /** chess.js move flags, e.g. `c` capture, `p` promotion. */
  flags: string;
}

/** Plain, immutable view of a session. Safe to keep in React state. */
export interface ChessSnapshot {
  fen: string;
  userColor: Color;
  turn: ChessSide;
  entries: ChessHistoryEntry[];
  lastMove: { from: Square; to: Square } | null;
  /** Square of the king that is in check, if any. */
  checkSquare: Square | null;
  result: ChessResult | undefined;
}

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/**
 * Rules and bookkeeping for one game between the user and DeepSeek-chan.
 * Wraps chess.js so the React hook stays thin and this logic can be unit tested.
 */
export class ChessSession {
  private game: Chess;
  private entries: ChessHistoryEntry[] = [];
  private resigned = false;
  private color: Color;

  constructor(userColor: Color = 'w', fen?: string) {
    this.color = userColor;
    this.game = new Chess(fen);
  }

  get fen(): string {
    return this.game.fen();
  }

  /** Starts a new game, optionally switching the user's color. */
  reset(userColor: Color = this.color, fen?: string): void {
    this.color = userColor;
    this.game = new Chess(fen);
    this.entries = [];
    this.resigned = false;
  }

  isOver(): boolean {
    return computeResult(this.game, this.color, this.resigned) !== undefined;
  }

  /** Squares the user's piece on `square` can move to. Empty when it is not the user's move. */
  legalTargets(square: Square): Square[] {
    if (this.isOver() || this.game.turn() !== this.color) return [];
    if (this.game.get(square)?.color !== this.color) return [];
    return this.game.moves({ square, verbose: true }).map((move) => move.to);
  }

  /** Plays the user's move. Promotions default to a queen. Returns null if the move is not allowed. */
  userMove(from: Square, to: Square, promotion = 'q'): ChessHistoryEntry | null {
    if (this.isOver() || this.game.turn() !== this.color) return null;
    return this.play(from, to, promotion, 'user');
  }

  /** Plays DeepSeek-chan's move given in UCI form (e.g. `e7e5`, `a7a8q`). Returns null if not allowed. */
  engineMove(uci: string): ChessHistoryEntry | null {
    if (this.isOver() || this.game.turn() === this.color || !UCI_PATTERN.test(uci)) return null;
    return this.play(uci.slice(0, 2) as Square, uci.slice(2, 4) as Square, uci[4], 'deepseek');
  }

  /**
   * Takes back the user's last move, and DeepSeek-chan's reply to it if there was one.
   * Only works on the user's turn, and never takes back DeepSeek-chan's opening move.
   */
  undo(): boolean {
    if (this.isOver() || this.game.turn() !== this.color) return false;
    if (!this.entries.some((entry) => entry.by === 'user')) return false;
    if (this.entries[this.entries.length - 1].by === 'deepseek') {
      this.game.undo();
      this.entries.pop();
    }
    this.game.undo();
    this.entries.pop();
    return true;
  }

  resign(): void {
    if (!this.isOver()) this.resigned = true;
  }

  snapshot(): ChessSnapshot {
    const last = this.entries[this.entries.length - 1];
    return {
      fen: this.game.fen(),
      userColor: this.color,
      turn: this.game.turn() === this.color ? 'user' : 'deepseek',
      entries: [...this.entries],
      lastMove: last ? { from: last.from, to: last.to } : null,
      checkSquare: this.findCheckedKing(),
      result: computeResult(this.game, this.color, this.resigned)
    };
  }

  private play(from: Square, to: Square, promotion: string | undefined, by: ChessSide): ChessHistoryEntry | null {
    try {
      const move = this.game.move({ from, to, promotion });
      const entry: ChessHistoryEntry = { san: move.san, by, from: move.from, to: move.to, flags: move.flags };
      this.entries.push(entry);
      return entry;
    } catch {
      // chess.js throws on illegal moves
      return null;
    }
  }

  private findCheckedKing(): Square | null {
    if (!this.game.inCheck()) return null;
    const side = this.game.turn();
    for (const row of this.game.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === side) return cell.square;
      }
    }
    return null;
  }
}

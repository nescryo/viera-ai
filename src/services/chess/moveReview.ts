import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import type { ChessHistoryEntry } from './chessSession';
import type { ChessResult } from './gameResult';
import { MAX_CHESS_CHAT_CHARS, categorizeEval, uciToSan } from './commentary';
import { detectGamePhase } from './gameEvents';

/** Verdict for one user move, from best to worst. */
export type MoveLabel = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** Search depth used when analysing positions for a review. */
export const REVIEW_ANALYSIS_DEPTH = 12;

/** Max moments narrated in one review. */
export const MAX_REVIEW_MOMENTS = 4;

/** Minimum win% the user must lose for each label (Lichess-style thresholds). */
export const REVIEW_THRESHOLDS = {
  inaccuracy: 10,
  mistake: 20,
  blunder: 30
} as const;

/** Centipawn value standing in for a delivered checkmate. Matches the scale of `parseUciScoreToCp`. */
const MATE_CP = 10000;

/** Centipawns are capped before the win% conversion, as Lichess does. */
const WIN_PERCENT_CP_CAP = 1000;

/** One half-move of the game, rebuilt with the positions before and after it. */
export interface ReviewPly {
  /** 0-based half-move index in `entries`. */
  index: number;
  entry: ChessHistoryEntry;
  fenBefore: string;
  fenAfter: string;
  /** The move in UCI form, e.g. `e2e4` or `e7e8q`. */
  uci: string;
  /** Set when the move ended the game. */
  terminalAfter?: 'checkmate' | 'draw';
}

/** Engine result for one position. `evalCp` is from the side-to-move's perspective. */
export interface PositionAnalysis {
  bestMove: string | null;
  evalCp: number | undefined;
}

/** A user move with its verdict. All evaluations are from the user's perspective. */
export interface ReviewedMove {
  ply: ReviewPly;
  /** Full-move number, as written in move lists. */
  moveNumber: number;
  label: MoveLabel;
  userCpBefore: number;
  userCpAfter: number;
  winBefore: number;
  winAfter: number;
  /** Win% the user lost with this move. Negative when the position improved. */
  drop: number;
  bestMoveUci?: string;
  /** Engine's best move in SAN, verified against the position. */
  bestMoveSan?: string;
}

/**
 * Replays `entries` from the starting position and returns each half-move with the
 * positions around it. Replay stops at the first move that is not legal.
 */
export function buildReviewPlies(entries: readonly ChessHistoryEntry[]): ReviewPly[] {
  const game = new Chess();
  const plies: ReviewPly[] = [];

  for (const [index, entry] of entries.entries()) {
    const fenBefore = game.fen();
    let move;
    try {
      move = game.move(entry.san);
    } catch {
      break;
    }
    const terminalAfter = game.isCheckmate() ? 'checkmate' : game.isDraw() ? 'draw' : undefined;
    plies.push({
      index,
      entry,
      fenBefore,
      fenAfter: game.fen(),
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      ...(terminalAfter ? { terminalAfter } : {})
    });
  }

  return plies;
}

/**
 * Positions the engine must analyse to judge the user's moves: the position before each
 * user move, and the position after it unless the move ended the game. Unique, in game order.
 */
export function positionsToAnalyze(plies: readonly ReviewPly[]): string[] {
  const fens = new Set<string>();
  for (const ply of plies) {
    if (ply.entry.by !== 'user') continue;
    fens.add(ply.fenBefore);
    if (!ply.terminalAfter) fens.add(ply.fenAfter);
  }
  return [...fens];
}

function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** Converts a side-to-move evaluation in `fen` into the user's perspective. */
export function toUserCp(fen: string, cp: number, userColor: Color): number {
  return sideToMove(fen) === userColor ? cp : -cp;
}

/** Chance of winning (0-100) for a centipawn evaluation, using the Lichess formula. */
export function winPercent(cp: number): number {
  const capped = Math.max(-WIN_PERCENT_CP_CAP, Math.min(WIN_PERCENT_CP_CAP, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * capped)) - 1);
}

/** Labels a move from the user's win% before and after it. Playing the engine's move is always `best`. */
export function classifyMove(
  winBefore: number,
  winAfter: number,
  playedUci: string,
  bestUci?: string | null
): MoveLabel {
  if (bestUci && playedUci === bestUci) return 'best';
  const drop = winBefore - winAfter;
  if (drop >= REVIEW_THRESHOLDS.blunder) return 'blunder';
  if (drop >= REVIEW_THRESHOLDS.mistake) return 'mistake';
  if (drop >= REVIEW_THRESHOLDS.inaccuracy) return 'inaccuracy';
  return 'good';
}

/**
 * Judges every user move that has the analyses it needs. Moves whose positions are
 * missing from `analyses`, or have no score, are skipped.
 */
export function reviewUserMoves(
  plies: readonly ReviewPly[],
  analyses: ReadonlyMap<string, PositionAnalysis>,
  userColor: Color
): ReviewedMove[] {
  const reviewed: ReviewedMove[] = [];

  for (const ply of plies) {
    if (ply.entry.by !== 'user') continue;

    const before = analyses.get(ply.fenBefore);
    if (!before || before.evalCp === undefined) continue;

    let userCpAfter: number;
    if (ply.terminalAfter === 'checkmate') {
      userCpAfter = MATE_CP;
    } else if (ply.terminalAfter === 'draw') {
      userCpAfter = 0;
    } else {
      const after = analyses.get(ply.fenAfter);
      if (!after || after.evalCp === undefined) continue;
      userCpAfter = toUserCp(ply.fenAfter, after.evalCp, userColor);
    }

    const userCpBefore = toUserCp(ply.fenBefore, before.evalCp, userColor);
    const winBefore = winPercent(userCpBefore);
    const winAfter = winPercent(userCpAfter);
    const bestMoveUci = before.bestMove ?? undefined;
    const label = ply.terminalAfter === 'checkmate'
      ? 'best'
      : classifyMove(winBefore, winAfter, ply.uci, bestMoveUci);

    reviewed.push({
      ply,
      moveNumber: Math.floor(ply.index / 2) + 1,
      label,
      userCpBefore,
      userCpAfter,
      winBefore,
      winAfter,
      drop: winBefore - winAfter,
      ...(bestMoveUci ? { bestMoveUci } : {}),
      ...(bestMoveUci && bestMoveUci !== ply.uci ? { bestMoveSan: uciToSan(ply.fenBefore, bestMoveUci) } : {})
    });
  }

  return reviewed;
}

const MISTAKE_LABELS: readonly MoveLabel[] = ['inaccuracy', 'mistake', 'blunder'];

/**
 * Picks the moments worth narrating: the user's worst mistakes (largest win% drop),
 * at most `max`, in game order. With no mistakes, returns the single move that gained
 * the most, so the review can praise it.
 */
export function pickKeyMoments(reviewed: readonly ReviewedMove[], max = MAX_REVIEW_MOMENTS): ReviewedMove[] {
  const mistakes = reviewed.filter((move) => MISTAKE_LABELS.includes(move.label));
  if (mistakes.length > 0) {
    return [...mistakes]
      .sort((a, b) => b.drop - a.drop)
      .slice(0, max)
      .sort((a, b) => a.ply.index - b.ply.index);
  }

  if (reviewed.length === 0) return [];
  const pool = reviewed.some((move) => move.label === 'best')
    ? reviewed.filter((move) => move.label === 'best')
    : reviewed;
  // Smallest drop is the biggest gain; ties go to the later move
  const praise = pool.reduce((top, move) => (move.drop <= top.drop ? move : top));
  return [praise];
}

/** Move as written in a move list: `14. Qxd5` for white, `14... Qxd5` for black. */
export function formatReviewMove(move: ReviewedMove): string {
  const dots = move.ply.index % 2 === 0 ? '.' : '...';
  return `${move.moveNumber}${dots} ${move.ply.entry.san}`;
}

export interface ReviewMomentPromptInput {
  move: ReviewedMove;
  /** 1-based position of this moment in the review. */
  position: number;
  total: number;
  /** Set when the game is already over. */
  result?: ChessResult;
}

/**
 * Builds the structured update for one review moment. Only verified moves and
 * qualitative evaluations are included, so the LLM has no raw numbers to quote.
 */
export function buildReviewMomentPrompt(input: ReviewMomentPromptInput): string {
  const { move, position, total, result } = input;
  const status = result ? `finished (${result.outcome}, ${result.reason})` : 'in progress, paused for this review';

  const lines = [
    '[Chess Move Review]',
    `Moment ${position} of ${total}`,
    `Game status: ${status}`,
    `Phase: ${detectGamePhase(move.ply.fenBefore, move.ply.index)}`,
    `Move: ${formatReviewMove(move)} (played by the user)`,
    `Verdict: ${move.label}`,
    `User's position before the move: ${categorizeEval(move.userCpBefore)}`,
    `User's position after the move: ${categorizeEval(move.userCpAfter)}`
  ];

  if (move.label !== 'best' && move.bestMoveSan) {
    lines.push(`Stronger move the user had: ${move.bestMoveSan}`);
  }

  lines.push('Explain this moment to the user in character:');
  return lines.join('\n');
}

export interface ReviewChatPromptInput extends ReviewMomentPromptInput {
  text: string;
}

/**
 * Builds the structured prompt when the user asks a follow-up question during an active
 * move review, anchored to the reviewed moment rather than the live board.
 */
export function buildReviewChatPrompt(input: ReviewChatPromptInput): string {
  const { move, position, total, result, text } = input;
  const question = text.trim().slice(0, MAX_CHESS_CHAT_CHARS);
  const status = result ? `finished (${result.outcome}, ${result.reason})` : 'in progress, paused for this review';

  const lines = [
    '[Chess Review Question]',
    `Moment ${position} of ${total}`,
    `Game status: ${status}`,
    `Phase: ${detectGamePhase(move.ply.fenBefore, move.ply.index)}`,
    `Reviewed move: ${formatReviewMove(move)} (played by the user)`,
    `Verdict: ${move.label}`,
    `Position before the move (FEN): ${move.ply.fenBefore}`,
    `Position after the move (FEN): ${move.ply.fenAfter}`,
    `User's position before the move: ${categorizeEval(move.userCpBefore)}`,
    `User's position after the move: ${categorizeEval(move.userCpAfter)}`
  ];

  if (move.label !== 'best' && move.bestMoveSan) {
    lines.push(`Stronger move the user had: ${move.bestMoveSan}`);
  }

  lines.push(
    `The user asks: """${question}"""`,
    'Answer the user\'s question about this review moment in character:'
  );
  return lines.join('\n');
}

const UCI_SQUARES_PATTERN = /^([a-h][1-8])([a-h][1-8])[qrbn]?$/;

/** Extracts `{ from, to }` squares from a UCI move string, or null if malformed. */
export function parseUciSquares(uci?: string | null): { from: Square; to: Square } | null {
  if (!uci) return null;
  const match = UCI_SQUARES_PATTERN.exec(uci.trim());
  if (!match) return null;
  return { from: match[1] as Square, to: match[2] as Square };
}

/** Finds the square of the king currently in check in `fen`, or null if not in check. */
export function findCheckedKingSquare(fen: string): Square | null {
  try {
    const game = new Chess(fen);
    if (!game.inCheck()) return null;
    const side = game.turn();
    for (const row of game.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === side) return cell.square;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface ReviewNarration {
  text: string;
  /** Emotion ID from `emotionRegistry.ts`. */
  emotion: string;
}

const TEMPLATE_EMOTION: Record<MoveLabel, string> = {
  best: 'surprised',
  good: 'happy',
  inaccuracy: 'relaxed',
  mistake: 'teasing',
  blunder: 'teasing'
};

/** Fixed narration used only when no LLM is configured. */
export function buildTemplateNarration(move: ReviewedMove): ReviewNarration {
  const ref = `Move ${move.moveNumber}, ${move.ply.entry.san}`;
  const better = move.bestMoveSan;
  const text = {
    best: `${ref}. That was the best move there. Not bad!`,
    good: `${ref}. A solid move.`,
    inaccuracy: `${ref} was a little imprecise.${better ? ` ${better} was better.` : ''}`,
    mistake: `${ref} was a mistake.${better ? ` ${better} was stronger.` : ''}`,
    blunder: `${ref} was a blunder!${better ? ` ${better} was the move.` : ''}`
  }[move.label];
  return { text, emotion: TEMPLATE_EMOTION[move.label] };
}

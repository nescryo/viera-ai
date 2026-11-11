import type { ChessHistoryEntry, ChessSide } from './chessSession';
import type { ChessResult } from './gameResult';

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export type ChessEventKind =
  | 'checkmate'
  | 'draw'
  | 'resign'
  | 'promotion'
  | 'blunder'
  | 'eval-swing'
  | 'major-capture'
  | 'check'
  | 'capture'
  | 'ordinary';

export interface DetectedGameEvent {
  kind: ChessEventKind;
  phase: GamePhase;
  mover?: ChessSide;
  san?: string;
  /** Change in DeepSeek-chan's centipawn evaluation since the previous eval sample. */
  evalDeltaCp?: number;
}

export interface DetectGameEventInput {
  entry?: ChessHistoryEntry;
  fen: string;
  plyCount: number;
  /** Previous evaluation in centipawns from DeepSeek-chan's perspective. */
  prevEvalCp?: number;
  /** Latest evaluation in centipawns from DeepSeek-chan's perspective. */
  currentEvalCp?: number;
  result?: ChessResult;
}

/** Counts remaining non-pawn, non-king pieces (knights, bishops, rooks, queens) in the FEN board field. */
export function countMajorMinorPieces(fen: string): number {
  const placement = fen.split(' ')[0] ?? '';
  let count = 0;
  for (const ch of placement) {
    if ('nbrqNBRQ'.includes(ch)) count += 1;
  }
  return count;
}

/** Determines whether the game is in the opening, middlegame, or endgame. */
export function detectGamePhase(fen: string, plyCount: number): GamePhase {
  if (countMajorMinorPieces(fen) <= 4) {
    return 'endgame';
  }
  if (plyCount <= 12) {
    return 'opening';
  }
  return 'middlegame';
}

/**
 * Classifies the most important event that occurred on a turn by combining
 * move flags, game outcome, and evaluation swings from DeepSeek-chan's perspective.
 */
export function detectGameEvent(input: DetectGameEventInput): DetectedGameEvent {
  const { entry, fen, plyCount, prevEvalCp, currentEvalCp, result } = input;
  const phase = detectGamePhase(fen, plyCount);
  const evalDeltaCp =
    prevEvalCp !== undefined && currentEvalCp !== undefined
      ? currentEvalCp - prevEvalCp
      : undefined;

  if (result) {
    return {
      kind: result.reason,
      phase,
      mover: entry?.by,
      san: entry?.san,
      evalDeltaCp
    };
  }

  if (!entry) {
    return { kind: 'ordinary', phase, evalDeltaCp };
  }

  if (entry.flags.includes('p')) {
    return {
      kind: 'promotion',
      phase,
      mover: entry.by,
      san: entry.san,
      evalDeltaCp
    };
  }

  if (evalDeltaCp !== undefined && Math.abs(evalDeltaCp) >= 300) {
    return {
      kind: 'blunder',
      phase,
      mover: entry.by,
      san: entry.san,
      evalDeltaCp
    };
  }

  if (evalDeltaCp !== undefined && Math.abs(evalDeltaCp) >= 180) {
    return {
      kind: 'eval-swing',
      phase,
      mover: entry.by,
      san: entry.san,
      evalDeltaCp
    };
  }

  const isCheck = entry.san.includes('+');
  const isCapture = entry.flags.includes('c') || entry.flags.includes('e');
  const isMajorCapture = isCapture && (entry.captured === 'q' || entry.captured === 'r');

  if (isMajorCapture) {
    return {
      kind: 'major-capture',
      phase,
      mover: entry.by,
      san: entry.san,
      evalDeltaCp
    };
  }

  if (isCheck) {
    return {
      kind: 'check',
      phase,
      mover: entry.by,
      san: entry.san,
      evalDeltaCp
    };
  }

  if (isCapture) {
    return {
      kind: 'capture',
      phase,
      mover: entry.by,
      san: entry.san,
      evalDeltaCp
    };
  }

  return {
    kind: 'ordinary',
    phase,
    mover: entry.by,
    san: entry.san,
    evalDeltaCp
  };
}

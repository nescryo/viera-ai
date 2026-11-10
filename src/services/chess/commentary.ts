import type { ChessHistoryEntry } from './chessSession';
import type { DetectedGameEvent } from './gameEvents';
import type { ChessResult } from './gameResult';

export type EvalCategory =
  | 'clearly-winning'
  | 'slightly-ahead'
  | 'even'
  | 'under-pressure'
  | 'losing';

export interface ShouldCommentInput {
  event: DetectedGameEvent;
  plyCount: number;
  lastCommentedPly: number | null;
  /** Minimum half-moves between throttled LLM comments (default: 4 plies = 2 full moves). */
  minPlyGap?: number;
}

export interface BuildChessPromptInput {
  event: DetectedGameEvent;
  entries: readonly ChessHistoryEntry[];
  evalCp?: number;
  difficultyLabel: string;
  result?: ChessResult;
}

export const CHESS_SYSTEM_PROMPT_ADDENDUM = `[CHESS MINIGAME COMMENTARY MODE]:
You are currently playing a live game of chess against the user.
- React ONLY to the latest board event described in the turn update.
- Keep your reaction to 1 or 2 short, punchy spoken sentences suitable for a speech bubble next to the board.
- STRICT RULE: NEVER invent, suggest, or mention specific chess squares, algebraic notation (such as "e4", "Nf3", "Qxf7"), or hypothetical move variations. Speak naturally about the moment (capturing a big piece, getting checked, making a mistake, winning, or losing).
- Do not use <narrative> tags during chess commentary; output only your direct spoken line (with your leading [emotion] tag, and <ja>...</ja> tag if Japanese dubbing mode is active).
- If you are losing or lose the match, react playfully in character (cute frustration, pouting, or asking for a rematch) and never accuse the user of cheating.`;

/** Maps a centipawn evaluation (from DeepSeek-chan's perspective) into a qualitative category. */
export function categorizeEval(evalCp?: number): EvalCategory {
  if (evalCp === undefined) return 'even';
  if (evalCp >= 250) return 'clearly-winning';
  if (evalCp >= 80) return 'slightly-ahead';
  if (evalCp <= -250) return 'losing';
  if (evalCp <= -80) return 'under-pressure';
  return 'even';
}

/** Formats the most recent half-moves into numbered algebraic pairs (e.g. `2. Nf3 Nc6 3. Bb5`). */
export function formatRecentMoves(entries: readonly ChessHistoryEntry[], maxPlies = 8): string {
  if (entries.length === 0) return 'none';
  const startIdx = Math.max(0, entries.length - maxPlies);
  const parts: string[] = [];

  for (let i = startIdx; i < entries.length; i += 1) {
    const moveNumber = Math.floor(i / 2) + 1;
    const isWhiteMove = i % 2 === 0;
    if (isWhiteMove) {
      parts.push(`${moveNumber}. ${entries[i].san}`);
    } else if (i === startIdx) {
      parts.push(`${moveNumber}... ${entries[i].san}`);
    } else {
      parts.push(entries[i].san);
    }
  }

  return parts.join(' ');
}

/**
 * Decides whether the current turn warrants calling the LLM for spoken commentary.
 * High-priority events always trigger; tactical events (`check`, `major-capture`, `eval-swing`)
 * are throttled by `minPlyGap`; ordinary moves and minor captures stay local.
 */
export function shouldRequestLlmCommentary(input: ShouldCommentInput): boolean {
  const { event, plyCount, lastCommentedPly, minPlyGap = 4 } = input;

  if (lastCommentedPly !== null && plyCount <= lastCommentedPly) {
    return false;
  }

  if (
    event.kind === 'checkmate' ||
    event.kind === 'draw' ||
    event.kind === 'resign' ||
    event.kind === 'promotion' ||
    event.kind === 'blunder'
  ) {
    return true;
  }

  if (
    event.kind === 'eval-swing' ||
    event.kind === 'major-capture' ||
    event.kind === 'check'
  ) {
    return lastCommentedPly === null || plyCount - lastCommentedPly >= minPlyGap;
  }

  return false;
}

/**
 * Builds the structured turn summary appended to the in-memory multi-turn chess conversation
 * whenever `shouldRequestLlmCommentary` returns true.
 */
export function buildChessTurnPrompt(input: BuildChessPromptInput): string {
  const { event, entries, evalCp, difficultyLabel, result } = input;
  const evalCategory = categorizeEval(evalCp);
  const recentMoves = formatRecentMoves(entries, 8);
  const actor =
    event.mover === 'user'
      ? 'The user'
      : event.mover === 'deepseek'
        ? 'You (playing your move)'
        : 'Game state';

  const lines = [
    `[Chess Turn Update]`,
    `Difficulty: ${difficultyLabel}`,
    `Phase: ${event.phase}`,
    `Recent moves: ${recentMoves}`,
    `Latest action: ${actor}${event.san ? ` played ${event.san}` : ''} (event: ${event.kind})`,
    `Your position evaluation: ${evalCategory}`
  ];

  if (result) {
    const outcomeText =
      result.outcome === 'deepseek-win'
        ? `You won the game (${result.reason}).`
        : result.outcome === 'user-win'
          ? `The user won the game (${result.reason}).`
          : `The game ended in a draw.`;
    lines.push(`Game result: ${outcomeText}`);
  }

  lines.push('Give your short in-character reaction now (1-2 sentences, no chess notation):');
  return lines.join('\n');
}

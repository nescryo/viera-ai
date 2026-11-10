import type { DetectedGameEvent } from './gameEvents';
import type { ChessResult } from './gameResult';

export interface EvalMoodInput {
  /** Evaluation in centipawns from DeepSeek-chan's perspective (positive = DeepSeek-chan ahead). */
  evalCp?: number;
  event?: DetectedGameEvent;
  result?: ChessResult;
}

/**
 * Pure mapping from board evaluation, detected game event, and game outcome
 * to a canonical Live2D emotion ID from `emotionRegistry.ts`.
 */
export function resolveChessMood(input: EvalMoodInput): string {
  const { evalCp, event, result } = input;

  if (result) {
    if (result.reason === 'resign') return 'teasing';
    if (result.outcome === 'deepseek-win') return 'happy';
    if (result.outcome === 'user-win') return 'pouting';
    return 'relaxed';
  }

  if (event) {
    if (event.kind === 'promotion') {
      return event.mover === 'user' ? 'pouting' : 'happy';
    }
    if (event.kind === 'check') {
      return event.mover === 'user' ? 'terrified' : 'teasing';
    }
    if (event.kind === 'blunder') {
      return (event.evalDeltaCp ?? 0) >= 0 ? 'teasing' : 'terrified';
    }
    if (event.kind === 'major-capture' || event.kind === 'capture') {
      return event.mover === 'user' ? 'pouting' : 'teasing';
    }
  }

  if (evalCp !== undefined) {
    if (evalCp >= 200) return 'teasing';
    if (evalCp <= -350) return 'terrified';
    if (evalCp <= -150) return 'pouting';
  }

  return 'relaxed';
}

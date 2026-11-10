import type { ChessResult } from './gameResult';

/** A short line plus the emotion ID (from `emotionRegistry.ts`) the character shows with it. */
export interface ChessReaction {
  text: string;
  emotion: string;
}

export interface ChessMoveInfo {
  san: string;
  /** chess.js move flags, e.g. `c` capture, `e` en passant, `p` promotion. */
  flags: string;
  by: 'user' | 'deepseek';
}

const pick = (lines: string[], variant: number): string => lines[Math.abs(variant) % lines.length];

/**
 * Local reaction (no LLM) for a move. Returns null for ordinary moves so the bubble
 * only changes on notable moments. `variant` picks between lines and keeps this pure.
 */
export function reactToMove(info: ChessMoveInfo, variant: number): ChessReaction | null {
  const isCheck = info.san.includes('+');
  const isCapture = info.flags.includes('c') || info.flags.includes('e');
  const isPromotion = info.flags.includes('p');

  if (info.by === 'user') {
    if (isPromotion) return { text: pick(['A new queen? That is not fair.'], variant), emotion: 'pouting' };
    if (isCheck) return { text: pick(['Eek, check! Let me think.', 'Check?! Wait a second.'], variant), emotion: 'terrified' };
    if (isCapture) return { text: pick(['Hm, you took it. Bold.', 'My piece... noted.'], variant), emotion: 'pouting' };
    return null;
  }

  if (isPromotion) return { text: pick(['A new queen. Hehe.'], variant), emotion: 'happy' };
  if (isCheck) return { text: pick(['Check. Watch your king.', 'Your king looks nervous.'], variant), emotion: 'teasing' };
  if (isCapture) return { text: pick(['Mine now.', 'Thank you for the piece.'], variant), emotion: 'teasing' };
  return null;
}

/** Reaction for the end of the game. */
export function reactToResult(result: ChessResult, variant: number): ChessReaction {
  if (result.reason === 'resign') {
    return { text: pick(['Giving up already? Fine, I win.'], variant), emotion: 'teasing' };
  }
  if (result.outcome === 'user-win') {
    return { text: pick(['You win this time. Rematch?', 'Checkmate... I will get you next time.'], variant), emotion: 'pouting' };
  }
  if (result.outcome === 'deepseek-win') {
    return { text: pick(['Checkmate. Better luck next time.', 'That is checkmate. Hehe.'], variant), emotion: 'happy' };
  }
  return { text: pick(["A draw. We're even."], variant), emotion: 'relaxed' };
}

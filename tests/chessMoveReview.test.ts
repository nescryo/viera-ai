import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import { EMOTION_REGISTRY } from '../src/data/emotionRegistry';
import type { ChessHistoryEntry } from '../src/services/chess/chessSession';
import {
  REVIEW_THRESHOLDS,
  buildReviewChatPrompt,
  buildReviewMomentPrompt,
  buildReviewPlies,
  buildTemplateNarration,
  classifyMove,
  findCheckedKingSquare,
  formatReviewMove,
  parseUciSquares,
  pickKeyMoments,
  positionsToAnalyze,
  reviewUserMoves,
  toUserCp,
  winPercent
} from '../src/services/chess/moveReview';
import type { MoveLabel, PositionAnalysis, ReviewedMove } from '../src/services/chess/moveReview';

/** Builds history entries from SAN moves; `userColor` decides who played each move. */
function entriesFrom(sans: string[], userColor: Color = 'w'): ChessHistoryEntry[] {
  const game = new Chess();
  return sans.map((san) => {
    const mover = game.turn();
    const move = game.move(san);
    return {
      san: move.san,
      by: mover === userColor ? 'user' : 'deepseek',
      from: move.from,
      to: move.to,
      flags: move.flags,
      ...(move.captured ? { captured: move.captured } : {})
    };
  });
}

const SCHOLARS_MATE = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];

function fakeMove(index: number, label: MoveLabel, drop: number): ReviewedMove {
  const [ply] = buildReviewPlies(entriesFrom(['e4']));
  return {
    ply: { ...ply, index },
    moveNumber: Math.floor(index / 2) + 1,
    label,
    userCpBefore: 0,
    userCpAfter: 0,
    winBefore: 50,
    winAfter: 50 - drop,
    drop
  };
}

describe('buildReviewPlies', () => {
  it('rebuilds positions and UCI moves from the history', () => {
    const plies = buildReviewPlies(entriesFrom(['e4', 'e5']));
    expect(plies).toHaveLength(2);
    expect(plies[0].fenBefore).toBe(new Chess().fen());
    expect(plies[0].uci).toBe('e2e4');
    expect(plies[1].fenBefore).toBe(plies[0].fenAfter);
    expect(plies[1].uci).toBe('e7e5');
  });

  it('marks the mating move as terminal', () => {
    const plies = buildReviewPlies(entriesFrom(SCHOLARS_MATE));
    expect(plies[6].terminalAfter).toBe('checkmate');
    expect(plies[5].terminalAfter).toBeUndefined();
  });

  it('records promotion pieces in the UCI move', () => {
    const fenEntries = entriesFrom(['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2', 'bxa8=Q']);
    const plies = buildReviewPlies(fenEntries);
    expect(plies[8].uci).toBe('b7a8q');
  });

  it('stops at the first illegal move', () => {
    const entries = entriesFrom(['e4', 'e5']);
    entries.push({ ...entries[0], san: 'Ke9' });
    expect(buildReviewPlies(entries)).toHaveLength(2);
  });
});

describe('positionsToAnalyze', () => {
  it('lists positions around user moves only, without terminal positions', () => {
    const plies = buildReviewPlies(entriesFrom(SCHOLARS_MATE));
    const fens = positionsToAnalyze(plies);
    // User moves: plies 0, 2, 4, 6. The position after ply 6 is checkmate.
    expect(fens).toEqual([
      plies[0].fenBefore,
      plies[0].fenAfter,
      plies[2].fenBefore,
      plies[2].fenAfter,
      plies[4].fenBefore,
      plies[4].fenAfter,
      plies[6].fenBefore
    ]);
  });

  it('handles a user playing black', () => {
    const plies = buildReviewPlies(entriesFrom(['e4', 'e5', 'Nf3'], 'b'));
    expect(positionsToAnalyze(plies)).toEqual([plies[1].fenBefore, plies[1].fenAfter]);
  });
});

describe('winPercent and toUserCp', () => {
  it('is 50 at equality, symmetric, and saturates for mate scores', () => {
    expect(winPercent(0)).toBeCloseTo(50);
    expect(winPercent(300) + winPercent(-300)).toBeCloseTo(100);
    expect(winPercent(9990)).toBeGreaterThan(97);
    expect(winPercent(-9990)).toBeLessThan(3);
    expect(winPercent(9990)).toBeCloseTo(winPercent(1000));
  });

  it('flips the sign when the opponent is to move', () => {
    const whiteToMove = new Chess().fen();
    expect(toUserCp(whiteToMove, 40, 'w')).toBe(40);
    expect(toUserCp(whiteToMove, 40, 'b')).toBe(-40);
  });
});

describe('classifyMove', () => {
  it('applies the win% drop thresholds', () => {
    expect(classifyMove(60, 60 - REVIEW_THRESHOLDS.inaccuracy + 0.1, 'e2e4')).toBe('good');
    expect(classifyMove(60, 60 - REVIEW_THRESHOLDS.inaccuracy, 'e2e4')).toBe('inaccuracy');
    expect(classifyMove(60, 60 - REVIEW_THRESHOLDS.mistake, 'e2e4')).toBe('mistake');
    expect(classifyMove(60, 60 - REVIEW_THRESHOLDS.blunder, 'e2e4')).toBe('blunder');
  });

  it('labels the engine move as best even when the evaluation drops', () => {
    expect(classifyMove(80, 40, 'e2e4', 'e2e4')).toBe('best');
  });
});

describe('reviewUserMoves', () => {
  it('judges user moves from the user perspective and skips engine moves', () => {
    const plies = buildReviewPlies(entriesFrom(['e4', 'e5', 'Qh5', 'Nc6'], 'w'));
    const analyses = new Map<string, PositionAnalysis>([
      // Before e4, white to move: +30 for white
      [plies[0].fenBefore, { bestMove: 'e2e4', evalCp: 30 }],
      // After e4, black to move: -30 for black
      [plies[0].fenAfter, { bestMove: 'e7e5', evalCp: -30 }],
      [plies[2].fenBefore, { bestMove: 'g1f3', evalCp: 30 }],
      // After Qh5, black to move: black is +500
      [plies[2].fenAfter, { bestMove: 'b8c6', evalCp: 500 }]
    ]);

    const reviewed = reviewUserMoves(plies, analyses, 'w');
    expect(reviewed.map((move) => move.ply.entry.san)).toEqual(['e4', 'Qh5']);
    expect(reviewed[0].label).toBe('best');
    expect(reviewed[0].userCpAfter).toBe(30);
    expect(reviewed[1].userCpAfter).toBe(-500);
    expect(reviewed[1].label).toBe('blunder');
    expect(reviewed[1].bestMoveSan).toBe('Nf3');
    expect(reviewed[1].moveNumber).toBe(2);
  });

  it('works when the user plays black', () => {
    const plies = buildReviewPlies(entriesFrom(['e4', 'f6'], 'b'));
    const analyses = new Map<string, PositionAnalysis>([
      // Black to move, black is -30
      [plies[1].fenBefore, { bestMove: 'e7e5', evalCp: -30 }],
      // White to move, white is +120
      [plies[1].fenAfter, { bestMove: 'd2d4', evalCp: 120 }]
    ]);
    const [move] = reviewUserMoves(plies, analyses, 'b');
    expect(move.userCpBefore).toBe(-30);
    expect(move.userCpAfter).toBe(-120);
    expect(move.bestMoveSan).toBe('e5');
    expect(formatReviewMove(move)).toBe('1... f6');
  });

  it('treats a delivered checkmate as best without analysing the final position', () => {
    const plies = buildReviewPlies(entriesFrom(SCHOLARS_MATE));
    const analyses = new Map<string, PositionAnalysis>([
      [plies[6].fenBefore, { bestMove: 'h5f7', evalCp: 9990 }]
    ]);
    const reviewed = reviewUserMoves(plies, analyses, 'w');
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0].label).toBe('best');
    expect(reviewed[0].bestMoveSan).toBeUndefined();
  });

  it('skips moves with missing or scoreless analyses', () => {
    const plies = buildReviewPlies(entriesFrom(['e4', 'e5']));
    const analyses = new Map<string, PositionAnalysis>([
      [plies[0].fenBefore, { bestMove: 'e2e4', evalCp: undefined }],
      [plies[0].fenAfter, { bestMove: 'e7e5', evalCp: -30 }]
    ]);
    expect(reviewUserMoves(plies, analyses, 'w')).toEqual([]);
  });
});

describe('pickKeyMoments', () => {
  it('keeps the worst mistakes, capped, in game order', () => {
    const moves = [
      fakeMove(0, 'good', 2),
      fakeMove(2, 'inaccuracy', 12),
      fakeMove(4, 'blunder', 40),
      fakeMove(6, 'mistake', 25),
      fakeMove(8, 'blunder', 35)
    ];
    const picked = pickKeyMoments(moves, 2);
    expect(picked.map((move) => move.ply.index)).toEqual([4, 8]);
  });

  it('praises the best move when there are no mistakes', () => {
    const moves = [fakeMove(0, 'good', 3), fakeMove(2, 'best', 1), fakeMove(4, 'best', -8)];
    expect(pickKeyMoments(moves).map((move) => move.ply.index)).toEqual([4]);
  });

  it('returns nothing for an empty review', () => {
    expect(pickKeyMoments([])).toEqual([]);
  });
});

describe('buildReviewMomentPrompt', () => {
  it('includes verified moves and qualitative evaluations, never raw numbers', () => {
    const plies = buildReviewPlies(entriesFrom(['e4', 'e5', 'Qh5']));
    const analyses = new Map<string, PositionAnalysis>([
      [plies[2].fenBefore, { bestMove: 'g1f3', evalCp: 30 }],
      [plies[2].fenAfter, { bestMove: 'b8c6', evalCp: 500 }],
      [plies[0].fenBefore, { bestMove: 'e2e4', evalCp: 30 }],
      [plies[0].fenAfter, { bestMove: 'e7e5', evalCp: -30 }]
    ]);
    const [, blunder] = reviewUserMoves(plies, analyses, 'w');
    const prompt = buildReviewMomentPrompt({ move: blunder, position: 1, total: 2 });

    expect(prompt).toContain('[Chess Move Review]');
    expect(prompt).toContain('Moment 1 of 2');
    expect(prompt).toContain('Move: 2. Qh5');
    expect(prompt).toContain('Verdict: blunder');
    expect(prompt).toContain('Stronger move the user had: Nf3');
    expect(prompt).toContain('losing');
    expect(prompt).toContain('paused for this review');
    expect(prompt).not.toMatch(/\b500\b|\b30\b|cp/);
  });

  it('omits the stronger move for best moves and reports a finished game', () => {
    const move = { ...fakeMove(0, 'best', 0), bestMoveSan: 'e4' };
    const prompt = buildReviewMomentPrompt({
      move,
      position: 1,
      total: 1,
      result: { outcome: 'user-win', reason: 'checkmate' }
    });
    expect(prompt).not.toContain('Stronger move');
    expect(prompt).toContain('finished (user-win, checkmate)');
  });
});

describe('buildTemplateNarration', () => {
  it('produces a line per label with registered emotions', () => {
    const ids = new Set(EMOTION_REGISTRY.map((emotion) => emotion.id));
    const labels: MoveLabel[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];
    for (const label of labels) {
      const narration = buildTemplateNarration({ ...fakeMove(0, label, 0), bestMoveSan: 'd4' });
      expect(narration.text).toContain('Move 1, e4');
      expect(ids.has(narration.emotion)).toBe(true);
    }
  });

  it('mentions the stronger move only when known', () => {
    const withBest = buildTemplateNarration({ ...fakeMove(0, 'blunder', 40), bestMoveSan: 'd4' });
    const withoutBest = buildTemplateNarration(fakeMove(0, 'blunder', 40));
    expect(withBest.text).toContain('d4');
    expect(withoutBest.text).toBe('Move 1, e4 was a blunder!');
  });
});

describe('buildReviewChatPrompt & board helpers', () => {
  it('anchors follow-up questions to the reviewed moment without raw centipawn numbers', () => {
    const plies = buildReviewPlies(entriesFrom(['e4', 'e5', 'Qh5']));
    const analyses = new Map<string, PositionAnalysis>([
      [plies[0].fenBefore, { bestMove: 'e2e4', evalCp: 30 }],
      [plies[0].fenAfter, { bestMove: 'e7e5', evalCp: -30 }],
      [plies[2].fenBefore, { bestMove: 'g1f3', evalCp: 30 }],
      [plies[2].fenAfter, { bestMove: 'b8c6', evalCp: 500 }]
    ]);
    const [, blunder] = reviewUserMoves(plies, analyses, 'w');
    const prompt = buildReviewChatPrompt({
      move: blunder,
      position: 1,
      total: 1,
      text: 'Why was Nf3 better than Qh5?'
    });

    expect(prompt).toContain('[Chess Review Question]');
    expect(prompt).toContain('Reviewed move: 2. Qh5');
    expect(prompt).toContain(`Position before the move (FEN): ${blunder.ply.fenBefore}`);
    expect(prompt).toContain(`Position after the move (FEN): ${blunder.ply.fenAfter}`);
    expect(prompt).toContain('Stronger move the user had: Nf3');
    expect(prompt).toContain('Why was Nf3 better than Qh5?');
    expect(prompt).not.toMatch(/\b500\b|\b30\b|cp/);
  });

  it('parses valid UCI move squares and rejects malformed strings', () => {
    expect(parseUciSquares('g1f3')).toEqual({ from: 'g1', to: 'f3' });
    expect(parseUciSquares('b7a8q')).toEqual({ from: 'b7', to: 'a8' });
    expect(parseUciSquares('invalid')).toBeNull();
    expect(parseUciSquares(null)).toBeNull();
  });

  it('finds the checked king square in a FEN when in check', () => {
    const plies = buildReviewPlies(entriesFrom(SCHOLARS_MATE));
    expect(findCheckedKingSquare(plies[6].fenAfter)).toBe('e8');
    expect(findCheckedKingSquare(new Chess().fen())).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  countMajorMinorPieces,
  detectGameEvent,
  detectGamePhase
} from '../src/services/chess/gameEvents';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ENDGAME_FEN = '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 40';

describe('detectGamePhase', () => {
  it('classifies the first 12 plies as opening when pieces remain on board', () => {
    expect(countMajorMinorPieces(START_FEN)).toBe(14);
    expect(detectGamePhase(START_FEN, 4)).toBe('opening');
    expect(detectGamePhase(START_FEN, 12)).toBe('opening');
  });

  it('classifies positions after ply 12 with many pieces as middlegame', () => {
    expect(detectGamePhase(START_FEN, 16)).toBe('middlegame');
  });

  it('classifies positions with 4 or fewer non-pawn/king pieces as endgame', () => {
    expect(countMajorMinorPieces(ENDGAME_FEN)).toBe(1);
    expect(detectGamePhase(ENDGAME_FEN, 8)).toBe('endgame');
    expect(detectGamePhase(ENDGAME_FEN, 50)).toBe('endgame');
  });
});

describe('detectGameEvent', () => {
  it('prioritizes game-over outcomes', () => {
    const ev = detectGameEvent({
      fen: START_FEN,
      plyCount: 8,
      result: { outcome: 'deepseek-win', reason: 'checkmate' }
    });
    expect(ev.kind).toBe('checkmate');
  });

  it('detects promotions', () => {
    const ev = detectGameEvent({
      entry: { san: 'a8=Q', by: 'user', from: 'a7', to: 'a8', flags: 'p' },
      fen: ENDGAME_FEN,
      plyCount: 60
    });
    expect(ev.kind).toBe('promotion');
    expect(ev.phase).toBe('endgame');
  });

  it('detects blunders (>= 300 cp swing) and eval swings (>= 180 cp swing)', () => {
    const blunder = detectGameEvent({
      entry: { san: 'Qh4', by: 'user', from: 'd1', to: 'h4', flags: 'n' },
      fen: START_FEN,
      plyCount: 14,
      prevEvalCp: 0,
      currentEvalCp: 350
    });
    expect(blunder.kind).toBe('blunder');
    expect(blunder.evalDeltaCp).toBe(350);

    const swing = detectGameEvent({
      entry: { san: 'Nxf7', by: 'user', from: 'g5', to: 'f7', flags: 'c', captured: 'p' },
      fen: START_FEN,
      plyCount: 14,
      prevEvalCp: 20,
      currentEvalCp: -190
    });
    expect(swing.kind).toBe('eval-swing');
    expect(swing.evalDeltaCp).toBe(-210);
  });

  it('distinguishes major captures (queen/rook) from ordinary captures and checks', () => {
    const majorCapture = detectGameEvent({
      entry: { san: 'Bxd8', by: 'user', from: 'g5', to: 'd8', flags: 'c', captured: 'q' },
      fen: START_FEN,
      plyCount: 16
    });
    expect(majorCapture.kind).toBe('major-capture');

    const check = detectGameEvent({
      entry: { san: 'Bb5+', by: 'user', from: 'f1', to: 'b5', flags: 'n' },
      fen: START_FEN,
      plyCount: 6
    });
    expect(check.kind).toBe('check');

    const minorCapture = detectGameEvent({
      entry: { san: 'exd5', by: 'user', from: 'e4', to: 'd5', flags: 'c', captured: 'p' },
      fen: START_FEN,
      plyCount: 6
    });
    expect(minorCapture.kind).toBe('capture');
  });
});

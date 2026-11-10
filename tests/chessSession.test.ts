import { describe, expect, it } from 'vitest';
import { ChessSession } from '../src/services/chess/chessSession';
import { createRandomEngine } from '../src/services/chess/engine';

describe('ChessSession', () => {
  it('starts with the user to move and no result', () => {
    const snap = new ChessSession('w').snapshot();
    expect(snap.turn).toBe('user');
    expect(snap.entries).toEqual([]);
    expect(snap.result).toBeUndefined();
  });

  it('accepts a legal user move and rejects an illegal one', () => {
    const s = new ChessSession('w');
    expect(s.userMove('e2', 'e5')).toBeNull();
    const entry = s.userMove('e2', 'e4');
    expect(entry?.san).toBe('e4');
    expect(s.snapshot().turn).toBe('deepseek');
  });

  it('rejects user moves while it is the engine turn', () => {
    const s = new ChessSession('w');
    s.userMove('e2', 'e4');
    expect(s.userMove('d2', 'd4')).toBeNull();
  });

  it('plays engine moves in UCI form and rejects malformed input', () => {
    const s = new ChessSession('w');
    s.userMove('e2', 'e4');
    expect(s.engineMove('zz')).toBeNull();
    expect(s.engineMove('e7e5')?.by).toBe('deepseek');
    expect(s.snapshot().turn).toBe('user');
  });

  it('returns legal targets only for the user own pieces on the user turn', () => {
    const s = new ChessSession('w');
    expect(s.legalTargets('e2').sort()).toEqual(['e3', 'e4']);
    expect(s.legalTargets('e7')).toEqual([]);
    s.userMove('e2', 'e4');
    expect(s.legalTargets('d2')).toEqual([]);
  });

  it('undo removes the user move and the engine reply', () => {
    const s = new ChessSession('w');
    s.userMove('e2', 'e4');
    s.engineMove('e7e5');
    expect(s.undo()).toBe(true);
    expect(s.snapshot().entries).toEqual([]);
    expect(s.snapshot().turn).toBe('user');
  });

  it('undo refuses when there is no user move or it is the engine turn', () => {
    const s = new ChessSession('w');
    expect(s.undo()).toBe(false);
    s.userMove('e2', 'e4');
    expect(s.undo()).toBe(false);
  });

  it('does not undo the engine opening when the user plays black', () => {
    const s = new ChessSession('b');
    s.engineMove('e2e4');
    expect(s.undo()).toBe(false);
    expect(s.snapshot().entries).toHaveLength(1);
  });

  it('detects fool\'s mate as a deepseek win', () => {
    const s = new ChessSession('w');
    s.userMove('f2', 'f3');
    s.engineMove('e7e5');
    s.userMove('g2', 'g4');
    s.engineMove('d8h4');
    expect(s.snapshot().result).toEqual({ outcome: 'deepseek-win', reason: 'checkmate' });
    expect(s.userMove('a2', 'a3')).toBeNull();
  });

  it('reports the checked king square', () => {
    const s = new ChessSession('w');
    s.userMove('e2', 'e4');
    s.engineMove('f7f5');
    s.userMove('d1', 'h5');
    expect(s.snapshot().checkSquare).toBe('e8');
  });

  it('resign ends the game as a loss', () => {
    const s = new ChessSession('w');
    s.resign();
    expect(s.snapshot().result).toEqual({ outcome: 'deepseek-win', reason: 'resign' });
  });

  it('reset switches color and clears state', () => {
    const s = new ChessSession('w');
    s.userMove('e2', 'e4');
    s.reset('b');
    const snap = s.snapshot();
    expect(snap.userColor).toBe('b');
    expect(snap.entries).toEqual([]);
    expect(snap.turn).toBe('deepseek');
  });

  it('promotes to a queen by default and supports choosing promotion pieces', () => {
    const s = new ChessSession('w', '8/P6k/8/8/8/8/8/K7 w - - 0 1');
    expect(s.isPromotionMove('a7', 'a8')).toBe(true);
    expect(s.isPromotionMove('a1', 'a2')).toBe(false);
    expect(s.userMove('a7', 'a8')?.san).toMatch(/^a8=Q/);

    const underPromote = new ChessSession('w', '8/P6k/8/8/8/8/8/K7 w - - 0 1');
    expect(underPromote.userMove('a7', 'a8', 'n')?.san).toMatch(/^a8=N/);
  });
});

describe('createRandomEngine', () => {
  it('returns a legal move in UCI form', async () => {
    const engine = createRandomEngine({ delayMs: 0, random: () => 0 });
    const uci = await engine.getBestMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const s = new ChessSession('w');
    expect(s.userMove(uci.slice(0, 2) as never, uci.slice(2, 4) as never)).not.toBeNull();
    engine.dispose();
  });

  it('rejects when there are no legal moves', async () => {
    const engine = createRandomEngine({ delayMs: 0 });
    await expect(engine.getBestMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).rejects.toThrow();
    engine.dispose();
  });
});

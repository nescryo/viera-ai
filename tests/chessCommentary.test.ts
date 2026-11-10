import { describe, expect, it } from 'vitest';
import {
  buildChessTurnPrompt,
  categorizeEval,
  formatRecentMoves,
  shouldRequestLlmCommentary
} from '../src/services/chess/commentary';
import { parseUciScoreToCp } from '../src/services/chess/engine';

describe('categorizeEval & parseUciScoreToCp', () => {
  it('parses UCI cp and mate scores into centipawns', () => {
    expect(parseUciScoreToCp('info depth 4 score cp 145 pv e2e4')).toBe(145);
    expect(parseUciScoreToCp('info depth 4 score cp -280 pv e7e5')).toBe(-280);
    expect(parseUciScoreToCp('info depth 6 score mate 2 pv d8h4')).toBeGreaterThan(9000);
    expect(parseUciScoreToCp('info depth 6 score mate -1 pv f7f6')).toBeLessThan(-9000);
    expect(parseUciScoreToCp('bestmove e2e4')).toBeNull();
  });

  it('categorizes centipawn evaluations qualitatively without exposing raw numbers', () => {
    expect(categorizeEval(300)).toBe('clearly-winning');
    expect(categorizeEval(120)).toBe('slightly-ahead');
    expect(categorizeEval(0)).toBe('even');
    expect(categorizeEval(-120)).toBe('under-pressure');
    expect(categorizeEval(-350)).toBe('losing');
  });
});

describe('shouldRequestLlmCommentary', () => {
  it('stays silent on ordinary moves and minor captures', () => {
    expect(
      shouldRequestLlmCommentary({
        event: { kind: 'ordinary', phase: 'opening', mover: 'deepseek', san: 'e5' },
        plyCount: 2,
        lastCommentedPly: null
      })
    ).toBe(false);

    expect(
      shouldRequestLlmCommentary({
        event: { kind: 'capture', phase: 'opening', mover: 'user', san: 'exd5' },
        plyCount: 6,
        lastCommentedPly: null
      })
    ).toBe(false);
  });

  it('always triggers on checkmate, resign, promotion, and blunder', () => {
    expect(
      shouldRequestLlmCommentary({
        event: { kind: 'blunder', phase: 'middlegame', mover: 'user', san: 'Qh4', evalDeltaCp: 400 },
        plyCount: 10,
        lastCommentedPly: 8
      })
    ).toBe(true);

    expect(
      shouldRequestLlmCommentary({
        event: { kind: 'checkmate', phase: 'endgame', mover: 'deepseek', san: 'Qh2#' },
        plyCount: 11,
        lastCommentedPly: 10
      })
    ).toBe(true);
  });

  it('throttles checks, major captures, and eval swings by minPlyGap', () => {
    const checkEvent = { kind: 'check' as const, phase: 'middlegame' as const, mover: 'user' as const, san: 'Bb5+' };
    expect(
      shouldRequestLlmCommentary({
        event: checkEvent,
        plyCount: 6,
        lastCommentedPly: null,
        minPlyGap: 4
      })
    ).toBe(true);

    expect(
      shouldRequestLlmCommentary({
        event: checkEvent,
        plyCount: 8,
        lastCommentedPly: 6,
        minPlyGap: 4
      })
    ).toBe(false);

    expect(
      shouldRequestLlmCommentary({
        event: checkEvent,
        plyCount: 10,
        lastCommentedPly: 6,
        minPlyGap: 4
      })
    ).toBe(true);
  });
});

describe('buildChessTurnPrompt & formatRecentMoves', () => {
  it('formats recent moves with move numbers and builds a structured turn prompt', () => {
    const entries = [
      { san: 'e4', by: 'user' as const, from: 'e2' as const, to: 'e4' as const, flags: 'b' },
      { san: 'e5', by: 'deepseek' as const, from: 'e7' as const, to: 'e5' as const, flags: 'b' },
      { san: 'Qh5', by: 'user' as const, from: 'd1' as const, to: 'h5' as const, flags: 'n' },
      { san: 'Nc6', by: 'deepseek' as const, from: 'b8' as const, to: 'c6' as const, flags: 'n' },
      { san: 'Bc4', by: 'user' as const, from: 'f1' as const, to: 'c4' as const, flags: 'n' },
      { san: 'Nf6', by: 'deepseek' as const, from: 'g8' as const, to: 'f6' as const, flags: 'n' },
      { san: 'Qxf7#', by: 'user' as const, from: 'h5' as const, to: 'f7' as const, flags: 'c' }
    ];

    expect(formatRecentMoves(entries, 4)).toBe('2... Nc6 3. Bc4 Nf6 4. Qxf7#');

    const prompt = buildChessTurnPrompt({
      event: { kind: 'checkmate', phase: 'opening', mover: 'user', san: 'Qxf7#' },
      entries,
      evalCp: -10000,
      difficultyLabel: 'Casual (~900)',
      result: { outcome: 'user-win', reason: 'checkmate' }
    });

    expect(prompt).toContain('Difficulty: Casual (~900)');
    expect(prompt).toContain('Phase: opening');
    expect(prompt).toContain('Your position evaluation: losing');
    expect(prompt).toContain('The user won the game (checkmate).');
  });
});

import { describe, expect, it } from 'vitest';
import { EMOTION_REGISTRY } from '../src/data/emotionRegistry';
import { resolveChessMood } from '../src/services/chess/evalMood';

describe('resolveChessMood', () => {
  const validEmotionIds = new Set(EMOTION_REGISTRY.map((e) => e.id));

  it('maps game results to canonical emotions', () => {
    expect(
      resolveChessMood({ result: { outcome: 'deepseek-win', reason: 'checkmate' } })
    ).toBe('happy');
    expect(
      resolveChessMood({ result: { outcome: 'deepseek-win', reason: 'resign' } })
    ).toBe('teasing');
    expect(
      resolveChessMood({ result: { outcome: 'user-win', reason: 'checkmate' } })
    ).toBe('pouting');
    expect(
      resolveChessMood({ result: { outcome: 'draw', reason: 'draw' } })
    ).toBe('relaxed');
  });

  it('maps checks, blunders, and promotions to appropriate emotions', () => {
    expect(
      resolveChessMood({
        event: { kind: 'check', phase: 'middlegame', mover: 'user', san: 'Qh5+' }
      })
    ).toBe('terrified');
    expect(
      resolveChessMood({
        event: { kind: 'check', phase: 'middlegame', mover: 'deepseek', san: 'Qh4+' }
      })
    ).toBe('teasing');
    expect(
      resolveChessMood({
        event: { kind: 'blunder', phase: 'middlegame', mover: 'deepseek', evalDeltaCp: -400 }
      })
    ).toBe('terrified');
    expect(
      resolveChessMood({
        event: { kind: 'blunder', phase: 'middlegame', mover: 'user', evalDeltaCp: 400 }
      })
    ).toBe('teasing');
  });

  it('maps centipawn evaluations on ordinary moves and always returns valid registry IDs', () => {
    const samples = [
      resolveChessMood({ evalCp: 320 }),
      resolveChessMood({ evalCp: 0 }),
      resolveChessMood({ evalCp: -200 }),
      resolveChessMood({ evalCp: -500 })
    ];
    expect(samples).toEqual(['teasing', 'relaxed', 'pouting', 'terrified']);
    for (const id of samples) {
      expect(validEmotionIds.has(id)).toBe(true);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { isDarkSquare, orderedSquares, squareLabel, stepSquare } from '../src/services/chess/boardView';
import { reactToMove, reactToResult } from '../src/services/chess/reactions';
import { EMOTION_REGISTRY } from '../src/data/emotionRegistry';

describe('boardView', () => {
  it('orders squares from a8 for white and from h1 for black', () => {
    const white = orderedSquares('w');
    const black = orderedSquares('b');
    expect(white).toHaveLength(64);
    expect(white[0]).toBe('a8');
    expect(white[63]).toBe('h1');
    expect(black[0]).toBe('h1');
    expect(black[63]).toBe('a8');
  });

  it('colors a1 dark and h1 light', () => {
    expect(isDarkSquare('a1')).toBe(true);
    expect(isDarkSquare('h1')).toBe(false);
    expect(isDarkSquare('d4')).toBe(true);
  });

  it('labels squares for screen readers', () => {
    expect(squareLabel('e4', { type: 'p', color: 'w' })).toBe('e4, white pawn');
    expect(squareLabel('e5', null)).toBe('e5, empty');
  });

  it('steps by screen direction and stops at the edge', () => {
    expect(stepSquare('e4', 'up', 'w')).toBe('e5');
    expect(stepSquare('e4', 'up', 'b')).toBe('e3');
    expect(stepSquare('e4', 'right', 'w')).toBe('f4');
    expect(stepSquare('e4', 'right', 'b')).toBe('d4');
    expect(stepSquare('a1', 'left', 'w')).toBe('a1');
    expect(stepSquare('h8', 'up', 'w')).toBe('h8');
  });
});

describe('reactions', () => {
  it('stays silent on ordinary moves', () => {
    expect(reactToMove({ san: 'Nf3', flags: 'n', by: 'user' }, 0)).toBeNull();
    expect(reactToMove({ san: 'e5', flags: 'b', by: 'deepseek' }, 0)).toBeNull();
  });

  it('reacts to checks and captures', () => {
    expect(reactToMove({ san: 'Qh5+', flags: 'n', by: 'user' }, 0)).not.toBeNull();
    expect(reactToMove({ san: 'Nxe5', flags: 'c', by: 'deepseek' }, 1)).not.toBeNull();
  });

  it('only uses emotion IDs that exist in the registry', () => {
    const ids = new Set(EMOTION_REGISTRY.map((e) => e.id));
    const samples = [
      reactToMove({ san: 'Qh5+', flags: 'n', by: 'user' }, 0),
      reactToMove({ san: 'Qh5+', flags: 'n', by: 'deepseek' }, 0),
      reactToMove({ san: 'Bxf7', flags: 'c', by: 'user' }, 0),
      reactToMove({ san: 'Bxf7', flags: 'c', by: 'deepseek' }, 0),
      reactToMove({ san: 'a8=Q', flags: 'p', by: 'user' }, 0),
      reactToMove({ san: 'a1=Q', flags: 'p', by: 'deepseek' }, 0),
      reactToResult({ outcome: 'user-win', reason: 'checkmate' }, 0),
      reactToResult({ outcome: 'deepseek-win', reason: 'checkmate' }, 0),
      reactToResult({ outcome: 'draw', reason: 'draw' }, 0),
      reactToResult({ outcome: 'deepseek-win', reason: 'resign' }, 0)
    ];
    for (const r of samples) expect(ids.has(r!.emotion)).toBe(true);
  });
});

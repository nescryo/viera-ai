import { describe, expect, it } from 'vitest';
import {
  isDarkSquare,
  moveAnimationSteps,
  orderedSquares,
  squareDelta,
  squareLabel,
  stepSquare
} from '../src/services/chess/boardView';

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

  it('computes initial visual offset from destination back to origin by orientation', () => {
    expect(squareDelta('e2', 'e4', 'w')).toEqual({ dx: 0, dy: 2 });
    expect(squareDelta('e2', 'e4', 'b')).toEqual({ dx: 0, dy: -2 });
    expect(squareDelta('b1', 'c3', 'w')).toEqual({ dx: -1, dy: 2 });
    expect(squareDelta('b1', 'c3', 'b')).toEqual({ dx: 1, dy: -2 });
  });

  it('includes the rook step only for king castling moves', () => {
    expect(moveAnimationSteps({ from: 'e1', to: 'g1' }, 'k', 'w')).toEqual([
      { from: 'e1', to: 'g1', dx: -2, dy: 0 },
      { from: 'h1', to: 'f1', dx: 2, dy: 0 }
    ]);
    expect(moveAnimationSteps({ from: 'e1', to: 'c1' }, 'k', 'b')).toEqual([
      { from: 'e1', to: 'c1', dx: -2, dy: 0 },
      { from: 'a1', to: 'd1', dx: 3, dy: 0 }
    ]);
    expect(moveAnimationSteps({ from: 'e8', to: 'g8' }, 'k', 'w')).toEqual([
      { from: 'e8', to: 'g8', dx: -2, dy: 0 },
      { from: 'h8', to: 'f8', dx: 2, dy: 0 }
    ]);
    expect(moveAnimationSteps({ from: 'e8', to: 'c8' }, 'k', 'w')).toEqual([
      { from: 'e8', to: 'c8', dx: 2, dy: 0 },
      { from: 'a8', to: 'd8', dx: -3, dy: 0 }
    ]);

    // A non-king moving two files horizontally along the first rank must not trigger a rook slide
    expect(moveAnimationSteps({ from: 'e1', to: 'g1' }, 'q', 'w')).toEqual([
      { from: 'e1', to: 'g1', dx: -2, dy: 0 }
    ]);
    expect(moveAnimationSteps({ from: 'e1', to: 'c1' }, 'r', 'w')).toEqual([
      { from: 'e1', to: 'c1', dx: 2, dy: 0 }
    ]);
  });
});

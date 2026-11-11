import { describe, expect, it } from 'vitest';
import { isDarkSquare, orderedSquares, squareLabel, stepSquare } from '../src/services/chess/boardView';

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

import React from 'react';

export interface MinigameIconProps {
  className?: string;
  size?: number;
  'aria-hidden'?: boolean | 'true' | 'false';
}

/** Dark squares of a 4x4 board as [column, row] pairs, where (column + row) is odd. */
const DARK_SQUARES: [number, number][] = [];
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 4; col += 1) {
    if ((col + row) % 2 === 1) DARK_SQUARES.push([col, row]);
  }
}

const CELL = 4.5;
const ORIGIN = 3;

/** Mini chessboard icon (4x4 checker pattern), drawn in the same style as lucide icons. */
export const ChessBoardIcon: React.FC<MinigameIconProps> = ({ className, size = 24, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...rest}
  >
    <rect x={ORIGIN} y={ORIGIN} width={18} height={18} rx={2} />
    {DARK_SQUARES.map(([col, row]) => (
      <rect
        key={`${col}-${row}`}
        x={ORIGIN + col * CELL}
        y={ORIGIN + row * CELL}
        width={CELL}
        height={CELL}
        fill="currentColor"
        stroke="none"
      />
    ))}
  </svg>
);

import React, { useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import { isDarkSquare, orderedSquares, squareLabel, stepSquare } from '../../services/chess/boardView';
import type { Direction } from '../../services/chess/boardView';
import { ChessPiece } from './ChessPiece';
import './ChessPanel.css';

interface ChessBoardProps {
  fen: string;
  /** Color shown at the bottom of the board. */
  orientation: Color;
  selected: Square | null;
  /** Squares the selected piece can move to. */
  targets: readonly Square[];
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  onSquareActivate: (square: Square) => void;
}

const ARROW_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

/** 8x8 board drawn with CSS grid. Every square is a button; arrow keys move focus. */
export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  orientation,
  selected,
  targets,
  lastMove,
  checkSquare,
  onSquareActivate
}) => {
  const position = useMemo(() => new Chess(fen), [fen]);
  const squares = useMemo(() => orderedSquares(orientation), [orientation]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [focusSquare, setFocusSquare] = useState<Square>(orientation === 'w' ? 'e2' : 'e7');

  const bottomRank = orientation === 'w' ? '1' : '8';
  const leftFile = orientation === 'w' ? 'a' : 'h';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, square: Square) => {
    const direction = ARROW_DIRECTIONS[event.key];
    if (!direction) return;
    event.preventDefault();
    const next = stepSquare(square, direction, orientation);
    setFocusSquare(next);
    boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${next}"]`)?.focus();
  };

  return (
    <div ref={boardRef} className="chess-board" role="group" aria-label="Chess board">
      {squares.map((square) => {
        const piece = position.get(square);
        const isTarget = targets.includes(square);
        const classes = [
          'chess-square',
          isDarkSquare(square) ? 'chess-square--dark' : 'chess-square--light',
          square === selected ? 'is-selected' : '',
          square === lastMove?.from || square === lastMove?.to ? 'is-last-move' : '',
          square === checkSquare ? 'is-check' : '',
          isTarget ? (piece ? 'is-capture-target' : 'is-target') : ''
        ].filter(Boolean).join(' ');

        return (
          <button
            key={square}
            type="button"
            className={classes}
            data-square={square}
            tabIndex={square === focusSquare ? 0 : -1}
            aria-label={squareLabel(square, piece)}
            aria-pressed={square === selected}
            onFocus={() => setFocusSquare(square)}
            onKeyDown={(event) => handleKeyDown(event, square)}
            onClick={() => onSquareActivate(square)}
          >
            {piece && <ChessPiece color={piece.color} type={piece.type} />}
            {square[1] === bottomRank && <span className="chess-coord chess-coord--file" aria-hidden="true">{square[0]}</span>}
            {square[0] === leftFile && <span className="chess-coord chess-coord--rank" aria-hidden="true">{square[1]}</span>}
          </button>
        );
      })}
    </div>
  );
};

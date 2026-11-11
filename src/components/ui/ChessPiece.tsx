import React from 'react';
import type { Color, PieceSymbol } from 'chess.js';

interface ChessPieceProps {
  color: Color;
  type: PieceSymbol;
}

/** Renders a 2D Staunton chess piece as an inline SVG styled by CSS variables in ChessPanel.css. */
export const ChessPiece: React.FC<ChessPieceProps> = ({ color, type }) => {
  return (
    <svg
      className={`chess-piece chess-piece--${color}`}
      viewBox="0 0 45 45"
      aria-hidden="true"
      focusable="false"
    >
      {type === 'p' && (
        <g>
          <path
            className="chess-piece-body"
            d="M 22.5,9 C 19.5,9 17,11.5 17,14.5 C 17,16.8 18.4,18.7 20.4,19.5 C 17.5,21 16,24 16,27.5 C 16,29.5 17,31 17,31 L 13.5,34.5 C 12.5,35.5 12,36.5 12,38 L 33,38 C 33,36.5 32.5,35.5 31.5,34.5 L 28,31 C 28,31 29,29.5 29,27.5 C 29,24 27.5,21 24.6,19.5 C 26.6,18.7 28,16.8 28,14.5 C 28,11.5 25.5,9 22.5,9 z"
          />
          <path className="chess-piece-detail" d="M 17.5,31 L 27.5,31" />
          <path className="chess-piece-detail" d="M 14,35.5 L 31,35.5" />
        </g>
      )}

      {type === 'r' && (
        <g>
          <path
            className="chess-piece-body"
            d="M 11,38 L 34,38 L 33,34.5 L 30,31.5 L 30,19.5 L 32.5,17 L 32.5,11 L 28.5,11 L 28.5,13.5 L 25,13.5 L 25,11 L 20,11 L 20,13.5 L 16.5,13.5 L 16.5,11 L 12.5,11 L 12.5,17 L 15,19.5 L 15,31.5 L 12,34.5 L 11,38 z"
          />
          <path className="chess-piece-detail" d="M 15,19.5 L 30,19.5" />
          <path className="chess-piece-detail" d="M 15,31.5 L 30,31.5" />
          <path className="chess-piece-detail" d="M 12.5,35 L 32.5,35" />
        </g>
      )}

      {type === 'n' && (
        <g>
          <path
            className="chess-piece-body"
            d="M 22,10 C 31.5,11 36.5,18 36,38 L 12,38 C 12,30 20,31.5 19,21 C 15.5,23 13.5,24 10.5,23.5 C 9.2,22.5 9.8,20.2 10.5,19 C 12,16.5 14.5,15.5 16,13.5 L 15.5,9.5 L 19,12 C 20,11.2 21,10.5 22,10 z"
          />
          <circle className="chess-piece-accent" cx="16.5" cy="15.5" r="1.3" />
          <circle className="chess-piece-accent" cx="12.2" cy="20.5" r="0.9" />
          <path className="chess-piece-detail" d="M 25.5,14 C 29.5,17 31.5,23 31,34" />
          <path className="chess-piece-detail" d="M 13,35 L 35,35" />
        </g>
      )}

      {type === 'b' && (
        <g>
          <circle className="chess-piece-body" cx="22.5" cy="8.5" r="2.3" />
          <path
            className="chess-piece-body"
            d="M 17.5,31 C 21,32.5 24,32.5 27.5,31 C 30.5,26.5 30.5,19.5 22.5,11.5 C 14.5,19.5 14.5,26.5 17.5,31 z"
          />
          <path
            className="chess-piece-body"
            d="M 11.5,38 C 15,35 17.5,34.5 22.5,34.5 C 27.5,34.5 30,35 33.5,38 L 32,33.5 C 28.5,32 26,31 22.5,31 C 19,31 16.5,32 13,33.5 L 11.5,38 z"
          />
          <path className="chess-piece-detail" d="M 22.5,16.5 L 22.5,23.5" />
          <path className="chess-piece-detail" d="M 19.5,20 L 25.5,20" />
          <path className="chess-piece-detail" d="M 17.5,29.5 C 21,31 24,31 27.5,29.5" />
        </g>
      )}

      {type === 'q' && (
        <g>
          <path
            className="chess-piece-body"
            d="M 9,15 L 13.5,30.5 L 12,34.5 L 11.5,38 L 33.5,38 L 33,34.5 L 31.5,30.5 L 36,15 L 28.5,23 L 22.5,12.5 L 16.5,23 L 9,15 z"
          />
          <circle className="chess-piece-body" cx="8.5" cy="13.5" r="2" />
          <circle className="chess-piece-body" cx="15.5" cy="11" r="2" />
          <circle className="chess-piece-body" cx="22.5" cy="10" r="2.1" />
          <circle className="chess-piece-body" cx="29.5" cy="11" r="2" />
          <circle className="chess-piece-body" cx="36.5" cy="13.5" r="2" />
          <path className="chess-piece-detail" d="M 14,30 C 19,28.5 26,28.5 31,30" />
          <path className="chess-piece-detail" d="M 12.5,34.5 C 18.5,33 26.5,33 32.5,34.5" />
        </g>
      )}

      {type === 'k' && (
        <g>
          <path className="chess-piece-cross" d="M 22.5,5.5 L 22.5,12" />
          <path className="chess-piece-cross" d="M 19.5,8.2 L 25.5,8.2" />
          <path
            className="chess-piece-body"
            d="M 22.5,25 C 22.5,25 27,17.5 25.5,14 C 25.5,14 24.5,11.5 22.5,11.5 C 20.5,11.5 19.5,14 19.5,14 C 18,17.5 22.5,25 22.5,25"
          />
          <path
            className="chess-piece-body"
            d="M 11.5,37.5 C 17,40 28,40 33.5,37.5 L 33.5,30.5 C 33.5,30.5 41.5,26 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,26 11.5,30.5 11.5,30.5 L 11.5,37.5 z"
          />
          <path className="chess-piece-detail" d="M 12,30.5 C 17.5,28 27.5,28 33,30.5" />
          <path className="chess-piece-detail" d="M 12,34 C 17.5,31.5 27.5,31.5 33,34" />
        </g>
      )}
    </svg>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Square } from 'chess.js';
import { ArrowLeft, ChevronDown, Flag, ListOrdered, RotateCcw, Undo2 } from 'lucide-react';
import { useChessGame } from '../../hooks/useChessGame';
import { DIFFICULTY_PRESETS } from '../../services/chess/difficulty';
import { ChessBoard } from './ChessBoard';
import './ChessPanel.css';

interface ChessPanelProps {
  /** Display name of the opponent, taken from the active character. */
  opponentName: string;
  /** Called when DeepSeek-chan reacts, so the Live2D model can show the emotion. */
  onEmotion: (emotion: string) => void;
  onClose: () => void;
}

const RESULT_TEXT = {
  'user-win': 'You win',
  'deepseek-win': 'You lose',
  draw: 'Draw'
} as const;

/** Pairs plain move entries into numbered rows: [1, 'e4', 'e5']. */
function toMoveRows(sans: string[]): { number: number; white: string; black: string }[] {
  const rows: { number: number; white: string; black: string }[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push({ number: i / 2 + 1, white: sans[i], black: sans[i + 1] ?? '' });
  }
  return rows;
}

/** Full-screen chess layout: board on the left, the Live2D character shows on the right. */
export const ChessPanel: React.FC<ChessPanelProps> = ({ opponentName, onEmotion, onClose }) => {
  const game = useChessGame();
  const [selected, setSelected] = useState<Square | null>(null);
  const [showMoves, setShowMoves] = useState(false);
  const [showDifficulty, setShowDifficulty] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | 'resign' | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const difficultyRef = useRef<HTMLDivElement>(null);

  const targets = useMemo(() => (selected ? game.legalMovesFrom(selected) : []), [selected, game]);
  const rows = useMemo(() => toMoveRows(game.entries.map((entry) => entry.san)), [game.entries]);

  useEffect(() => {
    if (game.reaction) onEmotion(game.reaction.emotion);
  }, [game.reaction, onEmotion]);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!showDifficulty) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!difficultyRef.current?.contains(event.target as Node)) {
        setShowDifficulty(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowDifficulty(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showDifficulty]);

  const handleSquare = (square: Square) => {
    if (game.status !== 'playing' || game.turn !== 'user') return;
    if (selected && targets.includes(square)) {
      game.tryUserMove(selected, square);
      setSelected(null);
      return;
    }
    setSelected(game.legalMovesFrom(square).length > 0 && square !== selected ? square : null);
  };

  const isActiveGame = game.status !== 'finished' && game.entries.length > 0;

  const statusText =
    game.result ? RESULT_TEXT[game.result.outcome]
    : game.status === 'thinking' ? `${opponentName} is thinking...`
    : game.checkSquare ? 'Your move, you are in check'
    : 'Your move';

  return (
    <section className="chess-panel" aria-label="Chess game">
      <div className="chess-main">
        <header className="chess-topbar">
          <button
            ref={backRef}
            type="button"
            className="chess-icon-btn"
            onClick={() => (isActiveGame ? setConfirm('leave') : onClose())}
            aria-label="Back to the chat"
            title="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="chess-title">
            <span className="chess-opponent">{opponentName}</span>
            <span className="chess-turn" role="status" aria-live="polite">{statusText}</span>
          </div>
          <div ref={difficultyRef} className="chess-difficulty">
            <button
              type="button"
              className="chess-difficulty-pill"
              aria-haspopup="listbox"
              aria-expanded={showDifficulty}
              aria-label={`Difficulty: ${game.difficulty.label} (${game.difficulty.displayElo})`}
              onClick={() => setShowDifficulty((open) => !open)}
            >
              <span className="chess-difficulty-label">{game.difficulty.label}</span>
              <span className="chess-difficulty-elo">{game.difficulty.displayElo}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {showDifficulty && (
              <div className="chess-difficulty-menu" role="listbox" aria-label="Select difficulty">
                {DIFFICULTY_PRESETS.map((preset) => {
                  const isActive = preset.id === game.difficulty.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`chess-difficulty-option ${isActive ? 'is-active' : ''}`}
                      onClick={() => {
                        game.setDifficulty(preset.id);
                        setShowDifficulty(false);
                      }}
                    >
                      <span>{preset.label}</span>
                      <span className="chess-difficulty-option-elo">{preset.displayElo}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </header>

        <ChessBoard
          fen={game.fen}
          orientation={game.userColor}
          selected={selected}
          targets={targets}
          lastMove={game.lastMove}
          checkSquare={game.checkSquare}
          onSquareActivate={handleSquare}
        />

        <div className="chess-toolbar">
          <button
            type="button"
            className="chess-icon-btn"
            onClick={() => { game.undo(); setSelected(null); }}
            disabled={!game.canUndo}
            aria-label="Undo your last move"
            title="Undo"
          >
            <Undo2 size={20} />
          </button>
          <button
            type="button"
            className="chess-icon-btn"
            onClick={() => setConfirm('resign')}
            disabled={game.status === 'finished'}
            aria-label="Resign"
            title="Resign"
          >
            <Flag size={20} />
          </button>
          <button
            type="button"
            className="chess-icon-btn"
            onClick={() => { game.newGame(); setSelected(null); }}
            aria-label="Start a new game"
            title="New game"
          >
            <RotateCcw size={20} />
          </button>
          <button
            type="button"
            className="chess-icon-btn"
            onClick={() => setShowMoves((open) => !open)}
            aria-expanded={showMoves}
            aria-controls="chess-moves"
            aria-label="Move list"
            title="Moves"
          >
            <ListOrdered size={20} />
          </button>
        </div>

        {showMoves && (
          <ol id="chess-moves" className="chess-moves" aria-label="Moves played">
            {rows.length === 0 && <li className="chess-moves-empty">No moves yet</li>}
            {rows.map((row) => (
              <li key={row.number}>
                <span className="chess-move-number">{row.number}.</span>
                <span>{row.white}</span>
                <span>{row.black}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="chess-side">
        {game.reaction && (
          <p className="chess-bubble" role="status" aria-live="polite">{game.reaction.text}</p>
        )}
        {game.status === 'finished' && game.result && (
          <div className="chess-result">
            <strong>{RESULT_TEXT[game.result.outcome]}</strong>
            <button type="button" className="btn btn--primary" onClick={() => { game.newGame(); setSelected(null); }}>
              Play again
            </button>
          </div>
        )}
      </div>

      {confirm && (
        <div className="chess-confirm" role="alertdialog" aria-modal="true" aria-label="Confirm">
          <p>{confirm === 'leave' ? 'Leave the game? Your progress will be lost.' : 'Resign this game?'}</p>
          <div className="chess-confirm-actions">
            <button type="button" className="btn" onClick={() => setConfirm(null)}>Keep playing</button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                if (confirm === 'leave') onClose();
                else game.resign();
                setConfirm(null);
              }}
            >
              {confirm === 'leave' ? 'Leave' : 'Resign'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

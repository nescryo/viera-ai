import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Color, Square } from 'chess.js';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  ListOrdered,
  ScanSearch,
  Send,
  Undo2,
  X
} from 'lucide-react';
import type { ApiConfig, ChatMessage, Persona, UserProfile } from '../../types';
import { useChessGame } from '../../hooks/useChessGame';
import type { ChessGameRecord, PromotionPiece } from '../../services/chess/chessSession';
import { MAX_CHESS_CHAT_CHARS } from '../../services/chess/commentary';
import { DIFFICULTY_PRESETS } from '../../services/chess/difficulty';
import {
  findCheckedKingSquare,
  formatReviewMove,
  parseUciSquares
} from '../../services/chess/moveReview';
import type { MoveLabel } from '../../services/chess/moveReview';
import { ChessBoard } from './ChessBoard';
import { ChessNewGameMenu } from './ChessNewGameMenu';
import { ChessPiece } from './ChessPiece';
import './ChessPanel.css';

interface ChessPanelProps {
  /** Display name of the opponent, taken from the active character. */
  opponentName: string;
  persona?: Persona;
  apiConfig?: ApiConfig;
  userProfile?: UserProfile | null;
  onSpeakReaction?: (message: ChatMessage) => void;
  /** Saved game to resume when the panel opens. */
  initialGame?: ChessGameRecord;
  onGameChange?: (record: ChessGameRecord) => void;
  onChatMessages?: (messages: ChatMessage[]) => void;
  /** Called when DeepSeek-chan's mood changes, so the Live2D model can show the emotion. */
  onEmotion: (emotion: string) => void;
  onClose: () => void;
}

const RESULT_TEXT = {
  'user-win': 'You win',
  'deepseek-win': 'You lose',
  draw: 'Draw'
} as const;

const VERDICT_LABEL: Record<MoveLabel, string> = {
  best: 'Best',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder'
};

const PROMOTION_OPTIONS: { piece: PromotionPiece; label: string }[] = [
  { piece: 'q', label: 'Queen' },
  { piece: 'r', label: 'Rook' },
  { piece: 'b', label: 'Bishop' },
  { piece: 'n', label: 'Knight' }
];

/** Pairs plain move entries into numbered rows: [1, 'e4', 'e5']. */
function toMoveRows(sans: string[]): { number: number; white: string; black: string }[] {
  const rows: { number: number; white: string; black: string }[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push({ number: i / 2 + 1, white: sans[i], black: sans[i + 1] ?? '' });
  }
  return rows;
}

/** Full-screen chess layout: board on the left, the Live2D character shows on the right. */
export const ChessPanel: React.FC<ChessPanelProps> = ({
  opponentName,
  persona,
  apiConfig,
  userProfile,
  onSpeakReaction,
  initialGame,
  onGameChange,
  onChatMessages,
  onEmotion,
  onClose
}) => {
  const game = useChessGame({ persona, apiConfig, userProfile, onSpeakReaction, initialGame, onGameChange, onChatMessages });
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [chatText, setChatText] = useState('');
  const [showMoves, setShowMoves] = useState(false);
  const [showDifficulty, setShowDifficulty] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | 'resign' | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const movesRef = useRef<HTMLOListElement>(null);
  const difficultyRef = useRef<HTMLDivElement>(null);

  const isReviewActive = game.review.phase !== 'idle';
  const activeMoment = game.review.phase === 'ready' ? game.review.currentMoment : null;

  const targets = useMemo(
    () => (selected && !isReviewActive ? game.legalMovesFrom(selected) : []),
    [selected, isReviewActive, game]
  );
  const rows = useMemo(() => toMoveRows(game.entries.map((entry) => entry.san)), [game.entries]);
  const boardFen = activeMoment ? activeMoment.ply.fenAfter : game.fen;
  const boardLastMove = activeMoment
    ? { from: activeMoment.ply.entry.from, to: activeMoment.ply.entry.to }
    : game.lastMove;
  const boardCheckSquare = useMemo(
    () => (activeMoment ? findCheckedKingSquare(activeMoment.ply.fenAfter) : game.checkSquare),
    [activeMoment, game.checkSquare]
  );
  const bestMoveArrow = useMemo(
    () => (activeMoment && activeMoment.label !== 'best' ? parseUciSquares(activeMoment.bestMoveUci) : null),
    [activeMoment]
  );

  useEffect(() => {
    onEmotion(game.reaction?.emotion ?? game.mood);
  }, [game.reaction, game.mood, onEmotion]);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  // Keep the newest move visible in the horizontal strip
  useEffect(() => {
    const strip = movesRef.current;
    if (strip) strip.scrollLeft = strip.scrollWidth;
  }, [showMoves, game.entries.length]);

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
    if (isReviewActive || game.status !== 'playing' || game.turn !== 'user') return;
    if (selected && targets.includes(square)) {
      if (game.isPromotionMove(selected, square)) {
        setPendingPromotion({ from: selected, to: square });
        return;
      }
      game.tryUserMove(selected, square);
      setSelected(null);
      return;
    }
    setPendingPromotion(null);
    setSelected(game.legalMovesFrom(square).length > 0 && square !== selected ? square : null);
  };

  const handleStartReview = () => {
    setSelected(null);
    setPendingPromotion(null);
    game.startReview();
  };

  const handlePromotionSelect = (piece: PromotionPiece) => {
    if (!pendingPromotion) return;
    game.tryUserMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
    setSelected(null);
  };

  const startNewGame = (color: Color) => {
    game.newGame(color);
    setSelected(null);
    setPendingPromotion(null);
  };

  const isActiveGame = game.status !== 'finished' && game.entries.length > 0;
  const isAnalyzingReview = game.review.phase === 'analyzing';

  const statusText =
    isAnalyzingReview
      ? `Analyzing moves (${game.review.progress.completed}/${game.review.progress.total})...`
      : activeMoment
        ? `Review · Moment ${game.review.currentIndex + 1} of ${game.review.moments.length}`
        : game.review.phase === 'error'
          ? 'Move review unavailable'
          : game.result
            ? RESULT_TEXT[game.result.outcome]
            : game.status === 'thinking'
              ? `${opponentName} is thinking...`
              : game.checkSquare
                ? 'Your move, you are in check'
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
          fen={boardFen}
          orientation={game.userColor}
          selected={isReviewActive ? null : selected}
          targets={targets}
          lastMove={boardLastMove}
          bestMoveArrow={bestMoveArrow}
          moveCount={activeMoment ? 0 : game.entries.length}
          checkSquare={boardCheckSquare}
          readOnly={isReviewActive}
          onSquareActivate={handleSquare}
        />

        {isReviewActive ? (
          <div className="chess-review-bar" role="region" aria-label="Move review controls">
            {isAnalyzingReview && (
              <>
                <div className="chess-review-progress-wrap">
                  <span className="chess-review-status">
                    Analyzing {game.review.progress.completed}/{game.review.progress.total}
                  </span>
                  <div className="chess-review-progress-track" aria-hidden="true">
                    <div
                      className="chess-review-progress-fill"
                      style={{
                        width: `${
                          game.review.progress.total > 0
                            ? Math.round((game.review.progress.completed / game.review.progress.total) * 100)
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="chess-icon-btn"
                  onClick={game.exitReview}
                  aria-label="Cancel review analysis"
                  title="Cancel"
                >
                  <X size={18} />
                </button>
              </>
            )}

            {activeMoment && (
              <>
                <div className="chess-review-info">
                  <span className={`chess-verdict chess-verdict--${activeMoment.label}`}>
                    {VERDICT_LABEL[activeMoment.label]}
                  </span>
                  <span className="chess-review-move">{formatReviewMove(activeMoment)}</span>
                  {activeMoment.label !== 'best' && activeMoment.bestMoveSan && (
                    <span className="chess-review-better">Better: {activeMoment.bestMoveSan}</span>
                  )}
                </div>
                <div className="chess-review-nav">
                  <button
                    type="button"
                    className="chess-icon-btn chess-icon-btn--sm"
                    onClick={game.prevReviewMoment}
                    disabled={game.review.currentIndex === 0}
                    aria-label="Previous moment"
                    title="Previous"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="chess-review-counter" aria-live="polite">
                    {game.review.currentIndex + 1}/{game.review.moments.length}
                  </span>
                  <button
                    type="button"
                    className="chess-icon-btn chess-icon-btn--sm"
                    onClick={game.nextReviewMoment}
                    disabled={game.review.currentIndex >= game.review.moments.length - 1}
                    aria-label="Next moment"
                    title="Next"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    type="button"
                    className="chess-icon-btn chess-icon-btn--sm"
                    onClick={game.exitReview}
                    aria-label="Exit review"
                    title="Exit review"
                  >
                    <X size={18} />
                  </button>
                </div>
              </>
            )}

            {game.review.phase === 'error' && (
              <>
                <span className="chess-review-status">
                  {game.review.errorMessage ?? 'Move review unavailable.'}
                </span>
                <button
                  type="button"
                  className="chess-icon-btn chess-icon-btn--sm"
                  onClick={game.exitReview}
                  aria-label="Close review message"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="chess-toolbar">
            <button
              type="button"
              className="chess-icon-btn"
              onClick={() => { game.undo(); setSelected(null); setPendingPromotion(null); }}
              disabled={!game.canUndo}
              aria-label="Undo your last move"
              title="Undo"
            >
              <Undo2 size={20} />
            </button>
            <button
              type="button"
              className="chess-icon-btn"
              onClick={() => { setPendingPromotion(null); setConfirm('resign'); }}
              disabled={game.status === 'finished'}
              aria-label="Resign"
              title="Resign"
            >
              <Flag size={20} />
            </button>
            <ChessNewGameMenu onStart={startNewGame} />
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
            <button
              type="button"
              className="chess-icon-btn"
              onClick={handleStartReview}
              disabled={!game.canReview}
              aria-label="Review your moves"
              title="Review moves"
            >
              <ScanSearch size={20} />
            </button>
          </div>
        )}

        {!isReviewActive && showMoves && (
          <ol
            ref={movesRef}
            id="chess-moves"
            className="chess-moves"
            aria-label="Moves played"
            onWheel={(event) => {
              const strip = event.currentTarget;
              if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && strip.scrollWidth > strip.clientWidth) {
                strip.scrollLeft += event.deltaY;
              }
            }}
          >
            {rows.length === 0 && <li className="chess-moves-empty">No moves yet</li>}
            {rows.map((row, rowIndex) => {
              const isLastRow = rowIndex === rows.length - 1;
              const lastIsBlack = game.entries.length % 2 === 0 && game.entries.length > 0;
              return (
                <li key={row.number}>
                  <span className="chess-move-number">{row.number}.</span>
                  <span className={`chess-move${isLastRow && !lastIsBlack ? ' is-latest' : ''}`}>{row.white}</span>
                  {row.black && (
                    <span className={`chess-move${isLastRow && lastIsBlack ? ' is-latest' : ''}`}>{row.black}</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="chess-side">
        {game.reaction && (
          <p className="chess-bubble" role="status" aria-live="polite">{game.reaction.text}</p>
        )}
        {game.status === 'finished' && game.result && !isReviewActive && (
          <div className={`chess-result chess-result--${game.result.outcome}`}>
            <strong className="chess-result-label">{RESULT_TEXT[game.result.outcome]}</strong>
            <div className="chess-result-actions">
              {game.canReview && (
                <button
                  type="button"
                  className="btn btn--secondary chess-review-cta"
                  onClick={handleStartReview}
                >
                  <ScanSearch size={16} aria-hidden="true" />
                  <span>Review</span>
                </button>
              )}
              <ChessNewGameMenu variant="primary" onStart={startNewGame} />
            </div>
          </div>
        )}
      </div>

      {game.chatEnabled && (
        <div className="chess-chat-dock">
          <form
            className={`chess-chat${isAnalyzingReview ? ' is-disabled' : ''}`}
            onSubmit={(event) => {
              event.preventDefault();
              if (!isAnalyzingReview && game.sendUserChat(chatText)) setChatText('');
            }}
          >
            <input
              type="text"
              className="chess-chat-input"
              value={chatText}
              maxLength={MAX_CHESS_CHAT_CHARS}
              disabled={isAnalyzingReview}
              onChange={(event) => setChatText(event.target.value)}
              placeholder={
                isAnalyzingReview
                  ? 'Analyzing moves...'
                  : activeMoment
                    ? `Ask ${opponentName} about this move...`
                    : `Talk to ${opponentName}...`
              }
              aria-label={`Message ${opponentName}`}
              autoComplete="off"
            />
            <button
              type="submit"
              className="chess-icon-btn"
              disabled={isAnalyzingReview || !chatText.trim()}
              aria-label="Send message"
              title="Send"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}

      {pendingPromotion && (
        <div className="chess-confirm-scrim">
          <div className="chess-confirm" role="dialog" aria-modal="true" aria-labelledby="chess-promotion-title">
            <h3 id="chess-promotion-title" className="chess-confirm-title">Promote pawn</h3>
            <div className="chess-promotion-grid">
              {PROMOTION_OPTIONS.map(({ piece, label }) => (
                <button
                  key={piece}
                  type="button"
                  className="chess-promotion-btn"
                  aria-label={`Promote to ${label}`}
                  onClick={() => handlePromotionSelect(piece)}
                >
                  <ChessPiece color={game.userColor} type={piece} />
                  <span className="chess-promotion-label">{label}</span>
                </button>
              ))}
            </div>
            <div className="chess-confirm-actions">
              <button type="button" className="btn btn--secondary" onClick={() => setPendingPromotion(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="chess-confirm-scrim">
          <div
            className="chess-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="chess-confirm-title"
            aria-describedby="chess-confirm-desc"
          >
            <h3 id="chess-confirm-title" className="chess-confirm-title">
              {confirm === 'leave' ? 'Leave game?' : 'Resign this game?'}
            </h3>
            <p id="chess-confirm-desc" className="chess-confirm-text">
              {confirm === 'leave'
                ? 'Your game is saved in this conversation. Resume it anytime.'
                : 'You will lose this game. The conversation stays the same.'}
            </p>
            <div className="chess-confirm-actions">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirm(null)} autoFocus>
                Keep playing
              </button>
              <button
                type="button"
                className={`btn ${confirm === 'resign' ? 'btn--danger' : 'btn--primary'}`}
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
        </div>
      )}
    </section>
  );
};

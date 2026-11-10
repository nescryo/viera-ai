import { useCallback, useEffect, useRef, useState } from 'react';
import type { Color, Square } from 'chess.js';
import { ChessSession } from '../services/chess/chessSession';
import type { ChessHistoryEntry, ChessSnapshot } from '../services/chess/chessSession';
import { DEFAULT_DIFFICULTY_ID, getDifficultyPreset } from '../services/chess/difficulty';
import type { DifficultyId, DifficultyPreset } from '../services/chess/difficulty';
import { createStockfishEngine } from '../services/chess/engine';
import type { ChessEngine } from '../services/chess/engine';
import { reactToMove, reactToResult } from '../services/chess/reactions';
import type { ChessReaction } from '../services/chess/reactions';

export type ChessStatus = 'playing' | 'thinking' | 'finished';

export interface UseChessGame extends ChessSnapshot {
  status: ChessStatus;
  difficulty: DifficultyPreset;
  /** Latest notable reaction from DeepSeek-chan, or null after an ordinary move. */
  reaction: ChessReaction | null;
  canUndo: boolean;
  legalMovesFrom(square: Square): Square[];
  tryUserMove(from: Square, to: Square, promotion?: string): boolean;
  newGame(userColor?: Color): void;
  resign(): void;
  undo(): void;
  setDifficulty(id: DifficultyId): void;
}

/** State for one chess game against DeepSeek-chan. The opponent is created with the hook and disposed on unmount. */
export function useChessGame(): UseChessGame {
  const [session] = useState(() => new ChessSession('w'));
  const [snapshot, setSnapshot] = useState<ChessSnapshot>(() => session.snapshot());
  const [difficulty, setDifficultyState] = useState<DifficultyPreset>(() =>
    getDifficultyPreset(DEFAULT_DIFFICULTY_ID)
  );
  const [thinking, setThinking] = useState(false);
  const [reaction, setReaction] = useState<ChessReaction | null>(null);

  const engineRef = useRef<ChessEngine | null>(null);
  // Bumped to invalidate an engine reply that is still pending (new game, resign, unmount)
  const tokenRef = useRef(0);

  useEffect(() => {
    engineRef.current = createStockfishEngine({
      initialDifficulty: getDifficultyPreset(DEFAULT_DIFFICULTY_ID)
    });
    return () => {
      tokenRef.current += 1;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const afterMove = useCallback((entry: ChessHistoryEntry): ChessSnapshot => {
    const next = session.snapshot();
    setSnapshot(next);
    const variant = next.entries.length;
    setReaction(next.result ? reactToResult(next.result, variant) : reactToMove(entry, variant));
    return next;
  }, [session]);

  const runEngine = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const token = ++tokenRef.current;
    setThinking(true);
    try {
      const uci = await engine.getBestMove(session.fen);
      if (token !== tokenRef.current) return;
      const entry = session.engineMove(uci);
      if (entry) afterMove(entry);
    } catch (error) {
      console.warn('Chess engine failed to move:', error);
    }
    if (token === tokenRef.current) setThinking(false);
  }, [session, afterMove]);

  const cancelPending = useCallback(() => {
    tokenRef.current += 1;
    setThinking(false);
  }, []);

  const tryUserMove = useCallback((from: Square, to: Square, promotion?: string): boolean => {
    const entry = session.userMove(from, to, promotion);
    if (!entry) return false;
    const next = afterMove(entry);
    if (!next.result) void runEngine();
    return true;
  }, [session, afterMove, runEngine]);

  const newGame = useCallback((userColor?: Color) => {
    cancelPending();
    session.reset(userColor);
    setSnapshot(session.snapshot());
    setReaction(null);
    // When the user plays black, DeepSeek-chan opens
    if (session.snapshot().turn === 'deepseek') void runEngine();
  }, [session, cancelPending, runEngine]);

  const resign = useCallback(() => {
    cancelPending();
    session.resign();
    const next = session.snapshot();
    setSnapshot(next);
    if (next.result) setReaction(reactToResult(next.result, next.entries.length));
  }, [session, cancelPending]);

  const undo = useCallback(() => {
    if (!session.undo()) return;
    setSnapshot(session.snapshot());
    setReaction(null);
  }, [session]);

  const setDifficulty = useCallback((id: DifficultyId) => {
    const nextPreset = getDifficultyPreset(id);
    setDifficultyState(nextPreset);
    engineRef.current?.setDifficulty?.(nextPreset);
  }, []);

  const legalMovesFrom = useCallback((square: Square) => session.legalTargets(square), [session]);

  const status: ChessStatus = snapshot.result ? 'finished' : thinking ? 'thinking' : 'playing';
  const canUndo = status === 'playing'
    && snapshot.turn === 'user'
    && snapshot.entries.some((entry) => entry.by === 'user');

  return {
    ...snapshot,
    status,
    difficulty,
    reaction,
    canUndo,
    legalMovesFrom,
    tryUserMove,
    newGame,
    resign,
    undo,
    setDifficulty
  };
}

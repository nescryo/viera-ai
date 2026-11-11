import { useCallback, useEffect, useRef, useState } from 'react';
import type { Color, Square } from 'chess.js';
import type { ApiConfig, ChatMessage, Persona, UserProfile } from '../types';
import { sendStreamingChatMessage } from '../services/aiService';
import { extractAndValidateDialogue } from '../services/dubbingValidator';
import { ChessSession } from '../services/chess/chessSession';
import type { ChessHistoryEntry, ChessSnapshot, PromotionPiece } from '../services/chess/chessSession';
import {
  CHESS_SYSTEM_PROMPT_ADDENDUM,
  buildChessTurnPrompt,
  shouldRequestLlmCommentary
} from '../services/chess/commentary';
import { DEFAULT_DIFFICULTY_ID, getDifficultyPreset } from '../services/chess/difficulty';
import type { DifficultyId, DifficultyPreset } from '../services/chess/difficulty';
import { createStockfishEngine } from '../services/chess/engine';
import type { ChessEngine } from '../services/chess/engine';
import { resolveChessMood } from '../services/chess/evalMood';
import { detectGameEvent } from '../services/chess/gameEvents';

export interface ChessReaction {
  text: string;
  emotion: string;
}

export type ChessStatus = 'playing' | 'thinking' | 'finished';

export interface UseChessGameOptions {
  persona?: Persona;
  apiConfig?: ApiConfig;
  userProfile?: UserProfile | null;
  /** Optional callback to speak a completed LLM reaction via TTS. */
  onSpeakReaction?: (message: ChatMessage) => void;
}

export interface UseChessGame extends ChessSnapshot {
  status: ChessStatus;
  difficulty: DifficultyPreset;
  /** Current Live2D emotion ID derived from board evaluation, events, or LLM tag. */
  mood: string;
  /** Latest notable spoken reaction from DeepSeek-chan, or null on ordinary quiet moves. */
  reaction: ChessReaction | null;
  canUndo: boolean;
  legalMovesFrom(square: Square): Square[];
  isPromotionMove(from: Square, to: Square): boolean;
  tryUserMove(from: Square, to: Square, promotion?: PromotionPiece): boolean;
  newGame(userColor?: Color): void;
  resign(): void;
  undo(): void;
  setDifficulty(id: DifficultyId): void;
}

/** State for one chess game against DeepSeek-chan. The opponent is created with the hook and disposed on unmount. */
export function useChessGame(options: UseChessGameOptions = {}): UseChessGame {
  const { persona, apiConfig, userProfile, onSpeakReaction } = options;

  const [session] = useState(() => new ChessSession('w'));
  const [snapshot, setSnapshot] = useState<ChessSnapshot>(() => session.snapshot());
  const [difficulty, setDifficultyState] = useState<DifficultyPreset>(() =>
    getDifficultyPreset(DEFAULT_DIFFICULTY_ID)
  );
  const [thinking, setThinking] = useState(false);
  const [mood, setMood] = useState<string>('relaxed');
  const [reaction, setReaction] = useState<ChessReaction | null>(null);

  const engineRef = useRef<ChessEngine | null>(null);
  // Bumped to invalidate an engine reply that is still pending (new game, resign, unmount)
  const tokenRef = useRef(0);
  // Bumped to invalidate an in-flight LLM stream when a newer LLM comment starts or game resets
  const llmTokenRef = useRef(0);
  // Multi-turn in-memory context window for the active chess game (cleared on newGame)
  const chessMessagesRef = useRef<ChatMessage[]>([]);
  const lastCommentedPlyRef = useRef<number | null>(null);
  const evalCpRef = useRef<number | undefined>(undefined);

  const optionsRef = useRef({ persona, apiConfig, userProfile, onSpeakReaction, difficulty });
  useEffect(() => {
    optionsRef.current = { persona, apiConfig, userProfile, onSpeakReaction, difficulty };
  }, [persona, apiConfig, userProfile, onSpeakReaction, difficulty]);

  useEffect(() => {
    engineRef.current = createStockfishEngine({
      initialDifficulty: getDifficultyPreset(DEFAULT_DIFFICULTY_ID)
    });
    return () => {
      tokenRef.current += 1;
      llmTokenRef.current += 1;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const triggerLlmCommentary = useCallback(
    (
      next: ChessSnapshot,
      event: ReturnType<typeof detectGameEvent>,
      currentEvalCp: number | undefined,
      fallbackMood: string
    ) => {
      const {
        persona: activePersona,
        apiConfig: activeConfig,
        userProfile: activeUser,
        onSpeakReaction: speakFn,
        difficulty: activeDifficulty
      } = optionsRef.current;

      if (!activePersona || !activeConfig?.baseUrl?.trim() || !activeConfig?.model?.trim()) {
        return;
      }

      const plyCount = next.entries.length;
      if (
        !shouldRequestLlmCommentary({
          event,
          plyCount,
          lastCommentedPly: lastCommentedPlyRef.current
        })
      ) {
        return;
      }

      lastCommentedPlyRef.current = plyCount;
      const requestToken = ++llmTokenRef.current;

      const promptText = buildChessTurnPrompt({
        event,
        entries: next.entries,
        evalCp: currentEvalCp,
        difficultyLabel: `${activeDifficulty.label} (${activeDifficulty.displayElo})`,
        result: next.result
      });

      const userTurnMsg: ChatMessage = {
        id: `chess-turn-${plyCount}-${Date.now()}`,
        characterId: activePersona.id,
        sender: 'user',
        text: promptText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const historyForLlm = [...chessMessagesRef.current, userTurnMsg];
      chessMessagesRef.current = historyForLlm;

      const chessPersona: Persona = {
        ...activePersona,
        systemPrompt: `${activePersona.systemPrompt || ''}\n\n${CHESS_SYSTEM_PROMPT_ADDENDUM}`
      };

      void sendStreamingChatMessage(
        historyForLlm,
        chessPersona,
        activeConfig,
        (_token, fullTextSoFar) => {
          if (requestToken !== llmTokenRef.current) return;
          const parsed = extractAndValidateDialogue(fullTextSoFar);
          const clean = parsed.cleanText.replace(/<narrative>[\s\S]*?<\/narrative>/gi, '').trim();
          const nextEmotion = parsed.emotion ?? fallbackMood;
          setMood(nextEmotion);
          if (clean) {
            setReaction({ text: clean, emotion: nextEmotion });
          }
        },
        (fullText, emotions) => {
          if (requestToken !== llmTokenRef.current) return;
          const parsed = extractAndValidateDialogue(fullText);
          const clean = parsed.cleanText.replace(/<narrative>[\s\S]*?<\/narrative>/gi, '').trim();
          const finalEmotion = emotions[0] ?? parsed.emotion ?? fallbackMood;
          setMood(finalEmotion);
          if (clean) {
            setReaction({ text: clean, emotion: finalEmotion });
            const aiMsg: ChatMessage = {
              id: `chess-ai-${plyCount}-${Date.now()}`,
              characterId: activePersona.id,
              sender: 'ai',
              text: clean,
              rawText: fullText,
              jaText: parsed.jaText ?? undefined,
              emotions: [finalEmotion],
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            chessMessagesRef.current = [...chessMessagesRef.current, aiMsg];
            speakFn?.(aiMsg);
          }
        },
        () => {
          // Ignore network/API errors during chess commentary
        },
        activeUser,
        undefined,
        fallbackMood
      );
    },
    []
  );

  const afterMove = useCallback(
    (entry: ChessHistoryEntry, latestEvalCp?: number): ChessSnapshot => {
      const next = session.snapshot();
      setSnapshot(next);

      const prevEvalCp = evalCpRef.current;
      const currentEvalCp = latestEvalCp ?? prevEvalCp;
      if (latestEvalCp !== undefined) {
        evalCpRef.current = latestEvalCp;
      }

      let event = detectGameEvent({
        entry,
        fen: next.fen,
        plyCount: next.entries.length,
        prevEvalCp,
        currentEvalCp,
        result: next.result
      });

      // If DeepSeek-chan's reply was a quiet blocking/evading move after a notable user move,
      // preserve the user's notable event (e.g. check, promotion, major capture) for LLM commentary.
      const prevEntry = next.entries.length >= 2 ? next.entries[next.entries.length - 2] : undefined;
      if (entry.by === 'deepseek' && event.kind === 'ordinary' && prevEntry?.by === 'user') {
        const userEvent = detectGameEvent({
          entry: prevEntry,
          fen: next.fen,
          plyCount: next.entries.length,
          prevEvalCp,
          currentEvalCp
        });
        if (userEvent.kind !== 'ordinary') {
          event = userEvent;
        }
      }

      const resolvedMood = resolveChessMood({
        evalCp: currentEvalCp,
        event,
        result: next.result
      });
      setMood(resolvedMood);

      // Trigger LLM commentary after DeepSeek-chan's reply or when the game ends
      if (entry.by === 'deepseek' || next.result) {
        triggerLlmCommentary(next, event, currentEvalCp, resolvedMood);
      }

      return next;
    },
    [session, triggerLlmCommentary]
  );

  const runEngine = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const token = ++tokenRef.current;
    setThinking(true);
    try {
      const uci = await engine.getBestMove(session.fen);
      if (token !== tokenRef.current) return;
      const latestEvalCp = engine.getLastEvalCp?.();
      const entry = session.engineMove(uci);
      if (entry) afterMove(entry, latestEvalCp);
    } catch (error) {
      console.warn('Chess engine failed to move:', error);
    }
    if (token === tokenRef.current) setThinking(false);
  }, [session, afterMove]);

  const cancelPending = useCallback(() => {
    tokenRef.current += 1;
    setThinking(false);
  }, []);

  const tryUserMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      const entry = session.userMove(from, to, promotion);
      if (!entry) return false;
      const next = afterMove(entry);
      if (!next.result) void runEngine();
      return true;
    },
    [session, afterMove, runEngine]
  );

  const newGame = useCallback(
    (userColor?: Color) => {
      cancelPending();
      llmTokenRef.current += 1;
      chessMessagesRef.current = [];
      lastCommentedPlyRef.current = null;
      evalCpRef.current = undefined;
      session.reset(userColor);
      setSnapshot(session.snapshot());
      setMood('relaxed');
      setReaction(null);
      // When the user plays black, DeepSeek-chan opens
      if (session.snapshot().turn === 'deepseek') void runEngine();
    },
    [session, cancelPending, runEngine]
  );

  const resign = useCallback(() => {
    cancelPending();
    session.resign();
    const next = session.snapshot();
    setSnapshot(next);
    if (next.result) {
      const event = detectGameEvent({
        fen: next.fen,
        plyCount: next.entries.length,
        prevEvalCp: evalCpRef.current,
        currentEvalCp: evalCpRef.current,
        result: next.result
      });
      const resolvedMood = resolveChessMood({
        evalCp: evalCpRef.current,
        event,
        result: next.result
      });
      setMood(resolvedMood);
      triggerLlmCommentary(next, event, evalCpRef.current, resolvedMood);
    }
  }, [session, cancelPending, triggerLlmCommentary]);

  const undo = useCallback(() => {
    if (!session.undo()) return;
    llmTokenRef.current += 1;
    const next = session.snapshot();
    if (lastCommentedPlyRef.current !== null && next.entries.length < lastCommentedPlyRef.current) {
      lastCommentedPlyRef.current = next.entries.length > 0 ? next.entries.length : null;
    }
    setSnapshot(next);
    setReaction(null);
  }, [session]);

  const setDifficulty = useCallback((id: DifficultyId) => {
    const nextPreset = getDifficultyPreset(id);
    setDifficultyState(nextPreset);
    engineRef.current?.setDifficulty?.(nextPreset);
  }, []);

  const legalMovesFrom = useCallback((square: Square) => session.legalTargets(square), [session]);
  const isPromotionMove = useCallback(
    (from: Square, to: Square) => session.isPromotionMove(from, to),
    [session]
  );

  const status: ChessStatus = snapshot.result ? 'finished' : thinking ? 'thinking' : 'playing';
  const canUndo =
    status === 'playing' &&
    snapshot.turn === 'user' &&
    snapshot.entries.some((entry) => entry.by === 'user');

  return {
    ...snapshot,
    status,
    difficulty,
    mood,
    reaction,
    canUndo,
    legalMovesFrom,
    isPromotionMove,
    tryUserMove,
    newGame,
    resign,
    undo,
    setDifficulty
  };
}

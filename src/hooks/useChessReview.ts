import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ChessSnapshot } from '../services/chess/chessSession';
import type { ChessEngine } from '../services/chess/engine';
import type { ChessResult } from '../services/chess/gameResult';
import {
  REVIEW_ANALYSIS_DEPTH,
  buildReviewMomentPrompt,
  buildReviewPlies,
  buildTemplateNarration,
  pickKeyMoments,
  positionsToAnalyze,
  reviewUserMoves
} from '../services/chess/moveReview';
import type { PositionAnalysis, ReviewedMove } from '../services/chess/moveReview';

export type ChessReviewPhase = 'idle' | 'analyzing' | 'ready' | 'error';

export interface ChessReviewProgress {
  completed: number;
  total: number;
}

export interface ChessReviewReaction {
  text: string;
  emotion: string;
}

export interface ChessReviewState {
  phase: ChessReviewPhase;
  progress: ChessReviewProgress;
  moments: ReviewedMove[];
  currentIndex: number;
  currentMoment: ReviewedMove | null;
  /** Result snapshot captured when the review started (undefined for mid-game reviews). */
  gameResult?: ChessResult;
  errorMessage: string | null;
}

export interface UseChessReviewOptions {
  engineRef: RefObject<ChessEngine | null>;
  requestReviewReply: (
    promptText: string,
    idTag: string,
    fallbackMood: string,
    onComplete?: (reaction: ChessReviewReaction) => void,
    onError?: () => void
  ) => boolean;
  cancelLlm: () => void;
  applyReaction: (reaction: ChessReviewReaction | null, mood?: string) => void;
  getLiveMood: () => string;
}

export interface UseChessReview extends ChessReviewState {
  startReview: (snapshot: ChessSnapshot) => void;
  prevMoment: () => void;
  nextMoment: () => void;
  exitReview: () => void;
}

const INITIAL_REVIEW_STATE: ChessReviewState = {
  phase: 'idle',
  progress: { completed: 0, total: 0 },
  moments: [],
  currentIndex: 0,
  currentMoment: null,
  gameResult: undefined,
  errorMessage: null
};

/**
 * Orchestrates Stockfish position analysis, key-moment navigation, and per-moment
 * narration caching for Chess Move Review.
 */
export function useChessReview(options: UseChessReviewOptions): UseChessReview {
  const [state, setState] = useState<ChessReviewState>(INITIAL_REVIEW_STATE);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const abortRef = useRef<AbortController | null>(null);
  const reviewTokenRef = useRef(0);
  const phaseRef = useRef<ChessReviewPhase>('idle');
  const momentsRef = useRef<ReviewedMove[]>([]);
  const currentIndexRef = useRef(0);
  const gameResultRef = useRef<ChessResult | undefined>(undefined);
  // Cached only after a moment finishes narrating cleanly (interrupted streams stay uncached)
  const narrationCacheRef = useRef<Map<number, ChessReviewReaction>>(new Map());

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  useEffect(() => {
    return () => {
      reviewTokenRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const narrateMoment = useCallback((moments: ReviewedMove[], index: number, result?: ChessResult) => {
    const move = moments[index];
    if (!move) return;

    const { requestReviewReply, cancelLlm, applyReaction } = optionsRef.current;
    const cached = narrationCacheRef.current.get(move.ply.index);
    if (cached) {
      cancelLlm();
      applyReaction(cached, cached.emotion);
      return;
    }

    const template = buildTemplateNarration(move);
    const promptText = buildReviewMomentPrompt({
      move,
      position: index + 1,
      total: moments.length,
      result
    });

    // Clear the previous moment's bubble until the first streamed token arrives
    applyReaction(null, template.emotion);

    const started = requestReviewReply(
      promptText,
      `review-${move.ply.index}`,
      template.emotion,
      (finalReaction) => {
        narrationCacheRef.current.set(move.ply.index, finalReaction);
      },
      () => {
        narrationCacheRef.current.set(move.ply.index, template);
        applyReaction(template, template.emotion);
      }
    );

    if (!started) {
      narrationCacheRef.current.set(move.ply.index, template);
      applyReaction(template, template.emotion);
    }
  }, []);

  const exitReview = useCallback(() => {
    const wasActive = phaseRef.current !== 'idle';
    reviewTokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    phaseRef.current = 'idle';
    momentsRef.current = [];
    currentIndexRef.current = 0;
    gameResultRef.current = undefined;
    narrationCacheRef.current.clear();

    if (wasActive) {
      optionsRef.current.cancelLlm();
      optionsRef.current.applyReaction(null, optionsRef.current.getLiveMood());
    }
    setState((prev) => (prev.phase === 'idle' ? prev : INITIAL_REVIEW_STATE));
  }, []);

  const startReview = useCallback(
    (snapshot: ChessSnapshot) => {
      if (!snapshot.entries.some((entry) => entry.by === 'user')) return;

      reviewTokenRef.current += 1;
      const token = reviewTokenRef.current;
      abortRef.current?.abort();
      optionsRef.current.cancelLlm();
      narrationCacheRef.current.clear();

      const plies = buildReviewPlies(snapshot.entries);
      const fens = positionsToAnalyze(plies);
      const engine = optionsRef.current.engineRef.current;

      if (fens.length === 0 || !engine?.analyzePosition) {
        setState({
          ...INITIAL_REVIEW_STATE,
          phase: 'error',
          gameResult: snapshot.result,
          errorMessage: 'Move analysis is unavailable right now.'
        });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      gameResultRef.current = snapshot.result;
      momentsRef.current = [];
      currentIndexRef.current = 0;

      setState({
        phase: 'analyzing',
        progress: { completed: 0, total: fens.length },
        moments: [],
        currentIndex: 0,
        currentMoment: null,
        gameResult: snapshot.result,
        errorMessage: null
      });

      void (async () => {
        const analyses = new Map<string, PositionAnalysis>();

        for (let i = 0; i < fens.length; i += 1) {
          if (controller.signal.aborted || token !== reviewTokenRef.current) return;
          const fen = fens[i];
          const analysis = await engine.analyzePosition!(fen, REVIEW_ANALYSIS_DEPTH, controller.signal);
          if (controller.signal.aborted || token !== reviewTokenRef.current) return;
          analyses.set(fen, analysis);
          setState((prev) =>
            prev.phase === 'analyzing'
              ? { ...prev, progress: { completed: i + 1, total: fens.length } }
              : prev
          );
        }

        if (controller.signal.aborted || token !== reviewTokenRef.current) return;

        const reviewed = reviewUserMoves(plies, analyses, snapshot.userColor);
        const moments = pickKeyMoments(reviewed);
        if (moments.length === 0) {
          setState({
            ...INITIAL_REVIEW_STATE,
            phase: 'error',
            gameResult: snapshot.result,
            errorMessage: 'Could not analyze any moves in this game.'
          });
          return;
        }

        momentsRef.current = moments;
        currentIndexRef.current = 0;
        setState({
          phase: 'ready',
          progress: { completed: fens.length, total: fens.length },
          moments,
          currentIndex: 0,
          currentMoment: moments[0],
          gameResult: snapshot.result,
          errorMessage: null
        });
        narrateMoment(moments, 0, snapshot.result);
      })();
    },
    [narrateMoment]
  );

  const prevMoment = useCallback(() => {
    const moments = momentsRef.current;
    const nextIndex = currentIndexRef.current - 1;
    if (nextIndex < 0 || nextIndex >= moments.length) return;
    currentIndexRef.current = nextIndex;
    setState((prev) =>
      prev.phase === 'ready'
        ? { ...prev, currentIndex: nextIndex, currentMoment: moments[nextIndex] }
        : prev
    );
    narrateMoment(moments, nextIndex, gameResultRef.current);
  }, [narrateMoment]);

  const nextMoment = useCallback(() => {
    const moments = momentsRef.current;
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex < 0 || nextIndex >= moments.length) return;
    currentIndexRef.current = nextIndex;
    setState((prev) =>
      prev.phase === 'ready'
        ? { ...prev, currentIndex: nextIndex, currentMoment: moments[nextIndex] }
        : prev
    );
    narrateMoment(moments, nextIndex, gameResultRef.current);
  }, [narrateMoment]);

  return {
    ...state,
    startReview,
    prevMoment,
    nextMoment,
    exitReview
  };
}

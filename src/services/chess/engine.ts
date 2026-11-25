import { Chess } from 'chess.js';
import workerJsUrl from 'stockfish/bin/stockfish-19-lite-single.js?url';
import workerWasmUrl from 'stockfish/bin/stockfish-19-lite-single.wasm?url';
import {
  DEFAULT_DIFFICULTY_ID,
  getDifficultyPreset,
  toUciConfigureCommands,
  toUciGoCommand
} from './difficulty';
import type { DifficultyPreset } from './difficulty';
import { REVIEW_ANALYSIS_DEPTH } from './moveReview';
import type { PositionAnalysis } from './moveReview';

/**
 * Opponent behind the board. The UI only depends on this interface, so a Stockfish
 * worker or a test stub can be swapped without touching the hook or the components.
 */
export interface ChessEngine {
  /** Updates the difficulty preset for subsequent moves. */
  setDifficulty?(preset: DifficultyPreset): void;
  /** Latest evaluation in centipawns from the engine's (DeepSeek-chan's) perspective. */
  getLastEvalCp?(): number | undefined;
  /** Resolves with a move in UCI form, e.g. `e2e4` or `e7e8q`. */
  getBestMove(fen: string): Promise<string>;
  /** Resolves with a fast Stockfish hint move in UCI form for the side to move in `fen`, or null if unavailable. */
  getHintMove?(fen: string): Promise<string | null>;
  /**
   * Analyses `fen` at full strength to `depth` without overwriting the active game's `lastEvalCp`.
   * Returns `{ bestMove, evalCp }` from the side-to-move's perspective, or empty analysis if aborted/unavailable.
   */
  analyzePosition?(fen: string, depth?: number, signal?: AbortSignal): Promise<PositionAnalysis>;
  dispose(): void;
}

/**
 * Parses a UCI `info ... score cp <n>` or `info ... score mate <n>` line into centipawns
 * from the side-to-move's perspective. Returns null if the line has no score token.
 */
export function parseUciScoreToCp(line: string): number | null {
  const cpMatch = /\bscore\s+cp\s+(-?\d+)/.exec(line);
  if (cpMatch) {
    return Number.parseInt(cpMatch[1], 10);
  }
  const mateMatch = /\bscore\s+mate\s+(-?\d+)/.exec(line);
  if (mateMatch) {
    const movesToMate = Number.parseInt(mateMatch[1], 10);
    return movesToMate >= 0 ? 10000 - movesToMate * 10 : -10000 - movesToMate * 10;
  }
  return null;
}

/** Minimal message port abstraction over a Web Worker for UCI communication and testing. */
export interface UciPort {
  postMessage(command: string): void;
  onMessage(handler: (line: string) => void): void;
  onError?(handler: (err: unknown) => void): void;
  terminate(): void;
}

interface RandomEngineOptions {
  /** Fake thinking time, so the reply does not appear instantly. */
  delayMs?: number;
  /** Injectable for tests. Returns a number in [0, 1). */
  random?: () => number;
}

/** Fallback/test opponent: plays a random legal move. */
export function createRandomEngine({ delayMs = 600, random = Math.random }: RandomEngineOptions = {}): ChessEngine {
  const timers = new Set<ReturnType<typeof setTimeout>>();

  return {
    getBestMove(fen) {
      return new Promise<string>((resolve, reject) => {
        const moves = new Chess(fen).moves({ verbose: true });
        if (moves.length === 0) {
          reject(new Error('No legal moves'));
          return;
        }
        const move = moves[Math.floor(random() * moves.length)];
        const timer = setTimeout(() => {
          timers.delete(timer);
          resolve(`${move.from}${move.to}${move.promotion ?? ''}`);
        }, delayMs);
        timers.add(timer);
      });
    },
    getHintMove(fen) {
      const moves = new Chess(fen).moves({ verbose: true });
      if (moves.length === 0) return Promise.resolve(null);
      const move = moves[Math.floor(random() * moves.length)];
      return Promise.resolve(`${move.from}${move.to}${move.promotion ?? ''}`);
    },
    dispose() {
      timers.forEach(clearTimeout);
      timers.clear();
    }
  };
}

/** Creates a browser Web Worker running Stockfish 19 Lite single-threaded WASM. */
function createBrowserStockfishPort(): UciPort {
  const wasmHref = new URL(workerWasmUrl, window.location.href).href;
  const worker = new Worker(`${workerJsUrl}#${encodeURIComponent(wasmHref)}`);
  return {
    postMessage(command: string) {
      worker.postMessage(command);
    },
    onMessage(handler: (line: string) => void) {
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data === 'string') handler(event.data);
      };
    },
    onError(handler: (err: unknown) => void) {
      worker.onerror = (event) => handler(event);
    },
    terminate() {
      worker.terminate();
    }
  };
}

export interface StockfishEngineOptions {
  initialDifficulty?: DifficultyPreset;
  /** Injectable port factory for unit tests. Defaults to the browser Web Worker. */
  createPort?: () => UciPort;
  /** Minimum visual thinking time (ms) when shallow depth searches return immediately. */
  respectMinDelay?: boolean;
}

/**
 * UCI Stockfish engine wrapper. Lazily initializes the worker on first command,
 * applies difficulty presets (`Skill Level`, `UCI_LimitStrength`, `UCI_Elo`, `depth`/`movetime`),
 * and falls back to `createRandomEngine` if the worker fails in unsupported environments.
 */
export function createStockfishEngine(options: StockfishEngineOptions = {}): ChessEngine {
  let preset = options.initialDifficulty ?? getDifficultyPreset(DEFAULT_DIFFICULTY_ID);
  const respectMinDelay = options.respectMinDelay ?? true;
  const fallback = createRandomEngine();

  let port: UciPort | null = null;
  let uciReadyPromise: Promise<void> | null = null;
  let searchQueue: Promise<unknown> = Promise.resolve();
  let lastEvalCp: number | undefined;
  let recordEvalScore = true;
  let disposed = false;
  let broken = false;

  const lineListeners = new Set<(line: string) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const waitForLine = (predicate: (line: string) => boolean): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      if (disposed || broken) {
        reject(new Error('Engine unavailable'));
        return;
      }
      const listener = (line: string) => {
        if (predicate(line)) {
          lineListeners.delete(listener);
          resolve(line);
        }
      };
      lineListeners.add(listener);
    });

  const ensureInitialized = (): Promise<void> => {
    if (uciReadyPromise) return uciReadyPromise;
    uciReadyPromise = new Promise<void>((resolve, reject) => {
      try {
        const createPort = options.createPort ?? createBrowserStockfishPort;
        port = createPort();
        port.onMessage((raw) => {
          const line = raw.trim();
          const parsedScore = parseUciScoreToCp(line);
          if (parsedScore !== null && recordEvalScore) {
            lastEvalCp = parsedScore;
          }
          for (const listener of [...lineListeners]) listener(line);
        });
        port.onError?.((err) => {
          broken = true;
          reject(err instanceof Error ? err : new Error('Stockfish worker error'));
        });
        waitForLine((line) => line === 'uciok')
          .then(() => {
            port?.postMessage('ucinewgame');
            resolve();
          })
          .catch(reject);
        port.postMessage('uci');
      } catch (err) {
        broken = true;
        reject(err instanceof Error ? err : new Error('Failed to start Stockfish worker'));
      }
    });
    return uciReadyPromise;
  };

  const runUciSearch = (
    fen: string,
    configureCommands: readonly string[],
    goCommand: string,
    shouldRecordEval: boolean,
    signal?: AbortSignal
  ): Promise<PositionAnalysis> => {
    const task = searchQueue.then(async (): Promise<PositionAnalysis> => {
      if (signal?.aborted) return { bestMove: null, evalCp: undefined };
      await ensureInitialized();
      if (disposed || !port) throw new Error('Engine disposed');
      if (signal?.aborted) return { bestMove: null, evalCp: undefined };

      recordEvalScore = shouldRecordEval;
      for (const cmd of configureCommands) {
        port.postMessage(cmd);
      }
      const readyPromise = waitForLine((line) => line === 'readyok');
      port.postMessage('isready');
      await readyPromise;

      if (disposed || !port || signal?.aborted) {
        return { bestMove: null, evalCp: undefined };
      }

      let searchEvalCp: number | undefined;
      const scoreListener = (line: string) => {
        const parsed = parseUciScoreToCp(line);
        if (parsed !== null) searchEvalCp = parsed;
      };
      lineListeners.add(scoreListener);

      const onAbort = () => {
        try {
          port?.postMessage('stop');
        } catch {
          // ignore if worker already closed
        }
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        const bestMovePromise = waitForLine((line) => line.startsWith('bestmove '));
        port.postMessage(`position fen ${fen}`);
        port.postMessage(goCommand);

        const bestLine = await bestMovePromise;
        if (signal?.aborted) return { bestMove: null, evalCp: undefined };
        const match = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/.exec(bestLine);
        return { bestMove: match ? match[1] : null, evalCp: searchEvalCp };
      } finally {
        lineListeners.delete(scoreListener);
        signal?.removeEventListener('abort', onAbort);
      }
    });
    searchQueue = task.catch(() => undefined);
    return task;
  };

  return {
    setDifficulty(nextPreset: DifficultyPreset) {
      preset = nextPreset;
    },

    getLastEvalCp() {
      return lastEvalCp;
    },

    async getBestMove(fen: string): Promise<string> {
      const legalMoves = new Chess(fen).moves({ verbose: true });
      if (legalMoves.length === 0) {
        throw new Error('No legal moves');
      }

      if (broken) {
        return fallback.getBestMove(fen);
      }

      try {
        const activePreset = preset;
        const startTime = Date.now();

        const { bestMove: uci } = await runUciSearch(
          fen,
          toUciConfigureCommands(activePreset),
          toUciGoCommand(activePreset),
          true
        );
        if (!uci) {
          return fallback.getBestMove(fen);
        }

        const elapsed = Date.now() - startTime;
        const remainingDelay = respectMinDelay && activePreset.depth !== undefined
          ? Math.max(0, activePreset.movetimeMs - elapsed)
          : 0;

        if (remainingDelay > 0) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              timers.delete(timer);
              resolve();
            }, remainingDelay);
            timers.add(timer);
          });
        }

        return uci;
      } catch {
        broken = true;
        return fallback.getBestMove(fen);
      }
    },

    async getHintMove(fen: string): Promise<string | null> {
      const legalMoves = new Chess(fen).moves({ verbose: true });
      if (legalMoves.length === 0) {
        return null;
      }

      // A random fallback move would be presented to the user as a "best move", so report no hint instead.
      if (broken) return null;

      try {
        const { bestMove } = await runUciSearch(
          fen,
          [
            'setoption name Skill Level value 20',
            'setoption name UCI_LimitStrength value false'
          ],
          'go depth 6',
          false
        );
        return bestMove;
      } catch {
        broken = true;
        return null;
      }
    },

    async analyzePosition(
      fen: string,
      depth: number = REVIEW_ANALYSIS_DEPTH,
      signal?: AbortSignal
    ): Promise<PositionAnalysis> {
      if (signal?.aborted || broken) {
        return { bestMove: null, evalCp: undefined };
      }

      let legalMoves;
      try {
        legalMoves = new Chess(fen).moves({ verbose: true });
      } catch {
        return { bestMove: null, evalCp: undefined };
      }
      if (legalMoves.length === 0) {
        return { bestMove: null, evalCp: undefined };
      }

      const safeDepth = Math.max(1, Math.floor(depth));
      try {
        return await runUciSearch(
          fen,
          [
            'setoption name Skill Level value 20',
            'setoption name UCI_LimitStrength value false'
          ],
          `go depth ${safeDepth}`,
          false,
          signal
        );
      } catch {
        broken = true;
        return { bestMove: null, evalCp: undefined };
      }
    },

    dispose() {
      disposed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      lineListeners.clear();
      fallback.dispose();
      if (port) {
        try {
          port.postMessage('quit');
        } catch {
          // ignore if worker already closed
        }
        port.terminate();
        port = null;
      }
    }
  };
}

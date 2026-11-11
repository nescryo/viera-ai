import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIFFICULTY_ID,
  DIFFICULTY_PRESETS,
  getDifficultyPreset,
  toUciConfigureCommands,
  toUciGoCommand
} from '../src/services/chess/difficulty';
import { createStockfishEngine } from '../src/services/chess/engine';
import type { UciPort } from '../src/services/chess/engine';

describe('difficulty presets', () => {
  it('defines five ordered presets from beginner to master', () => {
    expect(DIFFICULTY_PRESETS.map((p) => p.id)).toEqual([
      'beginner',
      'casual',
      'intermediate',
      'advanced',
      'master'
    ]);
    expect(getDifficultyPreset(DEFAULT_DIFFICULTY_ID).id).toBe('casual');
  });

  it('uses Skill Level + shallow depth for lower human-equivalent levels', () => {
    const beginner = getDifficultyPreset('beginner');
    expect(toUciConfigureCommands(beginner)).toEqual([
      'setoption name Skill Level value 0',
      'setoption name UCI_LimitStrength value false'
    ]);
    expect(toUciGoCommand(beginner)).toBe('go depth 1');

    const intermediate = getDifficultyPreset('intermediate');
    expect(toUciConfigureCommands(intermediate)).toEqual([
      'setoption name Skill Level value 6',
      'setoption name UCI_LimitStrength value false'
    ]);
    expect(toUciGoCommand(intermediate)).toBe('go depth 4');
  });

  it('uses UCI_LimitStrength and UCI_Elo for advanced and full movetime for master', () => {
    const advanced = getDifficultyPreset('advanced');
    expect(toUciConfigureCommands(advanced)).toEqual([
      'setoption name Skill Level value 14',
      'setoption name UCI_LimitStrength value true',
      'setoption name UCI_Elo value 1600'
    ]);
    expect(toUciGoCommand(advanced)).toBe('go movetime 650');

    const master = getDifficultyPreset('master');
    expect(toUciConfigureCommands(master)).toEqual([
      'setoption name Skill Level value 20',
      'setoption name UCI_LimitStrength value false'
    ]);
    expect(toUciGoCommand(master)).toBe('go movetime 1000');
  });
});

describe('createStockfishEngine', () => {
  it('performs the UCI handshake, applies difficulty options, and parses bestmove', async () => {
    const sent: string[] = [];
    let emit: (line: string) => void = () => {};
    let terminated = false;

    const fakePort: UciPort = {
      postMessage(cmd) {
        sent.push(cmd);
        if (cmd === 'uci') queueMicrotask(() => emit('uciok'));
        if (cmd === 'isready') queueMicrotask(() => emit('readyok'));
        if (cmd.startsWith('go ')) {
          queueMicrotask(() => {
            emit('info depth 2 score cp 18 pv e7e5');
            emit('bestmove e7e5 ponder g1f3');
          });
        }
      },
      onMessage(handler) {
        emit = handler;
      },
      terminate() {
        terminated = true;
      }
    };

    const engine = createStockfishEngine({
      initialDifficulty: getDifficultyPreset('beginner'),
      createPort: () => fakePort,
      respectMinDelay: false
    });

    const startFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const move1 = await engine.getBestMove(startFen);
    expect(move1).toBe('e7e5');
    expect(sent).toContain('uci');
    expect(sent).toContain('ucinewgame');
    expect(sent).toContain('setoption name Skill Level value 0');
    expect(sent).toContain('go depth 1');

    engine.setDifficulty?.(getDifficultyPreset('advanced'));
    const move2 = await engine.getBestMove(startFen);
    expect(move2).toBe('e7e5');
    expect(sent).toContain('setoption name UCI_Elo value 1600');
    expect(sent).toContain('go movetime 650');
    expect(engine.getLastEvalCp?.()).toBe(18);

    // Hint search uses full strength depth 6 without overwriting DeepSeek-chan's lastEvalCp
    const originalPost = fakePort.postMessage.bind(fakePort);
    fakePort.postMessage = (cmd: string) => {
      if (cmd === 'go depth 6') {
        sent.push(cmd);
        queueMicrotask(() => {
          emit('info depth 6 score cp -150 pv g1f3');
          emit('bestmove g1f3');
        });
        return;
      }
      originalPost(cmd);
    };

    const hintMove = await engine.getHintMove?.(startFen);
    expect(hintMove).toBe('g1f3');
    expect(engine.getLastEvalCp?.()).toBe(18);

    engine.dispose();
    expect(terminated).toBe(true);
  });
});

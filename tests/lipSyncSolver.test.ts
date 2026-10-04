import { describe, it, expect } from 'vitest';
import {
  LipSyncSolver,
  resolveLipSyncSource,
  SILENT_VISEMES
} from '../src/components/3d/animation/lipSyncSolver';
import type { LipSyncFrame, LipSyncSource, VisemeInput } from '../src/components/3d/animation/lipSyncSolver';

const FPS = 60;
const DT = 1 / FPS;

/** One phase of a simulated TTS reply. */
interface Phase {
  name: string;
  seconds: number;
  isWebAudioPlaying: boolean;
  isWebSpeechSpeaking: boolean;
  /** Viseme the detector emits at a given time inside the phase. */
  viseme: (t: number) => VisemeInput;
}

interface LoggedFrame extends LipSyncFrame {
  t: number;
  phase: string;
  source: LipSyncSource;
}

const vowel = (key: 'a' | 'i' | 'u' | 'e' | 'o', volume = 0.3): VisemeInput => ({ ...SILENT_VISEMES, [key]: 1, volume });
const closed = (volume: number): VisemeInput => ({ ...SILENT_VISEMES, closed: 1, volume: volume * 0.5 });

/** Fake "ka-ki-ku-ke-ko" speech at a given loudness: consonant closures and vowels every 90 ms. */
const speechAt = (volume: number) => (t: number): VisemeInput => {
  const slot = Math.floor(t / 0.09);
  if (slot % 2 === 0) return closed(volume);
  const vowels = ['a', 'i', 'u', 'e', 'o'] as const;
  return vowel(vowels[(slot >> 1) % vowels.length], volume);
};
const speechPattern = speechAt(0.3);

/** Runs the solver through a list of phases and records every frame. */
function simulate(phases: Phase[], pickSource: (p: Phase) => LipSyncSource): LoggedFrame[] {
  const solver = new LipSyncSolver();
  const frames: LoggedFrame[] = [];
  let time = 0;
  for (const phase of phases) {
    const steps = Math.round(phase.seconds * FPS);
    for (let s = 0; s < steps; s++) {
      const local = s * DT;
      const source = pickSource(phase);
      const out = solver.step(source, phase.viseme(local), DT, time);
      frames.push({ ...out, t: time, phase: phase.name, source });
      time += DT;
    }
  }
  return frames;
}

/** Prints a compact frame log (every Nth frame) so mouth motion can be read in the test output. */
function printLog(title: string, frames: LoggedFrame[], every = 6): void {
  const rows = frames
    .filter((_, idx) => idx % every === 0)
    .map((f) => {
      const r = (v: number) => v.toFixed(2);
      // Same gain the facial engine applies: calm ~0.75x, excited ~1.35x.
      const effective = Math.min(1, f.openness * (0.75 + 0.6 * f.intensity));
      return `${f.t.toFixed(2)}s ${f.phase.padEnd(11)} ${f.source.padEnd(6)} open=${r(f.openness)} energy=${r(f.intensity)} mouth=${r(effective)} [${'#'.repeat(Math.round(effective * 20)).padEnd(20, '.')}] a=${r(f.a)} i=${r(f.i)} u=${r(f.u)} e=${r(f.e)} o=${r(f.o)}`;
    });
  console.log(`\n=== ${title} ===\n${rows.join('\n')}`);
}

const maxOpenness = (frames: LoggedFrame[], phase: string) =>
  Math.max(...frames.filter((f) => f.phase === phase).map((f) => f.openness));

/** A typical Fish Audio / OpenAI reply: synthesis wait, speech, gap between chunks, speech, end. */
const audioReply: Phase[] = [
  { name: 'synthesize', seconds: 0.8, isWebAudioPlaying: false, isWebSpeechSpeaking: false, viseme: () => SILENT_VISEMES },
  { name: 'speech-1', seconds: 0.9, isWebAudioPlaying: true, isWebSpeechSpeaking: false, viseme: speechPattern },
  { name: 'chunk-gap', seconds: 0.4, isWebAudioPlaying: false, isWebSpeechSpeaking: false, viseme: () => SILENT_VISEMES },
  { name: 'speech-2', seconds: 0.6, isWebAudioPlaying: true, isWebSpeechSpeaking: false, viseme: speechPattern },
  { name: 'ended', seconds: 0.4, isWebAudioPlaying: false, isWebSpeechSpeaking: false, viseme: () => SILENT_VISEMES }
];

describe('resolveLipSyncSource', () => {
  it('uses real audio while Web Audio is playing', () => {
    expect(resolveLipSyncSource({ isWebAudioPlaying: true, isWebSpeechSpeaking: false })).toBe('audio');
  });

  it('uses the procedural pattern only while Web Speech is audibly speaking', () => {
    expect(resolveLipSyncSource({ isWebAudioPlaying: false, isWebSpeechSpeaking: true })).toBe('speech');
  });

  it('returns none while audio is still being synthesized', () => {
    expect(resolveLipSyncSource({ isWebAudioPlaying: false, isWebSpeechSpeaking: false })).toBe('none');
  });
});

describe('LipSyncSolver timeline', () => {
  it('reproduces the old bug: falling back to the procedural pattern before audio gapes the mouth', () => {
    // Old logic: whenever "speaking" and Web Audio was not playing, it used the Web Speech pattern.
    const frames = simulate(audioReply, (p) => (p.isWebAudioPlaying ? 'audio' : 'speech'));
    printLog('OLD logic (bug)', frames);
    expect(maxOpenness(frames, 'synthesize')).toBeGreaterThan(0.5);
  });

  it('keeps the mouth closed before audio, opens with speech, and closes in gaps and at the end', () => {
    const frames = simulate(audioReply, (p) => resolveLipSyncSource(p));
    printLog('NEW logic', frames);

    expect(maxOpenness(frames, 'synthesize')).toBe(0);
    expect(maxOpenness(frames, 'speech-1')).toBeGreaterThan(0.5);
    expect(maxOpenness(frames, 'speech-2')).toBeGreaterThan(0.5);

    // Gap / end: the mouth must settle closed (allow a short release at the start of the phase).
    const settled = (phase: string) => frames.filter((f) => f.phase === phase).slice(-6);
    for (const f of [...settled('chunk-gap'), ...settled('ended')]) {
      expect(f.openness).toBeLessThan(0.05);
    }
  });

  it('dips toward closed on consonants during speech instead of hanging open', () => {
    const frames = simulate(audioReply, (p) => resolveLipSyncSource(p)).filter((f) => f.phase === 'speech-1');
    const openings = frames.map((f) => f.openness);
    const min = Math.min(...openings.slice(10));
    const max = Math.max(...openings.slice(10));
    expect(max - min).toBeGreaterThan(0.3);
  });

  it('is frame-rate independent (30 fps and 120 fps end up close)', () => {
    const run = (fps: number) => {
      const solver = new LipSyncSolver();
      let out = solver.step('audio', vowel('a'), 1 / fps, 0);
      for (let k = 1; k < fps * 0.2; k++) out = solver.step('audio', vowel('a'), 1 / fps, k / fps);
      return out.openness;
    };
    expect(Math.abs(run(30) - run(120))).toBeLessThan(0.05);
  });

  it('opens the mouth wider when the voice gets excited/louder than usual', () => {
    const phases: Phase[] = [
      { name: 'calm', seconds: 2.0, isWebAudioPlaying: true, isWebSpeechSpeaking: false, viseme: speechAt(0.25) },
      { name: 'excited', seconds: 1.0, isWebAudioPlaying: true, isWebSpeechSpeaking: false, viseme: speechAt(0.55) },
      { name: 'calm-again', seconds: 1.5, isWebAudioPlaying: true, isWebSpeechSpeaking: false, viseme: speechAt(0.25) }
    ];
    const frames = simulate(phases, (p) => resolveLipSyncSource(p));
    printLog('Calm -> excited -> calm', frames);

    const avg = (phase: string, pick: (f: LoggedFrame) => number) => {
      const xs = frames.filter((f) => f.phase === phase).slice(-30).map(pick);
      return xs.reduce((s, x) => s + x, 0) / xs.length;
    };
    const calm = avg('calm', (f) => f.intensity);
    const excited = avg('excited', (f) => f.intensity);
    const calmAgain = avg('calm-again', (f) => f.intensity);

    expect(excited).toBeGreaterThan(calm + 0.25);
    expect(calmAgain).toBeLessThan(excited - 0.15);
  });
});

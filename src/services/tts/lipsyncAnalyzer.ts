import { Lipsync, VISEMES } from 'wawa-lipsync';

/**
 * Lip-sync viseme weights consumed by the facial expression engine.
 * Keyed by the Japanese MMD vowel/mouth morphs used by the character models.
 */
export interface VisemeWeights {
  /** あ — open mouth */
  a: number;
  /** い — spread mouth */
  i: number;
  /** う — rounded narrow mouth */
  u: number;
  /** え — half-spread mouth */
  e: number;
  /** お — rounded open mouth */
  o: number;
  /** Closed consonant hint (ん / small mouth) */
  closed: number;
  /** Raw speech loudness from the analyser (0.0 to 1.0), used for intensity. */
  volume: number;
}

const SILENT_WEIGHTS: VisemeWeights = { a: 0, i: 0, u: 0, e: 0, o: 0, closed: 0, volume: 0 };

/**
 * Maps a wawa-lipsync VISEME to Firefly's あいうえお morph weights.
 * Vowel visemes map directly; plosives/fricatives bias toward a closed/narrow
 * mouth so consonants read as brief closures rather than an open vowel.
 */
function visemeToWeights(viseme: VISEMES): Omit<VisemeWeights, 'volume'> {
  switch (viseme) {
    case VISEMES.aa:
      return { a: 1.0, i: 0, u: 0, e: 0.15, o: 0, closed: 0 };
    case VISEMES.E:
      return { a: 0.2, i: 0.15, u: 0, e: 1.0, o: 0, closed: 0 };
    case VISEMES.I:
      return { a: 0, i: 1.0, u: 0, e: 0.2, o: 0, closed: 0 };
    case VISEMES.O:
      return { a: 0.1, i: 0, u: 0.2, e: 0, o: 1.0, closed: 0 };
    case VISEMES.U:
      return { a: 0, i: 0, u: 1.0, e: 0, o: 0.25, closed: 0 };
    // Plosives: mouth briefly closes
    case VISEMES.PP:
    case VISEMES.DD:
    case VISEMES.kk:
    case VISEMES.nn:
      return { a: 0.1, i: 0, u: 0, e: 0, o: 0, closed: 1.0 };
    // Fricatives: narrow mouth, slight spread
    case VISEMES.FF:
    case VISEMES.TH:
    case VISEMES.CH:
    case VISEMES.SS:
    case VISEMES.RR:
      return { a: 0, i: 0.4, u: 0.2, e: 0.2, o: 0, closed: 0.5 };
    case VISEMES.sil:
    default:
      return { ...SILENT_WEIGHTS };
  }
}

/**
 * Wraps the wawa-lipsync engine so it analyses our existing Web Audio graph
 * (AudioBufferSourceNode + DSP) instead of an HTMLMediaElement.
 *
 * wawa-lipsync normally creates its own AudioContext and connects an
 * HTMLMediaElement via createMediaElementSource. Our TTS pipeline decodes and
 * plays AudioBuffers through a custom DSP chain, so we instead:
 *   1. Reuse our AudioContext for the Lipsync instance (nodes from different
 *      contexts cannot be connected together).
 *   2. Expose the AnalyserNode it reads from so the playback queue can tee the
 *      post-DSP signal into it.
 */
export class LipsyncAnalyzer {
  private lipsync: Lipsync | null = null;
  private analyserNode: AnalyserNode | null = null;
  private boundContext: AudioContext | null = null;

  /**
   * Lazily creates (or rebinds) the analyser for the given AudioContext and
   * returns the AnalyserNode the caller should feed audio into.
   */
  public getAnalyserFor(ctx: AudioContext): AnalyserNode {
    if (this.lipsync && this.analyserNode && this.boundContext === ctx) {
      return this.analyserNode;
    }

    const lipsync = new Lipsync({ fftSize: 2048, historySize: 10 });

    // Rebind the engine's internal AudioContext/AnalyserNode to our context so
    // our post-DSP graph can connect into the same audio graph. These fields are
    // private in the library; we override them through a narrow typed cast.
    const internal = lipsync as unknown as {
      audioContext: AudioContext;
      analyser: AnalyserNode;
      dataArray: Uint8Array;
      sampleRate: number;
      binWidth: number;
    };

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;

    internal.audioContext = ctx;
    internal.analyser = analyser;
    internal.dataArray = new Uint8Array(analyser.frequencyBinCount);
    internal.sampleRate = ctx.sampleRate;
    internal.binWidth = ctx.sampleRate / analyser.fftSize;

    this.lipsync = lipsync;
    this.analyserNode = analyser;
    this.boundContext = ctx;
    return analyser;
  }

  /**
   * Analyses the current audio frame and returns the active viseme weights.
   * Returns silent weights when no analyser is bound or audio is silent.
   */
  public analyze(): VisemeWeights {
    if (!this.lipsync) return { ...SILENT_WEIGHTS };
    this.lipsync.processAudio();
    const shape = visemeToWeights(this.lipsync.viseme);
    // wawa-lipsync only picks a viseme; its band-averaged volume tells us how
    // loud/energetic the speech is so the mouth can open wider on excited lines.
    const volume = this.lipsync.features?.volume ?? 0;
    return { ...shape, volume: Math.max(0, Math.min(1, volume)) };
  }
}

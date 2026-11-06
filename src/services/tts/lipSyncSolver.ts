/**
 * Where the current lip-sync signal comes from:
 * - 'audio':  Web Audio playback is audible (Fish Audio / OpenAI); use real visemes.
 * - 'speech': the browser Web Speech fallback is audibly speaking (no analyser);
 *             use a procedural mouth pattern.
 * - 'none':   nothing audible (still synthesizing, gap between chunks, or idle);
 *             the mouth must close.
 */
export type LipSyncSource = 'audio' | 'speech' | 'none';

/** Raw viseme weights for the あいうえお morphs plus a closed-consonant hint and loudness. */
export interface VisemeInput {
  a: number;
  i: number;
  u: number;
  e: number;
  o: number;
  closed: number;
  /** Raw speech loudness (0.0 to 1.0). */
  volume: number;
}

/** Smoothed per-frame lip-sync output consumed by the facial expression engine. */
export interface LipSyncFrame {
  a: number;
  i: number;
  u: number;
  e: number;
  o: number;
  closed: number;
  /** Overall mouth openness envelope (0 = closed, 1 = fully open). */
  openness: number;
  /**
   * Speech energy relative to the speaker's recent average (0 = calm/quiet,
   * 1 = excited/loud). Lets the mouth open wider on energetic lines.
   */
  intensity: number;
}

export const SILENT_VISEMES: VisemeInput = { a: 0, i: 0, u: 0, e: 0, o: 0, closed: 0, volume: 0 };

/**
 * Smoothing rate the facial engine applies to mouth morphs on top of the solver.
 * Shared here so the latency test measures the full chain.
 */
export const MOUTH_MORPH_RATE = 55;

/** Neutral intensity used when no loudness is available (Web Speech) or before any audio. */
const NEUTRAL_INTENSITY = 0.4;

/**
 * Picks the lip-sync source from what is actually audible right now.
 * "Speaking" state alone is not enough: it turns true as soon as a reply starts,
 * while the TTS audio is still being synthesized and nothing is audible yet.
 */
export function resolveLipSyncSource(state: { isWebAudioPlaying: boolean; isWebSpeechSpeaking: boolean }): LipSyncSource {
  if (state.isWebAudioPlaying) return 'audio';
  if (state.isWebSpeechSpeaking) return 'speech';
  return 'none';
}

/** Frame-rate independent exponential smoothing factor. */
const smoothFactor = (rate: number, delta: number): number => 1 - Math.exp(-rate * delta);

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Pure lip-sync solver: turns a viseme signal into smoothed mouth weights.
 * Holds only numeric state, so it can be unit-tested without Three.js or audio.
 */
export class LipSyncSolver {
  private vowels = { a: 0, i: 0, u: 0, e: 0, o: 0 };
  private envelope = 0;
  private intensity = NEUTRAL_INTENSITY;
  /** Slow running average of phrase loudness; null until the first voiced frame. */
  private averageVolume: number | null = null;
  /** Phrase-level loudness held through consonants. */
  private phraseLevel = 0;
  /** Seconds of voiced audio seen so far (drives baseline warm-up). */
  private voicedTime = 0;

  /**
   * Advances the solver by one frame.
   * @param source Where the signal comes from this frame.
   * @param visemes Raw viseme weights and loudness (only used when source is 'audio').
   * @param delta Frame delta in seconds (clamped by the caller).
   * @param time Elapsed time in seconds (drives the procedural 'speech' pattern).
   */
  public step(source: LipSyncSource, visemes: VisemeInput, delta: number, time: number): LipSyncFrame {
    const target = this.resolveTarget(source, visemes, time);

    // Per-vowel smoothing: fast attack tracks onsets, slower release settles.
    for (const key of ['a', 'i', 'u', 'e', 'o'] as const) {
      const prev = this.vowels[key];
      const rate = target[key] > prev ? 55 : 22;
      this.vowels[key] = prev + (target[key] - prev) * smoothFactor(rate, delta);
    }

    // Openness envelope dips toward closed on consonants so the mouth doesn't hang open.
    const peak = Math.max(this.vowels.a, this.vowels.i, this.vowels.u, this.vowels.e, this.vowels.o);
    const rawOpenness = clamp01(peak - target.closed * 0.6);
    const envRate = rawOpenness > this.envelope ? 55 : 20;
    this.envelope += (rawOpenness - this.envelope) * smoothFactor(envRate, delta);

    this.updateIntensity(source, target.volume, delta);

    return {
      ...this.vowels,
      closed: target.closed,
      openness: Math.max(0, this.envelope),
      intensity: this.intensity
    };
  }

  /** Clears all state back to a closed mouth. */
  public reset(): void {
    this.vowels = { a: 0, i: 0, u: 0, e: 0, o: 0 };
    this.envelope = 0;
    this.intensity = NEUTRAL_INTENSITY;
    this.averageVolume = null;
    this.phraseLevel = 0;
    this.voicedTime = 0;
  }

  /**
   * Tracks how energetic the speech is. Loudness is compared to a slow running
   * average so it adapts to each provider/voice level: a line louder than the
   * speaker's usual level reads as excited (wider mouth), a softer one as calm.
   */
  private updateIntensity(source: LipSyncSource, volume: number, delta: number): void {
    let targetIntensity = this.intensity;

    if (source === 'audio' && volume > 0.02) {
      // Phrase-level loudness: rises fast, holds through consonants (slow release),
      // so it reflects how energetic the line is rather than each syllable.
      const shortRate = volume > this.phraseLevel ? 12 : 3;
      this.phraseLevel += (volume - this.phraseLevel) * smoothFactor(shortRate, delta);

      // Long-term baseline (~6 s) of the speaker's usual phrase loudness. It adapts
      // quickly during the first second of voice so the opening line isn't misread
      // as "excited" just because the baseline hasn't caught up yet.
      this.voicedTime += delta;
      const baselineRate = this.voicedTime < 1.0 ? 4 : 0.15;
      this.averageVolume = this.averageVolume === null
        ? this.phraseLevel
        : this.averageVolume + (this.phraseLevel - this.averageVolume) * smoothFactor(baselineRate, delta);

      const relative = this.phraseLevel / Math.max(this.averageVolume, 0.05);
      // relative 0.8x -> 0, 1.0x (usual) -> ~0.3, 1.5x and louder -> 1.
      const relativeEnergy = clamp01((relative - 0.8) / 0.7);
      // A little absolute loudness keeps a consistently loud voice from reading as "average".
      const absoluteEnergy = clamp01(this.phraseLevel / 0.5);
      targetIntensity = 0.7 * relativeEnergy + 0.3 * absoluteEnergy;
    } else if (source === 'speech') {
      targetIntensity = NEUTRAL_INTENSITY;
    }
    // 'none' / silent audio frames: hold the last intensity so gaps don't reset the vibe.

    // Rise quickly on energetic bursts, settle back more slowly.
    const rate = targetIntensity > this.intensity ? 14 : 5;
    this.intensity += (targetIntensity - this.intensity) * smoothFactor(rate, delta);
  }

  private resolveTarget(source: LipSyncSource, visemes: VisemeInput, time: number): VisemeInput {
    if (source === 'audio') return visemes;
    if (source === 'none') return SILENT_VISEMES;

    // 'speech': procedural pattern for Web Speech (no analyser available).
    const organic = Math.sin(time * 3.1) < -0.3 ? 0.12 : 1.0;
    return {
      a: (0.5 + 0.5 * Math.sin(time * 10.5)) * organic,
      i: Math.abs(Math.sin(time * 11.2)) * 0.5 * organic,
      u: Math.abs(Math.sin(time * 5.0)) * 0.35 * organic,
      e: Math.abs(Math.cos(time * 17.4)) * 0.4 * organic,
      o: Math.abs(Math.sin(time * 6.8)) * 0.5 * organic,
      closed: 0,
      volume: 0
    };
  }
}

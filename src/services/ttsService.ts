import type { Persona, ApiConfig } from '../types';

export interface TTSBoundaryEvent {
  name: string;
  charIndex: number;
  charLength?: number;
  word?: string;
}

/**
 * Modern TTS Service (Clean Slate Foundation)
 * 
 * Legacy monolithic dictionary, translation API (mymemory), and fake wrappers have been dismantled.
 * Ready for the AIRI-inspired modular streaming chunker and ordered playback queue.
 */
class TTSService {
  private audioCtx: AudioContext | null = null;
  private currentBufferSource: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  private currentSpeechSessionId: number = 0;

  constructor() {
    // AudioContext is initialized lazily upon user interaction to comply with browser autoplay policies.
  }

  /**
   * Lazily initializes and returns the shared Web Audio API AudioContext.
   */
  public getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Generates a soft studio room impulse response for natural vocal acoustics.
   */
  public createImpulseResponse(ctx: AudioContext, duration: number = 0.22, decay: number = 2.2): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      const dec = Math.pow(n / length, decay);
      left[i] = (Math.random() * 2 - 1) * dec * 0.12;
      right[i] = (Math.random() * 2 - 1) * dec * 0.12;
    }
    return impulse;
  }

  /**
   * Prepares and sanitizes text for speech synthesis:
   * - Strips XML/HTML tags (e.g. <ja>, <think>)
   * - Strips markdown asterisks, stage directions (*sighs*), and emotion brackets ([happy])
   * - Strips emojis and excess symbol markers
   */
  public prepareTextForSpeech(text: string): string {
    if (!text) return '';
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/\*.*?\*/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/[`#~_>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Synthesizes and plays speech.
   * Clean-slate stub: guarantees immediate zero-crash fallback while the modular engine is being assembled.
   */
  public speak(
    text: string, 
    _persona: Persona, 
    onStart?: () => void, 
    onEnd?: () => void,
    _onBoundary?: (event: TTSBoundaryEvent) => void,
    _apiConfig?: ApiConfig
  ): void {
    this.stop();

    const targetText = this.prepareTextForSpeech(text);
    if (!targetText) {
      if (onEnd) onEnd();
      return;
    }

    const sessionId = ++this.currentSpeechSessionId;
    this.isPlaying = true;
    if (onStart) onStart();

    // Clean placeholder until modular pipeline is hooked up
    setTimeout(() => {
      if (sessionId === this.currentSpeechSessionId) {
        this.isPlaying = false;
        if (onEnd) onEnd();
      }
    }, 300);
  }

  /**
   * Immediately stops any active audio playback and clears ongoing sessions.
   */
  public stop(): void {
    this.currentSpeechSessionId++;
    this.isPlaying = false;

    if (this.currentBufferSource) {
      try {
        this.currentBufferSource.onended = null;
        this.currentBufferSource.stop();
      } catch {
        // ignore already stopped source
      }
      this.currentBufferSource = null;
    }
  }

  /**
   * Returns whether audio is actively synthesizing or playing.
   */
  public isSpeaking(): boolean {
    return this.isPlaying || this.currentBufferSource !== null;
  }
}

export const ttsService = new TTSService();

/**
 * Ordered Playback Queue with Web Audio API DSP & Live Analyser
 * 
 * Guarantees that audio chunks fetched concurrently play strictly in sequence (0, 1, 2, ...).
 * Routes audio through warmth EQ, studio acoustic convolver reverb, and an AnalyserNode for lip-sync.
 */
export class PlaybackQueue {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;

  private nextSequenceToPlay = 0;
  private readyBuffers = new Map<number, { buffer: AudioBuffer; text?: string }>();
  private activeSessionToken = 0;
  private isSessionFlushed = false;
  private isCurrentlyPlaying = false;

  private onPlaybackStartCallback?: () => void;
  private onPlaybackEndCallback?: () => void;

  constructor() {}

  /**
   * Lazily initializes and returns the shared Web Audio AudioContext.
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
   * Returns the live AnalyserNode for 3D avatar lip-sync analysis.
   */
  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /**
   * Reads real-time vocal volume (0.0 to 1.0) from the AnalyserNode for procedural mouth opening.
   */
  public getAverageVolume(): number {
    if (!this.analyser || !this.isCurrentlyPlaying) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    // Focus on vocal speech frequencies (around 100Hz - 3500Hz)
    const voiceBins = Math.min(dataArray.length, 32);
    for (let i = 0; i < voiceBins; i++) {
      sum += dataArray[i];
    }
    return (sum / voiceBins) / 255;
  }

  /**
   * Generates a soft studio room impulse response for natural vocal acoustics.
   */
  private createImpulseResponse(ctx: AudioContext, duration: number = 0.22, decay: number = 2.2): AudioBuffer {
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
   * Starts a new speech session. Clears old queued chunks.
   */
  public startSession(onStart?: () => void, onEnd?: () => void): number {
    this.stop();
    this.activeSessionToken++;
    this.nextSequenceToPlay = 0;
    this.readyBuffers.clear();
    this.isSessionFlushed = false;
    this.isCurrentlyPlaying = false;
    this.onPlaybackStartCallback = onStart;
    this.onPlaybackEndCallback = onEnd;
    return this.activeSessionToken;
  }

  /**
   * Enqueues a decoded audio buffer for a given sequence.
   * If its sequence matches nextSequenceToPlay, playback starts immediately!
   */
  public enqueue(sequence: number, buffer: AudioBuffer, sessionToken: number, text?: string): void {
    if (sessionToken !== this.activeSessionToken) return;

    this.readyBuffers.set(sequence, { buffer, text });
    this.tryPlayNext(sessionToken);
  }

  /**
   * Marks that no more chunks will be generated for the current session.
   */
  public markFlushed(sessionToken: number): void {
    if (sessionToken !== this.activeSessionToken) return;
    this.isSessionFlushed = true;
    this.checkIfSessionFinished();
  }

  /**
   * Checks if the next in-order chunk is ready and begins playback.
   */
  private tryPlayNext(sessionToken: number): void {
    if (sessionToken !== this.activeSessionToken || this.isCurrentlyPlaying) return;

    const nextItem = this.readyBuffers.get(this.nextSequenceToPlay);
    if (!nextItem) {
      this.checkIfSessionFinished();
      return;
    }

    // Remove from pending map and start playback
    this.readyBuffers.delete(this.nextSequenceToPlay);
    this.playBuffer(nextItem.buffer, sessionToken);
  }

  /**
   * Routes and plays a single AudioBuffer through the Web Audio DSP graph.
   */
  private playBuffer(audioBuffer: AudioBuffer, sessionToken: number): void {
    try {
      const ctx = this.getAudioContext();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      this.currentSource = source;
      this.isCurrentlyPlaying = true;

      // Notify consumer on first playback chunk
      if (this.nextSequenceToPlay === 0 && this.onPlaybackStartCallback) {
        this.onPlaybackStartCallback();
      }

      // Initialize AnalyserNode if not already created
      if (!this.analyser) {
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;
      }

      // 1. Equalizer for warm vocal acoustics
      const lowEq = ctx.createBiquadFilter();
      lowEq.type = 'lowshelf';
      lowEq.frequency.value = 250;
      lowEq.gain.value = 2.2;

      const highEq = ctx.createBiquadFilter();
      highEq.type = 'highshelf';
      highEq.frequency.value = 5500;
      highEq.gain.value = -1.8;

      // 2. Soft Studio Acoustic Reverb
      const convolver = ctx.createConvolver();
      convolver.buffer = this.createImpulseResponse(ctx, 0.22, 2.2);

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.10; // 10% room acoustic blend

      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.95;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;

      // Wire Graph:
      // Source -> lowEq -> highEq
      source.connect(lowEq);
      lowEq.connect(highEq);

      // Dry path -> dryGain -> masterGain
      highEq.connect(dryGain);
      dryGain.connect(masterGain);

      // Wet path -> convolver -> wetGain -> masterGain
      highEq.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(masterGain);

      // Tee master into Analyser (for lip sync) and Destination (speakers)
      masterGain.connect(this.analyser);
      masterGain.connect(ctx.destination);

      source.onended = () => {
        if (sessionToken !== this.activeSessionToken) return;
        this.currentSource = null;
        this.isCurrentlyPlaying = false;
        this.nextSequenceToPlay++;
        // Play subsequent chunk in order immediately
        this.tryPlayNext(sessionToken);
      };

      // Start hardware audio playback scheduled 30ms ahead to prevent DAC click
      source.start(ctx.currentTime + 0.03);
    } catch (err) {
      console.warn('[Viera TTS] Error playing AudioBuffer, advancing sequence:', err);
      this.currentSource = null;
      this.isCurrentlyPlaying = false;
      this.nextSequenceToPlay++;
      this.tryPlayNext(sessionToken);
    }
  }

  private checkIfSessionFinished(): void {
    if (this.isSessionFlushed && !this.isCurrentlyPlaying && this.readyBuffers.size === 0) {
      if (this.onPlaybackEndCallback) {
        this.onPlaybackEndCallback();
      }
    }
  }

  /**
   * Immediately terminates active sound output and discards remaining queue.
   */
  public stop(): void {
    this.activeSessionToken++;
    this.readyBuffers.clear();
    this.isSessionFlushed = false;
    this.isCurrentlyPlaying = false;

    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
      } catch {
        // Source already terminated
      }
      this.currentSource = null;
    }
  }

  public isSpeaking(): boolean {
    return this.isCurrentlyPlaying || this.readyBuffers.size > 0;
  }
}

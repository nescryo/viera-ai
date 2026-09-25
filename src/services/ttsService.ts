import type { Persona, ApiConfig } from '../types';
import { TtsChunker, sanitizeTextForSpeech } from './tts/ttsChunker';
import { PlaybackQueue } from './tts/playbackQueue';
import { synthesizeUniversalAudio, speakWebSpeechFallback } from './tts/universalTtsEngine';
import type { TtsChunk, TtsStreamSession, TTSBoundaryEvent } from './tts/ttsTypes';

export type { TTSBoundaryEvent } from './tts/ttsTypes';

/**
 * Universal Modular TTS Service
 * 
 * Powered by:
 * - AIRI-inspired Sentence Chunker with Early Boost (sub-second audio playback)
 * - Sample-Exact Ordered Web Audio Playback Queue with Studio DSP Reverb & Warmth EQ
 * - Universal OpenAI-Compatible Audio Gateway (/v1/audio/speech) with Web Speech fallback
 */
class TTSService {
  private playbackQueue = new PlaybackQueue();
  private activeAbortController: AbortController | null = null;
  private isFallbackSpeaking = false;

  constructor() {}

  /**
   * Cleans and prepares raw text for speech synthesis
   */
  public prepareTextForSpeech(text: string): string {
    return sanitizeTextForSpeech(text);
  }

  /**
   * Shared Web Audio API context
   */
  public getAudioContext(): AudioContext {
    return this.playbackQueue.getAudioContext();
  }

  /**
   * Live vocal volume (0.0 to 1.0) for 3D avatar mouth lip sync
   */
  public getAverageVolume(): number {
    return this.playbackQueue.getAverageVolume();
  }

  /**
   * Synthesize and speak a full text message.
   * Chunks text with Early Boost pacing and streams ordered audio.
   */
  public async speak(
    text: string,
    persona: Persona,
    onStart?: () => void,
    onEnd?: () => void,
    _onBoundary?: (event: TTSBoundaryEvent) => void,
    apiConfig?: ApiConfig
  ): Promise<void> {
    this.stop();

    const targetText = this.prepareTextForSpeech(text);
    if (!targetText) {
      if (onEnd) onEnd();
      return;
    }

    const sessionToken = this.playbackQueue.startSession(
      () => { if (onStart) onStart(); },
      () => { if (onEnd) onEnd(); }
    );

    const controller = new AbortController();
    this.activeAbortController = controller;

    // Check if network credentials exist for audio synthesis
    const hasNetworkKey = Boolean(
      apiConfig?.fishAudioApiKey?.trim() ||
      apiConfig?.customTtsApiKey?.trim() ||
      apiConfig?.apiKey?.trim() ||
      apiConfig?.openRouterApiKey?.trim()
    );

    const isExplicitWebSpeech = apiConfig?.ttsProvider === 'edge' || apiConfig?.ttsProvider === 'webspeech';

    // If user explicitly chose Edge/WebSpeech or no network API key is provided, use Web Speech API
    if (isExplicitWebSpeech || !hasNetworkKey) {
      this.isFallbackSpeaking = true;
      const started = speakWebSpeechFallback(
        targetText,
        persona,
        () => {
          this.isFallbackSpeaking = true;
          if (onStart) onStart();
        },
        () => {
          this.isFallbackSpeaking = false;
          if (onEnd) onEnd();
        }
      );
      if (!started && onEnd) onEnd();
      return;
    }

    // Split text into chunks with Early Boost
    const chunks = TtsChunker.chunkText(targetText);
    if (chunks.length === 0) {
      if (onEnd) onEnd();
      return;
    }

    try {
      const ctx = this.playbackQueue.getAudioContext();

      // Dispatch audio synthesis concurrently with concurrency limit of 3
      const MAX_CONCURRENT = 3;
      let activeRequests = 0;
      let chunkIdx = 0;

      const processNextChunk = async () => {
        if (chunkIdx >= chunks.length || controller.signal.aborted) return;
        const currentChunk = chunks[chunkIdx++];
        activeRequests++;

        try {
          const rawBuffer = await synthesizeUniversalAudio({
            text: currentChunk.text,
            persona,
            apiConfig,
            signal: controller.signal
          });

          if (!controller.signal.aborted) {
            const audioBuffer = await ctx.decodeAudioData(rawBuffer.slice(0));
            this.playbackQueue.enqueue(currentChunk.sequence, audioBuffer, sessionToken, currentChunk.text);
          }
        } catch (err: any) {
          if (controller.signal.aborted) return;
          console.warn(`[Viera TTS] Error synthesizing chunk #${currentChunk.sequence}:`, err?.message || err);
          // Fallback to Web Speech if the first chunk fails due to invalid key or endpoint
          if (currentChunk.sequence === 0 && !this.playbackQueue.isSpeaking()) {
            this.stop();
            this.isFallbackSpeaking = true;
            speakWebSpeechFallback(targetText, persona, onStart, onEnd);
            return;
          }
        } finally {
          activeRequests--;
          if (chunkIdx < chunks.length && !controller.signal.aborted) {
            await processNextChunk();
          }
        }
      };

      const initialBatch = Math.min(MAX_CONCURRENT, chunks.length);
      const initialPromises: Promise<void>[] = [];
      for (let i = 0; i < initialBatch; i++) {
        initialPromises.push(processNextChunk());
      }

      await Promise.all(initialPromises);
      this.playbackQueue.markFlushed(sessionToken);
    } catch (err: any) {
      if (!controller.signal.aborted) {
        console.warn('[Viera TTS] Universal speech synthesis error, using fallback:', err?.message || err);
        this.stop();
        this.isFallbackSpeaking = true;
        speakWebSpeechFallback(targetText, persona, onStart, onEnd);
      }
    }
  }

  /**
   * Creates an ultra low-latency Streaming TTS session.
   * Feeds raw LLM tokens into the chunker and starts audio playback in <600ms!
   */
  public createStreamSession(
    persona: Persona,
    apiConfig?: ApiConfig,
    onStart?: () => void,
    onEnd?: () => void
  ): TtsStreamSession {
    this.stop();

    const sessionToken = this.playbackQueue.startSession(onStart, onEnd);
    const controller = new AbortController();
    this.activeAbortController = controller;

    const chunker = new TtsChunker({ boost: 2, minimumWords: 3, maximumWords: 14 });
    const ctx = this.playbackQueue.getAudioContext();

    const handleChunkEmitted = async (chunk: TtsChunk) => {
      if (controller.signal.aborted) return;
      try {
        const rawBuffer = await synthesizeUniversalAudio({
          text: chunk.text,
          persona,
          apiConfig,
          signal: controller.signal
        });

        if (!controller.signal.aborted) {
          const audioBuffer = await ctx.decodeAudioData(rawBuffer.slice(0));
          this.playbackQueue.enqueue(chunk.sequence, audioBuffer, sessionToken, chunk.text);
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          console.warn(`[Viera TTS] Stream chunk #${chunk.sequence} synthesis error:`, err?.message || err);
        }
      }
    };

    return {
      pushToken: (token: string) => {
        if (controller.signal.aborted) return;
        chunker.pushToken(token, (chunk) => {
          handleChunkEmitted(chunk);
        });
      },
      finish: () => {
        if (controller.signal.aborted) return;
        chunker.flush((chunk) => {
          handleChunkEmitted(chunk);
        });
        this.playbackQueue.markFlushed(sessionToken);
      },
      cancel: () => {
        controller.abort();
        this.playbackQueue.stop();
      }
    };
  }

  /**
   * Immediately stops any speech output and clears queues
   */
  public stop(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.playbackQueue.stop();
    if (this.isFallbackSpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isFallbackSpeaking = false;
    }
  }

  /**
   * Returns whether TTS is actively synthesizing or playing audio
   */
  public isSpeaking(): boolean {
    const isWebSpeechSpeaking = typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking;
    return this.playbackQueue.isSpeaking() || this.isFallbackSpeaking || isWebSpeechSpeaking;
  }
}

export const ttsService = new TTSService();

import type { ApiConfig, Persona } from '../../types';

export interface TTSBoundaryEvent {
  name: string;
  charIndex: number;
  charLength?: number;
  word?: string;
}

export type ChunkReason = 'boost' | 'punctuation' | 'limit' | 'flush';

export interface TtsChunk {
  sequence: number;
  text: string;
  reason: ChunkReason;
}

export interface TtsPlaybackItem {
  id: string;
  sequence: number;
  text: string;
  audioBuffer: AudioBuffer;
}

export interface TtsSynthesizeOptions {
  text: string;
  persona: Persona;
  apiConfig?: ApiConfig;
  signal?: AbortSignal;
}

export interface TtsStreamSession {
  pushToken: (token: string) => void;
  finish: () => void;
  cancel: () => void;
}

import { describe, expect, it } from 'vitest';
import { TtsChunker, pauseForChunk } from '../src/services/tts/ttsChunker';

describe('pauseForChunk', () => {
  it('maps trailing punctuation to pause durations', () => {
    expect(pauseForChunk('halo,')).toBe(180);
    expect(pauseForChunk('halo.')).toBe(350);
    expect(pauseForChunk('halo...')).toBe(350);
    expect(pauseForChunk('halo…')).toBe(500);
    expect(pauseForChunk('halo —')).toBe(250);
    expect(pauseForChunk('halo\n')).toBe(450);
  });

  it('returns 0 without trailing punctuation', () => {
    expect(pauseForChunk('halo semua')).toBe(0);
    expect(pauseForChunk('')).toBe(0);
  });
});

describe('TtsChunker pauses and dashes', () => {
  it('attaches pauses to emitted chunks and none to the flush tail', () => {
    const chunks = TtsChunker.chunkText('Aku sedang makan malam, lalu tidur nyenyak. Besok kita jalan');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].pauseAfterMs).toBe(180);
    expect(chunks[chunks.length - 1].reason).toBe('flush');
    expect(chunks[chunks.length - 1].pauseAfterMs).toBe(0);
  });

  it('splits on an em dash', () => {
    const chunks = TtsChunker.chunkText('Aku sedang makan malam — lalu tidur nyenyak');
    expect(chunks[0].text).toContain('malam');
    expect(chunks[0].pauseAfterMs).toBe(250);
  });

  it('does not split hyphenated words', () => {
    const chunks = TtsChunker.chunkText('Ini adalah kata well-known yang biasa');
    expect(chunks).toHaveLength(1);
  });
});

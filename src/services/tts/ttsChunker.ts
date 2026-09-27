import type { TtsChunk, ChunkReason } from './ttsTypes';

/**
 * Punctuation sets for sentence segmentation
 */
const HARD_PUNCTUATIONS = new Set('.。?？!！…⋯～~\n\r');
const SOFT_PUNCTUATIONS = new Set(',，、:：;；《》「」""\'\'');
const ANY_DIGIT = /\d/;

/**
 * Strips stage directions, markdown actions (*action*), emotion brackets ([happy]),
 * HTML/XML tags, emojis, and unwanted formatting.
 */
export function sanitizeTextForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '') // XML / HTML tags like <ja>, <think>
    .replace(/\*.*?\*/g, '') // Stage directions and roleplay actions (*sighs*, *smiles warmly*)
    .replace(/\[.*?\]/g, '') // Emotion indicators ([happy], [blush])
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Emojis
    .replace(/[`#_>]/g, '') // Markdown formatting symbols
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

export interface ChunkerOptions {
  /**
   * Number of initial chunks emitted with eager/early punctuation (e.g. 2).
   * Fires the first audio packet in <600ms while LLM continues streaming!
   */
  boost?: number;
  minimumWords?: number;
  maximumWords?: number;
}

/**
 * AIRI-inspired Streaming Sentence Chunker with Early Boost
 */
export class TtsChunker {
  private boost: number;
  private minimumWords: number;
  private maximumWords: number;

  private yieldCount = 0;
  private sequence = 0;
  private buffer = '';
  private chunkWordsCount = 0;
  private previousChar = '';

  constructor(options: ChunkerOptions = {}) {
    this.boost = options.boost ?? 2;
    this.minimumWords = options.minimumWords ?? 3;
    this.maximumWords = options.maximumWords ?? 14;
  }

  public reset(): void {
    this.yieldCount = 0;
    this.sequence = 0;
    this.buffer = '';
    this.chunkWordsCount = 0;
    this.previousChar = '';
  }

  /**
   * Push incoming LLM tokens one by one.
   * If a boundary is met (e.g. early boost punctuation or sentence end), onChunk is called immediately.
   */
  public pushToken(token: string, onChunk: (chunk: TtsChunk) => void): void {
    if (!token) return;

    for (let i = 0; i < token.length; i++) {
      const char = token[i];
      const isHard = HARD_PUNCTUATIONS.has(char);
      const isSoft = SOFT_PUNCTUATIONS.has(char);

      // Guard decimal numbers (e.g. 3.14 or 1,000) from accidental splitting
      if ((char === '.' || char === ',') && ANY_DIGIT.test(this.previousChar)) {
        this.buffer += char;
        this.previousChar = char;
        continue;
      }

      // Check if word boundary reached
      if (/\s|[\u3040-\u30ff\u4e00-\u9fff]/.test(char)) {
        this.chunkWordsCount++;
      }

      this.buffer += char;
      this.previousChar = char;

      // Evaluate early boost or regular sentence boundary
      const isEarlyBoost = this.yieldCount < this.boost && (isHard || isSoft) && this.chunkWordsCount >= this.minimumWords;
      const isSentenceEnd = isHard && this.chunkWordsCount >= this.minimumWords;
      const isLengthLimit = this.chunkWordsCount >= this.maximumWords && (isHard || isSoft || /\s/.test(char));

      if (isEarlyBoost || isSentenceEnd || isLengthLimit) {
        const cleaned = sanitizeTextForSpeech(this.buffer);
        if (cleaned.length > 0) {
          const reason: ChunkReason = isEarlyBoost ? 'boost' : (isSentenceEnd ? 'punctuation' : 'limit');
          onChunk({
            sequence: this.sequence++,
            text: cleaned,
            reason
          });
          this.yieldCount++;
        }
        this.buffer = '';
        this.chunkWordsCount = 0;
      }
    }
  }

  /**
   * Flushes any remaining text when the LLM stream terminates.
   */
  public flush(onChunk: (chunk: TtsChunk) => void): void {
    const cleaned = sanitizeTextForSpeech(this.buffer);
    if (cleaned.length > 0) {
      onChunk({
        sequence: this.sequence++,
        text: cleaned,
        reason: 'flush'
      });
    }
    this.buffer = '';
    this.chunkWordsCount = 0;
  }

  /**
   * Static helper: chunks an entire static text into sequential chunks.
   */
  public static chunkText(fullText: string, options: ChunkerOptions = {}): TtsChunk[] {
    const chunker = new TtsChunker(options);
    const chunks: TtsChunk[] = [];
    chunker.pushToken(fullText, (c) => chunks.push(c));
    chunker.flush((c) => chunks.push(c));
    return chunks;
  }
}

import {
  isRegisteredEmotion,
  type SupportedEmotion
} from '../data/emotionRegistry';

export interface ParsedExpressionResult {
  /** Validated canonical emotion, or null if no valid state shift was emitted */
  emotion: SupportedEmotion | null;
  /** Clean user-facing text with emotion tags removed */
  cleanText: string;
  /** True if an opening tag was detected (whether valid or invalid) */
  hasTag: boolean;
  /** Raw tag string if detected */
  rawTag: string | null;
}

/**
 * Extracts and validates a visual emotion tag from the beginning of a response.
 *
 * Rules:
 * 1. Checks strictly for an opening tag at the start of the message (e.g. `[happy]` or `[emotion:blush]`).
 * 2. If the tag is in the registry: returns the canonical emotion and clean dialogue.
 * 3. If an invalid or hallucinated tag is found: strips the tag from the text (so it doesn't
 *    leak to UI/TTS) but returns emotion: null, allowing the system to maintain its current mood.
 * 4. If no tag is present: returns emotion: null with the untouched text.
 */
export function extractAndValidateExpression(rawText: string): ParsedExpressionResult {
  if (!rawText) {
    return { emotion: null, cleanText: '', hasTag: false, rawTag: null };
  }

  // Handle optional reasoning block from thinking models: <think>...</think>
  let workingText = rawText;
  const thinkMatch = /^\s*<think>[\s\S]*?<\/think>\s*/i.exec(workingText);
  if (thinkMatch) {
    workingText = workingText.slice(thinkMatch[0].length);
  } else if (/^\s*<think>/i.test(workingText)) {
    // Model is currently streaming internal reasoning; mask from dialogue UI
    return { emotion: null, cleanText: '', hasTag: false, rawTag: null };
  }

  // Detect unclosed tag at front while streaming (e.g. "[", "[hap", "[emotion:blu")
  // If the text starts with '[' and has not yet emitted ']', suppress from cleanText to prevent UI flicker
  if (/^\s*\[[^\]]*$/.test(workingText)) {
    return {
      emotion: null,
      cleanText: '',
      hasTag: false,
      rawTag: null
    };
  }

  // Look for front-of-stream tag: [tag] or [emotion: tag]
  const tagRegex = /^\s*\[(?:emotion:\s*)?([a-zA-Z0-9_-]+)\s*\]\s*/i;
  const match = tagRegex.exec(workingText);

  if (!match) {
    return {
      emotion: null,
      cleanText: workingText.trimStart(),
      hasTag: false,
      rawTag: null
    };
  }

  const rawCandidate = match[1];
  const normalizedCandidate = rawCandidate.toLowerCase().replace(/_/g, '-');
  const cleanText = workingText.slice(match[0].length);

  if (isRegisteredEmotion(normalizedCandidate)) {
    return {
      emotion: normalizedCandidate,
      cleanText,
      hasTag: true,
      rawTag: rawCandidate
    };
  }

  // Tag was present but not in registry: strip the hallucinated tag cleanly, return emotion: null
  return {
    emotion: null,
    cleanText,
    hasTag: true,
    rawTag: rawCandidate
  };
}

// Re-export canonical audio sanitizer to prevent logic drift
export { sanitizeTextForSpeech } from './tts/ttsChunker';

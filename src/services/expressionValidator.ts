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
  /** True if an opening bracket is actively streaming without having emitted a closing bracket */
  isStreamingTag?: boolean;
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
    return { emotion: null, cleanText: '', hasTag: false, rawTag: null, isStreamingTag: false };
  }

  // Handle optional reasoning block from thinking models: <think>...</think>
  let workingText = rawText;
  const thinkMatch = /^\s*<think>[\s\S]*?<\/think>\s*/i.exec(workingText);
  if (thinkMatch) {
    workingText = workingText.slice(thinkMatch[0].length);
  } else if (/^\s*<think>/i.test(workingText)) {
    // Model is currently streaming internal reasoning; mask from dialogue UI
    return { emotion: null, cleanText: '', hasTag: false, rawTag: null, isStreamingTag: true };
  }

  // 2. Identify in-flight unclosed emotion tag at the tail of stream
  // e.g. "Wait a second... <pout" or "[hap"
  const inFlightTailRegex = /(?:\[(?:\/|emotion:\s*)?([a-zA-Z0-9_-]+)?|<(?:emotion:\s*)?\/?([a-zA-Z0-9_-]+)?)$/i;
  const tailMatch = inFlightTailRegex.exec(workingText);

  let cleanText = workingText;
  let isStreamingTag = false;
  let hasTag = false;
  let rawTag: string | null = null;
  let detectedEmotion: SupportedEmotion | null = null;

  if (tailMatch && tailMatch[0].length > 0) {
    const candidate = (tailMatch[1] ?? tailMatch[2] ?? '').toLowerCase();
    // Do not intercept if it's the start of <ja> or [ja] dubbing tag
    const isDubbingPrefix = /^j(?:a)?:?$/i.test(candidate) || (tailMatch[0].startsWith('<') && /^j?a?>?$/i.test(candidate));
    if (!isDubbingPrefix) {
      isStreamingTag = true;
      hasTag = true;
      cleanText = cleanText.slice(0, tailMatch.index);
    }
  }

  // 3. Match all complete emotion tags across the text:
  // - Square brackets: [happy], [emotion: blush], [/happy], [dancing]
  // - Angle brackets: <pouting>, </pouting>, <emotion: pouting>, <relaxed>
  // Excludes <ja>, </ja>, [ja], [/ja], and <think> blocks!
  const tagRegex = /(?:\[(?:\/|emotion:\s*)?([a-zA-Z0-9_-]+)\s*\]|<(?:emotion:\s*)?\/?([a-zA-Z0-9_-]+)(?:\s+[^>]*)?>)/gi;

  cleanText = cleanText.replace(tagRegex, (fullMatch, sqCandidate, angleCandidate) => {
    const rawCand = sqCandidate || angleCandidate;
    const normalized = (rawCand || '').toLowerCase().replace(/_/g, '-');

    // Never strip dubbing tags or thinking blocks!
    if (normalized === 'ja' || normalized === 'think') {
      return fullMatch;
    }

    // For angle brackets, only strip if it's a registered emotion or explicitly prefixed with emotion:
    if (angleCandidate) {
      const isExplicitEmotion = /<emotion:/i.test(fullMatch);
      if (!isRegisteredEmotion(normalized) && !isExplicitEmotion) {
        // Keep standard HTML tags like <b>, <span>, etc.
        return fullMatch;
      }
    }

    hasTag = true;
    rawTag = rawCand;

    if (isRegisteredEmotion(normalized)) {
      detectedEmotion = normalized;
    }

    return ' ';
  });

  cleanText = cleanText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  return {
    emotion: detectedEmotion,
    cleanText,
    hasTag,
    rawTag,
    isStreamingTag
  };
}

// Re-export canonical audio sanitizer to prevent logic drift
export { sanitizeTextForSpeech } from './tts/ttsChunker';

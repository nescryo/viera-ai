import { extractAndValidateExpression } from './expressionValidator';

/**
 * Unicode range covering Hiragana, Katakana, CJK Unified Ideographs, and Extension A
 */
export const JAPANESE_CHARSET_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

export interface ParsedDubbingResult {
  /** Extracted Japanese dialogue text, or null if not detected */
  jaText: string | null;
  /** Clean user-facing text with Japanese dubbing tags stripped or masked during stream */
  cleanText: string;
  /** True if jaText was found and verified to contain authentic Kana/Kanji */
  isValidJapanese: boolean;
  /** True if the stream is currently buffering inside an unclosed dubbing tag */
  isStreamingJa: boolean;
  /** True if a dubbing tag was detected in the stream */
  hasTag: boolean;
  /** True if significant length mismatch is detected between dubbing and subtitle */
  hasLengthAnomaly: boolean;
}

export interface UnifiedDialogueResult {
  /** Canonical 3D visual emotion or null */
  emotion: string | null;
  /** Validated Japanese dubbing text for audio synthesis, or null */
  jaText: string | null;
  /** Clean user-facing dialogue for chat UI bubble */
  cleanText: string;
  /** Actions parsed from markdown (*smiles*, *sighs*) */
  actions: string[];
  /** True if Japanese text is verified and ready for TTS */
  isValidJapanese: boolean;
  /** True if currently buffering an opening emotion or dubbing tag */
  isStreaming: boolean;
}

/**
 * Checks for severe length ratio discrepancy between Japanese voice script and normal subtitle.
 * Designed to avoid false positives on concise Japanese idioms (e.g. "元気？" = 3 chars, "了解" = 2 chars).
 */
export function checkLengthRatioAnomaly(jaText: string, normalText: string): boolean {
  const jaLen = jaText.trim().length;
  const normalLen = normalText.trim().length;
  if (jaLen === 0 || normalLen === 0) return false;

  // Only flag as anomaly if voice script is less than 2 characters while subtitle is extensive (> 50 chars)
  if (normalLen > 50 && jaLen < 2) return true;
  if (jaLen > 60 && normalLen < 2) return true;

  return false;
}

/**
 * Extracts and validates Japanese dubbing text from LLM response stream.
 * 
 * Rules:
 * 1. Recognizes <ja>...</ja>, [ja]...[/ja], and [JA: ...] tags.
 * 2. Masks in-flight opening tokens (including "<", "<j", "<ja") so zero characters leak to UI.
 * 3. Validates that the tag content actually contains Japanese Kana/Kanji script.
 * 4. Checks length ratio heuristic to guard against extreme desync.
 */
export function extractAndValidateDubbing(rawText: string): ParsedDubbingResult {
  if (!rawText) {
    return {
      jaText: null,
      cleanText: '',
      isValidJapanese: false,
      isStreamingJa: false,
      hasTag: false,
      hasLengthAnomaly: false
    };
  }

  let workingText = rawText;

  // 1. Handle optional reasoning blocks from thinking models: <think>...</think>
  const thinkMatch = /^\s*<think>[\s\S]*?<\/think>\s*/i.exec(workingText);
  if (thinkMatch) {
    workingText = workingText.slice(thinkMatch[0].length);
  } else if (/^\s*<think>/i.test(workingText)) {
    return {
      jaText: null,
      cleanText: '',
      isValidJapanese: false,
      isStreamingJa: true,
      hasTag: false,
      hasLengthAnomaly: false
    };
  }

  // 2. Extract all closed dubbing tags anywhere in the dialogue:
  // Supports <ja>...</ja>, [ja]...[/ja], and [JA: ...]
  const closedTagRegex = /(?:<ja(?:\s+[^>]*)?>([\s\S]*?)<\/ja>|\[ja(?:\s+[^\]]*)?\]([\s\S]*?)\[\/ja\]|\[JA:\s*([\s\S]*?)\])/gi;
  const jaSegments: string[] = [];
  let closedMatch: RegExpExecArray | null;

  while ((closedMatch = closedTagRegex.exec(workingText)) !== null) {
    const candidate = (closedMatch[1] ?? closedMatch[2] ?? closedMatch[3] ?? '').trim();
    if (candidate) {
      jaSegments.push(candidate);
    }
  }

  // Strip all closed dubbing blocks from user-facing subtitle text
  let cleanText = workingText.replace(closedTagRegex, ' ');

  // 3. Detect in-flight unclosed dubbing tags at the end of the text
  // e.g. trailing "<", "<j", "<ja", "<ja>...", "[", "[j", "[ja", "[ja]...", "[ja:..."
  const inFlightTailRegex = /(?:<j?a?>?|<ja\b[^>]*|<ja(?:\s+[^>]*)?>[\s\S]*|\[j?a?:?|\[ja(?:\s+[^\]]*)?\][\s\S]*|\[ja:\s*[\s\S]*)$/i;
  const inFlightMatch = inFlightTailRegex.exec(cleanText);

  let isStreamingJa = false;
  if (inFlightMatch && inFlightMatch[0].length > 0) {
    isStreamingJa = true;
    cleanText = cleanText.slice(0, inFlightMatch.index);
  }

  // Normalize whitespace in cleanText
  cleanText = cleanText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  const combinedJaText = jaSegments.length > 0 ? jaSegments.join(' ') : null;
  const hasTag = jaSegments.length > 0 || isStreamingJa;
  const isValidJapanese = combinedJaText ? JAPANESE_CHARSET_REGEX.test(combinedJaText) : false;
  const hasLengthAnomaly = isValidJapanese ? checkLengthRatioAnomaly(combinedJaText!, cleanText) : false;

  return {
    jaText: combinedJaText,
    cleanText,
    isValidJapanese,
    isStreamingJa,
    hasTag,
    hasLengthAnomaly
  };
}

/**
 * Unified Parser that composes visual emotion validation and dubbing extraction.
 * Provides a single, clean interface for App.tsx and aiService.ts streaming pipelines.
 */
export function extractAndValidateDialogue(rawText: string): UnifiedDialogueResult {
  // Step 1: Extract and validate 3D visual emotion tag (e.g. [happy])
  const {
    emotion,
    cleanText: textAfterEmotion,
    isStreamingTag: isEmotionStreaming
  } = extractAndValidateExpression(rawText);

  // If an emotion tag opening bracket is STILL IN-FLIGHT (e.g. "[", "[hap"), dialogue is buffering
  if (isEmotionStreaming) {
    return {
      emotion: null,
      jaText: null,
      cleanText: '',
      actions: [],
      isValidJapanese: false,
      isStreaming: true
    };
  }

  // Step 2: Extract and validate Japanese dubbing tag (e.g. <ja>...</ja>)
  const dubbing = extractAndValidateDubbing(textAfterEmotion);

  // Step 3: Extract roleplay actions from the clean subtitle text (*smiles warmly*)
  const actionRegex = /\*(.*?)\*/g;
  const actions: string[] = [];
  let actionMatch;
  while ((actionMatch = actionRegex.exec(dubbing.cleanText)) !== null) {
    actions.push(actionMatch[1]);
  }

  return {
    emotion,
    jaText: dubbing.isValidJapanese ? dubbing.jaText : null,
    cleanText: dubbing.cleanText,
    actions,
    isValidJapanese: dubbing.isValidJapanese,
    isStreaming: dubbing.isStreamingJa
  };
}

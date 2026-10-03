import type { ApiConfig, Persona, TtsEngineProvider } from '../../types';

export type ResolvedTtsProvider = TtsEngineProvider | 'webspeech';

export interface ResolvedTtsSettings {
  mode: 'japanese' | 'normal';
  provider: ResolvedTtsProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  voiceId: string;
  referenceId: string;
  isFallbackWebSpeech: boolean;
}

/**
 * Resolves active TTS configuration based on language detection,
 * speech mode (follow-chat vs japanese-dub), and configured provider credentials.
 * Seamlessly supports modern split TTS options while maintaining 100% backward compatibility
 * with legacy configuration fields.
 */
export function resolveTtsSettings(
  apiConfig: ApiConfig | undefined,
  text: string,
  _persona?: Persona
): ResolvedTtsSettings {
  const hasJapaneseChars = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
  const isJapaneseMode = apiConfig?.ttsMode === 'japanese-dub' || hasJapaneseChars;

  let rawProvider: string | undefined;
  let rawApiKey: string | undefined;
  let rawUrl: string | undefined;
  let rawModel: string | undefined;
  let rawVoiceId: string | undefined;
  let rawRefId: string | undefined;

  if (isJapaneseMode && (apiConfig?.jpTtsProvider || apiConfig?.jpTtsApiKey || apiConfig?.jpTtsUrl)) {
    // Japanese-specific configuration
    rawProvider = apiConfig.jpTtsProvider;
    rawApiKey = apiConfig.jpTtsApiKey;
    rawUrl = apiConfig.jpTtsUrl;
    rawModel = apiConfig.jpTtsModel;
    rawVoiceId = apiConfig.jpTtsVoice;
    rawRefId = apiConfig.jpTtsReferenceId;
  } else {
    // Normal chat configuration
    rawProvider = apiConfig?.normalTtsProvider;
    rawApiKey = apiConfig?.normalTtsApiKey;
    rawUrl = apiConfig?.normalTtsUrl;
    rawModel = apiConfig?.normalTtsModel;
    rawVoiceId = apiConfig?.normalTtsVoice;
    rawRefId = apiConfig?.normalTtsReferenceId;
  }

  // Fallbacks to legacy fields if modern split fields are not set
  if (!rawProvider) {
    rawProvider = apiConfig?.ttsProvider || 'fish-audio';
  }
  if (!rawApiKey) {
    rawApiKey = (rawProvider === 'fish-audio' ? apiConfig?.fishAudioApiKey : apiConfig?.customTtsApiKey)
      || apiConfig?.apiKey
      || apiConfig?.openRouterApiKey
      || '';
  }
  if (!rawUrl) {
    rawUrl = apiConfig?.customTtsUrl
      || (apiConfig?.baseUrl && !apiConfig.baseUrl.includes('deepseek') ? apiConfig.baseUrl : 'https://api.openai.com/v1');
  }
  if (!rawModel) {
    rawModel = (rawProvider === 'fish-audio' ? apiConfig?.fishAudioModel : apiConfig?.customTtsModel) || '';
  }
  if (!rawVoiceId) {
    rawVoiceId = apiConfig?.customTtsVoiceId || 'nova';
  }
  if (!rawRefId) {
    rawRefId = apiConfig?.fishAudioReferenceId || '';
  }

  // Normalize provider
  let provider: ResolvedTtsProvider = 'fish-audio';
  if (rawProvider === 'edge') {
    provider = 'edge';
  } else if (rawProvider === 'webspeech') {
    provider = 'webspeech';
  } else if (rawProvider === 'universal' || rawProvider === 'custom') {
    provider = 'universal';
  } else {
    provider = 'fish-audio';
  }

  const apiKey = (rawApiKey || '').trim();
  const baseUrl = (rawUrl || '').trim();
  const voiceId = (rawVoiceId || 'nova').trim();
  const referenceId = (rawRefId || '').trim();

  let model = (rawModel || '').trim();
  if (provider === 'fish-audio') {
    if (!model || model === 'tts-1') {
      model = 's2.1-pro-free';
    }
  } else if (provider === 'universal') {
    if (!model) {
      model = 'tts-1';
    }
  }

  // Determine whether we should fall back to Web Speech
  const isLocalUniversal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
  const isFallbackWebSpeech =
    provider === 'webspeech' ||
    (provider === 'fish-audio' && !apiKey) ||
    (provider === 'universal' && !apiKey && !isLocalUniversal);

  return {
    mode: isJapaneseMode ? 'japanese' : 'normal',
    provider,
    apiKey,
    baseUrl,
    model,
    voiceId,
    referenceId,
    isFallbackWebSpeech
  };
}

import type { TtsSynthesizeOptions } from './ttsTypes';
import type { Persona } from '../../types';
import { resolveTtsSettings } from './ttsConfigResolver';

/**
 * Local VITS / Edge-TTS Server Strategy (for offline testing)
 */
export async function synthesizeEdgeTts(options: {
  text: string;
  persona?: Persona;
  signal?: AbortSignal;
}): Promise<ArrayBuffer> {
  const { text, persona, signal } = options;
  const character = encodeURIComponent(persona?.name || 'Character');
  const encodedText = encodeURIComponent(text);
  const localUrl = `http://localhost:5000/tts?text=${encodedText}&character=${character}`;

  const res = await fetch(localUrl, { signal });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Local VITS / Edge-TTS Server HTTP ${res.status}: ${errText || res.statusText}`);
  }
  return res.arrayBuffer();
}

/**
 * Fish Audio Strategy (Direct Fish Audio API & OpenRouter Audio Speech Gateway)
 */
export async function synthesizeFishAudio(options: {
  text: string;
  apiKey: string;
  referenceId?: string;
  model?: string;
  isOpenRouter?: boolean;
  signal?: AbortSignal;
}): Promise<ArrayBuffer> {
  const { text, apiKey, referenceId, model, isOpenRouter = false, signal } = options;

  if (!apiKey) {
    throw new Error('Fish Audio requires an API Key. Please enter your Fish Audio API Key or OpenRouter Key in Settings.');
  }

  const refId = referenceId?.trim() || undefined;
  const rawModel = (model || '').trim();
  const selectedModel = (!rawModel || rawModel === 'tts-1') ? 's2.1-pro-free' : rawModel;
  const headerModel = selectedModel.replace(/^fish-audio\//, '');

  const endpoint = isOpenRouter ? 'https://openrouter.ai/api/v1/audio/speech' : '/fish_audio_api/v1/tts';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
  };

  if (!isOpenRouter) {
    headers['model'] = headerModel;
  }

  const payload: Record<string, any> = isOpenRouter
    ? {
        model: selectedModel.startsWith('fish-audio/') ? selectedModel : `fish-audio/${selectedModel}`,
        input: text,
        voice: refId
      }
    : {
        text,
        format: 'mp3',
        latency: 'normal',
        normalize: true,
        reference_id: refId
      };

  let response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal
  });

  // Auto-retry if 400 Bad Request because the custom reference ID was not found in the catalog
  if (!response.ok && response.status === 400 && (payload.reference_id || payload.voice)) {
    console.warn('[Viera TTS] Reference ID not found on Fish Audio catalog. Retrying with default system voice...');
    delete payload.reference_id;
    delete payload.voice;
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    });
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Fish Audio API HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const jsonBody = await response.json().catch(() => ({}));
    throw new Error(`Fish Audio API returned JSON error: ${JSON.stringify(jsonBody)}`);
  }

  return response.arrayBuffer();
}

/**
 * Universal OpenAI-Compatible Audio Gateway Strategy (/v1/audio/speech)
 * Supports OpenAI, OpenRouter, ElevenLabs, Groq, Kokoro, LM Studio, etc.
 */
export async function synthesizeOpenAiCompatible(options: {
  text: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
  voiceId?: string;
  signal?: AbortSignal;
}): Promise<ArrayBuffer> {
  const { text, baseUrl, apiKey, model = 'tts-1', voiceId = 'nova', signal } = options;

  let targetEndpoint = baseUrl.trim() || 'https://api.openai.com/v1';
  if (!targetEndpoint.includes('/audio/speech')) {
    targetEndpoint = `${targetEndpoint.replace(/\/+$/, '')}/audio/speech`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey?.trim()) {
    const trimmedKey = apiKey.trim();
    headers['Authorization'] = trimmedKey.startsWith('Bearer ') ? trimmedKey : `Bearer ${trimmedKey}`;
  }

  const payload = {
    model: model.trim() || 'tts-1',
    input: text,
    response_format: 'mp3',
    voice: voiceId.trim() || 'nova'
  };

  const response = await fetch(targetEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Universal Audio HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  return response.arrayBuffer();
}

/**
 * Universal Audio Synthesizer Dispatcher
 * Resolves active provider strategy and dispatches synthesis request.
 */
export async function synthesizeUniversalAudio(options: TtsSynthesizeOptions): Promise<ArrayBuffer> {
  const { text, persona, apiConfig, signal } = options;
  const settings = resolveTtsSettings(apiConfig, text, persona);

  if (settings.provider === 'edge') {
    return synthesizeEdgeTts({ text, persona, signal });
  }

  if (settings.provider === 'fish-audio') {
    const directKey = (
      settings.mode === 'japanese'
        ? apiConfig?.jpTtsApiKey
        : (apiConfig?.normalTtsApiKey || apiConfig?.fishAudioApiKey)
    )?.trim();
    const isOpenRouter = !directKey && (settings.apiKey.startsWith('sk-or-') || Boolean(apiConfig?.openRouterApiKey));

    return synthesizeFishAudio({
      text,
      apiKey: settings.apiKey,
      referenceId: settings.referenceId,
      model: settings.model,
      isOpenRouter,
      signal
    });
  }

  // Universal OpenAI-Compatible /v1/audio/speech
  return synthesizeOpenAiCompatible({
    text,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    voiceId: settings.voiceId,
    signal
  });
}

/**
 * Clean Web Speech API fallback for local offline testing when no API key is provided
 */
export function speakWebSpeechFallback(
  text: string,
  persona: Persona,
  onStart?: () => void,
  onEnd?: () => void
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    const hasJapaneseChars = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
    const targetLang = hasJapaneseChars ? 'ja-JP' : (persona.voice?.lang || 'en-US');
    utterance.lang = targetLang;
    utterance.pitch = hasJapaneseChars ? 1.22 : (persona.voice?.pitch || 1.15);
    utterance.rate = persona.voice?.rate || 0.98;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferred = voices.find(v => v.lang.startsWith(targetLang) && (v.name.includes('Natural') || v.name.includes('Female') || v.name.includes('Google') || v.name.includes('Nanami') || v.name.includes('Ayumi') || v.name.includes('Haruka')))
        || voices.find(v => v.lang.startsWith(targetLang))
        || voices[0];
      if (preferred) utterance.voice = preferred;
    }

    utterance.onstart = () => { if (onStart) onStart(); };
    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = () => { if (onEnd) onEnd(); };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.warn('[Viera TTS] Web Speech fallback error:', err);
    return false;
  }
}

import type { TtsSynthesizeOptions } from './ttsTypes';
import type { Persona } from '../../types';

/**
 * Universal OpenAI-Compatible TTS Engine (/v1/audio/speech)
 * Supports OpenAI, OpenRouter, ElevenLabs, Groq, Kokoro, LM Studio, and any custom audio gateway.
 */
export async function synthesizeUniversalAudio(options: TtsSynthesizeOptions): Promise<ArrayBuffer> {
  const { text, apiConfig, signal } = options;
  const provider = apiConfig?.ttsProvider || 'fish-audio';

  // ==========================================
  // PATH 1: FISH AUDIO S2.1 PRO
  // ==========================================
  if (provider === 'fish-audio') {
    const directApiKey = (apiConfig?.fishAudioApiKey || '').trim();
    const openRouterKey = (apiConfig?.openRouterApiKey || (apiConfig?.baseUrl?.includes('openrouter') ? apiConfig?.apiKey : '') || '').trim();
    const apiKey = directApiKey || openRouterKey;

    if (!apiKey) {
      throw new Error('Fish Audio requires an API Key. Please enter your Fish Audio API Key or OpenRouter Key in Settings.');
    }

    // Read voice reference ID freely entered by the user (no hardcoded fallback)
    const refId = (apiConfig?.fishAudioReferenceId || '').trim();

    const isOpenRouter = !directApiKey && Boolean(openRouterKey);
    const selectedModel = apiConfig?.fishAudioModel || 's2.1-pro-free';
    const headerModel = selectedModel.replace(/^fish-audio\//, '');

    const endpoint = isOpenRouter ? 'https://openrouter.ai/api/v1/audio/speech' : '/fish_audio_api/v1/tts';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (!isOpenRouter) {
      headers['model'] = headerModel;
    }

    const payload: Record<string, any> = isOpenRouter
      ? {
          model: selectedModel.startsWith('fish-audio/') ? selectedModel : `fish-audio/${selectedModel}`,
          input: text,
          voice: refId || undefined
        }
      : {
          text,
          format: 'mp3',
          latency: 'normal',
          normalize: true,
          reference_id: refId || undefined
        };

    let response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    });

    // Auto-retry if 400 Bad Request because the user's custom reference ID was not found in catalog
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

  // ==========================================
  // PATH 2: UNIVERSAL OPENAI-COMPATIBLE /v1/audio/speech
  // ==========================================
  const rawBaseUrl = (
    apiConfig?.customTtsUrl || 
    (apiConfig?.baseUrl && !apiConfig.baseUrl.includes('deepseek') ? apiConfig.baseUrl : 'https://api.openai.com/v1')
  ).trim();

  let targetEndpoint = rawBaseUrl;
  if (!targetEndpoint.includes('/audio/speech')) {
    targetEndpoint = `${targetEndpoint.replace(/\/+$/, '')}/audio/speech`;
  }

  const apiKey = (
    apiConfig?.customTtsApiKey || 
    apiConfig?.apiKey || 
    apiConfig?.openRouterApiKey || 
    ''
  ).trim();

  const model = (apiConfig?.customTtsModel || 'tts-1').trim();
  const voice = (apiConfig?.customTtsVoiceId || '').trim();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  }

  const payload: Record<string, any> = {
    model,
    input: text,
    response_format: 'mp3'
  };

  if (voice) {
    payload.voice = voice;
  }

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
    utterance.pitch = persona.voice?.pitch || 1.15;
    utterance.rate = persona.voice?.rate || 0.98;
    utterance.lang = persona.voice?.lang || 'en-US';

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferred = voices.find(v => v.lang.startsWith(utterance.lang) && (v.name.includes('Natural') || v.name.includes('Female') || v.name.includes('Google')))
        || voices.find(v => v.lang.startsWith(utterance.lang))
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

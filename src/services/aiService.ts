import type { ApiConfig, ChatMessage, Persona, UserProfile } from '../types';

export interface ParsedDualOutput {
  emotions: string[];
  actions: string[];
  jaText: string;
  enText: string;
}

/**
 * Normalizes user-entered Base URL (strips trailing slashes, ensures protocol)
 */
export function normalizeBaseUrl(url: string): string {
  let trimmed = (url || '').trim();
  if (!trimmed) return 'https://openrouter.ai/api/v1';
  // Ensure http:// or https://
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  // Remove trailing slashes
  trimmed = trimmed.replace(/\/+$/, '');
  return trimmed;
}

/**
 * Validates API key and dynamically fetches all available models from GET /models
 */
export async function validateApiKeyAndFetchModels(
  baseUrl: string,
  apiKey: string
): Promise<{ success: boolean; models: string[]; error?: string }> {
  const normalized = normalizeBaseUrl(baseUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const response = await fetch(`${normalized}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        errorMsg = errorJson?.error?.message || errorJson?.message || errorMsg;
      } catch {
        // Use status text if body not json
      }
      return { success: false, models: [], error: errorMsg };
    }

    const data = await response.json();
    let modelList: string[] = [];

    // Standard OpenAI & OpenRouter specification: { data: [{ id: "..." }] }
    if (Array.isArray(data?.data)) {
      modelList = data.data.map((m: any) => m.id || m.name).filter(Boolean);
    } 
    // Ollama / Alternative specification: { models: [{ name: "..." }] }
    else if (Array.isArray(data?.models)) {
      modelList = data.models.map((m: any) => m.id || m.name).filter(Boolean);
    }
    // Direct array format: [{ id: "..." }]
    else if (Array.isArray(data)) {
      modelList = data.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
    }

    if (modelList.length === 0) {
      return { 
        success: true, 
        models: [], 
        error: 'API Key terhubung, tetapi endpoint tidak mengembalikan daftar model.' 
      };
    }

    // Sort alphabetically
    modelList.sort((a, b) => a.localeCompare(b));

    return {
      success: true,
      models: modelList
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      return { success: false, models: [], error: 'Koneksi timeout (server tidak merespons dalam 8 detik)' };
    }
    return { success: false, models: [], error: err?.message || 'Gagal terhubung ke endpoint server' };
  }
}

/**
 * Checks if a given endpoint is reachable
 */
export async function checkEndpointOnline(baseUrl: string): Promise<boolean> {
  const normalized = normalizeBaseUrl(baseUrl);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${normalized}/models`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return res.ok || res.status === 401; // 401 means server is online and responding!
  } catch {
    return false;
  }
}

/**
 * Legacy check for LM Studio
 */
export async function checkLmStudioConnection(lmStudioUrl: string): Promise<boolean> {
  return checkEndpointOnline(lmStudioUrl);
}

/**
 * Helper to process OpenAI-compatible SSE readable stream
 */
export async function readSSEResponseStream(
  response: Response,
  onToken: (token: string, fullTextSoFar: string) => void
): Promise<string> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.substring(6));
          const content = json.choices?.[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            onToken(content, fullText);
          }
        } catch {
          // Ignore partial chunk JSON parse errors
        }
      }
    }
  }

  if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
    try {
      const json = JSON.parse(buffer.trim().substring(6));
      const content = json.choices?.[0]?.delta?.content || '';
      if (content) {
        fullText += content;
        onToken(content, fullText);
      }
    } catch {
      // Ignore
    }
  }

  return fullText;
}

/**
 * Universal Streaming Chat Message Sender
 * Works with ANY OpenAI-compatible endpoint (OpenRouter, DeepSeek, Groq, LM Studio, Ollama, etc.)
 */
export async function sendStreamingChatMessage(
  messages: ChatMessage[],
  persona: Persona,
  apiConfig: ApiConfig,
  onToken: (token: string, fullTextSoFar: string) => void,
  onComplete: (fullText: string, emotions: string[], actions: string[]) => void,
  onError: (err: any) => void,
  userProfile?: UserProfile | null
): Promise<void> {
  const normalizedBaseUrl = normalizeBaseUrl(apiConfig.baseUrl || apiConfig.lmStudioUrl || 'https://openrouter.ai/api/v1');
  const apiKey = (apiConfig.apiKey || apiConfig.deepseekApiKey || apiConfig.openRouterApiKey || '').trim();
  const model = apiConfig.model || apiConfig.deepseekModel || apiConfig.lmStudioModel || 'deepseek/deepseek-chat';

  const formattedUserName = getUserFormattedName(userProfile);

  const formattedHistory = messages.map(m => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: m.text
  }));

  const systemMessage = {
    role: 'system',
    content: `You are ${persona.name} (${persona.tagline || 'anime companion'}). You are kind, expressive, and engaging.
You are conversing with ${formattedUserName}. Address the user warmly as ${formattedUserName}.
Keep responses conversational, sweet, and lively.`
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${normalizedBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [systemMessage, ...formattedHistory],
        temperature: 0.7,
        stream: true
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errText = '';
      try {
        const errJson = await response.json();
        errText = errJson?.error?.message || response.statusText;
      } catch {
        errText = `HTTP status ${response.status} (${response.statusText})`;
      }
      throw new Error(`LLM Gateway Error: ${errText}`);
    }

    const fullText = await readSSEResponseStream(response, onToken);
    const { emotions, actions } = parseResponseText(fullText);
    onComplete(fullText, emotions, actions);
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error("sendStreamingChatMessage error:", err);
    onError(err);
  }
}

/**
 * Temporary clean token parsers for UI rendering
 */
export function parseResponseText(_text: string): { emotions: string[]; actions: string[] } {
  return { emotions: ['happy'], actions: [] };
}

export function parseDualOutputResponse(text: string): ParsedDualOutput {
  return {
    emotions: ['happy'],
    actions: [],
    jaText: text,
    enText: text
  };
}

export function getUserFormattedName(userProfile?: Partial<UserProfile> | null): string {
  const rawName = userProfile?.nickname?.trim() || userProfile?.username?.replace(/^@/, '').trim();
  const baseName = rawName && rawName.length > 0 ? rawName : 'Trailblazer';
  const gender = userProfile?.gender || 'unspecified';

  if (gender === 'female') {
    return `${baseName}-chan`;
  }
  return `${baseName}-san`;
}

export function getPersonaGreeting(persona: Persona, userProfile?: Partial<UserProfile> | null): string {
  const formattedName = getUserFormattedName(userProfile);
  return persona.greeting.replace(/Trailblazer/g, formattedName);
}

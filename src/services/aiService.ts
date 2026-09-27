import type { ApiConfig, ChatMessage, Persona, UserProfile } from '../types';
import { generatePromptEmotionRoster } from '../data/emotionRegistry';
import { extractAndValidateExpression } from './expressionValidator';

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
  if (!trimmed) return '';
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
        error: 'Connected to endpoint, but no models were returned.' 
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
      return { success: false, models: [], error: 'Connection timeout (server did not respond within 8 seconds)' };
    }
    return { success: false, models: [], error: err?.message || 'Failed to connect to endpoint server' };
  }
}

/**
 * Checks if a given endpoint is reachable
 */
export async function checkEndpointOnline(baseUrl: string): Promise<boolean> {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return false;
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
  userProfile?: UserProfile | null,
  sessionSummary?: string,
  currentEmotion?: string
): Promise<void> {
  const normalizedBaseUrl = normalizeBaseUrl(apiConfig.baseUrl);
  const apiKey = (apiConfig.apiKey || '').trim();
  const model = (apiConfig.model || '').trim();

  if (!normalizedBaseUrl || !model) {
    throw new Error('API Gateway Error: Base URL or model name is not configured. Please check your AI Settings.');
  }

  const userName = getUserFormattedName(userProfile);

  // Sliding context window: send the most recent 50 messages to keep inference fast.
  // Older messages remain in UI history and are remembered by the AI via sessionSummary.
  const MAX_ACTIVE_CONTEXT = 50;
  const activeMessages = messages.length > MAX_ACTIVE_CONTEXT
    ? messages.slice(-MAX_ACTIVE_CONTEXT)
    : messages;

  const formattedHistory = activeMessages.map(m => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: m.rawText || m.text
  }));

  let systemPrompt = persona.systemPrompt?.trim()
    ? persona.systemPrompt
    : `You are ${persona.name} (${persona.tagline || 'anime companion'}). You are engaging, expressive, and conversational.\nRespond naturally in character with warmth and genuine personality.`;

  if (userName) {
    systemPrompt += `\nThe user's name is ${userName}.`;
  }
  if (userProfile?.bio?.trim()) {
    systemPrompt += `\nAbout the user: ${userProfile.bio.trim()}`;
  }
  if (sessionSummary?.trim()) {
    systemPrompt += `\n\n[YOUR MEMORIES & SHARED EXPERIENCES WITH ${userName || 'THE USER'}]:\n${sessionSummary.trim()}\n(Naturally weave these shared memories, inside jokes, and mutual moments into your responses when relevant.)`;
  }

  const activeEmotion = currentEmotion?.trim() || 'relaxed';
  const emotionRoster = generatePromptEmotionRoster();

  systemPrompt += `\n\n[3D VISUAL EMOTIONS & EXPRESSION SYSTEM]:
Your 3D avatar actively reflects your emotional reactions in real-time.
Current mood: "${activeEmotion}".

Whenever your feelings naturally change in reaction to the conversation—such as feeling happy, playful, shy, flustered, sulking, or startled—begin your response with the matching tag to animate your avatar:
${emotionRoster}

(If your current mood remains unchanged, simply reply directly without an emotion tag.)`;

  systemPrompt += `\n\n[CONVERSATION STYLE]:
- Express emotion and nuance organically through dialogue, tone, and character voice rather than heavy emoji decoration.
- Emojis may be used occasionally when they genuinely fit the moment, but prioritize natural spoken dialogue.`;

  const systemMessage = {
    role: 'system',
    content: systemPrompt
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    }
    if (normalizedBaseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'https://viera.app';
      headers['X-Title'] = 'Viera AI Companion';
    }

    const response = await fetch(`${normalizedBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [systemMessage, ...formattedHistory],
        temperature: 0.7,
        max_tokens: 800,
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
 * Robust token parser utilizing the canonical emotion registry validator
 */
export function parseResponseText(text: string): { emotions: string[]; actions: string[]; cleanText: string } {
  const { emotion, cleanText } = extractAndValidateExpression(text);
  const actionRegex = /\*(.*?)\*/g;
  const actions: string[] = [];
  let match;
  while ((match = actionRegex.exec(cleanText)) !== null) {
    actions.push(match[1]);
  }
  return {
    emotions: emotion ? [emotion] : [],
    actions,
    cleanText
  };
}

export function parseDualOutputResponse(text: string): ParsedDualOutput {
  const { emotions, actions, cleanText } = parseResponseText(text);
  return {
    emotions,
    actions,
    jaText: cleanText,
    enText: cleanText
  };
}

export function getUserFormattedName(userProfile?: Partial<UserProfile> | null): string {
  return userProfile?.nickname?.trim() || userProfile?.username?.replace(/^@/, '').trim() || '';
}

/**
 * Generates an organic first-person episodic memory reflection of the conversation.
 * Designed to prevent memory drift, resist hallucinations, and filter trivial details.
 */
export async function generateEpisodicMemory(
  messages: ChatMessage[],
  persona: Persona,
  apiConfig: ApiConfig,
  previousSummary?: string,
  userProfile?: UserProfile | null
): Promise<string> {
  const normalizedBaseUrl = normalizeBaseUrl(apiConfig.baseUrl);
  const apiKey = (apiConfig.apiKey || '').trim();
  const model = (apiConfig.model || '').trim();
  const userName = getUserFormattedName(userProfile) || 'the user';

  if (!normalizedBaseUrl || !model) {
    console.warn('[Viera Memory] Missing baseUrl or model for episodic memory generation.');
    return previousSummary || '';
  }

  const systemPrompt = `You are ${persona.name}. Reflect on your recent conversation with ${userName}.

Write a brief personal memory from your own perspective about what stood out to you.

* Remember specific topics, opinions, jokes, stories, or details the user shared that are likely to matter later.
* Remember meaningful moments in your relationship, including recurring jokes, playful banter, emotional moments, or changes in mood.
* Remember promises, plans, goals, or things you agreed to do together.
* Prefer memorable and relationship-relevant details over generic conversation summaries.
* Do not invent, assume, or embellish facts that were not established in the conversation.
* Preserve existing memories when they remain true. Only update or remove an existing detail when the recent conversation clearly provides evidence that it has changed.
* Avoid storing trivial one-off details that are unlikely to matter in future conversations.

${previousSummary?.trim() ? `Here is the existing memory. Preserve its valid information and update it only when the new conversation provides evidence that something has changed:\n"${previousSummary.trim()}"` : ''}

Write 2–4 concise sentences in your own voice. Make it feel like a genuine memory of our relationship, not a database summary.`;

  const conversationTranscript = messages
    .map(m => `${m.sender === 'user' ? userName : persona.name}: ${m.rawText || m.text}`)
    .join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (normalizedBaseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'https://viera.app';
      headers['X-Title'] = 'Viera AI Companion';
    }

    const response = await fetch(`${normalizedBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is our recent conversation transcript:\n\n${conversationTranscript}\n\nWrite your personal memory reflection now:` }
        ],
        temperature: 0.3,
        max_tokens: 300,
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Memory reflection HTTP ${response.status}`);
    }

    const data = await response.json();
    const reflection = data.choices?.[0]?.message?.content?.trim() || '';
    return reflection || previousSummary || '';
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[Viera Memory] Failed to generate episodic memory reflection:', err);
    return previousSummary || '';
  }
}


export type SenderType = 'user' | 'ai';

export interface ChatMessage {
  id: string;
  sender: SenderType;
  characterId: string;
  text: string;
  originalText?: string;
  rawText?: string;
  jaText?: string;
  emotions?: string[];
  actions?: string[];
  timestamp: string;
}

export interface Persona {
  id: string;
  name: string;
  tagline: string;
  greeting: string;
  systemPrompt: string;
  customLore?: string; // User-defined alternative memory / custom scenario
  avatarUrl: string;
  voice: {
    pitch: number;
    rate: number;
    lang: string;
  };
  category: 'Honkai: Star Rail' | 'Anime & Gaming' | 'Original';
}

export type TtsMode = 'follow-chat' | 'japanese-dub';
export type TtsEngineProvider = 'fish-audio' | 'universal' | 'edge' | 'custom';
export type TtsNormalProvider = TtsEngineProvider;
export type TtsJpProvider = TtsEngineProvider;
export type TtsProvider = 'fish-audio' | 'edge' | 'custom' | 'webspeech' | 'universal';

export interface ApiConfig {
  // Universal OpenAI-Compatible Gateway
  baseUrl: string;
  apiKey: string;
  model: string;
  availableModels?: string[];

  // Optional legacy fields for backward compatibility
  /** @deprecated Legacy provider identifier. Use baseUrl and apiKey instead. */
  provider?: string;
  /** @deprecated Legacy LM Studio server URL. Use baseUrl instead. */
  lmStudioUrl?: string;
  /** @deprecated Legacy LM Studio model name. Use model instead. */
  lmStudioModel?: string;
  /** @deprecated Legacy DeepSeek API key. Use apiKey instead. */
  deepseekApiKey?: string;
  /** @deprecated Legacy DeepSeek model name. Use model instead. */
  deepseekModel?: string;
  /** @deprecated Legacy OpenRouter API key. Use apiKey instead. */
  openRouterApiKey?: string;
  /** @deprecated Legacy OpenRouter model name. Use model instead. */
  openRouterModel?: string;

  // Speech Output Mode
  ttsMode?: TtsMode;

  // Normal (Chat Language) TTS Configuration
  normalTtsProvider?: TtsNormalProvider;
  normalTtsUrl?: string;
  normalTtsApiKey?: string;
  normalTtsModel?: string;
  normalTtsVoice?: string;
  normalTtsReferenceId?: string;

  // Japanese Dubbing (JP) TTS Configuration
  jpTtsProvider?: TtsJpProvider;
  jpTtsUrl?: string;
  jpTtsApiKey?: string;
  jpTtsModel?: string;
  jpTtsVoice?: string;
  jpTtsReferenceId?: string;

  // Legacy TTS fields for seamless backward compatibility
  /** @deprecated Legacy general TTS provider. Use normalTtsProvider or jpTtsProvider instead. */
  ttsProvider?: TtsProvider;
  /** @deprecated Legacy Fish Audio key. Use normalTtsApiKey or jpTtsApiKey instead. */
  fishAudioApiKey?: string;
  /** @deprecated Legacy Fish Audio reference ID. Use normalTtsReferenceId or jpTtsReferenceId instead. */
  fishAudioReferenceId?: string;
  /** @deprecated Legacy Fish Audio model. Use normalTtsModel or jpTtsModel instead. */
  fishAudioModel?: string;
  /** @deprecated Legacy custom TTS URL. Use normalTtsUrl or jpTtsUrl instead. */
  customTtsUrl?: string;
  /** @deprecated Legacy custom TTS API key. Use normalTtsApiKey or jpTtsApiKey instead. */
  customTtsApiKey?: string;
  /** @deprecated Legacy custom TTS model. Use normalTtsModel or jpTtsModel instead. */
  customTtsModel?: string;
  /** @deprecated Legacy custom TTS voice ID. Use normalTtsVoice or jpTtsVoice instead. */
  customTtsVoiceId?: string;
}

export interface UserProfile {
  id: string;               // Supabase user ID
  email: string;            // OAuth account email (may be private/empty)
  username: string;         // Unique handle (@username)
  nickname: string;         // Display name
  picture: string;          // Avatar URL
  gender?: 'male' | 'female' | 'non-binary' | 'unspecified';
  bio?: string;
  isSetupComplete: boolean; // True once the first-run profile setup is done
  createdAt: number;
}

export interface ChatSession {
  id: string;               // Session UUID / Timestamp
  title: string;            // Conversation Title
  characterId: string;      // Character ID ('firefly')
  provider?: string;        // Active model or provider tag
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  summary?: string;         // Episodic personal memory reflection
  lastSummarizedIndex?: number; // Last message index consolidated into summary
  currentEmotion?: string;  // Active persistent mood / emotional state
}



export type SenderType = 'user' | 'ai';

export interface ChatMessage {
  id: string;
  sender: SenderType;
  characterId: string;
  text: string;
  originalText?: string;
  rawText?: string;
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
  provider?: string;
  lmStudioUrl?: string;
  lmStudioModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  openRouterApiKey?: string;
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
  ttsProvider?: TtsProvider;
  fishAudioApiKey?: string;
  fishAudioReferenceId?: string;
  fishAudioModel?: string;
  customTtsUrl?: string;
  customTtsApiKey?: string;
  customTtsModel?: string;
  customTtsVoiceId?: string;
}

export interface UserProfile {
  id: string;               // Google sub ID
  email: string;            // Google email address
  username: string;         // Unique handle (@username)
  nickname: string;         // Display name
  picture: string;          // Avatar URL
  gender?: 'male' | 'female' | 'non-binary' | 'unspecified';
  bio?: string;
  isSetupComplete: boolean; // Discord onboarding flag
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
}



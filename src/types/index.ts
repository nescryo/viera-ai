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

export type ApiProvider = 'deepseek' | 'lmstudio' | 'gemini' | 'openrouter' | 'mock';

export type TtsProvider = 'edge' | 'vits' | 'voicevox' | 'style-bert-vits2' | 'webspeech' | 'fish-audio';

export interface ApiConfig {
  provider: ApiProvider;
  lmStudioUrl: string;
  lmStudioModel: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  openRouterApiKey: string;
  openRouterModel: string;
  ttsProvider?: TtsProvider;
  vitsServerUrl?: string;
  styleBertUrl?: string;
  voicevoxSpeakerId?: number;
  fishAudioApiKey?: string;
  fishAudioReferenceId?: string;
  fishAudioModel?: string;
}

export interface VoicevoxStyle {
  id: number;
  name: string;
  type?: string;
}

export interface VoicevoxSpeaker {
  name: string;
  speaker_uuid: string;
  styles: VoicevoxStyle[];
  version?: string;
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
  provider: ApiProvider;    // Active LLM provider
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}


export interface AiProviderInfo {
  id: string;
  name: string;
  domain: string;
  description: string;
  defaultBaseUrl: string;
  defaultModel: string;
  placeholder: string;
  requiresApiKey: boolean;
  helpUrl?: string;
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    domain: 'openrouter.ai',
    description: 'Unified gateway to 300+ models (Claude 3.5, GPT-4o, DeepSeek, Llama 3.3)',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
    placeholder: 'sk-or-v1-xxxxxxxxxxxxxxxx',
    requiresApiKey: true,
    helpUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    domain: 'deepseek.com',
    description: 'Official DeepSeek API (deepseek-chat, deepseek-reasoner)',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    placeholder: 'sk-xxxxxxxxxxxxxxxx',
    requiresApiKey: true,
    helpUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'groq',
    name: 'Groq',
    domain: 'groq.com',
    description: 'Ultra-fast LPU inference (Llama 3.3 70B, Mixtral)',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    placeholder: 'gsk_xxxxxxxxxxxxxxxx',
    requiresApiKey: true,
    helpUrl: 'https://console.groq.com/keys'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    domain: 'openai.com',
    description: 'Official OpenAI API (GPT-4o, GPT-4o-mini)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    placeholder: 'sk-proj-xxxxxxxxxxxxxxxx',
    requiresApiKey: true,
    helpUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    domain: 'ai.google.dev',
    description: 'Google Gemini via OpenAI-compatible endpoint',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-1.5-flash',
    placeholder: 'AIzaSyxxxxxxxxxxxxxxxx',
    requiresApiKey: true,
    helpUrl: 'https://aistudio.google.com/app/apikey'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    domain: 'localhost:1234',
    description: 'Private local inference server on your PC',
    defaultBaseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    placeholder: 'Not required for localhost',
    requiresApiKey: false
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    domain: 'localhost:11434',
    description: 'Run open-weight models locally with Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    placeholder: 'Not required for localhost',
    requiresApiKey: false
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-Compatible)',
    domain: 'custom endpoint',
    description: 'Self-hosted vLLM, Together AI, or custom server proxy',
    defaultBaseUrl: '',
    defaultModel: '',
    placeholder: 'sk-... (if required)',
    requiresApiKey: true
  }
];

export function getProviderById(id: string): AiProviderInfo {
  return AI_PROVIDERS.find(p => p.id === id) || AI_PROVIDERS[0];
}

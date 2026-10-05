import React, { useState, useRef, useCallback } from 'react';
import type { ApiConfig, TtsMode, TtsNormalProvider, TtsJpProvider } from '../../types';
import { X, Save, Settings2 } from 'lucide-react';
import { validateApiKeyAndFetchModels } from '../../services/aiService';
import { AI_PROVIDERS, type AiProviderInfo, getProviderById } from '../../data/aiProviders';
import { ttsService } from '../../services/ttsService';
import { DEFAULT_CHARACTER_PACKAGE } from '../../characters/registry';
import { AiSection, type ValidationStatus } from './settings/AiSection';
import { VoiceEngineFields } from './settings/VoiceEngineFields';
import './forms/forms.css';
import './settings/settings.css';

interface SettingsModalProps {
  apiConfig: ApiConfig;
  onSaveConfig: (newConfig: ApiConfig) => void;
  onClose: () => void;
}

type SettingsTab = 'chat' | 'voice';

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'voice', label: 'Voice' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  apiConfig,
  onSaveConfig,
  onClose
}) => {
  // Determine initial provider from apiConfig
  const initialProvider = (() => {
    if (apiConfig.provider && AI_PROVIDERS.some(p => p.id === apiConfig.provider)) {
      return apiConfig.provider;
    }
    const currentBaseUrl = apiConfig.baseUrl || '';
    const matched = AI_PROVIDERS.find(p => p.defaultBaseUrl && currentBaseUrl.includes(p.defaultBaseUrl.replace('/api/v1', '').replace('/v1', '')));
    return matched ? matched.id : 'openrouter';
  })();

  const [selectedProviderId, setSelectedProviderId] = useState<string>(initialProvider);
  const activeProvider = getProviderById(selectedProviderId);

  // Connection State
  const [baseUrl, setBaseUrl] = useState<string>(apiConfig.baseUrl || activeProvider.defaultBaseUrl);
  const [apiKey, setApiKey] = useState<string>(apiConfig.apiKey || apiConfig.deepseekApiKey || apiConfig.openRouterApiKey || '');
  const [model, setModel] = useState<string>(apiConfig.model || apiConfig.deepseekModel || activeProvider.defaultModel);
  const [availableModels, setAvailableModels] = useState<string[]>(apiConfig.availableModels || []);

  // Validation State
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Split TTS States (Normal vs Japanese JP)
  const [ttsMode, setTtsMode] = useState<TtsMode>(apiConfig.ttsMode || 'follow-chat');

  // Normal (Chat Language) TTS Configuration
  const [normalTtsProvider, setNormalTtsProvider] = useState<TtsNormalProvider>(
    apiConfig.normalTtsProvider || (apiConfig.ttsProvider as TtsNormalProvider) || 'fish-audio'
  );
  const [normalTtsUrl, setNormalTtsUrl] = useState(apiConfig.normalTtsUrl || apiConfig.customTtsUrl || '');
  const [normalTtsApiKey, setNormalTtsApiKey] = useState(
    apiConfig.normalTtsApiKey ||
    (apiConfig.normalTtsProvider === 'fish-audio' || !apiConfig.normalTtsProvider ? apiConfig.fishAudioApiKey : apiConfig.customTtsApiKey) ||
    apiConfig.fishAudioApiKey ||
    apiConfig.customTtsApiKey ||
    ''
  );
  const [normalTtsModel, setNormalTtsModel] = useState(() => {
    if (apiConfig.normalTtsModel) return apiConfig.normalTtsModel;
    const initialProvider = apiConfig.normalTtsProvider || (apiConfig.ttsProvider as TtsNormalProvider) || 'fish-audio';
    if (initialProvider === 'fish-audio') return apiConfig.fishAudioModel || 's2.1-pro-free';
    return apiConfig.customTtsModel || 'tts-1';
  });
  const [normalTtsVoice, setNormalTtsVoice] = useState(apiConfig.normalTtsVoice || apiConfig.customTtsVoiceId || 'nova');
  const [normalTtsReferenceId, setNormalTtsReferenceId] = useState(
    apiConfig.normalTtsReferenceId || (apiConfig.fishAudioReferenceId === '7f92f8afb8ec43bf81429cc1c9199cb1' ? '' : (apiConfig.fishAudioReferenceId || ''))
  );

  // Japanese Dubbing (JP) TTS Configuration
  const [jpTtsProvider, setJpTtsProvider] = useState<TtsJpProvider>(apiConfig.jpTtsProvider || 'fish-audio');
  const [jpTtsModel, setJpTtsModel] = useState(apiConfig.jpTtsModel || apiConfig.fishAudioModel || 's2.1-pro-free');
  const [jpTtsReferenceId, setJpTtsReferenceId] = useState(
    apiConfig.jpTtsReferenceId || (apiConfig.fishAudioReferenceId === '7f92f8afb8ec43bf81429cc1c9199cb1' ? '' : (apiConfig.fishAudioReferenceId || ''))
  );
  const [jpTtsApiKey, setJpTtsApiKey] = useState(apiConfig.jpTtsApiKey || apiConfig.fishAudioApiKey || '');
  const [jpTtsUrl, setJpTtsUrl] = useState(apiConfig.jpTtsUrl || '');
  const [jpTtsVoice, setJpTtsVoice] = useState(apiConfig.jpTtsVoice || '');

  // Audio Testing State
  const [isTestingAudio, setIsTestingAudio] = useState<'normal' | 'jp' | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Validation function
  const handleValidate = useCallback(async (targetUrl: string, targetKey: string, providerInfo: AiProviderInfo) => {
    const finalUrl = targetUrl || providerInfo.defaultBaseUrl;
    if (!finalUrl.trim()) return;

    if (providerInfo.requiresApiKey && !targetKey.trim()) {
      setValidationStatus('idle');
      setValidationError(null);
      return;
    }

    setValidationStatus('validating');
    setValidationError(null);

    const result = await validateApiKeyAndFetchModels(finalUrl, targetKey);

    if (result.success) {
      setValidationStatus('valid');
      setValidationError(null);
      setAvailableModels(result.models);

      // Auto-select valid model if current model is empty or not in list
      if (result.models.length > 0 && !result.models.includes(model)) {
        const preferred = result.models.find(m => m.toLowerCase().includes('deepseek') || m.toLowerCase().includes('flash') || m.toLowerCase().includes('chat')) || result.models[0];
        setModel(preferred);
      }
    } else {
      setValidationStatus('invalid');
      setValidationError(result.error || 'API Key validation failed.');
    }
  }, [model]);

  // Handle provider card click
  const handleSelectProvider = (provider: AiProviderInfo) => {
    setSelectedProviderId(provider.id);
    const newBaseUrl = provider.defaultBaseUrl;
    setBaseUrl(newBaseUrl);

    if (provider.id !== 'custom') {
      setModel(provider.defaultModel);
    }

    // Trigger validation with new provider URL
    if (apiKey.trim() || !provider.requiresApiKey) {
      handleValidate(newBaseUrl, apiKey, provider);
    } else {
      setValidationStatus('idle');
      setValidationError(null);
      setAvailableModels([]);
    }
  };

  // Debounced API Key input handler (600ms debounce)
  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!val.trim() && activeProvider.requiresApiKey) {
      setValidationStatus('idle');
      setValidationError(null);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      handleValidate(baseUrl, val, activeProvider);
    }, 600);
  };

  // Base URL change handler
  const handleBaseUrlChange = (val: string) => {
    setBaseUrl(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      handleValidate(val, apiKey, activeProvider);
    }, 600);
  };

  const handleTestVoice = async (tab: 'normal' | 'jp') => {
    if (isTestingAudio) {
      ttsService.stop();
      setIsTestingAudio(null);
      return;
    }

    setIsTestingAudio(tab);

    const testConfig: ApiConfig = {
      ...apiConfig,
      ttsMode,
      normalTtsProvider,
      normalTtsUrl: normalTtsUrl.trim(),
      normalTtsApiKey: normalTtsApiKey.trim(),
      normalTtsModel: normalTtsModel.trim(),
      normalTtsVoice: normalTtsVoice.trim(),
      normalTtsReferenceId: normalTtsReferenceId.trim(),

      jpTtsProvider,
      jpTtsModel: jpTtsModel.trim(),
      jpTtsReferenceId: jpTtsReferenceId.trim(),
      jpTtsApiKey: jpTtsApiKey.trim(),
      jpTtsUrl: jpTtsUrl.trim(),
      jpTtsVoice: jpTtsVoice.trim(),

      // Map to active test provider
      ttsProvider: tab === 'jp' ? jpTtsProvider : normalTtsProvider,
      fishAudioApiKey: tab === 'jp' ? jpTtsApiKey.trim() : (normalTtsApiKey.trim() || apiConfig.fishAudioApiKey || ''),
      fishAudioReferenceId: tab === 'jp' ? jpTtsReferenceId.trim() : normalTtsReferenceId.trim(),
      fishAudioModel: tab === 'jp' ? jpTtsModel.trim() : (normalTtsProvider === 'fish-audio' && (!normalTtsModel || normalTtsModel === 'tts-1') ? 's2.1-pro-free' : normalTtsModel.trim()),
      customTtsUrl: tab === 'jp' ? jpTtsUrl.trim() : normalTtsUrl.trim(),
      customTtsApiKey: tab === 'jp' ? jpTtsApiKey.trim() : normalTtsApiKey.trim(),
      customTtsModel: tab === 'jp' ? jpTtsModel.trim() : normalTtsModel.trim(),
      customTtsVoiceId: tab === 'jp' ? jpTtsVoice.trim() : (normalTtsVoice.trim() || 'nova'),
    };

    const testPersona = {
      id: DEFAULT_CHARACTER_PACKAGE.id,
      name: DEFAULT_CHARACTER_PACKAGE.name,
      tagline: DEFAULT_CHARACTER_PACKAGE.tagline || '',
      greeting: '',
      systemPrompt: '',
      avatarUrl: DEFAULT_CHARACTER_PACKAGE.avatarUrl,
      voice: { ...DEFAULT_CHARACTER_PACKAGE.voice, lang: tab === 'jp' ? 'ja-JP' : (DEFAULT_CHARACTER_PACKAGE.voice?.lang || 'en-US') },
      category: DEFAULT_CHARACTER_PACKAGE.category
    };

    const testText = tab === 'jp'
      ? "こんにちは！日本語の音声エンジンは正常に動作しています。"
      : "Hello! Normal chat voice synthesis is configured and active.";

    try {
      await ttsService.speak(
        testText,
        testPersona,
        () => {},
        () => setIsTestingAudio(null),
        undefined,
        testConfig
      );
    } catch (err) {
      console.warn('[Viera Settings] Test audio failed:', err);
      setIsTestingAudio(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      ...apiConfig,
      provider: selectedProviderId,
      baseUrl: (baseUrl || activeProvider.defaultBaseUrl).trim(),
      apiKey: apiKey.trim(),
      model: model.trim() || activeProvider.defaultModel,
      availableModels,

      // Modern Split TTS
      ttsMode,
      normalTtsProvider,
      normalTtsUrl: normalTtsUrl.trim(),
      normalTtsApiKey: normalTtsApiKey.trim(),
      normalTtsModel: normalTtsModel.trim(),
      normalTtsVoice: normalTtsVoice.trim(),
      normalTtsReferenceId: normalTtsReferenceId.trim(),

      jpTtsProvider,
      jpTtsModel: jpTtsModel.trim(),
      jpTtsReferenceId: jpTtsReferenceId.trim(),
      jpTtsApiKey: jpTtsApiKey.trim(),
      jpTtsUrl: jpTtsUrl.trim(),
      jpTtsVoice: jpTtsVoice.trim(),

      // Backward compatibility mappings
      ttsProvider: ttsMode === 'japanese-dub' ? jpTtsProvider : normalTtsProvider,
      fishAudioApiKey: (ttsMode === 'japanese-dub' ? jpTtsApiKey : (normalTtsProvider === 'fish-audio' ? (normalTtsApiKey || apiConfig.fishAudioApiKey || '') : jpTtsApiKey)).trim(),
      fishAudioReferenceId: (ttsMode === 'japanese-dub' ? jpTtsReferenceId : (normalTtsProvider === 'fish-audio' ? normalTtsReferenceId : jpTtsReferenceId)).trim(),
      fishAudioModel: (ttsMode === 'japanese-dub' ? jpTtsModel : (normalTtsProvider === 'fish-audio' ? (normalTtsModel === 'tts-1' ? 's2.1-pro-free' : normalTtsModel) : jpTtsModel)).trim(),
      customTtsUrl: (ttsMode === 'japanese-dub' ? jpTtsUrl : normalTtsUrl).trim(),
      customTtsApiKey: (ttsMode === 'japanese-dub' ? jpTtsApiKey : normalTtsApiKey).trim(),
      customTtsModel: (ttsMode === 'japanese-dub' ? jpTtsModel : normalTtsModel).trim(),
      customTtsVoiceId: (ttsMode === 'japanese-dub' ? jpTtsVoice : normalTtsVoice).trim(),
    });
    onClose();
  };

  // Keeps the model in sync when switching the chat-language voice engine
  const handleSelectNormalEngine = (id: TtsNormalProvider) => {
    setNormalTtsProvider(id);
    const isFishModel = normalTtsModel.startsWith('s2.1') || normalTtsModel.includes('fish-audio');
    if (id === 'fish-audio') {
      if (!isFishModel) setNormalTtsModel('s2.1-pro-free');
      if (!normalTtsApiKey && apiConfig.fishAudioApiKey) setNormalTtsApiKey(apiConfig.fishAudioApiKey);
    } else if (id === 'universal' || id === 'custom') {
      if (isFishModel) setNormalTtsModel('tts-1');
      if (id === 'universal' && !normalTtsVoice) setNormalTtsVoice('nova');
    }
  };

  const isJapanese = ttsMode === 'japanese-dub';

  // Tabs: arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern)
  const [activeTab, setActiveTab] = useState<SettingsTab>('chat');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const current = SETTINGS_TABS.findIndex((t) => t.id === activeTab);
    let next = current;
    if (e.key === 'ArrowRight') next = (current + 1) % SETTINGS_TABS.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = SETTINGS_TABS.length - 1;
    else return;
    e.preventDefault();
    setActiveTab(SETTINGS_TABS[next].id);
    tabRefs.current[next]?.focus();
  };
  const normalFishModel = normalTtsModel.startsWith('s2.1') || normalTtsModel.includes('fish-audio')
    ? normalTtsModel
    : 's2.1-pro-free';

  return (
    <div className="modal-backdrop glass-panel fade-in">
      <div className="modal-container glass-panel settings-modal">
        <div className="modal-header">
          <div className="modal-title-group">
            <Settings2 className="modal-icon" size={20} />
            <h3>Settings</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close settings">
            <X size={20} />
          </button>
        </div>

        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleTabKeyDown}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="settings-form">
          <div
            className="settings-modal-body"
            role="tabpanel"
            id={`settings-panel-${activeTab}`}
            aria-labelledby={`settings-tab-${activeTab}`}
          >
            {activeTab === 'chat' && (
            <AiSection
              provider={activeProvider}
              onSelectProvider={handleSelectProvider}
              apiKey={apiKey}
              onApiKeyChange={handleApiKeyChange}
              validationStatus={validationStatus}
              validationError={validationError}
              baseUrl={baseUrl}
              onBaseUrlChange={handleBaseUrlChange}
              model={model}
              onModelChange={setModel}
              availableModels={availableModels}
            />
            )}

            {activeTab === 'voice' && (
            <section className="settings-section">

              <label className="settings-toggle-row">
                <span className="settings-toggle-text">
                  <span className="settings-toggle-title">Speak in Japanese</span>
                  <span className="field-hint">Chat text stays in your language.</span>
                </span>
                <input
                  type="checkbox"
                  className="settings-switch"
                  checked={isJapanese}
                  onChange={(e) => setTtsMode(e.target.checked ? 'japanese-dub' : 'follow-chat')}
                />
              </label>

              {isJapanese ? (
                <VoiceEngineFields
                  key="jp"
                  variant="jp"
                  provider={jpTtsProvider}
                  onSelectProvider={(id: TtsJpProvider) => setJpTtsProvider(id)}
                  apiKey={jpTtsApiKey}
                  onApiKeyChange={setJpTtsApiKey}
                  referenceId={jpTtsReferenceId}
                  onReferenceIdChange={setJpTtsReferenceId}
                  url={jpTtsUrl}
                  onUrlChange={setJpTtsUrl}
                  voice={jpTtsVoice}
                  onVoiceChange={setJpTtsVoice}
                  model={jpTtsModel}
                  fishModel={jpTtsModel}
                  onModelChange={setJpTtsModel}
                  isTesting={isTestingAudio === 'jp'}
                  onTest={() => handleTestVoice('jp')}
                />
              ) : (
                <VoiceEngineFields
                  key="normal"
                  variant="normal"
                  provider={normalTtsProvider}
                  onSelectProvider={handleSelectNormalEngine}
                  apiKey={normalTtsApiKey}
                  onApiKeyChange={setNormalTtsApiKey}
                  referenceId={normalTtsReferenceId}
                  onReferenceIdChange={setNormalTtsReferenceId}
                  url={normalTtsUrl}
                  onUrlChange={setNormalTtsUrl}
                  voice={normalTtsVoice}
                  onVoiceChange={setNormalTtsVoice}
                  model={normalTtsModel}
                  fishModel={normalFishModel}
                  onModelChange={setNormalTtsModel}
                  isTesting={isTestingAudio === 'normal'}
                  onTest={() => handleTestVoice('normal')}
                />
              )}
            </section>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary">
              <Save size={16} />
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

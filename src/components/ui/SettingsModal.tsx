import React, { useState, useRef, useCallback } from 'react';
import type { ApiConfig, TtsMode, TtsNormalProvider, TtsJpProvider } from '../../types';
import { 
  X, Save, Settings2, CheckCircle, Volume2, Sparkles, Key, Globe,
  RefreshCw, AlertCircle, Search, ExternalLink, Sliders, Play, Square
} from 'lucide-react';
import { validateApiKeyAndFetchModels } from '../../services/aiService';
import { AI_PROVIDERS, type AiProviderInfo, getProviderById } from '../../data/aiProviders';
import { ttsService } from '../../services/ttsService';
import { DEFAULT_CHARACTER_PACKAGE } from '../../characters/registry';

interface SettingsModalProps {
  apiConfig: ApiConfig;
  onSaveConfig: (newConfig: ApiConfig) => void;
  onClose: () => void;
}

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
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // Validation State: 'idle' | 'validating' | 'valid' | 'invalid'
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
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

  // Filter models for search
  const filteredModels = availableModels.filter(m => 
    m.toLowerCase().includes(modelSearchQuery.toLowerCase())
  );

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

  // Dynamic Border Color:
  // - Valid: Biru (#3b82f6)
  // - Invalid: Merah (#ef4444)
  // - Validating: Kuning (#eab308)
  // - Idle: Normal
  const getApiKeyColumnStyle = (): React.CSSProperties => {
    if (validationStatus === 'valid') {
      return {
        borderColor: '#3b82f6',
        boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.35)',
        transition: 'border-color 0.25s ease, box-shadow 0.25s ease'
      };
    }
    if (validationStatus === 'invalid') {
      return {
        borderColor: '#ef4444',
        boxShadow: '0 0 0 2px rgba(239, 68, 68, 0.35)',
        transition: 'border-color 0.25s ease, box-shadow 0.25s ease'
      };
    }
    if (validationStatus === 'validating') {
      return {
        borderColor: '#eab308',
        boxShadow: '0 0 0 2px rgba(234, 179, 8, 0.35)',
        transition: 'border-color 0.25s ease, box-shadow 0.25s ease'
      };
    }
    return {
      transition: 'border-color 0.25s ease, box-shadow 0.25s ease'
    };
  };

  // Voice engine choices, written for people rather than for API docs.
  const normalEngineOptions: { id: TtsNormalProvider; title: string; desc: string; icon: React.ReactNode }[] = [
    { id: 'fish-audio', title: 'Fish Audio', desc: 'Character voices, needs a key', icon: <Sparkles size={20} style={{ color: '#60a5fa' }} /> },
    { id: 'universal', title: 'OpenAI / OpenRouter', desc: 'Uses your own key', icon: <Globe size={20} style={{ color: '#60a5fa' }} /> },
    { id: 'edge', title: 'Free voice', desc: 'No setup needed', icon: <Volume2 size={20} style={{ color: '#38bdf8' }} /> },
    { id: 'custom', title: 'Your own server', desc: 'Local or other services', icon: <Sliders size={20} style={{ color: '#a78bfa' }} /> },
  ];

  const jpEngineOptions: { id: TtsJpProvider; title: string; desc: string; icon: React.ReactNode }[] = [
    { id: 'fish-audio', title: 'Fish Audio', desc: 'Anime character voices', icon: <Sparkles size={20} style={{ color: '#f472b6' }} /> },
    { id: 'universal', title: 'OpenAI / OpenRouter', desc: 'Uses your own key', icon: <Globe size={20} style={{ color: '#60a5fa' }} /> },
    { id: 'edge', title: 'Free voice', desc: 'No setup needed', icon: <Volume2 size={20} style={{ color: '#38bdf8' }} /> },
    { id: 'custom', title: 'Your own server', desc: 'Local voice server', icon: <Sliders size={20} style={{ color: '#a78bfa' }} /> },
  ];

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
  const jpAccent = '#ec4899';

  return (
    <div className="modal-backdrop glass-panel fade-in">
      <div className="modal-container glass-panel settings-modal" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Settings2 className="modal-icon" size={20} />
            <h3>Settings</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close settings">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="settings-form">
          <div className="settings-modal-body">
            {/* CHAT */}
            <div className="form-group">
              <label className="settings-section-title">
                <Sparkles size={16} style={{ color: '#3b82f6' }} /> Chat
              </label>

              <div
                className="provider-selector-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '10px',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  paddingRight: '4px'
                }}
              >
                {AI_PROVIDERS.map((provider) => {
                  const isSelected = selectedProviderId === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className={`provider-card ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelectProvider(provider)}
                      aria-pressed={isSelected}
                      style={{
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        borderRadius: '10px',
                        border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        flexShrink: 0,
                        borderRadius: '50%',
                        border: isSelected ? '5px solid #3b82f6' : '2px solid rgba(255, 255, 255, 0.3)',
                        background: isSelected ? '#ffffff' : 'transparent',
                        transition: 'all 0.2s ease'
                      }} />
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                        {provider.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="provider-details-box fade-in" style={{ marginTop: '14px', padding: '16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {/* API key: validated automatically while typing */}
              {activeProvider.requiresApiKey ? (
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Key size={14} /> API key
                    </label>
                    {activeProvider.helpUrl && (
                      <a
                        href={activeProvider.helpUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '0.75rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                      >
                        Get a key <ExternalLink size={11} />
                      </a>
                    )}
                  </div>

                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={activeProvider.placeholder}
                    className="form-input"
                    style={getApiKeyColumnStyle()}
                    aria-invalid={validationStatus === 'invalid'}
                  />

                  {validationStatus === 'valid' && (
                    <div className="field-status" style={{ color: '#3b82f6' }}>
                      <CheckCircle size={14} />
                      <span>Connected</span>
                    </div>
                  )}
                  {validationStatus === 'invalid' && (
                    <div className="field-status" style={{ color: '#ef4444' }} role="alert">
                      <AlertCircle size={14} />
                      <span>{validationError || "Couldn't connect. Check the key and try again."}</span>
                    </div>
                  )}
                  {validationStatus === 'validating' && (
                    <div className="field-status" style={{ color: '#eab308' }}>
                      <RefreshCw size={14} className="spin" />
                      <span>Checking…</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="field-hint" style={{ marginTop: 0, marginBottom: '14px' }}>
                  Runs on your computer. No key needed.
                </p>
              )}

              {/* Server address is only required for a custom provider */}
              {selectedProviderId === 'custom' && (
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>Server address</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => handleBaseUrlChange(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="form-input"
                    required
                  />
                </div>
              )}

              {/* Model */}
              <div className="form-group" style={{ marginBottom: '4px' }}>
                <label className="form-label" style={{ fontSize: '0.82rem', marginBottom: '6px' }}>Model</label>
                {availableModels.length > 0 ? (
                  <div>
                    {availableModels.length > 8 && (
                      <div style={{ position: 'relative', marginBottom: '6px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                          type="text"
                          value={modelSearchQuery}
                          onChange={(e) => setModelSearchQuery(e.target.value)}
                          placeholder="Search models"
                          className="form-input"
                          style={{ paddingLeft: '32px', fontSize: '0.82rem' }}
                          aria-label="Search models"
                        />
                      </div>
                    )}
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="form-input"
                      style={{ fontSize: '0.85rem' }}
                    >
                      {filteredModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      {filteredModels.length === 0 && (
                        <option value={model} disabled>No matching models</option>
                      )}
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={activeProvider.defaultModel || 'Model name'}
                    className="form-input"
                  />
                )}
              </div>

              {selectedProviderId !== 'custom' && (
                <details className="settings-advanced">
                  <summary>Advanced</summary>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>Server address</label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => handleBaseUrlChange(e.target.value)}
                      placeholder={activeProvider.defaultBaseUrl}
                      className="form-input"
                    />
                    <span className="field-hint">Only change this if you know you need to.</span>
                  </div>
                </details>
              )}
            </div>

            {/* VOICE */}
            <div className="tts-split-container">
              <label className="settings-section-title">
                <Volume2 size={16} style={{ color: '#60a5fa' }} /> Voice
              </label>

              <label className="settings-toggle-row">
                <span className="settings-toggle-text">
                  <span className="settings-toggle-title">Speak in Japanese</span>
                  <span className="field-hint" style={{ marginTop: 0 }}>Chat text stays in your language.</span>
                </span>
                <input
                  type="checkbox"
                  className="settings-switch"
                  checked={isJapanese}
                  onChange={(e) => setTtsMode(e.target.checked ? 'japanese-dub' : 'follow-chat')}
                />
              </label>

              {/* Voice for the chat language */}
              {!isJapanese && (
                <div className="provider-details-box fade-in" style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                  <div className="provider-selector-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                    {normalEngineOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`provider-card ${normalTtsProvider === opt.id ? 'active' : ''}`}
                        onClick={() => handleSelectNormalEngine(opt.id)}
                        aria-pressed={normalTtsProvider === opt.id}
                      >
                        {opt.icon}
                        <div className="provider-card-info">
                          <span className="p-title">{opt.title}</span>
                          <span className="p-desc">{opt.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {normalTtsProvider === 'fish-audio' && (
                    <div className="fade-in" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Fish Audio key</label>
                        <input
                          type="password"
                          value={normalTtsApiKey}
                          onChange={(e) => setNormalTtsApiKey(e.target.value)}
                          placeholder="Paste your Fish Audio key"
                          className="form-input"
                        />
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Voice ID</label>
                        <input
                          type="text"
                          value={normalTtsReferenceId}
                          onChange={(e) => setNormalTtsReferenceId(e.target.value)}
                          placeholder="Leave empty for the default voice"
                          className="form-input"
                        />
                        <a className="field-link" href="https://fish.audio/models" target="_blank" rel="noreferrer">
                          Find voices on fish.audio <ExternalLink size={12} />
                        </a>
                      </div>

                      <details className="settings-advanced">
                        <summary>Advanced</summary>
                        <div className="form-group">
                          <label className="form-label">Voice quality</label>
                          <select
                            value={normalTtsModel.startsWith('s2.1') || normalTtsModel.includes('fish-audio') ? normalTtsModel : 's2.1-pro-free'}
                            onChange={(e) => setNormalTtsModel(e.target.value)}
                            className="form-input"
                          >
                            <option value="s2.1-pro-free">Free</option>
                            <option value="s2.1-pro">Standard (paid)</option>
                            <option value="fish-audio/s2.1-pro-free">Free, via OpenRouter</option>
                          </select>
                        </div>
                      </details>
                    </div>
                  )}

                  {(normalTtsProvider === 'universal' || normalTtsProvider === 'custom') && (
                    <div className="fade-in" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Server address</label>
                        <input
                          type="text"
                          value={normalTtsUrl}
                          onChange={(e) => setNormalTtsUrl(e.target.value)}
                          placeholder="https://api.openai.com/v1/audio/speech"
                          className="form-input"
                        />
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">API key</label>
                        <input
                          type="password"
                          value={normalTtsApiKey}
                          onChange={(e) => setNormalTtsApiKey(e.target.value)}
                          placeholder="Paste your key"
                          className="form-input"
                        />
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Voice</label>
                        <input
                          type="text"
                          value={normalTtsVoice}
                          onChange={(e) => setNormalTtsVoice(e.target.value)}
                          placeholder="e.g. nova"
                          className="form-input"
                        />
                      </div>

                      <details className="settings-advanced">
                        <summary>Advanced</summary>
                        <div className="form-group">
                          <label className="form-label">Model</label>
                          <input
                            type="text"
                            value={normalTtsModel}
                            onChange={(e) => setNormalTtsModel(e.target.value)}
                            placeholder="tts-1"
                            className="form-input"
                          />
                        </div>
                      </details>
                    </div>
                  )}

                  <div className="tts-test-preview-bar" style={{ justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className={`tts-test-btn ${isTestingAudio === 'normal' ? 'testing' : ''}`}
                      onClick={() => handleTestVoice('normal')}
                    >
                      {isTestingAudio === 'normal' ? <Square size={14} /> : <Play size={14} />}
                      <span>{isTestingAudio === 'normal' ? 'Stop' : 'Play sample'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Japanese voice */}
              {isJapanese && (
                <div className="provider-details-box fade-in" style={{ borderColor: 'rgba(236, 72, 153, 0.3)' }}>
                  <div className="provider-selector-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                    {jpEngineOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`provider-card ${jpTtsProvider === opt.id ? 'active' : ''}`}
                        onClick={() => setJpTtsProvider(opt.id)}
                        aria-pressed={jpTtsProvider === opt.id}
                        style={{ borderColor: jpTtsProvider === opt.id ? jpAccent : undefined }}
                      >
                        {opt.icon}
                        <div className="provider-card-info">
                          <span className="p-title">{opt.title}</span>
                          <span className="p-desc">{opt.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {jpTtsProvider === 'fish-audio' && (
                    <div className="fade-in" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Fish Audio key</label>
                        <input
                          type="password"
                          value={jpTtsApiKey}
                          onChange={(e) => setJpTtsApiKey(e.target.value)}
                          placeholder="Paste your Fish Audio key"
                          className="form-input"
                        />
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Voice ID</label>
                        <input
                          type="text"
                          value={jpTtsReferenceId}
                          onChange={(e) => setJpTtsReferenceId(e.target.value)}
                          placeholder="Leave empty for the default voice"
                          className="form-input"
                        />
                        <a className="field-link" href="https://fish.audio/models" target="_blank" rel="noreferrer" style={{ color: '#f472b6' }}>
                          Find voices on fish.audio <ExternalLink size={12} />
                        </a>
                      </div>

                      <details className="settings-advanced">
                        <summary>Advanced</summary>
                        <div className="form-group">
                          <label className="form-label">Voice quality</label>
                          <select
                            value={jpTtsModel}
                            onChange={(e) => setJpTtsModel(e.target.value)}
                            className="form-input"
                          >
                            <option value="s2.1-pro-free">Free</option>
                            <option value="s2.1-pro">Standard (paid)</option>
                            <option value="fish-audio/s2.1-pro-free">Free, via OpenRouter</option>
                          </select>
                        </div>
                      </details>
                    </div>
                  )}

                  {(jpTtsProvider === 'universal' || jpTtsProvider === 'custom') && (
                    <div className="fade-in" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Server address</label>
                        <input
                          type="text"
                          value={jpTtsUrl}
                          onChange={(e) => setJpTtsUrl(e.target.value)}
                          placeholder="https://openrouter.ai/api/v1/audio/speech"
                          className="form-input"
                        />
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">API key</label>
                        <input
                          type="password"
                          value={jpTtsApiKey}
                          onChange={(e) => setJpTtsApiKey(e.target.value)}
                          placeholder="Paste your key"
                          className="form-input"
                        />
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Voice</label>
                        <input
                          type="text"
                          value={jpTtsVoice}
                          onChange={(e) => setJpTtsVoice(e.target.value)}
                          placeholder="Voice name or ID"
                          className="form-input"
                        />
                      </div>

                      <details className="settings-advanced">
                        <summary>Advanced</summary>
                        <div className="form-group">
                          <label className="form-label">Model</label>
                          <input
                            type="text"
                            value={jpTtsModel}
                            onChange={(e) => setJpTtsModel(e.target.value)}
                            placeholder="tts-1"
                            className="form-input"
                          />
                        </div>
                      </details>
                    </div>
                  )}

                  <div className="tts-test-preview-bar" style={{ justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className={`tts-test-btn ${isTestingAudio === 'jp' ? 'testing' : ''}`}
                      onClick={() => handleTestVoice('jp')}
                      style={{ borderColor: isTestingAudio === 'jp' ? jpAccent : undefined, color: isTestingAudio === 'jp' ? '#fbcfe8' : undefined }}
                    >
                      {isTestingAudio === 'jp' ? <Square size={14} /> : <Play size={14} />}
                      <span>{isTestingAudio === 'jp' ? 'Stop' : 'Play sample'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-save">
              <Save size={16} />
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

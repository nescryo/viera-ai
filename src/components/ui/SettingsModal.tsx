import React, { useState, useRef, useCallback } from 'react';
import type { ApiConfig, TtsMode, TtsNormalProvider, TtsJpProvider } from '../../types';
import { 
  X, Save, Server, CheckCircle, Volume2, Sparkles, Key, Globe,
  RefreshCw, AlertCircle, Search, ExternalLink, Check,
  Languages, Sliders, Play, Info, Square
} from 'lucide-react';
import { validateApiKeyAndFetchModels } from '../../services/aiService';
import { AI_PROVIDERS, type AiProviderInfo, getProviderById } from '../../data/aiProviders';
import { ttsService } from '../../services/ttsService';

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
  const [showAdvancedUrl, setShowAdvancedUrl] = useState(selectedProviderId === 'custom');

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
    setShowAdvancedUrl(provider.id === 'custom');

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
      id: 'firefly',
      name: 'Firefly',
      tagline: '',
      greeting: '',
      systemPrompt: '',
      avatarUrl: '',
      voice: { pitch: 1.15, rate: 0.98, lang: tab === 'jp' ? 'ja-JP' : 'en-US' },
      category: 'Honkai: Star Rail' as const
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

  return (
    <div className="modal-backdrop glass-panel fade-in">
      <div className="modal-container glass-panel settings-modal" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Server className="modal-icon" size={20} />
            <h3>AI & TTS Voice Settings</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="settings-form">
          <div className="settings-modal-body">
            {/* STEP 1: CHOOSE AN AI PROVIDER */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.92rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} style={{ color: '#3b82f6' }} /> 1. Choose an AI Provider
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
                      style={{
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: '10px',
                        border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          border: isSelected ? '5px solid #3b82f6' : '2px solid rgba(255, 255, 255, 0.3)',
                          background: isSelected ? '#ffffff' : 'transparent',
                          transition: 'all 0.2s ease'
                        }} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem', color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                            {provider.name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            {provider.domain}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check size={16} color="#3b82f6" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 2: PROVIDER CONFIGURATION & API KEY */}
            <div className="provider-details-box fade-in" style={{ marginTop: '14px', padding: '16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {/* API Key Input with Dynamic Border & Validator */}
              {activeProvider.requiresApiKey ? (
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Key size={14} /> {activeProvider.name} API Key
                    </label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {activeProvider.helpUrl && (
                        <a 
                          href={activeProvider.helpUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={{ fontSize: '0.75rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                        >
                          Get API Key <ExternalLink size={11} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleValidate(baseUrl, apiKey, activeProvider)}
                        disabled={validationStatus === 'validating'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#3b82f6',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <RefreshCw size={12} className={validationStatus === 'validating' ? 'spin' : ''} />
                        {validationStatus === 'validating' ? 'Verifying...' : 'Check Key'}
                      </button>
                    </div>
                  </div>

                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={activeProvider.placeholder}
                    className="form-input"
                    style={getApiKeyColumnStyle()}
                  />

                  {/* Dynamic Status Message */}
                  {validationStatus === 'valid' && (
                    <div style={{ color: '#3b82f6', fontSize: '0.78rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={14} color="#3b82f6" />
                      <span>Valid API Key! Discovered {availableModels.length} active models.</span>
                    </div>
                  )}
                  {validationStatus === 'invalid' && (
                    <div style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={14} color="#ef4444" />
                      <span>{validationError || 'Invalid API Key or server endpoint is unreachable.'}</span>
                    </div>
                  )}
                  {validationStatus === 'validating' && (
                    <div style={{ color: '#eab308', fontSize: '0.78rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RefreshCw size={14} className="spin" />
                      <span>Verifying API Key & fetching models...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.8rem', color: '#93c5fd' }}>
                  ℹ️ {activeProvider.name} runs on your local machine (localhost). No API Key required.
                </div>
              )}

              {/* Endpoint URL (Toggleable / Editable for Custom or Local) */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="form-label" style={{ fontSize: '0.82rem' }}>Server Endpoint URL</label>
                  {selectedProviderId !== 'custom' && (
                    <button
                      type="button"
                      onClick={() => setShowAdvancedUrl(!showAdvancedUrl)}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      {showAdvancedUrl ? 'Hide URL' : 'Edit Endpoint URL (Advanced)'}
                    </button>
                  )}
                </div>
                {(showAdvancedUrl || selectedProviderId === 'custom') && (
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => handleBaseUrlChange(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="form-input"
                    required
                  />
                )}
              </div>

              {/* STEP 3: DYNAMIC MODEL SELECTION */}
              <div style={{ marginBottom: '4px' }}>
                <label className="form-label" style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Select LLM Model ({availableModels.length > 0 ? `${availableModels.length} models available` : 'Default Model'})</span>
                  {availableModels.length > 0 && (
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Discovered dynamically from provider</span>
                  )}
                </label>

                {availableModels.length > 0 ? (
                  <div>
                    {availableModels.length > 8 && (
                      <div style={{ position: 'relative', marginBottom: '6px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                          type="text"
                          value={modelSearchQuery}
                          onChange={(e) => setModelSearchQuery(e.target.value)}
                          placeholder="Search models (e.g. claude, deepseek, llama, gpt)..."
                          className="form-input"
                          style={{ paddingLeft: '32px', fontSize: '0.82rem' }}
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
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      {filteredModels.length === 0 && (
                        <option value={model} disabled>
                          No models match your search query
                        </option>
                      )}
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={activeProvider.defaultModel || "e.g. gpt-4o, deepseek-chat"}
                    className="form-input"
                  />
                )}
              </div>
            </div>

            {/* SECTION 2: SPEECH OUTPUT & SPLIT TTS ARCHITECTURE */}
            <div className="tts-split-container">
              <div>
                <label className="form-label" style={{ fontSize: '0.98rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Volume2 size={18} style={{ color: '#60a5fa' }} />
                  <span>2. Speech Synthesis Engines (Normal vs Japanese JP)</span>
                </label>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'block' }}>
                  Separate voice engines for primary chat language vs authentic Japanese dubbing to prevent accent contamination.
                </span>
              </div>

              {/* A. Active Voice Output Mode Selection */}
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.84rem', color: '#cbd5e1', marginBottom: '8px' }}>
                  Active Voice Output Mode:
                </label>
                <div className="tts-mode-card-grid">
                  <button
                    type="button"
                    className={`tts-mode-card ${ttsMode === 'follow-chat' ? 'active' : ''}`}
                    onClick={() => setTtsMode('follow-chat')}
                  >
                    <div className="mode-icon-box">
                      <Languages size={20} />
                    </div>
                    <div className="tts-mode-card-info">
                      <div className="tts-mode-title">
                        <span>Follow Chat Language</span>
                        {ttsMode === 'follow-chat' && <span className="tts-mode-badge">Active</span>}
                      </div>
                      <span className="tts-mode-desc">
                        Speaks in whatever language the companion writes using your Normal TTS engine.
                      </span>
                    </div>
                    {ttsMode === 'follow-chat' && <CheckCircle size={18} className="p-check" />}
                  </button>

                  <button
                    type="button"
                    className={`tts-mode-card ${ttsMode === 'japanese-dub' ? 'active' : ''}`}
                    onClick={() => setTtsMode('japanese-dub')}
                  >
                    <div className="mode-icon-box" style={{ color: '#f472b6' }}>
                      <Sparkles size={20} />
                    </div>
                    <div className="tts-mode-card-info">
                      <div className="tts-mode-title">
                        <span>Japanese Dubbing Mode</span>
                        {ttsMode === 'japanese-dub' && (
                          <span className="tts-mode-badge" style={{ background: 'rgba(236,72,153,0.2)', color: '#fbcfe8' }}>
                            Active
                          </span>
                        )}
                      </div>
                      <span className="tts-mode-desc">
                        Speaks with dedicated Japanese anime voice references regardless of input language.
                      </span>
                    </div>
                    {ttsMode === 'japanese-dub' && <CheckCircle size={18} className="p-check" style={{ color: '#ec4899' }} />}
                  </button>
                </div>
              </div>

              {/* NORMAL TTS CONFIGURATION (Active when Follow Chat Language is selected) */}
              {ttsMode === 'follow-chat' && (
                <div className="provider-details-box fade-in" style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                  <div className="tts-info-callout">
                    <Info size={18} style={{ color: '#60a5fa', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>Normal / Chat Language Voice</strong>: Used when conversing in English, Indonesian, or the AI's primary language. Configured independently to ensure natural pronunciation without anime voice distortions.
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label className="form-label">Normal Voice Engine Provider</label>
                    <div className="provider-selector-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                      <button
                        type="button"
                        className={`provider-card ${normalTtsProvider === 'fish-audio' ? 'active' : ''}`}
                        onClick={() => {
                          setNormalTtsProvider('fish-audio');
                          if (!normalTtsModel.startsWith('s2.1') && !normalTtsModel.includes('fish-audio')) {
                            setNormalTtsModel('s2.1-pro-free');
                          }
                          if (!normalTtsApiKey && apiConfig.fishAudioApiKey) {
                            setNormalTtsApiKey(apiConfig.fishAudioApiKey);
                          }
                        }}
                      >
                        <Sparkles size={22} style={{ color: '#60a5fa' }} />
                        <div className="provider-card-info">
                          <span className="p-title">Fish Audio S2.1 Pro</span>
                          <span className="p-desc">Zero-Shot Cloning (Multilingual)</span>
                        </div>
                        {normalTtsProvider === 'fish-audio' && <CheckCircle size={18} className="p-check" />}
                      </button>

                      <button
                        type="button"
                        className={`provider-card ${normalTtsProvider === 'universal' ? 'active' : ''}`}
                        onClick={() => {
                          setNormalTtsProvider('universal');
                          if (normalTtsModel.startsWith('s2.1') || normalTtsModel.includes('fish-audio')) {
                            setNormalTtsModel('tts-1');
                          }
                          if (!normalTtsVoice) {
                            setNormalTtsVoice('nova');
                          }
                        }}
                      >
                        <Globe size={22} style={{ color: '#60a5fa' }} />
                        <div className="provider-card-info">
                          <span className="p-title">OpenAI / OpenRouter</span>
                          <span className="p-desc">Industry /v1/audio/speech</span>
                        </div>
                        {normalTtsProvider === 'universal' && <CheckCircle size={18} className="p-check" />}
                      </button>

                      <button
                        type="button"
                        className={`provider-card ${normalTtsProvider === 'edge' ? 'active' : ''}`}
                        onClick={() => setNormalTtsProvider('edge')}
                      >
                        <Volume2 size={22} style={{ color: '#38bdf8' }} />
                        <div className="provider-card-info">
                          <span className="p-title">Edge / Web Speech</span>
                          <span className="p-desc">Free Neural Voice (Zero Config)</span>
                        </div>
                        {normalTtsProvider === 'edge' && <CheckCircle size={18} className="p-check" />}
                      </button>

                      <button
                        type="button"
                        className={`provider-card ${normalTtsProvider === 'custom' ? 'active' : ''}`}
                        onClick={() => {
                          setNormalTtsProvider('custom');
                          if (normalTtsModel.startsWith('s2.1') || normalTtsModel.includes('fish-audio')) {
                            setNormalTtsModel('tts-1');
                          }
                        }}
                      >
                        <Sliders size={22} style={{ color: '#a78bfa' }} />
                        <div className="provider-card-info">
                          <span className="p-title">Custom Endpoint</span>
                          <span className="p-desc">Local / ElevenLabs / Gateway</span>
                        </div>
                        {normalTtsProvider === 'custom' && <CheckCircle size={18} className="p-check" />}
                      </button>
                    </div>
                  </div>

                  {normalTtsProvider === 'fish-audio' && (
                    <div className="fade-in" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Fish Audio Model Version</label>
                        <select
                          value={normalTtsModel.startsWith('s2.1') || normalTtsModel.includes('fish-audio') ? normalTtsModel : 's2.1-pro-free'}
                          onChange={(e) => setNormalTtsModel(e.target.value)}
                          className="form-input"
                        >
                          <option value="s2.1-pro-free">s2.1-pro-free (Official Free Developer Tier)</option>
                          <option value="s2.1-pro">s2.1-pro (Standard Production Tier)</option>
                          <option value="fish-audio/s2.1-pro-free">fish-audio/s2.1-pro-free (OpenRouter Gateway)</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Voice Reference ID</label>
                        <input
                          type="text"
                          value={normalTtsReferenceId}
                          onChange={(e) => setNormalTtsReferenceId(e.target.value)}
                          placeholder="Reference ID from fish.audio/models (leave empty for default voice)"
                          className="form-input"
                        />
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>Browse voice model IDs freely at</span>
                          <a
                            href="https://fish.audio/models"
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#60a5fa', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                          >
                            <span>fish.audio/models</span>
                            <ExternalLink size={12} />
                          </a>
                        </span>
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Fish Audio API Key</label>
                        <input
                          type="password"
                          value={normalTtsApiKey}
                          onChange={(e) => setNormalTtsApiKey(e.target.value)}
                          placeholder="Enter your Fish Audio API Key"
                          className="form-input"
                        />
                      </div>
                    </div>
                  )}

                  {(normalTtsProvider === 'universal' || normalTtsProvider === 'custom') && (
                    <div className="fade-in" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Normal Audio Gateway URL</label>
                        <input
                          type="text"
                          value={normalTtsUrl}
                          onChange={(e) => setNormalTtsUrl(e.target.value)}
                          placeholder="https://api.openai.com/v1/audio/speech or https://openrouter.ai/api/v1/audio/speech"
                          className="form-input"
                        />
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Audio API Key</label>
                        <input
                          type="password"
                          value={normalTtsApiKey}
                          onChange={(e) => setNormalTtsApiKey(e.target.value)}
                          placeholder="Enter your Audio Gateway API Key"
                          className="form-input"
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '0.8rem' }}>
                        <div className="form-group">
                          <label className="form-label">Voice ID / Name</label>
                          <input
                            type="text"
                            value={normalTtsVoice}
                            onChange={(e) => setNormalTtsVoice(e.target.value)}
                            placeholder="e.g. nova, alloy, shimmer, echo"
                            className="form-input"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Model Name</label>
                          <input
                            type="text"
                            value={normalTtsModel}
                            onChange={(e) => setNormalTtsModel(e.target.value)}
                            placeholder="e.g. tts-1, tts-1-hd, eleven_multilingual_v2"
                            className="form-input"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Voice Preview Bar */}
                  <div className="tts-test-preview-bar">
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                      Test your normal speech acoustic configuration:
                    </span>
                    <button
                      type="button"
                      className={`tts-test-btn ${isTestingAudio === 'normal' ? 'testing' : ''}`}
                      onClick={() => handleTestVoice('normal')}
                    >
                      {isTestingAudio === 'normal' ? <Square size={14} /> : <Play size={14} />}
                      <span>{isTestingAudio === 'normal' ? 'Stop Test' : 'Test Normal Voice'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* JAPANESE DUB (JP) TTS CONFIGURATION (Active when Japanese Dubbing Mode is selected) */}
              {ttsMode === 'japanese-dub' && (
                <div className="provider-details-box fade-in" style={{ borderColor: 'rgba(236, 72, 153, 0.3)' }}>
                  <div className="tts-info-callout" style={{ borderColor: 'rgba(236, 72, 153, 0.15)' }}>
                    <Sparkles size={18} style={{ color: '#f472b6', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>Japanese Dubbing Engine</strong>: Dedicated Japanese anime vocal pipeline. Optimized for zero-shot voice cloning, pitch inflection, and anime dialogue cadence without English accent contamination.
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label className="form-label">Japanese Voice Engine Provider</label>
                    <div className="provider-selector-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                      <button
                        type="button"
                        className={`provider-card ${jpTtsProvider === 'fish-audio' ? 'active' : ''}`}
                        onClick={() => setJpTtsProvider('fish-audio')}
                        style={{ borderColor: jpTtsProvider === 'fish-audio' ? '#ec4899' : undefined }}
                      >
                        <Sparkles size={22} style={{ color: '#f472b6' }} />
                        <div className="provider-card-info">
                          <span className="p-title">Fish Audio S2.1 Pro</span>
                          <span className="p-desc">Zero-Shot Anime Voice Cloning</span>
                        </div>
                        {jpTtsProvider === 'fish-audio' && <CheckCircle size={18} className="p-check" style={{ color: '#ec4899' }} />}
                      </button>

                      <button
                        type="button"
                        className={`provider-card ${jpTtsProvider === 'universal' ? 'active' : ''}`}
                        onClick={() => setJpTtsProvider('universal')}
                        style={{ borderColor: jpTtsProvider === 'universal' ? '#ec4899' : undefined }}
                      >
                        <Globe size={22} style={{ color: '#60a5fa' }} />
                        <div className="provider-card-info">
                          <span className="p-title">OpenRouter / OpenAI JP</span>
                          <span className="p-desc">OpenRouter Fish Audio or OpenAI</span>
                        </div>
                        {jpTtsProvider === 'universal' && <CheckCircle size={18} className="p-check" style={{ color: '#ec4899' }} />}
                      </button>

                      <button
                        type="button"
                        className={`provider-card ${jpTtsProvider === 'edge' ? 'active' : ''}`}
                        onClick={() => setJpTtsProvider('edge')}
                        style={{ borderColor: jpTtsProvider === 'edge' ? '#ec4899' : undefined }}
                      >
                        <Volume2 size={22} style={{ color: '#38bdf8' }} />
                        <div className="provider-card-info">
                          <span className="p-title">Edge-TTS Japanese</span>
                          <span className="p-desc">Nanami / Keita Neural Voice</span>
                        </div>
                        {jpTtsProvider === 'edge' && <CheckCircle size={18} className="p-check" style={{ color: '#ec4899' }} />}
                      </button>

                      <button
                        type="button"
                        className={`provider-card ${jpTtsProvider === 'custom' ? 'active' : ''}`}
                        onClick={() => setJpTtsProvider('custom')}
                        style={{ borderColor: jpTtsProvider === 'custom' ? '#ec4899' : undefined }}
                      >
                        <Sliders size={22} style={{ color: '#a78bfa' }} />
                        <div className="provider-card-info">
                          <span className="p-title">Custom Endpoint</span>
                          <span className="p-desc">Local (Kokoro / CosyVoice)</span>
                        </div>
                        {jpTtsProvider === 'custom' && <CheckCircle size={18} className="p-check" style={{ color: '#ec4899' }} />}
                      </button>
                    </div>
                  </div>

                  {jpTtsProvider === 'fish-audio' && (
                    <div className="fade-in" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Fish Audio Model Version</label>
                        <select
                          value={jpTtsModel}
                          onChange={(e) => setJpTtsModel(e.target.value)}
                          className="form-input"
                        >
                          <option value="s2.1-pro-free">s2.1-pro-free (Official Free Developer Tier)</option>
                          <option value="s2.1-pro">s2.1-pro (Standard Production Tier)</option>
                          <option value="fish-audio/s2.1-pro-free">fish-audio/s2.1-pro-free (OpenRouter Gateway)</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Japanese Voice Reference ID</label>
                        <input
                          type="text"
                          value={jpTtsReferenceId}
                          onChange={(e) => setJpTtsReferenceId(e.target.value)}
                          placeholder="Paste Reference ID from fish.audio/models (leave empty for default voice)"
                          className="form-input"
                        />
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>Find anime character voice IDs freely at</span>
                          <a
                            href="https://fish.audio/models"
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#f472b6', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                          >
                            <span>fish.audio/models</span>
                            <ExternalLink size={12} />
                          </a>
                        </span>
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Fish Audio API Key</label>
                        <input
                          type="password"
                          value={jpTtsApiKey}
                          onChange={(e) => setJpTtsApiKey(e.target.value)}
                          placeholder="Enter your Fish Audio API Key"
                          className="form-input"
                        />
                      </div>
                    </div>
                  )}

                  {(jpTtsProvider === 'universal' || jpTtsProvider === 'custom') && (
                    <div className="fade-in" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Japanese Audio Gateway URL</label>
                        <input
                          type="text"
                          value={jpTtsUrl}
                          onChange={(e) => setJpTtsUrl(e.target.value)}
                          placeholder="https://openrouter.ai/api/v1/audio/speech or custom endpoint"
                          className="form-input"
                        />
                      </div>

                      <div className="form-group" style={{ marginTop: '0.8rem' }}>
                        <label className="form-label">Japanese API Key</label>
                        <input
                          type="password"
                          value={jpTtsApiKey}
                          onChange={(e) => setJpTtsApiKey(e.target.value)}
                          placeholder="sk-or-... or custom audio API key"
                          className="form-input"
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '0.8rem' }}>
                        <div className="form-group">
                          <label className="form-label">Voice / Reference ID</label>
                          <input
                            type="text"
                            value={jpTtsVoice}
                            onChange={(e) => setJpTtsVoice(e.target.value)}
                            placeholder="e.g. voice id or nova"
                            className="form-input"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Model</label>
                          <input
                            type="text"
                            value={jpTtsModel}
                            onChange={(e) => setJpTtsModel(e.target.value)}
                            placeholder="e.g. fish-audio/s2.1-pro-free, tts-1"
                            className="form-input"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Voice Preview Bar */}
                  <div className="tts-test-preview-bar">
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                      Test your Japanese anime voice synthesis:
                    </span>
                    <button
                      type="button"
                      className={`tts-test-btn ${isTestingAudio === 'jp' ? 'testing' : ''}`}
                      onClick={() => handleTestVoice('jp')}
                      style={{ borderColor: isTestingAudio === 'jp' ? '#ec4899' : undefined, color: isTestingAudio === 'jp' ? '#fbcfe8' : undefined }}
                    >
                      {isTestingAudio === 'jp' ? <Square size={14} /> : <Play size={14} />}
                      <span>{isTestingAudio === 'jp' ? 'Stop Test' : 'Test Japanese Voice'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
              aria-label="Cancel and discard changes"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-save"
              aria-label="Save and apply configuration settings"
            >
              <Save size={16} />
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

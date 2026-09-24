import React, { useState, useRef, useCallback } from 'react';
import type { ApiConfig, TtsProvider } from '../../types';
import { 
  X, Save, Server, CheckCircle, Volume2, Sparkles, Key, Globe,
  RefreshCw, AlertCircle, Search, ExternalLink, Check
} from 'lucide-react';
import { validateApiKeyAndFetchModels } from '../../services/aiService';
import { AI_PROVIDERS, type AiProviderInfo, getProviderById } from '../../data/aiProviders';

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

  // TTS State
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>(apiConfig.ttsProvider || 'fish-audio');
  const [fishAudioApiKey, setFishAudioApiKey] = useState(apiConfig.fishAudioApiKey || '');
  const [fishAudioReferenceId, setFishAudioReferenceId] = useState(apiConfig.fishAudioReferenceId || '7f92f8afb8ec43bf81429cc1c9199cb1');
  const [fishAudioModel, setFishAudioModel] = useState(apiConfig.fishAudioModel || 's2.1-pro-free');
  const [customTtsUrl, setCustomTtsUrl] = useState(apiConfig.customTtsUrl || '');
  const [customTtsApiKey, setCustomTtsApiKey] = useState(apiConfig.customTtsApiKey || '');
  const [customTtsModel, setCustomTtsModel] = useState(apiConfig.customTtsModel || '');
  const [customTtsVoiceId, setCustomTtsVoiceId] = useState(apiConfig.customTtsVoiceId || '');

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
      setValidationError(result.error || 'Validasi API Key gagal.');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      ...apiConfig,
      provider: selectedProviderId,
      baseUrl: (baseUrl || activeProvider.defaultBaseUrl).trim(),
      apiKey: apiKey.trim(),
      model: model.trim() || activeProvider.defaultModel,
      availableModels,
      ttsProvider,
      fishAudioApiKey,
      fishAudioReferenceId,
      fishAudioModel,
      customTtsUrl,
      customTtsApiKey,
      customTtsModel,
      customTtsVoiceId
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
                          Dapatkan Key <ExternalLink size={11} />
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
                        {validationStatus === 'validating' ? 'Memeriksa...' : 'Check Key'}
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
                      <span>API Key Valid! Ditemukan {availableModels.length} model aktif.</span>
                    </div>
                  )}
                  {validationStatus === 'invalid' && (
                    <div style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={14} color="#ef4444" />
                      <span>{validationError || 'API Key tidak valid atau server tidak merespons.'}</span>
                    </div>
                  )}
                  {validationStatus === 'validating' && (
                    <div style={{ color: '#eab308', fontSize: '0.78rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RefreshCw size={14} className="spin" />
                      <span>Memverifikasi API Key & menarik daftar model...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.8rem', color: '#93c5fd' }}>
                  ℹ️ {activeProvider.name} berjalan di komputer lokal (localhost). Tidak memerlukan API Key.
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
                      {showAdvancedUrl ? 'Sembunyikan URL' : 'Ubah URL (Advanced)'}
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
                  <span>Pilih Model LLM ({availableModels.length > 0 ? `${availableModels.length} model tersedia` : 'Model Default'})</span>
                  {availableModels.length > 0 && (
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Ditarik dinamis dari provider</span>
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
                          placeholder="Cari model..."
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
                          Tidak ada model yang cocok dengan pencarian
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

            {/* SECTION 2: TTS VOICE ENGINE */}
            <div className="form-group" style={{ marginTop: '1.4rem' }}>
              <label className="form-label" style={{ fontSize: '0.92rem', marginBottom: '8px' }}>2. Select TTS Voice Engine</label>
              <div className="provider-selector-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <button
                  type="button"
                  className={`provider-card ${ttsProvider === 'fish-audio' ? 'active' : ''}`}
                  onClick={() => setTtsProvider('fish-audio')}
                >
                  <Sparkles size={24} />
                  <div className="provider-card-info">
                    <span className="p-title">Fish Audio S2.1 Pro</span>
                    <span className="p-desc">Zero-Shot Neural Model • Anime Voice</span>
                  </div>
                  {ttsProvider === 'fish-audio' && <CheckCircle size={18} className="p-check" />}
                </button>

                <button
                  type="button"
                  className={`provider-card ${ttsProvider === 'edge' ? 'active' : ''}`}
                  onClick={() => setTtsProvider('edge')}
                >
                  <Volume2 size={24} />
                  <div className="provider-card-info">
                    <span className="p-title">Edge-TTS Neural Voice</span>
                    <span className="p-desc">Real-Time Cloud Neural Voice</span>
                  </div>
                  {ttsProvider === 'edge' && <CheckCircle size={18} className="p-check" />}
                </button>

                <button
                  type="button"
                  className={`provider-card ${ttsProvider === 'custom' ? 'active' : ''}`}
                  onClick={() => setTtsProvider('custom')}
                >
                  <Globe size={24} />
                  <div className="provider-card-info">
                    <span className="p-title">Other / Custom TTS</span>
                    <span className="p-desc">OpenAI Audio API / ElevenLabs</span>
                  </div>
                  {ttsProvider === 'custom' && <CheckCircle size={18} className="p-check" />}
                </button>
              </div>
            </div>

            {ttsProvider === 'fish-audio' && (
              <div className="provider-details-box fade-in">
                <div className="form-group">
                  <label className="form-label">Fish Audio Model Version</label>
                  <select
                    value={fishAudioModel}
                    onChange={(e) => setFishAudioModel(e.target.value)}
                    className="form-input"
                  >
                    <option value="s2.1-pro-free">s2.1-pro-free (Official Free Developer API Tier)</option>
                    <option value="s2.1-pro">s2.1-pro (Paid / Standard Production Tier)</option>
                    <option value="fish-audio/s2.1-pro-free">fish-audio/s2.1-pro-free (OpenRouter Gateway)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginTop: '0.8rem' }}>
                  <label className="form-label">Voice Model Preset</label>
                  <select
                    value={fishAudioReferenceId}
                    onChange={(e) => setFishAudioReferenceId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Default System Voice (Fish Audio Built-in)</option>
                    <option value="0d4d2a579d6146debf509b79eb83e7de">Firefly / ホタル (Honkai: Star Rail JP Dub)</option>
                    <option value="custom">Custom Reference ID (Manual Input)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginTop: '0.8rem' }}>
                  <label className="form-label">Voice Reference ID</label>
                  <input
                    type="text"
                    value={fishAudioReferenceId}
                    onChange={(e) => setFishAudioReferenceId(e.target.value)}
                    placeholder="Paste Reference ID from fish.audio catalog"
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ marginTop: '0.8rem' }}>
                  <label className="form-label">Fish Audio API Key (Optional)</label>
                  <input
                    type="password"
                    value={fishAudioApiKey}
                    onChange={(e) => setFishAudioApiKey(e.target.value)}
                    placeholder="Optional: Enter Fish Audio API Key"
                    className="form-input"
                  />
                </div>
              </div>
            )}

            {ttsProvider === 'custom' && (
              <div className="provider-details-box fade-in">
                <div className="form-group">
                  <label className="form-label">Endpoint URL</label>
                  <input
                    type="text"
                    value={customTtsUrl}
                    onChange={(e) => setCustomTtsUrl(e.target.value)}
                    placeholder="https://api.service.com/v1/audio/speech"
                    className="form-input"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginTop: '0.8rem' }}>
                  <label className="form-label">API Key</label>
                  <input
                    type="password"
                    value={customTtsApiKey}
                    onChange={(e) => setCustomTtsApiKey(e.target.value)}
                    placeholder="sk-... or xi-api-key (optional)"
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '0.8rem' }}>
                  <div className="form-group">
                    <label className="form-label">Voice ID</label>
                    <input
                      type="text"
                      value={customTtsVoiceId}
                      onChange={(e) => setCustomTtsVoiceId(e.target.value)}
                      placeholder="e.g. 21m00Tcm4TlvDq8ikWAM, nova"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Model Name</label>
                    <input
                      type="text"
                      value={customTtsModel}
                      onChange={(e) => setCustomTtsModel(e.target.value)}
                      placeholder="e.g. eleven_multilingual_v2, tts-1"
                      className="form-input"
                    />
                  </div>
                </div>
              </div>
            )}
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

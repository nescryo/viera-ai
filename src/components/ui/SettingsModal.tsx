import React, { useState, useRef, useEffect } from 'react';
import type { ApiConfig, ApiProvider, TtsProvider } from '../../types';
import { 
  X, Save, Server, Cpu, CheckCircle, Volume2, Sparkles, Key, Globe,
  Zap, Brain, ChevronDown, Check
} from 'lucide-react';

interface SettingsModalProps {
  apiConfig: ApiConfig;
  onSaveConfig: (newConfig: ApiConfig) => void;
  onClose: () => void;
}

const DEEPSEEK_MODELS = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek-V3 (Chat Engine)',
    badge: 'Low-Latency • Conversational',
    desc: 'Optimized for expressive persona dialogue, contextual coherence, and real-time streaming synthesis.',
    icon: Zap,
    color: '#eab308'
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek-R1 (Inference & CoT)',
    badge: 'Deep Reasoning • Analytical',
    desc: 'Multi-step chain-of-thought logic processing designed for complex reasoning and deep contextual recall.',
    icon: Brain,
    color: '#a855f7'
  }
] as const;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  apiConfig,
  onSaveConfig,
  onClose
}) => {
  const [provider, setProvider] = useState<ApiProvider>(apiConfig.provider);
  const [lmStudioUrl, setLmStudioUrl] = useState(apiConfig.lmStudioUrl);
  const [lmStudioModel, setLmStudioModel] = useState(apiConfig.lmStudioModel);
  const [deepseekApiKey, setDeepseekApiKey] = useState(apiConfig.deepseekApiKey || '');
  const [deepseekModel, setDeepseekModel] = useState(apiConfig.deepseekModel || 'deepseek-chat');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [ttsProvider, setTtsProvider] = useState<TtsProvider>(apiConfig.ttsProvider || 'fish-audio');

  const [fishAudioApiKey, setFishAudioApiKey] = useState(apiConfig.fishAudioApiKey || '');
  const [fishAudioReferenceId, setFishAudioReferenceId] = useState(apiConfig.fishAudioReferenceId || '7f92f8afb8ec43bf81429cc1c9199cb1');
  const [fishAudioModel, setFishAudioModel] = useState(apiConfig.fishAudioModel || 's2.1-pro-free');

  const [customTtsUrl, setCustomTtsUrl] = useState(apiConfig.customTtsUrl || '');
  const [customTtsApiKey, setCustomTtsApiKey] = useState(apiConfig.customTtsApiKey || '');
  const [customTtsModel, setCustomTtsModel] = useState(apiConfig.customTtsModel || '');
  const [customTtsVoiceId, setCustomTtsVoiceId] = useState(apiConfig.customTtsVoiceId || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      ...apiConfig,
      provider,
      lmStudioUrl,
      lmStudioModel,
      deepseekApiKey,
      deepseekModel,
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

  return (
    <div className="modal-backdrop glass-panel fade-in">
      <div className="modal-container glass-panel settings-modal">
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
          <div className="form-group">
            <label className="form-label">1. Select AI Text Provider</label>
            <div className="provider-selector-grid">
              <button
                type="button"
                className={`provider-card ${provider === 'deepseek' ? 'active' : ''}`}
                onClick={() => setProvider('deepseek')}
              >
                <Sparkles size={24} style={{ color: '#3b82f6' }} />
                <div className="provider-card-info">
                  <span className="p-title">DeepSeek AI (Cloud API)</span>
                  <span className="p-desc">Cloud LLM Infrastructure • High-Throughput API Gateway</span>
                </div>
                {provider === 'deepseek' && <CheckCircle size={18} className="p-check" />}
              </button>

              <button
                type="button"
                className={`provider-card ${provider === 'lmstudio' ? 'active' : ''}`}
                onClick={() => setProvider('lmstudio')}
              >
                <Cpu size={24} />
                <div className="provider-card-info">
                  <span className="p-title">LM Studio (Local)</span>
                  <span className="p-desc">Local Inference Server • Private OpenAI-Compatible Endpoint</span>
                </div>
                {provider === 'lmstudio' && <CheckCircle size={18} className="p-check" />}
              </button>

              <button
                type="button"
                className={`provider-card ${provider === 'mock' ? 'active' : ''}`}
                onClick={() => setProvider('mock')}
              >
                <Server size={24} />
                <div className="provider-card-info">
                  <span className="p-title">Demo Roleplay Engine</span>
                  <span className="p-desc">Offline Simulation Sandbox • Zero-Latency Deterministic Fallback</span>
                </div>
                {provider === 'mock' && <CheckCircle size={18} className="p-check" />}
              </button>
            </div>
          </div>

          {provider === 'deepseek' && (
            <div className="provider-details-box fade-in">
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={14} /> DeepSeek API Key (or save in .env file)
                </label>
                <input
                  type="password"
                  value={deepseekApiKey}
                  onChange={(e) => setDeepseekApiKey(e.target.value)}
                  placeholder={import.meta.env.VITE_DEEPSEEK_API_KEY ? "Detected from .env file (VITE_DEEPSEEK_API_KEY)" : "sk-xxxxxxxxxxxxxxxxxxxxxxxx"}
                  className="form-input"
                />
                {import.meta.env.VITE_DEEPSEEK_API_KEY && !deepseekApiKey && (
                  <small style={{ color: '#10b981', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Check size={14} /> Environment variable detected: secure key loaded from local configuration.
                  </small>
                )}
              </div>
              
              <div className="form-group" style={{ position: 'relative' }} ref={modelDropdownRef}>
                <label className="form-label" id="deepseek-model-label">DeepSeek Model Architecture</label>
                <div
                  className="model-custom-select-trigger glass-panel"
                  onClick={() => setIsModelDropdownOpen((prev) => !prev)}
                  tabIndex={0}
                  role="button"
                  aria-haspopup="listbox"
                  aria-expanded={isModelDropdownOpen}
                  aria-labelledby="deepseek-model-label"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsModelDropdownOpen((prev) => !prev);
                    }
                  }}
                >
                  <div className="trigger-content">
                    {(() => {
                      const selected = DEEPSEEK_MODELS.find(m => m.id === deepseekModel) || DEEPSEEK_MODELS[0];
                      const IconComp = selected.icon;
                      return (
                        <div className="trigger-model-pill">
                          <IconComp size={18} style={{ color: selected.color }} />
                          <div className="trigger-text-group">
                            <span className="model-name">{selected.name}</span>
                            <span className="model-badge">{selected.badge}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <ChevronDown size={16} className={`dropdown-arrow ${isModelDropdownOpen ? 'open' : ''}`} />
                </div>

                {isModelDropdownOpen && (
                  <div className="model-custom-dropdown-menu glass-panel fade-in" role="listbox">
                    {DEEPSEEK_MODELS.map((item) => {
                      const isSelected = deepseekModel === item.id;
                      const IconComp = item.icon;
                      return (
                        <div
                          key={item.id}
                          className={`model-dropdown-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setDeepseekModel(item.id);
                            setIsModelDropdownOpen(false);
                          }}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <div className="option-left">
                            <IconComp size={20} style={{ color: item.color }} />
                            <div className="option-info">
                              <div className="option-header-row">
                                <span className="option-model-name">{item.name}</span>
                                <span className="option-badge">{item.badge}</span>
                              </div>
                              <span className="option-desc">{item.desc}</span>
                            </div>
                          </div>
                          {isSelected && <Check size={16} className="option-check" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {provider === 'lmstudio' && (
            <div className="provider-details-box fade-in">
              <div className="form-group">
                <label className="form-label">LM Studio Server Base URL</label>
                <input
                  type="text"
                  value={lmStudioUrl}
                  onChange={(e) => setLmStudioUrl(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Model Name / Identifier</label>
                <input
                  type="text"
                  value={lmStudioModel}
                  onChange={(e) => setLmStudioModel(e.target.value)}
                  placeholder="local-model"
                  className="form-input"
                />
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginTop: '1.2rem' }}>
            <label className="form-label">2. Select TTS Voice Engine</label>
            <div className="provider-selector-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <button
                type="button"
                className={`provider-card ${ttsProvider === 'fish-audio' ? 'active' : ''}`}
                onClick={() => setTtsProvider('fish-audio')}
              >
                <Sparkles size={24} />
                <div className="provider-card-info">
                  <span className="p-title">Fish Audio S2.1 Pro</span>
                  <span className="p-desc">Zero-Shot Neural Acoustic Model • Dynamic Prosody Alignment</span>
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
                  <span className="p-desc">Real-Time Cloud Neural Voice • Low-Latency Edge Network</span>
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
                  <span className="p-desc">External Speech Service Gateway • ElevenLabs / OpenAI Audio API</span>
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
                <label className="form-label">Fish Audio API Key (Optional for OpenRouter Fallback)</label>
                <input
                  type="password"
                  value={fishAudioApiKey}
                  onChange={(e) => setFishAudioApiKey(e.target.value)}
                  placeholder="Optional: Enter Fish Audio API Key (Uses OpenRouter key if blank)"
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

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-save">
              <Save size={16} /> Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

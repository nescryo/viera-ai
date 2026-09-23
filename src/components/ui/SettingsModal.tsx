import React, { useState, useEffect } from 'react';
import type { ApiConfig, ApiProvider, TtsProvider, VoicevoxSpeaker } from '../../types';
import { X, Save, Server, Cpu, CheckCircle, Volume2, Mic, Radio, Sparkles, Key } from 'lucide-react';

const formatSpeakerName = (name: string): string => {
  const map: Record<string, string> = {
    '四国めたん': '🌸 Shikikoku Metan',
    'ずんだもん': '⚡ Zundamon',
    '春日部つむぎ': '🌾 Kasukabe Tsumugi',
    '雨晴はう': '🎀 Amehare Hau',
    '波音リツ': '📻 Namine Ritsu',
    '冥鳴ひまり': '💕 Meimei Himari',
    '九州そら': '☁️ Kyushu Sora',
    'もち子さん': '🍡 Mochiko-san',
    '剣崎牝犬': '⚔️ Kenzaki',
    'ホワイトカルティ': '❄️ White Culita',
    '後鬼': '👹 Goki',
    'No.7': '🤖 No.7',
    'ちび式じい': '👴 Chibi Shiki-jii',
    '櫻歌ミコ': '🌸 Ouka Miko',
    '小夜/Sayo': '🌙 Sayo',
    'ナースロボ＿タイプＴ': '💉 Nurse Robot Type-T'
  };
  return map[name] || `🎙️ ${name}`;
};

const formatStyleName = (styleName: string): string => {
  const map: Record<string, string> = {
    'ノーマル': 'Normal',
    'あまあま': 'Sweet (Ama-ama)',
    'ツンツン': 'Tsundere',
    'セクシー': 'Sexy',
    'ささやき': 'Whisper',
    'ヒソヒソ': 'Soft Whisper',
    'ヘロヘロ': 'Dizzy',
    'なみだめ': 'Tearful / Sad',
    '喜び': 'Joy',
    '悲しみ': 'Sadness',
    '怒り': 'Angry',
    '人前少女': 'Public Girl',
    '酔い': 'Drunk'
  };
  return map[styleName] || styleName;
};

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
  const [provider, setProvider] = useState<ApiProvider>(apiConfig.provider);
  const [lmStudioUrl, setLmStudioUrl] = useState(apiConfig.lmStudioUrl);
  const [lmStudioModel, setLmStudioModel] = useState(apiConfig.lmStudioModel);
  const [deepseekApiKey, setDeepseekApiKey] = useState(apiConfig.deepseekApiKey || '');
  const [deepseekModel, setDeepseekModel] = useState(apiConfig.deepseekModel || 'deepseek-chat');
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>(apiConfig.ttsProvider || 'fish-audio');
  const [vitsServerUrl, setVitsServerUrl] = useState(apiConfig.vitsServerUrl || 'http://localhost:5000/tts');

  const [voicevoxSpeakerId, setVoicevoxSpeakerId] = useState<number>(apiConfig.voicevoxSpeakerId ?? 0);
  const [fishAudioApiKey, setFishAudioApiKey] = useState(apiConfig.fishAudioApiKey || '');
  const [fishAudioReferenceId, setFishAudioReferenceId] = useState(apiConfig.fishAudioReferenceId || '7f92f8afb8ec43bf81429cc1c9199cb1');
  const [fishAudioModel, setFishAudioModel] = useState(apiConfig.fishAudioModel || 's2.1-pro-free');
  const [speakers, setSpeakers] = useState<VoicevoxSpeaker[]>([]);

  useEffect(() => {
    if (ttsProvider === 'voicevox') {
      fetch('/voicevox_api/speakers')
        .then((res) => (res.ok ? res.json() : []))
        .then((data: VoicevoxSpeaker[]) => {
          if (Array.isArray(data) && data.length > 0) {
            setSpeakers(data);
          }
        })
        .catch((err) => console.warn('Could not load live VOICEVOX speakers:', err));
    }
  }, [ttsProvider]);

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
      vitsServerUrl,
      voicevoxSpeakerId,
      fishAudioApiKey,
      fishAudioReferenceId,
      fishAudioModel
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
                  <span className="p-desc">High Quality RP • 20M+ Tokens</span>
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
                  <span className="p-desc">Free • Offline • localhost:1234</span>
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
                  <span className="p-desc">Instant offline mock responses</span>
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
                  <small style={{ color: '#10b981', marginTop: '4px', display: 'block' }}>
                    ✓ API Key automatically detected from .env file!
                  </small>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">DeepSeek Model</label>
                <select
                  value={deepseekModel}
                  onChange={(e) => setDeepseekModel(e.target.value)}
                  className="form-input"
                >
                  <option value="deepseek-chat">⚡ deepseek-chat (DeepSeek-V3: Recommended for Roleplay & 3D Expressions)</option>
                  <option value="deepseek-reasoner">🧠 deepseek-reasoner (DeepSeek-R1: Deep Chain-of-Thought Reasoning)</option>
                </select>
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
            <div className="provider-selector-grid">
              <button
                type="button"
                className={`provider-card ${ttsProvider === 'fish-audio' ? 'active' : ''}`}
                onClick={() => setTtsProvider('fish-audio')}
              >
                <Sparkles size={24} />
                <div className="provider-card-info">
                  <span className="p-title">Fish Audio S2.1 Pro</span>
                  <span className="p-desc">Zero-Shot Voice Cloning • Free / API</span>
                </div>
                {ttsProvider === 'fish-audio' && <CheckCircle size={18} className="p-check" />}
              </button>

              <button
                type="button"
                className={`provider-card ${ttsProvider === 'voicevox' ? 'active' : ''}`}
                onClick={() => setTtsProvider('voicevox')}
              >
                <Radio size={24} />
                <div className="provider-card-info">
                  <span className="p-title">VOICEVOX Anime Voice</span>
                  <span className="p-desc">Local Server • http://localhost:50021</span>
                </div>
                {ttsProvider === 'voicevox' && <CheckCircle size={18} className="p-check" />}
              </button>

              <button
                type="button"
                className={`provider-card ${ttsProvider === 'edge' ? 'active' : ''}`}
                onClick={() => setTtsProvider('edge')}
              >
                <Volume2 size={24} />
                <div className="provider-card-info">
                  <span className="p-title">Edge-TTS Neural Voice</span>
                  <span className="p-desc">100% Free • Zero-Delay (under 0.2s)</span>
                </div>
                {ttsProvider === 'edge' && <CheckCircle size={18} className="p-check" />}
              </button>

              <button
                type="button"
                className={`provider-card ${ttsProvider === 'vits' ? 'active' : ''}`}
                onClick={() => setTtsProvider('vits')}
              >
                <Mic size={24} />
                <div className="provider-card-info">
                  <span className="p-title">Local Custom VITS Bridge</span>
                  <span className="p-desc">Local Model • http://localhost:5000/tts</span>
                </div>
                {ttsProvider === 'vits' && <CheckCircle size={18} className="p-check" />}
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

          {ttsProvider === 'voicevox' && (
            <div className="provider-details-box fade-in">
              <div className="form-group">
                <label className="form-label">Select VOICEVOX Base Character & Preferred Style</label>
                <select
                  value={voicevoxSpeakerId}
                  onChange={(e) => setVoicevoxSpeakerId(Number(e.target.value))}
                  className="form-input"
                >
                  {speakers.length > 0 ? (
                    speakers.map((spk) => (
                      <optgroup key={spk.speaker_uuid || spk.name} label={formatSpeakerName(spk.name)}>
                        {spk.styles.map((style) => (
                          <option key={style.id} value={style.id}>
                            {formatSpeakerName(spk.name)} - {formatStyleName(style.name)}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  ) : (
                    <>
                      <option value={0}>🌸 Shikikoku Metan - Sweet (Ama-ama)</option>
                      <option value={2}>✨ Shikikoku Metan - Normal</option>
                      <option value={6}>💢 Shikikoku Metan - Tsundere</option>
                      <option value={36}>🌙 Shikikoku Metan - Whisper</option>
                      <option value={10}>🎀 Amehare Hau - Gentle Nurse</option>
                      <option value={14}>💕 Meimei Himari - Cute Girl</option>
                      <option value={9}>📻 Namine Ritsu - Calm Female</option>
                      <option value={3}>⚡ Zundamon - Normal</option>
                      <option value={1}>🍬 Zundamon - Sweet (Ama-ama)</option>
                      <option value={7}>💢 Zundamon - Tsundere</option>
                      <option value={38}>🌙 Zundamon - Whisper</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          )}

          {ttsProvider === 'vits' && (
            <div className="provider-details-box fade-in">
              <div className="form-group">
                <label className="form-label">Local VITS Voice Server URL</label>
                <input
                  type="text"
                  value={vitsServerUrl}
                  onChange={(e) => setVitsServerUrl(e.target.value)}
                  placeholder="http://localhost:5000/tts"
                  className="form-input"
                />
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

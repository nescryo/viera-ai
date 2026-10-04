import React, { useId } from 'react';
import { ExternalLink, Globe, Play, Sliders, Sparkles, Square, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TtsEngineProvider } from '../../../types';

type VoiceVariant = 'normal' | 'jp';

interface EngineOption {
  id: TtsEngineProvider;
  title: string;
  desc: string;
  icon: LucideIcon;
  iconClass: string;
}

const ENGINE_OPTIONS: Record<VoiceVariant, EngineOption[]> = {
  normal: [
    { id: 'fish-audio', title: 'Fish Audio', desc: 'Character voices, needs a key', icon: Sparkles, iconClass: 'icon-accent' },
    { id: 'universal', title: 'OpenAI / OpenRouter', desc: 'Uses your own key', icon: Globe, iconClass: 'icon-blue' },
    { id: 'edge', title: 'Free voice', desc: 'No setup needed', icon: Volume2, iconClass: 'icon-sky' },
    { id: 'custom', title: 'Your own server', desc: 'Local or other services', icon: Sliders, iconClass: 'icon-violet' },
  ],
  jp: [
    { id: 'fish-audio', title: 'Fish Audio', desc: 'Anime character voices', icon: Sparkles, iconClass: 'icon-accent' },
    { id: 'universal', title: 'OpenAI / OpenRouter', desc: 'Uses your own key', icon: Globe, iconClass: 'icon-blue' },
    { id: 'edge', title: 'Free voice', desc: 'No setup needed', icon: Volume2, iconClass: 'icon-sky' },
    { id: 'custom', title: 'Your own server', desc: 'Local voice server', icon: Sliders, iconClass: 'icon-violet' },
  ],
};

const URL_PLACEHOLDER: Record<VoiceVariant, string> = {
  normal: 'https://api.openai.com/v1/audio/speech',
  jp: 'https://openrouter.ai/api/v1/audio/speech',
};

interface VoiceEngineFieldsProps {
  variant: VoiceVariant;
  provider: TtsEngineProvider;
  onSelectProvider: (id: TtsEngineProvider) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  referenceId: string;
  onReferenceIdChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  voice: string;
  onVoiceChange: (value: string) => void;
  model: string;
  /** Value shown in the Fish Audio quality select (may differ from `model`). */
  fishModel: string;
  onModelChange: (value: string) => void;
  isTesting: boolean;
  onTest: () => void;
}

/**
 * Voice engine picker plus the fields for the chosen engine.
 * Used for both the chat-language voice and the Japanese voice.
 */
export const VoiceEngineFields: React.FC<VoiceEngineFieldsProps> = ({
  variant,
  provider,
  onSelectProvider,
  apiKey,
  onApiKeyChange,
  referenceId,
  onReferenceIdChange,
  url,
  onUrlChange,
  voice,
  onVoiceChange,
  model,
  fishModel,
  onModelChange,
  isTesting,
  onTest
}) => {
  const idPrefix = useId();
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const usesGateway = provider === 'universal' || provider === 'custom';

  return (
    <div className={`settings-panel voice-panel voice-panel--${variant} fade-in`}>
      <div className="engine-grid" role="group" aria-label="Voice engine">
        {ENGINE_OPTIONS[variant].map(({ id, title, desc, icon: Icon, iconClass }) => (
          <button
            key={id}
            type="button"
            className={`provider-card ${provider === id ? 'active' : ''}`}
            onClick={() => onSelectProvider(id)}
            aria-pressed={provider === id}
          >
            <Icon size={20} className={iconClass} />
            <div className="provider-card-info">
              <span className="p-title">{title}</span>
              <span className="p-desc">{desc}</span>
            </div>
          </button>
        ))}
      </div>

      {provider === 'fish-audio' && (
        <div className="settings-fields fade-in">
          <div className="form-group">
            <label className="form-label" htmlFor={fieldId('key')}>Fish Audio key</label>
            <input
              id={fieldId('key')}
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="Paste your Fish Audio key"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={fieldId('ref')}>Voice ID</label>
            <input
              id={fieldId('ref')}
              type="text"
              value={referenceId}
              onChange={(e) => onReferenceIdChange(e.target.value)}
              placeholder="Leave empty for the default voice"
              className="form-input"
            />
            <a className="field-link field-link--accent" href="https://fish.audio/models" target="_blank" rel="noreferrer">
              Find voices on fish.audio <ExternalLink size={12} />
            </a>
          </div>

          <details className="settings-advanced">
            <summary>Advanced</summary>
            <div className="form-group">
              <label className="form-label" htmlFor={fieldId('quality')}>Voice quality</label>
              <select
                id={fieldId('quality')}
                value={fishModel}
                onChange={(e) => onModelChange(e.target.value)}
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

      {usesGateway && (
        <div className="settings-fields fade-in">
          <div className="form-group">
            <label className="form-label" htmlFor={fieldId('url')}>Server address</label>
            <input
              id={fieldId('url')}
              type="text"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder={URL_PLACEHOLDER[variant]}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={fieldId('key')}>API key</label>
            <input
              id={fieldId('key')}
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="Paste your key"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={fieldId('voice')}>Voice</label>
            <input
              id={fieldId('voice')}
              type="text"
              value={voice}
              onChange={(e) => onVoiceChange(e.target.value)}
              placeholder={variant === 'normal' ? 'e.g. nova' : 'Voice name or ID'}
              className="form-input"
            />
          </div>

          <details className="settings-advanced">
            <summary>Advanced</summary>
            <div className="form-group">
              <label className="form-label" htmlFor={fieldId('model')}>Model</label>
              <input
                id={fieldId('model')}
                type="text"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                placeholder="tts-1"
                className="form-input"
              />
            </div>
          </details>
        </div>
      )}

      <div className="tts-test-preview-bar">
        <button
          type="button"
          className={`tts-test-btn ${isTesting ? 'testing' : ''}`}
          onClick={onTest}
        >
          {isTesting ? <Square size={14} /> : <Play size={14} />}
          <span>{isTesting ? 'Stop' : 'Play sample'}</span>
        </button>
      </div>
    </div>
  );
};

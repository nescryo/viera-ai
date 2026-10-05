import React, { useState } from 'react';
import { AlertCircle, CheckCircle, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { AI_PROVIDERS, type AiProviderInfo } from '../../../data/aiProviders';
import { Select, type SelectOption } from '../forms/Select';

const PROVIDER_OPTIONS: SelectOption<string>[] = AI_PROVIDERS.map((p) => ({
  id: p.id,
  label: p.name,
  tag: p.requiresApiKey ? undefined : 'On your computer',
}));

export type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

interface AiSectionProps {
  provider: AiProviderInfo;
  onSelectProvider: (provider: AiProviderInfo) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  validationStatus: ValidationStatus;
  validationError: string | null;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  availableModels: string[];
}

/**
 * "Chat" section: provider, API key (validated automatically), model,
 * and the server address tucked under Advanced unless it is required.
 */
export const AiSection: React.FC<AiSectionProps> = ({
  provider,
  onSelectProvider,
  apiKey,
  onApiKeyChange,
  validationStatus,
  validationError,
  baseUrl,
  onBaseUrlChange,
  model,
  onModelChange,
  availableModels
}) => {
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const isCustom = provider.id === 'custom';

  const filteredModels = availableModels.filter((m) =>
    m.toLowerCase().includes(modelSearchQuery.toLowerCase())
  );

  const serverAddressField = (
    <div className="form-group">
      <label className="form-label" htmlFor="ai-base-url">Server address</label>
      <input
        id="ai-base-url"
        type="text"
        value={baseUrl}
        onChange={(e) => onBaseUrlChange(e.target.value)}
        placeholder={isCustom ? 'https://api.example.com/v1' : provider.defaultBaseUrl}
        className="form-input"
        required={isCustom}
      />
      {!isCustom && <span className="field-hint">Only change this if you know you need to.</span>}
    </div>
  );

  return (
    <section className="settings-section">
      <div className="settings-panel">
        <Select
          label="Provider"
          options={PROVIDER_OPTIONS}
          value={provider.id}
          onChange={(id) => {
            const next = AI_PROVIDERS.find((p) => p.id === id);
            if (next) onSelectProvider(next);
          }}
        />

        {provider.requiresApiKey ? (
          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label" htmlFor="ai-api-key">API key</label>
              {provider.helpUrl && (
                <a className="field-link" href={provider.helpUrl} target="_blank" rel="noreferrer">
                  Get a key <ExternalLink size={11} />
                </a>
              )}
            </div>

            <input
              id="ai-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={provider.placeholder}
              className={`form-input validation-${validationStatus}`}
              aria-invalid={validationStatus === 'invalid'}
            />

            {validationStatus === 'valid' && (
              <div className="field-status is-valid">
                <CheckCircle size={14} />
                <span>Connected</span>
              </div>
            )}
            {validationStatus === 'invalid' && (
              <div className="field-status is-invalid" role="alert">
                <AlertCircle size={14} />
                <span>{validationError || "Couldn't connect. Check the key and try again."}</span>
              </div>
            )}
            {validationStatus === 'validating' && (
              <div className="field-status is-validating">
                <RefreshCw size={14} className="spin" />
                <span>Checking…</span>
              </div>
            )}
          </div>
        ) : (
          <p className="field-hint">Runs on your computer. No key needed.</p>
        )}

        {isCustom && serverAddressField}

        <div className="form-group">
          <label className="form-label" htmlFor="ai-model">Model</label>
          {availableModels.length > 0 ? (
            <>
              {availableModels.length > 8 && (
                <div className="settings-search">
                  <Search size={14} className="settings-search-icon" />
                  <input
                    type="text"
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    placeholder="Search models"
                    className="form-input"
                    aria-label="Search models"
                  />
                </div>
              )}
              <select
                id="ai-model"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="form-input"
              >
                {filteredModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {filteredModels.length === 0 && (
                  <option value={model} disabled>No matching models</option>
                )}
              </select>
            </>
          ) : (
            <input
              id="ai-model"
              type="text"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={provider.defaultModel || 'Model name'}
              className="form-input"
            />
          )}
        </div>

        {!isCustom && (
          <details className="settings-advanced">
            <summary>Advanced</summary>
            {serverAddressField}
          </details>
        )}
      </div>
    </section>
  );
};

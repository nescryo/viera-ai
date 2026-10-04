import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { AiProviderInfo } from '../../../data/aiProviders';

interface ProviderSelectProps {
  providers: AiProviderInfo[];
  selected: AiProviderInfo;
  onSelect: (provider: AiProviderInfo) => void;
}

/**
 * Compact dropdown for picking the AI provider.
 * Reuses the profile dropdown look and opens downward.
 */
export const ProviderSelect: React.FC<ProviderSelectProps> = ({ providers, selected, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const choose = (provider: AiProviderInfo) => {
    if (provider.id !== selected.id) onSelect(provider);
    setIsOpen(false);
  };

  return (
    <div className="form-group">
      <label className="form-label" id={labelId}>Provider</label>
      <div className="settings-select" ref={rootRef}>
        <button
          type="button"
          className="form-input settings-select-trigger"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={labelId}
        >
          <span>{selected.name}</span>
          <ChevronDown size={16} className={`dropdown-arrow ${isOpen ? 'open' : ''}`} />
        </button>

        {isOpen && (
          <ul className="cai-custom-dropdown-menu settings-select-menu" role="listbox" aria-labelledby={labelId}>
            {providers.map((provider) => {
              const isSelected = provider.id === selected.id;
              return (
                <li
                  key={provider.id}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  className={`cai-dropdown-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => choose(provider)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      choose(provider);
                    }
                  }}
                >
                  <span>
                    {provider.name}
                    {!provider.requiresApiKey && <span className="settings-select-tag">On your computer</span>}
                  </span>
                  {isSelected && <Check size={14} className="option-check" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SettingsSelectOption<T extends string> {
  id: T;
  label: string;
  /** Short muted note shown after the label (e.g. "No setup needed"). */
  tag?: string;
}

interface SettingsSelectProps<T extends string> {
  label: string;
  options: SettingsSelectOption<T>[];
  value: T;
  onChange: (id: T) => void;
}

/**
 * Compact dropdown used across Settings (chat provider, voice engine).
 * Reuses the profile dropdown look and opens downward.
 */
export const SettingsSelect = <T extends string>({ label, options, value, onChange }: SettingsSelectProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const selected = options.find((o) => o.id === value) ?? options[0];

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

  const choose = (id: T) => {
    if (id !== value) onChange(id);
    setIsOpen(false);
  };

  return (
    <div className="form-group">
      <label className="form-label" id={labelId}>{label}</label>
      <div className="settings-select" ref={rootRef}>
        <button
          type="button"
          className="form-input settings-select-trigger"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={labelId}
        >
          <span>{selected?.label}</span>
          <ChevronDown size={16} className={`dropdown-arrow ${isOpen ? 'open' : ''}`} />
        </button>

        {isOpen && (
          <ul className="cai-custom-dropdown-menu settings-select-menu" role="listbox" aria-labelledby={labelId}>
            {options.map((option) => {
              const isSelected = option.id === value;
              return (
                <li
                  key={option.id}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  className={`cai-dropdown-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => choose(option.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      choose(option.id);
                    }
                  }}
                >
                  <span>
                    {option.label}
                    {option.tag && <span className="settings-select-tag">{option.tag}</span>}
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

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import './forms.css';

export interface SelectOption<T extends string> {
  id: T;
  label: string;
  /** Short muted note shown after the label (e.g. "No setup needed"). */
  tag?: string;
}

// Approximate menu geometry, kept in sync with .select-menu / .select-option
const MENU_MAX_HEIGHT = 260;
const ROW_HEIGHT = 38;
const MENU_PADDING = 12;

interface SelectProps<T extends string> {
  label: string;
  options: SelectOption<T>[];
  value: T;
  onChange: (id: T) => void;
}

/**
 * Dropdown used across the app (chat provider, voice engine, gender).
 * Keyboard: Enter/Space on the trigger opens the list, Tab moves through
 * options, Enter/Space picks one, Escape closes.
 */
export const Select = <T extends string>({ label, options, value, onChange }: SelectProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const selected = options.find((o) => o.id === value) ?? options[0];

  // Close on outside click or Escape. Escape stops here so it does not also
  // close the modal that contains the dropdown.
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen]);

  // Open upward when there is not enough room below inside the modal/viewport
  const toggle = () => {
    if (!isOpen && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      const bound = rootRef.current.closest('.modal-container')?.getBoundingClientRect().bottom ?? window.innerHeight;
      const needed = Math.min(MENU_MAX_HEIGHT, options.length * ROW_HEIGHT + MENU_PADDING);
      const roomBelow = bound - rect.bottom;
      setOpensUp(roomBelow < needed && rect.top > roomBelow);
    }
    setIsOpen((prev) => !prev);
  };

  const choose = (id: T) => {
    if (id !== value) onChange(id);
    setIsOpen(false);
  };

  return (
    <div className="form-group">
      <label className="form-label" id={labelId}>{label}</label>
      <div className="select" ref={rootRef}>
        <button
          type="button"
          className="form-input select-trigger"
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={labelId}
        >
          <span>{selected?.label}</span>
          <ChevronDown size={16} className={`select-arrow ${isOpen ? 'is-open' : ''}`} />
        </button>

        {isOpen && (
          <ul className={`select-menu ${opensUp ? 'select-menu--up' : ''}`} role="listbox" aria-labelledby={labelId}>
            {options.map((option) => {
              const isSelected = option.id === value;
              return (
                <li
                  key={option.id}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  className={`select-option ${isSelected ? 'is-selected' : ''}`}
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
                    {option.tag && <span className="select-tag">{option.tag}</span>}
                  </span>
                  {isSelected && <Check size={14} className="select-option-check" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

import { useId } from 'react';
import './forms.css';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  /** Render a textarea instead of a single-line input. */
  multiline?: boolean;
  rows?: number;
  autoFocus?: boolean;
  autoComplete?: string;
  /** Fixed text shown inside the field before the value (e.g. "@"). */
  prefix?: string;
}

/** Shows the character counter only once the value is close to the limit. */
const COUNTER_THRESHOLD = 0.8;

/**
 * Labeled text input or textarea in the shared form style.
 * The counter appears only near the limit so it does not add noise.
 */
export const TextField = ({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  required,
  multiline,
  rows = 3,
  autoFocus,
  autoComplete = 'off',
  prefix
}: TextFieldProps) => {
  const id = useId();
  const showCounter = maxLength !== undefined && value.length >= maxLength * COUNTER_THRESHOLD;

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          className="form-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          required={required}
          rows={rows}
          autoFocus={autoFocus}
        />
      ) : (
        <div className={prefix ? 'input-affix' : undefined}>
          {prefix && <span className="input-prefix" aria-hidden="true">{prefix}</span>}
          <input
            id={id}
            type="text"
            className={`form-input ${prefix ? 'has-prefix' : ''}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            required={required}
            autoFocus={autoFocus}
            autoComplete={autoComplete}
          />
        </div>
      )}
      {showCounter && maxLength !== undefined && (
        <span className={`field-counter ${value.length >= maxLength ? 'is-full' : ''}`} aria-live="polite">
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  );
};

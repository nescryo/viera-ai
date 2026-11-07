import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Smile } from 'lucide-react';
import {
  EMOTION_REGISTRY,
  MODIFIER_REGISTRY,
  EYE_REGISTRY,
  DEFAULT_EMOTION_ID,
  formatExpressionSpec,
  parseExpressionSpec
} from '../../data/emotionRegistry';

interface ExpressionMenuProps {
  currentEmotion: string;
  onSelectEmotion: (emotion: string) => void;
  onOpenLorebook: () => void;
}

/**
 * Header character menu: preview facial expressions and open Memory.
 * Closes on outside click or Escape.
 */
export const ExpressionMenu: React.FC<ExpressionMenuProps> = ({
  currentEmotion,
  onSelectEmotion,
  onOpenLorebook
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const spec = parseExpressionSpec(currentEmotion);
  const activeBase = spec.base ?? DEFAULT_EMOTION_ID;
  const hasModifiers = Object.keys(spec.modifiers).length > 0;

  const selectBase = (id: string) => {
    onSelectEmotion(formatExpressionSpec({ ...spec, base: id }));
  };

  /** Picks an eye symbol, or clears it with `null`. Clicking the active symbol clears it. */
  const selectEye = (id: string | null) => {
    onSelectEmotion(formatExpressionSpec({ ...spec, base: activeBase, eye: id ? { id, weight: 1 } : undefined }));
  };

  const setBaseWeight = (weight: number) => {
    onSelectEmotion(formatExpressionSpec({ ...spec, base: activeBase, baseWeight: weight }));
  };

  const setModifierWeight = (id: string, weight: number) => {
    const modifiers = { ...spec.modifiers };
    if (weight > 0) modifiers[id] = weight;
    else delete modifiers[id];
    onSelectEmotion(formatExpressionSpec({ ...spec, base: activeBase, modifiers }));
  };

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="expression-menu-container" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`icon-btn expression-trigger-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Open character menu"
        title="Expressions & Memory"
      >
        <Smile size={23} strokeWidth={2} />
      </button>

      {isOpen && (
        <div className="expression-dropdown-card">
          <div className="expression-dropdown-scroll">
          <div className="expression-dropdown-header">Expression</div>
          <div className="expression-dropdown-divider" />
          <div className="testing-emotions-list">
            {EMOTION_REGISTRY.map((emo) => (
              <button
                key={emo.id}
                type="button"
                className={`emotion-test-btn ${activeBase === emo.id ? 'active' : ''}`}
                onClick={() => selectBase(emo.id)}
                aria-pressed={activeBase === emo.id}
                aria-label={`Test expression: ${emo.label}`}
              >
                {emo.label}
              </button>
            ))}
          </div>
          <div className="expression-dropdown-divider expression-dropdown-divider-section" />
          <div className="modifier-slider-list">
            <label className="modifier-slider">
              <span className="modifier-slider-label">
                Intensity
                <span className="modifier-slider-value">{(spec.baseWeight ?? 1).toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={spec.baseWeight ?? 1}
                onChange={(event) => setBaseWeight(Number(event.target.value))}
                aria-label="Expression intensity"
              />
            </label>
          </div>
          <div className="expression-dropdown-divider expression-dropdown-divider-section" />
          <div className="expression-dropdown-header">Modifiers</div>
          <div className="modifier-slider-list">
            {MODIFIER_REGISTRY.map((mod) => {
              const weight = spec.modifiers[mod.id] ?? 0;
              return (
                <label key={mod.id} className="modifier-slider">
                  <span className="modifier-slider-label">
                    {mod.label}
                    <span className="modifier-slider-value">{weight.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weight}
                    onChange={(event) => setModifierWeight(mod.id, Number(event.target.value))}
                    aria-label={`${mod.label} strength`}
                  />
                </label>
              );
            })}
            <button
              type="button"
              className="emotion-test-btn"
              disabled={!hasModifiers}
              onClick={() => onSelectEmotion(formatExpressionSpec({ ...spec, modifiers: {} }))}
            >
              Reset modifiers
            </button>
          </div>
          <div className="expression-dropdown-divider expression-dropdown-divider-section" />
          <div className="expression-dropdown-header">Eyes</div>
          <div className="testing-emotions-list">
            {EYE_REGISTRY.map((eye) => (
              <button
                key={eye.id}
                type="button"
                className={`emotion-test-btn ${spec.eye?.id === eye.id ? 'active' : ''}`}
                onClick={() => selectEye(spec.eye?.id === eye.id ? null : eye.id)}
                aria-pressed={spec.eye?.id === eye.id}
                aria-label={`Eye symbol: ${eye.label}`}
              >
                {eye.label}
              </button>
            ))}
          </div>
          </div>
          <div className="expression-dropdown-divider expression-dropdown-divider-section" />
          <button
            type="button"
            className="emotion-test-btn character-menu-link"
            onClick={() => {
              setIsOpen(false);
              onOpenLorebook();
            }}
          >
            <BookOpen size={15} strokeWidth={1.75} />
            Memory
          </button>
        </div>
      )}
    </div>
  );
};

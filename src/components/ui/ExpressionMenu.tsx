import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Smile } from 'lucide-react';
import { EMOTION_REGISTRY } from '../../data/emotionRegistry';

interface ExpressionMenuProps {
  currentEmotion: string;
  onSelectEmotion: (emotion: string) => void;
  onOpenLorebook: () => void;
}

/**
 * Header character menu: preview facial expressions and open the Lorebook.
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
        title="Expressions & Lorebook"
      >
        <Smile size={20} strokeWidth={2} />
      </button>

      {isOpen && (
        <div className="expression-dropdown-card">
          <div className="expression-dropdown-header">Expression</div>
          <div className="expression-dropdown-divider" />
          <div className="testing-emotions-list">
            {EMOTION_REGISTRY.map((emo) => (
              <button
                key={emo.id}
                type="button"
                className={`emotion-test-btn ${currentEmotion === emo.id ? 'active' : ''}`}
                onClick={() => onSelectEmotion(emo.id)}
                aria-pressed={currentEmotion === emo.id}
                aria-label={`Test expression: ${emo.label}`}
              >
                {emo.label}
              </button>
            ))}
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
            Lorebook
          </button>
        </div>
      )}
    </div>
  );
};

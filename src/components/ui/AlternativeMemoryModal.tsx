import React, { useEffect, useId, useState } from 'react';
import type { Persona } from '../../types';
import { BookOpen, X, RotateCcw } from 'lucide-react';
import './forms/forms.css';
import './MemoryModal.css';

interface AlternativeMemoryModalProps {
  persona: Persona;
  onSaveCustomLore: (newLore: string) => void;
  onClose: () => void;
}

export const AlternativeMemoryModal: React.FC<AlternativeMemoryModalProps> = ({
  persona,
  onSaveCustomLore,
  onClose
}) => {
  const [lore, setLore] = useState<string>(persona.customLore || '');
  const textareaId = useId();

  // Escape closes the modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSave = () => {
    onSaveCustomLore(lore);
    onClose();
  };

  const wordCount = lore.trim() ? lore.trim().split(/\s+/).length : 0;
  const hasLore = Boolean(lore.trim());

  return (
    <div className="modal-backdrop fade-in" onClick={onClose}>
      <div
        className="modal-container memory-modal glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-title"
        aria-describedby="memory-subtitle"
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <BookOpen className="modal-icon" size={20} />
            <h3 id="memory-title">Memory</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="memory-body">
          <p id="memory-subtitle" className="memory-subtitle">
            Character will always remember information about your memory to enhance your conversation with them.
          </p>

          <div className="memory-persona">
            <img src={persona.avatarUrl} alt="" className="memory-persona-avatar" />
            <div className="memory-persona-meta">
              <span className="memory-persona-name">{persona.name}</span>
              <span className="memory-persona-tagline">{persona.tagline}</span>
            </div>
          </div>

          <div className="form-group memory-field">
            <div className="form-label-row">
              <label htmlFor={textareaId} className="form-label">Add custom Memory:</label>
              <span className="memory-word-count">{wordCount} words</span>
            </div>
            <textarea
              id={textareaId}
              value={lore}
              onChange={(e) => setLore(e.target.value)}
              placeholder="Describe the background details of what you want the character to remember"
              rows={8}
              className="form-input memory-textarea"
            />
          </div>
        </div>

        <div className="modal-footer memory-footer">
          {/* Kept in the layout (just disabled) so the footer does not shift */}
          <button
            type="button"
            className="btn btn--ghost is-danger"
            onClick={() => setLore('')}
            disabled={!hasLore}
            aria-label="Clear Memory content"
          >
            <RotateCcw size={14} />
            <span>Clear Memory</span>
          </button>

          <div className="memory-footer-actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={handleSave}>
              Save Memory
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

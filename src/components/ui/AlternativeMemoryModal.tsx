import React, { useState } from 'react';
import type { Persona } from '../../types';
import { BookOpen, X, RotateCcw, Check } from 'lucide-react';

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

  const handleClear = () => {
    setLore('');
  };

  const handleSave = () => {
    onSaveCustomLore(lore);
    onClose();
  };

  const wordCount = lore.trim() ? lore.trim().split(/\s+/).length : 0;

  return (
    <div className="modal-backdrop fade-in" onClick={onClose}>
      <div 
        className="modal-container lorebook-modal-card glass-panel" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="lorebook-header-icon">
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className="lorebook-title">Lorebook</h3>
              <p className="lorebook-subtitle">
                Character will always remember information about your lorebook to enhance your conversation with them.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="lorebook-body">
          {/* Active Persona Profile Card */}
          <div className="lorebook-persona-card">
            <img 
              src={persona.avatarUrl} 
              alt={persona.name} 
              className="lorebook-persona-avatar"
            />
            <div className="lorebook-persona-meta">
              <span className="lorebook-persona-name">{persona.name}</span>
              <span className="lorebook-persona-tagline">{persona.tagline}</span>
            </div>
          </div>

          {/* Textarea Input */}
          <div className="lorebook-input-group">
            <div className="lorebook-input-header">
              <label htmlFor="lorebook-textarea" className="lorebook-input-label">
                Add custom Lorebook:
              </label>
              <span className="lorebook-word-count">
                {wordCount} words
              </span>
            </div>
            <textarea
              id="lorebook-textarea"
              value={lore}
              onChange={(e) => setLore(e.target.value)}
              placeholder="Describe the background details of what you want the character to remember"
              rows={8}
              className="lorebook-textarea"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="lorebook-footer">
          <div>
            {lore.trim() && (
              <button
                type="button"
                onClick={handleClear}
                className="lorebook-clear-btn"
                aria-label="Clear Lorebook content"
              >
                <RotateCcw size={14} />
                <span>Clear Lorebook</span>
              </button>
            )}
          </div>

          <div className="lorebook-footer-actions">
            <button
              type="button"
              className="icon-btn lorebook-cancel-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="lorebook-save-btn"
            >
              <Check size={16} />
              <span>Save Lorebook</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

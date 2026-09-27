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
    <div className="modal-backdrop glass-panel fade-in" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="modal-container glass-panel" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px', width: '92%', borderRadius: '16px', overflow: 'hidden' }}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', padding: '16px 20px' }}>
          <div className="modal-title-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(168, 85, 247, 0.25))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa'
            }}>
              <BookOpen size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Lorebook</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.4 }}>
                Character will always remember information about your lorebook to enhance your conversation with them.
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px' }}>
          {/* Active Persona Profile Card */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '16px'
          }}>
            <img 
              src={persona.avatarUrl} 
              alt={persona.name} 
              style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(96, 165, 250, 0.5)' }} 
            />
            <div>
              <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff', display: 'block' }}>{persona.name}</span>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>{persona.tagline}</span>
            </div>
          </div>

          {/* Textarea Input */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 500, color: '#fff' }}>
                Add custom Lorebook:
              </label>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.45)' }}>
                {wordCount} words
              </span>
            </div>
            <textarea
              value={lore}
              onChange={(e) => setLore(e.target.value)}
              placeholder="Describe the background details of what you want the avatar to remember"
              rows={8}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#fff',
                fontSize: '0.85rem',
                lineHeight: '1.5',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => (e.target.style.borderColor = '#60a5fa')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)')}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '14px 20px',
          background: 'rgba(0, 0, 0, 0.2)'
        }}>
          <div>
            {lore.trim() && (
              <button
                type="button"
                onClick={handleClear}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#f87171',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: '6px'
                }}
              >
                <RotateCcw size={13} />
                Clear Lorebook
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                border: 'none',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 10px rgba(59, 130, 246, 0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              <Check size={16} />
              Save Lorebook
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

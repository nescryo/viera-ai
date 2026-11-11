import React from 'react';
import { Gamepad2, X } from 'lucide-react';
import { MINIGAMES } from '../../data/minigames';
import type { MinigameId } from '../../data/minigames';
import './forms/forms.css';
import './MinigameModal.css';

interface MinigameModalProps {
  onSelect: (id: MinigameId) => void;
  onClose: () => void;
}

/** Lists the available minigames. Entries come from `data/minigames.ts`. */
export const MinigameModal: React.FC<MinigameModalProps> = ({ onSelect, onClose }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div
      className="modal-container minigame-modal glass-panel"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="minigame-title"
    >
      <div className="modal-header">
        <div className="modal-title-group">
          <Gamepad2 className="modal-icon" size={20} />
          <h3 id="minigame-title">Minigames</h3>
        </div>
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close minigames">
          <X size={20} />
        </button>
      </div>

      <ul className="minigame-list">
        {MINIGAMES.map((game) => {
          const Icon = game.icon;
          const available = game.status === 'available';
          return (
            <li key={game.id} className="minigame-card">
              <Icon className="minigame-card-icon" size={28} aria-hidden="true" />
              <div className="minigame-card-text">
                <h4>{game.title}</h4>
                <p>{game.description}</p>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!available}
                onClick={() => onSelect(game.id)}
              >
                {available ? 'Play' : 'Soon'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  </div>
);

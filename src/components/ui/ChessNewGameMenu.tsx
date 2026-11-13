import React, { useEffect, useRef, useState } from 'react';
import type { Color } from 'chess.js';
import { RotateCcw } from 'lucide-react';

interface ChessNewGameMenuProps {
  /** Called with the chosen color. "Random" is resolved before this is called. */
  onStart: (color: Color) => void;
  /** `icon` is the toolbar button, `primary` is the "Play again" button. */
  variant?: 'icon' | 'primary';
}

const COLOR_OPTIONS: { id: 'w' | 'b' | 'random'; label: string }[] = [
  { id: 'w', label: 'White' },
  { id: 'b', label: 'Black' },
  { id: 'random', label: 'Random' }
];

/** Button that opens a small popover to pick the user's color before a new game starts. */
export const ChessNewGameMenu: React.FC<ChessNewGameMenuProps> = ({ onStart, variant = 'icon' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (id: 'w' | 'b' | 'random') => {
    const color: Color = id === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : id;
    setOpen(false);
    onStart(color);
  };

  return (
    <div ref={rootRef} className="chess-newgame">
      {variant === 'icon' ? (
        <button
          type="button"
          className="chess-icon-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Start a new game"
          title="New game"
          onClick={() => setOpen((value) => !value)}
        >
          <RotateCcw size={20} />
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--primary"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          Play again
        </button>
      )}
      {open && (
        <div className="chess-newgame-menu" role="menu" aria-label="Play as">
          {COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              className="chess-newgame-option"
              onClick={() => choose(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

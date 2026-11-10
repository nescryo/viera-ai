import type { LucideIcon } from 'lucide-react';
import { Crown } from 'lucide-react';

export type MinigameId = 'chess';

export interface MinigameEntry {
  id: MinigameId;
  title: string;
  description: string;
  icon: LucideIcon;
  /** `coming-soon` entries are listed but cannot be started. */
  status: 'available' | 'coming-soon';
}

/** Minigames listed in the header's Minigames modal. Add one entry per game. */
export const MINIGAMES: MinigameEntry[] = [
  {
    id: 'chess',
    title: 'Chess',
    description: 'Play a game of chess against DeepSeek-chan.',
    icon: Crown,
    status: 'available'
  }
];

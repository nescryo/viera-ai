import type { ComponentType } from 'react';
import { ChessBoardIcon } from '../components/ui/ChessBoardIcon';
import type { MinigameIconProps } from '../components/ui/ChessBoardIcon';

export type MinigameId = 'chess';

export interface MinigameEntry {
  id: MinigameId;
  title: string;
  description: string;
  /** Lucide icons and custom SVG components both fit this shape. */
  icon: ComponentType<MinigameIconProps>;
  /** `coming-soon` entries are listed but cannot be started. */
  status: 'available' | 'coming-soon';
}

/** Minigames listed in the header's Minigames modal. Add one entry per game. */
export const MINIGAMES: MinigameEntry[] = [
  {
    id: 'chess',
    title: 'Chess',
    description: 'Play a game of chess against DeepSeek-chan.',
    icon: ChessBoardIcon,
    status: 'available'
  }
];

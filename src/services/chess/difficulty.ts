export type DifficultyId = 'beginner' | 'casual' | 'intermediate' | 'advanced' | 'master';

export interface DifficultyPreset {
  id: DifficultyId;
  label: string;
  /** Human-equivalent rating label shown in the UI (Chess.com scale). */
  displayElo: string;
  /** Stockfish Skill Level (0..20). Lower values inject multi-PV noise. */
  skillLevel: number;
  /** Whether to enable Stockfish's UCI_LimitStrength (range 1320..3190). */
  limitStrength: boolean;
  uciElo?: number;
  /** Search depth cap for human-like lower levels. */
  depth?: number;
  /** Search time in ms (or minimum visual thinking delay when `depth` is capped). */
  movetimeMs: number;
}

export const DIFFICULTY_PRESETS: readonly DifficultyPreset[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    displayElo: '~500',
    skillLevel: 0,
    limitStrength: false,
    depth: 1,
    movetimeMs: 350
  },
  {
    id: 'casual',
    label: 'Casual',
    displayElo: '~900',
    skillLevel: 3,
    limitStrength: false,
    depth: 2,
    movetimeMs: 400
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    displayElo: '~1200',
    skillLevel: 6,
    limitStrength: false,
    depth: 4,
    movetimeMs: 500
  },
  {
    id: 'advanced',
    label: 'Advanced',
    displayElo: '~1600',
    skillLevel: 14,
    limitStrength: true,
    uciElo: 1600,
    movetimeMs: 650
  },
  {
    id: 'master',
    label: 'Master',
    displayElo: '2200+',
    skillLevel: 20,
    limitStrength: false,
    movetimeMs: 1000
  }
];

export const DEFAULT_DIFFICULTY_ID: DifficultyId = 'casual';

/** Looks up a difficulty preset by ID, falling back to `DEFAULT_DIFFICULTY_ID`. */
export function getDifficultyPreset(id: DifficultyId): DifficultyPreset {
  return DIFFICULTY_PRESETS.find((preset) => preset.id === id) ?? DIFFICULTY_PRESETS[1];
}

/** Builds the UCI `setoption` commands for a difficulty preset. */
export function toUciConfigureCommands(preset: DifficultyPreset): string[] {
  const commands = [
    `setoption name Skill Level value ${preset.skillLevel}`,
    `setoption name UCI_LimitStrength value ${preset.limitStrength ? 'true' : 'false'}`
  ];
  if (preset.limitStrength && preset.uciElo !== undefined) {
    const clampedElo = Math.max(1320, Math.min(3190, Math.round(preset.uciElo)));
    commands.push(`setoption name UCI_Elo value ${clampedElo}`);
  }
  return commands;
}

/** Builds the UCI `go` command for a difficulty preset. */
export function toUciGoCommand(preset: DifficultyPreset): string {
  if (preset.depth !== undefined) {
    return `go depth ${preset.depth}`;
  }
  return `go movetime ${preset.movetimeMs}`;
}

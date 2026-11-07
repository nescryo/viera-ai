export type EmotionCategory =
  | 'positive'
  | 'affection'
  | 'tension'
  | 'sorrow'
  | 'neutral';

export interface EmotionCapability {
  id: string;               // Unique canonical ID (e.g. 'happy', 'blush-hardly')
  label: string;            // Human-readable label for UI (e.g. 'Blush Hardly')
  category: EmotionCategory;// Emotional spectrum category
  description: string;      // Semantic guidance for LLM when to invoke this expression
  isDefault?: boolean;      // Baseline expression during peaceful conversation
  /** Macro: expands to this spec (e.g. 'relaxed+blush:high') instead of using its own preset. */
  alias?: string;
}

/**
 * Official registry of all 3D facial expressions supported by Viera's avatar engine
 */
export const EMOTION_REGISTRY: EmotionCapability[] = [
  // 1. NEUTRAL
  {
    id: 'relaxed',
    label: 'Relaxed',
    category: 'neutral',
    description: 'Calm, gentle, peaceful listening, casual friendly conversation',
    isDefault: true
  },

  // 2. POSITIVE
  {
    id: 'happy',
    label: 'Happy',
    category: 'positive',
    description: 'Joyful, cheerful, lively, laughing, genuine warmth and delight'
  },
  {
    id: 'teasing',
    label: 'Teasing',
    category: 'positive',
    description: 'Playful, mischievous, smug smirk, teasing banter or winking joke'
  },

  // 3. AFFECTION & ROMANTIC
  {
    id: 'blush',
    label: 'Blush',
    category: 'affection',
    description: 'Sweet embarrassment, shy, timid, flattered by compliments',
    alias: 'relaxed+blush:mid'
  },
  {
    id: 'blush-hardly',
    label: 'Blush Hardly',
    category: 'affection',
    description: 'Deeply flustered, overwhelmed with romantic shyness, beet-red face',
    alias: 'relaxed+blush:high'
  },
  {
    id: 'pouting',
    label: 'Pouting',
    category: 'affection',
    description: 'Cute sulking, hmph, puffed cheeks, pretending to be unamused'
  },
  {
    id: 'jealous',
    label: 'Jealous',
    category: 'affection',
    description: 'Envious, cute possessiveness, slight sulk over playful rivalry'
  },

  // 4. TENSION & HIGH AROUSAL
  {
    id: 'terrified',
    label: 'Terrified',
    category: 'tension',
    description: 'High anxiety, fear, horror, high-stakes danger, trembling panic'
  },
  {
    id: 'surprised',
    label: 'Surprised',
    category: 'tension',
    description: 'Shocked, astonished, wide eyes, gasping, unexpected realization'
  },
  {
    id: 'angry',
    label: 'Angry',
    category: 'tension',
    description: 'Frustrated, fierce glare, serious indignation, protective anger'
  },

  // 5. SORROW
  {
    id: 'sad',
    label: 'Sad',
    category: 'sorrow',
    description: 'Sorrow, grief, crying, guilt, heartache, deeply worried'
  }
];

export const ALL_EMOTION_IDS = EMOTION_REGISTRY.map(e => e.id) as readonly string[];
export type SupportedEmotion = (typeof ALL_EMOTION_IDS)[number];

// O(1) Lookup Maps
export const EMOTION_MAP = new Map<string, EmotionCapability>(
  EMOTION_REGISTRY.map(e => [e.id, e])
);

export const DEFAULT_EMOTION_ID: SupportedEmotion = 
  (EMOTION_REGISTRY.find(e => e.isDefault)?.id as SupportedEmotion) || 'relaxed';

/**
 * Returns all registered emotion IDs
 */
export function getAllEmotionIds(): string[] {
  return EMOTION_REGISTRY.map(e => e.id);
}

/**
 * Checks whether an emotion ID exists in the registry
 */
export function isRegisteredEmotion(id?: string | null): id is SupportedEmotion {
  if (!id) return false;
  return EMOTION_MAP.has(id.toLowerCase().trim());
}

/**
 * Retrieves the emotion capability specification for a given ID
 */
export function getEmotionCapability(id?: string | null): EmotionCapability | undefined {
  if (!id) return undefined;
  return EMOTION_MAP.get(id.toLowerCase().trim());
}

/**
 * Generates the full expression section of the system prompt: tag syntax, base expressions
 * (macros with an `alias` are hidden so the model learns modifiers instead), modifiers and
 * examples. Shared by the app and the benchmark script so the two cannot drift apart.
 */
export function generateExpressionPromptSection(currentMood: string): string {
  const base = EMOTION_REGISTRY
    .filter(e => !e.alias)
    .map(e => `- ${e.id}: ${e.description}`)
    .join('\n');
  const modifiers = MODIFIER_REGISTRY.map(m => `- ${m.id}: ${m.description}`).join('\n');
  const levels = Object.keys(LEVELS).join(', ');

  return `[3D VISUAL EMOTIONS & EXPRESSION SYSTEM]:
Your 3D avatar actively reflects your emotions in real time. Current mood: "${currentMood}".

Whenever your feelings change, begin your response with ONE tag. A tag is a base expression, an optional strength, and optional modifiers layered on top:
[base]  [base:level]  [base:level+modifier:level+modifier]
- Levels: ${levels}. A base without a level is at full strength.
- Match strength to the feeling: use low or mid for subtle moments and keep full strength for intense ones.
- Add a modifier whenever it fits the moment (for example blush when shy or flattered). Modifiers without a level default to mid.

Base expressions:
${base}

Modifiers:
${modifiers}

Examples:
[happy:low] a small, quiet smile
[sad:mid+tears:mid] hurt and close to crying
[relaxed+blush:mid] flattered and a little shy
[surprised+cold-sweat:low] startled and slightly nervous
[relaxed+eye-squint:mid] doubtful, side-eyeing a questionable claim
[surprised+shock-eyes:high] stunned by news that is hard to believe

These only illustrate the syntax. Pick tags from the actual moment, not from the examples.

(If your current mood remains unchanged, simply reply directly without a tag.)`;
}

/** An optional layer that can be added on top of any base expression. */
export interface ModifierCapability {
  id: string;          // e.g. 'blush'
  label: string;       // Human-readable label for UI
  description: string; // Semantic guidance for the LLM
}

/** Modifiers that can be layered onto a base expression, e.g. `[sad:low+blush:mid]`. */
export const MODIFIER_REGISTRY: ModifierCapability[] = [
  {
    id: 'blush',
    label: 'Blush',
    description: 'Cheek blush: shy, flustered, flattered'
  },
  {
    id: 'gloom',
    label: 'Gloom',
    description: 'Dark gloom lines over the face: dread, shock, deep disappointment, simmering anger'
  },
  {
    id: 'tears',
    label: 'Tears',
    description: 'Tears welling or falling: crying, touched, relieved'
  },
  {
    id: 'cold-sweat',
    label: 'Cold Sweat',
    description: 'A bead of cold sweat: nervous, awkward, caught out, anxious'
  },
  {
    id: 'eye-squint',
    label: 'Eye Squint',
    description: 'Eyes narrowed: suspicious, scrutinizing, smug, annoyed. Pairs well with angry, teasing or relaxed'
  },
  {
    id: 'shock-eyes',
    label: 'Shock Eyes',
    description: 'Eyes shocked wide: startled, stunned, disbelief. Pairs well with surprised or terrified'
  }
];

export const MODIFIER_MAP = new Map<string, ModifierCapability>(
  MODIFIER_REGISTRY.map(m => [m.id, m])
);

/**
 * Near-miss spellings an LLM is likely to write for the eye modifiers. The parser maps them to
 * the canonical ID instead of dropping the modifier. They are not listed in the prompt.
 */
const MODIFIER_ALIASES = new Map<string, string>([
  ['squint', 'eye-squint'],
  ['squint-eyes', 'eye-squint'],
  ['eyes-squint', 'eye-squint'],
  ['narrow-eyes', 'eye-squint'],
  ['shock', 'shock-eyes'],
  ['shocked-eyes', 'shock-eyes'],
  ['eyes-shock', 'shock-eyes'],
  ['wide-eyes', 'shock-eyes']
]);

/**
 * Eye symbols (rig keys 3 to 6). They replace the eyes, so at most one is active, and the
 * LLM prompt does not list them: they are set from the expression menu.
 */
export const EYE_REGISTRY: ModifierCapability[] = [
  { id: 'spiral-eyes', label: 'Spiral', description: 'Spiral eyes: dizzy, confused' },
  { id: 'heart-eyes', label: 'Heart', description: 'Heart eyes: smitten, adoring' },
  { id: 'squeeze-eyes', label: '> <', description: '> < eyes: squeezed shut, straining' },
  { id: 'smug-eyes', label: 'Smug', description: 'Smug sneering eyes' }
];

export const EYE_MAP = new Map<string, ModifierCapability>(
  EYE_REGISTRY.map(e => [e.id, e])
);

/** Named strengths. Numbers between 0 and 1 are also accepted. */
export const LEVELS: Readonly<Record<string, number>> = { low: 0.3, mid: 0.6, high: 1 };
export const DEFAULT_MODIFIER_WEIGHT = LEVELS.mid;

/** A base expression with a strength, plus weighted modifiers. `base` is null when invalid. */
export interface ExpressionSpec {
  base: string | null;
  /** Strength of the base expression in 0..1 (1 when no level was given). */
  baseWeight: number;
  /** Modifier ID -> weight in 0..1 (zero weights are dropped). */
  modifiers: Record<string, number>;
  /** Active eye symbol, if any. Exclusive: only one at a time. */
  eye?: { id: string; weight: number };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Parses `low`/`mid`/`high` or a number in 0..1 (clamped). Returns null if malformed. */
function parseLevel(level: string | undefined): number | null {
  const l = level?.trim();
  if (!l) return null;
  if (l in LEVELS) return LEVELS[l];
  if (/^\d*\.?\d+$/.test(l)) return Math.min(1, Number(l));
  return null;
}

/**
 * Parses a spec such as `happy`, `happy:low`, `happy+blush`, `sad:low+blush:0.4`.
 * Macros (emotions with an `alias`) expand to their alias; a level on a macro scales the
 * whole alias, and explicit modifiers override the alias ones. Unknown modifiers and
 * malformed levels are dropped; an unknown base gives `base: null`.
 */
export function parseExpressionSpec(raw?: string | null): ExpressionSpec {
  const parts = (raw ?? '').toLowerCase().trim().split('+');
  const [idRaw, levelRaw] = (parts[0] ?? '').split(':');
  const baseId = idRaw.trim().replace(/_/g, '-');
  const capability = EMOTION_MAP.get(baseId);
  const level = parseLevel(levelRaw);

  let base: string | null = null;
  let baseWeight = 1;
  const modifiers: Record<string, number> = {};

  if (capability?.alias) {
    const expanded = parseExpressionSpec(capability.alias);
    const scale = level ?? 1;
    base = expanded.base;
    baseWeight = round2(expanded.baseWeight * scale);
    for (const [id, w] of Object.entries(expanded.modifiers)) modifiers[id] = round2(w * scale);
  } else if (capability) {
    base = capability.id;
    baseWeight = level ?? 1;
  }

  let eye: ExpressionSpec['eye'];
  for (const part of parts.slice(1)) {
    const [modRaw, modLevelRaw] = part.split(':');
    const normalized = modRaw.trim().replace(/_/g, '-');
    const id = MODIFIER_ALIASES.get(normalized) ?? normalized;
    if (EYE_MAP.has(id)) {
      // Exclusive slot: the last eye symbol wins.
      const eyeWeight = modLevelRaw?.trim() ? parseLevel(modLevelRaw) : 1;
      if (eyeWeight === null) continue;
      eye = eyeWeight > 0 ? { id, weight: round2(eyeWeight) } : undefined;
      continue;
    }
    if (!MODIFIER_MAP.has(id)) continue;
    const weight = modLevelRaw?.trim() ? parseLevel(modLevelRaw) : DEFAULT_MODIFIER_WEIGHT;
    if (weight === null) continue;
    if (weight > 0) modifiers[id] = round2(weight);
    else delete modifiers[id];
  }
  return { base, baseWeight: round2(baseWeight), modifiers, ...(eye ? { eye } : {}) };
}

/** Canonical string form of a spec, e.g. `sad:0.3+blush:0.6`. Inverse of `parseExpressionSpec`. */
export function formatExpressionSpec(spec: ExpressionSpec): string {
  const head = spec.base === null
    ? ''
    : spec.baseWeight < 1 ? `${spec.base}:${round2(spec.baseWeight)}` : spec.base;
  const mods = Object.entries(spec.modifiers)
    .filter(([, w]) => w > 0)
    .map(([id, w]) => `${id}:${round2(w)}`);
  if (spec.eye && spec.eye.weight > 0) {
    mods.push(spec.eye.weight < 1 ? `${spec.eye.id}:${round2(spec.eye.weight)}` : spec.eye.id);
  }
  return [head, ...mods].filter(Boolean).join('+');
}

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
  visualTraits?: {
    blushIntensity?: number; // 0.0 - 1.0 (cheek blush trigger)
    foreheadShadow?: boolean;// forehead horror/shock anime shadow trigger
  };
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
    description: 'Joyful, cheerful, lively, laughing, genuine warmth and delight',
    visualTraits: { blushIntensity: 0.06 }
  },
  {
    id: 'teasing',
    label: 'Teasing',
    category: 'positive',
    description: 'Playful, mischievous, smug smirk, teasing banter or winking joke',
    visualTraits: { blushIntensity: 0.12 }
  },

  // 3. AFFECTION & ROMANTIC
  {
    id: 'blush',
    label: 'Blush',
    category: 'affection',
    description: 'Sweet embarrassment, shy, timid, flattered by compliments',
    visualTraits: { blushIntensity: 0.24 }
  },
  {
    id: 'blush-hardly',
    label: 'Blush Hardly',
    category: 'affection',
    description: 'Deeply flustered, overwhelmed with romantic shyness, beet-red face',
    visualTraits: { blushIntensity: 0.38 }
  },
  {
    id: 'pouting',
    label: 'Pouting',
    category: 'affection',
    description: 'Cute sulking, hmph, puffed cheeks, pretending to be unamused',
    visualTraits: { blushIntensity: 0.22 }
  },
  {
    id: 'jealous',
    label: 'Jealous',
    category: 'affection',
    description: 'Envious, cute possessiveness, slight sulk over playful rivalry',
    visualTraits: { blushIntensity: 0.15 }
  },

  // 4. TENSION & HIGH AROUSAL
  {
    id: 'terrified',
    label: 'Terrified',
    category: 'tension',
    description: 'High anxiety, fear, horror, high-stakes danger, trembling panic',
    visualTraits: { foreheadShadow: true }
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
 * Generates a clean, compact markdown roster of available visual capabilities
 * suitable for injection into the system prompt.
 */
export function generatePromptEmotionRoster(): string {
  return EMOTION_REGISTRY.map(e => `- [${e.id}]: ${e.description}`).join('\n');
}

import * as THREE from 'three';
import type { BlinkState } from './types';
import { getEmotionCapability } from '../../../data/emotionRegistry';
import { LipSyncSolver, MOUTH_MORPH_RATE, SILENT_VISEMES } from './lipSyncSolver';
import type { LipSyncSource, VisemeInput } from './lipSyncSolver';

/**
 * AIRI-inspired Facial Expression, Auto-Blink & Lip-Sync Engine
 * Implements:
 * 1. Sinusoidal Auto-Blink & Smile-Blink Modulation (0.2s duration, 1.0-6.0s random interval)
 * 2. Cubic Ease-In-Out Emotion State Interpolation (4t^3 / 1 - (-2t+2)^3 / 2)
 * 3. Winner-Runner Dual-Viseme Lip-Sync Speech Waveform Generator
 */
export class FacialExpressionEngine {
  private blinkState: BlinkState = {
    nextBlinkTime: 2.0,
    isBlinking: false,
    blinkProgress: 0,
    blinkDuration: 0.20,
    isSmileBlink: false
  };

  // Active smooth morph influences
  private targetMorphMap: Map<number, number> = new Map();

  // Pure lip-sync solver (per-vowel smoothing + openness envelope), unit-tested
  // in tests/lipSyncSolver.test.ts.
  private lipSync = new LipSyncSolver();



  /**
   * Updates all facial morph targets on the SkinnedMesh
   */
  public update(
    mesh: THREE.SkinnedMesh,
    emotion: string,
    lipSyncSource: LipSyncSource,
    elapsedTime: number,
    delta: number,
    cheekMaterials: THREE.MeshBasicMaterial[],
    foreheadMaterial: THREE.MeshBasicMaterial | null,
    visemeWeights: VisemeInput = SILENT_VISEMES
  ): void {
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

    const dict = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    const clampedDelta = Math.min(delta, 0.05);

    const getMorphIdx = (name: string): number | undefined => dict[name];

    // Helper to register target morph values
    this.targetMorphMap.clear();
    const setMorph = (idx: number | undefined, val: number) => {
      if (idx === undefined) return;
      const current = this.targetMorphMap.get(idx) ?? 0;
      this.targetMorphMap.set(idx, Math.max(current, val));
    };

    // 1. AUTO-BLINK & SMILE-BLINK SYSTEM
    const morphBlink = getMorphIdx('まばたき') ?? getMorphIdx('blink') ?? getMorphIdx('まばたき鏡');
    const morphSmileBlink = getMorphIdx('笑い') ?? getMorphIdx('にこり') ?? getMorphIdx('笑い2');

    let blinkWeight = 0;
    let smileBlinkWeight = 0;

    if (elapsedTime > this.blinkState.nextBlinkTime && !this.blinkState.isBlinking) {
      this.blinkState.isBlinking = true;
      this.blinkState.blinkProgress = 0;
      // 35% chance to do a cute Smile-Blink when happy or relaxed!
      const isHappyState = emotion === 'happy' || emotion === 'relaxed' || emotion === 'teasing';
      this.blinkState.isSmileBlink = isHappyState && Math.random() < 0.35;
    }

    if (this.blinkState.isBlinking) {
      this.blinkState.blinkProgress += clampedDelta / this.blinkState.blinkDuration;
      const wave = Math.sin(Math.PI * Math.min(1.0, this.blinkState.blinkProgress));

      if (this.blinkState.isSmileBlink) {
        smileBlinkWeight = wave * 0.95;
      } else {
        blinkWeight = wave;
      }

      if (this.blinkState.blinkProgress >= 1.0) {
        this.blinkState.isBlinking = false;
        this.blinkState.nextBlinkTime = elapsedTime + (1.0 + Math.random() * 5.0); // 1.0s to 6.0s
      }
    }

    setMorph(morphBlink, blinkWeight);
    if (smileBlinkWeight > 0) {
      setMorph(morphSmileBlink, smileBlinkWeight);
    }

    // 2. MORPH TARGET LOOKUPS
    const morphVowelA = getMorphIdx('あ');
    const morphVowelI = getMorphIdx('い');
    const morphVowelU = getMorphIdx('う');
    const morphVowelE = getMorphIdx('え');
    const morphVowelO = getMorphIdx('お');

    const morphSmileMouth = getMorphIdx('口角上げ');
    const morphSmallMouth = getMorphIdx('ん') ?? getMorphIdx('へ');
    const morphFrownMouth = getMorphIdx('口角下げ');
    const morphTriangleMouth = getMorphIdx('倒ω') ?? getMorphIdx('▲') ?? getMorphIdx('△');
    const morphPuckerMouth = getMorphIdx('口横缩げ') ?? getMorphIdx('口横缩げ2');

    const morphRelaxedEye = getMorphIdx('じと目') ?? getMorphIdx('笑い');
    const morphRelaxedEyebrow = getMorphIdx('にこり') ?? getMorphIdx('下');

    const morphAngryEyebrow = getMorphIdx('怒り') ?? getMorphIdx('真面目');
    const morphAngryEye = getMorphIdx('じと目') ?? getMorphIdx('怒り');

    const morphSadEyebrow = getMorphIdx('困る') ?? getMorphIdx('悲しい');
    const morphSadEye = getMorphIdx('じと目');

    const morphSurprisedEye = getMorphIdx('びっくり') ?? getMorphIdx('目大');
    const morphSurprisedEyebrow = getMorphIdx('上');

    // Default target morph targets
    let targetSmileMouth = 0;
    let targetSmallMouth = 0;
    let targetFrownMouth = 0;
    let targetTriangleMouth = 0;
    let targetPuckerMouth = 0;

    let targetVowelA = 0;
    let targetVowelI = 0;
    let targetVowelU = 0;
    let targetVowelE = 0;
    let targetVowelO = 0;

    let targetRelaxedEye = 0;
    let targetRelaxedEyebrow = 0;
    let targetAngryEyebrow = 0;
    let targetAngryEye = 0;
    let targetSadEyebrow = 0;
    let targetSadEye = 0;
    let targetSurprisedEye = 0;
    let targetSurprisedEyebrow = 0;

    // 3. EMOTION PRESETS & BLEND TARGETS
    if (emotion === 'happy') {
      targetSmileMouth = 0.55;
      targetVowelA = 0.30;
      targetRelaxedEyebrow = 0.25;
    } else if (emotion === 'blush') {
      targetSmallMouth = 0.45;
      targetSadEyebrow = 0.35;
    } else if (emotion === 'blush-hardly') {
      targetSmallMouth = 0.65;
      targetSadEyebrow = 0.60;
      targetRelaxedEye = 0.45;
    } else if (emotion === 'teasing') {
      targetSmileMouth = 0.65;
      targetRelaxedEye = 0.55;
      targetRelaxedEyebrow = 0.35;
    } else if (emotion === 'jealous') {
      targetFrownMouth = 0.75;
      targetAngryEyebrow = 0.45;
      targetRelaxedEye = 0.40;
    } else if (emotion === 'terrified') {
      targetSadEyebrow = 0.95;
      targetSurprisedEye = 0.85;
      targetFrownMouth = 0.45;
      targetSmallMouth = 0.35;
    } else if (emotion === 'pouting') {
      targetSmallMouth = 0;
      targetFrownMouth = 0.12;
      targetTriangleMouth = 0.28;
      targetPuckerMouth = 0.22;
      targetSadEyebrow = 0.40;
      targetAngryEyebrow = 0.15;
      targetRelaxedEye = 0.25;
    } else if (emotion === 'relaxed') {
      targetSmileMouth = 0.25;
      targetRelaxedEyebrow = 0;
      targetRelaxedEye = 0;
    } else if (emotion === 'surprised') {
      targetSurprisedEye = 0.85;
      targetSurprisedEyebrow = 0.75;
      targetVowelO = 0.55;
    } else if (emotion === 'angry') {
      targetAngryEyebrow = 0.95;
      targetAngryEye = 0.55;
      targetFrownMouth = 0.85;
      targetSmallMouth = 0.45;
    } else if (emotion === 'sad') {
      targetSadEyebrow = 0.85;
      targetSadEye = 0.45;
      targetFrownMouth = 0.75;
      targetSmallMouth = 0.35;
    }

    // 4. VISEME-DRIVEN LIP-SYNC (wawa-lipsync)
    // The playback queue runs wawa-lipsync on the live post-DSP audio and emits
    // viseme weights for あいうえお + a closed consonant hint. We smooth each
    // vowel channel and an overall "openness" envelope so the mouth forms varied
    // shapes that track the actual speech, and closes during pauses / before
    // audio starts (all weights are 0 when silent).
    // The solver runs every frame so the mouth also eases closed when the source
    // drops to 'none' (before audio arrives, between chunks, after speech ends).
    const lip = this.lipSync.step(lipSyncSource, visemeWeights, clampedDelta, elapsedTime);
    if (lip.openness > 0.001) {
      const sA = lip.a;
      const sI = lip.i;
      const sU = lip.u;
      const sE = lip.e;
      const sO = lip.o;
      const vClosed = lip.closed;
      // Energetic speech opens the mouth wider (and raises the caps); calm speech
      // stays smaller. gain ranges from ~0.75 (calm) to ~1.35 (excited).
      const gain = 0.75 + 0.6 * lip.intensity;
      const env = Math.min(1, lip.openness * gain);
      const cap = (base: number) => base * gain;

      // Emotion-aware mouth styling layered on top of the smoothed viseme shapes.
      if (emotion === 'sad' || emotion === 'terrified') {
        targetSmileMouth = 0;
        targetFrownMouth = 0.22;
        targetSmallMouth = 0;
        targetVowelA = Math.min(cap(0.35), sA * env * 0.9);
        targetVowelI = Math.min(cap(0.18), sI * env * 0.6);
        targetVowelO = Math.min(cap(0.25), sO * env * 0.8);
      } else if (emotion === 'pouting') {
        targetSmileMouth = 0;
        targetFrownMouth = 0.12;
        targetSmallMouth = 0;
        targetTriangleMouth = 0.10;
        targetPuckerMouth = 0.10;
        targetVowelA = Math.min(cap(0.38), sA * env * 0.9);
        targetVowelU = Math.min(cap(0.24), sU * env);
        targetVowelO = Math.min(cap(0.28), sO * env);
      } else if (emotion === 'angry' || emotion === 'jealous') {
        targetSmileMouth = 0;
        targetFrownMouth = 0.28;
        targetSmallMouth = 0;
        targetVowelA = Math.min(cap(0.48), sA * env);
        targetVowelI = Math.min(cap(0.24), sI * env * 0.7);
      } else if (emotion === 'blush' || emotion === 'blush-hardly') {
        targetSmileMouth = 0.20;
        targetSmallMouth = 0.35 * (1 - env);
        targetVowelA = Math.min(cap(0.35), sA * env * 0.85);
        targetVowelU = Math.min(cap(0.24), sU * env);
      } else {
        // Speech-reactive smile: brighter on energetic lines.
        targetSmileMouth = 0.10 + 0.10 * env + 0.12 * lip.intensity;
        targetVowelA = Math.min(cap(0.58), sA * env);
        targetVowelI = Math.min(cap(0.34), sI * env);
        targetVowelU = Math.min(cap(0.30), sU * env);
        targetVowelE = Math.min(cap(0.30), sE * env);
        targetVowelO = Math.min(cap(0.38), sO * env);
      }

      // Consonant closures briefly narrow the mouth over the open vowel.
      if (vClosed > 0.01) {
        targetSmallMouth = Math.max(targetSmallMouth, Math.min(0.4, vClosed * 0.4));
      }
    }

    // Set all calculated targets
    setMorph(morphVowelA, targetVowelA);
    setMorph(morphVowelI, targetVowelI);
    setMorph(morphVowelU, targetVowelU);
    setMorph(morphVowelE, targetVowelE);
    setMorph(morphVowelO, targetVowelO);

    setMorph(morphSmileMouth, targetSmileMouth);
    setMorph(morphSmallMouth, targetSmallMouth);
    setMorph(morphFrownMouth, targetFrownMouth);
    setMorph(morphTriangleMouth, targetTriangleMouth);
    setMorph(morphPuckerMouth, targetPuckerMouth);

    setMorph(morphRelaxedEye, targetRelaxedEye);
    setMorph(morphRelaxedEyebrow, targetRelaxedEyebrow);

    setMorph(morphSurprisedEye, targetSurprisedEye);
    setMorph(morphSurprisedEyebrow, targetSurprisedEyebrow);

    setMorph(morphAngryEyebrow, targetAngryEyebrow);
    setMorph(morphAngryEye, targetAngryEye);

    setMorph(morphSadEyebrow, targetSadEyebrow);
    setMorph(morphSadEye, targetSadEye);

    // 5. SMOOTH MORPH INTERPOLATION STEP
    // Frame-rate independent smoothing. Mouth/viseme morphs use a faster rate so
    // the lips track speech crisply, while expression morphs ease more gently.
    const mouthMorphs = new Set<number | undefined>([
      morphVowelA, morphVowelI, morphVowelU, morphVowelE, morphVowelO,
      morphSmileMouth, morphSmallMouth, morphFrownMouth, morphTriangleMouth, morphPuckerMouth
    ]);
    const mouthFactor = 1 - Math.exp(-MOUTH_MORPH_RATE * clampedDelta); // crisp lip-sync (solver already smooths)
    const faceFactor = 1 - Math.exp(-10 * clampedDelta);  // ~gentle expressions
    for (let i = 0; i < influences.length; i++) {
      const targetVal = this.targetMorphMap.get(i) ?? 0;
      if (i === morphBlink || i === morphSmileBlink) {
        // Direct snappy assignment for reflex blinks so it perfectly tracks the exact 0.18s sine curve
        influences[i] = targetVal;
      } else {
        const factor = mouthMorphs.has(i) ? mouthFactor : faceFactor;
        influences[i] += (targetVal - influences[i]) * factor;
      }
    }

    // 6. CHEEK BLUSH & FOREHEAD SHADOW OVERLAY MATERIALS (Driven by Emotion Registry visualTraits)
    const emotionCap = getEmotionCapability(emotion);
    const targetCheekOpacity = emotionCap?.visualTraits?.blushIntensity ?? 0;
    cheekMaterials.forEach((mat) => {
      mat.opacity += (targetCheekOpacity - mat.opacity) * 0.15;
      mat.visible = mat.opacity > 0.01;
    });

    const targetForeheadOpacity = emotionCap?.visualTraits?.foreheadShadow ? 0.90 : 0;
    if (foreheadMaterial) {
      foreheadMaterial.opacity += (targetForeheadOpacity - foreheadMaterial.opacity) * 0.15;
    }
  }
}

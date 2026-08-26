import * as THREE from 'three';
import type { BlinkState } from './types';

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

  /**
   * Cubic Ease-In-Out
   */
  public static easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Updates all facial morph targets on the SkinnedMesh
   */
  public update(
    mesh: THREE.SkinnedMesh,
    emotion: string,
    isSpeaking: boolean,
    elapsedTime: number,
    delta: number,
    cheekMaterials: THREE.MeshBasicMaterial[],
    foreheadMaterial: THREE.MeshBasicMaterial | null
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

    // 4. WINNER-RUNNER ORGANIC SPEECH WAVE GENERATOR
    if (isSpeaking) {
      const t = elapsedTime;
      const speechWave1 = Math.sin(t * 13.5);
      const speechWave2 = Math.sin(t * 23.7) * 0.4;
      const speechWave3 = Math.cos(t * 8.3) * 0.3;
      const noisePause = Math.sin(t * 3.1);

      // Syllable micro-pauses
      const organicFactor = noisePause < -0.3 ? 0.08 : 1.0;
      const combinedWave = Math.max(0, (speechWave1 + speechWave2 + speechWave3) * 0.55);
      const openPower = Math.pow(combinedWave, 1.1) * organicFactor;

      if (emotion === 'sad' || emotion === 'terrified') {
        targetSmileMouth = 0;
        targetFrownMouth = 0.22;
        targetSmallMouth = 0;
        targetVowelA = Math.min(0.35, openPower * 0.40);
        targetVowelI = Math.abs(Math.sin(t * 9.0)) * 0.15 * organicFactor;
        targetVowelO = Math.abs(Math.sin(t * 6.0)) * 0.20 * organicFactor;
      } else if (emotion === 'pouting') {
        targetSmileMouth = 0;
        targetFrownMouth = 0.12;
        targetSmallMouth = 0;
        targetTriangleMouth = 0.10;
        targetPuckerMouth = 0.10;
        targetVowelA = Math.min(0.38, openPower * 0.45);
        targetVowelI = Math.abs(Math.sin(t * 9.5)) * 0.18 * organicFactor;
        targetVowelO = Math.abs(Math.sin(t * 6.5)) * 0.20 * organicFactor;
      } else if (emotion === 'angry' || emotion === 'jealous') {
        targetSmileMouth = 0;
        targetFrownMouth = 0.28;
        targetSmallMouth = 0;
        targetVowelA = Math.min(0.42, openPower * 0.48);
      } else if (emotion === 'blush' || emotion === 'blush-hardly') {
        targetSmileMouth = 0.20;
        targetSmallMouth = 0.35 * (1 - openPower);
        targetVowelA = Math.min(0.35, openPower * 0.38);
      } else {
        targetSmileMouth = 0.35;
        targetVowelA = Math.min(0.52, openPower * 0.55);
        targetVowelI = Math.abs(Math.sin(t * 11.2)) * 0.22 * organicFactor;
        targetVowelE = Math.abs(Math.cos(t * 17.4)) * 0.18 * organicFactor;
        targetVowelO = Math.abs(Math.sin(t * 6.8)) * 0.25 * organicFactor;
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
    for (let i = 0; i < influences.length; i++) {
      const targetVal = this.targetMorphMap.get(i) ?? 0;
      if (i === morphBlink || i === morphSmileBlink) {
        // Direct snappy assignment for reflex blinks so it perfectly tracks the exact 0.18s sine curve
        influences[i] = targetVal;
      } else {
        influences[i] += (targetVal - influences[i]) * 0.15;
      }
    }

    // 6. CHEEK BLUSH & FOREHEAD SHADOW OVERLAY MATERIALS
    const targetCheekOpacity = emotion === 'blush-hardly' ? 0.38 : (emotion === 'blush' ? 0.24 : (emotion === 'pouting' ? 0.22 : (emotion === 'teasing' ? 0.12 : (emotion === 'happy' ? 0.06 : 0))));
    cheekMaterials.forEach((mat) => {
      mat.opacity += (targetCheekOpacity - mat.opacity) * 0.15;
      mat.visible = mat.opacity > 0.01;
    });

    const targetForeheadOpacity = emotion === 'terrified' ? 0.90 : 0;
    if (foreheadMaterial) {
      foreheadMaterial.opacity += (targetForeheadOpacity - foreheadMaterial.opacity) * 0.15;
    }
  }
}

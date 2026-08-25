import * as THREE from 'three';
import type { BoneReferences, SpringDamperState } from './types';

/**
 * AIRI-inspired Procedural Idle Engine
 * Implements:
 * 1. Semi-implicit Euler Spring-Damper Physics (k=120, c=16, m=1)
 * 2. Compound Multi-Frequency Harmonic Breathing (Anti-Robot Equation)
 * 3. Parabolic Head Roll & Cute Tilt (首かしげ / Z-Axis Rotation)
 * 4. Hips & Pelvis Figure-8 Lissajous Sway with Torso Counter-balance
 * 5. Delayed Secondary Shoulder & Arm Breathing Cascade
 * 6. Dynamic Inertia Hair & Skirt Secondary Physics
 */
export class ProceduralIdleEngine {
  // Spring-damper physical state for Head Roll (首かしげ)
  private headRollState: SpringDamperState = { position: 0, velocity: 0 };
  
  // Spring constants matching AIRI BeatSync / Motion-Manager
  private readonly springK = 120; // Stiffness (snappiness)
  private readonly springC = 16;  // Damping coefficient (anti-bounce)
  private readonly springM = 1;   // Mass

  /**
   * Updates all skeletal bone transforms per frame
   */
  public update(
    bones: BoneReferences,
    modelGroup: THREE.Group,
    elapsedTime: number,
    delta: number,
    targetTorsoYaw: number,
    targetTorsoPitch: number,
    targetHeadYaw: number,
    targetHeadPitch: number,
    emotion: string,
    headPatTiltTimer: number
  ): void {
    const t = elapsedTime;
    const clampedDelta = Math.min(delta, 0.05); // Prevent explosion on frame drops

    // 1. COMPOUND MULTI-FREQUENCY HARMONIC BREATHING
    // Out-of-phase superposition avoids monotonous periodic repetition
    const breathHarmonic = 
      Math.sin(t * 1.8) * 0.65 + 
      Math.sin(t * 0.85) * 0.25 + 
      Math.cos(t * 2.3) * 0.10;

    // Subtle breathing vertical lift
    modelGroup.position.y = breathHarmonic * 0.0035;

    // 2. PELVIS & HIPS FIGURE-8 LISSAJOUS WEIGHT-SHIFT
    const hipSwayX = Math.sin(t * 1.1) * 0.004;
    const hipRollZ = Math.sin(t * 1.1) * 0.012;
    const hipPitchX = Math.cos(t * 2.2) * 0.003;

    if (bones.hips) {
      bones.hips.position.x = hipSwayX;
      bones.hips.rotation.z = hipRollZ;
      bones.hips.rotation.x = hipPitchX;
    }

    // 3. PARABOLIC HEAD ROLL & CUTE TILT (首かしげ / Z-AXIS ROTATION)
    // Produces a sweet, rhythmic tilting of the head alternating left and right
    const headTiltOscillation = Math.sin(t * 0.75) * 0.07; // ~4 degrees idle tilt
    
    // Add extra expressive tilts based on emotion
    let emotionRollBonus = 0;
    if (emotion === 'happy' || emotion === 'teasing') {
      emotionRollBonus = Math.sin(t * 1.4) * 0.04;
    } else if (emotion === 'pouting' || emotion === 'jealous') {
      emotionRollBonus = -0.05; // Pouting head tilt
    } else if (emotion === 'blush' || emotion === 'blush-hardly') {
      emotionRollBonus = 0.03;
    }

    const targetHeadRoll = headTiltOscillation + emotionRollBonus + (targetHeadYaw * 0.12);

    // Semi-Implicit Euler Spring-Damper Step for Head Roll
    const rollAccel = (this.springK * (targetHeadRoll - this.headRollState.position) - this.springC * this.headRollState.velocity) / this.springM;
    this.headRollState.velocity += rollAccel * clampedDelta;
    this.headRollState.position += this.headRollState.velocity * clampedDelta;

    // 4. UPPER BODY & CHEST COUNTER-BALANCE
    if (bones.upperBody) {
      // Counter-rotates pelvis roll to maintain stable balance
      const counterRoll = -hipRollZ * 0.65;
      bones.upperBody.rotation.z += (counterRoll - bones.upperBody.rotation.z) * 0.1;
      bones.upperBody.rotation.y += (targetTorsoYaw - bones.upperBody.rotation.y) * 0.1;
      bones.upperBody.rotation.x = (breathHarmonic * 0.018) + (targetTorsoPitch * 0.45);
    }

    if (bones.upperBody2) {
      bones.upperBody2.rotation.x = breathHarmonic * 0.008;
      bones.upperBody2.rotation.y += (targetTorsoYaw * 0.2 - bones.upperBody2.rotation.y) * 0.1;
    }

    // 5. NECK & HEAD ORIENTATION
    let headPatAdd = 0;
    if (headPatTiltTimer > 0) {
      const progress = Math.max(0, headPatTiltTimer / 1.0);
      headPatAdd = Math.sin(progress * Math.PI) * 0.12;
    }

    if (bones.neck) {
      bones.neck.rotation.y += ((targetHeadYaw * 0.4) - bones.neck.rotation.y) * 0.1;
      bones.neck.rotation.x = (-breathHarmonic * 0.008) + (targetHeadPitch * 0.4);
      bones.neck.rotation.z += ((this.headRollState.position * 0.3) - bones.neck.rotation.z) * 0.1;
    }

    if (bones.head) {
      let extraHeadPitch = 0;
      let extraHeadYaw = 0;

      if (emotion === 'blush-hardly') {
        extraHeadPitch = 0.14; // bashful look down
        extraHeadYaw = -0.12;  // glance away
      } else if (emotion === 'teasing') {
        extraHeadPitch = -0.06; // chin up
      } else if (emotion === 'jealous' || emotion === 'pouting') {
        extraHeadYaw = 0.12; // sulking head turn
      } else if (emotion === 'terrified') {
        extraHeadPitch = 0.22;
        extraHeadYaw = Math.sin(t * 35.0) * 0.018; // fear trembling
      }

      bones.head.rotation.y += (((targetHeadYaw * 0.6) + extraHeadYaw) - bones.head.rotation.y) * 0.12;
      bones.head.rotation.x += (((targetHeadPitch * 0.6) + extraHeadPitch + headPatAdd) - bones.head.rotation.x) * 0.12;
      bones.head.rotation.z = this.headRollState.position; // Cute Anime Head Roll!
    }

    // 6. DELAYED SHOULDER & ARM BREATHING CASCADE
    const shoulderBreathPhase = Math.sin(t * 1.8 - 0.25);
    const armBreathPhase = Math.sin(t * 1.8 - 0.50);

    if (bones.leftShoulder) {
      bones.leftShoulder.rotation.z = (shoulderBreathPhase * 0.015) + (this.headRollState.position * 0.08);
      bones.leftShoulder.rotation.x = shoulderBreathPhase * 0.008;
    }
    if (bones.rightShoulder) {
      bones.rightShoulder.rotation.z = (-shoulderBreathPhase * 0.015) + (this.headRollState.position * 0.08);
      bones.rightShoulder.rotation.x = shoulderBreathPhase * 0.008;
    }

    // Base resting arm pose (±46 degrees) with smooth subtle breathing pulse
    const baseArmAngle = THREE.MathUtils.degToRad(46);
    if (bones.leftArm) {
      bones.leftArm.rotation.z = -baseArmAngle + (armBreathPhase * 0.016);
      bones.leftArm.rotation.x = Math.sin(t * 1.1) * 0.012;
    }
    if (bones.rightArm) {
      bones.rightArm.rotation.z = baseArmAngle - (armBreathPhase * 0.016);
      bones.rightArm.rotation.x = Math.sin(t * 1.1) * 0.012;
    }
    if (bones.leftElbow) {
      bones.leftElbow.rotation.z = -Math.abs(armBreathPhase * 0.008);
    }
    if (bones.rightElbow) {
      bones.rightElbow.rotation.z = Math.abs(armBreathPhase * 0.008);
    }

    // 7. HAIR & SKIRT SECONDARY INERTIA
    // Adds spring lag reacting to head roll velocity and compound wind
    const headRollVel = this.headRollState.velocity;

    bones.hairBones.forEach(({ bone, baseRotZ, baseRotX, phase }) => {
      const hairSwayZ = Math.sin(t * 2.4 + phase) * 0.038 + (targetHeadYaw * 0.10) - (headRollVel * 0.04);
      const hairSwayX = Math.cos(t * 1.9 + phase) * 0.024 + (targetHeadPitch * 0.07);
      
      bone.rotation.z = baseRotZ + hairSwayZ;
      bone.rotation.x = baseRotX + hairSwayX;
    });

    bones.skirtBones.forEach(({ bone, baseRotZ, baseRotX, phase }) => {
      const skirtSwayZ = Math.sin(t * 2.1 + phase) * 0.014 + (hipRollZ * 0.5);
      const skirtSwayX = Math.cos(t * 1.7 + phase) * 0.009 + (hipPitchX * 0.4);

      bone.rotation.z = baseRotZ + skirtSwayZ;
      bone.rotation.x = baseRotX + skirtSwayX;
    });
  }
}

import * as THREE from 'three';
import type { BoneReferences, SpringDamperState } from './types';

/**
 * AIRI-inspired Full-Body Procedural Idle Engine
 * Implements:
 * 1. Semi-implicit Euler Spring-Damper Physics (k=120, c=16, m=1)
 * 2. Compound Multi-Frequency Harmonic Breathing (Anti-Robot Equation)
 * 3. Parabolic Head Roll & Cute Tilt (首かしげ / Z-Axis Rotation)
 * 4. Whole-Body Pelvis & Hips Figure-8 Weight Shifting (2.5cm shift, 2.6° roll)
 * 5. Multi-Joint Spine & Chest Counter-Balance Curvature
 * 6. Dynamic Shoulder & Arm Breathing Cascade with Inward/Outward Expansion
 * 7. Elbow & Wrist Secondary Inertia Lag
 * 8. Hair & Skirt Dynamic Spring Physics
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
    const clampedDelta = Math.min(delta, 0.05);

    // 1. COMPOUND MULTI-FREQUENCY HARMONIC BREATHING
    const breathHarmonic = 
      Math.sin(t * 1.8) * 0.65 + 
      Math.sin(t * 0.85) * 0.25 + 
      Math.cos(t * 2.3) * 0.10;

    // 2. WHOLE-BODY PELVIS & HIPS FIGURE-8 WEIGHT-SHIFTING
    // Slow organic weight transfer cadence (~0.9 rad/s)
    const hipSwayX = Math.sin(t * 0.9) * 0.022; // ~2.2cm side-to-side weight shift
    const hipRollZ = Math.sin(t * 0.9) * 0.042; // ~2.4 degrees pelvis tilt
    const hipYawY = Math.cos(t * 0.65) * 0.030;  // ~1.7 degrees pelvis turn
    const hipPitchX = Math.sin(t * 1.8) * 0.012; // breathing tilt

    const centerLiftY = (breathHarmonic * 0.005) + (Math.abs(Math.sin(t * 0.9)) * 0.003);

    // Subtle model group float
    modelGroup.position.y = centerLiftY;

    if (bones.center) {
      bones.center.position.x = hipSwayX;
      bones.center.position.y = centerLiftY * 0.5;
      bones.center.rotation.y = hipYawY * 0.5;
    }

    if (bones.hips) {
      bones.hips.position.x = hipSwayX * 0.5;
      bones.hips.rotation.z = hipRollZ;
      bones.hips.rotation.y = hipYawY;
      bones.hips.rotation.x = hipPitchX;
    }

    // 3. PARABOLIC HEAD ROLL & CUTE TILT (首かしげ / Z-AXIS ROTATION)
    // Produces a sweet, rhythmic tilting of the head alternating left and right (~5.2 degrees)
    const headTiltOscillation = Math.sin(t * 0.70) * 0.09;
    
    let emotionRollBonus = 0;
    if (emotion === 'happy' || emotion === 'teasing') {
      emotionRollBonus = Math.sin(t * 1.4) * 0.05;
    } else if (emotion === 'pouting' || emotion === 'jealous') {
      emotionRollBonus = -0.06;
    } else if (emotion === 'blush' || emotion === 'blush-hardly') {
      emotionRollBonus = 0.04;
    }

    const targetHeadRoll = headTiltOscillation + emotionRollBonus + (targetHeadYaw * 0.14);

    // Semi-Implicit Euler Spring-Damper Step for Head Roll
    const rollAccel = (this.springK * (targetHeadRoll - this.headRollState.position) - this.springC * this.headRollState.velocity) / this.springM;
    this.headRollState.velocity += rollAccel * clampedDelta;
    this.headRollState.position += this.headRollState.velocity * clampedDelta;

    const headRollAngle = this.headRollState.position;

    // 4. MULTI-JOINT SPINE & CHEST COUNTER-BALANCE CURVATURE
    const counterRoll = -hipRollZ * 0.75 + (Math.sin(t * 0.9 + 0.3) * 0.020);
    const spineYaw = (targetTorsoYaw * 0.6) + Math.cos(t * 0.55) * 0.032;
    const spinePitch = (breathHarmonic * 0.026) + (targetTorsoPitch * 0.45);

    if (bones.upperBody) {
      bones.upperBody.rotation.z += (counterRoll - bones.upperBody.rotation.z) * 0.12;
      bones.upperBody.rotation.y += (spineYaw - bones.upperBody.rotation.y) * 0.12;
      bones.upperBody.rotation.x += (spinePitch - bones.upperBody.rotation.x) * 0.12;
    }

    if (bones.upperBody1) {
      bones.upperBody1.rotation.z += (counterRoll * 0.35 - bones.upperBody1.rotation.z) * 0.12;
      bones.upperBody1.rotation.y += (spineYaw * 0.3 - bones.upperBody1.rotation.y) * 0.12;
    }

    if (bones.upperBody2) {
      bones.upperBody2.rotation.x = breathHarmonic * 0.016;
      bones.upperBody2.rotation.z += (counterRoll * 0.25 - bones.upperBody2.rotation.z) * 0.12;
      bones.upperBody2.rotation.y += (targetTorsoYaw * 0.25 - bones.upperBody2.rotation.y) * 0.12;
    }

    // 5. NECK & HEAD ORIENTATION
    let headPatAdd = 0;
    if (headPatTiltTimer > 0) {
      const progress = Math.max(0, headPatTiltTimer / 1.0);
      headPatAdd = Math.sin(progress * Math.PI) * 0.12;
    }

    if (bones.neck) {
      bones.neck.rotation.y += ((targetHeadYaw * 0.4) - bones.neck.rotation.y) * 0.12;
      bones.neck.rotation.x = (-breathHarmonic * 0.010) + (targetHeadPitch * 0.4);
      bones.neck.rotation.z += ((headRollAngle * 0.35) - bones.neck.rotation.z) * 0.12;
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

      bones.head.rotation.y += (((targetHeadYaw * 0.65) + extraHeadYaw) - bones.head.rotation.y) * 0.14;
      bones.head.rotation.x += (((targetHeadPitch * 0.65) + extraHeadPitch + headPatAdd) - bones.head.rotation.x) * 0.14;
      bones.head.rotation.z = headRollAngle; // Cute Anime Head Roll!
    }

    // 6. DYNAMIC SHOULDER & ARM BREATHING CASCADE
    const shoulderBreathPhase = Math.sin(t * 1.8 - 0.20);
    const shoulderSwingX = Math.cos(t * 0.9) * 0.028;

    if (bones.leftShoulder) {
      bones.leftShoulder.rotation.z = (shoulderBreathPhase * 0.040) + (headRollAngle * 0.15);
      bones.leftShoulder.rotation.x = shoulderSwingX;
    }
    if (bones.rightShoulder) {
      bones.rightShoulder.rotation.z = (-shoulderBreathPhase * 0.040) + (headRollAngle * 0.15);
      bones.rightShoulder.rotation.x = -shoulderSwingX;
    }

    // Base resting arm pose (±45 degrees) with visible breathing expansion and idle swinging
    const baseArmAngle = THREE.MathUtils.degToRad(45);
    const armBreathZ = Math.sin(t * 1.8 - 0.40) * 0.055; // ~3.2 degrees breathing expansion
    const armSwingX = Math.sin(t * 0.9 - 0.35) * 0.080;   // ~4.6 degrees natural arm swing
    const armTwistY = Math.cos(t * 0.75) * 0.038;

    if (bones.leftArm) {
      bones.leftArm.rotation.z = -baseArmAngle + armBreathZ + (counterRoll * 0.30);
      bones.leftArm.rotation.x = armSwingX;
      bones.leftArm.rotation.y = armTwistY;
    }
    if (bones.rightArm) {
      bones.rightArm.rotation.z = baseArmAngle - armBreathZ + (counterRoll * 0.30);
      bones.rightArm.rotation.x = -armSwingX * 0.85; // Natural asymmetric arm swing
      bones.rightArm.rotation.y = -armTwistY;
    }

    // 7. ELBOWS & WRISTS SECONDARY INERTIA LAG
    const elbowBreath = Math.abs(Math.sin(t * 1.8 - 0.60) * 0.055);
    const elbowSwing = Math.sin(t * 0.9 - 0.50) * 0.050;

    if (bones.leftElbow) {
      bones.leftElbow.rotation.z = -0.06 - elbowBreath;
      bones.leftElbow.rotation.y = elbowSwing;
    }
    if (bones.rightElbow) {
      bones.rightElbow.rotation.z = 0.06 + elbowBreath;
      bones.rightElbow.rotation.y = -elbowSwing;
    }

    // Wrists / Hands natural inertia lagging behind the arm movement
    const wristPitch = Math.sin(t * 0.9 - 0.75) * 0.060;
    const wristRoll = Math.sin(t * 1.8 - 0.75) * 0.035;

    if (bones.leftWrist) {
      bones.leftWrist.rotation.x = wristPitch;
      bones.leftWrist.rotation.z = wristRoll;
    }
    if (bones.rightWrist) {
      bones.rightWrist.rotation.x = -wristPitch;
      bones.rightWrist.rotation.z = -wristRoll;
    }

    // 8. HAIR & SKIRT SECONDARY INERTIA
    const headRollVel = this.headRollState.velocity;

    bones.hairBones.forEach(({ bone, baseRotZ, baseRotX, phase }) => {
      const hairSwayZ = Math.sin(t * 2.2 + phase) * 0.055 + (targetHeadYaw * 0.12) - (headRollVel * 0.05);
      const hairSwayX = Math.cos(t * 1.8 + phase) * 0.035 + (targetHeadPitch * 0.08);
      
      bone.rotation.z = baseRotZ + hairSwayZ;
      bone.rotation.x = baseRotX + hairSwayX;
    });

    bones.skirtBones.forEach(({ bone, baseRotZ, baseRotX, phase }) => {
      const skirtSwayZ = Math.sin(t * 1.9 + phase) * 0.025 + (hipRollZ * 0.75);
      const skirtSwayX = Math.cos(t * 1.5 + phase) * 0.018 + (hipPitchX * 0.6);

      bone.rotation.z = baseRotZ + skirtSwayZ;
      bone.rotation.x = baseRotX + skirtSwayX;
    });
  }
}

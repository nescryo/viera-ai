import * as THREE from 'three';
import type { BoneReferences, SpringDamperState } from './types';

/**
 * AIRI-inspired Full-Body Procedural Idle & Physics Engine
 * Implements:
 * 1. Semi-implicit Euler Spring-Damper Physics (k=120, c=16, m=1)
 * 2. Compound Multi-Frequency Harmonic Breathing
 * 3. Parabolic Head Roll & Cute Tilt (首かしげ / Z-Axis Rotation)
 * 4. Whole-Body Pelvis & Hips Figure-8 Weight Shifting
 * 5. Multi-Joint Spine & Chest Counter-Balance Curvature
 * 6. Anti-Clipping Arm Clearance with Dynamic Skirt Evasion (Idol Stance)
 * 7. Volumetric A-Line Skirt Flare & Circumferential Traveling Ripple (112 bones matrix)
 * 8. Hierarchical Gravity-Aligned Hair Chain Physics (Twintails, 9-segment Back Hair, Bangs)
 * 9. Secondary Clothing Ribbons & Accessories Physics
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
    const hipSwayX = Math.sin(t * 0.9) * 0.018; // ~1.8cm side-to-side weight shift
    const hipRollZ = Math.sin(t * 0.9) * 0.040; // ~2.3 degrees pelvis tilt
    const hipYawY = Math.cos(t * 0.65) * 0.028;  // ~1.6 degrees pelvis turn
    const hipPitchX = Math.sin(t * 1.8) * 0.010;

    const centerLiftY = (breathHarmonic * 0.005) + (Math.abs(Math.sin(t * 0.9)) * 0.003);

    // Apply global root sway & breathing lift to modelGroup without collapsing bone rest heights!
    modelGroup.position.x = -0.65 + hipSwayX;
    modelGroup.position.y = centerLiftY;

    if (bones.center) {
      bones.center.rotation.y = hipYawY * 0.5;
    }

    if (bones.hips) {
      bones.hips.rotation.z = hipRollZ;
      bones.hips.rotation.y = hipYawY;
      bones.hips.rotation.x = hipPitchX;
    }

    // 3. PARABOLIC HEAD ROLL & CUTE TILT (首かしげ / Z-AXIS ROTATION)
    const headTiltOscillation = Math.sin(t * 0.70) * 0.09; // ~5.2 degrees
    
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
    const headRollVel = this.headRollState.velocity;

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
        extraHeadPitch = 0.14;
        extraHeadYaw = -0.12;
      } else if (emotion === 'teasing') {
        extraHeadPitch = -0.06;
      } else if (emotion === 'jealous' || emotion === 'pouting') {
        extraHeadYaw = 0.12;
      } else if (emotion === 'terrified') {
        extraHeadPitch = 0.22;
        extraHeadYaw = Math.sin(t * 35.0) * 0.018;
      }

      bones.head.rotation.y += (((targetHeadYaw * 0.65) + extraHeadYaw) - bones.head.rotation.y) * 0.14;
      bones.head.rotation.x += (((targetHeadPitch * 0.65) + extraHeadPitch + headPatAdd) - bones.head.rotation.x) * 0.14;
      bones.head.rotation.z = headRollAngle;
    }

    // 6. ANTI-CLIPPING ARMS & DYNAMIC SKIRT EVASION (Idol Stance)
    const shoulderBreathPhase = Math.sin(t * 1.8 - 0.20);
    const shoulderSwingX = Math.cos(t * 0.9) * 0.025;

    if (bones.leftShoulder) {
      bones.leftShoulder.rotation.z = (shoulderBreathPhase * 0.038) + (headRollAngle * 0.14);
      bones.leftShoulder.rotation.x = shoulderSwingX;
    }
    if (bones.rightShoulder) {
      bones.rightShoulder.rotation.z = (-shoulderBreathPhase * 0.038) + (headRollAngle * 0.14);
      bones.rightShoulder.rotation.x = -shoulderSwingX;
    }

    // Forward Clearance Offset: Arms rest slightly in front of the skirt plane
    const baseArmAngle = THREE.MathUtils.degToRad(44);
    const armBreathZ = Math.sin(t * 1.8 - 0.40) * 0.045; // ~2.6 degrees breathing expansion
    const armSwingX = Math.sin(t * 0.9 - 0.35) * 0.065;   // ~3.7 degrees gentle forward arm swing

    // Dynamic Skirt Evasion: When hips roll left, left skirt billows outward -> push left arm away!
    const leftSkirtEvasion = Math.max(0, -hipRollZ) * 0.50;
    const rightSkirtEvasion = Math.max(0, hipRollZ) * 0.50;

    if (bones.leftArm) {
      bones.leftArm.rotation.z = -baseArmAngle + armBreathZ - leftSkirtEvasion;
      bones.leftArm.rotation.y = 0.08 + (Math.cos(t * 0.75) * 0.025);
      bones.leftArm.rotation.x = 0.06 + armSwingX;
    }
    if (bones.rightArm) {
      bones.rightArm.rotation.z = baseArmAngle - armBreathZ + rightSkirtEvasion;
      bones.rightArm.rotation.y = -0.08 - (Math.cos(t * 0.75) * 0.025);
      bones.rightArm.rotation.x = 0.06 - (armSwingX * 0.85);
    }

    // Elbows slightly flared outward to clear skirt volume
    const elbowBreath = Math.abs(Math.sin(t * 1.8 - 0.60) * 0.045);
    const elbowSwing = Math.sin(t * 0.9 - 0.50) * 0.040;

    if (bones.leftElbow) {
      bones.leftElbow.rotation.z = -0.10 - elbowBreath;
      bones.leftElbow.rotation.y = 0.08 + elbowSwing;
    }
    if (bones.rightElbow) {
      bones.rightElbow.rotation.z = 0.10 + elbowBreath;
      bones.rightElbow.rotation.y = -0.08 - elbowSwing;
    }

    // Wrists / Hands gently relaxed in front of thigh silhouette
    const wristPitch = Math.sin(t * 0.9 - 0.75) * 0.050;
    const wristRoll = Math.sin(t * 1.8 - 0.75) * 0.025;

    if (bones.leftWrist) {
      bones.leftWrist.rotation.x = 0.06 + wristPitch;
      bones.leftWrist.rotation.z = wristRoll;
    }
    if (bones.rightWrist) {
      bones.rightWrist.rotation.x = 0.06 - wristPitch;
      bones.rightWrist.rotation.z = -wristRoll;
    }

    // 7. VOLUMETRIC A-LINE SKIRT FLARE & CIRCUMFERENTIAL TRAVELING RIPPLE
    bones.skirtSegments.forEach(({ bone, baseRotZ, baseRotX, row, col }) => {
      const theta = col * (Math.PI * 2 / 16); // Radial angle (0 to 2pi)

      // Progressive A-line flare: lower rows flare wider outward
      const rowFlare = (row + 1) * 0.016; // ~6.5 degrees at bottom hem

      // Traveling circumferential ripple
      const wave = Math.sin(t * 2.2 + col * (Math.PI * 2 / 16) * 2) * 0.014 * ((row + 1) / 7);

      // Pelvis roll response: side of the skirt follows hip tilt
      const hipOffset = Math.sin(theta) * (hipRollZ * 0.65);

      bone.rotation.x = baseRotX + Math.cos(theta) * (rowFlare + wave) + (hipPitchX * 0.4);
      bone.rotation.z = baseRotZ + Math.sin(theta) * (rowFlare + wave) + hipOffset;
    });

    // 8. HIERARCHICAL GRAVITY-ALIGNED HAIR CHAIN PHYSICS
    bones.hairSegments.forEach(({ bone, baseRotZ, baseRotX, category, chainIndex, chainDepth }) => {
      const depthFactor = (chainIndex + 1) / chainDepth; // 0.1 to 1.0 (tips move most!)
      const lagPhase = chainIndex * 0.22;                // Progressive wave lag

      if (category === 'twintail_left') {
        // Gravity-counter alignment: pulls hair down when head tilts
        const gravityCounter = -headRollAngle * 0.85 * depthFactor;
        const inertiaSway = -headRollVel * 0.07 * depthFactor;
        const harmonicFloat = Math.sin(t * 2.2 - lagPhase) * 0.045 * depthFactor;

        bone.rotation.z = baseRotZ + gravityCounter + inertiaSway + harmonicFloat;
        bone.rotation.x = baseRotX + Math.cos(t * 1.8 - lagPhase) * 0.030 * depthFactor + (targetHeadPitch * 0.06);
      } 
      else if (category === 'twintail_right') {
        const gravityCounter = -headRollAngle * 0.85 * depthFactor;
        const inertiaSway = -headRollVel * 0.07 * depthFactor;
        const harmonicFloat = -Math.sin(t * 2.2 - lagPhase) * 0.045 * depthFactor;

        bone.rotation.z = baseRotZ + gravityCounter + inertiaSway + harmonicFloat;
        bone.rotation.x = baseRotX + Math.cos(t * 1.8 - lagPhase) * 0.030 * depthFactor + (targetHeadPitch * 0.06);
      } 
      else if (category === 'back_left' || category === 'back_right') {
        // Long 9-segment back hair: fluid heavy silk cascade
        const gravityCounter = -headRollAngle * 0.95 * depthFactor;
        const inertiaSway = -headRollVel * 0.10 * depthFactor;
        const flowingWave = Math.sin(t * 1.7 - lagPhase) * 0.048 * depthFactor;

        bone.rotation.z = baseRotZ + gravityCounter + inertiaSway + flowingWave;
        bone.rotation.x = baseRotX + Math.cos(t * 1.3 - lagPhase) * 0.035 * depthFactor;
      } 
      else {
        // Bangs / Front hair: short, light, subtle bounce
        const bangsBounce = Math.sin(t * 2.8) * 0.012;
        bone.rotation.z = baseRotZ + bangsBounce - (headRollAngle * 0.20);
        bone.rotation.x = baseRotX + Math.cos(t * 2.0) * 0.010;
      }
    });

    // 9. CLOTHING RIBBONS & ACCESSORIES PHYSICS
    bones.accessories.forEach(({ bone, baseRotZ, baseRotX, category }) => {
      if (category === 'chest_ribbon') {
        // Responds to breathing expansion and chest pitch
        const ribbonFlutter = Math.sin(t * 2.4) * 0.025;
        bone.rotation.x = baseRotX + (breathHarmonic * 0.020) + ribbonFlutter;
        bone.rotation.z = baseRotZ + (counterRoll * 0.20);
      } else if (category === 'collar') {
        bone.rotation.x = baseRotX + (breathHarmonic * 0.010);
      } else if (category === 'hair_wing' || category === 'hair_band') {
        // Bouncy spring response to head roll
        const wingSpring = Math.sin(t * 3.0) * 0.035 - (headRollAngle * 0.30);
        bone.rotation.z = baseRotZ + wingSpring;
      }
    });
  }
}

import type { BoneReferences, SaccadeState } from './types';

/**
 * AIRI-inspired Gaze Tracking & Micro-Saccades Engine
 * Implements:
 * 1. Exponential Critical Damping (Frame-rate independent smoothing: rate = 1 - e^(-10 * dt))
 * 2. Hierarchical Angle Clamping (Eyes rotate further/faster than head)
 * 3. Stochastic Micro-Saccades (Natural stochastic eye fixation drift)
 */
export class GazeTrackingEngine {
  private saccadeState: SaccadeState = {
    currentX: 0,
    currentY: 0,
    targetX: 0,
    targetY: 0,
    lastSaccadeTime: 0,
    nextSaccadeInterval: 1.2
  };

  // MMD Safe Gaze Angle Limits
  public static readonly EYE_YAW_LIMIT = 0.35;   // ~20 degrees
  public static readonly EYE_PITCH_LIMIT = 0.25; // ~14.3 degrees

  /**
   * Updates eye bones with smooth gaze tracking & micro-saccades
   */
  public update(
    bones: BoneReferences,
    targetPointerX: number,
    targetPointerY: number,
    elapsedTime: number,
    delta: number
  ): void {
    const clampedDelta = Math.min(delta, 0.05);

    // 1. STOCHASTIC MICRO-SACCADES ENGINE (400ms - 2200ms)
    const timeSinceSaccade = elapsedTime - this.saccadeState.lastSaccadeTime;
    if (timeSinceSaccade >= this.saccadeState.nextSaccadeInterval) {
      this.saccadeState.lastSaccadeTime = elapsedTime;
      // Random interval between 0.4s and 2.2s
      this.saccadeState.nextSaccadeInterval = 0.4 + Math.random() * 1.8;
      // Micro drift perturbation (±0.08 rad)
      this.saccadeState.targetX = (Math.random() - 0.5) * 0.16;
      this.saccadeState.targetY = (Math.random() - 0.5) * 0.10;
    }

    // Exponential smoothing for saccade drift
    const saccadeRate = 1 - Math.exp(-8 * clampedDelta);
    this.saccadeState.currentX += (this.saccadeState.targetX - this.saccadeState.currentX) * saccadeRate;
    this.saccadeState.currentY += (this.saccadeState.targetY - this.saccadeState.currentY) * saccadeRate;

    // 2. EXPONENTIAL CRITICAL DAMPING GAZE SMOOTHING
    // rate = 1 - e^(-10 * dt)
    const dampingRate = 1 - Math.exp(-12 * clampedDelta);

    // Clamp combined gaze angles within physiological limits
    const rawEyeYaw = (targetPointerX * 0.12) + this.saccadeState.currentX;
    const rawEyePitch = (-targetPointerY * 0.08) + this.saccadeState.currentY;

    const clampedEyeYaw = Math.max(-GazeTrackingEngine.EYE_YAW_LIMIT, Math.min(GazeTrackingEngine.EYE_YAW_LIMIT, rawEyeYaw));
    const clampedEyePitch = Math.max(-GazeTrackingEngine.EYE_PITCH_LIMIT, Math.min(GazeTrackingEngine.EYE_PITCH_LIMIT, rawEyePitch));

    // Apply to Left Eye Bone
    if (bones.leftEye) {
      bones.leftEye.rotation.y += (clampedEyeYaw - bones.leftEye.rotation.y) * dampingRate;
      bones.leftEye.rotation.x += (clampedEyePitch - bones.leftEye.rotation.x) * dampingRate;
    }

    // Apply to Right Eye Bone
    if (bones.rightEye) {
      bones.rightEye.rotation.y += (clampedEyeYaw - bones.rightEye.rotation.y) * dampingRate;
      bones.rightEye.rotation.x += (clampedEyePitch - bones.rightEye.rotation.x) * dampingRate;
    }

    // Fallback if model only has Combined Eyes bone ('両目')
    if (bones.bothEyes && !bones.leftEye && !bones.rightEye) {
      bones.bothEyes.rotation.y += (clampedEyeYaw - bones.bothEyes.rotation.y) * dampingRate;
      bones.bothEyes.rotation.x += (clampedEyePitch - bones.bothEyes.rotation.x) * dampingRate;
    }
  }
}

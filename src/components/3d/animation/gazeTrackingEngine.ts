import * as THREE from 'three';
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
  public static readonly FOCUS_YAW_LIMIT = 0.6;
  public static readonly FOCUS_PITCH_LIMIT = 0.35;

  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();

  /**
   * Computes eye yaw/pitch (in the eye parent's local frame) needed to look at a world point.
   * Model faces +Z; positive yaw turns toward +X, positive pitch looks down.
   */
  private computeLookAngles(bones: BoneReferences, target: THREE.Vector3): { yaw: number; pitch: number } | null {
    const eye = bones.leftEye ?? bones.rightEye ?? bones.bothEyes;
    const parent = eye?.parent;
    if (!eye || !parent) return null;

    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(this.tmpQuat);
    eye.getWorldPosition(this.tmpPos);

    // Direction from eye to target, expressed in the parent's local frame
    this.tmpDir.subVectors(target, this.tmpPos).applyQuaternion(this.tmpQuat.invert());
    const horizontal = Math.hypot(this.tmpDir.x, this.tmpDir.z);
    return {
      yaw: Math.atan2(this.tmpDir.x, this.tmpDir.z),
      pitch: Math.atan2(-this.tmpDir.y, horizontal)
    };
  }

  /**
   * Updates eye bones with smooth gaze tracking & micro-saccades.
   * When `focusTarget` is given (e.g. the camera position while the character is
   * replying), the eyes ignore the pointer and stay locked on that world point,
   * counter-rotating against head/body motion so she keeps looking at screen center.
   */
  public update(
    bones: BoneReferences,
    targetPointerX: number,
    targetPointerY: number,
    elapsedTime: number,
    delta: number,
    focusTarget: THREE.Vector3 | null = null
  ): void {
    const focusCenter = focusTarget !== null;
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
    // Dampen saccade drift while focusing so the eyes stay locked on center
    const saccadeScale = focusCenter ? 0.25 : 1;
    let baseYaw = targetPointerX * 0.12;
    let basePitch = -targetPointerY * 0.08;
    if (focusTarget) {
      const look = this.computeLookAngles(bones, focusTarget);
      if (look) {
        baseYaw = look.yaw;
        basePitch = look.pitch;
      }
    }
    const rawEyeYaw = baseYaw + this.saccadeState.currentX * saccadeScale;
    const rawEyePitch = basePitch + this.saccadeState.currentY * saccadeScale;

    // Wider limits while focusing so the eyes can fully counter head turns
    const yawLimit = focusCenter ? GazeTrackingEngine.FOCUS_YAW_LIMIT : GazeTrackingEngine.EYE_YAW_LIMIT;
    const pitchLimit = focusCenter ? GazeTrackingEngine.FOCUS_PITCH_LIMIT : GazeTrackingEngine.EYE_PITCH_LIMIT;
    const clampedEyeYaw = Math.max(-yawLimit, Math.min(yawLimit, rawEyeYaw));
    const clampedEyePitch = Math.max(-pitchLimit, Math.min(pitchLimit, rawEyePitch));

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

import * as THREE from 'three';
import type { BoneReferences } from './types';
import { ProceduralIdleEngine } from './proceduralIdleEngine';
import { GazeTrackingEngine } from './gazeTrackingEngine';
import { FacialExpressionEngine } from './facialExpressionEngine';

export * from './types';
export * from './proceduralIdleEngine';
export * from './gazeTrackingEngine';
export * from './facialExpressionEngine';

/**
 * Extracts and categorizes all skeleton bones from the MMD SkinnedMesh
 */
export function extractBoneReferences(mesh: THREE.SkinnedMesh): BoneReferences {
  const bones: BoneReferences = {
    hips: null,
    upperBody: null,
    upperBody2: null,
    neck: null,
    head: null,
    leftShoulder: null,
    rightShoulder: null,
    leftArm: null,
    rightArm: null,
    leftElbow: null,
    rightElbow: null,
    leftEye: null,
    rightEye: null,
    bothEyes: null,
    hairBones: [],
    skirtBones: []
  };

  if (!mesh.skeleton || !mesh.skeleton.bones) return bones;

  mesh.skeleton.bones.forEach((bone, index) => {
    const name = bone.name;

    // Hips / Pelvis / Center
    if (name === '下半身' || name === 'センター' || name === 'グルーブ' || name === '腰') {
      if (!bones.hips) bones.hips = bone;
    }
    // Upper Body / Spine / Chest
    else if (name === '上半身' || name === '上半身1') {
      if (!bones.upperBody) bones.upperBody = bone;
    } else if (name === '上半身2' || name === '胸') {
      bones.upperBody2 = bone;
    }
    // Neck & Head
    else if (name === '首' || name === 'neck') {
      bones.neck = bone;
    } else if (name === '頭' || name === 'head') {
      bones.head = bone;
    }
    // Shoulders
    else if (name === '左肩' || name === '左肩+') {
      bones.leftShoulder = bone;
    } else if (name === '右肩' || name === '右肩+') {
      bones.rightShoulder = bone;
    }
    // Arms & Elbows
    else if (name === '左腕') {
      bones.leftArm = bone;
      bone.rotation.z = -THREE.MathUtils.degToRad(46);
    } else if (name === '右腕') {
      bones.rightArm = bone;
      bone.rotation.z = THREE.MathUtils.degToRad(46);
    } else if (name === '左ひじ') {
      bones.leftElbow = bone;
    } else if (name === '右ひじ') {
      bones.rightElbow = bone;
    }
    // Eyes (excluding tip/end bones like 目先)
    else if (!name.includes('先') && !name.includes('tip') && !name.includes('end') && !name.includes('End')) {
      if (name === '左目' || name === '目.L' || name === '目_L' || name === 'eye_L' || name === 'Eye_L') {
        bones.leftEye = bone;
      } else if (name === '右目' || name === '目.R' || name === '目_R' || name === 'eye_R' || name === 'Eye_R') {
        bones.rightEye = bone;
      } else if (name === '両目' || name === 'eyes' || name === 'Eyes') {
        bones.bothEyes = bone;
      }
    }

    // Secondary Physics Bones: Hair, Twintails, Ribbons
    if (
      name.includes('髪') || name.includes('毛') || name.includes('hair') ||
      name.includes('馬尾') || name.includes('ツインテ') || name.includes('リボン') ||
      name.includes('髮帶') || name.includes('髮飾')
    ) {
      bones.hairBones.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        phase: index * 0.35
      });
    }

    // Secondary Physics Bones: Skirt
    if (name.includes('スカート') || name.includes('skirt') || name.includes('裙') || name.includes('裾')) {
      bones.skirtBones.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        phase: index * 0.25
      });
    }
  });

  mesh.skeleton.update();
  return bones;
}

/**
 * Unified Animation Controller orchestrating Procedural Idle, Gaze, and Facial Engines
 */
export class VieraAnimationController {
  public readonly idleEngine: ProceduralIdleEngine;
  public readonly gazeEngine: GazeTrackingEngine;
  public readonly facialEngine: FacialExpressionEngine;
  public bones: BoneReferences;

  constructor(mesh: THREE.SkinnedMesh) {
    this.idleEngine = new ProceduralIdleEngine();
    this.gazeEngine = new GazeTrackingEngine();
    this.facialEngine = new FacialExpressionEngine();
    this.bones = extractBoneReferences(mesh);
  }

  /**
   * Main per-frame update tick
   */
  public update({
    mesh,
    modelGroup,
    elapsedTime,
    delta,
    pointerX,
    pointerY,
    emotion,
    isSpeaking,
    headPatTiltTimer,
    cheekMaterials,
    foreheadMaterial
  }: {
    mesh: THREE.SkinnedMesh;
    modelGroup: THREE.Group;
    elapsedTime: number;
    delta: number;
    pointerX: number;
    pointerY: number;
    emotion: string;
    isSpeaking: boolean;
    headPatTiltTimer: number;
    cheekMaterials: THREE.MeshBasicMaterial[];
    foreheadMaterial: THREE.MeshBasicMaterial | null;
  }): void {
    // 1. Calculate Target Yaw and Pitch from pointer
    const targetTorsoYaw = pointerX * 0.16;
    const targetTorsoPitch = -pointerY * 0.08;
    const targetHeadYaw = pointerX * 0.30;
    const targetHeadPitch = -pointerY * 0.15;

    // 2. Procedural Idle Motion (Spring Head Roll, Figure-8 Sway, Breathing, Shoulders, Hair)
    this.idleEngine.update(
      this.bones,
      modelGroup,
      elapsedTime,
      delta,
      targetTorsoYaw,
      targetTorsoPitch,
      targetHeadYaw,
      targetHeadPitch,
      emotion,
      headPatTiltTimer
    );

    // 3. Gaze Tracking with Exponential Critical Damping and Micro-Saccades
    this.gazeEngine.update(
      this.bones,
      pointerX,
      pointerY,
      elapsedTime,
      delta
    );

    // 4. Facial Expressions, Smile-Blink, and Lip-Sync
    this.facialEngine.update(
      mesh,
      emotion,
      isSpeaking,
      elapsedTime,
      delta,
      cheekMaterials,
      foreheadMaterial
    );
  }
}

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
    center: null,
    hips: null,
    upperBody: null,
    upperBody1: null,
    upperBody2: null,
    neck: null,
    head: null,
    leftShoulder: null,
    rightShoulder: null,
    leftArm: null,
    rightArm: null,
    leftElbow: null,
    rightElbow: null,
    leftWrist: null,
    rightWrist: null,
    leftEye: null,
    rightEye: null,
    bothEyes: null,
    hairSegments: [],
    skirtSegments: [],
    accessories: []
  };

  if (!mesh.skeleton || !mesh.skeleton.bones) return bones;

  mesh.skeleton.bones.forEach((bone) => {
    const name = bone.name;

    // Center / Groove (Whole body center of gravity)
    if (name === 'センター' || name === 'グルーブ') {
      if (!bones.center) bones.center = bone;
    }
    // Hips / Pelvis / Lower body
    else if (name === '下半身' || name === '腰') {
      if (!bones.hips) bones.hips = bone;
    }
    // Upper Body / Spine / Chest
    else if (name === '上半身') {
      bones.upperBody = bone;
    } else if (name === '上半身1') {
      bones.upperBody1 = bone;
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
    // Arms, Elbows, Wrists (Natural anime idol stance with forward hand clearance)
    else if (name === '左腕') {
      bones.leftArm = bone;
      bone.rotation.z = -THREE.MathUtils.degToRad(44);
      bone.rotation.y = 0.08;
      bone.rotation.x = 0.06;
    } else if (name === '右腕') {
      bones.rightArm = bone;
      bone.rotation.z = THREE.MathUtils.degToRad(44);
      bone.rotation.y = -0.08;
      bone.rotation.x = 0.06;
    } else if (name === '左ひじ') {
      bones.leftElbow = bone;
      bone.rotation.z = -0.10;
      bone.rotation.y = 0.08;
    } else if (name === '右ひじ') {
      bones.rightElbow = bone;
      bone.rotation.z = 0.10;
      bone.rotation.y = -0.08;
    } else if (name === '左手首') {
      bones.leftWrist = bone;
      bone.rotation.x = 0.06;
    } else if (name === '右手首') {
      bones.rightWrist = bone;
      bone.rotation.x = 0.06;
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

    // 1. Categorized Hair Chains
    const leftTwintailMatch = name.match(/左馬尾\d+-(\d+)/);
    const rightTwintailMatch = name.match(/右馬尾\d+-(\d+)/);
    const leftBackMatch = name.match(/左後髪\d+-(\d+)/);
    const rightBackMatch = name.match(/右後髪\d+-(\d+)/);

    if (leftTwintailMatch) {
      const idx = parseInt(leftTwintailMatch[1], 10) - 1;
      bones.hairSegments.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        category: 'twintail_left',
        chainIndex: Math.max(0, idx),
        chainDepth: 5
      });
    } else if (rightTwintailMatch) {
      const idx = parseInt(rightTwintailMatch[1], 10) - 1;
      bones.hairSegments.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        category: 'twintail_right',
        chainIndex: Math.max(0, idx),
        chainDepth: 5
      });
    } else if (leftBackMatch) {
      const idx = parseInt(leftBackMatch[1], 10) - 1;
      bones.hairSegments.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        category: 'back_left',
        chainIndex: Math.max(0, idx),
        chainDepth: 9
      });
    } else if (rightBackMatch) {
      const idx = parseInt(rightBackMatch[1], 10) - 1;
      bones.hairSegments.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        category: 'back_right',
        chainIndex: Math.max(0, idx),
        chainDepth: 9
      });
    } else if (name.includes('劉海') || name.includes('側髪') || name.includes('前髪')) {
      bones.hairSegments.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        category: 'bangs',
        chainIndex: 0,
        chainDepth: 2
      });
    }

    // 2. Skirt Matrix Grid (裙_<row>_<col>)
    const skirtMatch = name.match(/裙_(\d+)_(\d+)/);
    if (skirtMatch) {
      const row = parseInt(skirtMatch[1], 10);
      const col = parseInt(skirtMatch[2], 10);
      bones.skirtSegments.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        row,
        col
      });
    }

    // 3. Clothing & Accessory Ribbons
    if (name.includes('胸結') || name.includes('胸結帶')) {
      bones.accessories.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        category: 'chest_ribbon',
        chainIndex: 0
      });
    } else if (name.includes('領結') || name.includes('後領')) {
      bones.accessories.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        category: 'collar',
        chainIndex: 0
      });
    } else if (name.includes('髪翼飾') || name.includes('髮飾結')) {
      bones.accessories.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        category: 'hair_wing',
        chainIndex: 0
      });
    } else if (name.includes('髮帶')) {
      bones.accessories.push({
        bone,
        baseRotZ: bone.rotation.z,
        baseRotX: bone.rotation.x,
        baseRotY: bone.rotation.y,
        category: 'hair_band',
        chainIndex: 0
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

import * as THREE from 'three';

export interface HairSegmentData {
  bone: THREE.Bone;
  baseRotZ: number;
  baseRotX: number;
  baseRotY: number;
  category: 'bangs' | 'twintail_left' | 'twintail_right' | 'back_left' | 'back_right' | 'other';
  chainIndex: number; // 0 (root/proximal) to N (tip/distal)
  chainDepth: number;
}

export interface SkirtSegmentData {
  bone: THREE.Bone;
  baseRotZ: number;
  baseRotX: number;
  baseRotY: number;
  row: number; // 0 (top waist) to 6 (bottom hem)
  col: number; // 0 to 15 (radial angle around body)
}

export interface AccessoryBoneData {
  bone: THREE.Bone;
  baseRotZ: number;
  baseRotX: number;
  baseRotY: number;
  category: 'chest_ribbon' | 'collar' | 'hair_wing' | 'hair_band';
  chainIndex: number;
}

export interface BoneReferences {
  center: THREE.Bone | null;
  hips: THREE.Bone | null;
  upperBody: THREE.Bone | null;
  upperBody1: THREE.Bone | null;
  upperBody2: THREE.Bone | null;
  neck: THREE.Bone | null;
  head: THREE.Bone | null;
  leftShoulder: THREE.Bone | null;
  rightShoulder: THREE.Bone | null;
  leftArm: THREE.Bone | null;
  rightArm: THREE.Bone | null;
  leftElbow: THREE.Bone | null;
  rightElbow: THREE.Bone | null;
  leftWrist: THREE.Bone | null;
  rightWrist: THREE.Bone | null;
  leftEye: THREE.Bone | null;
  rightEye: THREE.Bone | null;
  bothEyes: THREE.Bone | null;
  hairSegments: HairSegmentData[];
  skirtSegments: SkirtSegmentData[];
  accessories: AccessoryBoneData[];
}



export interface SaccadeState {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  lastSaccadeTime: number;
  nextSaccadeInterval: number;
}

export interface BlinkState {
  nextBlinkTime: number;
  isBlinking: boolean;
  blinkProgress: number;
  blinkDuration: number;
  isSmileBlink: boolean;
}

export interface SpringDamperState {
  position: number;
  velocity: number;
}

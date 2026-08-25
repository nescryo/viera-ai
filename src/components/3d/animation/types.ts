import * as THREE from 'three';

export interface HairBoneData {
  bone: THREE.Bone;
  baseRotZ: number;
  baseRotX: number;
  phase: number;
}

export interface SkirtBoneData {
  bone: THREE.Bone;
  baseRotZ: number;
  baseRotX: number;
  phase: number;
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
  hairBones: HairBoneData[];
  skirtBones: SkirtBoneData[];
}

export interface PointerState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
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

import * as THREE from 'three';
import { MMDLoader } from 'three-stdlib';
import type { CharacterModelConfig } from '../../../characters/types';

export interface StageController {
  stageMesh: THREE.Mesh | null;
  groundShadow: THREE.Mesh;
  dispose: () => void;
}

/**
 * Loads Official HoYoverse HSR CharacterSphere Skydome Stage and Soft Foot Contact Shadow
 */
export function setupCharacterStage(
  scene: THREE.Scene,
  stageConfig?: CharacterModelConfig['stage'],
  isDisposedCheck?: () => boolean
): StageController {
  let stageMesh: THREE.Mesh | null = null;
  let cleanGeo: THREE.BufferGeometry | null = null;
  let stageMat: THREE.MeshBasicMaterial | null = null;
  let stageTex: THREE.Texture | null = null;

  // 1. Skydome Sphere
  if (stageConfig) {
    const stageLoader = new MMDLoader();
    stageLoader.setResourcePath(stageConfig.resourcePath);
    stageLoader.load(
      stageConfig.pmxUrl,
      (rawStageMesh) => {
        if (isDisposedCheck && isDisposedCheck()) return;

        // Extract pure BufferGeometry to prevent SkinnedMesh empty morphTarget shader compilation crash
        const origGeo = rawStageMesh.geometry;
        cleanGeo = new THREE.BufferGeometry();
        cleanGeo.setAttribute('position', origGeo.attributes.position.clone());
        cleanGeo.setAttribute('normal', origGeo.attributes.normal.clone());
        cleanGeo.setAttribute('uv', origGeo.attributes.uv.clone());
        if (origGeo.index) {
          cleanGeo.setIndex(origGeo.index.clone());
        }

        const texLoader = new THREE.TextureLoader();
        stageTex = texLoader.load(
          stageConfig.textureUrl,
          () => {
            if (isDisposedCheck && isDisposedCheck()) return;
            if (stageMat) {
              stageMat.visible = true;
              stageMat.needsUpdate = true;
            }
          }
        );
        stageTex.colorSpace = THREE.SRGBColorSpace;
        stageTex.flipY = false;
        stageTex.wrapS = THREE.RepeatWrapping;
        stageTex.wrapT = THREE.RepeatWrapping;

        stageMat = new THREE.MeshBasicMaterial({
          map: stageTex,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: true,
          visible: false, // Prevents white flash glitch while 5.5MB texture is downloading
        });
        stageMat.userData = { outlineParameters: { visible: false } };

        stageMesh = new THREE.Mesh(cleanGeo, stageMat);
        stageMesh.scale.set(stageConfig.scale[0], stageConfig.scale[1], stageConfig.scale[2]);
        stageMesh.position.set(stageConfig.position[0], stageConfig.position[1], stageConfig.position[2]);
        stageMesh.renderOrder = -100;
        stageMesh.castShadow = false;
        stageMesh.receiveShadow = false;

        scene.add(stageMesh);
        origGeo.dispose();
      },
      undefined,
      (err) => {
        console.warn('CharacterSphere stage load warning:', err);
      }
    );
  }

  // 2. Ground Contact Shadow Receiver (Invisible floor plane receiving soft foot shadows)
  const groundShadowGeo = new THREE.PlaneGeometry(6, 6);
  groundShadowGeo.rotateX(-Math.PI / 2);
  const groundShadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
  groundShadowMat.userData = { outlineParameters: { visible: false } };
  const groundShadow = new THREE.Mesh(groundShadowGeo, groundShadowMat);
  const posX = stageConfig?.position[0] ?? -0.65;
  groundShadow.position.set(posX, 0.005, 0);
  groundShadow.receiveShadow = true;
  scene.add(groundShadow);

  return {
    get stageMesh() {
      return stageMesh;
    },
    groundShadow,
    dispose: () => {
      if (cleanGeo) cleanGeo.dispose();
      if (stageTex) stageTex.dispose();
      if (stageMat) stageMat.dispose();
      groundShadowGeo.dispose();
      groundShadowMat.dispose();
    }
  };
}

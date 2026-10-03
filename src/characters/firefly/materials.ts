import * as THREE from 'three';
import type { CharacterMaterialResult } from '../types';

/**
 * Creates an Authentic Anime Forehead Horror/Shock Dark Shadow Texture
 */
export function createAnimeForeheadShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);

    // Full Width Dark linear gradient fading out near nose bridge
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(6, 8, 22, 0.98)');
    gradient.addColorStop(0.45, 'rgba(12, 15, 38, 0.82)');
    gradient.addColorStop(0.80, 'rgba(20, 24, 52, 0.25)');
    gradient.addColorStop(1, 'rgba(20, 24, 52, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 220);

    // Full Width Classic Anime Vertical Shock/Horror Hatching Lines
    for (let x = 5; x <= 251; x += 8) {
      const lineLen = 160 + Math.sin(x * 0.15) * 25;
      const lineGrad = ctx.createLinearGradient(x, 0, x, lineLen);
      lineGrad.addColorStop(0, 'rgba(4, 5, 16, 0.92)');
      lineGrad.addColorStop(0.75, 'rgba(4, 5, 16, 0.30)');
      lineGrad.addColorStop(1, 'rgba(4, 5, 16, 0)');

      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + Math.sin(x * 0.05) * 3, lineLen);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Cel-shading material optimizer and dynamic overlays for Firefly (Honkai: Star Rail)
 */
export function optimizeFireflyMaterials(
  mmdMesh: THREE.SkinnedMesh,
  manager?: THREE.LoadingManager
): CharacterMaterialResult {
  const cheekMaterials: THREE.MeshBasicMaterial[] = [];
  let foreheadMaterial: THREE.MeshBasicMaterial | null = null;

  mmdMesh.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = false; // Never receive geometric self-shadows on anime character body

      const optimizeMaterial = (mat: THREE.Material): THREE.Material => {
        const rawMatName = mat.name || '';
        const matName = rawMatName.toLowerCase();
        const mapUrl = ((mat as any).map?.name || (mat as any).map?.image?.src || '').toLowerCase();

        // Built-in PMX Blush Texture Overlay (Material #2: 顏+ / 颜赤.tga / 頬 / hoho / blush / 赤み / 照れ / pipi)
        const isBlushMat = 
          rawMatName.includes('顏+') || rawMatName.includes('颜+') ||
          rawMatName.includes('顏赤') || rawMatName.includes('颜赤') ||
          mapUrl.includes('颜赤') || mapUrl.includes('yan_chi');

        if (isBlushMat) {
          const blushTex = new THREE.TextureLoader(manager).load('/models/firefly/颜赤.png');
          blushTex.colorSpace = THREE.SRGBColorSpace;
          const blushMat = new THREE.MeshBasicMaterial({
            map: blushTex,
            color: new THREE.Color('#ff7e95'),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
          });
          blushMat.polygonOffset = true;
          blushMat.polygonOffsetFactor = -4;
          blushMat.polygonOffsetUnits = -4;
          (blushMat as any).renderOrder = 10;
          blushMat.visible = false;
          blushMat.userData = { outlineParameters: { visible: false } };
          if (!cheekMaterials.includes(blushMat)) {
            cheekMaterials.push(blushMat);
          }
          blushMat.needsUpdate = true;
          return blushMat;
        }

        const toonMat = mat as THREE.MeshToonMaterial;

        // Ensure diffuse texture is rendered in sRGB color space with high-quality filtering
        if (toonMat.map) {
          toonMat.map.colorSpace = THREE.SRGBColorSpace;
          toonMat.map.generateMipmaps = true;
          toonMat.map.minFilter = THREE.LinearMipmapLinearFilter;
          toonMat.map.magFilter = THREE.LinearFilter;
          toonMat.map.needsUpdate = true;
        }

        // Preserve official HoYoverse sphere maps (matcaps for hair sheen & metallic highlights)
        const envMap = (toonMat as any).envMap;
        if (envMap) {
          envMap.colorSpace = THREE.SRGBColorSpace;
          envMap.generateMipmaps = true;
          envMap.minFilter = THREE.LinearMipmapLinearFilter;
          envMap.magFilter = THREE.LinearFilter;
          envMap.needsUpdate = true;
        }

        // Preserve authentic PMX toon ramp textures (toon3.png for face/skin, toon4.png for clothes/hair)
        if (toonMat.gradientMap) {
          toonMat.gradientMap.minFilter = THREE.NearestFilter;
          toonMat.gradientMap.magFilter = THREE.NearestFilter;
          toonMat.gradientMap.generateMipmaps = false;
          toonMat.gradientMap.needsUpdate = true;
        }

        // Eye Highlight Sparkles (Mat #9: 目光) -> Pure crystal white
        if (rawMatName.includes('目光') || rawMatName.includes('sparkle') || rawMatName.includes('highlight')) {
          const sparkleMat = new THREE.MeshBasicMaterial({
            map: toonMat.map,
            color: new THREE.Color(0xffffff),
            transparent: true,
            alphaTest: 0.05,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
          });
          sparkleMat.userData = { outlineParameters: { visible: false } };
          sparkleMat.needsUpdate = true;
          return sparkleMat;
        }

        // Eye Shadow Overlay (Mat #29: 目影) -> Soft Translucent Upper Eye Shadow
        if (rawMatName.includes('目影') || rawMatName.includes('eye_shadow')) {
          const shadowMat = new THREE.MeshBasicMaterial({
            map: toonMat.map,
            color: new THREE.Color(0xffffff),
            transparent: true,
            opacity: 0.30,
            depthWrite: false,
            depthTest: true,
          });
          shadowMat.userData = { outlineParameters: { visible: false } };
          shadowMat.needsUpdate = true;
          return shadowMat;
        }

        // Eyebrows and Lashes (Mat #3: 眉睫)
        if (rawMatName.includes('眉') || rawMatName.includes('睫') || matName.includes('eyebrow') || matName.includes('eyelash')) {
          const lashMat = new THREE.MeshBasicMaterial({
            map: toonMat.map,
            color: new THREE.Color(0xffffff),
            transparent: true,
            alphaTest: 0.05,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
          });
          lashMat.userData = { outlineParameters: { visible: false } };
          lashMat.needsUpdate = true;
          return lashMat;
        }

        // Mouth, Tongue, Teeth (口, 舌, 齒)
        if (
          rawMatName.includes('歯') || rawMatName.includes('齒') || rawMatName.includes('齿') ||
          rawMatName.includes('口') || matName.includes('mouth') ||
          matName.includes('teeth') || matName.includes('tooth') ||
          matName.includes('tongue') || rawMatName.includes('舌')
        ) {
          toonMat.color.set(0xffffff);
          toonMat.emissive.set(0x0e0e12);
          toonMat.depthWrite = true;
          toonMat.depthTest = true;
          toonMat.userData = { outlineParameters: { visible: false } };
          toonMat.needsUpdate = true;
          return toonMat;
        }

        // Eyes, Pupils, Iris (Mat #8: 目, Mat #7: 白目)
        if (matName.includes('eye') || rawMatName.includes('目') || matName.includes('hitomi') || matName.includes('pupil')) {
          toonMat.color.set(0xffffff);
          toonMat.emissive.set(0x101016);
          toonMat.depthWrite = true;
          toonMat.depthTest = true;
          toonMat.userData = { outlineParameters: { visible: false } };
          toonMat.needsUpdate = true;
          return toonMat;
        }

        // Face Skin & Body Skin (Mat #1: 顏 & Mat #11: 肌 & Mat #12: 肌2)
        if (
          rawMatName.includes('顏') || rawMatName.includes('顔') ||
          rawMatName.includes('肌') || matName.includes('face') ||
          matName.includes('skin') || matName.includes('head') ||
          mapUrl.includes('颜.png') || mapUrl.includes('face')
        ) {
          toonMat.color.set(0xffffff);
          toonMat.emissive.set(0x121014); // Soft warm porcelain glow
          toonMat.depthWrite = true;
          toonMat.depthTest = true;
          toonMat.transparent = false;
          // Soft warm reddish-brown anime lineart matching HoYoverse specs!
          toonMat.userData = { 
            outlineParameters: { 
              visible: true, 
              thickness: 0.0030, 
              color: [0.55, 0.28, 0.26], 
              alpha: 0.90 
            } 
          };
          toonMat.needsUpdate = true;
          return toonMat;
        }

        // Hair Materials (Mat #10: 髪, Mat #16: 後腦勺, Mat #27: 後腦勺+)
        if (rawMatName.includes('髪') || rawMatName.includes('頭') || rawMatName.includes('後腦勺') || matName.includes('hair')) {
          toonMat.color.set(0xffffff);
          toonMat.emissive.set(0x101018);
          toonMat.depthWrite = true;
          toonMat.depthTest = true;
          toonMat.userData = { 
            outlineParameters: { 
              visible: true, 
              thickness: 0.0034, 
              color: [0.28, 0.26, 0.33], 
              alpha: 0.90 
            } 
          };
          toonMat.needsUpdate = true;
          return toonMat;
        }

        // Ribbon, Gem, Butterfly & Metal Accessories (翼, 胸針, 飾, 金屬)
        if (
          rawMatName.includes('翼') || rawMatName.includes('胸針') || rawMatName.includes('飾') ||
          rawMatName.includes('金屬') || rawMatName.includes('金属') || matName.includes('gem') ||
          matName.includes('ribbon') || matName.includes('hair_acc') || matName.includes('crystal')
        ) {
          toonMat.color.set(0xffffff);
          toonMat.emissive.set(0x12141c);
          toonMat.depthWrite = true;
          toonMat.depthTest = true;
          toonMat.userData = { 
            outlineParameters: { 
              visible: true, 
              thickness: 0.0030, 
              color: [0.20, 0.16, 0.14], 
              alpha: 0.92 
            } 
          };
          toonMat.needsUpdate = true;
          return toonMat;
        }

        // Default Body, Clothes, Jacket, Skirt (衣, 裙, 内着, 襪, 鞋)
        toonMat.color.set(0xffffff);
        toonMat.emissive.set(0x0a0a10);
        toonMat.depthWrite = true;
        toonMat.depthTest = true;
        const isTransparent = toonMat.transparent || toonMat.opacity < 0.98;
        if (isTransparent) {
          toonMat.alphaTest = 0.02;
        }
        toonMat.userData = { 
          outlineParameters: { 
            visible: true, 
            thickness: 0.0036, 
            color: [0.15, 0.14, 0.18], 
            alpha: 0.98 
          } 
        };
        toonMat.needsUpdate = true;
        return toonMat;
      };

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => optimizeMaterial(m));
      } else if (mesh.material) {
        mesh.material = optimizeMaterial(mesh.material);
      }
    }
  });

  // Bind Blender Exported mat_forehead_shadow vertices to headBone in SkinnedMesh
  if (mmdMesh.skeleton && mmdMesh.skeleton.bones && Array.isArray(mmdMesh.material)) {
    let headBoneIdx = -1;
    mmdMesh.skeleton.bones.forEach((b, idx) => {
      if (b.name === '頭' || b.name === 'head') headBoneIdx = idx;
    });

    const foreheadMatIdx = mmdMesh.material.findIndex((m) =>
      (m.name || '').toLowerCase().includes('forehead')
    );

    if (foreheadMatIdx !== -1) {
      const mat = mmdMesh.material[foreheadMatIdx] as THREE.MeshBasicMaterial;
      if (mat) {
        mat.map = createAnimeForeheadShadowTexture();
        mat.transparent = true;
        mat.opacity = 0;
        foreheadMaterial = mat;
      }
    }

    if (foreheadMatIdx !== -1 && headBoneIdx !== -1 && mmdMesh.geometry.groups) {
      const group = mmdMesh.geometry.groups.find((g) => g.materialIndex === foreheadMatIdx);
      if (group) {
        const skinIndexAttr = mmdMesh.geometry.attributes.skinIndex;
        const skinWeightAttr = mmdMesh.geometry.attributes.skinWeight;
        if (skinIndexAttr && skinWeightAttr) {
          const start = group.start;
          const count = group.count;
          const indexAttr = mmdMesh.geometry.index;
          const vertexIndices = new Set<number>();
          if (indexAttr) {
            for (let i = start; i < start + count; i++) {
              vertexIndices.add(indexAttr.getX(i));
            }
          } else {
            for (let i = start; i < start + count; i++) {
              vertexIndices.add(i);
            }
          }

          vertexIndices.forEach((vIdx) => {
            skinIndexAttr.setXYZW(vIdx, headBoneIdx, 0, 0, 0);
            skinWeightAttr.setXYZW(vIdx, 1.0, 0, 0, 0);
          });

          skinIndexAttr.needsUpdate = true;
          skinWeightAttr.needsUpdate = true;
        }
      }
    }
  }

  return {
    cheekMaterials,
    foreheadMaterial
  };
}
